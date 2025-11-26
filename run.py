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
    """Check if the structure.yaml file exists"""
    yaml_path = os.path.join(os.path.dirname(__file__), 'structure.yaml')
    if not os.path.exists(yaml_path):
        print("Error: structure.yaml file not found!")
        print("Please ensure the structure.yaml file exists in the project root.")
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
    
    # Check if structure.yaml exists
    if not check_yaml_file():
        return
    
    # Handle command line arguments
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
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
        print("YAML-based Knowledge Graph Launcher")
        print("===================================")
        print()
        print("Usage: python run.py [command]")
        print()
        print("Commands:")
        print("  serve          Generate HTML files and start web server (default)")
        print("  generate       Generate HTML files only")
        print("  search:<query> Search for items matching query")
        print("  help           Show this help message")
        print()
        print("Examples:")
        print("  python run.py")
        print("  python run.py generate")
        print("  python run.py search:finance")
        print()
        print("The structure is defined in structure.yaml")
    
    elif command == "serve" or len(sys.argv) == 1:
        # Default: generate and serve
        print("Generating visualization from YAML structure...")
        try:
            result = subprocess.run([python_cmd, 'graph.py'], 
                                  capture_output=True, text=True, cwd=src_dir, encoding='utf-8', errors='replace')
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
            return
        
        if port != 8080:
            print(f"Port 8080 was busy, using port {port} instead")
        
        # Start server in background thread
        server_thread = threading.Thread(target=start_server, args=(port,), daemon=True)
        server_thread.start()
        
        # Give server time to start
        time.sleep(2)
        
        # Open browser
        url = f"http://localhost:{port}/data.html"
        try:
            webbrowser.open(url)
            print(f"Opening browser to {url}")
        except Exception as e:
            print(f"Could not open browser: {e}")
            print(f"Please manually open: {url}")
        
        # Keep main thread alive
        try:
            print("Server running... Press Ctrl+C to stop")
            print("Edit structure.yaml to modify the knowledge graph")
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down server...")
            sys.exit(0)
    
    else:
        print(f"Unknown command: {command}")
        print("Use 'python run.py help' for available commands")

if __name__ == "__main__":
    main()
