"""
File utilities for the structure-based graph application.
Handles file operations and utility functions.
"""
import os
from simple_parser import SimpleParser


class FileUtils:
    """Utility class for YAML operations and path handling."""
    
    def __init__(self, structure_file_path=None):
        # Resolve project root as the parent of this file's directory
        base_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.abspath(os.path.join(base_dir, os.pardir))
        # Use provided path or default to project-root/structure.txt
        self.structure_file_path = (
            structure_file_path
            if structure_file_path is not None
            else os.path.join(project_root, "structure.txt")
        )
    
    @property
    def structure_path(self):
        """Return the structure file path (alias for API compatibility)."""
        return self.structure_file_path
    
    def load_yaml_structure(self):
        """Load structure from file and auto-generate IDs based on key paths."""
        try:
            data = SimpleParser.parse_file(self.structure_file_path)
            
            # Auto-generate IDs based on hierarchical key paths
            if 'structure' in data:
                self._inject_ids(data['structure'])
            return data
        except FileNotFoundError:
            raise FileNotFoundError(f"Structure file not found: {self.structure_file_path}")
        except Exception as e:
            raise ValueError(f"Error parsing structure file: {e}")
    
    def _inject_ids(self, structure, parent_id=""):
        """Recursively inject 'id' and 'title' fields based on key path."""
        for key, item in structure.items():
            # Handle None/null values as empty dicts
            if item is None:
                item = {}
                structure[key] = item
            
            # Generate ID from parent_id + key
            if parent_id:
                item['id'] = f"{parent_id}_{key}"
            else:
                item['id'] = key
            
            # Generate title from key if not present
            if 'title' not in item:
                item['title'] = self._key_to_title(key)
            
            # Separate children from properties
            children = self._extract_children(item)
            if children:
                item['children'] = children
                self._inject_ids(children, item['id'])
            else:
                item['children'] = {}
    
    def _extract_children(self, item):
        """Extract child items from the item dict (anything that's not a known property)."""
        known_properties = {'id', 'title', 'progress', 'context', 'due', 'children'}
        children = {}
        keys_to_remove = []
        
        for key, value in item.items():
            if key not in known_properties and isinstance(value, dict):
                children[key] = value
                keys_to_remove.append(key)
        
        # Remove child items from the main dict
        for key in keys_to_remove:
            del item[key]
        
        return children
    
    def _key_to_title(self, key):
        """Convert a key to a title (replace underscores with spaces and title case)."""
        return key.replace('_', ' ').title()
    
    def save_structure(self, data):
        """
        Save structure to file with validation and backup.
        Uses atomic write (temp file + rename) for safety.
        """
        import shutil
        import tempfile
        from datetime import datetime
        
        # Validate data
        self._validate_structure(data.get('structure', {}))
        
        # Create backups directory
        backup_dir = os.path.join(os.path.dirname(self.structure_file_path), '..', 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        
        # Create backup of current file
        if os.path.exists(self.structure_file_path):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = os.path.join(backup_dir, f'structure_backup_{timestamp}.txt')
            shutil.copy2(self.structure_file_path, backup_path)
        
        # Write to temporary file first
        temp_fd, temp_path = tempfile.mkstemp(suffix='.txt', text=True)
        try:
            with os.fdopen(temp_fd, 'w', encoding='utf-8') as f:
                self._write_structure(f, data)
            
            # Atomic rename
            shutil.move(temp_path, self.structure_file_path)
        except Exception as e:
            # Clean up temp file on error
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise ValueError(f"Failed to save structure: {e}")
    
    def _validate_structure(self, structure, path=""):
        """Validate structure data recursively."""
        for key, value in structure.items():
            current_path = f"{path}.{key}" if path else key
            
            if value is None:
                continue
            
            if not isinstance(value, dict):
                raise ValueError(f"Invalid item at {current_path}: must be a dict")
            
            # Validate progress
            if 'progress' in value:
                progress = value['progress']
                if not isinstance(progress, int) or not (0 <= progress <= 100):
                    raise ValueError(f"Invalid progress at {current_path}: must be integer 0-100")
            
            # Validate due date format
            if 'due' in value:
                import re
                due = value['due']
                if not isinstance(due, str) or not re.match(r'^\d{4}-\d{2}-\d{2}$', due):
                    raise ValueError(f"Invalid due date at {current_path}: must be YYYY-MM-DD format")
            
            # Recurse into children
            for child_key, child_value in value.items():
                if child_key not in {'progress', 'context', 'due', 'id', 'title', 'children'}:
                    if isinstance(child_value, dict):
                        self._validate_structure({child_key: child_value}, current_path)
    
    def _write_structure(self, file, data):
        """Write structure to file in simple indented format."""
        # Write metadata section
        if 'metadata' in data:
            metadata = data['metadata']
            file.write('metadata\n')
            for key, value in metadata.items():
                if key == 'title':
                    continue  # Skip title, it's auto-generated
                file.write(f'  {key}: {value}\n')
        
        # Write structure section
        if 'structure' in data:
            file.write('structure\n')
            self._write_items(file, data['structure'], indent=1)
    
    def _write_items(self, file, items, indent=0):
        """Recursively write items in indented format."""
        indent_str = '  ' * indent
        
        for key, value in items.items():
            if value is None or (isinstance(value, dict) and not value):
                # Empty item
                file.write(f'{indent_str}{key}\n')
            elif isinstance(value, dict):
                # Item with properties or children
                file.write(f'{indent_str}{key}\n')
                
                # Write properties first
                for prop in ['progress', 'context', 'due']:
                    if prop in value:
                        prop_value = value[prop]
                        file.write(f'{indent_str}  {prop}: {prop_value}\n')
                
                # Write child items
                for child_key, child_value in value.items():
                    if child_key not in {'progress', 'context', 'due', 'id', 'title', 'children'}:
                        self._write_items(file, {child_key: child_value}, indent + 1)
    
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
        # Special time-based views that are dynamically generated should not be treated as leaf nodes
        time_view_ids = ['time_over', 'time_day', 'time_week', 'time_month']
        if item_id in time_view_ids:
            return False
        
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
    
    def get_descendants_with_children(self, parent_id):
        """Get all descendant item IDs that have children (non-leaf nodes) under a given parent."""
        structure = self.load_yaml_structure()
        descendants = []
        
        def find_and_collect_descendants(items_dict):
            for key, item in items_dict.items():
                item_id = item.get('id')
                if item_id and item_id.startswith(parent_id + '_'):
                    # This is a descendant of parent_id
                    children = item.get('children', {})
                    if children and len(children) > 0:
                        descendants.append(item_id)
                        # Continue searching in children
                        find_and_collect_descendants(children)
                elif 'children' in item and item['children']:
                    # Keep searching
                    find_and_collect_descendants(item['children'])
        
        find_and_collect_descendants(structure['structure'])
        return descendants
    
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
        """Create html directory under project root if it doesn't exist."""
        base_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.abspath(os.path.join(base_dir, os.pardir))
        html_dir = os.path.join(project_root, "html")
        os.makedirs(html_dir, exist_ok=True)
        return html_dir