"""
HTML generator for the YAML-based graph application.
Handles HTML generation, styling, and JavaScript functionality.
"""
import os
from datetime import datetime
from file_utils import FileUtils


# =============================================================================
# CENTRALIZED COLOR PALETTE
# =============================================================================
# All colors used throughout the application are defined here for easy management.
# Each theme color has light, medium, and dark variants.
# Gray scale is used for text and UI elements.
# =============================================================================

COLORS = {
    # Theme colors (4 main colors with 3 intensity levels each)
    "green": {
        "light": "#A5D6A7",    # Light green - used for hover backgrounds, dark mode text
        "medium": "#388E3C",   # Medium green - used for underlines, accents
        "dark": "#1B5E20",     # Dark green - used for text, dark mode underlines
    },
    "blue": {
        "light": "#90CAF9",    # Light blue - used for hover backgrounds, dark mode text
        "medium": "#1976D2",   # Medium blue - used for underlines, accents, buttons
        "dark": "#0D47A1",     # Dark blue - used for text, dark mode underlines
    },
    "purple": {
        "light": "#B39DDB",    # Light purple - used for hover backgrounds, dark mode text
        "medium": "#7E57C2",   # Medium purple - used for underlines, accents
        "dark": "#4527A0",     # Dark purple - used for text, dark mode underlines
    },
    "brown": {
        "light": "#BCAAA4",    # Light brown - used for hover backgrounds, dark mode text
        "medium": "#795548",   # Medium brown - used for underlines, accents
        "dark": "#5D4037",     # Dark brown - used for text, dark mode underlines
    },
    
    # Gray scale (for text and UI elements)
    "gray": {
        "light": "#bbb",       # Light gray - used for dark mode layer1/layer2 text, contexts
        "medium": "#888",      # Medium gray - used for placeholders, hints
        "medium_dark": "#555", # Medium dark gray - used for progress bar backgrounds in dark mode
        "dark": "#444",        # Dark gray - used for borders, buttons in dark mode
    },
    
    # Background colors
    "bg": {
        "light": "#f5f5f5",    # Light mode page background
        "light_card": "#fff",  # Light mode card/container background
        "dark": "#23272e",     # Dark mode page background
        "dark_card": "#2d313a", # Dark mode card/container background
    },
    
    # Text colors
    "text": {
        "dark": "#222",        # Dark text for light mode (layer1)
        "medium": "#333",      # Medium text for light mode (layer2, layer3)
        "light": "#fff",       # Light text for dark mode
        "muted": "#666",       # Muted text for dates, paths
    },
    
    # Special colors (used sparingly)
    "special": {
        "sun": "#FFD600",      # Sun icon color
        "danger": "#c62828",   # Danger/delete actions
        "danger_dark": "#a84444",  # Danger in dark mode
        "warning": "#ef6c00",  # Warning/today items
        "success": "#4caf50",  # Success notifications
    }
}


def get_color(category, shade):
    """Get a color value from the centralized palette."""
    return COLORS.get(category, {}).get(shade, "#888")


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
            # Use centralized color palette
            progress_color = COLORS.get(color_name, COLORS["green"]).get(intensity, COLORS["green"]["medium"])
            progress_color_dark = COLORS.get(color_name, COLORS["green"]).get("dark", COLORS["green"]["dark"])
            progress_color_light = COLORS.get(color_name, COLORS["green"]).get("light", COLORS["green"]["light"])
            return f'<div class="underline-progress" style="--progress-color: {progress_color}; --progress-color-dark: {progress_color_dark}; --progress-color-light: {progress_color_light}; --progress-percent: {progress}%;"></div>'
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
            # Use centralized color palette - dark shade for text
            text_color = COLORS.get(color_name, COLORS["green"]).get("dark", COLORS["green"]["dark"])
            # Use different class for clickable items with progress, and include color class for hover
            progress_class = "layer3-progress-clickable" if is_clickable else "layer3-progress"
            return f"{progress_class} color-{color_name}", f"--text-progress-color: {text_color}; --text-progress-color-light: {COLORS['gray']['medium']}; --text-progress-percent: {progress}%;"
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
    
    def generate_html_graph(self, data, output_path, current_item_id="home", breadcrumb_path=None):
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
        
        # Generate CSS with centralized colors
        dark_theme_css = self._get_dark_theme_css()
        main_css = self._get_css_styles()
        
        html_content = f"""
<!DOCTYPE html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>Knowledge Graph - {current_item_id.replace('_', ' ').title()}</title>
    <style>
        /* Theme toggle button styles */
        .theme-toggle {{
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 3000;
            width: 44px;
            height: 44px;
            border: none;
            border-radius: 50%;
            background: {COLORS['bg']['light_card']};
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.3s, color 0.3s;
        }}
        .theme-toggle .icon {{
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .theme-toggle.sun {{
            background: {COLORS['bg']['light_card']};
            color: {COLORS['special']['sun']};
            border: 2px solid {COLORS['gray']['medium']};
        }}
        .theme-toggle.moon {{
            background: {COLORS['text']['dark']};
            color: {COLORS['text']['light']};
            border: 2px solid {COLORS['gray']['medium']};
        }}
        body.dark-theme .theme-toggle.sun {{
            background: {COLORS['bg']['light_card']};
            color: {COLORS['special']['sun']};
            border: 2px solid {COLORS['gray']['medium']};
        }}
        body.dark-theme .theme-toggle.moon {{
            background: {COLORS['text']['dark']};
            color: {COLORS['text']['light']};
            border: 2px solid {COLORS['gray']['medium']};
        }}
        /* Edit mode toggle button styles */
        .edit-toggle {{
            position: fixed;
            bottom: 20px;
            left: 74px;
            z-index: 3000;
            width: 44px;
            height: 44px;
            border: none;
            border-radius: 50%;
            background: {COLORS['bg']['light_card']};
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.3s, color 0.3s, border-color 0.3s;
        }}
        .edit-toggle .icon {{
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
        }}
        .edit-toggle.view-mode {{
            background: {COLORS['bg']['light_card']};
            color: {COLORS['gray']['medium']};
            border: 2px solid {COLORS['gray']['medium']};
        }}
        .edit-toggle.edit-mode {{
            background: {COLORS['bg']['light_card']};
            color: {COLORS['gray']['medium']};
            border: 2px solid {COLORS['gray']['medium']};
        }}
        body.dark-theme .edit-toggle.view-mode {{
            background: {COLORS['text']['dark']};
            color: {COLORS['gray']['light']};
            border: 2px solid {COLORS['gray']['medium']};
        }}
        body.dark-theme .edit-toggle.edit-mode {{
            background: {COLORS['text']['dark']};
            color: {COLORS['gray']['light']};
            border: 2px solid {COLORS['gray']['medium']};
        }}
        /* Hide new item placeholders in view mode (default) */
        body:not(.edit-mode) .new-item.placeholder {{
            display: none;
        }}
        body:not(.edit-mode) .new-item-hint {{
            display: none;
        }}
        /* Make items look clickable in edit mode */
        body.edit-mode [data-item-path] {{
            cursor: pointer;
        }}
        body.edit-mode [data-item-path]:hover {{
            opacity: 0.8;
        }}
        {dark_theme_css}
        {main_css}
    </style>
</head>
<body>
    <button id=\"themeToggle\" class=\"theme-toggle sun\" title=\"Toggle dark mode\" aria-label=\"Toggle dark mode\">\n        <span class=\"icon\" id=\"themeIcon\">\n            <!-- Sun SVG -->\n            <svg id=\"sunIcon\" xmlns=\"http://www.w3.org/2000/svg\" width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"5\" fill=\"{COLORS['special']['sun']}\"/><g stroke=\"{COLORS['special']['sun']}\"><line x1=\"12\" y1=\"1\" x2=\"12\" y2=\"3\"/><line x1=\"12\" y1=\"21\" x2=\"12\" y2=\"23\"/><line x1=\"4.22\" y1=\"4.22\" x2=\"5.64\" y2=\"5.64\"/><line x1=\"18.36\" y1=\"18.36\" x2=\"19.78\" y2=\"19.78\"/><line x1=\"1\" y1=\"12\" x2=\"3\" y2=\"12\"/><line x1=\"21\" y1=\"12\" x2=\"23\" y2=\"12\"/><line x1=\"4.22\" y1=\"19.78\" x2=\"5.64\" y2=\"18.36\"/><line x1=\"18.36\" y1=\"5.64\" x2=\"19.78\" y2=\"4.22\"/></g></svg>\n            <!-- Moon Emoji (hidden by default) -->\n            <span id=\"moonIcon\" style=\"display:none; font-size: 28px; line-height: 1;\">🌒</span>\n        </span>\n    </button>\n    <button id=\"editToggle\" class=\"edit-toggle view-mode\" title=\"Toggle edit mode\" aria-label=\"Toggle edit mode\">\n        <span class=\"icon\">\n            <span id=\"eyeIcon\">👁️</span>\n            <span id=\"pencilIcon\" style=\"display:none;\">✏️</span>\n        </span>\n    </button>
    <div class=\"graph-container\">\n        {breadcrumb_html}\n        <div class=\"pending-actions\" id=\"pendingActions\">\n            <div style=\"flex: 1;\">\n                <div style=\"font-weight: bold; margin-bottom: 8px;\">Pending changes:</div>\n                <ul id=\"changesList\" style=\"margin: 0; padding-left: 20px; font-size: 13px; color: {COLORS['text']['medium']};\"></ul>\n            </div>\n            <div style=\"display: flex; gap: 8px;\">\n                <button id=\"confirmChangesBtn\" class=\"btn-primary\" onclick=\"confirmQueuedChanges()\">Confirm</button>\n                <button id=\"cancelChangesBtn\" class=\"btn-secondary\" onclick=\"cancelQueuedChanges()\">Cancel</button>\n            </div>\n        </div>\n        {self._build_content_sections(data, current_item_id)}\n        <div class=\"current-date\">Updated: {current_date} <span onclick=\"regenerateCurrentPage()\" class=\"refresh-icon\" title=\"Regenerate page\">↻</span></div>\n    </div>\n    <div id=\"notification\" class=\"notification\"></div>\n    \n    <!-- Edit Modal -->\n    <div id=\"editModal\" class=\"modal\">\n        <div class=\"modal-content\">\n            <h2 id=\"modalTitle\">Edit Item</h2>\n            <div class=\"form-group\">\n                <label for=\"editName\">Item Name:</label>\n                <input type=\"text\" id=\"editName\" placeholder=\"Item name (key)\">\n            </div>\n            <div class=\"form-group\">\n                <label for=\"editProgress\">Progress (0-100):</label>\n                <input type=\"number\" id=\"editProgress\" min=\"0\" max=\"100\" placeholder=\"Clear to remove\">\n            </div>\n            <div class=\"form-group\">\n                <label for=\"editContext\">Context:</label>\n                <textarea id=\"editContext\" rows=\"3\" placeholder=\"Clear to remove\"></textarea>\n            </div>\n            <div class=\"form-group\">\n                <label for=\"editDue\">Due Date (YYYY-MM-DD):</label>\n                <input type=\"date\" id=\"editDue\" placeholder=\"Clear to remove\">\n            </div>\n            <div class=\"modal-buttons\">\n                <button onclick=\"saveEdit()\" class=\"btn-primary\">Save</button>\n                <button onclick=\"closeEditModal()\" class=\"btn-secondary\">Cancel</button>\n                <button onclick=\"deleteItem()\" id=\"deleteButton\" class=\"btn-danger\" style=\"display:none;\">Delete</button>\n            </div>\n        </div>\n    </div>\n    \n    <script>\n        // Theme toggle logic\n        const themeToggle = document.getElementById('themeToggle');\n        const sunIcon = document.getElementById('sunIcon');\n        const moonIcon = document.getElementById('moonIcon');\n        function setTheme(isDark) {{\n            if (isDark) {{\n                document.body.classList.add('dark-theme');\n                themeToggle.classList.remove('sun');\n                themeToggle.classList.add('moon');\n                sunIcon.style.display = 'none';\n                moonIcon.style.display = '';\n            }} else {{\n                document.body.classList.remove('dark-theme');\n                themeToggle.classList.remove('moon');\n                themeToggle.classList.add('sun');\n                sunIcon.style.display = '';\n                moonIcon.style.display = 'none';\n            }}\n        }}\n        // Persist theme in sessionStorage\n        function getThemePref() {{\n            return sessionStorage.getItem('theme') === 'dark';\n        }}\n        function setThemePref(isDark) {{\n            sessionStorage.setItem('theme', isDark ? 'dark' : 'light');\n        }}\n        // Initial theme\n        setTimeout(() => {{\n            setTheme(getThemePref());\n            themeToggle.addEventListener('click', function() {{\n                const isDark = !document.body.classList.contains('dark-theme');\n                setTheme(isDark);\n                setThemePref(isDark);\n            }});\n        }}, 0);\n        \n        // Edit mode toggle logic\n        const editToggle = document.getElementById('editToggle');\n        const eyeIcon = document.getElementById('eyeIcon');\n        const pencilIcon = document.getElementById('pencilIcon');\n        let isEditMode = sessionStorage.getItem('editMode') === 'true';\n        \n        function setEditMode(enabled) {{\n            isEditMode = enabled;\n            if (enabled) {{\n                document.body.classList.add('edit-mode');\n                editToggle.classList.remove('view-mode');\n                editToggle.classList.add('edit-mode');\n                eyeIcon.style.display = 'none';\n                pencilIcon.style.display = '';\n                editToggle.title = 'Switch to view mode';\n            }} else {{\n                document.body.classList.remove('edit-mode');\n                editToggle.classList.remove('edit-mode');\n                editToggle.classList.add('view-mode');\n                eyeIcon.style.display = '';\n                pencilIcon.style.display = 'none';\n                editToggle.title = 'Switch to edit mode';\n            }}\n        }}\n        \n        function getEditModePref() {{\n            return sessionStorage.getItem('editMode') === 'true';\n        }}\n        \n        function setEditModePref(enabled) {{\n            sessionStorage.setItem('editMode', enabled ? 'true' : 'false');\n        }}\n        \n        // Initialize edit mode\n        setEditMode(getEditModePref());\n        \n        editToggle.addEventListener('click', function() {{\n            const newMode = !isEditMode;\n            setEditMode(newMode);\n            setEditModePref(newMode);\n            if (newMode) {{\n                showNotification('click items to edit');\n            }}\n        }});\n        \n        // Current page context for filtering editable items\n        const currentPage = '{current_item_id}';\n        const isTimePage = currentPage === 'time' || currentPage.startsWith('time_');\n        \n        // Click to edit handler (only in edit mode)\n        document.addEventListener('click', function(e) {{\n            if (!isEditMode) return;\n            const itemElement = e.target.closest('[data-item-path], [data-new-item]');\n            if (itemElement) {{\n                // Check if this is a time item (skip editing for time items)\n                const itemPath = itemElement.getAttribute('data-item-path') || '';\n                const parentPath = itemElement.getAttribute('data-parent-path') || '';\n                const isTimeItem = isTimePage || itemPath.startsWith('time') || parentPath.startsWith('time');\n                if (isTimeItem) return;\n                \n                // In edit mode, always open edit modal for editable items\n                const isNewItem = itemElement.hasAttribute('data-new-item');\n                e.preventDefault();\n                e.stopPropagation();\n                openEditModal(itemElement);\n            }}\n        }}, true);\n        {self._get_javascript_functions()}\n    </script>\n</body>\n</html>"""
        return html_content
    
    def _get_dark_theme_css(self):
        """Generate dark theme CSS using the centralized color palette."""
        return f"""
        /* Dark theme styles */
        body.dark-theme {{
            background-color: {COLORS['bg']['dark']} !important;
            color: {COLORS['text']['light']} !important;
        }}
        body.dark-theme .graph-container {{
            background: {COLORS['bg']['dark_card']} !important;
            color: {COLORS['text']['light']} !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }}
        /* Dark mode text colors */
        /* Layer1 and Layer2 use light gray */
        body.dark-theme .layer1 {{
            color: {COLORS['gray']['light']} !important;
        }}
        body.dark-theme .layer2 {{
            color: {COLORS['gray']['light']} !important;
        }}
        /* Layer3 uses light group colors */
        body.dark-theme .layer3.color-green {{
            color: {COLORS['green']['light']} !important;
        }}
        body.dark-theme .layer3.color-blue {{
            color: {COLORS['blue']['light']} !important;
        }}
        body.dark-theme .layer3.color-purple {{
            color: {COLORS['purple']['light']} !important;
        }}
        body.dark-theme .layer3.color-brown {{
            color: {COLORS['brown']['light']} !important;
        }}
        /* All contexts use light gray */
        body.dark-theme .context,
        body.dark-theme .layer1-context,
        body.dark-theme .layer2-context,
        body.dark-theme .layer3-context {{
            color: {COLORS['gray']['light']} !important;
        }}
        /* New item placeholders use medium gray */
        body.dark-theme .new-item.placeholder {{
            color: {COLORS['gray']['medium']} !important;
        }}
        body.dark-theme .new-item-hint {{
            color: {COLORS['gray']['medium']} !important;
        }}
        body.dark-theme .section {{
            background: transparent !important;
        }}
        body.dark-theme .breadcrumb,
        body.dark-theme .modal-content,
        body.dark-theme .current-date {{
            background: {COLORS['bg']['dark']} !important;
            color: {COLORS['text']['light']} !important;
        }}
        body.dark-theme .modal-content h2,
        body.dark-theme .form-group label {{
            color: {COLORS['gray']['light']} !important;
        }}
        body.dark-theme .form-group input,
        body.dark-theme .form-group textarea {{
            background: {COLORS['bg']['dark_card']} !important;
            color: {COLORS['gray']['light']} !important;
            border-color: {COLORS['gray']['dark']} !important;
        }}
        body.dark-theme .btn-primary {{
            background-color: {COLORS['blue']['dark']} !important;
            color: {COLORS['text']['light']} !important;
        }}
        body.dark-theme .btn-secondary {{
            background-color: #333 !important;
            color: {COLORS['text']['light']} !important;
        }}
        body.dark-theme .btn-danger {{
            background-color: {COLORS['special']['danger_dark']} !important;
            color: {COLORS['text']['light']} !important;
        }}
        body.dark-theme .btn-danger:hover {{
            background-color: #963838 !important;
        }}
        /* Underline colors in dark mode */
        /* Layer1 underlines use dark group color */
        body.dark-theme .underline.color-green-medium {{
            background-color: {COLORS['green']['dark']} !important;
        }}
        body.dark-theme .underline.color-blue-medium {{
            background-color: {COLORS['blue']['dark']} !important;
        }}
        body.dark-theme .underline.color-purple-medium {{
            background-color: {COLORS['purple']['dark']} !important;
        }}
        body.dark-theme .underline.color-brown-medium {{
            background-color: {COLORS['brown']['dark']} !important;
        }}
        /* Layer2 underlines use medium group color */
        body.dark-theme .underline.color-green-light {{
            background-color: {COLORS['green']['medium']} !important;
        }}
        body.dark-theme .underline.color-blue-light {{
            background-color: {COLORS['blue']['medium']} !important;
        }}
        body.dark-theme .underline.color-purple-light {{
            background-color: {COLORS['purple']['medium']} !important;
        }}
        body.dark-theme .underline.color-brown-light {{
            background-color: {COLORS['brown']['medium']} !important;
        }}
        /* fallback for other underlines */
        body.dark-theme .underline,
        body.dark-theme .underline-progress {{
            background: {COLORS['gray']['dark']} !important;
        }}
        /* Progress underline uses same color as the intensity passed (medium for layer1, light for layer2) */
        body.dark-theme .underline-progress {{
            background: linear-gradient(to right, var(--progress-color, {COLORS['green']['medium']}) var(--progress-percent), {COLORS['gray']['medium_dark']} var(--progress-percent)) !important;
        }}
        body.dark-theme .layer1.color-group-green:hover,
        body.dark-theme .layer2.color-green:hover,
        body.dark-theme .layer3.color-green:hover {{
            background-color: rgba(165, 214, 167, 0.2) !important;
        }}
        body.dark-theme .layer1.color-group-blue:hover,
        body.dark-theme .layer2.color-blue:hover,
        body.dark-theme .layer3.color-blue:hover {{
            background-color: rgba(144, 202, 249, 0.2) !important;
        }}
        body.dark-theme .layer1.color-group-purple:hover,
        body.dark-theme .layer2.color-purple:hover,
        body.dark-theme .layer3.color-purple:hover {{
            background-color: rgba(179, 157, 219, 0.2) !important;
        }}
        body.dark-theme .layer1.color-group-brown:hover,
        body.dark-theme .layer2.color-group-brown:hover,
        body.dark-theme .layer3.color-brown:hover {{
            background-color: rgba(188, 170, 164, 0.2) !important;
        }}
        /* Layer3 progress text uses light group colors in dark mode */
        body.dark-theme .layer3-progress.color-green,
        body.dark-theme .layer3-progress-clickable.color-green {{
            background: linear-gradient(to right, {COLORS['green']['light']} var(--text-progress-percent), {COLORS['gray']['medium']} var(--text-progress-percent)) !important;
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-clip: text !important;
        }}
        body.dark-theme .layer3-progress.color-blue,
        body.dark-theme .layer3-progress-clickable.color-blue {{
            background: linear-gradient(to right, {COLORS['blue']['light']} var(--text-progress-percent), {COLORS['gray']['medium']} var(--text-progress-percent)) !important;
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-clip: text !important;
        }}
        body.dark-theme .layer3-progress.color-purple,
        body.dark-theme .layer3-progress-clickable.color-purple {{
            background: linear-gradient(to right, {COLORS['purple']['light']} var(--text-progress-percent), {COLORS['gray']['medium']} var(--text-progress-percent)) !important;
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-clip: text !important;
        }}
        body.dark-theme .layer3-progress.color-brown,
        body.dark-theme .layer3-progress-clickable.color-brown {{
            background: linear-gradient(to right, {COLORS['brown']['light']} var(--text-progress-percent), {COLORS['gray']['medium']} var(--text-progress-percent)) !important;
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-clip: text !important;
        }}
        """
    
    def _get_css_styles(self):
        """Get CSS styles for the HTML page using centralized color palette."""
        return f"""
        body {{
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: {COLORS['bg']['light']};
        }}
        .graph-container {{
            background: {COLORS['bg']['light_card']};
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        .layer1 {{
            font-size: 16px;
            font-weight: bold;
            color: {COLORS['text']['dark']};
            display: inline-block;
            margin-right: 5px;
            cursor: pointer;
            padding: 3px 8px;
            border-radius: 4px;
            transition: background-color 0.2s;
        }}
        .layer1:not(.clickable) {{
            cursor: default;
        }}
        .layer1.color-group-green:hover {{
            background-color: rgba(165, 214, 167, 0.5);
        }}
        .layer1.color-group-blue:hover {{
            background-color: rgba(144, 202, 249, 0.5);
        }}
        .layer1.color-group-purple:hover {{
            background-color: rgba(179, 157, 219, 0.5);
        }}
        .layer1.color-group-brown:hover {{
            background-color: rgba(188, 170, 164, 0.5);
        }}
        .layer2 {{
            font-size: 14px;
            font-weight: normal;
            cursor: pointer;
            color: {COLORS['text']['medium']};
            padding: 3px 8px;
            border-radius: 4px;
            margin-right: 10px;
            transition: background-color 0.2s;
            display: block;
            margin-bottom: 0px;
            min-width: 30px;
        }}
        .layer2.clickable {{
            font-weight: bold;
        }}
        .layer2.leaf {{
            font-weight: bold;
        }}
        .layer2.color-green:hover {{
            background-color: rgba(165, 214, 167, 0.5);
        }}
        .layer2.color-blue:hover {{
            background-color: rgba(144, 202, 249, 0.5);
        }}
        .layer2.color-purple:hover {{
            background-color: rgba(179, 157, 219, 0.5);
        }}
        .layer2.color-group-brown:hover {{
            background-color: rgba(188, 170, 164, 0.5);
        }}
        .layer2.clickable {{
            border: 0px dashed {COLORS['blue']['medium']};
        }}
        .layer2.clickable.color-group-green:hover {{
            background-color: rgba(165, 214, 167, 0.5);
            border-color: {COLORS['green']['medium']};
        }}
        .layer2.clickable.color-group-blue:hover {{
            background-color: rgba(144, 202, 249, 0.5);
            border-color: {COLORS['blue']['medium']};
        }}
        .layer2.clickable.color-group-purple:hover {{
            background-color: rgba(179, 157, 219, 0.5);
            border-color: {COLORS['purple']['medium']};
        }}
        .layer2.clickable.color-group-brown:hover {{
            background-color: rgba(188, 170, 164, 0.5);
            border-color: {COLORS['brown']['medium']};
        }}
        .layer2:not(.clickable) {{
            cursor: default;
        }}
        .layer2:not(.clickable):hover {{
            background-color: transparent;
        }}
        .context {{
            color: {COLORS['text']['dark']};
            font-style: italic;
            margin-top: 1px;
            padding: 1px 8px;
            display: block;
            font-weight: normal;
        }}
        .layer1-context {{
            font-size: 13px;
        }}
        .layer2-context {{
            font-size: 12px;
        }}
        .layer3-context {{
            font-size: 10px;
            color: {COLORS['text']['dark']};
        }}
        .layer3 {{
            font-size: 12px;
            color: {COLORS['text']['medium']};
            font-weight: normal;
            display: block;
            cursor: pointer;
            padding: 1px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
        }}
        .layer3.clickable {{
            font-weight: bold;
        }}
        .layer3:not(.clickable) {{
            cursor: default;
        }}
        .layer3.color-green {{ color: {COLORS['green']['dark']}; }}
        .layer3.color-blue {{ color: {COLORS['blue']['dark']}; }}
        .layer3.color-purple {{ color: {COLORS['purple']['dark']}; }}
        .layer3.color-brown {{ color: {COLORS['brown']['dark']}; }}
        .layer3.color-green:hover {{ background-color: rgba(165, 214, 167, 0.5); }}
        .layer3.color-blue:hover {{ background-color: rgba(144, 202, 249, 0.5); }}
        .layer3.color-purple:hover {{ background-color: rgba(179, 157, 219, 0.5); }}
        .layer3.color-brown:hover {{ background-color: rgba(188, 170, 164, 0.5); }}
        /* New item placeholders use medium gray in both light and dark mode */
        .new-item.placeholder {{
            color: {COLORS['gray']['medium']} !important;
        }}
        .new-item-hint {{
            color: {COLORS['gray']['medium']} !important;
        }}
        .layer3-progress {{
            background: linear-gradient(to right, var(--text-progress-color) var(--text-progress-percent), var(--text-progress-color-light) var(--text-progress-percent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            display: inline-block;
            padding: 1px 6px;
            border-radius: 3px;
            transition: background-color 0.2s;
        }}
        .layer3-progress.color-green:hover {{
            background: rgba(165, 214, 167, 0.5);
            -webkit-text-fill-color: {COLORS['green']['dark']};
        }}
        .layer3-progress.color-blue:hover {{
            background: rgba(144, 202, 249, 0.5);
            -webkit-text-fill-color: {COLORS['blue']['dark']};
        }}
        .layer3-progress.color-purple:hover {{
            background: rgba(179, 157, 219, 0.5);
            -webkit-text-fill-color: {COLORS['purple']['dark']};
        }}
        .layer3-progress.color-brown:hover {{
            background: rgba(188, 170, 164, 0.5);
            -webkit-text-fill-color: {COLORS['brown']['dark']};
        }}
        .layer3-progress-clickable {{
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
        }}
        .layer3-progress-clickable.color-green:hover {{
            background: rgba(165, 214, 167, 0.5);
            -webkit-text-fill-color: {COLORS['green']['dark']};
        }}
        .layer3-progress-clickable.color-blue:hover {{
            background: rgba(144, 202, 249, 0.5);
            -webkit-text-fill-color: {COLORS['blue']['dark']};
        }}
        .layer3-progress-clickable.color-purple:hover {{
            background: rgba(179, 157, 219, 0.5);
            -webkit-text-fill-color: {COLORS['purple']['dark']};
        }}
        .layer3-progress-clickable.color-brown:hover {{
            background: rgba(188, 170, 164, 0.5);
            -webkit-text-fill-color: {COLORS['brown']['dark']};
        }}
        .underline {{
            height: 2px;
            margin-top: 0px;
            margin-bottom: 1px;
            display: block;
            width: 100%;
            line-height: 0;
            font-size: 0;
            overflow: hidden;
            opacity: 0.6;
        }}
        .underline-progress {{
            height: 2px;
            margin-top: 0px;
            margin-bottom: 1px;
            display: block;
            width: 100%;
            line-height: 0;
            font-size: 0;
            overflow: hidden;
            background: linear-gradient(to right, var(--progress-color) var(--progress-percent), #ddd var(--progress-percent));
            opacity: 0.6;
        }}
        .color-green-light {{ background-color: {COLORS['green']['light']}; }}
        .color-green-medium {{ background-color: {COLORS['green']['medium']}; }}
        .color-green-dark {{ background-color: {COLORS['green']['dark']}; }}
        .color-blue-light {{ background-color: {COLORS['blue']['light']}; }}
        .color-blue-medium {{ background-color: {COLORS['blue']['medium']}; }}
        .color-blue-dark {{ background-color: {COLORS['blue']['dark']}; }}
        .color-purple-light {{ background-color: {COLORS['purple']['light']}; }}
        .color-purple-medium {{ background-color: {COLORS['purple']['medium']}; }}
        .color-purple-dark {{ background-color: {COLORS['purple']['dark']}; }}
        .color-brown-light {{ background-color: {COLORS['brown']['light']}; }}
        .color-brown-medium {{ background-color: {COLORS['brown']['medium']}; }}
        .color-brown-dark {{ background-color: {COLORS['brown']['dark']}; }}
        .section {{
            margin-bottom: 10px;
            display: flex;
            align-items: flex-start;
        }}
        .layer1-container {{
            display: flex;
            flex-direction: column;
            margin-right: 15px;
            flex-shrink: 0;
        }}
        .layer2-section {{
            display: flex;
            flex-direction: column;
        }}
        .layer2-container {{
            margin-bottom: 2px;
            display: flex;
            align-items: flex-start;
        }}
        .layer2-content {{
            margin-right: 10px;
            flex-shrink: 0;
        }}
        .layer3-container {{
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
        }}
        .layer3-item {{
            margin-right: 15px;
            margin-bottom: 1px;
        }}
        .notification {{
            position: fixed;
            top: 20px;
            right: 20px;
            background: {COLORS['special']['success']};
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            display: none;
            z-index: 1000;
        }}
        .notification.error {{
            background: {COLORS['special']['danger']};
        }}
        .notification.info {{
            background: {COLORS['blue']['dark']};
            color: white;
        }}
        .modal {{
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
        }}
        .modal-content {{
            background-color: {COLORS['bg']['light_card']};
            padding: 20px;
            border-radius: 8px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }}
        .modal-content h2 {{
            margin-top: 0;
            color: {COLORS['text']['medium']};
        }}
        .form-group {{
            margin-bottom: 15px;
        }}
        .form-group label {{
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: {COLORS['text']['muted']};
        }}
        .form-group input,
        .form-group textarea {{
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }}
        .form-group input:focus,
        .form-group textarea:focus {{
            outline: none;
            border-color: {COLORS['blue']['medium']};
        }}
        .modal-buttons {{
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 20px;
        }}
        .btn-primary,
        .btn-secondary {{
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            transition: background-color 0.2s;
        }}
        #confirmChangesBtn,
        #cancelChangesBtn {{
            padding: 6px 12px;
            font-size: 13px;
        }}
        .btn-primary {{
            background-color: {COLORS['blue']['medium']};
            color: white;
        }}
        .btn-primary:hover {{
            background-color: {COLORS['blue']['dark']};
        }}
        .btn-secondary {{
            background-color: #f0f0f0;
            color: {COLORS['text']['medium']};
        }}
        .btn-secondary:hover {{
            background-color: #e0e0e0;
        }}
        .btn-danger {{
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            transition: background-color 0.2s;
            background-color: {COLORS['special']['danger']};
            color: white;
        }}
        .btn-danger:hover {{
            background-color: #c23838;
        }}
        /* Pending actions toolbar */
        .pending-actions {{
            margin: 10px 0 15px 0;
            display: none; /* shown when there are queued changes */
            gap: 8px;
        }}
        body.dark-theme #changesList {{
            color: {COLORS['gray']['light']} !important;
        }}
        /* Soft-delete styling */
        .deleted {{
            color: {COLORS['special']['danger']};
            text-decoration: line-through;
            text-decoration-color: {COLORS['special']['danger']} !important;
            -webkit-text-decoration-color: {COLORS['special']['danger']} !important;
            opacity: 0.9;
        }}
        /* Force strikethrough on progress items that are deleted */
        .deleted.layer3-progress,
        .deleted.layer3-progress-clickable {{
            text-decoration: line-through !important;
            -webkit-text-decoration: line-through !important;
            text-decoration-color: {COLORS['special']['danger']} !important;
            -webkit-text-decoration-color: {COLORS['special']['danger']} !important;
        }}
        body.dark-theme .deleted {{
            color: #ff6b6b;
            text-decoration-color: #ff6b6b !important;
            -webkit-text-decoration-color: #ff6b6b !important;
        }}
        body.dark-theme .deleted.layer3-progress,
        body.dark-theme .deleted.layer3-progress-clickable {{
            text-decoration-color: #ff6b6b !important;
            -webkit-text-decoration-color: #ff6b6b !important;
        }}
        /* Pending add styling */
        .pending-add::after {{
            content: " *";
            color: {COLORS['special']['warning']};
            font-weight: bold;
        }}
        .breadcrumb {{
            margin-bottom: 20px;
            padding: 10px;
            background: #f0f0f0;
            border-radius: 4px;
            font-size: 14px;
        }}
        .breadcrumb a {{
            color: {COLORS['blue']['medium']};
            text-decoration: none;
            cursor: pointer;
        }}
        .breadcrumb a:hover {{
            text-decoration: underline;
        }}
        .breadcrumb .current {{
            font-weight: bold;
            color: {COLORS['text']['medium']};
        }}
        body.dark-theme .breadcrumb .current {{
            color: {COLORS['gray']['light']};
        }}
        .current-date {{
            margin-top: 20px;
            padding: 5px 10px;
            background: #f8f8f8;
            border-radius: 4px;
            font-size: 12px;
            color: {COLORS['text']['muted']};
            text-align: right;
        }}
        body.dark-theme .current-date {{
            color: {COLORS['gray']['medium_dark']};
        }}
        .refresh-icon {{
            cursor: pointer;
            margin-left: 10px;
            display: inline-block;
            font-size: 18px;
            color: {COLORS['text']['dark']};
            background: none;
            border: none;
            padding: 0;
            line-height: 1;
        }}
        body.dark-theme .refresh-icon {{
            color: {COLORS['text']['light']};
        }}
        .due-date {{
            font-size: 10px;
            padding: 1.8px 6px;
            border-radius: 3px;
            display: inline-block;
            margin-left: 8px;
            font-weight: normal;
        }}
        .due-overdue {{
            background-color: #ffebee;
            color: {COLORS['special']['danger']};
        }}
        .due-today {{
            background-color: #fff3e0;
            color: {COLORS['special']['warning']};
        }}
        .due-soon {{
            background-color: #e8f5e9;
            color: #2e7d32;
        }}
        .due-later {{
            background-color: #e3f2fd;
            color: {COLORS['blue']['dark']};
        }}
        /* Darker backgrounds for time bubbles in dark mode */
        body.dark-theme .due-overdue {{
            background-color: #3a2525;
            color: #ffebee;
        }}
        body.dark-theme .due-today {{
            background-color: #4d3525;
            color: #fff3e0;
        }}
        body.dark-theme .due-soon {{
            background-color: #2a3e2d;
            color: #e8f5e9;
        }}
        body.dark-theme .due-later {{
            background-color: #253b4d;
            color: #e3f2fd;
        }}
        /* Time category items (Over, Day, Week, Month) match time bubble colors */
        .time-category-over {{
            color: {COLORS['special']['danger']} !important;
        }}
        body.dark-theme .time-category-over {{
            color: #ffb3ba !important;
        }}
        .time-category-day {{
            color: {COLORS['special']['warning']} !important;
        }}
        body.dark-theme .time-category-day {{
            color: #ffd699 !important;
        }}
        .time-category-week {{
            color: #2e7d32 !important;
        }}
        body.dark-theme .time-category-week {{
            color: #b3e5b3 !important;
        }}
        .time-category-month {{
            color: {COLORS['blue']['dark']} !important;
        }}
        body.dark-theme .time-category-month {{
            color: #b3d9f2 !important;
        }}
        .item-path {{
            font-size: 11px;
            color: {COLORS['text']['muted']};
            font-style: italic;
            margin-top: 2px;
        }}
        .back-button {{
            display: inline-block;
            margin-bottom: 20px;
            padding: 8px 16px;
            background: {COLORS['blue']['medium']};
            color: white;
            text-decoration: none;
            border-radius: 4px;
            cursor: pointer;
            border: none;
            font-size: 14px;
        }}
        .back-button:hover {{
            background: {COLORS['blue']['dark']};
        }}
        
        /* Responsive layout for narrow screens */
        @media (max-width: 500px) {{
            .section {{
                flex-direction: column;
            }}
            .layer1-container {{
                margin-right: 0;
                margin-bottom: 15px;
            }}
            .layer2-section {{
                width: 100%;
            }}
        }}
        """
    
    def _get_javascript_functions(self):
        """Get JavaScript functions for the HTML page."""
        return """
        // Queues for pending changes in current session
        const pendingAdds = []; // { parentPath, payload, description }
        const pendingDeletes = []; // { itemPath, itemName, description }
        const pendingEdits = []; // { itemPath, itemName, changes, description }

        function updatePendingActionsVisibility() {
            const hasChanges = pendingAdds.length > 0 || pendingDeletes.length > 0 || pendingEdits.length > 0;
            const bar = document.getElementById('pendingActions');
            if (bar) {
                bar.style.display = hasChanges ? 'flex' : 'none';
                if (hasChanges) updateChangesList();
            }
        }

        function updateChangesList() {
            const list = document.getElementById('changesList');
            list.innerHTML = '';
            pendingAdds.forEach(add => {
                const li = document.createElement('li');
                li.textContent = add.description;
                list.appendChild(li);
            });
            pendingDeletes.forEach(del => {
                const li = document.createElement('li');
                li.textContent = del.description;
                list.appendChild(li);
            });
            pendingEdits.forEach(edit => {
                const li = document.createElement('li');
                li.textContent = edit.description;
                list.appendChild(li);
            });
        }

        function formatChangeDescription(type, itemName, details) {
            if (type === 'add') return `add ${itemName}`;
            if (type === 'delete') return `delete ${itemName}`;
            if (type === 'edit') {
                const parts = [];
                if (details.progress !== undefined && details.progress !== null) parts.push(`progress:${details.progress}`);
                if (details.context) {
                    const ctx = details.context.substring(0, 20);
                    parts.push(`context: ${ctx}${details.context.length > 20 ? '...' : ''}`);
                }
                if (details.due) parts.push(`due: ${details.due}`);
                return parts.length > 0 ? `${parts.join(', ')} ${itemName}` : `edit ${itemName}`;
            }
            return `change ${itemName}`;
        }
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
                // Store original values to detect when fields are cleared
                modal.setAttribute('data-original-name', itemName);
                modal.setAttribute('data-original-progress', currentProgress);
                modal.setAttribute('data-original-context', currentContext);
                modal.setAttribute('data-original-due', currentDue);
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
                    const description = formatChangeDescription('add', name, {});
                    pendingAdds.push({ parentPath: parentPath || 'root', payload, description });
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
                    // Queue edit with description - include all fields that changed or were cleared
                    // Get original values from modal attributes
                    const originalName = modal.getAttribute('data-original-name') || '';
                    const originalProgress = modal.getAttribute('data-original-progress') || '';
                    const originalContext = modal.getAttribute('data-original-context') || '';
                    const originalDue = modal.getAttribute('data-original-due') || '';
                    
                    const changes = {};
                    
                    // Handle name: send new name if changed, omit if unchanged
                    if (name !== originalName) {
                        changes.name = name;
                    }
                    
                    // Handle progress: send empty string if cleared, value if changed, omit if unchanged
                    if (progress !== originalProgress) {
                        changes.progress = progress ? parseInt(progress) : '';
                    }
                    
                    // Handle context: send empty string if cleared, value if changed, omit if unchanged
                    if (context !== originalContext) {
                        changes.context = context || '';
                    }
                    
                    // Handle due: send empty string if cleared, value if changed, omit if unchanged
                    if (due !== originalDue) {
                        changes.due = due || '';
                    }
                    
                    const description = formatChangeDescription('edit', originalName, changes);
                    pendingEdits.push({ itemPath, itemName: originalName, changes, description });
                    updatePendingActionsVisibility();
                    closeEditModal();
                    showNotification('Queued edit. Confirm to save, or Cancel to revert.');
                    return;
                }
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
            const itemEl = document.querySelector(`[data-item-path="${itemPath}"]`);
            const itemName = itemEl ? (itemEl.getAttribute('data-item-name') || itemPath) : itemPath;
            const description = formatChangeDescription('delete', itemName, {});
            pendingDeletes.push({ itemPath, itemName, description });
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
        
        function showNotification(message, type = 'success') {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            if (type === 'error' || type === true) {
                notification.className = 'notification error';
            } else if (type === 'info') {
                notification.className = 'notification info';
            } else {
                notification.className = 'notification';
            }
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
        
        async function regenerateCurrentPage() {
            // API base URL - always use same origin since HTML and API are served from same server
            const API_BASE = window.location.origin;
            
            // Extract current page ID from filename
            const path = window.location.pathname;
            const filename = path.substring(path.lastIndexOf('/') + 1) || 'home.html';
            const itemId = filename.replace('.html', '');
            
            showNotification('Regenerating page...');
            try {
                const res = await fetch(`${API_BASE}/api/regenerate/${itemId}`, { method: 'POST' });
                if (!res.ok) {
                    const t = await res.text();
                    throw new Error(`Failed: ${res.status} ${t}`);
                }
                showNotification('Page regenerated. Reloading...');
                setTimeout(() => { window.location.reload(); }, 500);
            } catch (err) {
                showNotification('Error regenerating page: ' + err.message, true);
            }
        }
        
        async function confirmQueuedChanges() {
            // API base URL - smart detection for local vs cloud deployment
            const isLocalDev = window.location.hostname === 'localhost' && window.location.port === '8080';
            const API_BASE = isLocalDev ? 'http://localhost:8000' : window.location.origin;
            console.log('API_BASE:', API_BASE);
            console.log('Current URL:', window.location.href);
            
            // Detect if opened as file:// instead of http://
            if (API_BASE.startsWith('file://')) {
                showNotification('Error: Please open via http://localhost:8000/html/home.html, not as a file', true);
                console.error('Cannot make API calls from file:// protocol. Server must be running on http://localhost:8000');
                return;
            }
            
            try {
                // Apply edits
                for (const edit of pendingEdits) {
                    console.log('Editing:', edit.itemPath, edit.changes);
                    const res = await fetch(`${API_BASE}/api/items/${edit.itemPath}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(edit.changes)
                    });
                    if (!res.ok) {
                        const t = await res.text();
                        throw new Error(`Failed to edit ${edit.itemPath}: ${res.status} ${t}`);
                    }
                }
                // Delete items
                for (const del of pendingDeletes) {
                    console.log('Deleting:', del.itemPath);
                    const res = await fetch(`${API_BASE}/api/items/${del.itemPath}`, { method: 'DELETE' });
                    if (!res.ok) {
                        const t = await res.text();
                        throw new Error(`Failed to delete ${del.itemPath}: ${res.status} ${t}`);
                    }
                }
                // Add items
                for (const add of pendingAdds) {
                    console.log('Adding under:', add.parentPath, add.payload);
                    const url = `${API_BASE}/api/items/${add.parentPath}`;
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
                // Sync to Google Drive
                console.log('Syncing to Google Drive...');
                showNotification('Syncing to Google Drive...');
                const syncRes = await fetch(`${API_BASE}/api/sync-to-drive`, { method: 'POST' });
                if (!syncRes.ok) {
                    console.warn('Warning: Google Drive sync may have failed:', syncRes.status);
                }
                pendingDeletes.splice(0, pendingDeletes.length);
                pendingAdds.splice(0, pendingAdds.length);
                pendingEdits.splice(0, pendingEdits.length);
                updatePendingActionsVisibility();
                showNotification('Changes saved and synced to Google Drive. Reloading...');
                setTimeout(() => { window.location.reload(); }, 800);
            } catch (err) {
                console.error('Error confirming changes:', err);
                showNotification('Error confirming changes: ' + err.message, true);
            }
        }
        
        function cancelQueuedChanges() {
            document.querySelectorAll('.deleted').forEach(el => el.classList.remove('deleted'));
            document.querySelectorAll('.pending-add').forEach(el => el.remove());
            pendingDeletes.splice(0, pendingDeletes.length);
            pendingAdds.splice(0, pendingAdds.length);
            pendingEdits.splice(0, pendingEdits.length);
            updatePendingActionsVisibility();
            showNotification('Reverted pending changes.');
        }
        
        // (duplicate function removed)
        """
    
    def _build_content_sections(self, data, current_item_id):
        """Build the main content sections of the HTML."""
        content = ""
        
        # Color mapping
        base_colors = [
            ("green", "#A5D6A7", "#388E3C", "#1B5E20"),
            ("brown", "#BCAAA4", "#795548", "#3E2723"),
            ("blue", "#90CAF9", "#1976D2", "#0D47A1"),
            ("purple", "#B39DDB", "#7E57C2", "#4527A0"),
        ]

        for idx, item in enumerate(data):
            color_name = base_colors[idx % 4][0]  # Only get the color name
            content += self._build_layer1_section(item, color_name)

        # Add a grayed-out "New item" placeholder after all level 1 items (skip for time page)
        if current_item_id != 'time':
            parent_path = current_item_id.replace('_', '.') if current_item_id else ""
            content += f"""
        <div class=\"section\">
            <div class=\"layer1-container\">
                <div class=\"layer1 new-item placeholder\" data-new-item=\"true\" data-parent-path=\"{parent_path}\" data-parent-name=\"{current_item_id}\">New item</div>
                <div class=\"underline\" style=\"background-color:#e0e0e0;\"></div>
                <div class=\"context layer1-context new-item-hint\">Click to add</div>
            </div>
        </div>"""

        return content
    
    def _build_layer1_section(self, item, color_name):
        """Build a layer1 section with all its children."""
        layer1_name = item["layer1"]
        layer1_id = item.get("layer1_id", "")
        layer1_has_children = len(item.get("layer2", [])) > 0
        
        # Check if this is a time category (Over, Day, Week, Month) - they should not be clickable or editable
        time_categories = ['time_over', 'time_day', 'time_week', 'time_month']
        is_time_category = layer1_id in time_categories
        
        # Add time category CSS class for custom coloring
        time_category_class = ""
        if is_time_category:
            # Map time_over -> time-category-over
            category_name = layer1_id.replace('time_', '')
            time_category_class = f"time-category-{category_name}"
        
        # Make layer1 clickable only if it has children (is not a leaf node) and is not a time category
        layer1_is_leaf = self.file_utils.is_leaf_node(layer1_id) if layer1_id else True
        layer1_clickable_class = "clickable" if layer1_has_children and not layer1_is_leaf and not is_time_category else ""
        layer1_onclick = f"onclick=\"navigateToItem('{layer1_id}')\"" if layer1_id and not layer1_is_leaf and not is_time_category else ""
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
        
        # Data attributes for editing - skip for time categories
        if is_time_category:
            layer1_data_attrs = ""
        else:
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
                <div class="layer1 {layer1_clickable_class} {layer1_color_class} {time_category_class}" {layer1_onclick} {layer1_data_attrs}>{layer1_name}{layer1_due_html}</div>
                {layer1_underline}
                {layer1_context_html}
                {layer1_path_html}
            </div>
            <div class="layer2-section">
        """

        for layer2_item in item.get("layer2", []):
            content += self._build_layer2_section(layer2_item, color_name)

        # Add "New subitem" placeholder for leaf level1 items (skip for time page)
        layer1_id = item.get("layer1_id", "")
        is_time_item = layer1_id and layer1_id.startswith('time')
        
        if not layer1_has_children and not is_time_item:
            layer1_path_for_placeholder = layer1_data_path.replace('.', '_') if layer1_data_path else ""
            content += f"""
            <div class="layer2-container">
                <div class="layer2-content">
                    <div class="layer2 new-item placeholder" data-new-item="true" data-parent-path="{layer1_data_path}" data-parent-name="{layer1_name}">New subitem</div>
                    <div class="underline" style="background-color:#e0e0e0;"></div>
                    <div class="context layer2-context new-item-hint">Click to add</div>
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
        
        # Make time categories (Over, Day, Week, Month) non-clickable
        time_categories = ['time_over', 'time_day', 'time_week', 'time_month']
        is_time_category = layer2_id in time_categories
        
        # Determine CSS classes
        css_classes = [f"color-group-{color_name}"]
        if is_time_category:
            # Add time category CSS class for custom coloring
            category_name = layer2_id.replace('time_', '')
            css_classes.append(f"time-category-{category_name}")
            onclick_handler = ""
        elif layer2_id and not layer2_is_leaf:
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
        
        # Data attributes for editing - skip for time categories
        if is_time_category:
            layer2_data_attrs = ""
        else:
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