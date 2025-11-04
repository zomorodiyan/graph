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
    
    @staticmethod
    def normalize_path(path):
        """Normalize path separators to forward slashes for consistency."""
        if not path:
            return path
        return path.replace('\\', '/')
    
    def load_yaml_structure(self):
        """Load structure from YAML file."""
        try:
            with open(self.yaml_file_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            raise FileNotFoundError(f"Structure file not found: {self.yaml_file_path}")
        except yaml.YAMLError as e:
            raise ValueError(f"Error parsing YAML file: {e}")
    
    def save_yaml_structure(self, data):
        """Save structure to YAML file."""
        try:
            with open(self.yaml_file_path, 'w', encoding='utf-8') as f:
                yaml.dump(data, f, default_flow_style=False, allow_unicode=True, indent=2)
            return True
        except Exception as e:
            print(f"Error saving YAML file: {e}")
            return False
    
    def item_exists(self, item_id):
        """Check if an item exists by its ID."""
        structure = self.load_yaml_structure()
        id_parts = item_id.split('_')
        
        try:
            if len(id_parts) == 1:
                return id_parts[0] in structure['structure']
            elif len(id_parts) == 2:
                return (id_parts[0] in structure['structure'] and 
                        id_parts[1] in structure['structure'][id_parts[0]].get('children', {}))
            elif len(id_parts) == 3:
                return (id_parts[0] in structure['structure'] and 
                        id_parts[1] in structure['structure'][id_parts[0]].get('children', {}) and
                        id_parts[2] in structure['structure'][id_parts[0]]['children'][id_parts[1]].get('children', {}))
        except (KeyError, TypeError):
            return False
        
        return False
    
    def get_item_by_id(self, item_id):
        """Get a specific item by its ID."""
        structure = self.load_yaml_structure()
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
    
    def update_item(self, item_id, updates):
        """Update an item's properties."""
        structure = self.load_yaml_structure()
        id_parts = item_id.split('_')
        
        try:
            # Navigate to the item
            if len(id_parts) == 1:
                item = structure['structure'][id_parts[0]]
            elif len(id_parts) == 2:
                item = structure['structure'][id_parts[0]]['children'][id_parts[1]]
            elif len(id_parts) == 3:
                item = structure['structure'][id_parts[0]]['children'][id_parts[1]]['children'][id_parts[2]]
            else:
                return False
            
            # Apply updates
            for key, value in updates.items():
                item[key] = value
            
            # Save the updated structure
            return self.save_yaml_structure(structure)
        
        except KeyError:
            return False
    
    def add_item(self, parent_id, item_data):
        """Add a new item under a parent."""
        structure = self.load_yaml_structure()
        
        try:
            if parent_id == "root":
                # Add to root level
                structure['structure'][item_data['id']] = item_data
            else:
                parent_id_parts = parent_id.split('_')
                
                # Navigate to parent
                if len(parent_id_parts) == 1:
                    parent = structure['structure'][parent_id_parts[0]]
                elif len(parent_id_parts) == 2:
                    parent = structure['structure'][parent_id_parts[0]]['children'][parent_id_parts[1]]
                else:
                    return False
                
                # Ensure children dict exists
                if 'children' not in parent:
                    parent['children'] = {}
                
                # Add the new item
                parent['children'][item_data['id'].split('_')[-1]] = item_data
            
            # Save the updated structure
            return self.save_yaml_structure(structure)
        
        except KeyError:
            return False
    
    def remove_item(self, item_id):
        """Remove an item from the structure."""
        structure = self.load_yaml_structure()
        id_parts = item_id.split('_')
        
        try:
            if len(id_parts) == 1:
                # Remove from root level
                del structure['structure'][id_parts[0]]
            elif len(id_parts) == 2:
                # Remove from level 1 children
                del structure['structure'][id_parts[0]]['children'][id_parts[1]]
            elif len(id_parts) == 3:
                # Remove from level 2 children
                del structure['structure'][id_parts[0]]['children'][id_parts[1]]['children'][id_parts[2]]
            else:
                return False
            
            # Save the updated structure
            return self.save_yaml_structure(structure)
        
        except KeyError:
            return False
    
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
    
    def get_structure_metadata(self):
        """Get metadata from the structure file."""
        structure = self.load_yaml_structure()
        return structure.get('metadata', {})
    
    def update_metadata(self, metadata_updates):
        """Update metadata in the structure file."""
        structure = self.load_yaml_structure()
        
        if 'metadata' not in structure:
            structure['metadata'] = {}
        
        structure['metadata'].update(metadata_updates)
        return self.save_yaml_structure(structure)