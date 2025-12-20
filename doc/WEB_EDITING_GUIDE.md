# Web-Based Editing Guide

## Overview

Your hierarchical graph now supports full web-based editing through a FastAPI backend. You can modify items directly from the browser using a simple long-press interface.

## Features

### ✨ Core Features Implemented

1. **Long-Press Editing (800ms)**
   - Long-press any item in the graph for 0.8 seconds to open the edit modal
   - Works on both desktop (mouse) and mobile (touch) devices
   - Non-intrusive: doesn't interfere with normal clicking/scrolling

2. **REST API Backend**
   - 4 CRUD endpoints for item management
   - Pydantic validation for all inputs
   - Atomic file writes with automatic backups
   - Incremental HTML regeneration (only updates affected files)

3. **Google Drive Sync**
   - Download structure from Google Drive
   - Upload changes back to Google Drive
   - Last-write-wins conflict resolution

4. **Data Persistence**
   - Atomic writes prevent corruption on crashes
   - Automatic backups created before each save
   - Simple indentation-based format (structure.txt)

---

## Getting Started

### 1. Start the API Server

```bash
python -m uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload
```

The server will start at `http://localhost:8000`

### 2. Open the Web Interface

Open [html/data.html](html/data.html) in your browser. This is the main entry point for navigation.

### 3. Edit an Item

1. **Long-press** (hold for 0.8 seconds) any item in the graph
2. A **modal form** will appear with editable fields
3. Update any of these properties:
   - **Progress**: 0-100 (percentage)
   - **Context**: Any text description
   - **Due Date**: YYYY-MM-DD format
4. Click **Save** to apply changes
5. HTML regenerates automatically, changes are visible immediately

---

## API Reference

### Base URL
```
http://localhost:8000
```

### GET /api/items/{path}
Retrieve item data using dot notation (e.g., `level.work.go_melt`)

```bash
curl http://localhost:8000/api/items/level.work
```

Response:
```json
{
  "id": "level_work",
  "name": "work",
  "path": "level.work",
  "progress": 75,
  "context": "Current projects and ongoing work",
  "due": "2024-12-31",
  "children": [...]
}
```

### PUT /api/items/{path}
Update item properties

```bash
curl -X PUT http://localhost:8000/api/items/level.work \
  -H "Content-Type: application/json" \
  -d '{
    "progress": 85,
    "context": "Updated context",
    "due": "2025-01-15"
  }'
```

### POST /api/items/{parent_path}
Create a new item under a parent

```bash
curl -X POST http://localhost:8000/api/items/level \
  -H "Content-Type: application/json" \
  -d '{
    "name": "new_item",
    "progress": 0,
    "context": "New item description"
  }'
```

### DELETE /api/items/{path}
Delete an item

```bash
curl -X DELETE http://localhost:8000/api/items/level.work.some_item
```

### POST /api/sync/download
Download structure.txt from Google Drive

```bash
curl -X POST http://localhost:8000/api/sync/download
```

### POST /api/sync/upload
Upload structure.txt to Google Drive

```bash
curl -X POST http://localhost:8000/api/sync/upload
```

### POST /api/sync/both
Download then upload (download wins on conflicts)

```bash
curl -X POST http://localhost:8000/api/sync/both
```

---

## Data Format

The `structure.txt` file uses a simple indentation-based format:

```
metadata
  description: Your structure description
  version: 2.0
structure
  mindBody
    mood
      progress: 80
    train
      progress: 0
      cardio
      flexibility
```

### Editable Properties
- **progress**: Integer 0-100 (percentage)
- **context**: Any text string
- **due**: Date in YYYY-MM-DD format

### Auto-Generated Properties
- **id**: Generated from hierarchical path (e.g., `mindBody_mood`)
- **title**: Generated from key name (e.g., `mood` → "Mood")

---

## How It Works

### Architecture

```
Browser (html/data.html)
    ↓ [Long-press event]
    ↓
JavaScript Modal Form (saveEdit())
    ↓ [API call: PUT /api/items/{path}]
    ↓
FastAPI Backend (src/api.py)
    ↓
Pydantic Validation (progress 0-100, date format)
    ↓
File Utils (save_structure() with atomic writes)
    ↓
Backup Creation (backups/ folder, timestamp)
    ↓
HTML Regeneration (incremental, only affected files)
    ↓ [Browser auto-refresh or manual refresh]
    ↓
Updated Graph Display
```

### File Operations

1. **Validation**: Checks progress (0-100), date format (YYYY-MM-DD)
2. **Atomic Write**: Creates temp file, writes data, then renames
3. **Backup**: Saves old version to `backups/structure_backup_YYYYMMDD_HHMMSS.txt`
4. **Regeneration**: Updates only item + affected ancestors

### Incremental HTML Updates

The system tracks dependencies: each item depends on its ancestors (for breadcrumb updates). When you edit an item:
- Item's own HTML file is regenerated
- All ancestor HTML files are regenerated (breadcrumbs)
- Unrelated items are NOT regenerated (fast)

---

## Configuration

### Google Drive Setup

1. Set up OAuth credentials (see [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md))
2. Update `config.yaml` with your file ID:

```yaml
google_drive:
  file_id: YOUR_GOOGLE_DRIVE_FILE_ID
```

3. First run will prompt for authentication
4. Token is saved to `token.pickle` (never commit to git)

### Scope Changes

The OAuth scope was changed from `drive.readonly` to `drive.file`:
- If you have an old token, delete `token.pickle` to re-authenticate
- New scope allows both read and write operations
- Still limited to files you explicitly shared with the app

---

## Safety Features

### Atomic Writes
- No partial writes even if server crashes mid-save
- Uses temp file + rename pattern

### Automatic Backups
- Created before each save
- Located in `backups/` folder
- Named with timestamp: `structure_backup_20240115_143025.txt`
- Never deleted automatically

### Validation
- Progress must be 0-100
- Dates must be YYYY-MM-DD
- Invalid inputs rejected before writing

### Conflict Resolution
- Google Drive sync uses last-write-wins
- Compares modification times
- Warns before overwriting newer data

---

## Troubleshooting

### Server Won't Start

```bash
# Check if port 8000 is in use
netstat -ano | findstr :8000

# Kill process if needed
taskkill /PID <process_id> /F

# Restart server
python -m uvicorn src.api:app --host 0.0.0.0 --port 8000
```

### Modal Won't Open

- Check browser console (F12) for JavaScript errors
- Ensure server is running at http://localhost:8000
- Try a longer press (some devices may need 1+ second)

### Changes Not Saving

- Check browser console for API errors
- Verify `structure.txt` has write permissions
- Check `backups/` folder to see if backup was created

### Google Drive Sync Issues

- Delete `token.pickle` and re-authenticate
- Verify `credentials.json` exists and is valid
- Check that file ID in `config.yaml` is correct
- Ensure file is shared with the app

---

## Development Tips

### Disable Auto-Reload
If you're running the server with `--reload`, changes to Python files will restart the server. To avoid this during testing:

```bash
python -m uvicorn src.api:app --host 0.0.0.0 --port 8000
```

### Manual HTML Regeneration
To regenerate all HTML files:

```bash
python run.py
```

### View API Documentation
FastAPI includes interactive docs:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Test API Endpoints
Use curl or Postman:

```bash
# Get item
curl http://localhost:8000/api/items/level

# Update item
curl -X PUT http://localhost:8000/api/items/level \
  -H "Content-Type: application/json" \
  -d '{"progress": 90}'

# View all endpoints
curl http://localhost:8000/
```

---

## Next Steps

### Potential Enhancements

1. **Web UI for Creating Items**
   - Add "+" button to modal for creating sub-items
   - Integrate create form with modal

2. **Real-Time Collaboration**
   - WebSocket support for live updates
   - Conflict resolution for simultaneous edits

3. **Search & Filter**
   - Add search box to find items
   - Filter by progress, due date, etc.

4. **Dark Mode**
   - Add theme toggle
   - Save preference in localStorage

5. **CSV Export**
   - Export structure as CSV for spreadsheet tools
   - Import CSV to update structure

---

## Need Help?

Check these files for more information:
- [README.md](README.md) - Project overview
- [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md) - Drive setup instructions
- [src/api.py](src/api.py) - API implementation details
- [src/file_utils.py](src/file_utils.py) - File I/O details
- [src/html_generator.py](src/html_generator.py) - HTML/JS implementation

