# RedAgent MCP 协议演进工作计划

> 文档版本: v3.0 | 创建日期: 2025-03-09 | 更新日期: 2026-03-19
> 目标: 将 RedAgent MCP Server 升级为符合 MCP 2025-03-26 规范的标准实现，并支持 A2A 协议，以最大化兼容 Claude Code、VSCode、Cursor、Windsurf 等主流 AI Agent 平台。

---

## 一、现状评估

### 1.1 当前架构

| 维度 | 当前实现 | 评估 |
|---|---|---|
| SDK 版本 | `@modelcontextprotocol/sdk ^1.27.1` | ✅ 已升级，支持 2025-03-26 spec |
| 传输层 | Streamable HTTP + stdio + WebSocket 三模式 | ✅ 已实现标准 Streamable HTTP |
| 认证 | Bearer Token (HTTP 模式) | ⚠️ 未遵循 OAuth 2.1，当前可用 |
| 工具注册 | ToolRegistry 统一注册，工具独立文件定义 | ✅ 完整的能力注册中心 |
| 通知机制 | 工具日志和终端输出均使用 MCP 标准 `sendLoggingMessage()` | ✅ 已标准化 |
| Resources | `pentest://tools/{toolName}` 工具文档 | ✅ 符合 MCP resources 规范 |
| Prompts | `usage-{toolName}` 工具知识 | ✅ 符合 MCP prompts 规范 |
| Agent 集成 | SandboxExecutor 已委托 MCP 执行，本地执行已禁用 | ✅ 已修复 |
| Bee 扫描平台 | 完整 MCP 工具集 (bee_scan/status/result/fetch_result/workers/verify_unit/icp_query/addr_query) | ✅ 计划外新增 |

### 1.2 遗留问题

1. ~~**Agent 绕过 MCP**~~ ✅ 已修复: `SandboxExecutor.execute()` 在 MCP 连接可用时委托 `call_mcp_tool()`，本地执行已禁用
2. ~~**终端通知未标准化**~~ ✅ 已修复: `terminal.ts` 已改用 MCP 标准 `sendLoggingMessage()`，后端支持 `notifications/message` 和 legacy 格式
3. ~~**A2A 任务调度为空壳**~~ ✅ 已修复: `tasks/send` 现在通过 ToolRegistry 查找并执行工具，含安全门控
4. ~~**安全分级未集成**~~ ✅ 已修复: `containers.yaml` 定义 `risk_level/requires_approval`，`check_approval_node` 基于元数据驱动审批
5. **npm 包发布**: 未开始
6. **各平台配置验证**: Claude Desktop / Cursor / Windsurf 配置模板已创建但未实际验证

---

## 二、目标架构

### 2.1 通用能力抽象层 (Capability Registry)

```
┌─────────────────────────────────────────────────────┐
│            RedAgent Capability Registry               │
│                                                       │
│  CanonicalToolDef                                     │
│  ├── name / displayName / description                 │
│  ├── inputSchema / outputSchema (JSON Schema / Zod)   │
│  ├── annotations (readOnly, destructive, idempotent)  │
│  ├── category / riskLevel / requiresApproval          │
│  └── handler (async generator → ToolEvent stream)     │
└───────────┬──────────┬──────────────┬────────────────┘
            │          │              │
    ┌───────▼──┐ ┌─────▼────┐ ┌──────▼──────┐
    │MCP Server│ │A2A Agent │ │REST API     │
    │Adapter   │ │Adapter   │ │Adapter      │
    │          │ │          │ │             │
    │Streamable│ │Agent Card│ │OpenAPI Spec │
    │HTTP+stdio│ │JSON-RPC  │ │FastAPI      │
    │+WebSocket│ │          │ │             │
    └──────────┘ └──────────┘ └─────────────┘
```

### 2.2 多传输支持

```
传输层优先级:
1. Streamable HTTP  → 生产远程部署（Claude Code HTTP、VSCode HTTP）
2. stdio            → 本地开发（所有平台都支持，零配置）
3. WebSocket        → 保留向后兼容现有 Hub 架构，中期迁移到 HTTP
```

### 2.3 各平台接入方式

| 平台 | 传输方式 | 配置 | 状态 |
|---|---|---|---|
| Claude Code | HTTP (Streamable HTTP) | `claude mcp add --transport http` | ✅ 可用 |
| VSCode Copilot | HTTP + stdio | `.vscode/mcp.json` | ⚠️ 待验证 |
| Cursor | HTTP + stdio | Settings JSON | ⚠️ 待验证 |
| Windsurf | stdio | 配置文件 | ⚠️ 待验证 |
| Claude Desktop | stdio | `claude_desktop_config.json` | ⚠️ 待验证 |
| 现有 Hub | WebSocket (保留) | 环境变量 | ✅ 已有 |
| 多 Agent 编排 | A2A JSON-RPC | Agent Card + HTTP | ✅ 可用（待集成测试） |

---

## 三、实施计划

### Phase 1: MCP 合规升级 (P0) — ✅ 完成

#### Task 1.1: 通用工具描述符 (CanonicalToolDef) — ✅ 已完成
- **文件**: `mcp-server/src/types/tool-definition.ts`
- **完成内容**: `CanonicalToolDef` 接口、`ToolRegistry` 类（含 `register/getToolByName/getAllTools/getToolsByCategory/getToolsByRiskLevel/registerWithMcpServer/getA2ASkills/getSecuritySummary`）
- 所有工具定义已从 `index.ts` 抽取为独立文件统一注册

#### Task 1.2: Tool Annotations — ✅ 已完成
- **完成内容**: 所有工具已添加 MCP 2025-03-26 `annotations` 字段（`readOnlyHint/destructiveHint/idempotentHint/openWorldHint`）
- **注解矩阵**:

| 工具 | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|---|---|---|---|---|
| create_session | false | false | false | false |
| start_terminal | false | false | false | false |
| run_shell | false | true | false | true |
| nmap_scan | true | false | true | true |
| execute_command | false | true | false | true |
| read_file | true | false | true | false |
| write_file | false | true | false | false |
| visit_page | true | false | true | true |

#### Task 1.3: 标准通知替换 — ✅ 已完成
- `index.ts` 的工具执行日志使用 MCP 标准 `sendLoggingMessage()`
- `terminal.ts` 的 `emitOutput()` 已改用 `sendLoggingMessage({ logger: 'terminal', data: { sessionId, data } })`
- 后端 `connection_manager.py` 新增 `notifications/message` 标准处理，保留 `terminal/output` legacy 兼容
- `setTransport()` 方法和直接 transport 依赖已移除
- 旧代码归档至 `index.legacy.ts`

#### Task 1.4: Streamable HTTP 传输 — ✅ 已完成
- **文件**: `mcp-server/src/http-transport.ts`
- **完成内容**:
  - 单一 `/mcp` 端点（POST/GET/DELETE）
  - POST 处理 JSON-RPC 请求/通知，支持批量请求
  - GET 建立 SSE 流
  - `Mcp-Session-Id` 会话管理
  - Bearer Token 认证
  - CORS 支持
  - 通知返回 202 Accepted

#### Task 1.5: 多模式启动器 — ✅ 已完成
- **文件**: `mcp-server/src/index.ts`
- **完成内容**: 支持三种启动模式，自动检测 `MCP_HUB_URL` 环境变量切换 ws 模式
  ```
  --mode http    → Streamable HTTP (默认远程模式)
  --mode stdio   → stdio (本地开发模式，默认)
  --mode ws      → WebSocket 反向连接 (兼容现有 Hub)
  ```
- `package.json` 已配置 `start:http`、`start:stdio`、`start:ws` 脚本

#### Task 1.6: 升级 SDK 及依赖 — ✅ 已完成
- `@modelcontextprotocol/sdk` 已升级至 `^1.27.1`

### Phase 2: 统一能力注册中心 (P1) — ✅ 完成

#### Task 2.1: ToolRegistry 实现 — ✅ 已完成
- 完整的 ToolRegistry 类，支持按类别、风险等级查询
- 工具已拆分为独立文件:
  - `src/tools/session-tools.ts` — create_session, start_terminal, run_shell
  - `src/tools/scanning-tools.ts` — nmap_scan
  - `src/tools/command-tools.ts` — execute_command, cmd
  - `src/tools/file-tools.ts` — read_file, write_file
  - `src/tools/browser-tools.ts` — visit_page
  - `src/tools/bee-tools.ts` — Bee 扫描平台工具集
  - `src/tools/workspace-tools.ts` — workspace_create, workspace_list, workspace_switch
- `index.ts` 不再有硬编码工具定义，全部通过 registry 注册

#### Task 2.2: 修复 Agent → MCP 集成 — ✅ 已完成（验证确认）
- `SandboxExecutor.execute()` 在 MCP 连接可用时通过 `manager.call_mcp_tool()` 委托 MCP 执行
- 本地执行已被显式禁用（抛出 `ConnectionError`），确保所有命令必须经过 MCP
- `_execute_job_in_process()` 异步任务同样通过 `executor.execute()` → MCP 路径
- Agent 通过 MCP 调用 `get_mcp_prompt()` 查询工具知识

#### Task 2.3: 安全分级自动化 — ✅ 已完成
- MCP 端: 所有工具已定义 `security` 对象（`riskLevel`、`requiresApproval`、`category`、`tags`）
- 后端: `containers.yaml` 新增 `risk_level` 和 `requires_approval` 字段，`ContainerConfig` 已扩展
- 审批策略: `check_approval_node` 重构为双层安全策略
  - Layer 1: 硬编码黑名单拦截灾难性命令（`rm -rf /`、`mkfs` 等）
  - Layer 2: 基于容器注册表元数据，`high`/`critical` 风险级别或 `requires_approval=true` 的工具需人工审批
- 分级矩阵: Low (nmap/curl/dig/whois) → 自动放行 | Medium (gobuster/ffuf/nikto) → 自动放行 | High (hydra/medusa/nuclei) → 需审批 | Critical (msfconsole/sqlmap) → 需审批

### Phase 3: A2A 协议支持 (P2) — ✅ 基本完成

#### Task 3.1: Agent Card 端点 — ✅ 已完成
- **文件**: `mcp-server/src/a2a/agent-card.ts`
- `GET /.well-known/agent.json` 返回完整 Agent Card
- Skills 列表从 ToolRegistry 动态生成
- 流式能力已声明

#### Task 3.2: A2A JSON-RPC 端点 — ✅ 已完成
- `tasks/send` — 解析消息 → 查找工具 → 安全门控 → 异步执行 → 结果写入 artifacts
  - 支持两种格式: 结构化 (`{ skill: "tool_name", input: {...} }`) 和文本解析
  - 高风险工具自动拦截，返回 `input-required` 状态
- `tasks/get` — 返回任务状态和 artifacts
- `tasks/cancel` — 取消运行中的任务
- `/api/tools` — 工具元数据导出
- `/api/tools/security` — 安全概览

### Phase 4: 平台适配 & 发布 (P2) — ⚠️ 配置完成，发布未开始

#### Task 4.1: npm 包发布 — ❌ 未开始
- 发布 `@redagent/mcp-server` npm 包
- 支持 `npx @redagent/mcp-server` 一键启动

#### Task 4.2: 配置模板 — ✅ 已完成
- `.mcp.json` (Claude Code) — ✅ HTTP 模式
- `.vscode/mcp.json` (VSCode) — ✅ HTTP + stdio 双模式，含 Bee 平台环境变量
- `docs/configs/claude_desktop_config.example.json` (Claude Desktop) — ✅ stdio + HTTP 模板
- `docs/configs/cursor_mcp_settings.example.json` (Cursor) — ✅ stdio + HTTP 模板

---

## 计划外已完成

### Bee 扫描平台 MCP 集成
- **文件**: `mcp-server/src/tools/bee-tools.ts`、`mcp-server/src/utils/bee-client.ts`、`mcp-server/src/utils/result-store.ts`
- **工具集**: 基于 Temporal workflows 的异步安全扫描平台，采用 Fire-and-Forget + Polling 模式
  - `bee_scan` — 提交扫描任务（支持 company/cyberspace/port/web/web-finger/domain/discovery/netattrib 8 种扫描类型）
  - `bee_status` — 轮询任务状态
  - `bee_result` — 获取历史结果
  - `bee_fetch_result` — 从 OSS 下载扫描数据并本地持久化
  - `bee_workers` — 查询 worker 容量
  - `bee_verify_unit` — 企业名称验证/标准化
  - `bee_icp_query` — ICP 备案查询
  - `bee_addr_query` — IP/域名属性查询（CDN/WAF 检测、地理定位）
- **文档**: `mcp-server/tools/bee.md`

### Workspace 上下文管理
- **文件**: `mcp-server/src/workspace-context.ts`、`mcp-server/src/tools/workspace-tools.ts`
- **功能**: 工作区隔离，支持多项目场景
  - `workspace_create` — 创建工作区
  - `workspace_list` — 列出工作区
  - `workspace_switch` — 切换工作区

---

## 四、安全分级矩阵

所有渗透测试工具按风险等级分类，用于 Tool Annotations 和自动审批策略：

| 风险等级 | 工具 | readOnly | destructive | 需审批 |
|---|---|---|---|---|
| 🟢 Low | nmap_scan, read_file, visit_page, bee_status, bee_result, bee_workers, bee_verify_unit, bee_icp_query, bee_addr_query | ✅ | ❌ | ❌ |
| 🟡 Medium | write_file, run_shell (非破坏), bee_scan, bee_fetch_result | ❌ | ❌ | ⚠️ |
| 🔴 High | execute_command, run_shell (破坏性) | ❌ | ✅ | ✅ |
| ⚫ Critical | metasploit, hydra, sqlmap (exploit 类) | ❌ | ✅ | ✅ |

---

## 五、文件变更清单

### 新增文件
| 文件 | 用途 | 状态 |
|---|---|---|
| `mcp-server/src/types/tool-definition.ts` | CanonicalToolDef 类型和 ToolRegistry | ✅ |
| `mcp-server/src/http-transport.ts` | Streamable HTTP 传输层 | ✅ |
| `mcp-server/src/tools/session-tools.ts` | 会话工具 (create_session, start_terminal, run_shell) | ✅ |
| `mcp-server/src/tools/scanning-tools.ts` | 扫描工具 (nmap_scan) | ✅ |
| `mcp-server/src/tools/command-tools.ts` | 命令工具 (execute_command, cmd) | ✅ |
| `mcp-server/src/tools/file-tools.ts` | 文件工具 (read_file, write_file) | ✅ |
| `mcp-server/src/tools/browser-tools.ts` | 浏览器工具 (visit_page) | ✅ |
| `mcp-server/src/tools/bee-tools.ts` | Bee 扫描平台工具集 | ✅ |
| `mcp-server/src/tools/workspace-tools.ts` | 工作区管理工具 | ✅ |
| `mcp-server/src/tools/index.ts` | 工具注册入口 | ✅ |
| `mcp-server/src/a2a/agent-card.ts` | A2A Agent Card + 任务调度 | ✅ |
| `mcp-server/src/workspace-context.ts` | 工作区上下文管理 | ✅ |
| `mcp-server/src/utils/bee-client.ts` | Bee 平台 API 客户端 | ✅ |
| `mcp-server/src/utils/result-store.ts` | 扫描结果持久化 | ✅ |
| `mcp-server/src/index.legacy.ts` | 旧版入口归档 | ✅ |
| `mcp-server/tools/bee.md` | Bee 工具文档 | ✅ |
| `.mcp.json` | Claude Code 项目级 MCP 配置 | ✅ |
| `docs/EVOLUTION_PLAN.md` | 本文档 | ✅ |

### 修改文件
| 文件 | 改动概要 | 状态 |
|---|---|---|
| `mcp-server/package.json` | 升级 SDK 至 ^1.27.1、添加依赖 | ✅ |
| `mcp-server/src/index.ts` | 重构为 ToolRegistry 注册、多模式启动、标准日志通知 | ✅ |
| `mcp-server/src/config.ts` | 添加 HTTP 端口等配置项 | ✅ |
| `mcp-server/src/terminal.ts` | 终端输出通知 | ✅ 已标准化 |
| `backend/app/config/containers.yaml` | 容器配置 + 安全分级 | ✅ 新增 risk_level/requires_approval |
| `backend/app/services/container_registry.py` | ContainerConfig 扩展 | ✅ 新增安全字段 |
| `backend/app/agent/core.py` | 审批节点重构 | ✅ 双层安全策略 |
| `backend/app/services/connection_manager.py` | MCP 消息处理 | ✅ 新增 notifications/message 处理 |
| `docs/configs/claude_desktop_config.example.json` | Claude Desktop 配置模板 | ✅ 新增 |
| `docs/configs/cursor_mcp_settings.example.json` | Cursor 配置模板 | ✅ 新增 |

---

## 六、验收标准

### Phase 1 完成标准
- [x] `--mode stdio` 可被 Claude Code 通过 stdio 接入
- [x] `--mode http` 可被 Claude Code 通过 Streamable HTTP 接入
- [x] 所有工具带有正确的 `annotations` 字段
- [x] 自定义通知替换为标准 `sendLoggingMessage()`（工具日志 + 终端输出）
- [ ] VSCode `.vscode/mcp.json` 配置后可正常发现和调用工具（待验证）

### Phase 2 完成标准
- [x] ToolRegistry 管理所有工具，`index.ts` 不再有硬编码工具定义
- [x] Backend Agent 通过 MCP 执行命令（SandboxExecutor 委托 call_mcp_tool）
- [x] 安全分级策略自动生效（containers.yaml + check_approval_node 双层策略）

### Phase 3 完成标准
- [x] `GET /.well-known/agent.json` 返回有效的 Agent Card
- [x] A2A `tasks/send` 可创建并执行渗透测试任务
- [ ] 多 Agent 编排场景下端到端验证（待集成测试）

### Phase 4 完成标准
- [ ] npm 包发布
- [x] 各平台配置模板完整（Claude Code, VSCode, Claude Desktop, Cursor）

---

## 七、总体进度

| Phase | 完成度 | 说明 |
|---|---|---|
| Phase 1: MCP 合规升级 | ✅ 100% | 全部完成（SDK、传输、注解、通知、多模式） |
| Phase 2: 统一能力注册 | ✅ 100% | ToolRegistry + Agent→MCP 集成 + 安全分级自动化 |
| Phase 3: A2A 协议 | ✅ ~90% | Agent Card + 任务调度已实现，待端到端集成测试 |
| Phase 4: 平台适配 | ⚠️ ~60% | 配置模板完整，npm 包发布未开始 |
| **整体** | **~90%** | 核心功能全部完成，剩余 npm 发布和集成测试 |
