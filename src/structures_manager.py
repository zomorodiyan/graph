"""
Manager for multiple structure files (graphs).
Handles listing, creating, and deleting structures.
"""
import os
import re
from datetime import datetime
from pathlib import Path
from file_utils import FileUtils


class StructuresManager:
    """Manages multiple structure files in the structures/ directory."""
    
    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.project_root = os.path.abspath(os.path.join(base_dir, os.pardir))
        self.structures_dir = os.path.join(self.project_root, "structures")
        
        # Ensure structures directory exists
        os.makedirs(self.structures_dir, exist_ok=True)
    
    def list_structures(self):
        """
        List all available structures.
        Returns list of dicts with name, path, and metadata.
        """
        structures = []
        
        if not os.path.exists(self.structures_dir):
            return structures
        
        for filename in os.listdir(self.structures_dir):
            if filename.endswith('.txt'):
                name = filename[:-4]  # Remove .txt extension
                file_path = os.path.join(self.structures_dir, filename)
                
                # Get file stats
                stats = os.stat(file_path)
                
                # Try to load metadata
                metadata = self._get_structure_metadata(file_path)
                
                structures.append({
                    "name": name,
                    "display_name": self._name_to_display(name),
                    "path": file_path,
                    "modified_at": datetime.fromtimestamp(stats.st_mtime).isoformat(),
                    "size": stats.st_size,
                    "description": metadata.get("description", ""),
                    "version": metadata.get("version", "1.0"),
                })
        
        # Sort by name
        structures.sort(key=lambda x: x["name"])
        return structures
    
    def _get_structure_metadata(self, file_path):
        """Extract metadata from a structure file."""
        try:
            file_utils = FileUtils(file_path)
            data = file_utils.load_yaml_structure()
            return data.get("metadata", {})
        except Exception:
            return {}
    
    def _name_to_display(self, name):
        """Convert filename to display name."""
        return name.replace('_', ' ').replace('-', ' ').title()
    
    def get_structure_path(self, name):
        """Get the full path for a structure by name."""
        # Sanitize name to prevent directory traversal
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '', name)
        return os.path.join(self.structures_dir, f"{safe_name}.txt")
    
    def structure_exists(self, name):
        """Check if a structure exists."""
        return os.path.exists(self.get_structure_path(name))
    
    def create_structure(self, name, description=""):
        """
        Create a new empty structure.
        Returns the created structure info.
        """
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '', name.lower().replace(' ', '_'))
        
        if not safe_name:
            raise ValueError("Invalid structure name")
        
        if self.structure_exists(safe_name):
            raise ValueError(f"Structure '{safe_name}' already exists")
        
        file_path = self.get_structure_path(safe_name)
        
        # Create structure with minimal content
        content = f"""metadata
  description: {description or 'A new knowledge graph'}
  version: 1.0
  updated_at: '{datetime.now().isoformat()}'
structure
  getting_started
    context: Add your first items here
"""
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return {
            "name": safe_name,
            "display_name": self._name_to_display(safe_name),
            "path": file_path,
        }
    
    def delete_structure(self, name):
        """Delete a structure file."""
        if not self.structure_exists(name):
            raise ValueError(f"Structure '{name}' not found")
        
        file_path = self.get_structure_path(name)
        os.remove(file_path)
        return {"deleted": name}
    
    def get_file_utils(self, name):
        """Get a FileUtils instance for a specific structure."""
        if not self.structure_exists(name):
            raise ValueError(f"Structure '{name}' not found")
        
        return FileUtils(self.get_structure_path(name))
