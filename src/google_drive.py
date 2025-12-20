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
# Changed to drive.file scope to enable both read and write operations
SCOPES = ['https://www.googleapis.com/auth/drive.file']

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
TOKEN_PATH = PROJECT_ROOT / 'token.pickle'
CREDENTIALS_PATH = PROJECT_ROOT / 'credentials.json'
CONFIG_PATH = PROJECT_ROOT / 'config.yaml'
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
        with open(TOKEN_PATH, 'wb') as token:
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
        
        # Determine MIME type based on remote file
        mime_type = remote_file.get('mimeType', 'text/plain')
        if 'document' in mime_type.lower():
            mime_type = 'text/plain'  # Google Docs export as text/plain
        
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
