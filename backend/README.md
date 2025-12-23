# AI-Pentest Agent - Backend

**AI驱动的渗透测试智能平台后端服务**

## 架构概览

基于 FastAPI 的异步后端服务，负责：
- **Agent 编排**：调度 LangGraph Agent 执行渗透测试任务
- **MCP 连接管理**：与远程 Edge Node 建立 WebSocket 连接，委托工具执行
- **任务调度**：管理任务生命周期（队列、执行、流式更新、结果持久化）
- **实时通信**：通过 SSE 向前端推送 Agent 状态和日志

## 核心组件

### 🤖 Agent（LangGraph）
- **路径**: `app/agent/`
- **技术栈**: LangChain + LangGraph + DeepSeek-R1
- **功能**:
  - `core.py`: 定义 Agent 工作流（状态机、节点、边）
  - `tools.py`: Tool 定义（`execute_command`, `lookup_tool_usage`）
  - `state.py`: Agent 状态模型
  - `prompts.py`: System Prompt 模板

### 🔌 MCP 连接管理
- **路径**: `app/services/connection_manager.py`
- **功能**:
  - 接受来自 Edge Node 的反向 WebSocket 连接
  - 维护 MCP 连接池
  - 处理 JSON-RPC 请求/响应映射
  - **关键方法**:
    - `register_mcp(websocket)`: 注册 MCP Node
    - `send_mcp_request(method, params)`: 发送 RPC 请求
    - `get_mcp_prompt(tool_name)`: 获取工具使用手册

### 🛠️ Executor（命令执行层）
- **路径**: `app/executors/`
- **抽象类**: `Executor` (基类)
- **实现**:
  - `SandboxExecutor`: 委托命令到 MCP Server（优先）或本地 Docker
  - 未来可扩展：`SSHExecutor`, `KubernetesExecutor`

### 📡 API 路由
- **WebSocket**:
  - `GET /connect`: MCP Edge Node 连接入口
- **SSE**:
  - `GET /tasks/{task_id}/stream`: 订阅任务执行流
- **REST**:
  - `POST /tasks`: 创建新任务
  - `GET /tasks/{task_id}`: 查询任务详情
  - `GET /workspaces`: 列出工作空间
  - `POST /workspaces`: 创建工作空间

### 💾 数据库（PostgreSQL）
- **ORM**: SQLAlchemy (Async)
- **模型** (`app/models/`):
  - `Workspace`: 用户工作空间
  - `Task`: 渗透测试任务
  - `Message`: Agent 对话历史
  - `CommandLog`: 命令执行日志

## 快速开始

### 1. 环境准备
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\\Scripts\\activate
pip install -r requirements.txt
```

### 2. 配置环境变量
复制并编辑 `.env` 文件：
```bash
cp .env.example .env
```

**关键配置**：
```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/pentest
REDIS_URL=redis://localhost:6379
DEEPSEEK_API_KEY=sk-xxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 3. 初始化数据库
```bash
# 使用 Alembic 迁移（推荐）
alembic upgrade head

# 或自动创建表（开发环境）
# 启动服务时会自动执行 Base.metadata.create_all
```

### 4. 启动服务
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

访问：
- API 文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

## 工作流程

### Agent 执行流程
```mermaid
graph LR
    A[前端提交任务] --> B[后端创建Task]
    B --> C[Agent开始规划]
    C --> D{需要执行命令?}
    D -->|是| E[调用execute_command]
    E --> F[SandboxExecutor委托给MCP]
    F --> G[MCP在容器中执行]
    G --> H[返回结果]
    H --> I[Agent分析输出]
    I --> D
    D -->|否| J[生成最终报告]
    J --> K[更新Task状态]
```

### MCP 连接流程
```
1. Edge Node 启动 → 连接 ws://backend:8000/connect
2. Backend 接受连接 → 注册到 ConnectionManager
3. Backend 需要执行工具 → send_mcp_request("tools/call", {...})
4. MCP 在 Docker 容器中执行 → 返回结果
5. Backend 收到 JSON-RPC Response → 解析并返回给 Agent
```

## 目录结构

```
backend/
├── app/
│   ├── agent/          # LangGraph Agent
│   ├── api/            # FastAPI 路由
│   ├── core/           # 核心配置（DB, Settings）
│   ├── executors/      # 命令执行层
│   ├── models/         # SQLAlchemy 模型
│   ├── schemas/        # Pydantic 模型
│   ├── services/       # 业务逻辑（ConnectionManager, TaskService）
│   └── main.py         # 入口文件
├── alembic/            # 数据库迁移
├── requirements.txt    # Python 依赖
└── .env.example        # 环境变量模板
```

## 开发指南

### 添加新的 Agent Tool
1. 在 `app/agent/tools.py` 中定义工具函数
2. 使用 `@tool` 装饰器并提供清晰的 docstring
3. 在 `app/agent/core.py` 的 `get_agent_runnable()` 中注册

### 添加新的 API 端点
1. 在 `app/api/` 下创建新的路由文件
2. 定义路由和处理函数
3. 在 `app/main.py` 中 `app.include_router()`

### 数据库迁移
```bash
# 创建新迁移
alembic revision --autogenerate -m "描述"

# 应用迁移
alembic upgrade head

# 回滚
alembic downgrade -1
```

## 安全注意事项

⚠️ **命令执行安全**：
- 所有命令必须通过 MCP Server 在隔离容器中执行
- 禁止直接在宿主机执行用户输入
- Agent 的 System Prompt 包含安全协议，拒绝危险命令

⚠️ **环境变量**：
- `.env` 文件包含敏感信息，已添加到 `.gitignore`
- 生产环境使用 Secret Manager

## 故障排查

### Agent 无法连接 LLM
检查 `.env` 中的 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_BASE_URL`

### MCP 连接失败
1. 确认 MCP Server 已启动并连接到 `ws://backend:8000/connect`
2. 查看后端日志：`🔌 MCP Node Connected`
3. 检查 `app/services/connection_manager.py` 的 WebSocket 处理逻辑

### 数据库连接错误
1. 确认 PostgreSQL 已启动
2. 检查 `DATABASE_URL` 格式
3. 运行 `alembic upgrade head` 初始化表
