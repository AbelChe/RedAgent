"""Command parsing utilities."""
import re
from typing import Optional

def extract_tool_name(command: str) -> Optional[str]:
    """
    Extract tool name from command string.
    
    Examples:
        "nmap -sV 192.168.1.1" -> "nmap"
        "sqlmap -u http://example.com" -> "sqlmap"
        "ls -la /tmp" -> "ls"
        "curl http://example.com" -> "curl"
    
    Args:
        command: Full command string
    
    Returns:
        Tool name (first word) or None if empty
    """
    if not command or not command.strip():
        return None
    
    # Remove leading/trailing whitespace
    command = command.strip()
    
    # Extract first word (tool name)
    # Handle cases with quotes or special chars
    match = re.match(r'^([a-zA-Z0-9_\-\.]+)', command)
    if match:
        return match.group(1)
    
    # Fallback: split and take first word
    parts = command.split()
    if parts:
        return parts[0]
    
    return None
