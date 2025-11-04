"""
HTML generator for the YAML-based graph application.
Handles HTML generation, styling, and JavaScript functionality.
"""
import os
from file_utils import FileUtils


class HTMLGenerator:
    """Generates interactive HTML graphs from YAML-based hierarchy data."""
    
    def __init__(self):
        self.file_utils = FileUtils()
    
    def generate_html_graph(self, data, output_path, current_item_id="data", breadcrumb_path=None):
        """Generate an interactive HTML graph."""
        if breadcrumb_path is None:
            breadcrumb_path = []

        # Create breadcrumb navigation
        breadcrumb_html = self._create_breadcrumb_html(breadcrumb_path)
        
        # Generate the complete HTML content
        html_content = self._build_html_structure(data, breadcrumb_html, current_item_id)
        
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
    
    def _build_html_structure(self, data, breadcrumb_html, current_item_id):
        """Build the complete HTML structure."""
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge Graph - {current_item_id.replace('_', ' ').title()}</title>
    <style>
        {self._get_css_styles()}
    </style>
</head>
<body>
    <div class="graph-container">
        {breadcrumb_html}
        {self._build_content_sections(data, current_item_id)}
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

        function navigateToItem(itemId) {
            if (!itemId) {
                showNotification('No item ID provided', true);
                return;
            }

            // Navigate to the item's HTML page
            const htmlFileName = itemId + '.html';
            window.location.href = htmlFileName;
        }

        function loadGraph(filePath) {
            // Navigate to breadcrumb target
            window.location.href = filePath;
        }
        """
    
    def _build_content_sections(self, data, current_item_id):
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
            content += self._build_layer1_section(item, color_name, current_item_id)

        return content
    
    def _build_layer1_section(self, item, color_name, current_item_id):
        """Build a layer1 section with all its children."""
        layer1_name = item["layer1"]
        layer1_id = item.get("layer1_id", "")
        layer1_has_children = len(item.get("layer2", [])) > 0
        
        # Make layer1 clickable if it has children or is a valid item
        layer1_clickable_class = "clickable" if layer1_has_children else ""
        layer1_onclick = f"onclick=\"navigateToItem('{layer1_id}')\"" if layer1_id else ""

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

        for layer2_item in item.get("layer2", []):
            content += self._build_layer2_section(layer2_item, layer1_name, color_name, current_item_id)

        content += """
            </div>
        </div>"""
        
        return content
    
    def _build_layer2_section(self, layer2_item, layer1_name, color_name, current_item_id):
        """Build a layer2 section with its layer3 children."""
        layer2_name = layer2_item["name"]
        layer2_id = layer2_item.get("id", "")
        layer2_has_children = len(layer2_item.get("layer3", [])) > 0

        # Only make clickable if it has an ID
        clickable_class = "clickable" if layer2_id else ""
        onclick_handler = f"onclick=\"navigateToItem('{layer2_id}')\"" if layer2_id else ""
        
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

        for layer3_item in layer2_item.get("layer3", []):
            content += self._build_layer3_item(layer3_item, layer2_name)

        content += """
                    </div>
                </div>
        """
        return content
    
    def _build_layer3_item(self, layer3_item, layer2_name):
        """Build a single layer3 item."""
        if isinstance(layer3_item, dict):
            # New structure with ID
            layer3_name = layer3_item["name"]
            layer3_id = layer3_item.get("id", "")
            layer3_clickable_class = "clickable" if layer3_id else ""
            layer3_onclick = f"onclick=\"navigateToItem('{layer3_id}')\"" if layer3_id else ""
            return f'<span class="layer3 {layer3_clickable_class}" {layer3_onclick}>{layer3_name}</span>'
        else:
            # Old structure (string only) - keep for backward compatibility
            return f'<span class="layer3">{layer3_item}</span>'