# Google Drive Integration Setup Guide

This guide will walk you through setting up Google Drive integration so your application can automatically fetch `structure.yaml` from your Google Drive account.

## Overview

The integration allows you to:
- Edit `structure.yaml` in Google Drive (or Google Docs)
- Automatically download the latest version when you run the application
- Fall back to the local `structure.yaml` if the download fails

---

## Step 1: Set Up Google Cloud Project

### 1.1 Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top (next to "Google Cloud")
3. Click **"New Project"** in the dialog that appears
4. Enter a project name (e.g., "Graph Visualization App")
5. Click **"Create"**
6. Wait for the project to be created (you'll see a notification)
7. Make sure your new project is selected in the project dropdown

### 1.2 Enable the Google Drive API

1. In the Google Cloud Console, ensure your project is selected
2. Go to **"APIs & Services"** > **"Library"** (use the left sidebar menu)
3. In the search bar, type **"Google Drive API"**
4. Click on **"Google Drive API"** in the results
5. Click the blue **"Enable"** button
6. Wait for the API to be enabled (a few seconds)

---

## Step 2: Create OAuth 2.0 Credentials

### 2.1 Configure OAuth Consent Screen

1. Go to **"APIs & Services"** > **"OAuth consent screen"** (left sidebar)
2. Choose **"External"** user type (unless you have a Google Workspace account)
3. Click **"Create"**

4. **Fill in the App Information:**
   - **App name:** Graph Visualization App (or any name you prefer)
   - **User support email:** Select your email from the dropdown
   - **App logo:** (optional, you can skip this)
   - **Application home page:** (optional, you can leave blank)
   - **Authorized domains:** (leave blank for personal use)
   - **Developer contact information:** Enter your email address

5. Click **"Save and Continue"**

6. **Scopes screen:**
   - Click **"Add or Remove Scopes"**
   - In the filter box, search for **"drive.readonly"**
   - Check the box for **".../auth/drive.readonly"** scope
   - Click **"Update"** at the bottom
   - Click **"Save and Continue"**

7. **Test users screen:**
   - Click **"+ Add Users"**
   - Enter your Google email address (the one you'll use to access Drive)
   - Click **"Add"**
   - Click **"Save and Continue"**

8. **Summary screen:**
   - Review the information
   - Click **"Back to Dashboard"**

### 2.2 Create OAuth Client ID

1. Go to **"APIs & Services"** > **"Credentials"** (left sidebar)
2. Click **"+ Create Credentials"** at the top
3. Select **"OAuth client ID"**

4. **Configure the OAuth client:**
   - **Application type:** Select **"Desktop app"**
   - **Name:** Graph App Desktop Client (or any name you prefer)
   - Click **"Create"**

5. **Download the credentials:**
   - A dialog will appear showing your client ID and secret
   - Click **"Download JSON"** button
   - Save the file as **`credentials.json`**
   - **Move this file to your project root directory** (same folder as `run.py`)

---

## Step 3: Upload structure.yaml to Google Drive

### 3.1 Upload the File

1. Go to [Google Drive](https://drive.google.com/)
2. Upload your `structure.yaml` file:
   - Click **"+ New"** > **"File upload"**
   - Select `structure.yaml` from your project folder
   - Wait for the upload to complete

### 3.2 Get the File ID

1. In Google Drive, **right-click** on the uploaded `structure.yaml` file
2. Select **"Get link"** or **"Share"**
3. Click **"Copy link"**
4. The link will look like this:
   ```
   https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7/view?usp=sharing
   ```
5. **Copy the FILE_ID part** (the long string between `/d/` and `/view`)
   - In the example above, the File ID is: `1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7`

### 3.3 Configure config.yaml

1. Open `config.yaml` in your project root folder
2. Replace `YOUR_FILE_ID_HERE` with your actual File ID:
   ```yaml
   google_drive:
     file_id: 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7
   ```
3. Save the file

---

## Step 4: Install Dependencies

Open PowerShell in your project directory and run:

```powershell
pip install -r requirements.txt
```

This will install all required Google API libraries.

---

## Step 5: Authenticate with Google

### 5.1 Run the Authentication Command

In PowerShell, run:

```powershell
python run.py auth
```

### 5.2 Complete the OAuth Flow

1. A browser window will open automatically
2. **Sign in** with your Google account (the one you added as a test user)
3. You may see a warning: **"Google hasn't verified this app"**
   - Click **"Advanced"**
   - Click **"Go to Graph Visualization App (unsafe)"** (this is your own app, so it's safe)
4. Review the permissions (read-only access to Drive)
5. Click **"Allow"**
6. You should see a success message: **"The authentication flow has completed."**
7. Close the browser tab
8. Return to PowerShell - you should see: **"✅ Authentication successful!"**

### 5.3 Verify Token Creation

Check that `token.pickle` was created in your project root folder. This file stores your authentication token for future runs.

---

## Step 6: Test the Integration

### 6.1 Run the Application

```powershell
python run.py
```

### 6.2 Expected Output

You should see:
```
📥 Fetching structure.yaml from Google Drive...
✓ Found file: structure.yaml
  Last modified: 2025-12-13T...
  Download progress: 100%
✅ Successfully downloaded structure.yaml to c:\Users\...\structure.yaml
Generating visualization from YAML structure...
Visualization generated successfully!
Server running at http://localhost:8080/level.html
```

---

## Usage

### Normal Operation

Every time you run the application, it will:
1. Fetch the latest `structure.yaml` from Google Drive
2. Generate HTML visualizations
3. Start the web server

```powershell
python run.py          # Fetch, generate, and serve
python run.py generate # Fetch and generate only
```

### Edit Workflow

1. Edit `structure.yaml` in Google Drive
2. Save your changes in Drive
3. Run `python run.py` - it will download the latest version
4. View your updated visualization

### Fallback Behavior

If Google Drive sync fails (no internet, authentication expired, file not found):
- The application will print a warning
- It will use the local `structure.yaml` file
- The application will continue to work normally

---

## Troubleshooting

### "credentials.json not found"

**Solution:** Make sure you downloaded `credentials.json` from Google Cloud Console and placed it in your project root directory (same folder as `run.py`).

---

### "Google Drive file_id not found in config.yaml"

**Solution:** 
1. Open `config.yaml`
2. Make sure you replaced `YOUR_FILE_ID_HERE` with your actual Google Drive File ID
3. Check that the indentation is correct (use spaces, not tabs)

---

### "Failed to refresh credentials"

**Solution:** Your authentication token has expired. Re-authenticate:
```powershell
python run.py auth
```

---

### "Google hasn't verified this app" warning

This is normal for personal projects. Your app is in "Testing" mode and limited to test users you specified. You can safely click "Advanced" → "Go to App (unsafe)" since it's your own application.

---

### File not found in Google Drive

**Solution:**
1. Make sure the file is uploaded to Google Drive
2. Verify the File ID in `config.yaml` is correct
3. Make sure the file ID matches the actual file (copy the link again from Drive)

---

### Multiple files named "structure.yaml"

This won't be an issue since we use **File ID** (not file name) to identify the specific file. The File ID is unique and permanent.

---

## Security Notes

### Files to Keep Private

These files contain sensitive information and are automatically excluded from Git:

- **`credentials.json`** - Your OAuth client credentials
- **`token.pickle`** - Your authentication token
- **`config.yaml`** - Your Google Drive File ID

**Never commit these files to version control!** They are already listed in `.gitignore`.

### Sharing Your Project

If you share your project repository:
1. Others will need to create their own Google Cloud project
2. Download their own `credentials.json`
3. Run `python run.py auth` to authenticate
4. Configure their own `config.yaml` with their File ID

---

## Optional: Convert to Google Docs Format

If you prefer editing in Google Docs format instead of plain text:

1. In Google Drive, right-click your `structure.yaml` file
2. Select **"Open with"** > **"Google Docs"**
3. Edit in the Google Docs interface
4. The File ID remains the same, so no configuration changes needed!

The application will download the content regardless of whether it's stored as a native file or Google Docs format.

---

## Summary

✅ Created Google Cloud project and enabled Drive API  
✅ Created OAuth credentials and downloaded `credentials.json`  
✅ Uploaded `structure.yaml` to Google Drive  
✅ Configured File ID in `config.yaml`  
✅ Installed dependencies  
✅ Authenticated with `python run.py auth`  
✅ Tested with `python run.py`  

Your application now syncs `structure.yaml` from Google Drive automatically! 🎉
