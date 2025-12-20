# Quick Start Guide

Get up and running with the web-based hierarchical graph editor in 3 steps.

## Prerequisites

- **Python 3.8+** (check with `python --version` or `python3 --version`)
- Virtual environment set up (`.venv` folder)

## 1️⃣ Initial Setup (First Time Only)

### Windows & Linux (Same Command)

```bash
python run.py auth
```

This will:
- Open your browser to authenticate with Google Drive (optional)
- Download your structure.txt from Google Drive (or use local)
- Set up your project for editing

> **Note**: You can skip Google Drive authentication if you only want to work locally. Press Ctrl+C if you don't want to authenticate.

---

## 2️⃣ Start the Server

Choose ONE of these options:

### Option A: API-Only Mode (Recommended for Development)

**Windows & Linux:**
```bash
python run.py api
```

Then open [html/data.html](html/data.html) manually in your browser:
- Copy this path and open in browser: `file:///path/to/graph/html/data.html`
- Or drag the file into your browser

**Advantages:**
- Lightweight, fast startup
- No extra port conflicts
- Good for local development

---

### Option B: All-in-One Mode (Recommended for First Time)

**Windows & Linux:**
```bash
python run.py serve
```

This will:
- Start the API server (port 8000)
- Start an HTML server (port 8080)
- Automatically open your browser

**Advantages:**
- Automatic browser launch
- Everything in one command
- Better for sharing (uses HTTP instead of file://)

---

### Option C: Generate Only (No Server)

**Windows & Linux:**
```bash
python run.py generate
```

Just generates HTML files without starting any servers. Useful for CI/CD.

---

## 3️⃣ Editing Items

Once the server is running and you have the interface open:

1. **Find an item** in the graph (e.g., "level" → "work")
2. **Long-press** (hold for 0.8 seconds) any item
3. **Edit form appears** with fields for:
   - Progress (0-100%)
   - Context (text description)
   - Due Date (YYYY-MM-DD)
4. **Click Save** to apply changes
5. **Changes save instantly** via API to `structure.txt`

---

## Platform-Specific Notes

### Windows

All commands work the same with `python`:

```bash
python run.py api
```

### Linux / macOS

You may need to use `python3` if `python` points to Python 2:

```bash
python3 run.py api
```

Or set an alias:
```bash
alias python=python3
```

---

## Common Commands Reference

| Command | Description | When to Use |
|---------|-------------|------------|
| `python run.py` | Default (API only) | Development mode |
| `python run.py api` | Start API backend only | Manual browser opening |
| `python run.py serve` | API + HTML servers | First time / testing |
| `python run.py generate` | Generate HTML only | No servers needed |
| `python run.py auth` | Setup Google Drive | First time setup |
| `python run.py help` | Show all commands | Need reference |

---

## Troubleshooting

### Server Won't Start

**"Address already in use"**
```bash
# Find what's using port 8000 (or 8080)
# Windows:
netstat -ano | findstr :8000

# Linux/macOS:
lsof -i :8000

# Kill the process, then try again
```

**"No module named 'fastapi'"**
```bash
# Install missing dependencies
pip install -r requirements.txt
```

---

### Can't Open html/data.html

**When using API-only mode:**

Option 1: Use a file browser
- Navigate to the `html/` folder
- Double-click `data.html`

Option 2: Use browser address bar
- Windows: `file:///C:/Users/YourName/code/graph/html/data.html`
- Linux: `file:///home/yourname/code/graph/html/data.html`

Option 3: Switch to all-in-one mode
```bash
python run.py serve
```

---

### Edit Modal Doesn't Appear

1. Check browser console: Press `F12` → Console tab
2. Look for red error messages
3. Verify API server is running (you should see "API running at http://localhost:8000")
4. Try a longer press (some systems need 1+ second)

---

### Changes Don't Save

1. Open browser DevTools: `F12`
2. Go to Network tab
3. Long-press an item and check if API request is made
4. Look for response errors in red

Common issues:
- API server not running
- `structure.txt` file permissions
- Browser blocking API calls (CORS issue)

---

## API Documentation

Once servers are running, view interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Quick API Test

Get all items:
```bash
curl http://localhost:8000/api/items/level
```

Update an item's progress:
```bash
curl -X PUT http://localhost:8000/api/items/level.work \
  -H "Content-Type: application/json" \
  -d '{"progress": 85}'
```

---

## Google Drive Sync

### Download Latest Version
```bash
curl -X POST http://localhost:8000/api/sync/download
```

### Upload Changes
```bash
curl -X POST http://localhost:8000/api/sync/upload
```

### Sync Both (Download then Upload)
```bash
curl -X POST http://localhost:8000/api/sync/both
```

> **Tip**: Always download before uploading to avoid overwriting changes made elsewhere.

---

## Next Steps

1. ✅ Server running? Great!
2. 📝 Try editing an item
3. 📖 Check [WEB_EDITING_GUIDE.md](WEB_EDITING_GUIDE.md) for advanced usage
4. 🔌 Review [API Reference](WEB_EDITING_GUIDE.md#api-reference) for endpoints
5. 💾 Learn about [Google Drive sync](GOOGLE_DRIVE_SETUP.md)

---

## Environment Variables (Optional)

Control server behavior with environment variables:

```bash
# Windows (Command Prompt)
set API_PORT=9000
python run.py api

# Windows (PowerShell)
$env:API_PORT=9000
python run.py api

# Linux/macOS
export API_PORT=9000
python run.py api
```

Available variables:
- `API_PORT`: API server port (default: 8000)
- `HTML_PORT`: HTML server port (default: 8080)

---

## Still Having Issues?

1. Check [WEB_EDITING_GUIDE.md](WEB_EDITING_GUIDE.md#troubleshooting)
2. Review [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md) for auth issues
3. Check server output for error messages
4. Verify `structure.txt` file exists in project root

