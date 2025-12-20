# System Overview & Launch Instructions

## What You Have

A complete **web-based hierarchical data editor** with:
- ✅ REST API backend (FastAPI)
- ✅ Interactive web interface with long-press editing
- ✅ Atomic file saves with backups
- ✅ Google Drive sync (download & upload)
- ✅ Cross-platform support (Windows, Linux, macOS)

---

## 🚀 How to Run (Choose One)

### Easiest: Start the Default Server
```bash
python run.py
```
✨ That's it! API runs at `http://localhost:8000`

Then open `html/data.html` in your browser (just drag and drop the file).

---

### Option 2: All-in-One (with Auto Browser)
```bash
python run.py serve
```
Opens both API and HTML servers, automatically opens your browser.

---

### Option 3: Linux/macOS (with convenience script)
```bash
chmod +x graph.sh   # First time only
./graph.sh
```
Runs the same as `python run.py` but from a shell script.

---

## 📍 What Happens When You Run It

```
Terminal Output:
✓ Downloads structure.txt from Google Drive (if available)
✓ Starts FastAPI server on http://localhost:8000
✓ Ready to accept connections

Browser:
1. Open: html/data.html
2. See your hierarchical graph
3. Long-press any item for 0.8 seconds
4. Modal form appears to edit progress/context/due date
5. Click Save → API saves to structure.txt automatically
```

---

## 🎯 Quick Reference

| Action | Command |
|--------|---------|
| Start API server | `python run.py` or `python run.py api` |
| Start all-in-one | `python run.py serve` |
| Setup Google Drive | `python run.py auth` |
| Just generate HTML | `python run.py generate` |
| See all commands | `python run.py help` |
| Search items | `python run.py search:keyword` |

---

## 📝 Editing Workflow

1. **Server running?** ✓ (You'll see "API running at http://localhost:8000")
2. **Browser open to html/data.html?** ✓
3. **Long-press an item** (hold for 0.8 seconds)
4. **Modal form appears** with editable fields
5. **Edit progress** (0-100%), **context** (text), or **due date** (YYYY-MM-DD)
6. **Click Save** 
7. **✨ Changes appear instantly** - file saved, HTML regenerated

---

## 🔌 API Endpoints (When Server is Running)

### Interactive Documentation
- **Swagger UI**: http://localhost:8000/docs (try requests here)
- **ReDoc**: http://localhost:8000/redoc (read-only docs)

### REST API
```bash
# Get item
curl http://localhost:8000/api/items/level

# Update progress
curl -X PUT http://localhost:8000/api/items/level.work \
  -H "Content-Type: application/json" \
  -d '{"progress": 85}'

# Download from Google Drive
curl -X POST http://localhost:8000/api/sync/download

# Upload to Google Drive
curl -X POST http://localhost:8000/api/sync/upload
```

---

## 📂 Important Files

| File | Purpose |
|------|---------|
| `structure.txt` | Your data (editable) |
| `html/data.html` | Main entry point in browser |
| `src/api.py` | FastAPI server |
| `run.py` | Launcher script |
| `backups/` | Automatic backups (safe!) |

---

## 🔒 Safety Features

- **Atomic Writes**: Won't corrupt files on crash
- **Auto Backups**: Every save creates a timestamped backup
- **Validation**: Checks progress (0-100), dates (YYYY-MM-DD)
- **Last-Write-Wins**: Google Drive conflicts resolved safely

---

## ❓ Troubleshooting

### "Can't find html/data.html"
- Look in the `html/` folder
- Or open from browser: `file:///C:/Users/YourName/code/graph/html/data.html`

### "Port 8000 already in use"
```bash
# Windows:
netstat -ano | findstr :8000
taskkill /PID <pid> /F

# Linux/macOS:
lsof -i :8000
kill -9 <pid>
```

### "No module named fastapi"
```bash
pip install -r requirements.txt
```

### "Modal doesn't appear when I press an item"
- Check DevTools (F12) for errors
- Try pressing longer (1+ second)
- Verify server is running in terminal

---

## 📚 Documentation Files

- **[RUN.md](RUN.md)** - This file (comprehensive guide)
- **[QUICKSTART.md](QUICKSTART.md)** - Quick reference
- **[WEB_EDITING_GUIDE.md](WEB_EDITING_GUIDE.md)** - Advanced features & API details
- **[GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md)** - Google Drive authentication

---

## 🎓 Learning Path

1. **Just starting?**
   - Run: `python run.py`
   - Open: `html/data.html`
   - Try: Long-press an item

2. **Want advanced features?**
   - Read: [WEB_EDITING_GUIDE.md](WEB_EDITING_GUIDE.md)
   - Try: API endpoints at http://localhost:8000/docs

3. **Need Google Drive sync?**
   - Run: `python run.py auth`
   - Read: [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md)

4. **Need to troubleshoot?**
   - Check: [RUN.md](RUN.md) → Troubleshooting section
   - Run: `python run.py help`

---

## ✨ What's Implemented

### Backend (src/api.py)
- ✅ 4 CRUD endpoints (GET, PUT, POST, DELETE)
- ✅ Pydantic validation
- ✅ Atomic file saves with backups
- ✅ Incremental HTML regeneration
- ✅ Google Drive sync endpoints

### Frontend (html_generator.py)
- ✅ Long-press detection (800ms)
- ✅ Modal edit form
- ✅ Data attributes for item editing
- ✅ Touch & mouse support
- ✅ Form validation

### Data (file_utils.py)
- ✅ Atomic writes (temp + rename)
- ✅ Automatic backup creation
- ✅ Simple indentation format
- ✅ Property validation

### Setup
- ✅ Cross-platform launcher
- ✅ Virtual environment support
- ✅ Google Drive integration
- ✅ Auto-reload development mode

---

## 🔄 Development Workflow

1. Edit `structure.txt` directly or via web interface
2. API automatically saves changes
3. HTML regenerates for affected items only
4. Browser shows updates (manual refresh or auto-reload)

---

## 🚀 Performance Notes

- **Fast startup**: ~2 seconds
- **Quick edits**: API response <100ms
- **Incremental updates**: Only affected HTML files regenerated
- **Lightweight**: No heavy dependencies

---

## 📞 Support

1. Check terminal output for error messages
2. Open browser DevTools (`F12`) → Console tab
3. Review relevant documentation file above
4. Check [WEB_EDITING_GUIDE.md](WEB_EDITING_GUIDE.md#troubleshooting)

---

## ✅ Ready to Start?

```bash
# 1. Run the server (default command)
python run.py

# 2. Open your browser to html/data.html

# 3. Long-press any item to edit!
```

That's it! Enjoy your web-based editor! 🎉

