@echo off
REM Quick start script for the web-based editing system
REM This script starts the API server and opens the browser

echo Starting Graph Web Editing System...
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python or add it to your PATH
    pause
    exit /b 1
)

REM Get the directory of this script
set SCRIPT_DIR=%~dp0

REM Change to the script directory
cd /d "%SCRIPT_DIR%"

REM Check if venv exists
if not exist .venv (
    echo ERROR: Virtual environment not found at .venv
    echo Please run: python -m venv .venv
    echo Then run: .venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

echo.
echo Starting FastAPI server on http://localhost:8000
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the server
.venv\Scripts\python.exe -m uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload

REM If execution reaches here, user pressed Ctrl+C
echo.
echo Server stopped.
pause
