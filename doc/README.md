# YAML-based Knowledge Graph Visualization

A YAML-based tool to visualize hierarchical knowledge structures as interactive HTML graphs with a local web server.

## Live Demo

🔗 **[View Live Demo](https://raw.githack.com/zomorodiyan/graph/main/html/data.html)**

*Interactive visualization of the knowledge graph hierarchy - click around to explore!*

## What it does

Converts YAML-structured knowledge hierarchies into multi-level interactive visualizations:
- **Level 1**: Main categories (Body, Finance, Interaction, Level, Mind, Time)
- **Level 2**: Subcategories within each main category
- **Level 3**: Specific items within each subcategory
- **Level 4+**: Supports deeper nesting for complex hierarchies

The system reads from a centralized `structure.yaml` file and generates corresponding HTML files with breadcrumb navigation for each item in the hierarchy.

## Quick Start

```bash
# Start local server and open visualization
python run.py

# The server will automatically:
# 1. Generate HTML files from structure.yaml
# 2. Start a local web server (usually on port 8080)
# 3. Open your browser to the main visualization
```

## Available Commands

```bash
# Default: Generate HTML and start server
python run.py

# Generate HTML files only (no server)
python run.py generate

# Search for items in the structure
python run.py search:<query>

# Show help with all commands
python run.py help
```

## File Structure

```
structure.yaml  # Central YAML file defining the knowledge hierarchy
run.py          # Main launcher script with server functionality
html/           # Generated HTML files (auto-created)
src/            # Source code
  graph.py      # Main graph generation and CLI commands
  file_utils.py # YAML parsing and file operations
  hierarchy_builder.py # Hierarchy processing and navigation
  html_generator.py    # HTML generation and styling
```

## YAML-Based Structure Definition

The knowledge graph is defined in `structure.yaml` with the following format:

```yaml
metadata:
  title: Personal Knowledge Graph
  description: Hierarchical structure of personal development data
  version: 2.0

structure:
  body:                    # Level 1 category
    title: Body
    id: body
    context: Physical health and wellness
    children:
      habit:               # Level 2 subcategory
        title: Habit
        id: body_habit
        context: Daily routines and healthy habits
        children:
          evening:         # Level 3 item
            title: Evening
            id: body_habit_evening
            context: Evening routine activities
```

Key YAML structure elements:
- **id**: Unique identifier for navigation and HTML generation
- **title**: Display name shown in the visualization
- **context**: Optional description providing additional context
- **children**: Nested items creating the hierarchical structure

## Features

- **YAML-based configuration** with centralized structure definition
- **Local web server** with automatic port detection
- **Multi-level hierarchy support** (unlimited nesting depth)
- **Breadcrumb navigation** between all levels
- **Context descriptions** for enhanced understanding
- **Automatic HTML generation** for all structure items
- **Clean, responsive HTML output** with color-coded sections
- **Command-line interface** with multiple operational modes
- **Search functionality** across the entire hierarchy
- **Cross-platform support** with virtual environment detection

## Current Knowledge Domains

The application currently supports a comprehensive personal development structure across **6 main categories**:

- **Body** (Physical health and wellness)
  - Habit, Nutrition, Train
- **Finance** (Financial planning and money management)
  - Earn, Invest, Spend
- **Interaction** (Social relationships and communication)
  - Community, Family, Friends, Love
- **Level** (Personal development and skill advancement)
  - Goal, Skill, Study, Work (including specialized project hierarchies)
- **Mind** (Mental health and cognitive wellness)
  - Mood, Rest
- **Time** (Time management and scheduling)
  - Calendar planning (Day, Month, Year)

## Virtual Environment Support

The application automatically detects and uses Python virtual environments:
- Windows: `.venv\Scripts\python.exe`
- Unix/Linux: `.venv/bin/python`
- Falls back to system Python if no virtual environment is found

## Platform Compatibility

✅ **Tested on Windows and Linux**
- Windows 10/11 with PowerShell and Command Prompt
- Linux distributions with Python 3.7+
- Cross-platform file path handling and virtual environment detection