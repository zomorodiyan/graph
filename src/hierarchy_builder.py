"""
Hierarchy builder for the graph application.
Handles building and managing the directory-based hierarchy structure.
"""
import os
from file_utils import FileUtils


class HierarchyBuilder:
    """Builds and manages hierarchy structure from directory-based markdown files."""
    
    def __init__(self):
        self.file_utils = FileUtils()
    
    def build_hierarchy_from_files(self):
        """Build complete hierarchy structure from directory-based markdown files."""
        # Get all markdown files from both directories
        md_file_paths = self.file_utils.get_markdown_files_from_directories()
        
        # Create hierarchy mapping based on directory structure
        hierarchy = {}
        
        for md_file_path in md_file_paths:
            path_parts = self.file_utils.get_path_components_from_file_path(md_file_path)
            if not path_parts:
                continue
            
            # Create hierarchy entry for this file
            hierarchy_key = '/'.join(path_parts)
            hierarchy[hierarchy_key] = {
                'children': [],
                'level': len(path_parts),
                'filename': md_file_path,
                'directory': os.path.dirname(md_file_path)
            }
        
        # Now establish parent-child relationships
        self._establish_parent_child_relationships(hierarchy)
        
        return hierarchy
    
    def _establish_parent_child_relationships(self, hierarchy):
        """Establish parent-child relationships in the hierarchy."""
        for hierarchy_key, entry in hierarchy.items():
            path_parts = hierarchy_key.split('/')
            
            # If this file has a parent directory, establish parent-child relationship
            if len(path_parts) > 1:
                parent_key = '/'.join(path_parts[:-1])
                child_name = path_parts[-1]
                
                # Add child relationship if parent exists
                if parent_key in hierarchy:
                    self._add_child_if_not_exists(
                        hierarchy[parent_key], 
                        hierarchy_key, 
                        child_name, 
                        entry['filename'], 
                        len(path_parts)
                    )
            
            # Special case: top-level files (like 'level', 'body', etc.) should be children of 'main'
            elif len(path_parts) == 1 and hierarchy_key != 'main':
                if 'main' in hierarchy:
                    self._add_child_if_not_exists(
                        hierarchy['main'], 
                        hierarchy_key, 
                        hierarchy_key, 
                        entry['filename'], 
                        1
                    )
    
    def _add_child_if_not_exists(self, parent_entry, child_key, child_name, filename, level):
        """Add child to parent if it doesn't already exist."""
        existing_child = next(
            (child for child in parent_entry['children'] if child['name'] == child_key), 
            None
        )
        if not existing_child:
            parent_entry['children'].append({
                'name': child_key,
                'display_name': child_name.replace('-', ' ').title(),
                'filename': filename,
                'level': level
            })
    
    def get_file_association_dynamic(self, layer1_name, layer2_name, current_file):
        """Dynamically map layer2 items to their associated markdown files based on current context."""
        hierarchy = self.build_hierarchy_from_files()
        base_name = os.path.splitext(os.path.basename(current_file))[0]
        
        # If we're at main level, find the file for the layer2 item
        if base_name == 'main':
            # Look for direct children of main that match layer2_name
            if 'main' in hierarchy:
                for child in hierarchy['main']['children']:
                    if child['display_name'].lower() == layer2_name.lower():
                        return child['filename']
        else:
            # Look for children of current file that match layer2_name
            if base_name in hierarchy:
                for child in hierarchy[base_name]['children']:
                    if child['display_name'].lower() == layer2_name.lower():
                        return child['filename']
        
        return None
    
    def parse_md_hierarchy(self, filepath):
        """Parse markdown file and build 3-level hierarchy data for display."""
        path_parts = self.file_utils.get_path_components_from_file_path(filepath)
        if not path_parts:
            # Fallback for files not in standard directories
            relative_path = filepath
            hierarchy_key = os.path.splitext(relative_path)[0]
        else:
            hierarchy_key = '/'.join(path_parts)
        
        # Read the content from the markdown file
        layers = self.file_utils.read_layers_from_md(filepath)
        
        # Build complete hierarchy from files for navigation
        file_hierarchy = self.build_hierarchy_from_files()
        
        data = []
        
        # Group layers by level
        level1_items = [item for item in layers if item[1] == 1]  # # items
        
        for level1_name, _ in level1_items:
            level1_data = self._process_level1_item(
                level1_name, hierarchy_key, file_hierarchy
            )
            data.append(level1_data)
        
        return data
    
    def _process_level1_item(self, level1_name, hierarchy_key, file_hierarchy):
        """Process a level 1 item and build its complete hierarchy."""
        # Find corresponding file for this level1 item
        level1_file = self._find_matching_child_file(
            level1_name, hierarchy_key, file_hierarchy
        )
        
        # Get level 2 items (from the child file)
        level2_items = []
        if level1_file and os.path.exists(level1_file):
            level2_items = self._process_level2_items(level1_file, file_hierarchy)
        
        return {
            "layer1": level1_name,
            "layer1_filename": level1_file,
            "layer1_deadline": self.file_utils.extract_deadline_from_md(level1_file),
            "layer2": level2_items
        }
    
    def _process_level2_items(self, level1_file, file_hierarchy):
        """Process level 2 items from a level 1 file."""
        level1_layers = self.file_utils.read_layers_from_md(level1_file)
        level2_content = [item for item in level1_layers if item[1] == 1]  # # items from child file
        
        # Get hierarchy key for level1 file
        level1_hierarchy_key = self._get_hierarchy_key_from_file(level1_file)
        
        level2_items = []
        for level2_name, _ in level2_content:
            level2_file = self._find_matching_child_file(
                level2_name, level1_hierarchy_key, file_hierarchy
            )
            
            # Get level 3 items (from the grandchild file)
            level3_items = []
            if level2_file and os.path.exists(level2_file):
                level3_items = self._process_level3_items(level2_file, file_hierarchy)
            
            level2_items.append({
                "name": level2_name,
                "filename": level2_file,
                "deadline": self.file_utils.extract_deadline_from_md(level2_file),
                "layer3": level3_items
            })
        
        return level2_items
    
    def _process_level3_items(self, level2_file, file_hierarchy):
        """Process level 3 items from a level 2 file."""
        level2_layers = self.file_utils.read_layers_from_md(level2_file)
        level3_content = [item[0] for item in level2_layers if item[1] == 1]  # # items from grandchild file
        
        # Get hierarchy key for level2 file
        level2_hierarchy_key = self._get_hierarchy_key_from_file(level2_file)
        
        level3_items = []
        for level3_name in level3_content:
            level3_file = self._find_matching_child_file(
                level3_name, level2_hierarchy_key, file_hierarchy
            )
            
            level3_items.append({
                "name": level3_name,
                "filename": level3_file,
                "deadline": self.file_utils.extract_deadline_from_md(level3_file)
            })
        
        return level3_items
    
    def _get_hierarchy_key_from_file(self, file_path):
        """Get hierarchy key from file path."""
        path_parts = self.file_utils.get_path_components_from_file_path(file_path)
        if path_parts:
            return '/'.join(path_parts)
        return os.path.splitext(file_path)[0]
    
    def _find_matching_child_file(self, item_name, parent_hierarchy_key, file_hierarchy):
        """Find matching child file for an item name."""
        if parent_hierarchy_key not in file_hierarchy:
            return None
        
        # Normalize the item_name the same way as display_name is created
        normalized_name = item_name.replace('-', ' ').lower()
        
        for child in file_hierarchy[parent_hierarchy_key]['children']:
            if child['display_name'].lower() == normalized_name:
                return child['filename']
        
        return None