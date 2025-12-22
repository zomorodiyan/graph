"""
Main YAML-based graph generation script.
Coordinates between YAML data, hierarchy builder, and HTML generator.
"""
import os
import sys
from file_utils import FileUtils
from hierarchy_builder import HierarchyBuilder
from html_generator import HTMLGenerator


class GraphApp:
    """Main application class that coordinates graph generation from YAML data."""
    
    def __init__(self):
        self.file_utils = FileUtils()
        self.hierarchy_builder = HierarchyBuilder()
        self.html_generator = HTMLGenerator()
    
    def generate_graph_for_item(self, item_id="home"):
        """Generate HTML graph for a specific item or the root home view."""
        # Check if this is a time-based view
        time_categories = ['time_over', 'time_day', 'time_week', 'time_month']
        
        if item_id in time_categories:
            # Generate time-based view
            category_map = {'time_over': 'overdue', 'time_day': 'day', 'time_week': 'week', 'time_month': 'month'}
            category = category_map.get(item_id, item_id.split('_')[-1])
            data = self.hierarchy_builder.build_time_view_data(category)
        elif item_id == 'time':
            # Special handling for time - show all time categories with their items
            data = self.hierarchy_builder.build_time_view()
        else:
            # Parse hierarchy for the item normally
            data = self.hierarchy_builder.parse_structure_for_display(item_id)
        
        # Determine output path
        if item_id == "home":
            base_name = "home"
        else:
            base_name = item_id
        
        html_dir = self.file_utils.ensure_html_directory_exists()
        html_path = os.path.join(html_dir, f"{base_name}.html")
        
        # Generate breadcrumb navigation
        breadcrumb = self.hierarchy_builder.get_breadcrumb_for_item(item_id)
        
        # Get the current item's path (for items with underscores in names)
        current_item_path = None
        if item_id != 'home' and item_id != 'time':
            current_item = self.hierarchy_builder._find_item_by_id(
                self.hierarchy_builder._load_yaml_structure(), item_id
            )
            if current_item:
                current_item_path = current_item.get('path', item_id)
        
        # Generate HTML
        self.html_generator.generate_html_graph(
            data, html_path, 
            current_item_id=item_id,
            current_item_path=current_item_path,
            breadcrumb_path=breadcrumb
        )
        return html_path
    
    def generate_all_graphs(self):
        """Generate HTML files for all non-leaf items in the YAML structure."""
        print("Generating graphs from YAML structure...")
        
        # Get only non-leaf items from the structure
        all_non_leaf_items = self.file_utils.get_all_non_leaf_items()
        html_dir = self.file_utils.ensure_html_directory_exists()
        
        # Generate main data view
        main_html_path = self.generate_graph_for_item("home")
        print(f"Generated main view: {main_html_path}")
        
        # Generate views for all non-leaf items
        generated_count = 0
        for item in all_non_leaf_items:
            item_id = item.get('id')
            if item_id and item_id != "home":
                try:
                    html_path = self.generate_graph_for_item(item_id)
                    print(f"Generated: {html_path}")
                    generated_count += 1
                except Exception as e:
                    print(f"Error generating graph for {item_id}: {e}")
        
        # Generate time-based views - skip individual category pages
        print("\nSkipping time category pages (Over, Day, Week, Month)...")
        # time_views = ['time_over', 'time_day', 'time_week', 'time_month']
        # for view_id in time_views:
        #     try:
        #         html_path = self.generate_graph_for_item(view_id)
        #         print(f"Generated time view: {html_path}")
        #     except Exception as e:
        #         print(f"Error generating time view {view_id}: {e}")
        
        print(f"\nGenerated {generated_count} individual item views (leaf nodes excluded)")
        return main_html_path
    
    def search_items(self, query):
        """Search for items matching a query."""
        try:
            return self.file_utils.search_items(query)
        except Exception as e:
            print(f"Error searching items: {e}")
            return []
    

def main():
    """Main entry point for the graph generation script."""
    app = GraphApp()
    
    # Handle command line arguments
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "search":
            # Search for items
            if len(sys.argv) > 2:
                query = " ".join(sys.argv[2:])
                results = app.search_items(query)
                print(f"=== Search Results for '{query}' ===")
                for item in results:
                    print(f"- {item.get('title', 'Untitled')} (ID: {item.get('id', 'No ID')}) - Level {item.get('level', '?')}")
            else:
                print("Usage: python graph.py search <query>")
            return
        
        elif command.startswith("item:"):
            # Generate specific item
            item_id = command[5:]  # Remove "item:" prefix
            try:
                html_path = app.generate_graph_for_item(item_id)
                print(f"Generated graph for '{item_id}': {html_path}")
            except Exception as e:
                print(f"Error generating graph for '{item_id}': {e}")
            return
        
        else:
            print(f"Unknown command: {command}")
            print("Available commands: search <query>, item:<id>")
            return
    
    # Default behavior: generate all graphs
    try:
        main_html_path = app.generate_all_graphs()
        print(f"\nMain HTML file: {main_html_path}")
        
    except Exception as e:
        print(f"Error during graph generation: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()