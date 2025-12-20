#!/bin/bash
# Quick launch script for the hierarchical graph editor
# Works on Linux and macOS
# Usage: ./graph.sh [api|serve|generate|auth|help]

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Use python3 if available, otherwise python
if command -v python3 &> /dev/null; then
    PYTHON=python3
else
    PYTHON=python
fi

# Show usage
if [ "$1" == "" ] || [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "📊 Hierarchical Graph Editor"
    echo ""
    echo "Usage: ./graph.sh [command]"
    echo ""
    echo "Commands:"
    echo "  (no args)  Start API server (default)"
    echo "  api        Start API server only"
    echo "  serve      Start API + HTML servers (all-in-one)"
    echo "  generate   Generate HTML files only"
    echo "  auth       Setup Google Drive authentication"
    echo "  help       Show this help message"
    echo ""
    echo "Quick Start:"
    echo "  ./graph.sh auth        # Setup (first time)"
    echo "  ./graph.sh             # Start server"
    echo "  ./graph.sh serve       # Start with browser auto-open"
    echo ""
    exit 0
fi

# Run the command
$PYTHON run.py "$@"
