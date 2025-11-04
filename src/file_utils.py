"""
File utilities for the YAML-based graph application.
Handles YAML operations and utility functions.
"""
import os
import yaml


class FileUtils:
    """Utility class for YAML operations and path handling."""
    
    def __init__(self, yaml_file_path="../structure.yaml"):
        self.yaml_file_path = yaml_file_path
    
    def load_yaml_structure(self):
        """Load structure from YAML file."""
        try:
            with open(self.yaml_file_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            raise FileNotFoundError(f"Structure file not found: {self.yaml_file_path}")
        except yaml.YAMLError as e:
            raise ValueError(f"Error parsing YAML file: {e}")
    
    def get_all_items(self):
        """Get all items in the structure (supports unlimited depth)."""
        structure = self.load_yaml_structure()
        items = []
        
        def collect_items_recursive(items_dict, depth=1):
            for key, item in items_dict.items():
                # Add level information for backwards compatibility
                item_with_level = {**item, 'level': depth}
                items.append(item_with_level)
                
                if 'children' in item:
                    collect_items_recursive(item['children'], depth + 1)
        
        collect_items_recursive(structure['structure'])
        return items
    
    def get_all_non_leaf_items(self):
        """Get all items that have children (non-leaf nodes)."""
        structure = self.load_yaml_structure()
        items = []
        
        def collect_non_leaf_items_recursive(items_dict, depth=1):
            for key, item in items_dict.items():
                # Only add items that have non-empty children
                children = item.get('children', {})
                if children and len(children) > 0:
                    item_with_level = {**item, 'level': depth}
                    items.append(item_with_level)
                    collect_non_leaf_items_recursive(item['children'], depth + 1)
        
        collect_non_leaf_items_recursive(structure['structure'])
        return items
    
    def is_leaf_node(self, item_id):
        """Check if an item is a leaf node (has no children or empty children)."""
        structure = self.load_yaml_structure()
        
        def find_item_recursive(items_dict):
            for key, item in items_dict.items():
                if item.get('id') == item_id:
                    # Check if children doesn't exist or is empty
                    children = item.get('children', {})
                    return not children or len(children) == 0
                if 'children' in item and item['children']:
                    result = find_item_recursive(item['children'])
                    if result is not None:
                        return result
            return None
        
        result = find_item_recursive(structure['structure'])
        return result if result is not None else False
    
    def search_items(self, query):
        """Search for items matching a query."""
        all_items = self.get_all_items()
        query_lower = query.lower()
        
        matching_items = []
        for item in all_items:
            if (query_lower in item.get('title', '').lower() or 
                query_lower in item.get('context', '').lower() or
                query_lower in item.get('id', '').lower()):
                matching_items.append(item)
        
        return matching_items
    
    @staticmethod
    def ensure_html_directory_exists():
        """Create html directory if it doesn't exist."""
        html_dir = "../html"
        os.makedirs(html_dir, exist_ok=True)
        return html_dir