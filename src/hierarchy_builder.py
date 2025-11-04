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
    
    def get_breadcrumb_for_file(self, file_path):
        """Generate breadcrumb navigation for a file based on its directory structure."""
        # Get path components from the file path
        path_parts = self.file_utils.get_path_components_from_file_path(file_path)
        
        if not path_parts:
            return [("Data", "data.html")]
        
        breadcrumb = [("Data", "data.html")]
        
        # Build breadcrumb by walking through directory levels
        for i, part in enumerate(path_parts[:-1]):  # Exclude the current file
            display_name = part.replace('-', ' ').title()
            html_name = f"{'/'.join(path_parts[:i+1])}.html"
            breadcrumb.append((display_name, html_name))
        
        return breadcrumb

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
            
            # Special case: top-level files (like 'level', 'body', etc.) should be children of 'data'
            elif len(path_parts) == 1 and hierarchy_key != 'data':
                if 'data' in hierarchy:
                    self._add_child_if_not_exists(
                        hierarchy['data'], 
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
        
        # If we're at data level, find the file for the layer2 item
        if base_name == 'data':
            # Look for direct children of data that match layer2_name
            if 'data' in hierarchy:
                for child in hierarchy['data']['children']:
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
        """Parse markdown file or directory and build 3-level hierarchy data for display using filesystem discovery."""
        # Handle directory path (for data/ root)
        if os.path.isdir(filepath):
            hierarchy_key = "data"
            scan_path = filepath
        else:
            # Handle file path
            path_parts = self.file_utils.get_path_components_from_file_path(filepath)
            if not path_parts:
                # Fallback for files not in standard directories
                relative_path = filepath
                hierarchy_key = os.path.splitext(relative_path)[0]
            else:
                hierarchy_key = '/'.join(path_parts)
            scan_path = None
        
        # Build complete hierarchy from files for navigation
        file_hierarchy = self.build_hierarchy_from_files()
        
        data = []
        
        # Get subitems from filesystem
        if scan_path:
            # Direct directory scanning for data/ root
            level1_items = self._scan_directory(scan_path)
        else:
            # File-based discovery for other files
            level1_items = self._get_subitems_from_filesystem(filepath)
        
        for level1_name in level1_items:
            level1_data = self._process_level1_item(
                level1_name, hierarchy_key, file_hierarchy
            )
            data.append(level1_data)
        
        return data
    
    def _scan_directory(self, dir_path):
        """Scan a directory directly for subitems, avoiding duplicates."""
        subitems = []
        found_items = set()
        
        if os.path.exists(dir_path) and os.path.isdir(dir_path):
            # First pass: collect .md files (they take priority)
            for item in os.listdir(dir_path):
                if item.endswith('.md'):
                    item_name = os.path.splitext(item)[0]
                    subitems.append(item_name)
                    found_items.add(item_name)
            
            # Second pass: collect directories only if no corresponding .md file exists
            for item in os.listdir(dir_path):
                item_path = os.path.join(dir_path, item)
                if os.path.isdir(item_path) and item not in found_items:
                    subitems.append(item)
                    found_items.add(item)
        
        # Sort alphabetically for consistent ordering
        return sorted(subitems)
    
    def _get_subitems_from_filesystem(self, filepath):
        """Discover subitems by scanning the filesystem and reading MD headers."""
        # Get the directory that corresponds to this file
        base_name = os.path.splitext(os.path.basename(filepath))[0]
        dir_path = os.path.dirname(filepath)
        
        # Special case for data.md - scan the data directory directly
        if base_name == 'data':
            scan_path = dir_path  # Use data/ directory directly
            md_file_path = None  # No corresponding .md file for data directory
        else:
            # Look for a subdirectory with the same name as the file
            scan_path = os.path.join(dir_path, base_name)
            md_file_path = filepath  # The .md file itself
        
        subitems = []
        found_items = set()
        
        # First: Read headers from the .md file if it exists
        if md_file_path and os.path.exists(md_file_path):
            md_headers = self._extract_headers_from_md(md_file_path)
            for header in md_headers:
                subitems.append(header)
                found_items.add(header)
        
        # Second: Scan filesystem if directory exists
        if os.path.exists(scan_path) and os.path.isdir(scan_path):            
            # Third pass: collect .md files (they take priority over directories)
            for item in os.listdir(scan_path):
                if item.endswith('.md'):
                    item_name = os.path.splitext(item)[0]
                    # Skip data.md when scanning data directory (data.md doesn't exist)
                    if base_name == 'data' and item_name == 'data':
                        continue
                    if item_name not in found_items:
                        subitems.append(item_name)
                        found_items.add(item_name)
            
            # Fourth pass: collect directories only if no corresponding .md file exists
            for item in os.listdir(scan_path):
                item_path = os.path.join(scan_path, item)
                if os.path.isdir(item_path) and item not in found_items:
                    subitems.append(item)
                    found_items.add(item)
        
        # Sort alphabetically for consistent ordering
        return sorted(subitems)
    
    def _extract_headers_from_md(self, md_file_path):
        """Extract #HeaderName patterns from markdown file."""
        headers = []
        try:
            with open(md_file_path, 'r', encoding='utf-8') as file:
                for line in file:
                    line = line.strip()
                    # Look for lines that start with #HeaderName (no space after #)
                    if line.startswith('#') and len(line) > 1 and line[1] != ' ':
                        # Extract the header name after the #
                        header_name = line[1:].strip()
                        if header_name:  # Make sure it's not empty
                            headers.append(header_name)
        except (IOError, UnicodeDecodeError):
            # If we can't read the file, just return empty list
            pass
        
        return headers
    
    def _process_level1_item(self, level1_name, hierarchy_key, file_hierarchy):
        """Process a level 1 item and build its complete hierarchy."""
        # For data directory root, look for direct children
        if hierarchy_key == "data":
            # Find file directly in data directory
            level1_file = self._find_data_root_child_file(level1_name)
        else:
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
            "layer1_context": self.file_utils.extract_context_from_md(level1_file),
            "layer2": level2_items
        }
    
    def _process_level2_items(self, level1_file, file_hierarchy):
        """Process level 2 items from filesystem discovery."""
        # Get level 2 items from filesystem instead of MD content
        level2_content = self._get_subitems_from_filesystem(level1_file)
        
        # Get hierarchy key for level1 file
        level1_hierarchy_key = self._get_hierarchy_key_from_file(level1_file)
        
        level2_items = []
        for level2_name in level2_content:
            # Try to find level2 file using hierarchy, or direct path construction
            level2_file = self._find_matching_child_file(
                level2_name, level1_hierarchy_key, file_hierarchy
            )
            
            # If not found in hierarchy, try direct path construction
            if not level2_file:
                level2_file = self._find_level2_file_direct(level1_file, level2_name)
            
            # Get level 3 items (from the grandchild file)
            level3_items = []
            if level2_file and os.path.exists(level2_file):
                level3_items = self._process_level3_items(level2_file, file_hierarchy)
            
            level2_items.append({
                "name": level2_name,
                "filename": level2_file,
                "context": self.file_utils.extract_context_from_md(level2_file),
                "layer3": level3_items
            })
        
        return level2_items
    
    def _process_level3_items(self, level2_file, file_hierarchy):
        """Process level 3 items from filesystem discovery."""
        # Get level 3 items from filesystem instead of MD content
        level3_content = self._get_subitems_from_filesystem(level2_file)
        
        # Get hierarchy key for level2 file
        level2_hierarchy_key = self._get_hierarchy_key_from_file(level2_file)
        
        level3_items = []
        for level3_name in level3_content:
            # Try to find level3 file using hierarchy, or direct path construction
            level3_file = self._find_matching_child_file(
                level3_name, level2_hierarchy_key, file_hierarchy
            )
            
            # If not found in hierarchy, try direct path construction
            if not level3_file:
                level3_file = self._find_level3_file_direct(level2_file, level3_name)
            
            level3_items.append({
                "name": level3_name,
                "filename": level3_file,
                "context": self.file_utils.extract_context_from_md(level3_file)
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
    
    def _find_data_root_child_file(self, item_name):
        """Find a file in the data directory root for the given item name."""
        # Get the data directory path relative to current location
        # We know we're in src/, so data is ../data
        data_dir = os.path.join("..", "data")
        
        # Try .md file first
        md_file = os.path.join(data_dir, f"{item_name}.md")
        if os.path.exists(md_file):
            return md_file
        
        # Try directory with same name
        dir_path = os.path.join(data_dir, item_name)
        if os.path.exists(dir_path) and os.path.isdir(dir_path):
            # Look for an .md file inside the directory with same name
            inner_md_file = os.path.join(dir_path, f"{item_name}.md")
            if os.path.exists(inner_md_file):
                return inner_md_file
        
        return None
    
    def _find_level2_file_direct(self, level1_file, level2_name):
        """Find level 2 file using direct path construction."""
        # Get the base name and directory of level1 file
        level1_base = os.path.splitext(os.path.basename(level1_file))[0]
        level1_dir = os.path.dirname(level1_file)
        
        # Look in the subdirectory named after level1 file
        level1_subdir = os.path.join(level1_dir, level1_base)
        
        if os.path.exists(level1_subdir) and os.path.isdir(level1_subdir):
            # Try .md file first
            level2_md_file = os.path.join(level1_subdir, f"{level2_name}.md")
            if os.path.exists(level2_md_file):
                return level2_md_file
            
            # Try subdirectory
            level2_subdir = os.path.join(level1_subdir, level2_name)
            if os.path.exists(level2_subdir) and os.path.isdir(level2_subdir):
                # Look for .md file inside the subdirectory
                inner_md_file = os.path.join(level2_subdir, f"{level2_name}.md")
                if os.path.exists(inner_md_file):
                    return inner_md_file
        
        return None
    
    def _find_level3_file_direct(self, level2_file, level3_name):
        """Find level 3 file using direct path construction, handling both .md files and directories."""
        # Get the base name and directory of level2 file
        level2_base = os.path.splitext(os.path.basename(level2_file))[0]
        level2_dir = os.path.dirname(level2_file)
        
        # Look in the subdirectory named after level2 file
        level2_subdir = os.path.join(level2_dir, level2_base)
        
        if os.path.exists(level2_subdir) and os.path.isdir(level2_subdir):
            # Try .md file first
            level3_md_file = os.path.join(level2_subdir, f"{level3_name}.md")
            if os.path.exists(level3_md_file):
                return level3_md_file
            
            # Try subdirectory - this is what was missing!
            level3_subdir = os.path.join(level2_subdir, level3_name)
            if os.path.exists(level3_subdir) and os.path.isdir(level3_subdir):
                # Look for .md file inside the subdirectory
                inner_md_file = os.path.join(level3_subdir, f"{level3_name}.md")
                if os.path.exists(inner_md_file):
                    return inner_md_file
                # If no .md file in directory, the directory itself represents the item
                return level3_subdir  # Return the directory path for directory-only items
        
        # If not found in subdirectory, check if this is a header from the parent .md file
        if level2_file and os.path.exists(level2_file):
            headers = self._extract_headers_from_md(level2_file)
            if level3_name in headers:
                # Return the parent .md file for header-based items
                return level2_file
        
        return None