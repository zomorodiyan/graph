def read_layers_from_md(filepath):
    result = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('# Example'):
                continue
            sharps = 0
            while sharps < len(line) and line[sharps] == '#':
                sharps += 1
            name = line[sharps:].strip()
            layer = sharps + 1  # layer 1 if no sharps, layer 2 if one sharp, etc.
            result.append((name, layer))
    return result

# --- Data reading and parsing ---
def parse_md_hierarchy(filepath):
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()]
    i = 0
    while i < len(lines):
        if lines[i].startswith('#'):
            i += 1
            continue
        layer1 = lines[i]
        i += 1
        layer2 = []
        while i < len(lines) and lines[i].startswith('#'):
            if lines[i].startswith('##'):
                i += 1
                continue
            name = lines[i][1:].strip()
            i += 1
            layer3 = []
            while i < len(lines) and lines[i].startswith('##'):
                layer3.append(lines[i][2:].strip())
                i += 1
            layer2.append({"name": name, "layer3": layer3})
        data.append({"layer1": layer1, "layer2": layer2})
    return data

import os
import sys

# HTML caching logic
if len(sys.argv) > 1:
    md_file = sys.argv[1]
else:
    md_file = "main.md"

html_dir = os.path.join(os.path.dirname(__file__), "html")
base_name = os.path.splitext(os.path.basename(md_file))[0]
html_path = os.path.join(html_dir, f"{base_name}.html")

# Create html directory if it doesn't exist
os.makedirs(html_dir, exist_ok=True)

# Function to create file association mapping
def get_file_association(layer1_name, layer2_name):
    """Map layer2 items to their associated markdown files"""
    associations = {
        "Body": {
            "Habits": "body-habit.md",
            "Nutrition": "body-nutrition.md",
            "Train": "body-train.md"
        },
        "Mind": {
            "Mood": "mind-mood.md",
            "Rest": "mind-rest.md"
        },
        "Level": {
            "Task": "level-task.md",
            "Skill": "level-skill.md",
            "Goal": "level-goal.md"
        },
        "Work": {
            "Go-Melt": "work-go-melt.md",
            "ASU-Craft": "work-asu-craft.md"
        },
        "Study": {
            "IIOT": "study-iiot.md"
        },
        "Project": {
            "Imaginer": "project-imaginer.md"
        },
        "Interaction": {
            "Love": "interaction-love.md",
            "Family": "interaction-family.md",
            "Friends": "interaction-friends.md",
            "Community": "interaction-community.md"
        },
        "Finance": {
            "Earn": "finance-earn.md",
            "Spend": "finance-spend.md",
            "Invest": "finance-invest.md"
        },
        "Time": {
            "Day": "time-day.md",
            "Month": "time-month.md",
            "Year": "time-year.md"
        }
    }

    return associations.get(layer1_name, {}).get(layer2_name, None)

def check_file_exists(file_path):
    """Check if a file exists in the current directory"""
    if not file_path:
        return False
    return os.path.exists(file_path)

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
        }
        .layer2 {
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background-color 0.2s;
            display: block;
            margin-bottom: 4px;
            min-width: 80px;
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
            opacity: 0.6;
            cursor: not-allowed;
        }
        .layer2:not(.clickable).color-group-green:hover {
            background-color: #C8E6C9;
        }
        .layer2:not(.clickable).color-group-blue:hover {
            background-color: #BBDEFB;
        }
        .layer2:not(.clickable).color-group-purple:hover {
            background-color: #E1BEE7;
        }
        .layer2:not(.clickable).color-group-red:hover {
            background-color: #FFCDD2;
        }
        .layer3 {
            font-size: 14px;
            color: #666;
            display: inline-block;
            margin-right: 15px;
            vertical-align: top;
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

        html_content += f"""
        <div class="section">
            <div class="layer1-container">
                <div class="layer1">{layer1_name}</div>
                <div class="underline color-{color_name}-medium"></div>
            </div>
            <div class="layer2-section">
"""

        for layer2_item in item["layer2"]:
            layer2_name = layer2_item["name"]
            file_path = get_file_association(layer1_name, layer2_name)
            file_exists = check_file_exists(file_path)

            # Only make clickable if file exists
            clickable_class = "clickable" if file_exists else ""
            onclick_handler = f"navigateToSubGraph('{file_path}', '{layer1_name}', '{layer2_name}')" if file_exists else f"showFileNotAvailable('{layer2_name}')"

            html_content += f"""
                <div class="layer2-container">
                    <div class="layer2-content">
                        <div class="layer2 {clickable_class} color-group-{color_name}" onclick="{onclick_handler}">{layer2_name}</div>
                        <div class="underline color-{color_name}-light"></div>
                    </div>
                    <div class="layer3-container">
"""

            for layer3_item in layer2_item["layer3"]:
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

            // Generate sub-graph HTML file name
            const subGraphName = filePath.replace('.md', '.html');

            // Navigate to the sub-graph
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

def generate_all_subgraphs():
    """Generate HTML files for all available markdown files"""

    # Get all markdown files in the current directory
    md_files = [f for f in os.listdir('.') if f.endswith('.md') and f != 'main.md']

    html_dir = "html"
    os.makedirs(html_dir, exist_ok=True)

    for md_file in md_files:
        try:
            data = parse_md_hierarchy(md_file)
            if data:  # Only generate if file has content
                base_name = os.path.splitext(md_file)[0]
                html_path = os.path.join(html_dir, f"{base_name}.html")

                # Create breadcrumb based on file name
                breadcrumb = [("Main", "main.html"), (base_name.replace('-', ' ').title(), None)]

                generate_html_graph(data, html_path, parent_file=md_file, breadcrumb_path=breadcrumb)
                print(f"Generated sub-graph: {html_path}")

        except Exception as e:
            print(f"Error generating sub-graph for {md_file}: {e}")

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

# Open the HTML file in default browser
import webbrowser
webbrowser.open('file://' + os.path.abspath(html_path))
