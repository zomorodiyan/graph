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
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
TOKEN_PATH = PROJECT_ROOT / 'token.pickle'
CREDENTIALS_PATH = PROJECT_ROOT / 'credentials.json'
CONFIG_PATH = PROJECT_ROOT / 'config.yaml'
STRUCTURE_PATH = PROJECT_ROOT / 'structure.yaml'


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
        print("⚠️  Using local structure.yaml")
        return False
    
    # Get credentials
    creds = get_credentials()
    if not creds:
        print("⚠️  Authentication failed, using local structure.yaml")
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
        print(f"  Last modified: {file_metadata['modifiedTime']}")
        
        # Download the file
        request = service.files().get_media(fileId=file_id)
        file_handle = io.BytesIO()
        downloader = MediaIoBaseDownload(file_handle, request)
        
        done = False
        while not done:
            status, done = downloader.next_chunk()
            if status:
                progress = int(status.progress() * 100)
                print(f"  Download progress: {progress}%", end='\r')
        
        print()  # New line after progress
        
        # Write to structure.yaml
        with open(STRUCTURE_PATH, 'wb') as f:
            f.write(file_handle.getvalue())
        
        print(f"✅ Successfully downloaded structure.yaml to {STRUCTURE_PATH}")
        return True
    
    except Exception as e:
        print(f"⚠️  Failed to download from Google Drive: {e}")
        if STRUCTURE_PATH.exists():
            print(f"⚠️  Using local structure.yaml")
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
