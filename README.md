# Graph Visualization Project

A hierarchical markdown visualization tool with interactive web interface.

## Project Structure

```
.
├── src/          # Source code
│   └── graph.py  # Main visualization engine
├── data/         # Public markdown files
├── pdata/        # Private markdown files (git submodule)
├── html/         # Generated HTML files
├── run.py        # Simple launcher script
└── .gitignore    # Git ignore file
```

## Setup Instructions

### Basic Usage

```bash
# Generate and view main graph
python3 run.py

# Generate specific file
python3 run.py data/finance.md
```

### Git Submodule Setup for Private Data

To set up the `pdata/` directory as a separate git repository (submodule):

```bash
# 1. Create a new repository for private data
git submodule add <your-private-repo-url> pdata

# 2. Or if you already have private files in pdata/:
cd pdata
git init
git add .
git commit -m "Initial private data"
git remote add origin <your-private-repo-url>
git push -u origin main

# 3. Back in main repo, add the submodule
cd ..
git submodule add <your-private-repo-url> pdata
git commit -m "Add private data submodule"
```

### Cloning the Project with Submodules

When cloning this project:

```bash
# Clone with submodules
git clone --recursive <main-repo-url>

# Or if already cloned, initialize submodules
git submodule update --init --recursive
```

### Working with Submodules

```bash
# Update private data
cd pdata
git pull origin main

# Push changes to private data
cd pdata
git add .
git commit -m "Update private data"
git push origin main

# Update main repo to reference new submodule commit
cd ..
git add pdata
git commit -m "Update private data reference"
git push origin main
```

## Features

- **3-Level Hierarchy**: View main → sub → sub-sub items
- **Interactive Navigation**: Click items to navigate between files
- **Dual Directory Support**: Separates public (data/) and private (pdata/) files
- **Automatic File Detection**: Links items to corresponding markdown files
- **Clean Output**: Generated HTML files in dedicated html/ directory

## File Naming Convention

Files follow an underscore-based hierarchy:
- `main.md` - Root file
- `level.md` - First level (child of main)
- `level_work.md` - Second level (child of level)
- `level_work_project.md` - Third level (child of level_work)

## Development

The main script is in `src/graph.py` and includes:
- Markdown parsing with hierarchy detection
- Dynamic file-based navigation
- HTML generation with interactive elements
- Support for both data/ and pdata/ directories