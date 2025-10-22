"""
File utilities for the graph application.
Handles file operations, path normalization, and directory traversal.
"""
import os
import re


class FileUtils:
    """Utility class for file operations and path handling."""
    
    @staticmethod
    def normalize_path(path):
        """Normalize path separators to forward slashes for consistency."""
        if not path:
            return path
        return path.replace('\\', '/')
    
    @staticmethod
    def get_markdown_files_from_directories():
        """Get all markdown files from both data and pdata directories recursively."""
        md_files = []
        search_dirs = [os.path.join('..', 'data'), os.path.join('..', 'pdata')]
        
        for dir_path in search_dirs:
            if os.path.exists(dir_path):
                for root, dirs, files in os.walk(dir_path):
                    for f in files:
                        if f.endswith('.md'):
                            full_path = os.path.join(root, f)
                            # Normalize path separators for consistency
                            md_files.append(FileUtils.normalize_path(full_path))
        
        return md_files
    
    @staticmethod
    def find_file_in_directories(filename_or_path):
        """Find a markdown file in data or pdata directories."""
        search_dirs = [os.path.join('..', 'data'), os.path.join('..', 'pdata')]
        
        for dir_path in search_dirs:
            if os.path.exists(dir_path):
                for root, dirs, files in os.walk(dir_path):
                    # Check both exact filename and path matches
                    if filename_or_path in files:
                        found_path = os.path.join(root, filename_or_path)
                        return FileUtils.normalize_path(found_path)
                    
                    # Also check if the full path matches
                    full_path = os.path.join(root, filename_or_path)
                    if os.path.exists(full_path):
                        return FileUtils.normalize_path(full_path)
        
        return None
    
    @staticmethod
    def check_file_exists(file_path):
        """Check if a file exists in data or pdata directories."""
        if not file_path:
            return False
        
        # If it's already a full path (contains ../), use it directly
        if '../' in file_path:
            return os.path.exists(file_path)
        
        # Otherwise, search in both directories
        found_path = FileUtils.find_file_in_directories(file_path)
        return found_path is not None
    
    @staticmethod
    def read_layers_from_md(filepath):
        """Read markdown file and extract layers with their hierarchy levels."""
        result = []
        
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('#'):
                    # Count the number of # symbols to determine level
                    level = len(line) - len(line.lstrip('#'))
                    # Extract the text after #
                    text = line.lstrip('#').strip()
                    result.append((text, level))
        
        return result
    
    @staticmethod
    def extract_deadline_from_md(filepath):
        """Extract deadline text from markdown file comments."""
        if not filepath or not os.path.exists(filepath):
            return None
            
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Look for deadline comment pattern: <!-- deadline: text -->
            deadline_match = re.search(r'<!--\s*deadline:\s*([^-]+?)\s*-->', content, re.IGNORECASE)
            if deadline_match:
                return deadline_match.group(1).strip()
                
        except Exception as e:
            print(f"Error reading deadline from {filepath}: {e}")
            
        return None
    
    @staticmethod
    def get_path_components_from_file_path(file_path):
        """Convert file path to hierarchy components, removing base directory and extension."""
        # Normalize path separators to forward slashes for consistency
        normalized_path = FileUtils.normalize_path(file_path)
        
        if normalized_path.startswith('../data/'):
            relative_path = normalized_path[8:]  # Remove '../data/'
        elif normalized_path.startswith('../pdata/'):
            relative_path = normalized_path[9:]  # Remove '../pdata/'
        else:
            return None
        
        # Remove .md extension and split by directory separators
        path_without_ext = os.path.splitext(relative_path)[0]
        return path_without_ext.split('/')
    
    @staticmethod
    def ensure_html_directory_exists():
        """Create html directory if it doesn't exist."""
        html_dir = "../html"
        os.makedirs(html_dir, exist_ok=True)
        return html_dir