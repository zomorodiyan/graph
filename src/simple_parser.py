"""
Simple indentation-based parser for structure files.
Reads a clean indented format without requiring YAML colons.
"""


class SimpleParser:
    """Parser for simple indentation-based structure format."""
    
    @staticmethod
    def parse_file(file_path):
        """Parse a simple indented structure file."""
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        return SimpleParser._parse_lines(lines)
    
    @staticmethod
    def parse_string(content):
        """Parse a string containing simple indented structure."""
        lines = content.split('\n')
        return SimpleParser._parse_lines(lines)
    
    @staticmethod
    def _parse_lines(lines):
        """Parse lines into nested dictionary structure."""
        root = {}
        stack = [(root, -1)]  # (dict, indent_level)
        
        for line_num, line in enumerate(lines, 1):
            # Skip empty lines
            stripped = line.strip()
            if not stripped or stripped.startswith('#'):
                continue
            
            # Calculate indentation (spaces)
            indent = len(line) - len(line.lstrip())
            
            # Parse the line
            # Known metadata properties that can have empty values
            metadata_props = {'description', 'display_name', 'icon', 'version'}
            if stripped.startswith('"') and stripped.endswith('"') and len(stripped) >= 2:
                # Quoted string = context value (e.g. from serializeItem clipboard format)
                raw = stripped[1:-1]
                context_value = raw.replace('\\"', '"').replace('\\\\', '\\').replace('\\n', '\n')
                current_parent = SimpleParser._find_parent(stack, indent)
                current_parent['context'] = context_value
            elif ':' in line and not line.strip().endswith(':'):
                # Property line (e.g., "progress: 80" or "context: some text")
                key, value = [part.strip() for part in stripped.split(':', 1)]
                
                # Convert value to appropriate type
                if value.isdigit():
                    value = int(value)
                elif value.replace('.', '', 1).isdigit():
                    value = float(value)
                
                # Add to current parent
                current_parent = SimpleParser._find_parent(stack, indent)
                current_parent[key] = value
            elif ':' in line and line.strip().endswith(':'):
                key = stripped.rstrip(':')
                if key in metadata_props:
                    # Empty metadata property - store as empty string
                    current_parent = SimpleParser._find_parent(stack, indent)
                    current_parent[key] = ''
                else:
                    # Item line (hierarchy node)
                    item_name = key
                    new_item = {}
                    current_parent = SimpleParser._find_parent(stack, indent)
                    current_parent[item_name] = new_item
                    stack.append((new_item, indent))
                    while len(stack) > 1 and stack[-2][1] >= indent:
                        stack.pop(-2)
            else:
                # Item line (hierarchy node)
                # Remove trailing colon if present for YAML compatibility
                item_name = stripped.rstrip(':')
                
                # Create new dict for this item
                new_item = {}
                
                # Find parent and add this item
                current_parent = SimpleParser._find_parent(stack, indent)
                current_parent[item_name] = new_item
                
                # Add to stack for potential children
                stack.append((new_item, indent))
                
                # Clean up stack - remove items with higher or equal indent
                while len(stack) > 1 and stack[-2][1] >= indent:
                    stack.pop(-2)
        
        return root
    
    @staticmethod
    def _find_parent(stack, current_indent):
        """Find the appropriate parent dict for the current indentation level."""
        # Pop items from stack that have same or greater indent
        while len(stack) > 1 and stack[-1][1] >= current_indent:
            stack.pop()
        
        return stack[-1][0]
