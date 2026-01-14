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


    def deploy_stack(self, workspace_id: str, code_server_password: str) -> Dict[str, Any]:
        """
        Deploy the service stack (MCP + Code Server) for a workspace.
        
        Args:
            workspace_id: The ID of the workspace.
            code_server_password: Password for Code Server authentication.
            
        Returns:
            Dict containing container IDs and endpoints.
        """
        logger.info(f"Starting stack deployment for workspace {workspace_id}")
        volume_name = self.get_volume_name(workspace_id)
        net_name = f"ws-net-{workspace_id}"
        
        # Ensure volume exists
        if not self.volume_exists(workspace_id):
            logger.info(f"Creating volume {volume_name}")
            self.create_workspace_volume(workspace_id)
            
        # 1. Create Network
        try:
            self.client.networks.get(net_name)
            logger.info(f"Network {net_name} already exists")
        except NotFound:
            logger.info(f"Creating network {net_name}")
            self.client.networks.create(net_name, driver="bridge")
            
        stack_info = {
            "mcp_container_id": None,
            "code_container_id": None,
            "mcp_endpoint": None,
            "code_server_endpoint": None
        }
        
        # 2. Start MCP Server
        try:
            logger.info(f"Starting MCP container mcp-{workspace_id}...")
            
            # Generate unique token and URL for this workspace
            mcp_token = str(uuid.uuid4())
            # Use configured backend URL (defaults to host.docker.internal for dev)
            # Route matches @router.websocket("/mcp/{workspace_id}/connect") included at root in main.py
            mcp_hub_url = f"{settings.MCP_BACKEND_URL}/mcp/{workspace_id}/connect"
            
            mcp = self.client.containers.run(
                image="redagent-mcp:latest",
                name=f"mcp-{workspace_id}",
                detach=True,
                network=net_name,
                volumes={
                    volume_name: {"bind": "/app/workspace_data", "mode": "rw"},
                    "/var/run/docker.sock": {"bind": "/var/run/docker.sock", "mode": "rw"},
                },
                environment={
                    "WORKSPACE_VOLUME_NAME": volume_name,
                    "WORKSPACE_ID": workspace_id,
                    "MCP_HUB_URL": mcp_hub_url,
                    "MCP_TOKEN": mcp_token
                },
                ports={'8000/tcp': None}, # Dynamic port
                labels={"pentest.workspace_id": workspace_id, "pentest.role": "mcp"}
            )
            logger.info(f"MCP container created: {mcp.id}. Reloading to get ports...")
            mcp.reload()
            
            # Check if container is actually running
            if mcp.status != 'running':
                logger.error(f"MCP Container status is {mcp.status}. Logs: {mcp.logs().decode('utf-8')}")
                # Wait a bit or let it fail downstream?
            
            ports = mcp.attrs.get('NetworkSettings', {}).get('Ports', {})
            if '8000/tcp' in ports and ports['8000/tcp']:
                mcp_port = ports['8000/tcp'][0]['HostPort']
                stack_info["mcp_container_id"] = mcp.id
                stack_info["mcp_endpoint"] = f"http://localhost:{mcp_port}"
                stack_info["mcp_token"] = mcp_token
                stack_info["mcp_hub_url"] = mcp_hub_url
                logger.info(f"Deployed MCP for {workspace_id} at {stack_info['mcp_endpoint']}")
            else:
                logger.error(f"Failed to get published port for MCP. Atts: {mcp.attrs}")
                raise Exception("MCP Port 8000 not published")
                
        except Exception as e:
            logger.error(f"Failed to deploy MCP: {e}", exc_info=True)
            raise

        # 3. Start Code Server
        try:
            logger.info(f"Starting Code Server container code-{workspace_id}...")
            code = self.client.containers.run(
                image="codercom/code-server:latest",
                name=f"code-{workspace_id}",
                detach=True,
                network=net_name,
                volumes={
                    volume_name: {"bind": "/home/coder/project", "mode": "rw"}
                },
                working_dir="/home/coder/project",
                environment={
                    "PUID": "1000",
                    "PGID": "1000",
                    "TZ": "Etc/UTC",
                    "PASSWORD": code_server_password,
                },
                ports={'8080/tcp': None}, # Dynamic port
                labels={"pentest.workspace_id": workspace_id, "pentest.role": "code-server"}
            )
            code.reload()
            
            ports = code.attrs.get('NetworkSettings', {}).get('Ports', {})
            if '8080/tcp' in ports and ports['8080/tcp']:
                code_port = ports['8080/tcp'][0]['HostPort']
                stack_info["code_container_id"] = code.id
                stack_info["code_server_endpoint"] = f"http://localhost:{code_port}"
                logger.info(f"Deployed Code Server for {workspace_id} at {stack_info['code_server_endpoint']}")
            else:
                logger.error("Failed to get published port for Code Server")
                # Don't fail entire stack if code-server fails? Maybe fail for consistency.
                
        except Exception as e:
            logger.error(f"Failed to deploy Code Server: {e}", exc_info=True)
            # Try cleanup if partial fail logic needed
            raise

        return stack_info

    def terminate_stack(self, workspace_id: str):
        """Terminate and remove the service stack containers and network."""
        net_name = f"ws-net-{workspace_id}"
        
        # Remove Containers
        filters = {"label": f"pentest.workspace_id={workspace_id}"}
        containers = self.client.containers.list(all=True, filters=filters)
        for c in containers:
            try:
                c.remove(force=True)
                logger.info(f"Removed container {c.name}")
            except Exception as e:
                logger.warning(f"Error removing {c.name}: {e}")
                
        # Remove Network
        try:
            net = self.client.networks.get(net_name)
            net.remove()
            logger.info(f"Removed network {net_name}")
        except NotFound:
            pass
        except Exception as e:
            logger.warning(f"Error removing network {net_name}: {e}")

    async def get_code_server_cookie(self, endpoint: str, password: str) -> str:
        """
        Authenticate with Code Server and retrieve the session cookie.
        """
        import aiohttp
        
        # Ensure endpoint doesn't end with slash
        endpoint = endpoint.rstrip("/")
        login_url = f"{endpoint}/login"
        data = {"password": password}
        
        try:
            logger.info(f"Attempting to authenticate with Code Server at {login_url}")
            # Code server runs on localhost relative to backend so we might need special handling
            # if running in docker vs host. For now assuming backend can reach endpoint.
            async with aiohttp.ClientSession() as session:
                # Need to act like a browser
                headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
                }
                async with session.post(login_url, data=data, headers=headers, allow_redirects=False) as response:
                    if response.status == 302:
                        # Extract cookie from headers or cookie jar
                        cookies = response.cookies
                        if "code-server-session" in cookies:
                            logger.info("Successfully retrieved authentication cookie from Code Server")
                            return cookies["code-server-session"].value
                        else:
                            # Fallback: check Set-Cookie header directly if needed, but aiohttp handles it
                            raise Exception("Login successful (302) but 'code-server-session' cookie not found")
                    else:
                        text = await response.text()
                        logger.error(f"Code Server login failed: {response.status} {text}")
                        raise Exception(f"Login failed with status {response.status}")
        except Exception as e:
            logger.error(f"Error getting Code Server cookie: {e}")
            raise

    # Singleton instance
workspace_manager = WorkspaceManager()
