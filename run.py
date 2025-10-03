#!/usr/bin/env python3
"""
Simple launcher script for the graph visualization application.
Usage: python3 run.py [filename]
"""

import os
import sys
import subprocess

def main():
    # Change to src directory
    src_dir = os.path.join(os.path.dirname(__file__), 'src')
    os.chdir(src_dir)
    
    # Forward any arguments to graph.py
    cmd = ['python3', 'graph.py'] + sys.argv[1:]
    
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running graph.py: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print("Error: python3 not found. Please install Python 3.")
        sys.exit(1)

if __name__ == "__main__":
    main()