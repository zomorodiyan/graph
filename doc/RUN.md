# How to Run the System

This guide covers how to run the web-based hierarchical graph editor on **Windows, Linux, and macOS**.

## 🚀 Quick Start (30 seconds)

### Windows & Linux (Same)
```bash
python run.py
```

That's it! The API server starts at `http://localhost:8000`. Open `html/data.html` in your browser.

---

## 📋 Complete Setup (First Time)

### 1. Authenticate with Google Drive (Optional)
```bash
python run.py auth
```
This lets you download/upload your structure from Google Drive. Skip if you only want local files.

### 2. Start the Server

Choose ONE option:

#### Option A: API Server Only (Recommended)
```bash
python run.py api
```
Or just:
```bash
python run.py
```

- Lightweight and fast
- No browser auto-open
- You open `html/data.html` manually

#### Option B: All-in-One (API + HTML Servers)
```bash
python run.py serve
```

- Starts both servers automatically
- Opens your browser
- Everything included

#### Option C: Just Generate (No Servers)
```bash
python run.py generate
```

---

## 🖥️ Platform-Specific Instructions

### Windows

All commands use `python`:

```bash
# Start server
python run.py

# Or with options
python run.py api      # API only
python run.py serve    # All-in-one
python run.py auth     # Setup Google Drive
python run.py help     # Show all commands
```

### Linux & macOS

Use `python3` (or `python` if Python 2 is not installed):

```bash
# Start server
python3 run.py

# Or use the convenience script
chmod +x graph.sh      # Make script executable (first time only)
./graph.sh             # Start server
./graph.sh serve       # Start all-in-one
./graph.sh auth        # Setup Google Drive
./graph.sh help        # Show all commands
```

---

## 📖 Usage After Server Starts

### 1. Access the Interface

**If using `python run.py api`:**
- Open browser and go to: `file:///path/to/html/data.html`
  - Windows example: `file:///C:/Users/YourName/code/graph/html/data.html`
  - Linux example: `file:///home/yourname/code/graph/html/data.html`
- Or: Drag `html/data.html` into your browser

**If using `python run.py serve`:**
- Browser opens automatically to `http://localhost:8080/data.html`

### 2. Edit Items

1. **Find an item** in the visualization
2. **Long-press** (hold for 0.8 seconds) the item name
3. **Modal form appears** with fields:
   - Progress: 0-100%
   - Context: Text description
   - Due Date: YYYY-MM-DD
4. **Click Save** to apply changes
5. **Changes save automatically** to `structure.txt`

### 3. View API Documentation

When server is running:
- **Swagger UI**: http://localhost:8000/docs (interactive testing)
- **ReDoc**: http://localhost:8000/redoc (documentation)

---

## 🔄 Google Drive Sync

### Initial Download (First Run)
```bash
python run.py
```
This automatically downloads `structure.txt` from Google Drive on startup.

### Manual Sync Commands

**Download latest from Google Drive:**
```bash
curl -X POST http://localhost:8000/api/sync/download
```

**Upload changes to Google Drive:**
```bash
curl -X POST http://localhost:8000/api/sync/upload
```

**Download then upload (download wins conflicts):**
```bash
curl -X POST http://localhost:8000/api/sync/both
```

---

## 💻 Command Reference

| Command | Effect |
|---------|--------|
| `python run.py` | Start API server (default) |
| `python run.py api` | Start API server explicitly |
| `python run.py serve` | Start API + HTML servers |
| `python run.py generate` | Generate HTML only |
| `python run.py auth` | Setup Google Drive |
| `python run.py help` | Show help |
| `python run.py search:keyword` | Search items |

---

## 🔧 Troubleshooting

### "Port already in use" Error

**Windows:**
```bash
netstat -ano | findstr :8000
taskkill /PID <process_id> /F
```

**Linux/macOS:**
```bash
lsof -i :8000
kill -9 <process_id>
```

### "No module named 'fastapi'" Error

```bash
pip install -r requirements.txt
```

### "Can't open html/data.html" in API-only mode

**Option 1**: Use file manager
- Navigate to the `html/` folder
- Double-click `data.html`

**Option 2**: Copy-paste path in browser
- Windows: `file:///C:/Users/YourName/code/graph/html/data.html`
- Linux: `file:///home/username/code/graph/html/data.html`

**Option 3**: Switch to all-in-one
```bash
python run.py serve
```

### Edit modal doesn't appear

- Check browser console: Press `F12`
- Verify server is running (look for API message in terminal)
- Try holding press longer (1+ second)
- Check network requests in DevTools → Network tab

### Changes not saving

1. Check browser console (`F12`)
2. Look for red error messages
3. Verify `structure.txt` has correct permissions
4. Check backups/ folder - a backup should be created on each save

---

## 📁 File Structure

```
graph/
├── run.py              ← Main launcher (Python)
├── graph.sh            ← Linux/macOS launcher (Bash)
├── structure.txt       ← Your data (editable)
├── html/
│   ├── data.html       ← Main entry point
│   ├── level.html      ← Item pages
│   └── ...
├── src/
│   ├── api.py          ← FastAPI server
│   ├── graph.py        ← HTML generator
│   ├── file_utils.py   ← File I/O
│   └── ...
└── backups/            ← Automatic backups
```

---

## 🔒 Safety Features

- **Atomic writes**: No corruption on crashes
- **Automatic backups**: Every save creates a backup with timestamp
- **Validation**: Progress (0-100), dates (YYYY-MM-DD)
- **Last-write-wins**: Google Drive conflict resolution

---

## 📚 Additional Resources

- [WEB_EDITING_GUIDE.md](WEB_EDITING_GUIDE.md) - Advanced editing guide
- [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md) - Google Drive authentication
- [QUICKSTART.md](QUICKSTART.md) - Detailed quick start
- [README.md](README.md) - Project overview

---

## 🐧 Linux-Specific Tips

### Make graph.sh Executable
```bash
chmod +x graph.sh
./graph.sh
```

### Use as an Alias
```bash
alias graph='python3 /path/to/graph/run.py'
graph api
graph serve
graph auth
```

### Background Process (Keep Running After Terminal Close)
```bash
nohup python3 run.py serve &
```

### Check if Server is Running
```bash
curl http://localhost:8000/
```

---

## ❓ FAQ

**Q: Which mode should I use?**  
A: Start with `python run.py serve` for testing. Use `python run.py api` for development (lighter weight).

**Q: Do I need Google Drive?**  
A: No, skip the `auth` command. Local `structure.txt` works fine.

**Q: Can multiple people edit at once?**  
A: Not yet. Save conflicts use last-write-wins.

**Q: Is the data safe?**  
A: Yes! Atomic writes + automatic backups prevent data loss.

**Q: Can I use Windows and Linux on the same project?**  
A: Yes! Both use the same Python commands and file format.

---

## 🎯 Next Steps

1. ✅ Run `python run.py`
2. 📝 Open `html/data.html` in browser
3. 🖱️ Long-press an item to test editing
4. 📖 Read [WEB_EDITING_GUIDE.md](WEB_EDITING_GUIDE.md) for advanced features
5. ☁️ Optional: Setup Google Drive with `python run.py auth`

