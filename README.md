# Graph Visualization

A simple tool to visualize hierarchical markdown files as interactive HTML graphs.

## Live Demo

🔗 **[View Live Demo](https://raw.githack.com/zomorodiyan/graph/main/html/main.html)**

*Interactive visualization of the markdown hierarchy - click around to explore!*

## What it does

Converts markdown files with headers into a 3-level interactive visualization:
- **Level 1**: Main categories (Mind, Body, Finance, etc.)
- **Level 2**: Subcategories (Mood, Rest, Earn, Spend, etc.) 
- **Level 3**: Individual items within each subcategory

## Quick Start

```bash
# Generate interactive graph
python3 run.py

# View specific file
python3 run.py data/finance.md
```

Opens `html/main.html` in your browser with clickable navigation between sections.

## File Structure

```
data/     # Public markdown files
pdata/    # Private markdown files (git submodule)
html/     # Generated HTML files
src/      # Source code
```

## Markdown Format

Files use underscore-based hierarchy:
- `main.md` → Root
- `finance.md` → Level 1
- `finance_invest.md` → Level 2
- `finance_invest_stocks.md` → Level 3

Headers in files become clickable items:
```markdown
# Investment
# Savings
# Budget
```

## Features

- **Click to navigate** between related files
- **Automatic file detection** and linking
- **Public/private data separation** via git submodule
- **Clean HTML output** with color-coded sections