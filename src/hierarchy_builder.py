"""
YAML-based hierarchy builder for the graph application.
Handles building and managing hierarchy structure from a YAML configuration file.
"""
import yaml
from datetime import datetime, timedelta


class HierarchyBuilder:
    """Builds and manages hierarchy structure from YAML configuration."""
    
    def __init__(self, yaml_file_path="../structure.yaml"):
        self.yaml_file_path = yaml_file_path
        self._structure_data = None
    
    def _load_yaml_structure(self):
        """Load structure from YAML file."""
        if self._structure_data is None:
            try:
                with open(self.yaml_file_path, 'r', encoding='utf-8') as f:
                    self._structure_data = yaml.safe_load(f)
            except FileNotFoundError:
                raise FileNotFoundError(f"Structure file not found: {self.yaml_file_path}")
            except yaml.YAMLError as e:
                raise ValueError(f"Error parsing YAML file: {e}")
        return self._structure_data
    
    def get_breadcrumb_for_item(self, item_id):
        """Generate breadcrumb navigation for an item based on its ID (supports unlimited depth)."""
        structure = self._load_yaml_structure()
        
        # No breadcrumb for data.html (root page)
        if item_id == "data":
            return []
        
        # Find the item and build its path
        path = self._find_item_path(structure, item_id)
        
        # Convert path to breadcrumb - include all items in the path
        breadcrumb = [("Data", "data.html")]
        
        for item in path:
            breadcrumb.append((item['title'], f"{item['id']}.html"))
        
        return breadcrumb
    
    def _find_item_path(self, structure, target_id):
        """Find the full path to an item by its ID."""
        def search_recursive(items, current_path=[]):
            for key, item in items.items():
                new_path = current_path + [item]
                
                if item.get('id') == target_id:
                    return new_path
                
                if 'children' in item:
                    result = search_recursive(item['children'], new_path)
                    if result:
                        return result
            return None
        
        return search_recursive(structure['structure']) or []
    
    def parse_structure_for_display(self, target_id="data"):
        """Parse YAML structure and build 3-level hierarchy data for display from any starting point."""
        structure = self._load_yaml_structure()
        
        if target_id == "data":
            # Return top-level view (show first 3 levels)
            return self._build_dynamic_view(structure, None, 3)
        else:
            # Find the target item and show 3 levels below it
            target_item = self._find_item_by_id(structure, target_id)
            if target_item:
                return self._build_dynamic_view(structure, target_item, 3)
            else:
                # Fallback to top-level view
                return self._build_dynamic_view(structure, None, 3)
    
    def _find_item_by_id(self, structure, target_id):
        """Recursively find an item by its ID in the structure."""
        def search_recursive(items, depth=0):
            for key, item in items.items():
                if item.get('id') == target_id:
                    return item
                if 'children' in item:
                    result = search_recursive(item['children'], depth + 1)
                    if result:
                        return result
            return None
        
        return search_recursive(structure['structure'])
    
    def _build_dynamic_view(self, structure, start_item=None, levels_to_show=3):
        """Build a dynamic view showing specified number of levels from a starting point."""
        if start_item is None:
            # Start from root - show top-level items
            return self._build_levels_from_root(structure, levels_to_show)
        else:
            # Start from specific item - show its children
            return self._build_levels_from_item(start_item, levels_to_show)
    
    def _build_levels_from_root(self, structure, levels_to_show):
        """Build view starting from root structure."""
        data = []
        
        for key, item in structure['structure'].items():
            layer_data = self._build_item_with_children(item, levels_to_show - 1)
            data.append(layer_data)
        
        return data
    
    def _build_levels_from_item(self, item, levels_to_show):
        """Build view starting from a specific item's children."""
        # Show the item's children as layer1, their children as layer2, etc.
        data = []
        
        # If the item has children, show them as the top level
        if 'children' in item:
            for child_key, child_item in item['children'].items():
                layer_data = self._build_item_with_children(child_item, levels_to_show - 1)
                data.append(layer_data)
        
        return data
    
    def _build_item_with_children(self, item, remaining_levels):
        """Recursively build an item with its children up to specified depth."""
        layer_data = {
            "layer1": item['title'],
            "layer1_id": item['id'],
            "layer1_context": item.get('context'),
            "layer1_due": item.get('due'),
            "layer1_progress": item.get('progress'),
            "layer2": []
        }
        
        if remaining_levels > 0 and 'children' in item:
            for child_key, child_item in item['children'].items():
                child_data = self._build_child_levels(child_item, remaining_levels - 1, 2)
                layer_data["layer2"].append(child_data)
        
        return layer_data
    
    def _build_child_levels(self, item, remaining_levels, current_level):
        """Recursively build child levels."""
        if current_level == 2:
            # Layer 2 structure
            child_data = {
                "name": item['title'],
                "id": item['id'],
                "context": item.get('context'),
                "due": item.get('due'),
                "progress": item.get('progress'),
                "layer3": []
            }
            
            # Check if this is a time view that needs dynamic population
            item_id = item.get('id', '')
            if item_id in ['time_over', 'time_day', 'time_week', 'time_month']:
                # Dynamically populate with items from due dates
                category_map = {
                    'time_over': 'overdue',
                    'time_day': 'day', 
                    'time_week': 'week',
                    'time_month': 'month'
                }
                category = category_map.get(item_id)
                if category:
                    categorized = self.categorize_items_by_due_date()
                    items = categorized.get(category, [])
                    
                    for due_item in items:
                        # Ensure due date is in consistent format
                        due_value = due_item['due']
                        if hasattr(due_value, 'strftime'):
                            due_str = due_value.strftime('%Y-%m-%d')
                        else:
                            due_str = str(due_value)
                        
                        # Build path string
                        path_str = ' > '.join(due_item['path'][:-1]) if len(due_item['path']) > 1 else ''
                        context_str = due_item.get('context', '')
                        
                        # Combine context and path
                        if context_str and path_str:
                            full_context = f"{context_str} • {path_str}"
                        elif path_str:
                            full_context = path_str
                        else:
                            full_context = context_str
                        
                        layer3_data = {
                            "name": due_item['title'],
                            "id": due_item['id'],
                            "context": full_context,
                            "due": due_str,
                            "progress": due_item.get('progress')
                        }
                        child_data["layer3"].append(layer3_data)
            elif remaining_levels > 0 and 'children' in item:
                for grandchild_key, grandchild_item in item['children'].items():
                    grandchild_data = self._build_child_levels(grandchild_item, remaining_levels - 1, 3)
                    child_data["layer3"].append(grandchild_data)
            
            return child_data
            
        elif current_level == 3:
            # Layer 3 structure  
            return {
                "name": item['title'],
                "id": item['id'],
                "context": item.get('context'),
                "due": item.get('due'),
                "progress": item.get('progress')
            }
        
        # For deeper levels, we'd need to extend the HTML structure
        # For now, return basic structure
        return {
            "name": item['title'],
            "id": item['id'],
            "context": item.get('context'),
            "due": item.get('due'),
            "progress": item.get('progress')
        }
    
    def get_all_items_with_due_dates(self):
        """Get all items that have due dates, organized by time category."""
        structure = self._load_yaml_structure()
        all_items = []
        
        # Collect all items recursively
        def collect_items(items, path=[]):
            for key, item in items.items():
                if 'due' in item:
                    item_data = {
                        'title': item['title'],
                        'id': item['id'],
                        'context': item.get('context'),
                        'due': item['due'],
                        'progress': item.get('progress'),
                        'path': path + [item['title']]
                    }
                    all_items.append(item_data)
                
                if 'children' in item:
                    collect_items(item['children'], path + [item['title']])
        
        collect_items(structure['structure'])
        
        # Sort by due date ascending
        all_items.sort(key=lambda x: x['due'])
        
        return all_items
    
    def categorize_items_by_due_date(self):
        """Categorize items into overdue, day, week, and month buckets."""
        all_items = self.get_all_items_with_due_dates()
        today = datetime.now().date()
        
        categorized = {
            'overdue': [],
            'day': [],
            'week': [],
            'month': []
        }
        
        for item in all_items:
            try:
                # Handle both string and date object (YAML auto-converts ISO 8601 dates)
                due_value = item['due']
                if isinstance(due_value, str):
                    due_date = datetime.strptime(due_value, '%Y-%m-%d').date()
                else:
                    # Already a date object
                    due_date = due_value
                
                days_until_due = (due_date - today).days
                
                if days_until_due < 0:
                    # Overdue
                    categorized['overdue'].append(item)
                elif days_until_due == 0:
                    # Due today
                    categorized['day'].append(item)
                elif days_until_due <= 6:
                    # Due within next 7 days (including today, so 0-6 days from now)
                    categorized['week'].append(item)
                elif days_until_due <= 30:
                    # Due within next month
                    categorized['month'].append(item)
            except (ValueError, TypeError, AttributeError):
                # Skip items with invalid date formats
                continue
        
        return categorized
    
    def build_time_view_data(self, category):
        """Build data structure for time-based views (overdue, day, week, month)."""
        categorized = self.categorize_items_by_due_date()
        items = categorized.get(category, [])
        
        # Build items directly as layer1 (no intermediate heading)
        if not items:
            return []
        
        data = []
        for item in items:
            # Ensure due date is in consistent format for display
            due_value = item['due']
            if hasattr(due_value, 'strftime'):
                due_str = due_value.strftime('%Y-%m-%d')
            else:
                due_str = str(due_value)
            
            # Build path string
            path_str = ' > '.join(item['path'][:-1]) if len(item['path']) > 1 else ''
            context_str = item.get('context', '')
            
            # Combine context and path
            if context_str and path_str:
                full_context = f"{context_str} • Path: {path_str}"
            elif path_str:
                full_context = f"Path: {path_str}"
            else:
                full_context = context_str
            
            layer1_data = {
                "layer1": item['title'],
                "layer1_id": item['id'],
                "layer1_context": full_context,
                "layer1_due": due_str,
                "layer1_progress": item.get('progress'),
                "layer2": []
            }
            data.append(layer1_data)
        
        return data
    
    def build_time_view(self):
        """Build the time view showing all time categories with their items as children."""
        categorized = self.categorize_items_by_due_date()
        
        category_config = [
            ('overdue', 'Over', 'time_over'),
            ('day', 'Day', 'time_day'),
            ('week', 'Week', 'time_week'),
            ('month', 'Month', 'time_month')
        ]
        
        data = []
        for category_key, category_title, category_id in category_config:
            items = categorized.get(category_key, [])
            
            # Build layer2 items for this category
            layer2_items = []
            for item in items:
                # Ensure due date is in consistent format for display
                due_value = item['due']
                if hasattr(due_value, 'strftime'):
                    due_str = due_value.strftime('%Y-%m-%d')
                else:
                    due_str = str(due_value)
                
                # Build path string
                path_str = ' > '.join(item['path'][:-1]) if len(item['path']) > 1 else ''
                context_str = item.get('context', '')
                
                # Combine context and path
                if context_str and path_str:
                    full_context = f"{context_str} • Path: {path_str}"
                elif path_str:
                    full_context = f"Path: {path_str}"
                else:
                    full_context = context_str
                
                layer2_data = {
                    "name": item['title'],
                    "id": item['id'],
                    "context": full_context,
                    "due": due_str,
                    "progress": item.get('progress'),
                    "layer3": []
                }
                layer2_items.append(layer2_data)
            
            # Add this category as a layer1 item
            layer1_data = {
                "layer1": category_title,
                "layer1_id": category_id,
                "layer1_context": f"{len(items)} item{'s' if len(items) != 1 else ''}" if items else "No items",
                "layer1_due": None,
                "layer2": layer2_items
            }
            data.append(layer1_data)
        
        return data