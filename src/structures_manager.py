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
                    "display_name": metadata.get("display_name") or self._name_to_display(name),
                    "path": file_path,
                    "modified_at": datetime.fromtimestamp(stats.st_mtime).isoformat(),
                    "size": stats.st_size,
                    "description": str(metadata.get("description", "")) if metadata.get("description") else "",
                    "version": metadata.get("version", "1.0"),
                    "icon": str(metadata.get("icon", "")) if metadata.get("icon") else "",
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
    
    def create_structure(self, name, description="", initial_content=None):
        """
        Create a new structure.
        If initial_content is provided, use it to populate the structure.
        Returns the created structure info.
        """
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '', name.lower().replace(' ', '_'))
        
        if not safe_name:
            raise ValueError("Invalid structure name")
        
        if self.structure_exists(safe_name):
            raise ValueError(f"Structure '{safe_name}' already exists")
        
        file_path = self.get_structure_path(safe_name)
        
        if initial_content:
            # Use provided content wrapped in metadata and structure sections
            content = f"""metadata
  description: {description or 'A new knowledge graph'}
  version: 1.0
  updated_at: '{datetime.now().isoformat()}'
structure
"""
            # Indent the initial content by 2 spaces to put it under structure
            for line in initial_content.strip().split('\n'):
                content += f"  {line}\n"
        else:
            # Create structure with tutorial content
            content = f"""metadata
  description: {description or 'A new knowledge graph'}
  version: 1.0
  updated_at: '{datetime.now().isoformat()}'
structure
  navigation
    lll
      context: tap left to edit
    rrrrrrr
      context: tap right to enter
      swipe_right
        context: to go back
  organize
    tap_+_button
    drag_the_handle
  tracking
    add_due
      context: notice addition of "Time"
    add_progress
      context: notice addition of "Progress"
  more
    pinch_to_zoom
    copy
      context: export as text
    create_new
      context: main page → new graph → paste
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
    
    def update_structure(self, name, display_name=None, description=None, icon=None):
        """
        Update a structure's metadata.
        Returns the updated structure info.
        """
        if not self.structure_exists(name):
            raise ValueError(f"Structure '{name}' not found")
        
        file_path = self.get_structure_path(name)
        
        # Load current content
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        lines = content.split('\n')
        new_lines = []
        in_metadata = False
        found_description = False
        found_display_name = False
        found_icon = False
        
        for line in lines:
            stripped = line.strip()
            
            # Track if we're in metadata section
            if stripped == 'metadata':
                in_metadata = True
                new_lines.append(line)
                continue
            elif stripped == 'structure':
                # Before leaving metadata, add missing fields
                if in_metadata:
                    if display_name and not found_display_name:
                        new_lines.append(f"  display_name: {display_name}")
                    if description is not None and not found_description:
                        new_lines.append(f"  description: {description}")
                    if icon and not found_icon:
                        new_lines.append(f"  icon: {icon}")
                in_metadata = False
                new_lines.append(line)
                continue
            
            if in_metadata:
                if stripped.startswith('description:'):
                    found_description = True
                    if description is not None:
                        indent = len(line) - len(line.lstrip())
                        new_lines.append(' ' * indent + f"description: {description}")
                        continue
                elif stripped.startswith('display_name:'):
                    found_display_name = True
                    if display_name:
                        indent = len(line) - len(line.lstrip())
                        new_lines.append(' ' * indent + f"display_name: {display_name}")
                        continue
                elif stripped.startswith('icon:'):
                    found_icon = True
                    if icon:
                        indent = len(line) - len(line.lstrip())
                        new_lines.append(' ' * indent + f"icon: {icon}")
                        continue
            
            new_lines.append(line)
        
        # Write updated content
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines))
        
        return {
            "name": name,
            "display_name": display_name or self._name_to_display(name),
            "description": description or "",
            "icon": icon or "",
        }
