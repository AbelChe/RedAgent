# RedAgent MCP Server 使用指南

> 版本: v2.0.0 | 更新日期: 2025-03-09  
> 适用于 Phase 1 重构后的 MCP Server

---

## 一、架构总览

重构后的 MCP Server 支持三种传输模式，适用于不同的使用场景：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RedAgent MCP Server v2.0.0                       │
│                                                                     │
│  ToolRegistry (8 tools with annotations)                            │
│  ├── create_session, start_terminal, run_shell                      │
│  ├── nmap_scan, execute_command                                     │
│  ├── read_file, write_file                                          │
│  └── visit_page                                                     │
│                                                                     │
│  传输模式:                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                           │
│  │  HTTP    │  │  stdio   │  │    WS    │                           │
│  │ (新增)    │  │ (保留)   │  │ (保留)   │                            │
│  └──────────┘  └──────────┘  └──────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 二、三种使用模式详解

### 模式 1: WebSocket 反向连接 (`--mode ws`) — 浏览器平台模式

> **这是原有的浏览器工作流模式，完全保留向后兼容。**

```
浏览器 (Next.js)  ⟷  Backend (FastAPI)  ⟵ws⟶  MCP Server (Node.js)
     REST/SSE/WS           Hub/Gateway         Edge Node (Docker)
```

**适用场景：** 通过 RedAgent Web UI（浏览器）使用

**启动方式：**
```bash
# 开发环境
cd mcp-server
npm run dev -- --mode ws

# 或设置环境变量（自动检测）
export MCP_HUB_URL=ws://backend-host:8000/mcp/ws
export MCP_TOKEN=your-workspace-token
npm run dev
# 如果设置了 MCP_HUB_URL，会自动使用 ws 模式

# 生产环境 (Docker)
docker run -e MCP_HUB_URL=ws://backend:8000/mcp/ws \
           -e MCP_TOKEN=xxx \
           -v /var/run/docker.sock:/var/run/docker.sock \
           redagent-mcp-server
```

**工作流程：**
1. MCP Server 启动后**主动连接** Backend 的 `/mcp/ws` WebSocket 端点
2. Backend 验证 Token，建立双向 JSON-RPC 2.0 通道
3. 用户在浏览器操作 → Backend 通过 WebSocket 调用 MCP 工具 → MCP 执行 → 结果返回
4. 终端功能: 浏览器 xterm.js ⟷ Backend WebSocket ⟷ MCP terminal/input|output ⟷ node-pty

**环境变量：**
| 变量 | 必需 | 说明 |
|---|---|---|
| `MCP_HUB_URL` | ✅ | Backend 的 WebSocket 端点，如 `ws://localhost:8000/mcp/ws` |
| `MCP_TOKEN` | ✅ | Workspace 认证 Token（在 Settings 页面获取） |
| `CONTAINERS_CONFIG_PATH` | ❌ | 容器配置文件路径（默认自动搜索） |

**Docker Compose 部署（现有方式，不变）：**
```yaml
# mcp-server/docker-compose.yml
services:
  mcp-server:
    image: diudiudiuuuu/redagent-mcp-server:latest
    volumes:
      - workspace-data:/app/workspace_data
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - MCP_HUB_URL=${MCP_HUB_URL}
      - MCP_TOKEN=${MCP_TOKEN}
```

---

### 模式 2: Streamable HTTP (`--mode http`) — AI Agent 平台模式 (新增)

> **全新模式，用于接入 Claude Code、VSCode Copilot 等 AI Agent 平台。**

```
Claude Code / VSCode / Cursor
          │
          │ HTTP POST (JSON-RPC)
          ▼
   MCP Server :3001/mcp
          │
          │ Docker API
          ▼
   渗透测试容器
```

**适用场景：** 通过 Claude Code、VSCode、Cursor 等 AI Agent IDE 直接调用渗透测试工具

**启动方式：**
```bash
# 开发环境
cd mcp-server
npm run dev:http
# 或
npm run dev -- --mode http --port 3001

# 生产环境
npm run start:http
```

**端点列表：**
| 端点 | 方法 | 说明 |
|---|---|---|
| `/mcp` | POST | MCP JSON-RPC 请求/通知 |
| `/mcp` | GET | SSE 流（服务端推送） |
| `/mcp` | DELETE | 终止会话 |
| `/health` | GET | 健康检查 |
| `/.well-known/agent.json` | GET | A2A Agent Card |
| `/a2a` | POST | A2A JSON-RPC 任务 |
| `/api/tools` | GET | 工具列表 |
| `/api/tools/security` | GET | 安全等级摘要 |

**环境变量：**
| 变量 | 必需 | 说明 |
|---|---|---|
| `MCP_HTTP_PORT` | ❌ | HTTP 端口（默认 3001） |
| `CONTAINERS_CONFIG_PATH` | ❌ | 容器配置文件路径 |

**在 Claude Code 中使用：**
```bash
# 方式1: claude CLI 添加
claude mcp add redagent --transport http http://localhost:3001/mcp

# 方式2: 项目配置文件 (.mcp.json 已创建在项目根目录)
# 直接使用即可，Claude Code 会自动发现
```

**在 VSCode 中使用：**
```jsonc
// .vscode/mcp.json 已创建在项目根目录
{
  "servers": {
    "redagent-http": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

---

### 模式 3: stdio (`--mode stdio`) — 本地开发模式

> **零配置本地模式，所有 AI Agent 平台通用。**

```
Claude Code / VSCode / Cursor / Windsurf
          │
          │ stdin / stdout (JSON-RPC)
          ▼
   MCP Server (子进程)
          │
          │ Docker API
          ▼
   渗透测试容器
```

**适用场景：** 本地开发/调试，或通过 AI Agent IDE 以子进程方式启动

**启动方式：**
```bash
# 直接运行
cd mcp-server
npm run start:stdio

# 开发模式
npm run dev:stdio
```

**在 Claude Code 中使用：**
```bash
claude mcp add redagent --transport stdio -- npx ts-node /path/to/mcp-server/src/index.ts --mode stdio
```

**在 VSCode 中使用 (已配置)：**
```jsonc
// .vscode/mcp.json
{
  "servers": {
    "redagent-local": {
      "type": "stdio",
      "command": "npx",
      "args": ["ts-node", "${workspaceFolder}/mcp-server/src/index.ts", "--mode", "stdio"]
    }
  }
}
```

**在 Claude Desktop 中使用：**
```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "redagent": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js", "--mode", "stdio"]
    }
  }
}
```

---

## 三、模式对比

| 特性 | WS 模式 (--mode ws) | HTTP 模式 (--mode http) | stdio 模式 (--mode stdio) |
|---|---|---|---|
| **使用入口** | RedAgent Web UI (浏览器) | AI Agent IDE (HTTP 调用) | AI Agent IDE (子进程) |
| **传输协议** | WebSocket 反向连接 | Streamable HTTP (MCP 2025-03-26) | stdin/stdout |
| **需要 Backend** | ✅ 必须 | ❌ 不需要 | ❌ 不需要 |
| **交互式终端** | ✅ 支持 (xterm.js) | ⚠️ 有限 (无前端 UI) | ❌ 不支持 |
| **工具实时日志** | ✅ SSE 推送到浏览器 | ✅ MCP Logging 通知 | ✅ MCP Logging 通知 |
| **A2A Agent Card** | ❌ 不可用 | ✅ 可用 | ❌ 不可用 |
| **多用户/多工作区** | ✅ 通过 Backend 隔离 | ❌ 单实例 | ❌ 单实例 |
| **部署方式** | Docker + Backend | 独立 Docker/进程 | IDE 自动启动 |
| **兼容平台** | RedAgent Web | Claude Code, VSCode, Cursor | 所有平台 |

---

## 四、工具清单与安全等级

所有 8 个工具均带有 MCP 2025-03-26 标准注解：

| 工具 | 功能 | 风险 | readOnly | destructive | 需审批 |
|---|---|---|---|---|---|
| `create_session` | 创建持久 Shell 会话 | 🟢 Low | ❌ | ❌ | ❌ |
| `start_terminal` | 启动交互式 PTY 终端 | 🟡 Medium | ❌ | ❌ | ❌ |
| `run_shell` | 在会话中执行命令 | 🔴 High | ❌ | ✅ | ❌ |
| `nmap_scan` | Nmap 网络扫描 | 🟢 Low | ✅ | ❌ | ❌ |
| `execute_command` | 通用命令执行 | 🔴 High | ❌ | ✅ | ✅ |
| `read_file` | 读取工作区文件 | 🟢 Low | ✅ | ❌ | ❌ |
| `write_file` | 写入工作区文件 | 🟡 Medium | ❌ | ✅ | ✅ |
| `visit_page` | 浏览器访问页面截图 | 🟡 Medium | ✅ | ❌ | ❌ |

---

## 五、快速上手

### 场景 A: 我想通过浏览器 Web UI 使用 (原有方式)

```bash
# 1. 启动 Backend 基础设施
cd backend/docker
docker compose up -d

# 2. 启动 Frontend
cd frontend
npm run dev

# 3. 在浏览器中创建 Workspace，进入 Settings 获取 MCP_HUB_URL 和 MCP_TOKEN

# 4. 启动 MCP Server (方式一: Docker Compose)
cd mcp-server
MCP_HUB_URL=ws://host.docker.internal:8000/mcp/ws MCP_TOKEN=xxx docker compose up

# 4. 启动 MCP Server (方式二: 本地开发)
cd mcp-server
npm install
export MCP_HUB_URL=ws://localhost:8000/mcp/ws
export MCP_TOKEN=xxx
npm run dev
# 自动检测 MCP_HUB_URL，进入 ws 模式
```

### 场景 B: 我想在 Claude Code 中使用

```bash
# 方式1: HTTP 模式（推荐远程部署）
cd mcp-server
npm install && npm run dev:http
# 然后在 Claude Code 中:
claude mcp add redagent --transport http http://localhost:3001/mcp

# 方式2: stdio 模式（推荐本地开发）
# 项目已包含 .mcp.json，Claude Code 会自动发现
# 或手动添加:
claude mcp add redagent --transport stdio -- node /path/to/dist/index.js --mode stdio
```

### 场景 C: 我想在 VSCode Copilot 中使用

```
项目已包含 .vscode/mcp.json，VSCode 会自动发现两种配置:
- redagent-http: 需先启动 HTTP 模式服务
- redagent-local: 自动以 stdio 子进程启动（零配置）
```

### 场景 D: 我想在 Cursor 中使用

```jsonc
// Cursor Settings → MCP Servers
{
  "redagent": {
    "command": "node",
    "args": ["/path/to/mcp-server/dist/index.js", "--mode", "stdio"]
  }
}
```

---

## 六、⚠️ 已知兼容性问题

### 问题 1: WS 模式下工具实时日志不再推送到浏览器

**现象：** 通过浏览器 Web UI 执行命令时，工具运行过程中的实时日志（tool_log 面板）**不会更新**，只有最终结果会返回。

**原因：** Phase 1 重构将自定义通知 `tool/log` 和 `tool/exit` 替换为 MCP 标准的 `sendLoggingMessage`，但 Backend 的 `connection_manager.py` 仍然监听旧的自定义通知方法名。

**具体差异：**

| 功能 | 旧版 (index.legacy.ts) | 新版 (index.ts) |
|---|---|---|
| 工具运行日志 | `method: "tool/log"` + params: {tool, runId, command, data, workspaceId} | `sendLoggingMessage({level: "info", logger: toolName, data: logData})` |
| 工具运行结束 | `method: "tool/exit"` + params: {tool, runId, status, error, workspaceId} | (无显式通知，依赖 RPC 响应) |
| 终端输出 | `method: "terminal/output"` (直接 transport.send) | `method: "terminal/output"` (直接 transport.send) ✅ **未变** |

**影响范围：**
- ❌ 浏览器中的实时日志面板不会更新
- ❌ 数据库中 ToolRun 记录不会写入运行日志
- ❌ ToolRun 状态不会从 `running` 更新为 `completed/failed`
- ✅ 工具最终执行结果正常返回（通过 JSON-RPC Response）
- ✅ 终端功能正常（terminal/output 通知未改变）
- ✅ 工具注册、发现、调用正常

**临时解决方案：** 如果需要立即在浏览器模式使用，可以切换回旧版入口：

```bash
# 使用旧版 index.legacy.ts（所有功能完全兼容）
cd mcp-server
npx ts-node src/index.legacy.ts
```

**正式修复计划：** Phase 2 Task 2.2 将统一通知机制，使 WS 模式下的通知格式与 Backend 期望一致。

### 问题 2: Dockerfile CMD 需要更新

**现象：** 当前 Dockerfile 的 CMD 是 `node dist/index.js --mode docker`，但新版入口不再识别 `--mode docker`（只支持 `http`、`stdio`、`ws`）。

**影响：** Docker 镜像构建后会使用 stdio 模式（因为 `docker` 不是有效模式值，回退到默认 `stdio`），但生产环境通过 `MCP_HUB_URL` 环境变量可以自动切换到 ws 模式。

**建议修复（待更新 Dockerfile）：**
```dockerfile
# 旧
CMD ["node", "dist/index.js", "--mode", "docker"]
# 新（依赖 MCP_HUB_URL 自动选择 ws 或 stdio）
CMD ["node", "dist/index.js"]
```

### 问题 3: HTTP/stdio 模式无多工作区隔离

HTTP 和 stdio 模式作为独立进程运行，不经过 Backend，因此：
- 没有 Workspace 级别的认证和数据隔离
- `workspace_id` 参数仅影响 Docker volume 命名
- 适合单用户本地开发，不适合多租户生产环境

---

## 七、npm scripts 参考

```bash
# 构建
npm run build          # TypeScript 编译

# 生产启动
npm run start          # 默认 stdio 模式
npm run start:http     # Streamable HTTP 模式
npm run start:stdio    # stdio 模式
npm run start:ws       # WebSocket 反向连接模式

# 开发启动 (ts-node, 无需编译)
npm run dev            # 默认 stdio 模式
npm run dev:http       # Streamable HTTP 模式
npm run dev:stdio      # stdio 模式
```

---

## 八、文件结构（重构后）

```
mcp-server/
├── src/
│   ├── index.ts              # 主入口 (重写: 多模式, ToolRegistry)
│   ├── index.legacy.ts       # 旧版入口 (完全兼容, 备用)
│   ├── config.ts             # 配置 (新增 HTTP 端口等)
│   ├── http-transport.ts     # 新增: Streamable HTTP 传输
│   ├── transport.ts          # 保留: WebSocket 反向传输
│   ├── executor.ts           # 保留: Docker 命令执行
│   ├── session.ts            # 保留: Shell 会话管理
│   ├── terminal.ts           # 保留: PTY 终端管理
│   ├── browser.ts            # 保留: 无头浏览器
│   ├── knowledge_loader.ts   # 保留: 工具知识加载
│   ├── types/
│   │   └── tool-definition.ts  # 新增: CanonicalToolDef + ToolRegistry
│   ├── tools/
│   │   ├── index.ts            # 新增: 工具 barrel export
│   │   ├── session-tools.ts    # 新增: 会话工具
│   │   ├── scanning-tools.ts   # 新增: 扫描工具
│   │   ├── file-tools.ts       # 新增: 文件工具
│   │   └── browser-tools.ts    # 新增: 浏览器工具
│   └── a2a/
│       └── agent-card.ts       # 新增: A2A 协议端点
├── tools/                      # 工具知识库 (*.md)
├── containers.yaml             # 容器配置
├── Dockerfile                  # Docker 镜像构建
├── docker-compose.yml          # 部署编排
└── package.json                # 依赖 (新增 express)

项目根目录:
├── .mcp.json                   # 新增: Claude Code 项目级配置
├── .vscode/mcp.json            # 新增: VSCode MCP 配置
└── docs/
    ├── EVOLUTION_PLAN.md       # 演进计划
    └── USAGE_GUIDE.md          # 本文档
```

---

## 九、下一步 (Phase 2 预告)

Phase 2 将解决上述兼容性问题：

1. **统一通知机制**：使 WS 模式在 `sendLoggingMessage` 的同时，也发送 Backend 期望的 `tool/log` 和 `tool/exit` 通知（双写兼容层）
2. **Backend Agent 走 MCP**：重构 `agent/tools.py` 的 `execute_command` 通过 MCP 调用而非直连 Docker
3. **安全分级自动化**：基于 `annotations` 和 `riskLevel` 自动控制审批流
4. **Dockerfile 更新**：修正 CMD 参数
