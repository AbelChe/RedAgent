"""
容器注册表 - 工具到容器镜像的映射配置

从 YAML 配置文件加载工具与容器镜像的映射关系。
"""

import yaml
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


@dataclass
class ContainerConfig:
    """容器镜像配置"""
    image: str
    capabilities: List[str] = field(default_factory=list)
    memory_limit: str = "512m"
    cpu_limit: float = 1.0
    pids_limit: int = 100
    network_mode: Optional[str] = None


# 配置文件路径
CONFIG_PATH = Path(__file__).parent.parent / "config" / "containers.yaml"

# 工具描述文档路径 (指向 MCP Server 的 tools 目录)
TOOLS_DOC_PATH = Path(__file__).parent.parent.parent.parent / "mcp-server" / "tools"

# 默认配置（当配置文件不存在或工具未定义时使用）
DEFAULT_CONFIG = ContainerConfig(
    image="parrotsec/security:7.0",
    capabilities=["NET_RAW"],
)

# 无需文档的特殊工具（别名或默认配置）
SKIP_DOC_CHECK = {"default", "python3"}  # python3 使用 python.md


class ToolDocumentationError(Exception):
    """工具描述文档缺失异常"""
    pass


class ContainerImageMissingError(Exception):
    """容器镜像缺失异常"""
    pass


def _validate_tool_docs(tool_names: List[str]) -> List[str]:
    """
    验证工具描述文档是否存在
    
    Args:
        tool_names: 工具名称列表
        
    Returns:
        缺失文档的工具列表
    """
    missing_docs = []
    
    for tool_name in tool_names:
        if tool_name in SKIP_DOC_CHECK:
            continue
        
        doc_path = TOOLS_DOC_PATH / f"{tool_name}.md"
        if not doc_path.exists():
            missing_docs.append(tool_name)
    
    return missing_docs


def _load_registry() -> Dict[str, ContainerConfig]:
    """从 YAML 文件加载容器配置，并验证文档完整性"""
    registry: Dict[str, ContainerConfig] = {}
    
    if not CONFIG_PATH.exists():
        logger.warning(f"配置文件不存在: {CONFIG_PATH}，使用默认配置")
        return {"default": DEFAULT_CONFIG}
    
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
        
        for tool_name, config in data.items():
            registry[tool_name] = ContainerConfig(
                image=config.get("image", DEFAULT_CONFIG.image),
                capabilities=config.get("capabilities", []),
                memory_limit=config.get("memory_limit", DEFAULT_CONFIG.memory_limit),
                cpu_limit=config.get("cpu_limit", DEFAULT_CONFIG.cpu_limit),
                pids_limit=config.get("pids_limit", DEFAULT_CONFIG.pids_limit),
                network_mode=config.get("network_mode"),
            )
        
        # 验证工具文档完整性
        missing_docs = _validate_tool_docs(list(registry.keys()))
        if missing_docs:
            error_msg = f"以下工具缺少描述文档: {', '.join(missing_docs)}。请在 {TOOLS_DOC_PATH} 目录下创建对应的 .md 文件"
            logger.error(error_msg)
            raise ToolDocumentationError(error_msg)
        
        # 验证容器镜像是否存在（仅记录日志，不阻止启动）
        _validate_tool_images(list(registry.values()))
        
        logger.info(f"已加载 {len(registry)} 个工具配置，文档验证通过 ✓")
        return registry
        
    except (ToolDocumentationError, ContainerImageMissingError):
        raise  # 重新抛出关键配置错误，阻止启动
    except Exception as e:
        logger.error(f"加载配置文件失败: {e}，使用默认配置")
        return {"default": DEFAULT_CONFIG}


def _validate_tool_images(configs: List[ContainerConfig]):
    """
    验证容器镜像是否已安装
    
    Args:
        configs: 容器配置列表
    """
    import docker
    try:
        client = docker.from_env()
        # 获取本地所有镜像的 tags
        local_images = set()
        for img in client.images.list():
            if img.tags:
                local_images.update(img.tags)
        
        # 检查每个配置的镜像是否在本地
        checked_images = set()
        missing_images = set()
        
        for config in configs:
            if config.image in checked_images:
                continue
            
            checked_images.add(config.image)
            # 简单检查：直接比对 tag
            # 注意：如果 image 没有 tag，Docker 默认为 latest
            image_name = config.image
            if ":" not in image_name:
                image_name += ":latest"
                
            if image_name not in local_images:
                missing_images.add(config.image)
        
        if missing_images:
            error_msg = (
                f"以下容器镜像未在本地找到: {', '.join(missing_images)}\n"
                f"建议运行: docker pull {' '.join(missing_images)}"
            )
            logger.error(error_msg)
            raise ContainerImageMissingError(error_msg)
        else:
            logger.info("所有依赖的容器镜像已就绪 ✓")
    
    except ContainerImageMissingError:
        raise
    except Exception as e:
        logger.warning(f"无法验证容器镜像（Docker 服务可能未运行）: {e}")


# 加载配置（模块级别，仅加载一次）
CONTAINER_REGISTRY: Dict[str, ContainerConfig] = _load_registry()


def reload_registry():
    """重新加载配置文件（热更新）"""
    global CONTAINER_REGISTRY
    CONTAINER_REGISTRY = _load_registry()
    logger.info("容器配置已重新加载")


def get_container_config(tool_name: str) -> ContainerConfig:
    """
    获取工具的容器配置
    
    Args:
        tool_name: 工具名称（如 nmap, python）
        
    Returns:
        ContainerConfig，未找到则返回默认配置
    """
    tool = tool_name.lower().split("/")[-1]
    return CONTAINER_REGISTRY.get(tool, CONTAINER_REGISTRY.get("default", DEFAULT_CONFIG))


def extract_tool_from_command(command: str) -> str:
    """
    从命令字符串中提取工具名称
    
    Args:
        command: 完整命令（如 "nmap -sV 192.168.1.1"）
        
    Returns:
        工具名称（如 "nmap"）
    """
    if not command:
        return "default"
    
    parts = command.strip().split()
    if not parts:
        return "default"
    
    tool = parts[0].split("/")[-1]  # 处理 /usr/bin/nmap -> nmap
    return tool.lower()


def list_available_tools() -> List[str]:
    """列出所有已配置的工具"""
    return [k for k in CONTAINER_REGISTRY.keys() if k != "default"]
