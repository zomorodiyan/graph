def read_layers_from_md(filepath):
    """Read markdown file and extract layers with their hierarchy levels"""
    result = []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('#'):
                # Count the number of # symbols to determine level
                level = len(line) - len(line.lstrip('#'))
                # Extract the text after #
                text = line.lstrip('#').strip()
                result.append((text, level))
    
    return result

def extract_deadline_from_md(filepath):
    """Extract deadline text from markdown file comments"""
    if not filepath or not os.path.exists(filepath):
        return None
        
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Look for deadline comment pattern: <!-- deadline: text -->
        import re
        deadline_match = re.search(r'<!--\s*deadline:\s*([^-]+?)\s*-->', content, re.IGNORECASE)
        if deadline_match:
            return deadline_match.group(1).strip()
            
    except Exception as e:
        print(f"Error reading deadline from {filepath}: {e}")
        
    return None

# --- Dynamic hierarchy building based on file names ---
def get_markdown_files_from_directories():
    """Get all markdown files from both data and pdata directories recursively"""
    md_files = []
    search_dirs = [os.path.join('..', 'data'), os.path.join('..', 'pdata')]
    
    for dir_path in search_dirs:
        if os.path.exists(dir_path):
            for root, dirs, files in os.walk(dir_path):
                for f in files:
                    if f.endswith('.md'):
                        full_path = os.path.join(root, f)
                        md_files.append(full_path)
    
    return md_files

def find_file_in_directories(filename_or_path):
    """Find a markdown file in data or pdata directories"""
    search_dirs = [os.path.join('..', 'data'), os.path.join('..', 'pdata')]
    
    for dir_path in search_dirs:
        if os.path.exists(dir_path):
            for root, dirs, files in os.walk(dir_path):
                # Check both exact filename and path matches
                if filename_or_path in files:
                    return os.path.join(root, filename_or_path)
                
                # Also check if the full path matches
                full_path = os.path.join(root, filename_or_path)
                if os.path.exists(full_path):
                    return full_path
    
    return None

def build_hierarchy_from_files():
    """Build complete hierarchy structure from directory-based markdown files"""
    # Get all markdown files from both directories
    md_file_paths = get_markdown_files_from_directories()
    
    # Create hierarchy mapping based on directory structure
    hierarchy = {}
    
    for md_file_path in md_file_paths:
        # Convert file path to hierarchy key
        # Remove the base directory (cross-platform)
        data_path = os.path.join('..', 'data')
        pdata_path = os.path.join('..', 'pdata')
        
        if md_file_path.startswith(data_path + os.sep) or md_file_path.startswith('../data/'):
            relative_path = md_file_path[len(data_path) + 1:] if md_file_path.startswith(data_path + os.sep) else md_file_path[8:]
        elif md_file_path.startswith(pdata_path + os.sep) or md_file_path.startswith('../pdata/'):
            relative_path = md_file_path[len(pdata_path) + 1:] if md_file_path.startswith(pdata_path + os.sep) else md_file_path[9:]
        else:
            continue
            
        # Remove .md extension and split by directory separators (cross-platform)
        path_without_ext = os.path.splitext(relative_path)[0]
        # Use os.sep for cross-platform path separation
        path_parts = path_without_ext.replace('\\', '/').split('/')
        
        # Create hierarchy entry for this file
        hierarchy_key = '/'.join(path_parts)
        hierarchy[hierarchy_key] = {
            'children': [],
            'level': len(path_parts),
            'filename': md_file_path,
            'directory': os.path.dirname(md_file_path)
        }
    
    # Now establish parent-child relationships
    for hierarchy_key, entry in hierarchy.items():
        path_parts = hierarchy_key.replace('\\', '/').split('/')
        
        # If this file has a parent directory, establish parent-child relationship
        if len(path_parts) > 1:
            parent_key = '/'.join(path_parts[:-1])
            child_name = path_parts[-1]
            
            # Add child relationship if parent exists
            if parent_key in hierarchy:
                # Check if this child already exists
                existing_child = next((child for child in hierarchy[parent_key]['children'] 
                                     if child['name'] == hierarchy_key), None)
                if not existing_child:
                    hierarchy[parent_key]['children'].append({
                        'name': hierarchy_key,
                        'display_name': child_name.replace('-', ' ').title(),
                        'filename': entry['filename'],
                        'level': len(path_parts)
                    })
        
        # Special case: top-level files (like 'level', 'body', etc.) should be children of 'main'
        elif len(path_parts) == 1 and hierarchy_key != 'main':
            if 'main' in hierarchy:
                # Check if this child already exists
                existing_child = next((child for child in hierarchy['main']['children'] 
                                     if child['name'] == hierarchy_key), None)
                if not existing_child:
                    hierarchy['main']['children'].append({
                        'name': hierarchy_key,
                        'display_name': hierarchy_key.replace('-', ' ').title(),
                        'filename': entry['filename'],
                        'level': 1
                    })
    
    return hierarchy

def get_children_for_display(node_name, hierarchy):
    """Get children of a node formatted for display"""
    if node_name not in hierarchy:
        return []
    
    children = []
    for child in hierarchy[node_name]['children']:
        # Get grandchildren for this child
        grandchildren = []
        if child['name'] in hierarchy:
            for grandchild in hierarchy[child['name']]['children']:
                grandchildren.append(grandchild['display_name'])
        
        children.append({
            "name": child['display_name'],
            "filename": child['filename'],
            "layer3": grandchildren
        })
    
    return children

def parse_md_hierarchy(filepath):
    """Parse markdown file and build 3-level hierarchy data for display"""
    # Convert file path to hierarchy key (cross-platform)
    data_path = os.path.join('..', 'data')
    pdata_path = os.path.join('..', 'pdata')
    
    if filepath.startswith(data_path + os.sep) or filepath.startswith('../data/'):
        relative_path = filepath[len(data_path) + 1:] if filepath.startswith(data_path + os.sep) else filepath[8:]
    elif filepath.startswith(pdata_path + os.sep) or filepath.startswith('../pdata/'):
        relative_path = filepath[len(pdata_path) + 1:] if filepath.startswith(pdata_path + os.sep) else filepath[9:]
    else:
        relative_path = filepath
    
    # Remove .md extension and use as hierarchy key
    hierarchy_key = os.path.splitext(relative_path)[0]
    base_name = os.path.basename(hierarchy_key)
    
    # Read the content from the markdown file
    layers = read_layers_from_md(filepath)
    
    # Build complete hierarchy from files for navigation
    file_hierarchy = build_hierarchy_from_files()
    
    data = []
    
    # Group layers by level
    level1_items = [item for item in layers if item[1] == 1]  # # items
    
    for level1_name, _ in level1_items:
        # Find corresponding file for this level1 item
        level1_file = None
        # Normalize the level1_name the same way as display_name is created
        normalized_level1 = level1_name.replace('-', ' ').lower()
        
        # Look for matching child in the hierarchy
        if hierarchy_key in file_hierarchy:
            for child in file_hierarchy[hierarchy_key]['children']:
                if child['display_name'].lower() == normalized_level1:
                    level1_file = child['filename']
                    break
        
        # Get level 2 items (from the child file)
        level2_items = []
        if level1_file and os.path.exists(level1_file):
            level1_layers = read_layers_from_md(level1_file)
            level2_content = [item for item in level1_layers if item[1] == 1]  # # items from child file
            
            # Convert level1_file to hierarchy key for child lookup (cross-platform)
            if level1_file.startswith(data_path + os.sep) or level1_file.startswith('../data/'):
                level1_relative = level1_file[len(data_path) + 1:] if level1_file.startswith(data_path + os.sep) else level1_file[8:]
            elif level1_file.startswith(pdata_path + os.sep) or level1_file.startswith('../pdata/'):
                level1_relative = level1_file[len(pdata_path) + 1:] if level1_file.startswith(pdata_path + os.sep) else level1_file[9:]
            else:
                level1_relative = level1_file
            level1_hierarchy_key = os.path.splitext(level1_relative.replace('\\', '/'))[0]
            
            for level2_name, _ in level2_content:
                # Find corresponding file for this level2 item
                level2_file = None
                if level1_hierarchy_key in file_hierarchy:
                    # Normalize the level2_name the same way as display_name is created
                    normalized_level2 = level2_name.replace('-', ' ').lower()
                    for child in file_hierarchy[level1_hierarchy_key]['children']:
                        if child['display_name'].lower() == normalized_level2:
                            level2_file = child['filename']
                            break
                
                # Get level 3 items (from the grandchild file)
                level3_items = []
                if level2_file and os.path.exists(level2_file):
                    level2_layers = read_layers_from_md(level2_file)
                    level3_content = [item[0] for item in level2_layers if item[1] == 1]  # # items from grandchild file
                    
                    # Convert level2_file to hierarchy key for child lookup (cross-platform)
                    if level2_file.startswith(data_path + os.sep) or level2_file.startswith('../data/'):
                        level2_relative = level2_file[len(data_path) + 1:] if level2_file.startswith(data_path + os.sep) else level2_file[8:]
                    elif level2_file.startswith(pdata_path + os.sep) or level2_file.startswith('../pdata/'):
                        level2_relative = level2_file[len(pdata_path) + 1:] if level2_file.startswith(pdata_path + os.sep) else level2_file[9:]
                    else:
                        level2_relative = level2_file
                    level2_hierarchy_key = os.path.splitext(level2_relative.replace('\\', '/'))[0]
                    
                    # Build level3 items with file information
                    for level3_name in level3_content:
                        # Find corresponding file for this level3 item
                        level3_file = None
                        if level2_hierarchy_key in file_hierarchy:
                            # Normalize the level3_name the same way as display_name is created
                            normalized_level3 = level3_name.replace('-', ' ').lower()
                            for child in file_hierarchy[level2_hierarchy_key]['children']:
                                if child['display_name'].lower() == normalized_level3:
                                    level3_file = child['filename']
                                    break
                        
                        level3_items.append({
                            "name": level3_name,
                            "filename": level3_file,
                            "deadline": extract_deadline_from_md(level3_file)
                        })
                
                level2_items.append({
                    "name": level2_name,
                    "filename": level2_file,
                    "deadline": extract_deadline_from_md(level2_file),
                    "layer3": level3_items
                })
        
        # Add the level1 item even if it has no children (but include file info)
        data.append({
            "layer1": level1_name,
            "layer1_filename": level1_file,
            "layer1_deadline": extract_deadline_from_md(level1_file),
            "layer2": level2_items
        })
    
    return data

import os
import sys

# HTML caching logic
if len(sys.argv) > 1:
    md_file = sys.argv[1]
else:
    md_file = os.path.join("..", "data", "main.md")

html_dir = "../html"
base_name = os.path.splitext(os.path.basename(md_file))[0]
html_path = os.path.join(html_dir, f"{base_name}.html")

# Create html directory if it doesn't exist
os.makedirs(html_dir, exist_ok=True)

# Function to create file association mapping dynamically
def get_file_association_dynamic(layer1_name, layer2_name, current_file):
    """Dynamically map layer2 items to their associated markdown files based on current context"""
    hierarchy = build_hierarchy_from_files()
    base_name = os.path.splitext(os.path.basename(current_file))[0]
    
    # If we're at main level, find the file for the layer2 item
    if base_name == 'main':
        # Look for direct children of main that match layer2_name
        if 'main' in hierarchy:
            for child in hierarchy['main']['children']:
                if child['display_name'].lower() == layer2_name.lower():
                    return child['filename']
    else:
        # Look for children of current file that match layer2_name
        if base_name in hierarchy:
            for child in hierarchy[base_name]['children']:
                if child['display_name'].lower() == layer2_name.lower():
                    return child['filename']
    
    return None

def check_file_exists(file_path):
    """Check if a file exists in data or pdata directories"""
    if not file_path:
        return False
    
    # If it's already a full path (contains ../), use it directly
    if '../' in file_path:
        return os.path.exists(file_path)
    
    # Otherwise, search in both directories
    found_path = find_file_in_directories(file_path)
    return found_path is not None

def generate_html_graph(data, output_path, parent_file=None, breadcrumb_path=None):
    """Generate an interactive HTML graph"""
    if breadcrumb_path is None:
        breadcrumb_path = []

    # Create breadcrumb navigation
    breadcrumb_html = ""
    if breadcrumb_path:
        breadcrumb_html = '<div class="breadcrumb">'
        for i, (name, file) in enumerate(breadcrumb_path):
            if i < len(breadcrumb_path) - 1:
                breadcrumb_html += f'<a href="#" onclick="loadGraph(\'{file}\')">{name}</a> > '
            else:
                breadcrumb_html += f'<span class="current">{name}</span>'
        breadcrumb_html += '</div>'

    html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .graph-container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .layer1 {
            font-size: 16px;
            font-weight: bold;
            color: #333;
            display: inline-block;
            vertical-align: top;
            margin-right: 30px;
            min-width: 80px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background-color 0.2s;
        }
        .layer1.clickable:hover {
            background-color: #e0e0e0;
        }
        .layer1:not(.clickable) {
            cursor: default;
        }
        .layer2 {
            font-size: 14px;
            font-weight: normal;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background-color 0.2s;
            display: block;
            margin-bottom: 4px;
            min-width: 80px;
        }
        .layer2.clickable {
            font-weight: bold;
        }
        .layer2.color-group-green:hover {
            background-color: #A5D6A7;
        }
        .layer2.color-group-blue:hover {
            background-color: #90CAF9;
        }
        .layer2.color-group-purple:hover {
            background-color: #CE93D8;
        }
        .layer2.color-group-red:hover {
            background-color: #FFAB91;
        }
        .layer2.clickable {
            border: 0px dashed #2196f3;
        }
        .layer2.clickable.color-group-green:hover {
            background-color: #A5D6A7;
            border-color: #388E3C;
        }
        .layer2.clickable.color-group-blue:hover {
            background-color: #90CAF9;
            border-color: #1976D2;
        }
        .layer2.clickable.color-group-purple:hover {
            background-color: #CE93D8;
            border-color: #8E24AA;
        }
        .layer2.clickable.color-group-red:hover {
            background-color: #FFAB91;
            border-color: #D84315;
        }
        .layer2:not(.clickable) {
            cursor: default;
        }
        .layer2:not(.clickable):hover {
            background-color: transparent;
        }
        .deadline {
            color: #000;
            font-style: italic;
            margin-top: 2px;
            padding: 2px 8px;
            display: block;
            font-weight: normal;
        }
        .layer1-deadline {
            font-size: 13px;
        }
        .layer2-deadline {
            font-size: 12px;
        }
        .layer3 {
            font-size: 14px;
            color: #333;
            font-weight: normal;
            display: inline-block;
            margin-right: 15px;
            vertical-align: top;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
        }
        .layer3.clickable {
            font-weight: bold;
        }
        .layer3.clickable:hover {
            background-color: #f0f0f0;
            color: #333;
        }
        .layer3:not(.clickable) {
            cursor: default;
        }
        .underline {
            height: 2px;
            margin-top: 2px;
            margin-bottom: 4px;
        }
        .color-green-light { background-color: #A5D6A7; }
        .color-green-medium { background-color: #388E3C; }
        .color-green-dark { background-color: #1B5E20; }
        .color-blue-light { background-color: #90CAF9; }
        .color-blue-medium { background-color: #1976D2; }
        .color-blue-dark { background-color: #0D47A1; }
        .color-purple-light { background-color: #CE93D8; }
        .color-purple-medium { background-color: #8E24AA; }
        .color-purple-dark { background-color: #4A148C; }
        .color-red-light { background-color: #FFAB91; }
        .color-red-medium { background-color: #D84315; }
        .color-red-dark { background-color: #BF360C; }
        .section {
            margin-bottom: 15px;
            display: flex;
            align-items: flex-start;
        }
        .layer1-container {
            display: flex;
            flex-direction: column;
            margin-right: 30px;
            flex-shrink: 0;
        }
        .layer2-section {
            display: flex;
            flex-direction: column;
        }
        .layer2-container {
            margin-bottom: 7px;
            display: flex;
            align-items: flex-start;
        }
        .layer2-content {
            margin-right: 10px;
            flex-shrink: 0;
        }
        .layer3-container {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
        }
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4caf50;
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            display: none;
            z-index: 1000;
        }
        .notification.error {
            background: #f44336;
        }
        .breadcrumb {
            margin-bottom: 20px;
            padding: 10px;
            background: #f0f0f0;
            border-radius: 4px;
            font-size: 14px;
        }
        .breadcrumb a {
            color: #1976d2;
            text-decoration: none;
            cursor: pointer;
        }
        .breadcrumb a:hover {
            text-decoration: underline;
        }
        .breadcrumb .current {
            font-weight: bold;
            color: #333;
        }
        .back-button {
            display: inline-block;
            margin-bottom: 20px;
            padding: 8px 16px;
            background: #1976d2;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            cursor: pointer;
            border: none;
            font-size: 14px;
        }
        .back-button:hover {
            background: #1565c0;
        }
    </style>
</head>
<body>
    <div class="graph-container">
        """ + breadcrumb_html + """
"""

    # Color mapping
    base_colors = [
        ("green", "#A5D6A7", "#388E3C", "#1B5E20"),
        ("blue", "#90CAF9", "#1976D2", "#0D47A1"),
        ("purple", "#CE93D8", "#8E24AA", "#4A148C"),
        ("red", "#FFAB91", "#D84315", "#BF360C"),
    ]

    for idx, item in enumerate(data):
        color_name, light, medium, dark = base_colors[idx % 4]
        layer1_name = item["layer1"]
        layer1_filename = item.get("layer1_filename")
        layer1_file_exists = check_file_exists(layer1_filename)
        
        # Make layer1 clickable if file exists
        layer1_clickable_class = "clickable" if layer1_file_exists else ""
        layer1_onclick = f"onclick=\"navigateToSubGraph('{layer1_filename}', '', '{layer1_name}')\"" if layer1_file_exists else ""

        # Get layer1 deadline
        layer1_deadline = item.get("layer1_deadline")
        layer1_deadline_html = f'<div class="deadline layer1-deadline">{layer1_deadline}</div>' if layer1_deadline else ""

        html_content += f"""
        <div class="section">
            <div class="layer1-container">
                <div class="layer1 {layer1_clickable_class}" {layer1_onclick}>{layer1_name}</div>
                {layer1_deadline_html}
                <div class="underline color-{color_name}-medium"></div>
            </div>
            <div class="layer2-section">
"""

        for layer2_item in item["layer2"]:
            layer2_name = layer2_item["name"]
            # Use the filename directly from the layer2_item if available
            file_path = layer2_item.get("filename") or get_file_association_dynamic(layer1_name, layer2_name, parent_file or "main.md")
            file_exists = check_file_exists(file_path)

            # Only make clickable if file exists
            clickable_class = "clickable" if file_exists else ""
            onclick_handler = f"onclick=\"navigateToSubGraph('{file_path}', '{layer1_name}', '{layer2_name}')\"" if file_exists else ""
            
            # Get layer2 deadline
            layer2_deadline = layer2_item.get("deadline")
            layer2_deadline_html = f'<div class="deadline layer2-deadline">{layer2_deadline}</div>' if layer2_deadline else ""

            html_content += f"""
                <div class="layer2-container">
                    <div class="layer2-content">
                        <div class="layer2 {clickable_class} color-group-{color_name}" {onclick_handler}>{layer2_name}</div>
                        {layer2_deadline_html}
                        <div class="underline color-{color_name}-light"></div>
                    </div>
                    <div class="layer3-container">
"""

            for layer3_item in layer2_item["layer3"]:
                if isinstance(layer3_item, dict):
                    # New structure with filename
                    layer3_name = layer3_item["name"]
                    layer3_filename = layer3_item.get("filename")
                    layer3_file_exists = check_file_exists(layer3_filename)
                    layer3_clickable_class = "clickable" if layer3_file_exists else ""
                    layer3_onclick = f"onclick=\"navigateToSubGraph('{layer3_filename}', '{layer2_name}', '{layer3_name}')\"" if layer3_file_exists else ""
                    html_content += f'<span class="layer3 {layer3_clickable_class}" {layer3_onclick}>{layer3_name}</span>'
                else:
                    # Old structure (string only) - keep for backward compatibility
                    html_content += f'<span class="layer3">{layer3_item}</span>'

            html_content += """
                    </div>
                </div>
"""

        html_content += """
            </div>
        </div>"""

    html_content += """
    </div>
    <div id="notification" class="notification"></div>

    <script>
        function showNotification(message, isError = false) {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.className = 'notification' + (isError ? ' error' : '');
            notification.style.display = 'block';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000);
        }

        function showFileNotAvailable(layer2Name) {
            showNotification(`File not available for ${layer2Name}`, true);
        }

        function navigateToSubGraph(filePath, layer1Name, layer2Name) {
            if (!filePath) {
                showNotification(`No file associated with ${layer2Name}`, true);
                return;
            }

            // Extract just the filename from the path and convert to HTML (cross-platform)
            const fileName = filePath.replace(/\\\\/g, '/').split('/').pop(); // Handle both / and \\ separators
            const subGraphName = fileName.replace('.md', '.html');

            // Navigate to the sub-graph in the html directory
            window.location.href = subGraphName;
        }

        function loadGraph(filePath) {
            window.location.href = filePath;
        }
    </script>
</body>
</html>"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)

def get_parent_file_info_dynamic(file_name):
    """Dynamically determine parent file and navigation info based on file name hierarchy"""
    base_name = os.path.splitext(file_name)[0]
    
    if base_name == 'main':
        return [("Main", None)]
    
    # Build breadcrumb by walking up the hierarchy
    breadcrumb = []
    current = base_name
    
    # Walk up the hierarchy by removing underscores
    hierarchy_path = []
    while current and current != 'main':
        parts = current.split('_')
        display_name = parts[-1].replace('-', ' ').title()
        hierarchy_path.append((display_name, f"{current}.html"))
        
        if len(parts) == 1:
            # This is a level 1 file, parent is main
            hierarchy_path.append(("Main", "main.html"))
            break
        else:
            # Move up one level
            current = '_'.join(parts[:-1])
    
    # Reverse to get correct order (from root to current)
    hierarchy_path.reverse()
    
    # Remove the last item (current file) as it shouldn't be clickable
    if hierarchy_path:
        hierarchy_path[-1] = (hierarchy_path[-1][0], None)
    
    return hierarchy_path if hierarchy_path else [("Main", "main.html"), (base_name.replace('_', ' ').title(), None)]

def generate_all_subgraphs():
    """Generate HTML files for all available markdown files"""

    # Get all markdown files from both data and pdata directories
    md_file_paths = get_markdown_files_from_directories()
    
    # Filter out main.md
    md_file_paths = [f for f in md_file_paths if not f.endswith('main.md')]

    html_dir = "../html"
    os.makedirs(html_dir, exist_ok=True)

    for md_file_path in md_file_paths:
        try:
            # Extract just the filename for certain operations
            md_file = os.path.basename(md_file_path)
            
            data = parse_md_hierarchy(md_file_path)
            if data:  # Only generate if file has content
                base_name = os.path.splitext(md_file)[0]
                html_path = os.path.join(html_dir, f"{base_name}.html")

                # Create proper breadcrumb navigation using dynamic function
                breadcrumb = get_parent_file_info_dynamic(md_file)

                generate_html_graph(data, html_path, parent_file=md_file, breadcrumb_path=breadcrumb)
                print(f"Generated sub-graph: {html_path}")

        except Exception as e:
            print(f"Error generating sub-graph for {md_file_path}: {e}")

# Generate HTML graph
data = parse_md_hierarchy(md_file)

# Check if this is a sub-graph request
if len(sys.argv) > 2 and sys.argv[2] == "subgraph":
    parent_name = sys.argv[3] if len(sys.argv) > 3 else "Main"
    breadcrumb = [("Main", "main.html"), (parent_name, None)]
    generate_html_graph(data, html_path, parent_file=md_file, breadcrumb_path=breadcrumb)
else:
    generate_html_graph(data, html_path)

    # Also generate sub-graphs for associated files
    print("Generating sub-graphs...")
    generate_all_subgraphs()

print(f"Interactive graph saved to {html_path}")
