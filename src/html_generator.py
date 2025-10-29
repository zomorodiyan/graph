"""
HTML generator for the graph application.
Handles HTML generation, styling, and JavaScript functionality.
"""
import os
from file_utils import FileUtils


class HTMLGenerator:
    """Generates interactive HTML graphs from hierarchy data."""
    
    def __init__(self):
        self.file_utils = FileUtils()
    
    def generate_html_graph(self, data, output_path, parent_file=None, breadcrumb_path=None):
        """Generate an interactive HTML graph."""
        if breadcrumb_path is None:
            breadcrumb_path = []

        # Create breadcrumb navigation
        breadcrumb_html = self._create_breadcrumb_html(breadcrumb_path)
        
        # Generate the complete HTML content
        html_content = self._build_html_structure(data, breadcrumb_html, parent_file)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
    
    def _create_breadcrumb_html(self, breadcrumb_path):
        """Create breadcrumb navigation HTML."""
        if not breadcrumb_path:
            return ""
        
        breadcrumb_html = '<div class="breadcrumb">'
        for i, (name, file) in enumerate(breadcrumb_path):
            if i < len(breadcrumb_path) - 1:
                breadcrumb_html += f'<a href="#" onclick="loadGraph(\'{file}\')">{name}</a> > '
            else:
                breadcrumb_html += f'<span class="current">{name}</span>'
        breadcrumb_html += '</div>'
        return breadcrumb_html
    
    def _build_html_structure(self, data, breadcrumb_html, parent_file):
        """Build the complete HTML structure."""
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        {self._get_css_styles()}
    </style>
</head>
<body>
    <div class="graph-container">
        {breadcrumb_html}
        {self._build_content_sections(data, parent_file)}
    </div>
    <div id="notification" class="notification"></div>
    <script>
        {self._get_javascript_functions()}
    </script>
</body>
</html>"""
        return html_content
    
    def _get_css_styles(self):
        """Get CSS styles for the HTML page."""
        return """
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
        .context {
            color: #000;
            font-style: italic;
            margin-top: 2px;
            padding: 2px 8px;
            display: block;
            font-weight: normal;
        }
        .layer1-context {
            font-size: 13px;
        }
        .layer2-context {
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
        
        /* Responsive layout for narrow screens */
        @media (max-width: 500px) {
            .section {
                flex-direction: column;
            }
            .layer1-container {
                margin-right: 0;
                margin-bottom: 15px;
            }
            .layer2-section {
                width: 100%;
            }
        }
        """
    
    def _get_javascript_functions(self):
        """Get JavaScript functions for the HTML page."""
        return """
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
            const fileName = filePath.replace(/\\\\/g, '/').split('/').pop(); // Handle both / and \\\\ separators
            const subGraphName = fileName.replace('.md', '.html');

            // Navigate to the sub-graph in the html directory
            window.location.href = subGraphName;
        }

        function loadGraph(filePath) {
            window.location.href = filePath;
        }
        """
    
    def _build_content_sections(self, data, parent_file):
        """Build the main content sections of the HTML."""
        content = ""
        
        # Color mapping
        base_colors = [
            ("green", "#A5D6A7", "#388E3C", "#1B5E20"),
            ("blue", "#90CAF9", "#1976D2", "#0D47A1"),
            ("purple", "#CE93D8", "#8E24AA", "#4A148C"),
            ("red", "#FFAB91", "#D84315", "#BF360C"),
        ]

        for idx, item in enumerate(data):
            color_name, light, medium, dark = base_colors[idx % 4]
            content += self._build_layer1_section(item, color_name, parent_file)

        return content
    
    def _build_layer1_section(self, item, color_name, parent_file):
        """Build a layer1 section with all its children."""
        layer1_name = item["layer1"]
        layer1_filename = item.get("layer1_filename")
        layer1_file_exists = self.file_utils.check_file_exists(layer1_filename)
        
        # Make layer1 clickable if file exists
        layer1_clickable_class = "clickable" if layer1_file_exists else ""
        # Normalize path for JavaScript (use forward slashes)
        normalized_layer1_filename = self.file_utils.normalize_path(layer1_filename) if layer1_filename else ''
        layer1_onclick = f"onclick=\"navigateToSubGraph('{normalized_layer1_filename}', '', '{layer1_name}')\"" if layer1_file_exists else ""

        # Get layer1 context
        layer1_context = item.get("layer1_context")
        layer1_context_html = f'<div class="context layer1-context">{layer1_context}</div>' if layer1_context else ""

        content = f"""
        <div class="section">
            <div class="layer1-container">
                <div class="layer1 {layer1_clickable_class}" {layer1_onclick}>{layer1_name}</div>
                {layer1_context_html}
                <div class="underline color-{color_name}-medium"></div>
            </div>
            <div class="layer2-section">
"""

        for layer2_item in item["layer2"]:
            content += self._build_layer2_section(layer2_item, layer1_name, color_name, parent_file)

        content += """
            </div>
        </div>"""
        
        return content
    
    def _build_layer2_section(self, layer2_item, layer1_name, color_name, parent_file):
        """Build a layer2 section with its layer3 children."""
        layer2_name = layer2_item["name"]
        # Use the filename directly from the layer2_item if available
        file_path = layer2_item.get("filename")
        file_exists = self.file_utils.check_file_exists(file_path)

        # Only make clickable if file exists
        clickable_class = "clickable" if file_exists else ""
        # Normalize path for JavaScript (use forward slashes)
        normalized_file_path = self.file_utils.normalize_path(file_path) if file_path else ''
        onclick_handler = f"onclick=\"navigateToSubGraph('{normalized_file_path}', '{layer1_name}', '{layer2_name}')\"" if file_exists else ""
        
        # Get layer2 context
        layer2_context = layer2_item.get("context")
        layer2_context_html = f'<div class="context layer2-context">{layer2_context}</div>' if layer2_context else ""

        content = f"""
                <div class="layer2-container">
                    <div class="layer2-content">
                        <div class="layer2 {clickable_class} color-group-{color_name}" {onclick_handler}>{layer2_name}</div>
                        {layer2_context_html}
                        <div class="underline color-{color_name}-light"></div>
                    </div>
                    <div class="layer3-container">
"""

        for layer3_item in layer2_item["layer3"]:
            content += self._build_layer3_item(layer3_item, layer2_name)

        content += """
                    </div>
                </div>
"""
        return content
    
    def _build_layer3_item(self, layer3_item, layer2_name):
        """Build a single layer3 item."""
        if isinstance(layer3_item, dict):
            # New structure with filename
            layer3_name = layer3_item["name"]
            layer3_filename = layer3_item.get("filename")
            layer3_file_exists = self.file_utils.check_file_exists(layer3_filename)
            layer3_clickable_class = "clickable" if layer3_file_exists else ""
            # Normalize path for JavaScript (use forward slashes)
            normalized_layer3_filename = self.file_utils.normalize_path(layer3_filename) if layer3_filename else ''
            layer3_onclick = f"onclick=\"navigateToSubGraph('{normalized_layer3_filename}', '{layer2_name}', '{layer3_name}')\"" if layer3_file_exists else ""
            return f'<span class="layer3 {layer3_clickable_class}" {layer3_onclick}>{layer3_name}</span>'
        else:
            # Old structure (string only) - keep for backward compatibility
            return f'<span class="layer3">{layer3_item}</span>'
    
    def get_parent_file_info_dynamic(self, file_name):
        """Dynamically determine parent file and navigation info based on file name hierarchy."""
        base_name = os.path.splitext(file_name)[0]
        
        if base_name == 'main':
            return [("Main", None)]
        
        # Build breadcrumb by walking up the hierarchy
        hierarchy_path = []
        current = base_name
        
        # Walk up the hierarchy by removing underscores
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