#!/usr/bin/env python3
"""
Simple launcher script for the YAML-based graph visualization application.
Usage: python run.py [command]
"""

import os
import sys
import subprocess
import webbrowser
import time
import threading
import http.server
import socketserver
import socket
from pathlib import Path

# Import Google Drive integration
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
from google_drive import download_structure_yaml, authenticate
from google_drive import upload_structure_yaml
from google_drive import set_drive_file_id

def is_port_free(port):
    """Check if a port is free"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', port))
            return True
    except OSError:
        return False

def find_free_port(start_port=8080):
    """Find a free port starting from start_port"""
    for port in range(start_port, start_port + 100):
        if is_port_free(port):
            return port
    return None

def start_server(port):
    """Start HTTP server to serve the HTML files"""
    html_dir = os.path.join(os.path.dirname(__file__), 'html')
    os.chdir(html_dir)
    
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass  # Suppress server logs
    
    try:
        with socketserver.TCPServer(("", port), Handler) as httpd:
            print(f"Server running at http://localhost:{port}/level.html")
            httpd.serve_forever()
    except Exception as e:
        print(f"Server error: {e}")

def check_yaml_file():
    """Check if the structure.txt file exists"""
    structure_path = os.path.join(os.path.dirname(__file__), 'structure.txt')
    if not os.path.exists(structure_path):
        print("Error: structure.txt file not found!")
        print("Please ensure the structure.txt file exists in the project root.")
        return False
    return True

def get_python_command():
    """Get the appropriate Python command"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check for virtual environment
    venv_python_win = os.path.join(script_dir, '.venv', 'Scripts', 'python.exe')
    venv_python_unix = os.path.join(script_dir, '.venv', 'bin', 'python')
    
    if os.path.exists(venv_python_win):
        return venv_python_win
    elif os.path.exists(venv_python_unix):
        return venv_python_unix
    else:
        return 'python3'

def main():
    """Main entry point for the launcher."""
    # Change to the project root directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Handle command line arguments
    command = sys.argv[1] if len(sys.argv) > 1 else "api"
    
    # Handle auth command separately (before YAML sync)
    if command == "auth":
        success = authenticate()
        sys.exit(0 if success else 1)
    
    # Sync structure.txt from Google Drive (falls back to local if it fails)
    download_structure_yaml()
    
    # Check if structure.txt exists
    if not check_yaml_file():
        return
    python_cmd = get_python_command()
    src_dir = os.path.join(script_dir, 'src')
    
    if command == "generate":
        # Just generate HTML files without starting server
        print("Generating visualization from YAML structure...")
        try:
            result = subprocess.run([python_cmd, 'graph.py'], 
                                  capture_output=True, text=True, cwd=src_dir)
            if result.returncode != 0:
                print(f"Error generating visualization: {result.stderr}")
                return
            print("Visualization generated successfully!")
        except Exception as e:
            print(f"Error running graph.py: {e}")
            return
    elif command.startswith("search:"):
        # Search for items
        query = command[7:]  # Remove "search:" prefix
        print(f"Searching for '{query}'...")
        try:
            result = subprocess.run([python_cmd, 'graph.py', 'search', query], 
                                  capture_output=True, text=True, cwd=src_dir)
            print(result.stdout)
            if result.stderr:
                print(f"Errors: {result.stderr}")
        except Exception as e:
            print(f"Error searching: {e}")
    
    elif command == "help":
        # Show help
        print("Web-Based Hierarchical Graph Editor")
        print("===================================")
        print()
        print("Usage: python run.py [command]")
        print()
        print("Commands:")
        print("  api            Start FastAPI backend server (default)")
        print("                 API runs on http://localhost:8000")
        print("                 Open html/data.html in browser to use")
        print()
        print("  serve          Start API server + HTML server (all-in-one)")
        print("                 Opens browser automatically")
        print()
        print("  generate       Generate HTML files only (no servers)")
        print("  search:<query> Search for items matching query")
        print("  auth           Authenticate with Google Drive")
        print("  help           Show this help message")
        print()
        print("Quick Start:")
        print("  1. First time: python run.py auth")
        print("  2. Run server: python run.py")
        print("  3. Or run all-in-one: python run.py serve")
        print()
        print("Editing:")
        print("  - Long-press (0.8 sec) any item to open edit modal")
        print("  - Edit progress (0-100), context, or due date")
        print("  - Changes save automatically via API")
        print()
        print("API Endpoints (when running 'python run.py api'):")
        print("  GET    /api/items/{path}           - Get item")
        print("  PUT    /api/items/{path}           - Update item")
        print("  POST   /api/items/{parent_path}    - Create item")
        print("  DELETE /api/items/{path}           - Delete item")
        print("  POST   /api/sync/download          - Download from Google Drive")
        print("  POST   /api/sync/upload            - Upload to Google Drive")
        print()
        print("Direct commands:")
        print("  upload         Upload local structure.txt to Google Drive (no servers)")
        print("  set-file:<URL or ID>  Set Google Drive file_id in config.yaml")
        print()
        print("API Documentation:")
        print("  http://localhost:8000/docs         - Interactive API docs")
        print("  http://localhost:8000/redoc        - ReDoc documentation")
    
    
    elif command == "api" or len(sys.argv) == 1:
        # Default: Start FastAPI server only (no HTML server)
        # Allow custom port via environment variable or command line
        api_port = os.getenv("API_PORT", "8000")
        
        print("Starting FastAPI backend server...")
        print()
        print(f"📡 API Server: http://localhost:{api_port}")
        print(f"📖 API Docs:   http://localhost:{api_port}/docs")
        print()
        print("Next steps:")
        print("1. Open html/data.html in your browser")
        print("2. Long-press any item to edit (800ms hold)")
        print("3. API will save changes automatically")
        print()
        print("To stop: Press Ctrl+C")
        print()
        
        try:
            # Use uvicorn to run the FastAPI app
            uvicorn_cmd = [
                python_cmd, '-m', 'uvicorn',
                'api:app',
                '--host', '0.0.0.0',
                '--port', api_port,
                '--reload'
            ]
            subprocess.run(uvicorn_cmd, cwd=src_dir)
        except KeyboardInterrupt:
            print("\nShutting down API server...")
            sys.exit(0)
        except Exception as e:
            print(f"Error starting API server: {e}")
            sys.exit(1)
    
    elif command == "serve":
        # All-in-one: API server + HTML server
        print("Starting API + HTML servers (all-in-one)...")
        print()
        print("📡 API Server: http://localhost:8000")
        print("🌐 HTML Server: http://localhost:8080")
        print()
        
        # Generate HTML first
        print("Generating HTML files...")
        try:
            result = subprocess.run([python_cmd, 'graph.py'], 
                                  capture_output=True, text=True, cwd=src_dir, encoding='utf-8', errors='replace')
            if result.returncode != 0:
                print(f"Error generating visualization: {result.stderr}")
                return
        except Exception as e:
            print(f"Error running graph.py: {e}")
            return
        
        # Start API server in background thread
        def start_api_server():
            try:
                uvicorn_cmd = [
                    python_cmd, '-m', 'uvicorn',
                    'api:app',
                    '--host', '0.0.0.0',
                    '--port', '8000',
                    '--reload'
                ]
                subprocess.run(uvicorn_cmd, cwd=src_dir)
            except Exception as e:
                print(f"API server error: {e}")
        
        api_thread = threading.Thread(target=start_api_server, daemon=True)
        api_thread.start()
        time.sleep(2)  # Give API server time to start
        
        # Start HTML server in background thread
        html_port = find_free_port(8080)
        if not html_port:
            print("Could not find a free port for HTML server.")
            return
        
        html_thread = threading.Thread(target=start_server, args=(html_port,), daemon=True)
        html_thread.start()
        time.sleep(1)
        
        # Open browser
        url = f"http://localhost:{html_port}/data.html"
        try:
            webbrowser.open(url)
            print(f"Opening browser to {url}")
        except Exception as e:
            print(f"Could not open browser: {e}")
            print(f"Please manually open: {url}")
        
        print()
        print("Both servers running! Press Ctrl+C to stop")
        print()
        print("Tips:")
        print("- Long-press items to edit")
        print("- View API docs at http://localhost:8000/docs")
        print("- HTML server serves static files from html/")
        print()
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down servers...")
            sys.exit(0)
    
    elif command == "upload":
        # Upload local structure.txt to Google Drive
        print("Uploading structure.txt to Google Drive...")
        success = upload_structure_yaml()
        sys.exit(0 if success else 1)
    
    elif command.startswith("set-file:"):
        url_or_id = command[len("set-file:"):].strip()
        if not url_or_id:
            print("Usage: python run.py set-file:<URL or ID>")
            sys.exit(1)
        print("Setting Google Drive file ID in config.yaml...")
        ok = set_drive_file_id(url_or_id)
        sys.exit(0 if ok else 1)
    
    
    else:
        print(f"Unknown command: {command}")
        print("Use 'python run.py help' for available commands")

if __name__ == "__main__":
    main()
