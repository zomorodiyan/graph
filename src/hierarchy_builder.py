"""
YAML-based hierarchy builder for the graph application.
Handles building and managing hierarchy structure from a YAML configuration file.
"""
import os
import yaml


class HierarchyBuilder:
    """Builds and manages hierarchy structure from YAML configuration."""
    
    def __init__(self, yaml_file_path="../structure.yaml"):
        self.yaml_file_path = yaml_file_path
        self._structure_data = None
    
    def _load_yaml_structure(self):
        """Load structure from YAML file."""
        if self._structure_data is None:
            try:
                with open(self.yaml_file_path, 'r', encoding='utf-8') as f:
                    self._structure_data = yaml.safe_load(f)
            except FileNotFoundError:
                raise FileNotFoundError(f"Structure file not found: {self.yaml_file_path}")
            except yaml.YAMLError as e:
                raise ValueError(f"Error parsing YAML file: {e}")
        return self._structure_data
    
    def get_breadcrumb_for_item(self, item_id):
        """Generate breadcrumb navigation for an item based on its ID."""
        structure = self._load_yaml_structure()
        
        # Parse the item ID to build breadcrumb path
        id_parts = item_id.split('_')
        breadcrumb = [("Data", "data.html")]
        
        if len(id_parts) >= 1:
            # Level 1
            level1_key = id_parts[0]
            if level1_key in structure['structure']:
                level1_item = structure['structure'][level1_key]
                breadcrumb.append((level1_item['title'], f"{level1_key}.html"))
        
        if len(id_parts) >= 2:
            # Level 2
            level2_key = id_parts[1]
            level1_item = structure['structure'][id_parts[0]]
            if level2_key in level1_item.get('children', {}):
                level2_item = level1_item['children'][level2_key]
                breadcrumb.append((level2_item['title'], f"{id_parts[0]}_{level2_key}.html"))
        
        if len(id_parts) >= 3:
            # Level 3 - the key might contain underscores, so join everything after the first two parts
            level3_key = '_'.join(id_parts[2:])  # For level_work_go_melt, this gives 'go_melt'
            level1_item = structure['structure'][id_parts[0]]
            level2_item = level1_item.get('children', {}).get(id_parts[1], {})
            if level3_key in level2_item.get('children', {}):
                level3_item = level2_item['children'][level3_key]
                breadcrumb.append((level3_item['title'], f"{item_id}.html"))
        
        return breadcrumb
    
    def parse_structure_for_display(self, target_id="data"):
        """Parse YAML structure and build 3-level hierarchy data for display."""
        structure = self._load_yaml_structure()
        
        if target_id == "data":
            # Return top-level view
            return self._build_top_level_view(structure)
        else:
            # Return specific item view
            return self._build_item_view(structure, target_id)
    
    def _build_top_level_view(self, structure):
        """Build the top-level view showing all main categories."""
        data = []
        
        for key, item in structure['structure'].items():
            layer1_data = {
                "layer1": item['title'],
                "layer1_id": item['id'],
                "layer1_context": item.get('context'),
                "layer2": []
            }
            
            # Add layer 2 items
            for child_key, child_item in item.get('children', {}).items():
                layer2_data = {
                    "name": child_item['title'],
                    "id": child_item['id'],
                    "context": child_item.get('context'),
                    "layer3": []
                }
                
                # Add layer 3 items
                for grandchild_key, grandchild_item in child_item.get('children', {}).items():
                    layer3_data = {
                        "name": grandchild_item['title'],
                        "id": grandchild_item['id'],
                        "context": grandchild_item.get('context')
                    }
                    layer2_data["layer3"].append(layer3_data)
                
                layer1_data["layer2"].append(layer2_data)
            
            data.append(layer1_data)
        
        return data
    
    def _build_item_view(self, structure, target_id):
        """Build a specific item view based on target ID."""
        # Parse target ID to find the item
        id_parts = target_id.split('_')
        
        if len(id_parts) == 1:
            # Level 1 item view
            return self._build_level1_view(structure, id_parts[0])
        elif len(id_parts) == 2:
            # Level 2 item view
            return self._build_level2_view(structure, id_parts[0], id_parts[1])
        elif len(id_parts) == 3:
            # Level 3 item view
            return self._build_level3_view(structure, id_parts[0], id_parts[1], id_parts[2])
        else:
            # Fallback to top-level view
            return self._build_top_level_view(structure)
    
    def _build_level1_view(self, structure, level1_key):
        """Build view for a specific level 1 item."""
        if level1_key not in structure['structure']:
            return []
        
        level1_item = structure['structure'][level1_key]
        data = []
        
        layer1_data = {
            "layer1": level1_item['title'],
            "layer1_id": level1_item['id'],
            "layer1_context": level1_item.get('context'),
            "layer2": []
        }
        
        # Add all level 2 children
        for child_key, child_item in level1_item.get('children', {}).items():
            layer2_data = {
                "name": child_item['title'],
                "id": child_item['id'],
                "context": child_item.get('context'),
                "layer3": []
            }
            
            # Add layer 3 items
            for grandchild_key, grandchild_item in child_item.get('children', {}).items():
                layer3_data = {
                    "name": grandchild_item['title'],
                    "id": grandchild_item['id'],
                    "context": grandchild_item.get('context')
                }
                layer2_data["layer3"].append(layer3_data)
            
            layer1_data["layer2"].append(layer2_data)
        
        data.append(layer1_data)
        return data
    
    def _build_level2_view(self, structure, level1_key, level2_key):
        """Build view for a specific level 2 item."""
        if (level1_key not in structure['structure'] or 
            level2_key not in structure['structure'][level1_key].get('children', {})):
            return []
        
        level1_item = structure['structure'][level1_key]
        level2_item = level1_item['children'][level2_key]
        
        data = []
        layer1_data = {
            "layer1": level2_item['title'],
            "layer1_id": level2_item['id'],
            "layer1_context": level2_item.get('context'),
            "layer2": []
        }
        
        # Add all level 3 children as layer2 items
        for child_key, child_item in level2_item.get('children', {}).items():
            layer2_data = {
                "name": child_item['title'],
                "id": child_item['id'],
                "context": child_item.get('context'),
                "layer3": []  # Level 3 items don't have further children
            }
            layer1_data["layer2"].append(layer2_data)
        
        data.append(layer1_data)
        return data
    
    def _build_level3_view(self, structure, level1_key, level2_key, level3_key):
        """Build view for a specific level 3 item."""
        try:
            level3_item = structure['structure'][level1_key]['children'][level2_key]['children'][level3_key]
        except KeyError:
            return []
        
        data = []
        layer1_data = {
            "layer1": level3_item['title'],
            "layer1_id": level3_item['id'],
            "layer1_context": level3_item.get('context'),
            "layer2": []  # Level 3 items typically don't have children
        }
        
        data.append(layer1_data)
        return data
    
    def get_item_by_id(self, item_id):
        """Get a specific item by its ID."""
        structure = self._load_yaml_structure()
        id_parts = item_id.split('_')
        
        try:
            if len(id_parts) == 1:
                return structure['structure'][id_parts[0]]
            elif len(id_parts) == 2:
                return structure['structure'][id_parts[0]]['children'][id_parts[1]]
            elif len(id_parts) == 3:
                return structure['structure'][id_parts[0]]['children'][id_parts[1]]['children'][id_parts[2]]
        except KeyError:
            return None
        
        return None
    
    def item_exists(self, item_id):
        """Check if an item exists by its ID."""
        return self.get_item_by_id(item_id) is not None
    
    def get_all_items(self):
        """Get all items in the structure."""
        structure = self._load_yaml_structure()
        items = []
        
        for level1_key, level1_item in structure['structure'].items():
            items.append(level1_item)
            
            for level2_key, level2_item in level1_item.get('children', {}).items():
                items.append(level2_item)
                
                for level3_key, level3_item in level2_item.get('children', {}).items():
                    items.append(level3_item)
        
        return items