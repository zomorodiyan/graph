"""
HTML generator for the YAML-based graph application.
Handles HTML generation, styling, and JavaScript functionality.
"""
import os
from datetime import datetime
from file_utils import FileUtils


class HTMLGenerator:
    """Generates interactive HTML graphs from YAML-based hierarchy data."""
    
    def __init__(self):
        self.file_utils = FileUtils()
    
    def _create_progress_underline(self, progress, color_name, intensity):
        """Create an underline element with optional progress visualization.
        
        Args:
            progress: Number between 0-100, or None
            color_name: Color theme (green, blue, purple, red)
            intensity: Color intensity (light, medium, dark)
        
        Returns:
            HTML string for the underline div
        """
        if progress is not None and isinstance(progress, (int, float)) and 0 <= progress <= 100:
            # Map intensity to color values
            color_map = {
                "green": {"light": "#A5D6A7", "medium": "#388E3C", "dark": "#1B5E20"},
                "blue": {"light": "#90CAF9", "medium": "#1976D2", "dark": "#0D47A1"},
                "purple": {"light": "#CE93D8", "medium": "#8E24AA", "dark": "#4A148C"},
                "red": {"light": "#FFAB91", "medium": "#D84315", "dark": "#BF360C"},
            }
            progress_color = color_map.get(color_name, {}).get(intensity, "#388E3C")
            return f'<div class="underline-progress" style="--progress-color: {progress_color}; --progress-color-light: #dddddd; --progress-percent: {progress}%;"></div>'
        else:
            # No progress specified, use solid color underline
            return f'<div class="underline color-{color_name}-{intensity}"></div>'
    
    def _get_progress_text_style(self, progress, color_name, is_clickable=""):
        """Get inline style for progress-based text coloring (used for layer3).
        
        Args:
            progress: Number between 0-100, or None
            color_name: Color theme (green, blue, purple, red)
            is_clickable: Whether the item is clickable (has "clickable" class)
        
        Returns:
            Tuple of (css_class, inline_style) for the text element
        """
        if progress is not None and isinstance(progress, (int, float)) and 0 <= progress <= 100:
            # Map color name to text color (darkest and medium-dark variant)
            text_color_map = {
                "green": ("#0D4F14", "#388E3C"),
                "blue": ("#063A85", "#1976D2"),
                "purple": ("#3A0F6E", "#8E24AA"),
                "red": ("#A12F08", "#D84315"),
            }
            colors = text_color_map.get(color_name, ("#0D4F14", "#388E3C"))
            text_color = colors[0]
            text_color_medium = colors[1]
            # Use different class for clickable items with progress, and include color class for hover
            progress_class = "layer3-progress-clickable" if is_clickable else "layer3-progress"
            return f"{progress_class} color-{color_name}", f"--text-progress-color: {text_color}; --text-progress-color-light: #A0A0A0; --text-progress-percent: {progress}%;"
        else:
            # No progress, use regular color class
            return f"color-{color_name}", ""
    
    def _format_due_date(self, due_date_value):
        """Format due date with appropriate CSS class based on how soon it is."""
        if not due_date_value:
            return ""
        
        try:
            # Handle both string and date object (YAML auto-converts ISO 8601 dates)
            if isinstance(due_date_value, str):
                due_date = datetime.strptime(due_date_value, '%Y-%m-%d').date()
            else:
                # Already a date object
                due_date = due_date_value
            
            today = datetime.now().date()
            days_until = (due_date - today).days
            
            # Determine CSS class
            if days_until < 0:
                css_class = "due-overdue"
                label = "Overdue"
            elif days_until == 0:
                css_class = "due-today"
                label = "Today"
            elif days_until <= 6:
                css_class = "due-soon"
                label = f"in {days_until}d"
            else:
                css_class = "due-later"
                label = due_date.strftime('%b %d')
            
            return f'<span class="due-date {css_class}">{label}</span>'
        except (ValueError, TypeError, AttributeError):
            return ""
    
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
        from datetime import datetime
        current_date = datetime.now().strftime("%B %d, %Y")
        
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
        <div class="pending-actions" id="pendingActions">
            <button id="confirmChangesBtn" class="btn-primary" onclick="confirmQueuedChanges()">Confirm changes</button>
            <button id="cancelChangesBtn" class="btn-secondary" onclick="cancelQueuedChanges()">Cancel changes</button>
        </div>
        {self._build_content_sections(data, current_item_id)}
        <div class="current-date">Updated: {current_date}</div>
    </div>
    <div id="notification" class="notification"></div>
    
    <!-- Edit Modal -->
    <div id="editModal" class="modal">
        <div class="modal-content">
            <h2 id="modalTitle">Edit Item</h2>
            <div class="form-group">
                <label for="editName">Item Name:</label>
                <input type="text" id="editName" placeholder="Item name (key)">
            </div>
            <div class="form-group">
                <label for="editProgress">Progress (0-100):</label>
                <input type="number" id="editProgress" min="0" max="100" placeholder="Leave empty to keep current">
            </div>
            <div class="form-group">
                <label for="editContext">Context:</label>
                <textarea id="editContext" rows="3" placeholder="Leave empty to keep current"></textarea>
            </div>
            <div class="form-group">
                <label for="editDue">Due Date (YYYY-MM-DD):</label>
                <input type="date" id="editDue" placeholder="Leave empty to keep current">
            </div>
            <div class="modal-buttons">
                <button onclick="saveEdit()" class="btn-primary">Save</button>
                <button onclick="closeEditModal()" class="btn-secondary">Cancel</button>
                <button onclick="deleteItem()" id="deleteButton" class="btn-danger" style="display:none;">Delete</button>
            </div>
        </div>
    </div>
    
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
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .layer1 {
            font-size: 16px;
            font-weight: bold;
            color: #222;
            display: inline-block;
            margin-right: 5px;
            cursor: pointer;
            padding: 3px 8px;
            border-radius: 4px;
            transition: background-color 0.2s;
        }
        .layer1:not(.clickable) {
            cursor: default;
        }
        .layer1.color-group-green:hover {
            background-color: rgba(165, 214, 167, 0.5);
        }
        .layer1.color-group-blue:hover {
            background-color: rgba(144, 202, 249, 0.5);
        }
        .layer1.color-group-purple:hover {
            background-color: rgba(206, 147, 216, 0.5);
        }
        .layer1.color-group-red:hover {
            background-color: rgba(255, 171, 145, 0.5);
        }
        .layer2 {
            font-size: 14px;
            font-weight: normal;
            cursor: pointer;
            color: #333;
            padding: 3px 8px;
            border-radius: 4px;
            margin-right: 10px;
            transition: background-color 0.2s;
            display: block;
            margin-bottom: 0px;
            min-width: 30px;
        }
        .layer2.clickable {
            font-weight: bold;
        }
        .layer2.leaf {
            font-weight: bold;
        }
        .layer2.color-green:hover {
            background-color: rgba(165, 214, 167, 0.5);
        }
        .layer2.color-blue:hover {
            background-color: rgba(144, 202, 249, 0.5);
        }
        .layer2.color-purple:hover {
            background-color: rgba(206, 147, 216, 0.5);
        }
        .layer2.color-group-red:hover {
            background-color: rgba(255, 171, 145, 0.5);
        }
        .layer2.clickable {
            border: 0px dashed #2196f3;
        }
        .layer2.clickable.color-group-green:hover {
            background-color: rgba(165, 214, 167, 0.5);
            border-color: #388E3C;
        }
        .layer2.clickable.color-group-blue:hover {
            background-color: rgba(144, 202, 249, 0.5);
            border-color: #1976D2;
        }
        .layer2.clickable.color-group-purple:hover {
            background-color: rgba(206, 147, 216, 0.5);
            border-color: #8E24AA;
        }
        .layer2.clickable.color-group-red:hover {
            background-color: rgba(255, 171, 145, 0.5);
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
            margin-top: 1px;
            padding: 1px 8px;
            display: block;
            font-weight: normal;
        }
        .layer1-context {
            font-size: 13px;
        }
        .layer2-context {
            font-size: 12px;
        }
        .layer3-context {
            font-size: 10px;
            color: #000;
        }
        .layer3 {
            font-size: 12px;
            color: #333;
            font-weight: normal;
            display: block;
            cursor: pointer;
            padding: 1px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
        }
        .layer3.clickable {
            font-weight: bold;
        }
        .layer3:not(.clickable) {
            cursor: default;
        }
        .layer3.color-green { color: #0D4F14; }
        .layer3.color-blue { color: #063A85; }
        .layer3.color-purple { color: #3A0F6E; }
        .layer3.color-red { color: #A12F08; }
        .layer3.color-green:hover { background-color: rgba(165, 214, 167, 0.5); }
        .layer3.color-blue:hover { background-color: rgba(144, 202, 249, 0.5); }
        .layer3.color-purple:hover { background-color: rgba(206, 147, 216, 0.5); }
        .layer3.color-red:hover { background-color: rgba(255, 171, 145, 0.5); }
        .layer3-progress {
            background: linear-gradient(to right, var(--text-progress-color) var(--text-progress-percent), var(--text-progress-color-light) var(--text-progress-percent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            display: inline-block;
            padding: 1px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
        }
        .layer3-progress.color-green:hover {
            background: rgba(165, 214, 167, 0.5);
            -webkit-text-fill-color: #0D4F14;
        }
        .layer3-progress.color-blue:hover {
            background: rgba(144, 202, 249, 0.5);
            -webkit-text-fill-color: #063A85;
        }
        .layer3-progress.color-purple:hover {
            background: rgba(206, 147, 216, 0.5);
            -webkit-text-fill-color: #3A0F6E;
        }
        .layer3-progress.color-red:hover {
            background: rgba(255, 171, 145, 0.5);
            -webkit-text-fill-color: #A12F08;
        }
        .layer3-progress-clickable {
            background: linear-gradient(to right, var(--text-progress-color) var(--text-progress-percent), var(--text-progress-color-light) var(--text-progress-percent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            font-weight: bold;
            cursor: pointer;
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
        }
        .layer3-progress-clickable.color-green:hover {
            background: rgba(165, 214, 167, 0.5);
            -webkit-text-fill-color: #0D4F14;
        }
        .layer3-progress-clickable.color-blue:hover {
            background: rgba(144, 202, 249, 0.5);
            -webkit-text-fill-color: #063A85;
        }
        .layer3-progress-clickable.color-purple:hover {
            background: rgba(206, 147, 216, 0.5);
            -webkit-text-fill-color: #3A0F6E;
        }
        .layer3-progress-clickable.color-red:hover {
            background: rgba(255, 171, 145, 0.5);
            -webkit-text-fill-color: #A12F08;
        }
        .underline {
            height: 2px;
            margin-top: 0px;
            margin-bottom: 1px;
            display: block;
            width: 100%;
            line-height: 0;
            font-size: 0;
            overflow: hidden;
            opacity: 0.6;
        }
        .underline-progress {
            height: 2px;
            margin-top: 0px;
            margin-bottom: 1px;
            display: block;
            width: 100%;
            line-height: 0;
            font-size: 0;
            overflow: hidden;
            background: linear-gradient(to right, var(--progress-color) var(--progress-percent), var(--progress-color-light) var(--progress-percent));
            opacity: 0.6;
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
            margin-bottom: 10px;
            display: flex;
            align-items: flex-start;
        }
        .layer1-container {
            display: flex;
            flex-direction: column;
            margin-right: 15px;
            flex-shrink: 0;
        }
        .layer2-section {
            display: flex;
            flex-direction: column;
        }
        .layer2-container {
            margin-bottom: 2px;
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
        .layer3-item {
            margin-right: 15px;
            margin-bottom: 1px;
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
        .modal {
            display: none;
            position: fixed;
            z-index: 2000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.1);
            align-items: center;
            justify-content: center;
        }
        .modal-content {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .modal-content h2 {
            margin-top: 0;
            color: #333;
        }
        .form-group {
            margin-bottom: 15px;
        }
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #555;
        }
        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }
        .form-group input:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: #1976d2;
        }
        .modal-buttons {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 20px;
        }
        .btn-primary,
        .btn-secondary {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .btn-primary {
            background-color: #1976d2;
            color: white;
        }
        .btn-primary:hover {
            background-color: #1565c0;
        }
        .btn-secondary {
            background-color: #f0f0f0;
            color: #333;
        }
        .btn-secondary:hover {
            background-color: #e0e0e0;
        }
        .btn-danger {
            background-color: #e53935;
            color: white;
        }
        .btn-danger:hover {
            background-color: #c62828;
        }
        /* Pending actions toolbar */
        .pending-actions {
            margin: 10px 0 15px 0;
            display: none; /* shown when there are queued changes */
            gap: 8px;
        }
        /* Soft-delete styling */
        .deleted {
            color: #c62828;
            text-decoration: line-through;
            opacity: 0.9;
        }
        /* Pending add styling */
        .pending-add::after {
            content: " *";
            color: #ef6c00;
            font-weight: bold;
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
        .current-date {
            margin-top: 20px;
            padding: 5px 10px;
            background: #f8f8f8;
            border-radius: 4px;
            font-size: 12px;
            color: #666;
            text-align: right;
        }
        .due-date {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            display: inline-block;
            margin-left: 8px;
            font-weight: normal;
        }
        .due-overdue {
            background-color: #ffebee;
            color: #c62828;
        }
        .due-today {
            background-color: #fff3e0;
            color: #ef6c00;
        }
        .due-soon {
            background-color: #e8f5e9;
            color: #2e7d32;
        }
        .due-later {
            background-color: #e3f2fd;
            color: #1565c0;
        }
        .item-path {
            font-size: 11px;
            color: #666;
            font-style: italic;
            margin-top: 2px;
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
        // Queues for pending changes in current session
        const pendingAdds = []; // { parentPath, payload: {name, progress, context, due} }
        const pendingDeletes = new Set(); // itemPath strings

        function updatePendingActionsVisibility() {
            const hasChanges = pendingAdds.length > 0 || pendingDeletes.size > 0;
            const bar = document.getElementById('pendingActions');
            if (bar) {
                bar.style.display = hasChanges ? 'flex' : 'none';
            }
        }
        let longPressTimer;
        let longPressTarget;
        const LONG_PRESS_DURATION = 800; // milliseconds
        
        // Long press handling for edit
        document.addEventListener('mousedown', function(e) {
            const itemElement = e.target.closest('[data-item-path], [data-new-item]');
            if (itemElement) {
                longPressTarget = itemElement;
                longPressTimer = setTimeout(() => {
                    openEditModal(itemElement);
                }, LONG_PRESS_DURATION);
            }
        });
        
        document.addEventListener('mouseup', function() {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        
        document.addEventListener('mousemove', function() {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        
        // Touch support for mobile
        document.addEventListener('touchstart', function(e) {
            const itemElement = e.target.closest('[data-item-path], [data-new-item]');
            if (itemElement) {
                longPressTarget = itemElement;
                longPressTimer = setTimeout(() => {
                    openEditModal(itemElement);
                }, LONG_PRESS_DURATION);
            }
        });
        
        document.addEventListener('touchend', function() {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        
        document.addEventListener('touchmove', function() {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        
        function openEditModal(element) {
            const isNew = element.hasAttribute('data-new-item');
            const modal = document.getElementById('editModal');
            const modalTitle = document.getElementById('modalTitle');
            const nameInput = document.getElementById('editName');
            const progressInput = document.getElementById('editProgress');
            const contextInput = document.getElementById('editContext');
            const dueInput = document.getElementById('editDue');
            const deleteBtn = document.getElementById('deleteButton');
            
            if (isNew) {
                const parentPath = element.getAttribute('data-parent-path') || '';
                const parentName = element.getAttribute('data-parent-name') || 'this parent';
                modalTitle.textContent = 'Add new item under ' + parentName.replaceAll('_', ' ');
                nameInput.value = '';
                progressInput.value = '';
                contextInput.value = '';
                dueInput.value = '';
                modal.removeAttribute('data-editing-path');
                modal.setAttribute('data-parent-path', parentPath);
                modal.setAttribute('data-mode', 'create');
                modal.setAttribute('data-has-children', 'false');
                if (deleteBtn) deleteBtn.style.display = 'none';
            } else {
                const itemPath = element.getAttribute('data-item-path');
                const itemName = element.getAttribute('data-item-name');
                const currentProgress = element.getAttribute('data-progress') || '';
                const currentContext = element.getAttribute('data-context') || '';
                const currentDue = element.getAttribute('data-due') || '';
                const hasChildren = element.getAttribute('data-has-children') === 'true';
                
                modalTitle.textContent = 'Edit: ' + itemName;
                nameInput.value = itemName;
                progressInput.value = currentProgress;
                contextInput.value = currentContext;
                dueInput.value = currentDue;
                
                modal.setAttribute('data-editing-path', itemPath);
                modal.removeAttribute('data-parent-path');
                modal.setAttribute('data-mode', 'edit');
                modal.setAttribute('data-has-children', hasChildren ? 'true' : 'false');
                if (deleteBtn) deleteBtn.style.display = 'inline-block';
            }
            
            modal.style.display = 'flex';
        }
        
        function closeEditModal() {
            document.getElementById('editModal').style.display = 'none';
        }
        
        async function saveEdit() {
            const modal = document.getElementById('editModal');
            const mode = modal.getAttribute('data-mode') || 'edit';
            const itemPath = modal.getAttribute('data-editing-path');
            const parentPath = modal.getAttribute('data-parent-path');
            const name = document.getElementById('editName').value;
            const progress = document.getElementById('editProgress').value;
            const context = document.getElementById('editContext').value;
            const due = document.getElementById('editDue').value;
            
            const payload = {
                name: name || null,
                progress: progress ? parseInt(progress) : null,
                context: context || null,
                due: due || null
            };
            
            try {
                let response;
                if (mode === 'create') {
                    // Queue add instead of persisting immediately
                    if (!name) {
                        showNotification('Name is required to create an item', true);
                        return;
                    }
                    pendingAdds.push({ parentPath: parentPath || 'root', payload });
                    // Add a temporary visual item under the parent if possible
                    try {
                        let parentEl = parentPath ? document.querySelector(`[data-item-path="${parentPath}"]`) : null;
                        const temp = document.createElement('div');
                        temp.className = 'layer3 pending-add';
                        temp.textContent = name;
                        if (parentEl) {
                            const section = parentEl.closest('.section, .layer2-container');
                            let targetList = section ? section.querySelector('.layer3-container') : null;
                            if (!targetList && section) targetList = section.querySelector('.layer2-section');
                            if (targetList) targetList.appendChild(temp);
                            else document.querySelector('.graph-container').appendChild(temp);
                        } else {
                            document.querySelector('.graph-container').appendChild(temp);
                        }
                    } catch (e) {
                        console.warn('Could not render pending add:', e);
                    }
                    updatePendingActionsVisibility();
                    closeEditModal();
                    showNotification('Queued new item. Confirm to save, or Cancel to revert.');
                    return;
                } else {
                    response = await fetch(`http://localhost:8000/api/items/${itemPath}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(payload)
                    });
                }
                
                if (!response.ok) {
                    const responseText = await response.text();
                    throw new Error(`Failed to save: ${response.status} - ${responseText}`);
                }
                
                closeEditModal();
                showNotification('Saved successfully! Reloading...');
                
                // Reload page to show updates
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
                
            } catch (error) {
                showNotification('Error saving: ' + error.message, true);
                console.error('Save error:', error);
            }
        }
        
        function queueDelete(itemPath) {
            if (!itemPath) {
                showNotification('Nothing to delete', true);
                return;
            }
            pendingDeletes.add(itemPath);
            const allItems = document.querySelectorAll('[data-item-path]');
            allItems.forEach(el => {
                const p = el.getAttribute('data-item-path') || '';
                if (p === itemPath || p.startsWith(itemPath + '.')) {
                    el.classList.add('deleted');
                }
            });
            updatePendingActionsVisibility();
            showNotification('Queued delete. Confirm to apply, or Cancel to revert.');
        }

        async function deleteItem() {
            const modal = document.getElementById('editModal');
            const itemPath = modal.getAttribute('data-editing-path');
            if (!itemPath) {
                showNotification('Nothing to delete', true);
                return;
            }
            queueDelete(itemPath);
            closeEditModal();
        }
        
        // Close modal when clicking outside
        document.getElementById('editModal')?.addEventListener('click', function(e) {
            if (e.target === this) {
                closeEditModal();
            }
        });
        
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
        
        async function confirmQueuedChanges() {
            try {
                for (const itemPath of pendingDeletes) {
                    const res = await fetch(`http://localhost:8000/api/items/${itemPath}`, { method: 'DELETE' });
                    if (!res.ok) {
                        const t = await res.text();
                        throw new Error(`Failed to delete ${itemPath}: ${res.status} ${t}`);
                    }
                }
                for (const add of pendingAdds) {
                    const url = `http://localhost:8000/api/items/${add.parentPath}`;
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(add.payload)
                    });
                    if (!res.ok) {
                        const t = await res.text();
                        throw new Error(`Failed to add under ${add.parentPath}: ${res.status} ${t}`);
                    }
                }
                pendingDeletes.clear();
                pendingAdds.splice(0, pendingAdds.length);
                updatePendingActionsVisibility();
                showNotification('Changes saved. Reloading...');
                setTimeout(() => { window.location.reload(); }, 800);
            } catch (err) {
                showNotification('Error confirming changes: ' + err.message, true);
            }
        }
        
        function cancelQueuedChanges() {
            document.querySelectorAll('.deleted').forEach(el => el.classList.remove('deleted'));
            document.querySelectorAll('.pending-add').forEach(el => el.remove());
            pendingDeletes.clear();
            pendingAdds.splice(0, pendingAdds.length);
            updatePendingActionsVisibility();
            showNotification('Reverted pending changes.');
        }
        """
    
    def _build_content_sections(self, data, current_item_id):
        """Build the main content sections of the HTML."""
        content = ""
        
        # Color mapping
        base_colors = [
            ("green", "#A5D6A7", "#388E3C", "#1B5E20"),
            ("blue", "#90CAF9", "#1976D2", "#0D47A1"),
            ("red", "#FFAB91", "#D84315", "#BF360C"),
            ("purple", "#CE93D8", "#8E24AA", "#4A148C"),
        ]

        for idx, item in enumerate(data):
            color_name = base_colors[idx % 4][0]  # Only get the color name
            content += self._build_layer1_section(item, color_name)

        # Add a grayed-out "New item" placeholder after all level 1 items
        parent_path = current_item_id.replace('_', '.') if current_item_id else ""
        content += f"""
        <div class=\"section\">
            <div class=\"layer1-container\">
                <div class=\"layer1 new-item placeholder\" data-new-item=\"true\" data-parent-path=\"{parent_path}\" data-parent-name=\"{current_item_id}\">New item</div>
                <div class=\"underline\" style=\"background-color:#e0e0e0;\"></div>
                <div class=\"context layer1-context new-item-hint\">Long-press to add</div>
            </div>
        </div>"""

        return content
    
    def _build_layer1_section(self, item, color_name):
        """Build a layer1 section with all its children."""
        layer1_name = item["layer1"]
        layer1_id = item.get("layer1_id", "")
        layer1_has_children = len(item.get("layer2", [])) > 0
        
        # Make layer1 clickable only if it has children (is not a leaf node)
        layer1_is_leaf = self.file_utils.is_leaf_node(layer1_id) if layer1_id else True
        layer1_clickable_class = "clickable" if layer1_has_children and not layer1_is_leaf else ""
        layer1_onclick = f"onclick=\"navigateToItem('{layer1_id}')\"" if layer1_id and not layer1_is_leaf else ""
        layer1_color_class = f"color-group-{color_name}"

        # Get layer1 context and due date
        layer1_context = item.get("layer1_context")
        layer1_context_html = f'<div class="context layer1-context">{layer1_context}</div>' if layer1_context else ""
        
        layer1_due = item.get("layer1_due")
        layer1_due_html = self._format_due_date(layer1_due) if layer1_due else ""
        
        layer1_path = item.get("layer1_path")
        layer1_path_html = f'<div class="item-path">{layer1_path}</div>' if layer1_path else ""
        
        # Get progress and create underline
        layer1_progress = item.get("layer1_progress")
        layer1_underline = self._create_progress_underline(layer1_progress, color_name, "medium")
        
        # Data attributes for editing
        layer1_data_path = layer1_id.replace('_', '.') if layer1_id else ""
        layer1_data_attrs = f'data-item-path="{layer1_data_path}" data-item-name="{layer1_name}" data-has-children="{str(bool(layer1_has_children)).lower()}"'
        if layer1_progress is not None:
            layer1_data_attrs += f' data-progress="{layer1_progress}"'
        if layer1_context:
            layer1_data_attrs += f' data-context="{layer1_context}"'
        if layer1_due:
            layer1_data_attrs += f' data-due="{layer1_due}"'

        content = f"""
        <div class="section">
            <div class="layer1-container">
                <div class="layer1 {layer1_clickable_class} {layer1_color_class}" {layer1_onclick} {layer1_data_attrs}>{layer1_name}{layer1_due_html}</div>
                {layer1_underline}
                {layer1_context_html}
                {layer1_path_html}
            </div>
            <div class="layer2-section">
        """

        for layer2_item in item.get("layer2", []):
            content += self._build_layer2_section(layer2_item, color_name)

        # Add "New subitem" placeholder for leaf level1 items (items with no children)
        if not layer1_has_children:
            layer1_path_for_placeholder = layer1_data_path.replace('.', '_') if layer1_data_path else ""
            content += f"""
            <div class="layer2-container">
                <div class="layer2-content">
                    <div class="layer2 new-item placeholder" data-new-item="true" data-parent-path="{layer1_data_path}" data-parent-name="{layer1_name}">New subitem</div>
                    <div class="underline" style="background-color:#e0e0e0;"></div>
                    <div class="context layer2-context new-item-hint">Long-press to add</div>
                </div>
            </div>"""

        content += """
            </div>
        </div>"""
        
        return content
    
    def _build_layer2_section(self, layer2_item, color_name):
        """Build a layer2 section with its layer3 children."""
        layer2_name = layer2_item["name"]
        layer2_id = layer2_item.get("id", "")

        # Only make clickable if it has an ID and is not a leaf node
        layer2_is_leaf = self.file_utils.is_leaf_node(layer2_id) if layer2_id else True
        
        # Determine CSS classes
        css_classes = [f"color-group-{color_name}"]
        if layer2_id and not layer2_is_leaf:
            css_classes.append("clickable")
            onclick_handler = f"onclick=\"navigateToItem('{layer2_id}')\""
        elif layer2_is_leaf:
            css_classes.append("leaf")
            onclick_handler = ""
        else:
            onclick_handler = ""
        
        layer2_class = " ".join(css_classes)
        
        # Get layer2 context and due date
        layer2_context = layer2_item.get("context")
        layer2_context_html = f'<div class="context layer2-context">{layer2_context}</div>' if layer2_context else ""
        
        layer2_due = layer2_item.get("due")
        layer2_due_html = self._format_due_date(layer2_due) if layer2_due else ""
        
        # Get progress and create underline
        layer2_progress = layer2_item.get("progress")
        layer2_underline = self._create_progress_underline(layer2_progress, color_name, "light")
        
        # Data attributes for editing
        layer2_data_path = layer2_id.replace('_', '.') if layer2_id else ""
        layer2_data_attrs = f'data-item-path="{layer2_data_path}" data-item-name="{layer2_name}" data-has-children="{str(not layer2_is_leaf).lower()}"'
        if layer2_progress is not None:
            layer2_data_attrs += f' data-progress="{layer2_progress}"'
        if layer2_context:
            layer2_data_attrs += f' data-context="{layer2_context}"'
        if layer2_due:
            layer2_data_attrs += f' data-due="{layer2_due}"'

        content = f"""
                <div class="layer2-container">
                    <div class="layer2-content">
                        <div class="layer2 {layer2_class}" {onclick_handler} {layer2_data_attrs}>{layer2_name}{layer2_due_html}</div>
                        {layer2_underline}
                        {layer2_context_html}
                    </div>
                    <div class="layer3-container">
        """

        for layer3_item in layer2_item.get("layer3", []):
            content += self._build_layer3_item(layer3_item, color_name)

        content += """
                    </div>
                </div>
        """
        return content
    
    def _build_layer3_item(self, layer3_item, color_name):
        """Build a single layer3 item."""
        if isinstance(layer3_item, dict):
            # New structure with ID
            layer3_name = layer3_item["name"]
            layer3_id = layer3_item.get("id", "")
            layer3_context = layer3_item.get("context")
            layer3_due = layer3_item.get("due")
            layer3_progress = layer3_item.get("progress")
            
            # Only make clickable if it has an ID and is not a leaf node
            layer3_is_leaf = self.file_utils.is_leaf_node(layer3_id) if layer3_id else True
            layer3_clickable_class = "clickable" if layer3_id and not layer3_is_leaf else ""
            layer3_onclick = f"onclick=\"navigateToItem('{layer3_id}')\"" if layer3_id and not layer3_is_leaf else ""
            
            # Get progress-based styling
            progress_class, progress_style = self._get_progress_text_style(layer3_progress, color_name, layer3_clickable_class)
            style_attr = f'style="{progress_style}"' if progress_style else ""
            
            # Build the layer3 item with context and due date
            layer3_due_html = self._format_due_date(layer3_due) if layer3_due else ""
            
            # Data attributes for editing
            layer3_data_path = layer3_id.replace('_', '.') if layer3_id else ""
            layer3_data_attrs = f'data-item-path="{layer3_data_path}" data-item-name="{layer3_name}" data-has-children="{str(not layer3_is_leaf).lower()}"'
            if layer3_progress is not None:
                layer3_data_attrs += f' data-progress="{layer3_progress}"'
            if layer3_context:
                layer3_data_attrs += f' data-context="{layer3_context}"'
            if layer3_due:
                layer3_data_attrs += f' data-due="{layer3_due}"'
            
            # Don't add clickable class if using progress-clickable class
            final_clickable_class = "" if progress_class == "layer3-progress-clickable" else layer3_clickable_class
            layer3_html = f'<span class="layer3 {final_clickable_class} {progress_class}" {style_attr} {layer3_onclick} {layer3_data_attrs}>{layer3_name}{layer3_due_html}</span>'
            if layer3_context:
                layer3_html += f'<div class="context layer3-context">{layer3_context}</div>'
            
            return f'<div class="layer3-item">{layer3_html}</div>'
        else:
            # Old structure (string only) - keep for backward compatibility, but make non-clickable since it's a leaf
            return f'<div class="layer3-item"><span class="layer3 color-{color_name}">{layer3_item}</span></div>'