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
    
    if not lines:
        return data
    
    # First line is the parent (layer1) without # prefix
    layer1 = lines[0]
    layer2 = []
    
    # Process remaining lines as layer2 items (with # prefix)
    for i in range(1, len(lines)):
        line = lines[i]
        if line.startswith('#') and not line.startswith('##'):
            # This is a layer2 item
            name = line[1:].strip()
            layer2.append({"name": name, "layer3": []})
    
    if layer2:  # Only add if there are subitems
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
        "Main": {
            "Mind": "mind.md",
            "Body": "body.md", 
            "Level": "level.md",
            "Interaction": "interaction.md",
            "Finance": "finance.md",
            "Time": "time.md"
        },
        "Mind": {
            "Mood": "mind-mood.md",
            "Rest": "mind-rest.md"
        },
        "Body": {
            "Habit": "body-habit.md",
            "Nutrition": "body-nutrition.md",
            "Train": "body-train.md"
        },
        "Level": {
            "Task": "level-task.md",
            "Skill": "level-skill.md",
            "Goal": "level-goal.md"
        },
        "Task": {
            "Work": "work.md",
            "Study": "study.md",
            "Project": "project.md"
        },
        "Work": {
            "Go-Melt": "work-go-melt.md"
        },
        "Study": {
            "IIOT": "study-iiot.md",
            "ASU-Craft": "study-asu-craft.md"
        },
        "Project": {
            "Imaginer": "project-imaginer.md"
        },
        "Go-Melt": {
            "Run": "work-go-melt-run.md",
            "Theory": "work-go-melt-theory.md",
            "Code": "work-go-melt-code.md"
        },
        "IIOT": {
            "Homework": "study-iiot-homework.md",
            "TermPaper": "study-iiot-termpaper.md",
            "GroupProject": "study-iiot-groupproject.md"
        },
        "ASU-Craft": {
            "Meetings": "study-asu-craft-meetings.md",
            "Documentation": "study-asu-craft-documentation.md"
        },
        "Imaginer": {
            "Prototype": "project-imaginer-prototype.md",
            "Planning": "project-imaginer-planning.md",
            "Implementation": "project-imaginer-implementation.md"
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

def get_parent_file_info(file_name):
    """Determine parent file and navigation info based on file name"""
    base_name = os.path.splitext(file_name)[0]

    # Define parent relationships
    parent_mapping = {
        # Level 1 files - parent is main
        "mind": ("main.html", "Main"),
        "body": ("main.html", "Main"),
        "level": ("main.html", "Main"),
        "interaction": ("main.html", "Main"),
        "finance": ("main.html", "Main"),
        "time": ("main.html", "Main"),

        # Level 2 files - mind items
        "mind-mood": ("mind.html", "Mind"),
        "mind-rest": ("mind.html", "Mind"),

        # Level 2 files - body items
        "body-habit": ("body.html", "Body"),
        "body-nutrition": ("body.html", "Body"),
        "body-train": ("body.html", "Body"),

        # Level 2 files - level items
        "level-task": ("level.html", "Level"),
        "level-skill": ("level.html", "Level"),
        "level-goal": ("level.html", "Level"),

        # Level 2 files - interaction items
        "interaction-love": ("interaction.html", "Interaction"),
        "interaction-family": ("interaction.html", "Interaction"),
        "interaction-friends": ("interaction.html", "Interaction"),
        "interaction-community": ("interaction.html", "Interaction"),

        # Level 2 files - finance items
        "finance-earn": ("finance.html", "Finance"),
        "finance-spend": ("finance.html", "Finance"),
        "finance-invest": ("finance.html", "Finance"),

        # Level 2 files - time items
        "time-day": ("time.html", "Time"),
        "time-month": ("time.html", "Time"),
        "time-year": ("time.html", "Time"),

        # Level 3 files - task items
        "work": ("level-task.html", "Task"),
        "study": ("level-task.html", "Task"),
        "project": ("level-task.html", "Task"),

        # Level 4 files - work items
        "work-go-melt": ("work.html", "Work"),

        # Level 4 files - study items
        "study-iiot": ("study.html", "Study"),
        "study-asu-craft": ("study.html", "Study"),

        # Level 4 files - project items
        "project-imaginer": ("project.html", "Project"),

        # Level 5 files - go-melt items
        "work-go-melt-run": ("work-go-melt.html", "Go-Melt"),
        "work-go-melt-theory": ("work-go-melt.html", "Go-Melt"),
        "work-go-melt-code": ("work-go-melt.html", "Go-Melt"),

        # Level 5 files - iiot items
        "study-iiot-homework": ("study-iiot.html", "IIOT"),
        "study-iiot-termpaper": ("study-iiot.html", "IIOT"),
        "study-iiot-groupproject": ("study-iiot.html", "IIOT"),

        # Level 5 files - asu-craft items
        "study-asu-craft-meetings": ("study-asu-craft.html", "ASU-Craft"),
        "study-asu-craft-documentation": ("study-asu-craft.html", "ASU-Craft"),

        # Level 5 files - imaginer items
        "project-imaginer-prototype": ("project-imaginer.html", "Imaginer"),
        "project-imaginer-planning": ("project-imaginer.html", "Imaginer"),
        "project-imaginer-implementation": ("project-imaginer.html", "Imaginer"),
    }

    if base_name in parent_mapping:
        parent_file, parent_name = parent_mapping[base_name]

        # Create breadcrumb path based on hierarchy depth
        if parent_file == "main.html":
            # Level 1: Direct child of main
            breadcrumb = [("Main", "main.html"), (base_name.replace('-', ' ').title(), None)]
        elif parent_name in ["Mind", "Body", "Level", "Interaction", "Finance", "Time"]:
            # Level 2: Child of level 1 items
            parent_base = parent_name.lower()
            breadcrumb = [
                ("Main", "main.html"),
                (parent_name, f"{parent_base}.html"),
                (base_name.replace('-', ' ').title(), None)
            ]
        elif parent_name == "Task":
            # Level 3: Child of Task
            breadcrumb = [
                ("Main", "main.html"),
                ("Level", "level.html"),
                ("Task", "level-task.html"),
                (base_name.replace('-', ' ').title(), None)
            ]
        elif parent_name in ["Work", "Study", "Project"]:
            # Level 4: Child of Work/Study/Project
            breadcrumb = [
                ("Main", "main.html"),
                ("Level", "level.html"),
                ("Task", "level-task.html"),
                (parent_name, f"{parent_name.lower()}.html"),
                (base_name.replace('-', ' ').title(), None)
            ]
        elif parent_name in ["Go-Melt", "IIOT", "ASU-Craft", "Imaginer"]:
            # Level 5: Child of specific items
            if parent_name == "Go-Melt":
                breadcrumb = [
                    ("Main", "main.html"),
                    ("Level", "level.html"),
                    ("Task", "level-task.html"),
                    ("Work", "work.html"),
                    ("Go-Melt", "work-go-melt.html"),
                    (base_name.replace('-', ' ').title(), None)
                ]
            elif parent_name == "IIOT":
                breadcrumb = [
                    ("Main", "main.html"),
                    ("Level", "level.html"),
                    ("Task", "level-task.html"),
                    ("Study", "study.html"),
                    ("IIOT", "study-iiot.html"),
                    (base_name.replace('-', ' ').title(), None)
                ]
            elif parent_name == "ASU-Craft":
                breadcrumb = [
                    ("Main", "main.html"),
                    ("Level", "level.html"),
                    ("Task", "level-task.html"),
                    ("Study", "study.html"),
                    ("ASU-Craft", "study-asu-craft.html"),
                    (base_name.replace('-', ' ').title(), None)
                ]
            elif parent_name == "Imaginer":
                breadcrumb = [
                    ("Main", "main.html"),
                    ("Level", "level.html"),
                    ("Task", "level-task.html"),
                    ("Project", "project.html"),
                    ("Imaginer", "project-imaginer.html"),
                    (base_name.replace('-', ' ').title(), None)
                ]
        else:
            # Default: treat as level 2
            breadcrumb = [("Main", "main.html"), (base_name.replace('-', ' ').title(), None)]

        return breadcrumb
    else:
        # Default: direct child of main
        return [("Main", "main.html"), (base_name.replace('-', ' ').title(), None)]

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

                # Create proper breadcrumb navigation
                breadcrumb = get_parent_file_info(md_file)

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
