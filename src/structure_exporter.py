"""
Structure exporter for the graph application.
Exports the complete hierarchy structure to YAML and JSON formats.
"""
import os
import json
import yaml
from file_utils import FileUtils
from hierarchy_builder import HierarchyBuilder


class StructureExporter:
    """Exports hierarchy structure to various formats."""
    
    def __init__(self):
        self.file_utils = FileUtils()
        self.hierarchy_builder = HierarchyBuilder()
    
    def export_complete_structure(self, output_dir="../"):
        """Export the complete structure to both YAML and JSON formats."""
        # Build the complete hierarchy using existing code
        print("Building hierarchy structure...")
        data_hierarchy = self.hierarchy_builder.parse_md_hierarchy("../data")
        
        # Convert to a more structured format
        structured_data = self._convert_to_structured_format(data_hierarchy)
        
        # Export to JSON
        json_path = os.path.join(output_dir, "structure.json")
        self._export_to_json(structured_data, json_path)
        print(f"JSON structure exported to: {json_path}")
        
        # Export to YAML
        yaml_path = os.path.join(output_dir, "structure.yaml")
        self._export_to_yaml(structured_data, yaml_path)
        print(f"YAML structure exported to: {yaml_path}")
        
        return structured_data
    
    def _convert_to_structured_format(self, hierarchy_data):
        """Convert the hierarchy data to a more structured format."""
        structured = {
            "metadata": {
                "title": "Personal Knowledge Graph",
                "description": "Hierarchical structure of personal development data",
                "version": "1.0",
                "generated_at": self._get_current_timestamp()
            },
            "structure": {}
        }
        
        for layer1_item in hierarchy_data:
            layer1_name = layer1_item["layer1"]
            layer1_data = {
                "title": self._format_title(layer1_name),
                "id": layer1_name.lower().replace(" ", "_"),
                "file": layer1_item.get("layer1_filename"),
                "context": layer1_item.get("layer1_context"),
                "children": {}
            }
            
            # Process layer 2 items
            for layer2_item in layer1_item.get("layer2", []):
                layer2_name = layer2_item["name"]
                layer2_data = {
                    "title": self._format_title(layer2_name),
                    "id": f"{layer1_name.lower()}_{layer2_name.lower()}".replace(" ", "_"),
                    "file": layer2_item.get("filename"),
                    "context": layer2_item.get("context"),
                    "children": {}
                }
                
                # Process layer 3 items
                for layer3_item in layer2_item.get("layer3", []):
                    if isinstance(layer3_item, dict):
                        layer3_name = layer3_item["name"]
                        layer3_data = {
                            "title": self._format_title(layer3_name),
                            "id": f"{layer1_name.lower()}_{layer2_name.lower()}_{layer3_name.lower()}".replace(" ", "_"),
                            "file": layer3_item.get("filename"),
                            "context": layer3_item.get("context")
                        }
                    else:
                        # Handle string-only layer3 items (backward compatibility)
                        layer3_name = layer3_item
                        layer3_data = {
                            "title": self._format_title(layer3_name),
                            "id": f"{layer1_name.lower()}_{layer2_name.lower()}_{layer3_name.lower()}".replace(" ", "_"),
                            "file": None,
                            "context": None
                        }
                    
                    layer2_data["children"][layer3_name] = layer3_data
                
                layer1_data["children"][layer2_name] = layer2_data
            
            structured["structure"][layer1_name] = layer1_data
        
        return structured
    
    def _format_title(self, name):
        """Format a name into a proper title."""
        return name.replace("_", " ").replace("-", " ").title()
    
    def _get_current_timestamp(self):
        """Get current timestamp in ISO format."""
        from datetime import datetime
        return datetime.now().isoformat()
    
    def _export_to_json(self, data, file_path):
        """Export data to JSON file."""
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    
    def _export_to_yaml(self, data, file_path):
        """Export data to YAML file."""
        with open(file_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, indent=2)
    
    def export_file_mapping(self, output_dir="../"):
        """Export a simple file mapping for reference."""
        print("Building file mapping...")
        
        # Get all markdown files
        md_files = self.file_utils.get_markdown_files_from_directories()
        
        file_mapping = {
            "metadata": {
                "title": "File Mapping Reference",
                "description": "Complete list of all markdown files in the data directory",
                "total_files": len(md_files),
                "generated_at": self._get_current_timestamp()
            },
            "files": []
        }
        
        for file_path in sorted(md_files):
            # Extract path components
            path_parts = self.file_utils.get_path_components_from_file_path(file_path)
            
            file_info = {
                "file_path": file_path,
                "relative_path": '/'.join(path_parts) if path_parts else "unknown",
                "hierarchy_level": len(path_parts) if path_parts else 0,
                "exists": os.path.exists(file_path),
                "context": self.file_utils.extract_context_from_md(file_path)
            }
            
            file_mapping["files"].append(file_info)
        
        # Export file mapping
        mapping_json_path = os.path.join(output_dir, "file_mapping.json")
        self._export_to_json(file_mapping, mapping_json_path)
        print(f"File mapping exported to: {mapping_json_path}")
        
        return file_mapping


def main():
    """Main function to export structure."""
    exporter = StructureExporter()
    
    print("=== Structure Exporter ===")
    print("Exporting complete hierarchy structure...")
    
    # Export complete structure
    structure = exporter.export_complete_structure()
    
    # Export file mapping for reference
    file_mapping = exporter.export_file_mapping()
    
    print("\n=== Export Summary ===")
    print(f"Total Layer 1 categories: {len(structure['structure'])}")
    
    total_layer2 = sum(len(item['children']) for item in structure['structure'].values())
    print(f"Total Layer 2 subcategories: {total_layer2}")
    
    total_layer3 = sum(
        len(layer2['children']) 
        for layer1 in structure['structure'].values() 
        for layer2 in layer1['children'].values()
    )
    print(f"Total Layer 3 items: {total_layer3}")
    print(f"Total files: {file_mapping['metadata']['total_files']}")
    
    print("\nFiles created:")
    print("- structure.json (Complete hierarchy in JSON)")
    print("- structure.yaml (Complete hierarchy in YAML)")
    print("- file_mapping.json (File reference mapping)")


if __name__ == "__main__":
    main()