"""
Output path injection for scan tools

Automatically appends output flags to scan commands to persist results to workspace volumes.
"""

from datetime import datetime
from typing import Optional, List, Tuple
import re


# Tool-specific output configurations
TOOL_OUTPUT_CONFIGS = {
    "nmap": {
        "dir": "nmap",
        "flags": [
            ("-oN", "{timestamp}_{target}.txt"),
            ("-oX", "{timestamp}_{target}.xml"),
        ],
        "target_regex": r'(?:(?:\d{1,3}\.){3}\d{1,3}(?:/\d+)?|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})',
    },
    "masscan": {
        "dir": "masscan",
        "flags": [("-oL", "{timestamp}_{target}.list")],
        "target_regex": r'(?:(?:\d{1,3}\.){3}\d{1,3}(?:/\d+)?|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})',
    },
    "rustscan": {
        "dir": "rustscan",
        "flags": [("-o", "{timestamp}_{target}.txt")],
        "target_regex": r'(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})',
    },
    "nikto": {
        "dir": "nikto",
        "flags": [("-o", "{timestamp}_{target}.txt")],
        "target_regex": r'(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})',
    },
}


def extract_target_from_command(command: str, tool: str) -> str:
    """Extract target IP/hostname from command"""
    config = TOOL_OUTPUT_CONFIGS.get(tool)
    if not config:
        return "scan"
    
    # Match target using regex
    match = re.search(config["target_regex"], command)
    if match:
        target = match.group(0)
        # Sanitize for filename (replace / with _)
        return target.replace("/", "_").replace(":", "_")
    return "scan"


def inject_output_flags(
    command: str, 
    tool: str, 
    workspace_mount_path: str = "/workspace"
) -> Tuple[str, List[str]]:
    """
    Inject output flags into scan command
    
    Args:
        command: Original command
        tool: Tool name (nmap, masscan, etc.)
        workspace_mount_path: Base path for workspace volume
        
    Returns:
        Tuple of (modified_command, list_of_output_file_paths)
    """
    config = TOOL_OUTPUT_CONFIGS.get(tool)
    if not config:
        return command, []
    
    # Extract target for filename
    target = extract_target_from_command(command, tool)
    
    # Generate timestamp
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    
    # Build output directory
    output_dir = f"{workspace_mount_path}/{config['dir']}"
    
    # Generate output flags and paths
    output_flags = []
    output_files = []
    
    for flag, filename_template in config["flags"]:
        # Check if flag already exists in command
        if flag in command:
            continue
            
        filename = filename_template.format(timestamp=timestamp, target=target)
        filepath = f"{output_dir}/{filename}"
        
        output_flags.append(f"{flag} {filepath}")
        output_files.append(filepath)
    
    # Append flags to command
    if output_flags:
        modified_command = f"{command} {' '.join(output_flags)}"
    else:
        modified_command = command
    
    return modified_command, output_files


def create_tool_output_directory(client, workspace_id: str, tool: str, workspace_mount_path: str = "/workspace"):
    """
    Create tool-specific output directory in workspace volume
    
    This should be called before executing the command to ensure the directory exists.
    """
    config = TOOL_OUTPUT_CONFIGS.get(tool)
    if not config:
        return
    
    output_dir = f"{workspace_mount_path}/{config['dir']}"
    
    # Create directory using a lightweight alpine container
    try:
        # CRITICAL: Use correct volume naming convention from workspace_manager
        from app.services.workspace_manager import workspace_manager
        volume_name = workspace_manager.get_volume_name(workspace_id)  # pentest-ws-{workspace_id}
        
        client.containers.run(
            image="alpine:latest",
            command=["sh", "-c", f"mkdir -p {output_dir} && chmod 777 {output_dir}"],
            volumes={volume_name: {"bind": workspace_mount_path, "mode": "rw"}},
            remove=True,
            user="0",  # Run as root to ensure we can create directory
        )
    except Exception as e:
        # Log error but don't fail - directory might already exist
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to create directory {output_dir}: {e}")
