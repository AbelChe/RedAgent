"""
工作空间管理器 - 管理 Docker 卷和容器生命周期

本模块通过 Docker 卷提供安全的工作空间隔离，
包含符号链接逃逸攻击防护和资源清理功能。
"""

import docker
from docker.errors import NotFound, APIError
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass
import logging
import uuid
from app.core.config import settings

logger = logging.getLogger(__name__)


class SecurityError(Exception):
    """安全违规异常"""
    pass


@dataclass
class VolumeInfo:
    """Information about a workspace volume."""
    name: str
    mountpoint: str
    created: str
    labels: Dict[str, str]


class WorkspaceManager:
    """
    Manages Docker volumes and security for workspaces.
    
    Each workspace gets an isolated Docker volume that can be shared
    across multiple container executions.
    """
    
    VOLUME_PREFIX = "pentest-ws-"
    WORKSPACE_MOUNT_PATH = "/workspace"
    
    def __init__(self):
        self.client = docker.from_env()
    
    def get_volume_name(self, workspace_id: str) -> str:
        """Generate consistent volume name for a workspace."""
        return f"{self.VOLUME_PREFIX}{workspace_id}"
    
    def create_workspace_volume(self, workspace_id: str) -> VolumeInfo:
        """
        Create a Docker volume for a workspace.
        
        Args:
            workspace_id: Unique workspace identifier
            
        Returns:
            VolumeInfo with volume details
        """
        volume_name = self.get_volume_name(workspace_id)
        
        try:
            # Check if volume already exists
            existing = self.client.volumes.get(volume_name)
            logger.info(f"Volume {volume_name} already exists")
            return self._volume_to_info(existing)
        except NotFound:
            pass
        
        # Create new volume with labels
        volume = self.client.volumes.create(
            name=volume_name,
            driver="local",
            labels={
                "pentest.workspace_id": workspace_id,
                "pentest.managed": "true",
            }
        )
        
        logger.info(f"Created volume {volume_name} for workspace {workspace_id}")
        return self._volume_to_info(volume)
    
    def delete_workspace_volume(self, workspace_id: str, force: bool = False) -> bool:
        """
        Delete a workspace volume.
        
        Args:
            workspace_id: Unique workspace identifier
            force: Force removal even if in use
            
        Returns:
            True if deleted, False if not found
        """
        volume_name = self.get_volume_name(workspace_id)
        
        try:
            volume = self.client.volumes.get(volume_name)
            volume.remove(force=force)
            logger.info(f"Deleted volume {volume_name}")
            return True
        except NotFound:
            logger.warning(f"Volume {volume_name} not found")
            return False
        except APIError as e:
            logger.error(f"Failed to delete volume {volume_name}: {e}")
            raise
    
    def volume_exists(self, workspace_id: str) -> bool:
        """Check if a workspace volume exists."""
        volume_name = self.get_volume_name(workspace_id)
        try:
            self.client.volumes.get(volume_name)
            return True
        except NotFound:
            return False
    
    def get_volume_info(self, workspace_id: str) -> Optional[VolumeInfo]:
        """Get information about a workspace volume."""
        volume_name = self.get_volume_name(workspace_id)
        try:
            volume = self.client.volumes.get(volume_name)
            return self._volume_to_info(volume)
        except NotFound:
            return None
    
    def validate_path(self, workspace_id: str, user_path: str) -> Path:
        """
        Validate and resolve a user-provided path, preventing symlink escapes.
        
        This method ensures that the resolved path stays within the workspace,
        preventing directory traversal and symlink escape attacks.
        
        Args:
            workspace_id: Workspace identifier
            user_path: User-provided relative path
            
        Returns:
            Resolved safe Path object
            
        Raises:
            SecurityError: If path escape is detected
        """
        # Normalize the workspace root
        workspace_root = Path(self.WORKSPACE_MOUNT_PATH)
        
        # Remove leading slash to make it relative
        clean_path = user_path.lstrip("/")
        
        # Construct the target path
        target = workspace_root / clean_path
        
        # Resolve to absolute path (follows symlinks)
        try:
            resolved = target.resolve()
        except (OSError, ValueError) as e:
            raise SecurityError(f"Invalid path: {user_path}") from e
        
        # Check if resolved path is still under workspace root
        try:
            resolved.relative_to(workspace_root)
        except ValueError:
            raise SecurityError(
                f"Path escape detected: '{user_path}' resolves to '{resolved}' "
                f"which is outside workspace '{workspace_root}'"
            )
        
        return resolved
    
    def get_container_mount_config(self, workspace_id: str) -> Dict[str, Any]:
        """
        Get Docker mount configuration for a workspace.
        
        Returns the mount config dict to be used with docker.containers.run()
        """
        volume_name = self.get_volume_name(workspace_id)
        
        return {
            volume_name: {
                "bind": self.WORKSPACE_MOUNT_PATH,
                "mode": "rw"
            }
        }
    
    def list_workspace_volumes(self) -> list[VolumeInfo]:
        """List all managed workspace volumes."""
        volumes = self.client.volumes.list(
            filters={"label": "pentest.managed=true"}
        )
        return [self._volume_to_info(v) for v in volumes]
    
    def cleanup_orphaned_volumes(self, active_workspace_ids: set[str]) -> int:
        """
        Remove volumes for workspaces that no longer exist.
        
        Args:
            active_workspace_ids: Set of currently active workspace IDs
            
        Returns:
            Number of volumes removed
        """
        removed = 0
        for volume_info in self.list_workspace_volumes():
            ws_id = volume_info.labels.get("pentest.workspace_id")
            if ws_id and ws_id not in active_workspace_ids:
                try:
                    volume = self.client.volumes.get(volume_info.name)
                    volume.remove()
                    removed += 1
                    logger.info(f"Cleaned up orphaned volume: {volume_info.name}")
                except Exception as e:
                    logger.warning(f"Failed to cleanup {volume_info.name}: {e}")
        
        return removed
    
    def _volume_to_info(self, volume) -> VolumeInfo:
        """Convert Docker volume object to VolumeInfo."""
        return VolumeInfo(
            name=volume.name,
            mountpoint=volume.attrs.get("Mountpoint", ""),
            created=volume.attrs.get("CreatedAt", ""),
            labels=volume.attrs.get("Labels", {}),
        )

# Singleton instance
workspace_manager = WorkspaceManager()
