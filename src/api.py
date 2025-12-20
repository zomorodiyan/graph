"""
FastAPI backend for editing hierarchical structure.
Provides REST API for CRUD operations on items.
"""
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.dirname(__file__))

from file_utils import FileUtils
from hierarchy_builder import HierarchyBuilder
from html_generator import HTMLGenerator
from google_drive import download_structure_yaml, upload_structure_yaml


app = FastAPI(title="Hierarchical Graph API", version="1.0")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

file_utils = FileUtils()
hierarchy_builder = HierarchyBuilder()
html_generator = HTMLGenerator()


class ItemUpdate(BaseModel):
    """Model for updating an item."""
    name: Optional[str] = Field(None, description="Item name/key")
    progress: Optional[int] = Field(None, ge=0, le=100, description="Progress percentage (0-100)")
    context: Optional[str] = Field(None, description="Context/description text")
    due: Optional[str] = Field(None, description="Due date in YYYY-MM-DD format or empty to remove")
    
    # Custom validation to allow empty string for due date
    @classmethod
    def model_validate(cls, obj):
        if isinstance(obj, dict):
            # Convert empty strings to None
            if obj.get('due') == '':
                obj['due'] = None
            if obj.get('context') == '':
                obj['context'] = None
            if obj.get('progress') == '':
                obj['progress'] = None
            # Validate date format if not empty
            due = obj.get('due')
            if due and not None:
                import re
                if not re.match(r'^\d{4}-\d{2}-\d{2}$', due):
                    raise ValueError(f"Invalid date format: {due}. Must be YYYY-MM-DD")
        return super().model_validate(obj)


class ItemCreate(BaseModel):
    """Model for creating a new item."""
    name: str = Field(..., description="Item name (key)")
    progress: Optional[int] = Field(None, ge=0, le=100)
    context: Optional[str] = None
    due: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')


def _clean_structure_for_save(data: dict) -> dict:
    """
    Remove auto-generated fields (id, title, children wrapper) before saving.
    This preserves the original structure format.
    """
    import copy
    cleaned = copy.deepcopy(data)
    
    def clean_item(item):
        if not isinstance(item, dict):
            return item
        
        # Remove auto-generated fields
        item.pop('id', None)
        item.pop('title', None)
        
        # If there's a 'children' key, flatten it back into the item
        if 'children' in item:
            children = item.pop('children')
            for child_key, child_value in children.items():
                item[child_key] = clean_item(child_value)
        
        # Recursively clean remaining items
        for key, value in list(item.items()):
            if isinstance(value, dict):
                item[key] = clean_item(value)
        
        return item
    
    # Clean the structure section
    if 'structure' in cleaned:
        cleaned_structure = {}
        for key, value in cleaned['structure'].items():
            cleaned_structure[key] = clean_item(value)
        cleaned['structure'] = cleaned_structure
    
    return cleaned

def path_to_keys(path: str) -> list:
    """Convert dot notation path to list of keys (e.g., 'level.work.go_melt' -> ['level', 'work', 'go_melt'])."""
    return path.split('.')


def find_item(structure: dict, keys: list) -> tuple:
    """
    Find an item in the structure by keys.
    Returns (parent_dict, item_key, item_value) or (None, None, None) if not found.
    """
    if not keys:
        return None, None, None
    
    print(f"DEBUG find_item: Looking for keys {keys} in structure")
    current = structure
    for i, key in enumerate(keys[:-1]):
        print(f"DEBUG find_item: Step {i}, looking for key '{key}' in current")
        print(f"DEBUG find_item: Available keys: {list(current.keys())}")
        if key not in current:
            print(f"DEBUG find_item: Key '{key}' not found!")
            return None, None, None
        current = current[key]
        print(f"DEBUG find_item: Found '{key}', type: {type(current)}")
        if not isinstance(current, dict):
            print(f"DEBUG find_item: current is not a dict, it's {type(current)}")
            return None, None, None
        
        # If current has a 'children' key, navigate into it
        if 'children' in current:
            print(f"DEBUG find_item: Found 'children' key, navigating into it")
            current = current['children']
    
    final_key = keys[-1]
    print(f"DEBUG find_item: Looking for final key '{final_key}'")
    print(f"DEBUG find_item: Available keys in parent: {list(current.keys())}")
    if final_key not in current:
        print(f"DEBUG find_item: Final key '{final_key}' not found!")
        return None, None, None
    
    print(f"DEBUG find_item: Found item! Returning parent, key='{final_key}', value type={type(current[final_key])}")
    return current, final_key, current[final_key]


@app.get("/api/items/{path:path}")
async def get_item(path: str):
    """Get an item by its path."""
    try:
        data = file_utils.load_yaml_structure()
        keys = path_to_keys(path)
        
        parent, item_key, item_value = find_item(data['structure'], keys)
        
        if parent is None:
            raise HTTPException(status_code=404, detail=f"Item not found: {path}")
        
        return {
            "path": path,
            "name": item_key,
            "data": item_value
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/items/{path:path}")
async def update_item(path: str, update: ItemUpdate):
    """Update an item's properties."""
    try:
        print(f"DEBUG: Updating item at path: {path}")
        print(f"DEBUG: Update data: {update}")
        
        try:
            data = file_utils.load_yaml_structure()
            print(f"DEBUG: Loaded structure successfully")
        except Exception as e:
            print(f"DEBUG ERROR loading structure: {e}")
            import traceback
            traceback.print_exc()
            raise
        
        keys = path_to_keys(path)
        print(f"DEBUG: Path keys: {keys}")
        
        parent, item_key, item_value = find_item(data['structure'], keys)
        
        if parent is None:
            raise HTTPException(status_code=404, detail=f"Item not found: {path}")
        
        print(f"DEBUG: Found item - key: {item_key}, value type: {type(item_value)}")
        
        # Convert item_value to dict if it's not already
        if not isinstance(item_value, dict):
            # If it's a string or list, convert to dict
            item_value = {}
            parent[item_key] = item_value
            print(f"DEBUG: Converted item_value to dict")
        
        # Handle renaming first (restructure parent if needed)
        if update.name is not None and update.name != item_key:
            new_name = update.name.lower().replace(' ', '_')
            if new_name in parent and new_name != item_key:
                raise HTTPException(status_code=400, detail=f"Item '{new_name}' already exists at this level")
            # Rename the item by moving its value to new key
            parent[new_name] = item_value
            del parent[item_key]
            print(f"DEBUG: Renamed item from '{item_key}' to '{new_name}'")
        
        # Update only provided fields
        if update.progress is not None:
            item_value['progress'] = update.progress
            print(f"DEBUG: Set progress to {update.progress}")
        elif 'progress' in item_value and update.progress is None:
            # If progress field exists but update is None, keep it (don't remove)
            pass
        
        if update.context is not None:
            if update.context == "":
                item_value.pop('context', None)  # Remove if empty
                print(f"DEBUG: Removed context")
            else:
                item_value['context'] = update.context
                print(f"DEBUG: Set context to {update.context}")
        elif 'context' in item_value and update.context is None:
            # If context field exists but update is None, keep it (don't remove)
            pass
            
        if update.due is not None:
            if update.due == "":
                item_value.pop('due', None)  # Remove if empty
                print(f"DEBUG: Removed due date")
            else:
                item_value['due'] = update.due
                print(f"DEBUG: Set due to {update.due}")
        elif 'due' in item_value and update.due is None:
            # If due field exists but update is None, keep it (don't remove)
            pass
        
        print(f"DEBUG: About to save structure...")
        
        # IMPORTANT: Remove auto-generated fields before saving
        data_to_save = _clean_structure_for_save(data)
        print(f"DEBUG: Cleaned structure, saving...")
        
        # Save the updated structure (without auto-generated fields)
        file_utils.save_structure(data_to_save)
        print(f"DEBUG: Structure saved successfully")
        
        # Trigger incremental regeneration
        affected_paths = get_affected_paths(path)
        regenerate_html(affected_paths)
        
        return {
            "success": True,
            "path": path,
            "updated": item_value
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/items/{parent_path:path}")
async def create_item(parent_path: str, item: ItemCreate):
    """Create a new item under a parent."""
    try:
        data = file_utils.load_yaml_structure()
        keys = path_to_keys(parent_path) if parent_path not in ("", "root", "data") else []

        # Locate parent container
        if not keys:
            parent_children = data.get('structure', {})
        else:
            parent, parent_key, parent_value = find_item(data['structure'], keys)
            if parent is None:
                raise HTTPException(status_code=404, detail=f"Parent not found: {parent_path}")
            if not isinstance(parent_value, dict):
                raise HTTPException(status_code=400, detail=f"Parent is not a container: {parent_path}")
            parent_children = parent_value.setdefault('children', {})

        # Normalize name and enforce uniqueness
        new_name = item.name.lower().replace(' ', '_')
        if new_name in parent_children:
            raise HTTPException(status_code=400, detail=f"Item '{new_name}' already exists under this parent")

        # Build new item payload
        new_item = {}
        if item.progress is not None:
            new_item['progress'] = item.progress
        if item.context:
            new_item['context'] = item.context
        if item.due:
            new_item['due'] = item.due
        
        # Add to parent children
        parent_children[new_name] = new_item
        
        # Clean and save structure
        data_to_save = _clean_structure_for_save(data)
        file_utils.save_structure(data_to_save)
        
        # Trigger regeneration for new path
        new_path = new_name if not parent_path or parent_path in ("root", "data") else f"{parent_path}.{new_name}"
        affected_paths = get_affected_paths(new_path)
        regenerate_html(affected_paths)
        
        return {
            "success": True,
            "path": new_path,
            "created": new_item
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/items/{path:path}")
async def delete_item(path: str):
    """Delete an item."""
    try:
        print(f"DEBUG: Deleting item at path: {path}")
        data = file_utils.load_yaml_structure()
        keys = path_to_keys(path)
        print(f"DEBUG: Path keys: {keys}")
        
        parent, item_key, item_value = find_item(data['structure'], keys)
        
        if parent is None:
            raise HTTPException(status_code=404, detail=f"Item not found: {path}")
        
        # Delete the item
        del parent[item_key]
        print(f"DEBUG: Deleted item '{item_key}'")
        
        # Clean and save the updated structure
        data_to_save = _clean_structure_for_save(data)
        file_utils.save_structure(data_to_save)
        print(f"DEBUG: Structure saved after deletion")
        
        # Trigger regeneration - regenerate parent and all ancestors
        parent_path = '.'.join(keys[:-1]) if len(keys) > 1 else 'root'
        print(f"DEBUG: Parent path for regeneration: {parent_path}")
        affected_paths = get_affected_paths(parent_path)
        print(f"DEBUG: Affected paths: {affected_paths}")
        regenerate_html(affected_paths)
        print(f"DEBUG: Regeneration complete")
        
        return {
            "success": True,
            "deleted": path
        }
    except Exception as e:
        print(f"ERROR in delete_item: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def get_affected_paths(item_path: str) -> list:
    """
    Get list of item paths that need HTML regeneration.
    Includes the item itself and all ancestors (for breadcrumb updates).
    """
    affected = []
    keys = path_to_keys(item_path)
    
    # Add the item itself
    affected.append(item_path)
    
    # Add all ancestors
    for i in range(len(keys)):
        ancestor_path = '.'.join(keys[:i+1])
        if ancestor_path not in affected:
            affected.append(ancestor_path)
    
    # Always include root
    if 'root' not in affected:
        affected.append('root')
    
    return affected


def regenerate_html(paths: list):
    """Regenerate HTML files for specific paths."""
    from graph import GraphApp
    
    app = GraphApp()
    
    for path in paths:
        try:
            if path == 'root':
                item_id = 'data'
            else:
                item_id = path.replace('.', '_')
            
            app.generate_graph_for_item(item_id)
        except Exception as e:
            print(f"Warning: Failed to regenerate HTML for {path}: {e}")


@app.get("/")
async def root():
    """API root endpoint."""
    return {
        "name": "Hierarchical Graph API",
        "version": "1.0",
        "endpoints": {
            "get_item": "GET /api/items/{path}",
            "update_item": "PUT /api/items/{path}",
            "create_item": "POST /api/items/{parent_path}",
            "delete_item": "DELETE /api/items/{path}",
            "sync_download": "POST /api/sync/download",
            "sync_upload": "POST /api/sync/upload",
            "sync_both": "POST /api/sync/both"
        }
    }


@app.post("/api/sync/download")
async def sync_download():
    """Download structure.txt from Google Drive."""
    success = download_structure_yaml()
    return {
        "success": success,
        "action": "download",
        "message": "Downloaded structure.txt from Google Drive" if success else "Download failed"
    }


@app.post("/api/sync/upload")
async def sync_upload():
    """Upload structure.txt to Google Drive."""
    success = upload_structure_yaml()
    return {
        "success": success,
        "action": "upload",
        "message": "Uploaded structure.txt to Google Drive" if success else "Upload failed"
    }


@app.post("/api/sync/both")
async def sync_both():
    """Download then upload (download wins in conflicts)."""
    download_success = download_structure_yaml()
    if not download_success:
        return {
            "success": False,
            "download": False,
            "upload": False,
            "message": "Sync failed: could not download"
        }
    
    upload_success = upload_structure_yaml()
    return {
        "success": upload_success,
        "download": download_success,
        "upload": upload_success,
        "message": "Sync completed" if upload_success else "Download succeeded but upload failed"
    }


if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("API_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
