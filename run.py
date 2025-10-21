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
import socket
from pathlib import Path

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
            print(f"Server running at http://localhost:{port}/main.html")
            httpd.serve_forever()
    except Exception as e:
        print(f"Server error: {e}")

def main():
    # Change to the project root directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Use virtual environment Python if available, otherwise python3
    venv_python = os.path.join(script_dir, '.venv', 'bin', 'python')
    if os.path.exists(venv_python):
        python_cmd = venv_python
    else:
        python_cmd = 'python3'
    
    # Generate the visualization
    print("Generating visualization...")
    try:
        # Change to src directory and run graph.py from there
        src_dir = os.path.join(script_dir, 'src')
        result = subprocess.run([python_cmd, 'graph.py'], 
                              capture_output=True, text=True, cwd=src_dir)
        if result.returncode != 0:
            print(f"Error generating visualization: {result.stderr}")
            return
        print("Visualization generated successfully!")
    except Exception as e:
        print(f"Error running graph.py: {e}")
        return
    
    # Find a free port
    port = find_free_port(8080)
    if not port:
        print("Could not find a free port. Please close other servers and try again.")
        print("You can kill existing servers with: pkill -f 'python.*http.server'")
        return
    
    if port != 8080:
        print(f"Port 8080 was busy, using port {port} instead")
    
    # Start server in background thread
    server_thread = threading.Thread(target=start_server, args=(port,), daemon=True)
    server_thread.start()
    
    # Give server time to start
    time.sleep(2)
    
    # Open browser
    url = f"http://localhost:{port}/main.html"
    try:
        webbrowser.open(url)
        print(f"Opening browser to {url}")
    except Exception as e:
        print(f"Could not open browser: {e}")
        print(f"Please manually open: {url}")
    
    # Keep main thread alive
    try:
        print("Server running... Press Ctrl+C to stop")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down server...")
        sys.exit(0)

if __name__ == "__main__":
    main()