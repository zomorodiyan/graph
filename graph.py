def get_text_width(ax, text, fontsize=11):
    # Draw the text invisibly, then measure its width
    t = ax.text(0, 0, text, fontsize=fontsize, visible=False)
    ax.figure.canvas.draw()
    t.set_visible(True)
    bbox = t.get_window_extent()
    t.remove()
    inv = ax.transData.inverted()
    bbox_data = bbox.transformed(inv)
    width = bbox_data.width
    return width

# Tunable constant for underline length
underline_pad = 0.5
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(14, 6))
ax.axis('off')

# Hierarchical data structure: layer1 -> layer2 -> layer3
data = [
    {
        "layer1": "ProjectAlpha",
        "layer2": [
            {
                "name": "TaskA",
                "layer3": ["SubA1", "SubA2Long"]
            },
            {
                "name": "LongerTaskB", 
                "layer3": ["SubB1", "SubB2"]
            },
            {
                "name": "C",
                "layer3": ["SubC1Longer", "SubC2"]
            }
        ]
    },
    {
        "layer1": "ProjBetaLong",
        "layer2": [
            {
                "name": "Short",
                "layer3": ["SubS1", "SubS2"]
            },
            {
                "name": "MediumLengthTask",
                "layer3": ["SubM1Long", "SubM2"]
            },
            {
                "name": "VeryLongTaskNameHere",
                "layer3": ["SubV1", "SubV2VeryLong"]
            }
        ]
    },
    {
        "layer1": "Gamma",
        "layer2": [
            {
                "name": "X",
                "layer3": ["SubX1", "SubX2"]
            },
            {
                "name": "Y",
                "layer3": ["SubY1Long", "SubY2"]
            },
            {
                "name": "Zebra",
                "layer3": ["SubZ1", "SubZ2"]
            }
        ]
    },
    {
        "layer1": "DeltaProjectX",
        "layer2": [
            {
                "name": "First",
                "layer3": ["SubF1", "SubF2"]
            },
            {
                "name": "Second",
                "layer3": ["SubS1", "SubS2Longer"]
            },
            {
                "name": "ThirdExtraLong",
                "layer3": ["SubT1", "SubT2"]
            }
        ]
    },
    {
        "layer1": "Epsilon",
        "layer2": [
            {
                "name": "One",
                "layer3": ["SubO1", "SubO2"]
            },
            {
                "name": "Two",
                "layer3": ["SubT1Long", "SubT2"]
            },
            {
                "name": "Three",
                "layer3": ["SubTh1", "SubTh2"]
            }
        ]
    }
]

# Updated color palette: Green, Blue, Purple, Red (repeat if needed)
base_colors = [
    ("#A5D6A7", "#388E3C", "#1B5E20"),  # Green shades
    ("#90CAF9", "#1976D2", "#0D47A1"),  # Blue shades
    ("#CE93D8", "#8E24AA", "#4A148C"),  # Purple shades
    ("#FFAB91", "#D84315", "#BF360C"),  # Red shades
]
colors = [base_colors[i % 4] for i in range(len(data))]

# --- Control variables for layout ---
char_width = 13         # width per character for underline and spacing (human-friendly)
base_pad = 2            # base padding for underline length (human-friendly)
item_height = 10        # vertical distance between subitems (second layer)

coords = {}
subnames = {}
y_positions = []

y = 0
for i in range(len(data)):
    layer1 = data[i]["layer1"]
    coords[layer1] = (0, y)
    sub_y_positions = []
    layer1_end_x = len(layer1) * char_width + base_pad
    layer2_start_x = layer1_end_x
    for j in range(len(data[i]["layer2"])):
        layer2 = data[i]["layer2"][j]["name"]
        layer2_len = len(layer2) * char_width + base_pad
        layer2_x = layer2_start_x
        layer2_y = y - item_height * j
        coords[layer2] = (layer2_x, layer2_y)
        subnames[layer2] = data[i]["layer2"][j]["layer3"]
        sub_y_positions.append(layer2_y)
        # Layer3 items side by side, no extra gap
        layer2_end_x = layer2_x + max(layer2_len, base_pad + len(layer2) * char_width)
        layer3_x = layer2_end_x
        for k in range(len(data[i]["layer2"][j]["layer3"])):
            layer3 = data[i]["layer2"][j]["layer3"][k]
            layer3_len = len(layer3) * char_width + base_pad
            coords[layer3] = (layer3_x, layer2_y)
            layer3_x += layer3_len
    lowest_sub_y = min(sub_y_positions)
    y_positions.append((lowest_sub_y, i))
    if i < len(data) - 1:
        y = lowest_sub_y - item_height



# Precompute all text widths after a canvas draw
layer1_widths = []
layer2_widths = []
layer3_widths = []
for idx in range(len(data)):
    layer1 = data[idx]["layer1"]
    layer1_widths.append(get_text_width(ax, layer1, fontsize=11))
    layer2_widths.append([])
    layer3_widths.append([])
    for j in range(len(data[idx]["layer2"])):
        layer2 = data[idx]["layer2"][j]["name"]
        layer2_widths[idx].append(get_text_width(ax, layer2, fontsize=11))
        layer3_widths[idx].append([])
        for k in range(len(data[idx]["layer2"][j]["layer3"])):
            layer3 = data[idx]["layer2"][j]["layer3"][k]
            layer3_widths[idx][j].append(get_text_width(ax, layer3, fontsize=11))

# Now plot everything using precomputed widths
for idx in range(len(data)):
    layer1 = data[idx]["layer1"]
    x, y = coords[layer1]
    light, medium, dark = colors[idx]
    layer1_width = layer1_widths[idx]
    underline_len = layer1_width
    ax.text(x, y, layer1, ha='left', va='center', fontsize=11, color='black')
    ax.plot([x, x+underline_len], [y-3, y-3], color=medium, lw=2)
    layer2_x = x + underline_len
    for j in range(len(data[idx]["layer2"])):
        layer2 = data[idx]["layer2"][j]["name"]
        layer2_y = y - item_height * j
        layer2_width = layer2_widths[idx][j]
        underline_len = layer2_width
        ax.text(layer2_x, layer2_y, layer2, ha='left', va='center', fontsize=11, color='black')
        ax.plot([layer2_x, layer2_x+underline_len], [layer2_y-3, layer2_y-3], color=light, lw=2)
        layer3_x = layer2_x + underline_len
        for k in range(len(data[idx]["layer2"][j]["layer3"])):
            layer3 = data[idx]["layer2"][j]["layer3"][k]
            layer3_y = layer2_y
            layer3_width = layer3_widths[idx][j][k]
            underline_len = layer3_width
            ax.text(layer3_x, layer3_y, layer3, ha='left', va='center', fontsize=11, color='black')
            ax.plot([layer3_x, layer3_x+underline_len], [layer3_y-3, layer3_y-3], color=dark, lw=2)
            layer3_x += underline_len

plt.tight_layout()
plt.show()