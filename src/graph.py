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
    
    def generate_graph_for_item(self, item_id="data"):
        """Generate HTML graph for a specific item or the root data view."""
        # Parse hierarchy for the item
        data = self.hierarchy_builder.parse_structure_for_display(item_id)
        
        # Determine output path
        if item_id == "data":
            base_name = "data"
        else:
            base_name = item_id
        
        html_dir = self.file_utils.ensure_html_directory_exists()
        html_path = os.path.join(html_dir, f"{base_name}.html")
        
        # Generate breadcrumb navigation
        breadcrumb = self.hierarchy_builder.get_breadcrumb_for_item(item_id)
        
        # Generate HTML
        self.html_generator.generate_html_graph(
            data, html_path, 
            current_item_id=item_id, 
            breadcrumb_path=breadcrumb
        )
        return html_path
    
    def generate_all_graphs(self):
        """Generate HTML files for all items in the YAML structure."""
        print("Generating graphs from YAML structure...")
        
        # Get all items from the structure
        all_items = self.file_utils.get_all_items()
        html_dir = self.file_utils.ensure_html_directory_exists()
        
        # Generate main data view
        main_html_path = self.generate_graph_for_item("data")
        print(f"Generated main view: {main_html_path}")
        
        # Generate views for all individual items
        generated_count = 0
        for item in all_items:
            item_id = item.get('id')
            if item_id and item_id != "data":
                try:
                    html_path = self.generate_graph_for_item(item_id)
                    print(f"Generated: {html_path}")
                    generated_count += 1
                except Exception as e:
                    print(f"Error generating graph for {item_id}: {e}")
        
        print(f"Generated {generated_count} individual item views")
        return main_html_path
    
    def get_structure_summary(self):
        """Get a summary of the structure for diagnostics."""
        try:
            all_items = self.file_utils.get_all_items()
            
            summary = {
                "total_items": len(all_items),
                "level_1_items": len([i for i in all_items if i.get('level') == 1]),
                "level_2_items": len([i for i in all_items if i.get('level') == 2]),
                "level_3_items": len([i for i in all_items if i.get('level') == 3]),
                "metadata": self.file_utils.get_structure_metadata()
            }
            
            return summary
        except Exception as e:
            return {"error": str(e)}
    
    def search_items(self, query):
        """Search for items matching a query."""
        try:
            return self.file_utils.search_items(query)
        except Exception as e:
            print(f"Error searching items: {e}")
            return []
    
    def validate_structure(self):
        """Validate the YAML structure for common issues."""
        issues = []
        
        try:
            all_items = self.file_utils.get_all_items()
            
            # Check for duplicate IDs
            ids_seen = set()
            for item in all_items:
                item_id = item.get('id')
                if item_id in ids_seen:
                    issues.append(f"Duplicate ID found: {item_id}")
                else:
                    ids_seen.add(item_id)
            
            # Check for missing titles
            for item in all_items:
                if not item.get('title'):
                    issues.append(f"Missing title for ID: {item.get('id', 'unknown')}")
            
            # Check for missing IDs
            for item in all_items:
                if not item.get('id'):
                    issues.append(f"Missing ID for title: {item.get('title', 'unknown')}")
            
            return issues
        
        except Exception as e:
            return [f"Error validating structure: {e}"]


def main():
    """Main entry point for the graph generation script."""
    app = GraphApp()
    
    # Handle command line arguments
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "summary":
            # Show structure summary
            summary = app.get_structure_summary()
            print("=== Structure Summary ===")
            for key, value in summary.items():
                print(f"{key}: {value}")
            return
        
        elif command == "validate":
            # Validate structure
            issues = app.validate_structure()
            print("=== Structure Validation ===")
            if issues:
                print("Issues found:")
                for issue in issues:
                    print(f"- {issue}")
            else:
                print("No issues found. Structure is valid.")
            return
        
        elif command == "search":
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
            print("Available commands: summary, validate, search <query>, item:<id>")
            return
    
    # Default behavior: generate all graphs
    try:
        main_html_path = app.generate_all_graphs()
        
        # Show summary
        summary = app.get_structure_summary()
        print("\n=== Generation Summary ===")
        print(f"Total items processed: {summary.get('total_items', 0)}")
        print(f"Level 1 categories: {summary.get('level_1_items', 0)}")
        print(f"Level 2 subcategories: {summary.get('level_2_items', 0)}")
        print(f"Level 3 items: {summary.get('level_3_items', 0)}")
        print(f"Main HTML file: {main_html_path}")
        
        # Validate structure
        issues = app.validate_structure()
        if issues:
            print("\n=== Validation Issues ===")
            for issue in issues:
                print(f"Warning: {issue}")
        else:
            print("\nStructure validation passed")
        
    except Exception as e:
        print(f"Error during graph generation: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()