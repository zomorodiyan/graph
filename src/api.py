"""
FastAPI backend for editing hierarchical structure.
Provides REST API for CRUD operations on items.
"""
from fastapi import FastAPI, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Union
from pathlib import Path
import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.dirname(__file__))

from file_utils import FileUtils
from hierarchy_builder import HierarchyBuilder
from html_generator import HTMLGenerator
from gcs_graph_store import (
    GCSBackedFileUtils,
    download_all_graphs_from_gcs,
    download_default_structure_from_gcs,
    upload_default_structure_to_gcs,
    upload_graph_to_gcs,
)
from structures_manager import StructuresManager
from simple_parser import SimpleParser
from firestore_graph_store import FirestoreGraphStore


# ============================================================================
# LIMITS AND CONSTRAINTS
# ============================================================================
MAX_ITEMS_PER_GRAPH = 1000       # Maximum total items in a single graph
MAX_NESTING_DEPTH = 20          # Maximum depth of nested items
MAX_CHILDREN_PER_ITEM = 200     # Maximum children under one parent
MAX_PASTE_CONTENT_SIZE = 102400 # Maximum paste content size (100KB)
MAX_GRAPHS_TOTAL = 50           # Maximum number of graphs
MAX_ITEM_NAME_LENGTH = 100      # Maximum item name length
MAX_CONTEXT_LENGTH = 10000      # Maximum context/description length


def count_items(data: dict, depth: int = 0) -> tuple[int, int]:
    """Count total items and max depth in a structure.
    Returns (total_count, max_depth)."""
    if not isinstance(data, dict):
        return 0, depth
    
    total = 0
    max_depth = depth
    
    for key, value in data.items():
        if key in ('id', 'title', 'progress', 'context', 'due', 'icon', 'description'):
            continue  # Skip metadata fields
        total += 1
        if isinstance(value, dict):
            children = value.get('children', value)
            if isinstance(children, dict):
                child_count, child_depth = count_items(children, depth + 1)
                total += child_count
                max_depth = max(max_depth, child_depth)
    
    return total, max_depth


def validate_graph_limits(structure: dict, adding: int = 0, new_depth: int = 0) -> None:
    """Validate that a graph doesn't exceed limits. Raises HTTPException if it does."""
    current_count, current_depth = count_items(structure)
    
    if current_count + adding > MAX_ITEMS_PER_GRAPH:
        raise HTTPException(
            status_code=400, 
            detail=f"Graph would exceed maximum items limit ({MAX_ITEMS_PER_GRAPH}). Current: {current_count}, Adding: {adding}"
        )
    
    if max(current_depth, new_depth) > MAX_NESTING_DEPTH:
        raise HTTPException(
            status_code=400, 
            detail=f"Graph would exceed maximum nesting depth ({MAX_NESTING_DEPTH})"
        )


def validate_children_limit(parent_children: dict) -> None:
    """Validate that a parent doesn't have too many children."""
    child_count = sum(1 for k in parent_children.keys() 
                      if k not in ('id', 'title', 'progress', 'context', 'due', 'icon', 'description', 'children'))
    if child_count >= MAX_CHILDREN_PER_ITEM:
        raise HTTPException(
            status_code=400, 
            detail=f"Parent would exceed maximum children limit ({MAX_CHILDREN_PER_ITEM})"
        )


def validate_item_content(name: str = None, context: str = None) -> None:
    """Validate item name and context lengths."""
    if name and len(name) > MAX_ITEM_NAME_LENGTH:
        raise HTTPException(
            status_code=400, 
            detail=f"Item name exceeds maximum length ({MAX_ITEM_NAME_LENGTH} chars)"
        )
    if context and len(context) > MAX_CONTEXT_LENGTH:
        raise HTTPException(
            status_code=400, 
            detail=f"Context exceeds maximum length ({MAX_CONTEXT_LENGTH} chars)"
        )


app = FastAPI(title="Hierarchical Graph API", version="1.0")


@app.on_event("startup")
async def startup_event():
    """Download structures from Google Cloud Storage and regenerate HTML files on startup."""
    print("📥 Downloading default structure from Google Cloud Storage...")
    success = download_default_structure_from_gcs()
    if success:
        print("✅ Structure downloaded successfully")
        print("🔄 Regenerating HTML files from structure...")
        try:
            from graph import GraphApp
            graph_app = GraphApp()
            graph_app.generate_all_graphs()
            print("✅ HTML files regenerated successfully")
        except Exception as e:
            print(f"⚠️  Warning: Failed to regenerate HTML files: {e}")
    else:
        print("⚠️  Warning: Could not download default structure from Google Cloud Storage")
    
    # Download all user graphs from Google Cloud Storage
    print("📥 Downloading user graphs from Google Cloud Storage...")
    try:
        download_all_graphs_from_gcs()
    except Exception as e:
        print(f"⚠️  Warning: Could not download graphs: {e}")


# Enable CORS for local development and cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

file_utils = GCSBackedFileUtils()
hierarchy_builder = HierarchyBuilder()
html_generator = HTMLGenerator()
structures_manager = StructuresManager()
firestore_store = FirestoreGraphStore()

GRAPH_STATE_BACKEND = os.getenv("GRAPH_STATE_BACKEND", "file").strip().lower()
if GRAPH_STATE_BACKEND not in {"file", "dual", "firestore"}:
    print(f"⚠️  Invalid GRAPH_STATE_BACKEND '{GRAPH_STATE_BACKEND}', defaulting to 'file'")
    GRAPH_STATE_BACKEND = "file"
print(f"📦 Graph state backend: {GRAPH_STATE_BACKEND}")


def _resolve_graph_key(graph_name: Optional[str]) -> str:
    if not graph_name or graph_name == "default":
        return "default"
    return graph_name


def _load_graph_data(fu: FileUtils, graph_name: Optional[str] = None) -> dict:
    """Load graph data from configured backend, with safe fallback in dual mode."""
    if GRAPH_STATE_BACKEND == "file":
        return fu.load_yaml_structure()

    fallback_data: Optional[dict] = None
    try:
        fallback_data = fu.load_yaml_structure()
    except Exception:
        fallback_data = None

    if not firestore_store.is_available():
        if GRAPH_STATE_BACKEND == "firestore":
            raise RuntimeError(
                "Firestore backend is configured but unavailable. "
                "Install google-cloud-firestore and verify credentials."
            )
        if fallback_data is not None:
            return fallback_data
        raise RuntimeError("No storage backend available for graph data")

    graph_key = _resolve_graph_key(graph_name)
    try:
        result = firestore_store.load_graph(graph_key, fallback_data=fallback_data)
        if isinstance(result.get('structure'), dict):
            fu._inject_ids(result['structure'])
        return result
    except Exception:
        if GRAPH_STATE_BACKEND == "firestore":
            raise
        if fallback_data is not None:
            return fallback_data
        raise


def _save_graph_data(
    fu: FileUtils,
    data_to_save: dict,
    graph_name: Optional[str],
    mutation_type: str,
    mutation_payload: Optional[dict] = None,
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    """Save graph data to configured backend and append mutation metadata when applicable."""
    write_file = GRAPH_STATE_BACKEND in {"file", "dual"}
    write_firestore = GRAPH_STATE_BACKEND in {"firestore", "dual"}

    actor = None
    base_version = None
    if request is not None:
        actor = request.headers.get("x-actor-id")
        base_version_header = request.headers.get("x-base-version")
        if base_version_header not in (None, ""):
            try:
                base_version = int(base_version_header)
            except ValueError as error:
                raise HTTPException(status_code=400, detail="x-base-version must be an integer") from error

    firestore_result: Dict[str, Any] = {}
    if write_firestore:
        if not firestore_store.is_available():
            if GRAPH_STATE_BACKEND == "firestore":
                raise HTTPException(
                    status_code=503,
                    detail="Firestore backend is unavailable. Check dependency and credentials.",
                )
        else:
            try:
                firestore_result = firestore_store.save_graph(
                    graph_name=_resolve_graph_key(graph_name),
                    data=data_to_save,
                    mutation_type=mutation_type,
                    mutation_payload=mutation_payload,
                    actor=actor,
                    base_version=base_version,
                )
            except ValueError as error:
                raise HTTPException(status_code=409, detail=str(error)) from error
            except Exception as error:
                if GRAPH_STATE_BACKEND == "firestore":
                    raise
                print(f"⚠️  Firestore save failed in dual mode: {error}")

    if write_file:
        fu.save_structure(data_to_save)

    if firestore_result:
        return firestore_result
    return {"backend": "file"}

# Serve HTML files from /html directory (mount after API routes are defined)


# ============================================================================
# STRUCTURES (GRAPHS) ENDPOINTS
# ============================================================================

class StructureCreate(BaseModel):
    """Model for creating a new structure."""
    name: str = Field(..., description="Structure name (will be sanitized)")
    description: Optional[str] = Field("", description="Structure description")
    initial_content: Optional[str] = Field(None, description="Initial structure content in structure.txt format")


@app.get("/api/graphs")
async def list_graphs():
    """List all available graphs/structures."""
    try:
        return structures_manager.list_structures()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/graphs")
async def create_graph(data: StructureCreate):
    """Create a new graph/structure."""
    try:
        # Check max graphs limit
        existing_graphs = structures_manager.list_structures()
        if len(existing_graphs) >= MAX_GRAPHS_TOTAL:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum number of graphs ({MAX_GRAPHS_TOTAL}) reached"
            )
        
        # Validate name length
        if len(data.name) > MAX_ITEM_NAME_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Graph name exceeds maximum length ({MAX_ITEM_NAME_LENGTH} chars)"
            )
        
        # Validate initial content size if provided
        if data.initial_content and len(data.initial_content) > MAX_PASTE_CONTENT_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"Initial content exceeds maximum size ({MAX_PASTE_CONTENT_SIZE // 1024}KB)"
            )
        
        created = structures_manager.create_structure(data.name, data.description, data.initial_content)

        # Seed Firestore state immediately when Firestore-backed modes are enabled.
        if GRAPH_STATE_BACKEND in {"dual", "firestore"}:
            if not firestore_store.is_available():
                if GRAPH_STATE_BACKEND == "firestore":
                    raise HTTPException(
                        status_code=503,
                        detail="Firestore backend is unavailable. Check dependency and credentials.",
                    )
            else:
                try:
                    graph_fu = structures_manager.get_file_utils(created["name"])
                    seed_data = graph_fu.load_yaml_structure()
                    firestore_store.save_graph(
                        graph_name=created["name"],
                        data=seed_data,
                        mutation_type="graph_created",
                        mutation_payload={"graph": created["name"]},
                        actor="api",
                    )
                except Exception:
                    if GRAPH_STATE_BACKEND == "firestore":
                        raise

        return created
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/graphs/{name}")
async def delete_graph(name: str):
    """Delete a graph/structure."""
    try:
        return structures_manager.delete_structure(name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class GraphUpdate(BaseModel):
    """Model for updating a graph's metadata."""
    display_name: Optional[str] = Field(None, description="Display name for the graph")
    description: Optional[str] = Field(None, description="Graph description")
    icon: Optional[str] = Field(None, description="Emoji icon for the graph")


@app.put("/api/graphs/{name}")
async def update_graph(name: str, data: GraphUpdate):
    """Update a graph's metadata (display name, description, icon)."""
    try:
        return structures_manager.update_structure(
            name,
            display_name=data.display_name,
            description=data.description,
            icon=data.icon
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def get_file_utils_for_graph(graph_name: str = None) -> FileUtils:
    """Get FileUtils instance for a specific graph or default."""
    if graph_name and graph_name != "default":
        if not structures_manager.structure_exists(graph_name):
            # In Firestore-backed modes we allow graph reads/writes even without a local file.
            if GRAPH_STATE_BACKEND in {"dual", "firestore"} and firestore_store.is_available():
                return FileUtils(structures_manager.get_structure_path(graph_name))
            raise HTTPException(status_code=404, detail=f"Graph '{graph_name}' not found")
        return structures_manager.get_file_utils(graph_name)
    # For the "default" named graph, prefer structures/default.txt if it exists
    if structures_manager.structure_exists("default"):
        return structures_manager.get_file_utils("default")
    return file_utils


# ============================================================================
# ITEM ENDPOINTS
# ============================================================================


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


class EmptyBody(BaseModel):
    """Empty body for endpoints that don't need input."""
    pass


def _clean_structure_for_save(data: dict) -> dict:
    """
    Remove auto-generated fields (id, title, children wrapper) before saving.
    This preserves the original structure format and item order.
    """
    import copy
    cleaned = copy.deepcopy(data)
    
    def clean_item(item):
        if not isinstance(item, dict):
            return item
        
        # Preserve order by iterating through all keys and building result in order
        result = {}
        
        # First, handle all keys in their original order
        for key, value in item.items():
            if key in {'id', 'title'}:
                # Skip auto-generated fields
                continue
            elif key == 'children':
                # Flatten children into result (preserve their order)
                for child_key, child_value in value.items():
                    result[child_key] = clean_item(child_value)
            elif key in {'progress', 'context', 'due'}:
                # Copy properties as-is
                result[key] = value
            elif isinstance(value, dict):
                # Recursively clean nested dicts
                result[key] = clean_item(value)
            else:
                # Copy other values as-is
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


@app.get("/api/structure")
async def get_structure():
    """Get the full structure with all items (default structure)."""
    try:
        data = _load_graph_data(file_utils, "default")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/graphs/{graph_name}/structure")
async def get_graph_structure(graph_name: str):
    """Get the full structure for a specific graph."""
    try:
        fu = get_file_utils_for_graph(graph_name)
        data = _load_graph_data(fu, graph_name)
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/structure/text")
async def get_structure_text():
    """Get the raw structure.txt file content as plain text (default structure)."""
    try:
        structure_path = file_utils.structure_path
        if not os.path.exists(structure_path):
            raise HTTPException(status_code=404, detail="structure.txt not found")
        with open(structure_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"content": content}
    except HTTPException:
        raise


@app.get("/api/graphs/{graph_name}/structure/text")
async def get_graph_structure_text(graph_name: str):
    """Get the raw structure file content for a specific graph."""
    try:
        fu = get_file_utils_for_graph(graph_name)
        structure_path = fu.structure_path
        if not os.path.exists(structure_path):
            raise HTTPException(status_code=404, detail=f"Structure file not found for graph '{graph_name}'")
        with open(structure_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"content": content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/items/{path:path}")
async def get_item(path: str):
    """Get an item by its path (default structure)."""
    try:
        data = _load_graph_data(file_utils, "default")
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


@app.get("/api/graphs/{graph_name}/items/{path:path}")
async def get_graph_item(graph_name: str, path: str):
    """Get an item by its path from a specific graph."""
    try:
        fu = get_file_utils_for_graph(graph_name)
        data = _load_graph_data(fu, graph_name)
        keys = path_to_keys(path)
        
        parent, item_key, item_value = find_item(data['structure'], keys)
        
        if parent is None:
            raise HTTPException(status_code=404, detail=f"Item not found: {path}")
        
        return {
            "path": path,
            "name": item_key,
            "data": item_value
        }
    except HTTPException:
        raise
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
            data = _load_graph_data(file_utils, "default")
            print(f"DEBUG: Loaded structure successfully")
            print(f"DEBUG: Data keys: {list(data.keys())}")
            if 'structure' not in data:
                print(f"DEBUG ERROR: 'structure' key missing from loaded data!")
                print(f"DEBUG: Full data: {data}")
                raise HTTPException(status_code=500, detail="Invalid structure file: missing 'structure' key")
        except HTTPException:
            raise
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
            # Rename the item while preserving its position in the parent dictionary
            # Create a new dict with the same order, but with the renamed key
            new_parent = {}
            for key, value in parent.items():
                if key == item_key:
                    new_parent[new_name] = value
                else:
                    new_parent[key] = value
            # Replace parent's contents with the new order
            parent.clear()
            parent.update(new_parent)
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
        _save_graph_data(
            fu=file_utils,
            data_to_save=data_to_save,
            graph_name="default",
            mutation_type="update_item",
            mutation_payload={"path": path, "renamed": renamed},
            request=request,
        )
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


@app.post("/api/items/{path:path}/move-up")
async def move_item_up(path: str, request: Request):
    """Move an item up in the order within its parent."""
    # Consume and ignore any request body
    try:
        await request.body()
    except:
        pass
    
    # Strip trailing dots from path
    path = path.rstrip('.')
    
    try:
        # Load the PROCESSED structure (with id, title, children)
        data = _load_graph_data(file_utils, "default")
        keys = path_to_keys(path)
        
        if not keys:
            raise HTTPException(status_code=400, detail="Invalid path")
        
        print(f"DEBUG: Path keys: {keys}")
        
        # Navigate to the parent's 'children' dict that contains our item
        if len(keys) == 1:
            # Top-level item - parent is data['structure']
            parent_children_dict = data['structure']
            item_key = keys[0]
        else:
            # Navigate through the hierarchy to find parent
            current = data['structure']
            
            # Navigate to the parent item (all keys except last)
            for i, key in enumerate(keys[:-1]):
                if key not in current:
                    raise HTTPException(status_code=404, detail=f"Key '{key}' not found at level {i}. Available: {list(current.keys())}")
                
                current = current[key]
                
                # Move into children dict if we're not at the last parent level
                if 'children' in current:
                    current = current['children']
                else:
                    raise HTTPException(status_code=400, detail=f"Item '{key}' has no children")
            
            parent_children_dict = current
            item_key = keys[-1]
        
        print(f"DEBUG: item_key='{item_key}', parent keys: {list(parent_children_dict.keys())}")
        
        # Check if item exists
        if item_key not in parent_children_dict:
            raise HTTPException(status_code=404, detail=f"Item '{item_key}' not found in parent. Available: {list(parent_children_dict.keys())}")
        
        # Get ordered list of keys
        all_keys = list(parent_children_dict.keys())
        current_index = all_keys.index(item_key)
        
        # Check if already at top
        if current_index == 0:
            raise HTTPException(status_code=400, detail="Item is already at the top")
        
        # Swap with item above
        all_keys[current_index], all_keys[current_index - 1] = all_keys[current_index - 1], all_keys[current_index]
        
        # Rebuild dict in new order
        new_parent = {}
        for key in all_keys:
            new_parent[key] = parent_children_dict[key]
        
        # Replace parent's contents
        parent_children_dict.clear()
        parent_children_dict.update(new_parent)
        
        # Clean (remove id/title/children wrappers) and save
        data_to_save = _clean_structure_for_save(data)
        _save_graph_data(
            fu=file_utils,
            data_to_save=data_to_save,
            graph_name="default",
            mutation_type="move_item_up",
            mutation_payload={"path": path},
            request=request,
        )
        
        # Sync to Google Cloud Storage
        upload_default_structure_to_gcs()
        
        return {
            "success": True,
            "message": f"Moved {item_key} up",
            "new_position": current_index - 1
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class ReorderPayload(BaseModel):
    """Model for reordering an item."""
    target_index: int = Field(..., ge=0, description="Target position index (0-based)")


@app.post("/api/items/{path:path}/reorder")
async def reorder_item(path: str, payload: ReorderPayload):
    """Reorder an item to a specific position within its parent."""
    try:
        # Strip trailing dots from path
        path = path.rstrip('.')
        
        data = _load_graph_data(file_utils, "default")
        keys = path_to_keys(path)
        
        if len(keys) == 0:
            raise HTTPException(status_code=400, detail="Invalid path")
        
        item_key = keys[-1]
        print(f"DEBUG: Reordering item '{item_key}' to index {payload.target_index}")
        
        # Get parent container
        if len(keys) == 1:
            # Top-level item
            parent_children_dict = data['structure']
        else:
            parent_keys = keys[:-1]
            _, parent_key, parent_value = find_item(data['structure'], parent_keys)
            if parent_value is None:
                raise HTTPException(status_code=404, detail=f"Parent not found for path: {path}")
            
            if isinstance(parent_value, dict) and 'children' in parent_value:
                parent_children_dict = parent_value['children']
            else:
                parent_children_dict = parent_value
        
        print(f"DEBUG: item_key='{item_key}', parent keys: {list(parent_children_dict.keys())}")
        
        if item_key not in parent_children_dict:
            raise HTTPException(status_code=404, detail=f"Item '{item_key}' not found")
        
        # Get ordered list of keys
        all_keys = list(parent_children_dict.keys())
        current_index = all_keys.index(item_key)
        target_index = min(payload.target_index, len(all_keys) - 1)
        
        if current_index == target_index:
            return {"success": True, "message": "Item is already at target position"}
        
        # Remove from current position and insert at target
        all_keys.pop(current_index)
        all_keys.insert(target_index, item_key)
        
        # Rebuild dict in new order
        new_parent = {}
        for key in all_keys:
            new_parent[key] = parent_children_dict[key]
        
        # Replace parent's contents
        parent_children_dict.clear()
        parent_children_dict.update(new_parent)
        
        # Clean and save
        data_to_save = _clean_structure_for_save(data)
        _save_graph_data(
            fu=file_utils,
            data_to_save=data_to_save,
            graph_name="default",
            mutation_type="reorder_item",
            mutation_payload={"path": path, "target_index": target_index},
        )
        
        # Sync to Google Cloud Storage
        upload_default_structure_to_gcs()
        
        return {
            "success": True,
            "message": f"Moved {item_key} from position {current_index} to {target_index}",
            "new_position": target_index
        }
    except HTTPException:
        raise
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
        
        # Validate item content
        validate_item_content(name=item.name, context=item.context)
        
        data = _load_graph_data(file_utils, "default")
        
        # Validate graph limits
        validate_graph_limits(data.get('structure', {}), adding=1, new_depth=len(path_to_keys(parent_path)) + 1)
        
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
        _save_graph_data(
            fu=file_utils,
            data_to_save=data_to_save,
            graph_name="default",
            mutation_type="create_item",
            mutation_payload={"parent_path": parent_path, "name": new_name},
        )
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


class PasteContent(BaseModel):
    """Model for pasting content from clipboard."""
    content: str = Field(..., description="Content to paste (in structure.txt format)")


@app.post("/api/items/{parent_path:path}/paste")
async def paste_item(parent_path: str, data: PasteContent):
    """Paste content from clipboard, creating items under the specified parent."""
    try:
        print(f"DEBUG: Pasting content under parent_path: '{parent_path}'")
        
        # Validate paste content size
        if len(data.content) > MAX_PASTE_CONTENT_SIZE:
            raise HTTPException(
                status_code=400, 
                detail=f"Paste content exceeds maximum size ({MAX_PASTE_CONTENT_SIZE // 1024}KB)"
            )
        
        structure_data = _load_graph_data(file_utils, "default")
        
        # Handle special cases: empty path, "root", or "home" all mean add to top-level structure
        if parent_path in ("", "root", "home"):
            keys = []
        else:
            keys = path_to_keys(parent_path)
        
        # Locate parent container
        if not keys:
            parent_container = structure_data.get('structure', {})
        else:
            parent, parent_key, parent_value = find_item(structure_data['structure'], keys)
            if parent is None:
                raise HTTPException(status_code=404, detail=f"Parent not found: {parent_path}")
            
            if not isinstance(parent_value, dict):
                parent_value = {}
                parent[parent_key] = parent_value
            
            # Items are stored under 'children' key after loading
            parent_container = parent_value.get('children', parent_value)
        
        # Parse the pasted content - wrap it in a structure section for parsing
        wrapped_content = f"metadata\nstructure\n"
        for line in data.content.strip().split('\n'):
            wrapped_content += f"  {line}\n"
        
        parsed = SimpleParser.parse_string(wrapped_content)
        
        if 'structure' not in parsed or not parsed['structure']:
            raise HTTPException(status_code=400, detail="Could not parse pasted content")
        
        # Count items being pasted and validate
        new_items_count, new_depth = count_items(parsed['structure'])
        validate_graph_limits(structure_data.get('structure', {}), adding=new_items_count, new_depth=len(keys) + new_depth + 1)
        validate_children_limit(parent_container)
        
        # Add parsed items to parent container
        added_items = []
        for item_key, item_value in parsed['structure'].items():
            # Skip metadata properties
            if item_key in ['id', 'title', 'children']:
                continue
            
            # Check for name collision
            if item_key in parent_container:
                # Add suffix to make unique
                base_key = item_key
                counter = 2
                while f"{base_key}_{counter}" in parent_container:
                    counter += 1
                item_key = f"{base_key}_{counter}"
            
            parent_container[item_key] = item_value
            added_items.append(item_key)
        
        # Clean and save structure
        data_to_save = _clean_structure_for_save(structure_data)
        _save_graph_data(
            fu=file_utils,
            data_to_save=data_to_save,
            graph_name="default",
            mutation_type="paste_item",
            mutation_payload={"parent_path": parent_path, "added_count": len(added_items)},
        )
        
        return {
            "success": True,
            "added": added_items,
            "parent_path": parent_path
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
        data = _load_graph_data(file_utils, "default")
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
        _save_graph_data(
            fu=file_utils,
            data_to_save=data_to_save,
            graph_name="default",
            mutation_type="delete_item",
            mutation_payload={"path": path},
        )
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


# ============================================================================
# GRAPH-SPECIFIC ITEM ENDPOINTS (for multi-structure support)
# ============================================================================

@app.put("/api/graphs/{graph_name}/items/{path:path}")
async def update_graph_item(graph_name: str, path: str, request: Request):
    """Update an item's properties in a specific graph."""
    try:
        fu = get_file_utils_for_graph(graph_name)
        update_data = await request.json()
        print(f"DEBUG: Updating item at path: {path} in graph: {graph_name}")
        
        remove_progress = update_data.get('progress') == ''
        remove_context = update_data.get('context') == ''
        remove_due = update_data.get('due') == ''
        
        if remove_progress:
            update_data['progress'] = None
        if remove_context:
            update_data['context'] = None
        if remove_due:
            update_data['due'] = None
        
        data = _load_graph_data(fu, graph_name)
        keys = path_to_keys(path)
        parent, item_key, item_value = find_item(data['structure'], keys)
        
        if parent is None:
            raise HTTPException(status_code=404, detail=f"Item not found: {path}")
        
        if not isinstance(item_value, dict):
            item_value = {}
            parent[item_key] = item_value
        
        new_name = update_data.get('name')
        renamed = False
        if new_name is not None and new_name != item_key:
            new_name = new_name.lower().replace(' ', '_')
            if new_name in parent and new_name != item_key:
                raise HTTPException(status_code=400, detail=f"Item '{new_name}' already exists at this level")
            new_parent = {}
            for key, value in parent.items():
                if key == item_key:
                    new_parent[new_name] = value
                else:
                    new_parent[key] = value
            parent.clear()
            parent.update(new_parent)
            item_value = parent[new_name]
            renamed = True
        
        if remove_progress:
            item_value.pop('progress', None)
        elif 'progress' in update_data and update_data['progress'] is not None:
            item_value['progress'] = int(update_data['progress'])
        
        if remove_context:
            item_value.pop('context', None)
        elif 'context' in update_data and update_data['context'] is not None:
            item_value['context'] = update_data['context']
            
        if remove_due:
            item_value.pop('due', None)
        elif 'due' in update_data and update_data['due'] is not None:
            import re
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', update_data['due']):
                raise HTTPException(status_code=400, detail=f"Invalid date format: {update_data['due']}. Must be YYYY-MM-DD")
            item_value['due'] = update_data['due']
        
        data_to_save = _clean_structure_for_save(data)
        _save_graph_data(
            fu=fu,
            data_to_save=data_to_save,
            graph_name=graph_name,
            mutation_type="update_item",
            mutation_payload={"path": path, "renamed": renamed},
            request=request,
        )
        
        final_path = path
        if renamed:
            path_parts = keys[:-1] + [new_name]
            final_path = '.'.join(path_parts) if path_parts else new_name
        
        return {
            "success": True,
            "path": final_path,
            "updated": item_value
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/graphs/{graph_name}/items/{parent_path:path}/paste")
async def paste_graph_item(graph_name: str, parent_path: str, data: PasteContent):
    """Paste content from clipboard, creating items under the specified parent in a specific graph."""
    try:
        fu = get_file_utils_for_graph(graph_name)
        print(f"DEBUG: Pasting content under parent_path: '{parent_path}' in graph: {graph_name}")
        
        # Validate paste content size
        if len(data.content) > MAX_PASTE_CONTENT_SIZE:
            raise HTTPException(
                status_code=400, 
                detail=f"Paste content exceeds maximum size ({MAX_PASTE_CONTENT_SIZE // 1024}KB)"
            )
        
        structure_data = _load_graph_data(fu, graph_name)
        
        if parent_path in ("", "root", "home"):
            keys = []
        else:
            keys = path_to_keys(parent_path)
        
        if not keys:
            parent_container = structure_data.get('structure', {})
        else:
            parent, parent_key, parent_value = find_item(structure_data['structure'], keys)
            if parent is None:
                raise HTTPException(status_code=404, detail=f"Parent not found: {parent_path}")
            
            if not isinstance(parent_value, dict):
                parent_value = {}
                parent[parent_key] = parent_value
            
            # Items are stored under 'children' key after loading
            parent_container = parent_value.get('children', parent_value)
        
        # Parse the pasted content
        wrapped_content = f"metadata\nstructure\n"
        for line in data.content.strip().split('\n'):
            wrapped_content += f"  {line}\n"
        
        parsed = SimpleParser.parse_string(wrapped_content)
        
        if 'structure' not in parsed or not parsed['structure']:
            raise HTTPException(status_code=400, detail="Could not parse pasted content")
        
        # Count items being pasted and validate
        new_items_count, new_depth = count_items(parsed['structure'])
        validate_graph_limits(structure_data.get('structure', {}), adding=new_items_count, new_depth=len(keys) + new_depth + 1)
        validate_children_limit(parent_container)
        
        added_items = []
        for item_key, item_value in parsed['structure'].items():
            if item_key in ['id', 'title', 'children']:
                continue
            
            if item_key in parent_container:
                base_key = item_key
                counter = 2
                while f"{base_key}_{counter}" in parent_container:
                    counter += 1
                item_key = f"{base_key}_{counter}"
            
            parent_container[item_key] = item_value
            added_items.append(item_key)
        
        data_to_save = _clean_structure_for_save(structure_data)
        _save_graph_data(
            fu=fu,
            data_to_save=data_to_save,
            graph_name=graph_name,
            mutation_type="paste_item",
            mutation_payload={"parent_path": parent_path, "added_count": len(added_items)},
        )
        
        return {
            "success": True,
            "added": added_items,
            "parent_path": parent_path
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/graphs/{graph_name}/items/{path:path}/reorder")
async def reorder_graph_item(graph_name: str, path: str, body: dict = Body(...)):
    """Reorder an item to a specific position in a specific graph."""
    try:
        fu = get_file_utils_for_graph(graph_name)
        target_index = body.get('target_index')
        if target_index is None:
            raise HTTPException(status_code=400, detail="target_index is required")
        
        data = _load_graph_data(fu, graph_name)
        keys = path_to_keys(path)
        
        if len(keys) < 1:
            raise HTTPException(status_code=400, detail="Cannot reorder root item")
        
        if len(keys) == 1:
            # Root level items - use structure directly
            parent_dict = data['structure']
        else:
            # Nested items - find parent and use its children
            parent_keys = keys[:-1]
            parent, _, parent_value = find_item(data['structure'], parent_keys)
            if parent is None:
                raise HTTPException(status_code=404, detail=f"Parent not found: {'.'.join(parent_keys)}")
            # Items are stored in 'children' key after loading
            parent_dict = parent_value.get('children', parent_value)
        
        item_key = keys[-1]
        if item_key not in parent_dict:
            raise HTTPException(status_code=404, detail=f"Item not found: {path}")
        
        current_order = list(parent_dict.keys())
        current_order = [k for k in current_order if k not in ['children', 'progress', 'context', 'due', 'id', 'title']]
        
        if item_key not in current_order:
            raise HTTPException(status_code=404, detail=f"Item not found in siblings")
        
        current_index = current_order.index(item_key)
        current_order.pop(current_index)
        target_index = max(0, min(target_index, len(current_order)))
        current_order.insert(target_index, item_key)
        
        new_parent = {}
        for prop in ['progress', 'context', 'due']:
            if prop in parent_dict:
                new_parent[prop] = parent_dict[prop]
        for key in current_order:
            new_parent[key] = parent_dict[key]
        
        parent_dict.clear()
        parent_dict.update(new_parent)
        
        data_to_save = _clean_structure_for_save(data)
        _save_graph_data(
            fu=fu,
            data_to_save=data_to_save,
            graph_name=graph_name,
            mutation_type="reorder_item",
            mutation_payload={"path": path, "target_index": target_index},
        )
        
        return {
            "success": True,
            "path": path,
            "new_position": target_index
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/graphs/{graph_name}/items/{parent_path:path}")
async def create_graph_item(graph_name: str, parent_path: str, item: ItemCreate):
    """Create a new item under a parent in a specific graph."""
    try:
        fu = get_file_utils_for_graph(graph_name)
        print(f"DEBUG: Creating item under parent_path: '{parent_path}' in graph: {graph_name}")
        
        # Validate item content
        validate_item_content(name=item.name, context=item.context)
        
        data = _load_graph_data(fu, graph_name)
        
        # Validate graph limits
        if parent_path in ("", "root", "home"):
            keys = []
        else:
            keys = path_to_keys(parent_path)
        
        validate_graph_limits(data.get('structure', {}), adding=1, new_depth=len(keys) + 1)

        if not keys:
            parent_children = data.get('structure', {})
        else:
            parent, parent_key, parent_value = find_item(data['structure'], keys)
            if parent is None:
                raise HTTPException(status_code=404, detail=f"Parent not found: {parent_path}")
            
            if not isinstance(parent_value, dict):
                parent_value = {}
                parent[parent_key] = parent_value
            
            parent_children = parent_value

        new_name = item.name.lower().replace(' ', '_')
        
        if new_name in parent_children:
            raise HTTPException(status_code=400, detail=f"Item '{new_name}' already exists under this parent")

        new_item = {}
        if item.progress is not None:
            new_item['progress'] = item.progress
        if item.context:
            new_item['context'] = item.context
        if item.due:
            new_item['due'] = item.due
        
        parent_children[new_name] = new_item
        
        data_to_save = _clean_structure_for_save(data)
        _save_graph_data(
            fu=fu,
            data_to_save=data_to_save,
            graph_name=graph_name,
            mutation_type="create_item",
            mutation_payload={"parent_path": parent_path, "name": new_name},
        )
        
        if not parent_path or parent_path in ("root", "home"):
            new_path = new_name
        else:
            new_path = f"{parent_path}.{new_name}"
        
        return {
            "success": True,
            "path": new_path,
            "created": new_item
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/graphs/{graph_name}/items/{path:path}")
async def delete_graph_item(graph_name: str, path: str):
    """Delete an item from a specific graph."""
    try:
        fu = get_file_utils_for_graph(graph_name)
        print(f"DEBUG: Deleting item at path: {path} in graph: {graph_name}")
        
        data = _load_graph_data(fu, graph_name)
        keys = path_to_keys(path)
        
        parent, item_key, item_value = find_item(data['structure'], keys)
        
        if parent is None:
            raise HTTPException(status_code=404, detail=f"Item not found: {path}")
        
        del parent[item_key]
        
        data_to_save = _clean_structure_for_save(data)
        _save_graph_data(
            fu=fu,
            data_to_save=data_to_save,
            graph_name=graph_name,
            mutation_type="delete_item",
            mutation_payload={"path": path},
        )
        
        return {
            "success": True,
            "deleted": path
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/graphs/{graph_name}/state-version")
async def get_graph_state_version(graph_name: str):
    """Return current graph state version for optimistic concurrency control."""
    try:
        if GRAPH_STATE_BACKEND in {"dual", "firestore"} and firestore_store.is_available():
            version = firestore_store.get_graph_version(_resolve_graph_key(graph_name))
            return {
                "graph": graph_name,
                "version": version,
                "backend": "firestore",
            }

        return {
            "graph": graph_name,
            "version": 0,
            "backend": GRAPH_STATE_BACKEND,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/graphs/{graph_name}/mutations")
async def get_graph_mutations(graph_name: str, since_version: int = 0, limit: int = 200):
    """Return append-only mutation log entries for realtime sync consumers."""
    try:
        if since_version < 0:
            raise HTTPException(status_code=400, detail="since_version must be >= 0")
        if limit < 1:
            raise HTTPException(status_code=400, detail="limit must be >= 1")

        if not (GRAPH_STATE_BACKEND in {"dual", "firestore"} and firestore_store.is_available()):
            raise HTTPException(
                status_code=503,
                detail="Mutation log requires Firestore backend in dual or firestore mode.",
            )

        graph_key = _resolve_graph_key(graph_name)
        mutations = firestore_store.get_mutations(graph_key, since_version=since_version, limit=limit)
        latest_version = firestore_store.get_graph_version(graph_key)
        return {
            "graph": graph_name,
            "since_version": since_version,
            "latest_version": latest_version,
            "count": len(mutations),
            "mutations": mutations,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def get_affected_paths(item_path: str) -> list:
    """
    Get list of item paths that need HTML regeneration.
    Includes the item itself and all ancestors (for breadcrumb updates).
    When a child is added, the parent needs regeneration even if it was a leaf before.
    """
    affected = []
    
    # Handle root/home case
    if not item_path or item_path in ('root', 'home'):
        affected.append('root')
        return affected
    
    keys = path_to_keys(item_path)
    
    # Add all ancestors (including the item itself)
    # This ensures parent nodes get HTML generated when children are added
    for i in range(len(keys)):
        ancestor_path = '.'.join(keys[:i+1])
        if ancestor_path not in affected:
            affected.append(ancestor_path)
    
    # Always include root
    if 'root' not in affected:
        affected.append('root')
    
    return affected


def regenerate_html(paths: list):
    """Regenerate HTML files for specific paths and their descendants."""
    from graph import GraphApp
    
    app = GraphApp()
    
    # Collect all paths including descendants of affected paths
    all_paths_to_regenerate = set()
    
    for path in paths:
        # Add the path itself
        all_paths_to_regenerate.add(path)
        
        # Get all descendants of this path that have children
        if path == 'root':
            # If regenerating root, get all non-leaf items
            all_non_leaf = file_utils.get_all_non_leaf_items()
            for item in all_non_leaf:
                item_path = item.get('id', '').replace('_', '.')
                if item_path:
                    all_paths_to_regenerate.add(item_path)
        else:
            # Get all non-leaf descendants of this path
            item_id = path.replace('.', '_')
            descendants = file_utils.get_descendants_with_children(item_id)
            for desc_id in descendants:
                desc_path = desc_id.replace('_', '.')
                all_paths_to_regenerate.add(desc_path)
    
    # Generate HTML for all collected paths
    for path in all_paths_to_regenerate:
        try:
            if path == 'root':
                item_id = 'home'
            else:
                item_id = path.replace('.', '_')
            
            # Check if this item should have an HTML file generated
            # Generate HTML if:
            # 1. It's home/root, OR
            # 2. It has children (non-leaf node)
            if path == 'root' or not file_utils.is_leaf_node(item_id):
                app.generate_graph_for_item(item_id)
                print(f"Generated HTML for {item_id}")
            else:
                print(f"Skipped HTML generation for leaf node {item_id}")
        except Exception as e:
            print(f"Warning: Failed to regenerate HTML for {path}: {e}")


@app.post("/api/sync/download")
async def sync_download():
    """Download structure.txt from Google Cloud Storage."""
    success = download_default_structure_from_gcs()
    return {
        "success": success,
        "action": "download",
        "message": "Downloaded structure.txt from Google Cloud Storage" if success else "Download failed"
    }


@app.post("/api/sync/upload")
async def sync_upload():
    """Upload structure.txt to Google Cloud Storage."""
    success = upload_default_structure_to_gcs()
    return {
        "success": success,
        "action": "upload",
        "message": "Uploaded structure.txt to Google Cloud Storage" if success else "Upload failed"
    }


@app.post("/api/sync-to-drive")
async def sync_to_drive():
    """Alias for uploading structure.txt to Google Cloud Storage."""
    success = upload_default_structure_to_gcs()
    return {
        "success": success,
        "action": "upload",
        "message": "Uploaded structure.txt to Google Cloud Storage" if success else "Upload failed"
    }


@app.post("/api/graphs/{graph_name}/sync")
async def sync_graph_to_drive(graph_name: str):
    """Upload a specific graph to Google Cloud Storage."""
    try:
        success = upload_graph_to_gcs(graph_name)
        return {
            "success": success,
            "graph": graph_name,
            "message": f"Synced {graph_name} to Google Cloud Storage" if success else "Sync failed"
        }
    except Exception as e:
        return {
            "success": False,
            "graph": graph_name,
            "message": str(e)
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
    download_success = download_default_structure_from_gcs()
    if not download_success:
        return {
            "success": False,
            "download": False,
            "upload": False,
            "message": "Sync failed: could not download"
        }
    
    upload_success = upload_default_structure_to_gcs()
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
if HTML_DIR.exists():
    import os
    files = os.listdir(HTML_DIR)
    print(f"HTML files: {files[:10]}")  # Print first 10 files


# Root redirect to frontend app
@app.get("/")
async def root():
    """Serve the frontend React app"""
    # Check if we're in production mode (frontend-dist exists)
    frontend_dist = Path(__file__).parent.parent / "frontend-dist"
    if frontend_dist.exists() and os.getenv("PRODUCTION"):
        # Production: serve React app
        return FileResponse(frontend_dist / "index.html")
    else:
        # Development: redirect to old HTML
        return RedirectResponse(url="/html/home.html")


# Serve individual HTML files
@app.get("/html/{filename}")
async def serve_html(filename: str):
    """Serve HTML files from the html directory"""
    file_path = HTML_DIR / filename
    print(f"Requested file: {filename}, full path: {file_path}, exists: {file_path.exists()}")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type="text/html")


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check for Cloud Run"""
    return {
        "status": "healthy",
        "service": "graph-api",
        "graph_state_backend": GRAPH_STATE_BACKEND,
        "firestore_available": firestore_store.is_available(),
    }


# Mount static files for production frontend
frontend_dist = Path(__file__).parent.parent / "frontend-dist"
if frontend_dist.exists() and os.getenv("PRODUCTION"):
    # Serve React app static assets
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="static-assets")
    
    # Catch-all route for React Router (must be last)
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        """Serve React app for all non-API routes"""
        # Don't interfere with API routes
        if full_path.startswith("api/") or full_path.startswith("html/"):
            raise HTTPException(status_code=404)
        return FileResponse(frontend_dist / "index.html")


if __name__ == "__main__":
    import uvicorn
    import os
    # Cloud Run uses PORT, local dev uses API_PORT or defaults to 8000
    port = int(os.getenv("PORT", os.getenv("API_PORT", 8000)))
    uvicorn.run(app, host="0.0.0.0", port=port)
