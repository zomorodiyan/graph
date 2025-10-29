
# New File Structure

## src/file_utils.py
**Purpose**: File operations and path handling utilities
- `FileUtils` class with static methods
- Cross-platform path normalization (`normalize_path()`)
- Directory traversal (`get_markdown_files_from_directories()`)
- File discovery (`find_file_in_directories()`)
- File existence checking (`check_file_exists()`)
- Markdown parsing (`read_layers_from_md()`, `extract_context_from_md()`)
- Path component extraction (`get_path_components_from_file_path()`)

## src/hierarchy_builder.py
**Purpose**: Hierarchy construction and management
- `HierarchyBuilder` class for building directory-based hierarchies
- File system to logical hierarchy mapping (`build_hierarchy_from_files()`)
- Parent-child relationship establishment
- Dynamic file association (`get_file_association_dynamic()`)
- 3-level hierarchy parsing (`parse_md_hierarchy()`)
- Level-by-level processing methods

## src/html_generator.py
**Purpose**: HTML generation and styling
- `HTMLGenerator` class for creating interactive web pages
- HTML structure building (`generate_html_graph()`)
- CSS styling (`_get_css_styles()`)
- JavaScript functionality (`_get_javascript_functions()`)
- Breadcrumb navigation (`_create_breadcrumb_html()`)
- Layer-specific section builders

## src/graph.py (New)
**Purpose**: Main application coordination
- `GraphApp` class as the main orchestrator
- Simplified public interface methods
- Coordinates between file utils, hierarchy builder, and HTML generator
- Clean entry point (`main()`)

# Usage
The application usagee:
```bash
python3 run.py                    # Generate main visualization
python3 src/graph.py             # Direct script usage
```
