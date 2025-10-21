#!/usr/bin/env python3
"""
Simple launcher script for the graph visualization application.
Usage: python run.py [filename]
"""

import os
import sys
import subprocess
import webbrowser
import time
import threading
import http.server
import socketserver
from pathlib import Path

def start_server(port=8080):
    """Start HTTP server to serve the HTML files"""
    html_dir = os.path.join(os.path.dirname(__file__), 'html')
    os.chdir(html_dir)
    
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"Serving visualization at http://localhost:{port}/main.html")
        httpd.serve_forever()

def main():
    # Get the project root directory
    project_root = os.path.dirname(__file__)
    src_dir = os.path.join(project_root, 'src')
    
    # Use virtual environment Python if available, otherwise python3
    venv_python = os.path.join(project_root, '.venv', 'bin', 'python')
    if os.path.exists(venv_python):
        python_cmd = venv_python
    else:
        python_cmd = 'python3'
    
    # Change to src directory
    os.chdir(src_dir)
    
    # Forward any arguments to graph.py
    cmd = [python_cmd, 'graph.py'] + sys.argv[1:]
    
    try:
        print("Generating visualization...")
        subprocess.run(cmd, check=True)
        print("Visualization generated successfully!")
        
        # Start server in background thread
        server_thread = threading.Thread(target=start_server, daemon=True)
        server_thread.start()
        
        # Give server time to start
        time.sleep(1)
        
        # Open browser
        webbrowser.open('http://localhost:8080/main.html')
        
        print("\nPress Ctrl+C to stop the server")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nServer stopped.")
            
    except subprocess.CalledProcessError as e:
        print(f"Error running graph.py: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print(f"Error: {python_cmd} not found. Please check your Python installation.")
        sys.exit(1)

if __name__ == "__main__":
    main()