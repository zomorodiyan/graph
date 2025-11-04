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
        """Generate breadcrumb navigation for an item based on its ID (supports unlimited depth)."""
        structure = self._load_yaml_structure()
        
        # Find the item and build its path
        path = self._find_item_path(structure, item_id)
        
        # Convert path to breadcrumb
        breadcrumb = [("Data", "data.html")]
        
        for i, item in enumerate(path):
            if i == len(path) - 1:
                # Last item - don't include in clickable breadcrumb (it's the current page)
                continue
            else:
                breadcrumb.append((item['title'], f"{item['id']}.html"))
        
        return breadcrumb
    
    def _find_item_path(self, structure, target_id):
        """Find the full path to an item by its ID."""
        def search_recursive(items, current_path=[]):
            for key, item in items.items():
                new_path = current_path + [item]
                
                if item.get('id') == target_id:
                    return new_path
                
                if 'children' in item:
                    result = search_recursive(item['children'], new_path)
                    if result:
                        return result
            return None
        
        return search_recursive(structure['structure']) or []
    
    def parse_structure_for_display(self, target_id="data"):
        """Parse YAML structure and build 3-level hierarchy data for display from any starting point."""
        structure = self._load_yaml_structure()
        
        if target_id == "data":
            # Return top-level view (show first 3 levels)
            return self._build_dynamic_view(structure, None, 3)
        else:
            # Find the target item and show 3 levels below it
            target_item = self._find_item_by_id(structure, target_id)
            if target_item:
                return self._build_dynamic_view(structure, target_item, 3)
            else:
                # Fallback to top-level view
                return self._build_dynamic_view(structure, None, 3)
    
    def _find_item_by_id(self, structure, target_id):
        """Recursively find an item by its ID in the structure."""
        def search_recursive(items, depth=0):
            for key, item in items.items():
                if item.get('id') == target_id:
                    return item
                if 'children' in item:
                    result = search_recursive(item['children'], depth + 1)
                    if result:
                        return result
            return None
        
        return search_recursive(structure['structure'])
    
    def _build_dynamic_view(self, structure, start_item=None, levels_to_show=3):
        """Build a dynamic view showing specified number of levels from a starting point."""
        if start_item is None:
            # Start from root - show top-level items
            return self._build_levels_from_root(structure, levels_to_show)
        else:
            # Start from specific item - show its children
            return self._build_levels_from_item(start_item, levels_to_show)
    
    def _build_levels_from_root(self, structure, levels_to_show):
        """Build view starting from root structure."""
        data = []
        
        for key, item in structure['structure'].items():
            layer_data = self._build_item_with_children(item, levels_to_show - 1)
            data.append(layer_data)
        
        return data
    
    def _build_levels_from_item(self, item, levels_to_show):
        """Build view starting from a specific item."""
        # The item itself becomes layer1, its children become layer2, etc.
        return [self._build_item_with_children(item, levels_to_show - 1)]
    
    def _build_item_with_children(self, item, remaining_levels):
        """Recursively build an item with its children up to specified depth."""
        layer_data = {
            "layer1": item['title'],
            "layer1_id": item['id'],
            "layer1_context": item.get('context'),
            "layer2": []
        }
        
        if remaining_levels > 0 and 'children' in item:
            for child_key, child_item in item['children'].items():
                child_data = self._build_child_levels(child_item, remaining_levels - 1, 2)
                layer_data["layer2"].append(child_data)
        
        return layer_data
    
    def _build_child_levels(self, item, remaining_levels, current_level):
        """Recursively build child levels."""
        if current_level == 2:
            # Layer 2 structure
            child_data = {
                "name": item['title'],
                "id": item['id'],
                "context": item.get('context'),
                "layer3": []
            }
            
            if remaining_levels > 0 and 'children' in item:
                for grandchild_key, grandchild_item in item['children'].items():
                    grandchild_data = self._build_child_levels(grandchild_item, remaining_levels - 1, 3)
                    child_data["layer3"].append(grandchild_data)
            
            return child_data
            
        elif current_level == 3:
            # Layer 3 structure  
            return {
                "name": item['title'],
                "id": item['id'],
                "context": item.get('context')
            }
        
        # For deeper levels, we'd need to extend the HTML structure
        # For now, return basic structure
        return {
            "name": item['title'],
            "id": item['id'],
            "context": item.get('context')
        }