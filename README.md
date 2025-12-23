# AI 智能渗透测试平台 (AI Pentest Intelligent Platform)

> **下一代自主渗透测试系统**
> 结合了 LLM 智能 (大脑) 与分布式执行节点 (双手) 的攻击平台。

## 🌍 架构概览

本项目采用 **云-边 (Cloud-Edge)** 架构设计，旨在实现高扩展性与安全性。

### 1. 云端核心 (Cloud Core - "大脑")
*   **前端 (Frontend)**：Next.js 构建的仪表盘，用于可视化攻击路径、生成报告和实时查看日志。
*   **后端 (Backend)**：基于 Python 的推理引擎。负责管理会话、知识库检索以及核心决策逻辑。
*   **基础设施 (Infrastructure)**：Postgres (数据存储), Redis (任务队列)。

### 2. 执行边缘 (Execution Edge - "双手") - `mcp-server`
*   **MCP Server**：一个遵循 [Model Context Protocol](https://modelcontextprotocol.io/) 协议的 Node.js 智能体节点。
*   **核心能力**：
    *   **Docker 沙箱**：在隔离的容器中运行高危工具 (如 `nmap`, `nuclei`)。
    *   **浏览器环境**：内置 Headless Chrome (Puppeteer) 用于 Web 应用测试。
    *   **有状态终端**：具备 "记忆" 的 Shell 会话 (自动保持 `cwd`, `env` 等上下文)。
*   **连接性**：通过 **WebSocket (反向隧道)** 连接至云端核心，支持部署在防火墙后的内网环境中。

---

## 🛠️ 快速开始 (开发环境)

### 第一步：启动基础设施
启动数据库、Redis 和默认的渗透测试沙箱容器。
```bash
cd docker
docker-compose up -d
```

### 第二步：启动后端 (大脑)
*(确保已配置 Python 环境)*
```bash
cd backend
# 安装依赖并运行 API 服务
# pip install -r requirements.txt
# uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --log-level debug
```

### 第三步：启动前端 (面孔)
```bash
cd frontend
npm install
npm run dev
```

### 第四步：启动 MCP Server (双手)
这是实际执行任务的单元。它既可以本地运行，也可以在 Docker 中运行。

**选项 A: 本地开发 (标准 MCP 模式)**
```bash
cd mcp-server
npm install & npm run build
# 通过 Stdio 连接 IDE，或者运行验证脚本
npx ts-node verify.ts
```

**选项 B: 云端节点 (模拟 SaaS 模式)**
```bash
# 通过 WebSocket 反向连接至后端
export MCP_HUB_URL="ws://127.0.0.1:8000/connect"
export MCP_TOKEN="dev-token"
cd mcp-server
npm start
```

---

## 📦 目录结构

*   `backend/`: Python API 和 LLM 逻辑核心。
*   `frontend/`: Next.js Web 控制台。
*   `mcp-server/`: **(核心组件)** 智能执行节点。
    *   `src/index.ts`: 入口点 (自适应 Stdio/WebSocket 模式)。
    *   `src/session.ts`: 有状态 Shell 会话管理器。
    *   `src/browser.ts`: Puppeteer 浏览器控制器。
    *   `tools/config/containers.yaml`: 工具与容器的映射配置。
*   `docker/`: 基础设施编排文件。

## 🔐 安全模型

1.  **环境隔离**：所有高危工具均运行在 Docker 容器中，**绝不** 直接在宿主机执行。
2.  **反向连接**：边缘节点通过 WSS 主动外呼连接云端，无需开放入站端口。
3.  **令牌认证**：使用 Bearer Token 对边缘节点进行鉴权。

---

*Verified & Built by Google DeepMind (Agentic Coding Team).*
