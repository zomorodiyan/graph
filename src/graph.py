"""
Main graph generation script.
Coordinates between file utilities, hierarchy builder, and HTML generator.
"""
import os
import sys
from file_utils import FileUtils
from hierarchy_builder import HierarchyBuilder
from html_generator import HTMLGenerator


class GraphApp:
    """Main application class that coordinates graph generation."""
    
    def __init__(self):
        self.file_utils = FileUtils()
        self.hierarchy_builder = HierarchyBuilder()
        self.html_generator = HTMLGenerator()
    
    def generate_graph_for_file(self, md_file_path):
        """Generate HTML graph for a specific markdown file."""
        # Parse hierarchy for the file
        data = self.hierarchy_builder.parse_md_hierarchy(md_file_path)
        
        # Determine output path
        base_name = os.path.splitext(os.path.basename(md_file_path))[0]
        html_dir = self.file_utils.ensure_html_directory_exists()
        html_path = os.path.join(html_dir, f"{base_name}.html")
        
        # Generate HTML
        self.html_generator.generate_html_graph(data, html_path)
        return html_path
    
    def generate_graph_with_breadcrumb(self, md_file_path, parent_name=None):
        """Generate HTML graph with breadcrumb navigation."""
        # Parse hierarchy for the file
        data = self.hierarchy_builder.parse_md_hierarchy(md_file_path)
        
        # Determine output path
        base_name = os.path.splitext(os.path.basename(md_file_path))[0]
        html_dir = self.file_utils.ensure_html_directory_exists()
        html_path = os.path.join(html_dir, f"{base_name}.html")
        
        # Create breadcrumb
        breadcrumb = [("Main", "main.html")]
        if parent_name:
            breadcrumb.append((parent_name, None))
        
        # Generate HTML with breadcrumb
        self.html_generator.generate_html_graph(
            data, html_path, 
            parent_file=os.path.basename(md_file_path), 
            breadcrumb_path=breadcrumb
        )
        return html_path
    
    def generate_all_subgraphs(self):
        """Generate HTML files for all available markdown files."""
        # Get all markdown files from data directory
        md_file_paths = self.file_utils.get_markdown_files_from_directories()
        
        # Filter out main.md
        md_file_paths = [f for f in md_file_paths if not f.endswith('main.md')]

        html_dir = self.file_utils.ensure_html_directory_exists()

        for md_file_path in md_file_paths:
            try:
                # Extract just the filename for certain operations
                md_file = os.path.basename(md_file_path)
                
                data = self.hierarchy_builder.parse_md_hierarchy(md_file_path)
                if data:  # Only generate if file has content
                    base_name = os.path.splitext(md_file)[0]
                    html_path = os.path.join(html_dir, f"{base_name}.html")

                    # Create proper breadcrumb navigation using dynamic function
                    breadcrumb = self.html_generator.get_parent_file_info_dynamic(md_file)

                    self.html_generator.generate_html_graph(
                        data, html_path, 
                        parent_file=md_file, 
                        breadcrumb_path=breadcrumb
                    )
                    print(f"Generated sub-graph: {html_path}")

            except Exception as e:
                print(f"Error generating sub-graph for {md_file_path}: {e}")


def main():
    """Main entry point for the graph generation script."""
    app = GraphApp()
    
    # Determine the markdown file to process
    if len(sys.argv) > 1:
        md_file = sys.argv[1]
    else:
        md_file = os.path.join("..", "data", "main.md")
    
    # Check if this is a sub-graph request
    if len(sys.argv) > 2 and sys.argv[2] == "subgraph":
        parent_name = sys.argv[3] if len(sys.argv) > 3 else "Main"
        html_path = app.generate_graph_with_breadcrumb(md_file, parent_name)
    else:
        html_path = app.generate_graph_for_file(md_file)
        
        # Also generate sub-graphs for associated files
        print("Generating sub-graphs...")
        app.generate_all_subgraphs()

    print(f"Interactive graph saved to {html_path}")


if __name__ == "__main__":
    main()