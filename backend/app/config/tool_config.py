"""Tool configuration utilities."""
import yaml
from pathlib import Path
from typing import Optional, Dict, Any

_config_cache: Optional[Dict[str, Any]] = None

def load_containers_config() -> Dict[str, Any]:
    """Load containers.yaml configuration file."""
    global _config_cache
    
    if _config_cache is not None:
        return _config_cache
    
    config_path = Path(__file__).parent / "containers.yaml"
    with open(config_path, 'r', encoding='utf-8') as f:
        _config_cache = yaml.safe_load(f)
    
    return _config_cache

def get_tool_config(tool_name: str) -> Dict[str, Any]:
    """
    Get configuration for a specific tool.
    
    Args:
        tool_name: Name of the tool (e.g., 'nmap', 'curl')
    
    Returns:
        Tool configuration dict with fields like 'image', 'async', 'capabilities'
    """
    config = load_containers_config()
    
    # Get tool-specific config or fall back to default
    tool_config = config.get(tool_name, config.get('default', {}))
    
    return tool_config

def is_async_tool(tool_name: str) -> bool:
    """
    Check if a tool should run asynchronously.
    
    Args:
        tool_name: Name of the tool
    
    Returns:
        True if tool should run in Celery queue, False for synchronous execution
    """
    tool_config = get_tool_config(tool_name)
    return tool_config.get('async', False)
