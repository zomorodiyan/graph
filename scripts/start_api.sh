#!/bin/bash
# Quick start script for the web-based editing system
# This script starts the API server

echo "Starting Graph Web Editing System..."
echo

# Check if Python is available
if ! command -v python &> /dev/null; then
    echo "ERROR: Python is not installed or not in PATH"
    echo "Please install Python or add it to your PATH"
    exit 1
fi

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Check if venv exists
if [ ! -d .venv ]; then
    echo "ERROR: Virtual environment not found at .venv"
    echo "Please run: python -m venv .venv"
    echo "Then run: source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

echo
echo "Starting FastAPI server on http://localhost:8000"
echo
echo "Press Ctrl+C to stop the server"
echo

# Activate virtual environment and start the server
source .venv/bin/activate
python -m uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload

# If execution reaches here, user pressed Ctrl+C
echo
echo "Server stopped."
