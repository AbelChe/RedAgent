---
name: bee-company-recon
description: '以公司名称为起点测绘其互联网资产。发现 ICP 备案、域名、子域名、IP 和证书。当用户要求「扫描某公司」「查找公司资产」「公司侦察」或提供公司名称希望发现其数字资产时使用。支持可选扩展到域名解析和网络空间搜索。'
allowed-tools: mcp__redagent__bee_scan, mcp__redagent__bee_status, mcp__redagent__bee_result, mcp__redagent__bee_verify_unit, mcp__redagent__read_file
---

# Bee 公司资产测绘

## 概述

以公司名称为起点，发现其完整的互联网资产清单。使用 Bee `company` 扫描类型枚举 ICP 备案、域名、子域名和 IP 段，可选扩展到域名解析和网络空间搜索。

## 前提条件

> ⚠️ **重要**：此 skill 依赖 MCP 工具 `mcp__redagent__bee_*` 系列。
>
> 如果这些工具不可用，请检查：
> 1. MCP 服务器是否正确配置了 `BEE_API_URL` 环境变量
> 2. MCP 服务器是否已重启以加载 bee 工具
> 3. 运行 `npm run dev:stdio` 检查启动日志中是否有 `[ToolRegistry] Registered: bee_*`

## 何时使用

当用户：

- 提供了公司名称，希望发现其互联网资产
- 要求「测绘公司资产」或「公司侦察」
- 需要对目标组织进行供应链安全评估
- 需要安全审计用的资产清单
- 只知道目标公司名称，不知道域名/IP

## 工作流程

### Step 0：单位名称验证（必须）

在启动公司扫描前，先验证用户输入的公司名称。

**使用 MCP 工具调用**：

```
mcp__redagent__bee_verify_unit(unit_name="<用户输入的公司名>")
```

处理逻辑：
- ✅ `is_valid=true` 且 `confidence >= 0.8`：使用 `validated_name`（标准全称）继续 Step 1
- ⚠️ `is_valid=true` 但 `confidence < 0.8`：向用户展示标准名称，请求确认后再继续
- ❌ `is_valid=false`：向用户展示 `suggestions` 建议列表，要求重新输入

> 💡 此步骤还会返回行业分类、行政归属、天眼查基本信息，可直接纳入最终资产清单。

示例：用户输入「百度」→ `validated_name: "北京百度网讯科技有限公司"`, `confidence: 0.95`

### Step 1：启动公司资产发现

使用 Step 0 验证后的标准全称：

```
mcp__redagent__bee_scan(scan_type="company", targets=["<公司名>"])
```

> ⏱️ 这是耗时最长的扫描类型，通常需要 10-30 分钟。使用公司全称可提高准确性。

### Step 2：轮询等待完成

每 3-5 分钟检查一次：

```
mcp__redagent__bee_status(scan_type="company", task_id="<task_id>")
```

### Step 3：获取结果

状态显示 `COMPLETED` 后：

```
mcp__redagent__bee_result(scan_type="company", workflow_id="<workflow_id>")
```

### Step 4：分析发现的资产

从结果中提取：

- ICP 备案域名
- 子域名列表
- 关联 IP 段
- 证书关联域名

如果 ResultStore 返回了截断摘要，使用 `mcp__redagent__read_file` 读取完整数据。

### Step 5：域名解析（可选）

对 Step 4 发现的域名进行 DNS 解析，获取 IP 地址：

```
mcp__redagent__bee_scan(scan_type="domain", targets=["域名1", "域名2"])
```

轮询直到完成（每 15 秒）：

```
mcp__redagent__bee_status(scan_type="domain", task_id="<task_id>")
mcp__redagent__bee_result(scan_type="domain", workflow_id="<workflow_id>")
```

**输出 →** 域名到 IP 的映射关系

### Step 6：网络空间搜索（可选）

用 Step 4 发现的域名，从 FOFA/Hunter/Quake 补充资产：

```
mcp__redagent__bee_scan(scan_type="cyberspace", targets=["baidu.com", "hao123.com"])
```

> ⚠️ **重要**：cyberspace 扫描的目标是 **域名或 IP 地址**，不是 FOFA 查询语法（如 `org="公司名"`）。
> 请使用 Step 4 中发现的具体域名作为 targets。

轮询直到完成（每 1-2 分钟）：

```
mcp__redagent__bee_status(scan_type="cyberspace", task_id="<task_id>")
mcp__redagent__bee_result(scan_type="cyberspace", workflow_id="<workflow_id>")
```

**输出 →** 补充的 IP、域名、CIDR 段

> ⚠️ Step 5 和 Step 6 是**串行**的：先域名解析获取 IP，再用完整的域名+IP 信息去网络空间搜索补充资产。

### Step 7：输出资产清单

输出结构化资产列表：

```
# 资产清单 — <公司名>

## 域名资产
| 域名 | ICP 备案 | 解析 IP |
|------|---------|--------|

## IP 资产
| IP/CIDR | 归属 | 开放端口 |
|---------|------|----------|

## 关联资产
- 子公司: ...
- 证书关联: ...
```

## 最佳实践

- **必须先验证**——始终在 `bee_scan` 之前调用 `bee_verify_unit` 确认公司名称
- 使用验证返回的 `validated_name`（标准全称）进行后续扫描，避免因简称/别名导致搜索不准
- 整个流程**严格串行**：每一步等上一步完成后再启动，绝不并行
- 大型公司可能产生非常大的子域名列表，ResultStore 会自动截断内联返回
- Step 5-6 是可选的——仅在用户需要 DNS 级别或 FOFA 级别细节时展开
- 如果 ResultStore 返回截断摘要，使用 `read_file` 读取磁盘上的完整数据
- 最终报告中始终引用 ResultStore 文件路径，方便用户后续访问原始数据

## 故障排除

### 问题：工具调用失败，显示 "unknown command" 或类似错误

**原因**：当前会话的 MCP 服务器没有加载 bee 工具。

**解决方案**：
1. 检查 MCP 服务器配置文件 `.env.mcp` 中是否设置了 `BEE_API_URL`
2. 重启 MCP 服务器：`npm run dev:stdio`
3. 检查启动日志中是否有：
   ```
   🔍 bee_verify_unit enabled (UnitFilter: ...)
   🐝 Bee tools enabled (API: ...)
   [ToolRegistry] Registered: bee_verify_unit [reconnaissance/low]
   [ToolRegistry] Registered: bee_scan [reconnaissance/medium]
   ...
   ```

### 问题：验证结果置信度低

**原因**：用户输入的公司名称可能是简称或别名。

**解决方案**：使用返回的 `suggestions` 列表中的标准名称重新验证。
