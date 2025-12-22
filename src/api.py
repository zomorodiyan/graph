"""
FastAPI backend for editing hierarchical structure.
Provides REST API for CRUD operations on items.
"""
from fastapi import FastAPI, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from pathlib import Path
import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.dirname(__file__))

from file_utils import FileUtils
from hierarchy_builder import HierarchyBuilder
from html_generator import HTMLGenerator
from google_drive import download_structure_yaml, upload_structure_yaml


app = FastAPI(title="Hierarchical Graph API", version="1.0")


# Enable CORS for local development and cross-origin requests
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

# Serve HTML files from /html directory (mount after API routes are defined)


class ItemUpdate(BaseModel):
    """Model for updating an item."""
    name: Optional[str] = Field(None, description="Item name/key")
    progress: Optional[int] = Field(None, ge=0, le=100, description="Progress percentage (0-100)")
    context: Optional[str] = Field(None, description="Context/description text")
    due: Optional[str] = Field(None, description="Due date in YYYY-MM-DD format or empty to remove")


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
        
        # Create a new cleaned dict to avoid modification-during-iteration issues
        result = {}
        
        # Copy properties (not children or auto-generated fields)
        for key in ['progress', 'context', 'due']:
            if key in item:
                result[key] = item[key]
        
        # Handle children: flatten them into the result
        if 'children' in item:
            for child_key, child_value in item['children'].items():
                result[child_key] = clean_item(child_value)
        
        # Handle any other nested dicts (that aren't properties or children)
        for key, value in item.items():
            if key not in {'id', 'title', 'children', 'progress', 'context', 'due'}:
                if isinstance(value, dict):
                    result[key] = clean_item(value)
                else:
                    result[key] = value
        
        return result
    
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
async def update_item(path: str, request: Request):
    """Update an item's properties."""
    try:
        # Get raw JSON data to avoid Pydantic validation issues with empty strings
        update_data = await request.json()
        print(f"DEBUG: Updating item at path: {path}")
        print(f"DEBUG: Update data: {update_data}")
        
        # Track which fields should be removed (empty strings)
        remove_progress = update_data.get('progress') == ''
        remove_context = update_data.get('context') == ''
        remove_due = update_data.get('due') == ''
        
        # Convert empty strings to None for processing
        if remove_progress:
            update_data['progress'] = None
        if remove_context:
            update_data['context'] = None
        if remove_due:
            update_data['due'] = None
        
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
        new_name = update_data.get('name')
        renamed = False
        if new_name is not None and new_name != item_key:
            new_name = new_name.lower().replace(' ', '_')
            if new_name in parent and new_name != item_key:
                raise HTTPException(status_code=400, detail=f"Item '{new_name}' already exists at this level")
            # Rename the item by moving its value to new key
            parent[new_name] = parent.pop(item_key)
            item_value = parent[new_name]  # Update reference to the renamed item
            renamed = True
            print(f"DEBUG: Renamed item from '{item_key}' to '{new_name}'")
        
        # Handle progress: update, remove, or leave unchanged
        if remove_progress:
            item_value.pop('progress', None)
            print(f"DEBUG: Removed progress")
        elif 'progress' in update_data and update_data['progress'] is not None:
            item_value['progress'] = int(update_data['progress'])
            print(f"DEBUG: Set progress to {update_data['progress']}")
        
        # Handle context: update, remove, or leave unchanged
        if remove_context:
            item_value.pop('context', None)
            print(f"DEBUG: Removed context")
        elif 'context' in update_data and update_data['context'] is not None:
            item_value['context'] = update_data['context']
            print(f"DEBUG: Set context to {update_data['context']}")
            
        # Handle due date: update, remove, or leave unchanged
        if remove_due:
            item_value.pop('due', None)
            print(f"DEBUG: Removed due date")
        elif 'due' in update_data and update_data['due'] is not None:
            # Validate date format
            import re
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', update_data['due']):
                raise HTTPException(status_code=400, detail=f"Invalid date format: {update_data['due']}. Must be YYYY-MM-DD")
            item_value['due'] = update_data['due']
            print(f"DEBUG: Set due to {update_data['due']}")
        
        print(f"DEBUG: About to save structure...")
        print(f"DEBUG: Item value before cleaning: {item_value}")
        
        # IMPORTANT: Remove auto-generated fields before saving
        data_to_save = _clean_structure_for_save(data)
        print(f"DEBUG: Cleaned structure, saving...")
        
        # Debug: Print the path to the renamed item in the cleaned structure
        if renamed:
            try:
                check_keys = keys[:-1] + [new_name] if keys else [new_name]
                cleaned_parent, _, cleaned_item = find_item(data_to_save['structure'], check_keys)
                print(f"DEBUG: After cleaning, renamed item at {check_keys} exists: {cleaned_parent is not None}")
            except Exception as e:
                print(f"DEBUG: Error checking renamed item: {e}")
        
        # Save the updated structure (without auto-generated fields)
        file_utils.save_structure(data_to_save)
        print(f"DEBUG: Structure saved successfully")
        
        # Update path if renamed
        final_path = path
        if renamed:
            path_parts = keys[:-1] + [new_name]
            final_path = '.'.join(path_parts) if path_parts else new_name
            print(f"DEBUG: Updated path from '{path}' to '{final_path}'")
        
        # Trigger incremental regeneration
        affected_paths = get_affected_paths(final_path)
        regenerate_html(affected_paths)
        
        return {
            "success": True,
            "path": final_path,
            "updated": item_value
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/items/{parent_path:path}")
async def create_item(parent_path: str, item: ItemCreate):
    """Create a new item under a parent."""
    try:
        print(f"DEBUG: Creating item under parent_path: '{parent_path}'")
        print(f"DEBUG: Item data: {item}")
        
        data = file_utils.load_yaml_structure()
        
        # Handle special cases: empty path, "root", or "home" all mean add to top-level structure
        if parent_path in ("", "root", "home"):
            keys = []
        else:
            keys = path_to_keys(parent_path)
        
        print(f"DEBUG: Keys: {keys}")

        # Locate parent container
        if not keys:
            # Adding to root/top-level structure
            parent_children = data.get('structure', {})
            print(f"DEBUG: Using root structure, keys in structure: {list(parent_children.keys())}")
        else:
            parent, parent_key, parent_value = find_item(data['structure'], keys)
            if parent is None:
                raise HTTPException(status_code=404, detail=f"Parent not found: {parent_path}")
            
            print(f"DEBUG: Found parent - key: {parent_key}, value type: {type(parent_value)}")
            
            if not isinstance(parent_value, dict):
                # Convert to dict if needed
                parent_value = {}
                parent[parent_key] = parent_value
                print(f"DEBUG: Converted parent_value to dict")
            
            # Don't use 'children' wrapper - add directly to parent_value
            parent_children = parent_value
            print(f"DEBUG: parent_children keys: {list(parent_children.keys())}")

        # Normalize name and enforce uniqueness
        new_name = item.name.lower().replace(' ', '_')
        print(f"DEBUG: Normalized name: {new_name}")
        
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
        
        print(f"DEBUG: New item payload: {new_item}")
        
        # Add to parent children
        parent_children[new_name] = new_item
        print(f"DEBUG: Added new item to parent_children")
        
        # Clean and save structure
        data_to_save = _clean_structure_for_save(data)
        file_utils.save_structure(data_to_save)
        print(f"DEBUG: Saved structure")
        
        # Trigger regeneration for new path
        if not parent_path or parent_path in ("root", "home"):
            new_path = new_name
        else:
            new_path = f"{parent_path}.{new_name}"
        print(f"DEBUG: New path: {new_path}")
        affected_paths = get_affected_paths(new_path)
        regenerate_html(affected_paths)
        print(f"DEBUG: Regenerated HTML for affected paths")
        
        return {
            "success": True,
            "path": new_path,
            "created": new_item
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG ERROR: {e}")
        import traceback
        traceback.print_exc()
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
                item_id = 'home'
            else:
                item_id = path.replace('.', '_')
            
            app.generate_graph_for_item(item_id)
        except Exception as e:
            print(f"Warning: Failed to regenerate HTML for {path}: {e}")


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


@app.post("/api/sync-to-drive")
async def sync_to_drive():
    """Alias for uploading structure.txt to Google Drive."""
    success = upload_structure_yaml()
    return {
        "success": success,
        "action": "upload",
        "message": "Uploaded structure.txt to Google Drive" if success else "Upload failed"
    }


@app.post("/api/regenerate/{item_id}")
async def regenerate_page(item_id: str):
    """Regenerate HTML for a specific item using GraphApp."""
    try:
        from graph import GraphApp
        app_gen = GraphApp()
        html_path = app_gen.generate_graph_for_item(item_id or "home")
        return {
            "success": True,
            "item_id": item_id,
            "message": f"Regenerated {html_path}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to regenerate: {str(e)}")


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


# Removed duplicate /api/regenerate/{item_id:path} endpoint to avoid conflicts


# Define HTML directory at module level
HTML_DIR = Path(__file__).parent.parent / "html"
print(f"HTML_DIR: {HTML_DIR}, exists: {HTML_DIR.exists()}")


# Root redirect to home page
@app.get("/")
async def root():
    """Redirect root to home.html"""
    return RedirectResponse(url="/html/home.html")


# Serve individual HTML files
@app.get("/html/{filename}")
async def serve_html(filename: str):
    """Serve HTML files from the html directory"""
    file_path = HTML_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type="text/html")


if __name__ == "__main__":
    import uvicorn
    import os
    # Cloud Run uses PORT, local dev uses API_PORT or defaults to 8000
    port = int(os.getenv("PORT", os.getenv("API_PORT", 8000)))
    uvicorn.run(app, host="0.0.0.0", port=port)
