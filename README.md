# Graph Visualization

A directory-based tool to visualize hierarchical markdown files as interactive HTML graphs with a local web server.

## Live Demo

🔗 **[View Live Demo](https://raw.githack.com/zomorodiyan/graph/main/html/main.html)**

*Interactive visualization of the markdown hierarchy - click around to explore!*

## What it does

Converts directory-structured markdown files into a 3-level interactive visualization:
- **Level 1**: Main categories (Mind, Body, Finance, etc.)
- **Level 2**: Subcategories organized in subdirectories
- **Level 3**: Individual items within each subcategory

The system automatically detects directory structure and generates corresponding HTML files with breadcrumb navigation.

## Quick Start

```bash
# Start local server and open visualization
python run.py

# The server will automatically:
# 1. Generate HTML files for all markdown files
# 2. Start a local web server (usually on port 8080)
# 3. Open your browser to the main visualization
```

## File Structure

```
data/           # Markdown files
  main.md       # Root level with main categories
  body/         # Body-related files
    habit.md
    nutrition.md
  finance/      # Finance-related files
    earn.md
    spend.md
html/           # Generated HTML files (auto-created)
src/            # Source code
  graph.py      # Main graph generation
  file_utils.py # File operations
  hierarchy_builder.py # Directory hierarchy parsing
  html_generator.py    # HTML generation
```

## Directory-Based Hierarchy

The system uses actual directory structure instead of file naming:
- `data/main.md` → Root level
- `data/finance.md` → Level 1 category
- `data/finance/invest.md` → Level 2 subcategory
- `data/finance/invest/stocks.md` → Level 3 items

Headers in markdown files become clickable navigation items:
```markdown
# Investment Strategies
# Portfolio Management
# Risk Assessment
```

## Context Support

Add context to any markdown file using HTML comments:
```markdown
<!-- context: This file contains investment strategies for long-term growth -->

# Growth Stocks
# Value Investing
```

## Features

- **Local web server** with automatic port detection
- **Directory-based hierarchy** with automatic file discovery
- **Breadcrumb navigation** between levels
- **Context extraction** from markdown comments
- **Automatic HTML generation** for all markdown files
- **Clean, responsive HTML output** with color-coded sections
- **Cross-platform support** with proper path handling