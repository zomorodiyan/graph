"""
Google Drive integration for fetching structure.yaml from Google Drive.
"""

import os
import pickle
from pathlib import Path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io

# If modifying these scopes, delete the file token.pickle
# Use full Drive scope to allow updating any file by ID
SCOPES = ['https://www.googleapis.com/auth/drive']

# Paths - support both local development and Cloud Run deployment
PROJECT_ROOT = Path(__file__).parent.parent

# Cloud Run mounts secrets to /secrets by default, local dev uses project root
def _get_path(filename: str) -> Path:
    """Get path for a file, checking Cloud Run secrets mount first."""
    # Cloud Run: secrets mounted in separate subdirectories
    if filename == 'token.pickle':
        cloud_run_path = Path('/secrets/token/token.pickle')
        if cloud_run_path.exists():
            return cloud_run_path
    elif filename == 'config.yaml':
        cloud_run_path = Path('/secrets/config/config.yaml')
        if cloud_run_path.exists():
            return cloud_run_path
    # Also check /app for compatibility
    app_path = Path('/app') / filename
    if app_path.exists():
        return app_path
    return PROJECT_ROOT / filename

def _get_writable_path(filename: str) -> Path:
    """Get writable path for a file. Cloud Run /secrets is read-only, so use /tmp."""
    # On Cloud Run, secrets are mounted read-only, so tokens need to be saved to /tmp
    if Path('/secrets').exists():
        return Path('/tmp') / filename
    return PROJECT_ROOT / filename

TOKEN_PATH = _get_path('token.pickle')
TOKEN_WRITE_PATH = _get_writable_path('token.pickle')
CREDENTIALS_PATH = _get_path('credentials.json')
CONFIG_PATH = _get_path('config.yaml')
STRUCTURE_PATH = PROJECT_ROOT / 'structure.txt'


def get_credentials():
    """
    Gets valid user credentials from storage or initiates OAuth flow.
    
    Returns:
        Credentials object or None if credentials cannot be obtained
    """
    creds = None
    
    # The file token.pickle stores the user's access and refresh tokens
    if TOKEN_PATH.exists():
        with open(TOKEN_PATH, 'rb') as token:
            creds = pickle.load(token)
    
    # If there are no (valid) credentials available, let the user log in
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"⚠️  Failed to refresh credentials: {e}")
                return None
        else:
            if not CREDENTIALS_PATH.exists():
                print(f"❌ Error: credentials.json not found at {CREDENTIALS_PATH}")
                print("Please follow the setup instructions in GOOGLE_DRIVE_SETUP.md")
                return None
            
            try:
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(CREDENTIALS_PATH), SCOPES)
                creds = flow.run_local_server(port=0)
            except Exception as e:
                print(f"❌ Authentication failed: {e}")
                return None
        
        # Save the credentials for the next run
        with open(TOKEN_WRITE_PATH, 'wb') as token:
            pickle.dump(creds, token)
    
    return creds


def get_file_id_from_config():
    """
    Reads the Google Drive file ID from config.yaml.
    
    Returns:
        File ID string or None if not found
    """
    import yaml
    
    if not CONFIG_PATH.exists():
        print(f"⚠️  Config file not found at {CONFIG_PATH}")
        print("Please create config.yaml with your Google Drive file ID:")
        print("\ngoogle_drive:")
        print("  file_id: YOUR_FILE_ID_HERE")
        return None
    
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        
        file_id = config.get('google_drive', {}).get('file_id')
        if not file_id:
            print("⚠️  Google Drive file_id not found in config.yaml")
            print("Please add the following to config.yaml:")
            print("\ngoogle_drive:")
            print("  file_id: YOUR_FILE_ID_HERE")
            return None
        
        return file_id
    
    except Exception as e:
        print(f"⚠️  Error reading config.yaml: {e}")
        return None


def update_config_file_id(new_file_id: str) -> bool:
    """Update config.yaml with a new Google Drive file_id."""
    import yaml
    try:
        config = {}
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f) or {}
        config.setdefault('google_drive', {})
        config['google_drive']['file_id'] = new_file_id
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            yaml.safe_dump(config, f, sort_keys=False)
        print(f"🔁 Updated config.yaml with new file_id: {new_file_id}")
        return True
    except Exception as e:
        print(f"⚠️  Failed to update config.yaml: {e}")
        return False


def ensure_remote_text_file(service, file_id: str) -> str:
    """
    Ensure the remote structure file is a regular text file.
    If current file is a Google Doc, create a new text/plain file and return its ID.
    """
    try:
        meta = service.files().get(fileId=file_id, fields='name, mimeType, parents').execute()
        mime = meta.get('mimeType', '')
        if mime == 'application/vnd.google-apps.document':
            print("⚠️  Remote file is a Google Doc. Creating a plain text file for writes...")
            from googleapiclient.http import MediaFileUpload
            body = {'name': meta.get('name', 'structure.txt')}
            # Preserve parent folder if available
            parents = meta.get('parents')
            if parents:
                body['parents'] = parents
            # Use local structure.txt if present, else create empty file
            if STRUCTURE_PATH.exists():
                media = MediaFileUpload(STRUCTURE_PATH, mimetype='text/plain', resumable=True)
            else:
                import io
                from googleapiclient.http import MediaIoBaseUpload
                media = MediaIoBaseUpload(io.BytesIO(b''), mimetype='text/plain', resumable=True)
            new_file = service.files().create(body=body, media_body=media, fields='id').execute()
            new_id = new_file.get('id')
            print(f"✅ Created new text file. ID: {new_id}")
            update_config_file_id(new_id)
            return new_id
        return file_id
    except Exception as e:
        print(f"⚠️  Could not verify remote file type: {e}")
        return file_id


def parse_drive_file_id(url_or_id: str) -> str:
    """Extract a Google Drive file ID from common URL formats or return the input if it's already an ID."""
    if not url_or_id:
        return ""
    s = url_or_id.strip()
    # If it looks like a bare ID (letters/numbers, length ~ 25-60), accept it
    import re
    if re.fullmatch(r"[A-Za-z0-9_-]{10,100}", s) and "http" not in s:
        return s
    # Common URL patterns
    # https://drive.google.com/file/d/<ID>/view?...
    m = re.search(r"/d/([A-Za-z0-9_-]{10,100})", s)
    if m:
        return m.group(1)
    # https://docs.google.com/document/d/<ID>/...
    m = re.search(r"document/d/([A-Za-z0-9_-]{10,100})", s)
    if m:
        return m.group(1)
    # https://drive.google.com/open?id=<ID>
    m = re.search(r"[?&]id=([A-Za-z0-9_-]{10,100})", s)
    if m:
        return m.group(1)
    # Fallback: return original string
    return s


def set_drive_file_id(url_or_id: str) -> bool:
    """Set the Drive file_id in config.yaml from a URL or ID. Verifies access with Drive API if possible."""
    fid = parse_drive_file_id(url_or_id)
    if not fid:
        print("❌ Could not parse file ID from input")
        return False
    # Try to verify the file exists with current credentials
    creds = get_credentials()
    if not creds:
        print("⚠️  Could not verify file without credentials; saving ID anyway.")
        return update_config_file_id(fid)
    try:
        service = build('drive', 'v3', credentials=creds)
        meta = service.files().get(fileId=fid, fields='name, mimeType').execute()
        print(f"✅ Found file: {meta.get('name')} ({meta.get('mimeType')})")
        return update_config_file_id(fid)
    except Exception as e:
        print(f"⚠️  Could not verify file ID: {e}")
        print("Saving ID to config.yaml; you may need to re-auth or check permissions.")
        return update_config_file_id(fid)


def download_structure_yaml():
    """
    Downloads structure.yaml from Google Drive using the file ID specified in config.yaml.
    Falls back to local structure.yaml if download fails.
    
    Returns:
        bool: True if download succeeded, False if using fallback
    """
    print("📥 Fetching structure.yaml from Google Drive...")
    
    # Get file ID from config
    file_id = get_file_id_from_config()
    if not file_id:
        print("⚠️  Using local structure.txt")
        return False
    
    # Get credentials
    creds = get_credentials()
    if not creds:
        print("⚠️  Authentication failed, using local structure.txt")
        return False
    
    try:
        # Build the Drive API service
        service = build('drive', 'v3', credentials=creds)
        
        # Get file metadata to verify it exists
        file_metadata = service.files().get(
            fileId=file_id,
            fields='name, mimeType, modifiedTime'
        ).execute()
        
        print(f"✓ Found file: {file_metadata['name']}")
        print(f"  MIME type: {file_metadata['mimeType']}")
        print(f"  Last modified: {file_metadata['modifiedTime']}")
        
        # Google Docs need export; regular files can be downloaded directly
        mime_type = file_metadata.get('mimeType')
        if mime_type == 'application/vnd.google-apps.document':
            request = service.files().export_media(
                fileId=file_id,
                mimeType='text/plain'
            )
            print("  Exporting Google Doc as text/plain for YAML content")
        else:
            request = service.files().get_media(fileId=file_id)
            print("  Downloading file content")
        
        file_handle = io.BytesIO()
        downloader = MediaIoBaseDownload(file_handle, request)
        
        done = False
        while not done:
            status, done = downloader.next_chunk()
            if status:
                progress = int(status.progress() * 100)
                print(f"  Download progress: {progress}%", end='\r')
        
        print()  # New line after progress
        
        # Write to structure.txt
        with open(STRUCTURE_PATH, 'wb') as f:
            f.write(file_handle.getvalue())
        
        print(f"✅ Successfully downloaded structure.txt to {STRUCTURE_PATH}")
        return True
    
    except Exception as e:
        print(f"⚠️  Failed to download from Google Drive: {e}")
        if STRUCTURE_PATH.exists():
            print(f"⚠️  Using local structure.txt")
        else:
            print(f"❌ No local structure.yaml found either!")
        return False


def authenticate():
    """
    Runs the authentication flow to generate credentials.
    Used for the 'auth' command.
    
    Returns:
        bool: True if authentication succeeded
    """
    print("🔐 Starting Google Drive authentication...")
    print()
    print("This will open a browser window for you to authorize access.")
    print("Please sign in with your Google account and grant permissions.")
    print()
    
    # Remove existing token to force re-authentication
    if TOKEN_PATH.exists():
        TOKEN_PATH.unlink()
        print("Removed existing authentication token")
    
    creds = get_credentials()
    
    if creds:
        print()
        print("✅ Authentication successful!")
        print(f"   Token saved to: {TOKEN_PATH}")
        print()
        print("You can now run: python run.py")
        return True
    else:
        print()
        print("❌ Authentication failed")
        print("   Please check that credentials.json exists and is valid")
        return False


def upload_structure_yaml():
    """
    Uploads local structure.txt to Google Drive, overwriting the existing file.
    Uses last-write-wins conflict resolution: compares modification times and keeps
    the most recently modified version.
    
    Returns:
        bool: True if upload succeeded, False otherwise
    """
    import os
    from datetime import datetime
    from googleapiclient.http import MediaFileUpload
    
    print("📤 Uploading structure.txt to Google Drive...")
    
    # Check local file exists
    if not STRUCTURE_PATH.exists():
        print(f"❌ Error: structure.txt not found at {STRUCTURE_PATH}")
        return False
    
    # Get file ID from config
    file_id = get_file_id_from_config()
    if not file_id:
        print("⚠️  Cannot upload: file_id not configured")
        return False
    
    # Get credentials
    creds = get_credentials()
    if not creds:
        print("⚠️  Authentication failed, cannot upload")
        return False
    
    try:
        service = build('drive', 'v3', credentials=creds)
        
        # Ensure remote file is writable text; if Google Doc, create a text file
        file_id = ensure_remote_text_file(service, file_id)
        # Get remote file metadata
        remote_file = service.files().get(
            fileId=file_id,
            fields='name, mimeType, modifiedTime'
        ).execute()
        
        print(f"✓ Found remote file: {remote_file['name']}")
        
        # Compare modification times (last-write-wins)
        local_mtime = os.path.getmtime(STRUCTURE_PATH)
        local_datetime = datetime.utcfromtimestamp(local_mtime).isoformat() + 'Z'
        remote_mtime_str = remote_file.get('modifiedTime', '')
        
        print(f"  Local modified:  {local_datetime}")
        print(f"  Remote modified: {remote_mtime_str}")
        
        # Parse ISO format dates for comparison
        from datetime import datetime
        try:
            local_dt = datetime.fromisoformat(local_datetime.replace('Z', '+00:00'))
            remote_dt = datetime.fromisoformat(remote_mtime_str.replace('Z', '+00:00'))
            
            if remote_dt > local_dt:
                print("⚠️  Remote file is newer - skipping upload to avoid data loss")
                print("    Consider downloading first with: python run.py download")
                return False
        except:
            pass  # If date parsing fails, proceed with upload
        
        # Determine MIME type for upload (use text/plain)
        mime_type = 'text/plain'
        
        # Upload file
        media = MediaFileUpload(
            STRUCTURE_PATH,
            mimetype=mime_type,
            resumable=True
        )
        
        file_metadata = {'name': remote_file['name']}
        
        request = service.files().update(
            fileId=file_id,
            body=file_metadata,
            media_body=media,
            fields='id, modifiedTime'
        )
        
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                progress = int(status.progress() * 100)
                print(f"  Upload progress: {progress}%", end='\r')
        
        print()  # New line after progress
        print(f"✅ Successfully uploaded structure.txt")
        print(f"   File ID: {response['id']}")
        print(f"   Modified: {response['modifiedTime']}")
        return True
    
    except Exception as e:
        print(f"❌ Upload failed: {e}")
        return False


# ============================================================================
# MULTI-GRAPH FOLDER SYNC FUNCTIONS
# ============================================================================

STRUCTURES_DIR = PROJECT_ROOT / 'structures'


def get_folder_id_from_config():
    """
    Reads the Google Drive folder ID for graphs from config.yaml.
    
    Returns:
        Folder ID string or None if not found
    """
    import yaml
    
    if not CONFIG_PATH.exists():
        return None
    
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        
        return config.get('google_drive', {}).get('graphs_folder_id')
    except Exception:
        return None


def update_config_folder_id(folder_id: str) -> bool:
    """Update config.yaml with a new graphs_folder_id."""
    import yaml
    try:
        config = {}
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f) or {}
        config.setdefault('google_drive', {})
        config['google_drive']['graphs_folder_id'] = folder_id
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            yaml.safe_dump(config, f, sort_keys=False)
        print(f"🔁 Updated config.yaml with graphs_folder_id: {folder_id}")
        return True
    except Exception as e:
        print(f"⚠️  Failed to update config.yaml: {e}")
        return False


def ensure_graphs_folder(service) -> str:
    """
    Ensure a 'graph-structures' folder exists in Drive.
    Creates one if it doesn't exist, or uses the configured folder_id.
    
    Returns:
        Folder ID string or None on failure
    """
    folder_id = get_folder_id_from_config()
    
    if folder_id:
        # Verify folder exists
        try:
            meta = service.files().get(fileId=folder_id, fields='id, name, mimeType').execute()
            if meta.get('mimeType') == 'application/vnd.google-apps.folder':
                print(f"✓ Using existing graphs folder: {meta.get('name')}")
                return folder_id
        except Exception as e:
            print(f"⚠️  Configured folder not accessible: {e}")
    
    # Create a new folder
    try:
        folder_metadata = {
            'name': 'graph-structures',
            'mimeType': 'application/vnd.google-apps.folder'
        }
        folder = service.files().create(body=folder_metadata, fields='id').execute()
        new_folder_id = folder.get('id')
        print(f"✅ Created new graphs folder with ID: {new_folder_id}")
        update_config_folder_id(new_folder_id)
        return new_folder_id
    except Exception as e:
        print(f"❌ Failed to create graphs folder: {e}")
        return None


def download_all_graphs():
    """
    Downloads all .txt graph files from the Google Drive graphs folder.
    
    Returns:
        bool: True if download succeeded, False otherwise
    """
    print("📥 Downloading all graphs from Google Drive...")
    
    creds = get_credentials()
    if not creds:
        print("⚠️  Authentication failed, cannot download graphs")
        return False
    
    try:
        service = build('drive', 'v3', credentials=creds)
        
        folder_id = get_folder_id_from_config()
        if not folder_id:
            print("⚠️  No graphs folder configured, skipping graph download")
            return False
        
        # Ensure structures directory exists
        STRUCTURES_DIR.mkdir(parents=True, exist_ok=True)
        
        # List all .txt files in the folder
        query = f"'{folder_id}' in parents and mimeType='text/plain' and trashed=false"
        results = service.files().list(
            q=query,
            fields="files(id, name, modifiedTime)",
            pageSize=100
        ).execute()
        
        files = results.get('files', [])
        print(f"  Found {len(files)} graph file(s) in Drive")
        
        for file_info in files:
            file_id = file_info['id']
            file_name = file_info['name']
            
            # Ensure .txt extension
            if not file_name.endswith('.txt'):
                file_name += '.txt'
            
            local_path = STRUCTURES_DIR / file_name
            
            # Download file content
            request = service.files().get_media(fileId=file_id)
            file_handle = io.BytesIO()
            downloader = MediaIoBaseDownload(file_handle, request)
            
            done = False
            while not done:
                status, done = downloader.next_chunk()
            
            # Write to local file
            with open(local_path, 'wb') as f:
                f.write(file_handle.getvalue())
            
            print(f"  ✓ Downloaded: {file_name}")
        
        print(f"✅ Downloaded {len(files)} graph(s) to {STRUCTURES_DIR}")
        return True
    
    except Exception as e:
        print(f"❌ Failed to download graphs: {e}")
        import traceback
        traceback.print_exc()
        return False


def upload_graph(graph_name: str) -> bool:
    """
    Uploads a specific graph file to the Google Drive graphs folder.
    Creates new file or updates existing one.
    
    Args:
        graph_name: Name of the graph (without .txt extension)
    
    Returns:
        bool: True if upload succeeded, False otherwise
    """
    from googleapiclient.http import MediaFileUpload
    
    local_path = STRUCTURES_DIR / f"{graph_name}.txt"
    
    if not local_path.exists():
        print(f"❌ Graph file not found: {local_path}")
        return False
    
    creds = get_credentials()
    if not creds:
        print(f"⚠️  Authentication failed, cannot upload graph {graph_name}")
        return False
    
    try:
        service = build('drive', 'v3', credentials=creds)
        
        folder_id = ensure_graphs_folder(service)
        if not folder_id:
            print(f"⚠️  Cannot upload graph: no folder available")
            return False
        
        # Check if file already exists in folder
        query = f"'{folder_id}' in parents and name='{graph_name}.txt' and trashed=false"
        results = service.files().list(q=query, fields="files(id)").execute()
        existing_files = results.get('files', [])
        
        media = MediaFileUpload(local_path, mimetype='text/plain', resumable=True)
        
        if existing_files:
            # Update existing file
            file_id = existing_files[0]['id']
            request = service.files().update(
                fileId=file_id,
                media_body=media
            )
        else:
            # Create new file
            file_metadata = {
                'name': f"{graph_name}.txt",
                'parents': [folder_id]
            }
            request = service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id'
            )
        
        response = None
        while response is None:
            status, response = request.next_chunk()
        
        print(f"  ✓ Synced graph to Drive: {graph_name}")
        return True
    
    except Exception as e:
        print(f"❌ Failed to upload graph {graph_name}: {e}")
        return False


def delete_graph_from_drive(graph_name: str) -> bool:
    """
    Deletes a graph file from Google Drive.
    
    Args:
        graph_name: Name of the graph (without .txt extension)
    
    Returns:
        bool: True if deletion succeeded, False otherwise
    """
    creds = get_credentials()
    if not creds:
        return False
    
    try:
        service = build('drive', 'v3', credentials=creds)
        
        folder_id = get_folder_id_from_config()
        if not folder_id:
            return False
        
        # Find the file
        query = f"'{folder_id}' in parents and name='{graph_name}.txt' and trashed=false"
        results = service.files().list(q=query, fields="files(id)").execute()
        files = results.get('files', [])
        
        for file_info in files:
            service.files().delete(fileId=file_info['id']).execute()
            print(f"  ✓ Deleted from Drive: {graph_name}")
        
        return True
    
    except Exception as e:
        print(f"⚠️  Failed to delete graph from Drive: {e}")
        return False
