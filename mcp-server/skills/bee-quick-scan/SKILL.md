---
name: bee-quick-scan
description: '对已知域名或 IP 进行串行管线扫描：域名解析 → 端口扫描 → Web 扫描（域名+IP:端口组合）。当用户要求「快速扫描」「看看开了什么端口」「检查目标服务」或需要快速了解攻击面时使用。'
allowed-tools: bee_scan, bee_status, bee_result, bee_addr_query, nmap_scan, read_file
---

# Bee 快速扫描

## 概述

对已知域名或 IP 执行串行管线扫描，按顺序完成**域名解析 → 端口扫描 → Web 扫描**。每一步的输出作为下一步的输入，逐步精确定位攻击面。

## 何时使用

当用户：

- 有明确的域名或 IP，需要快速了解开放服务
- 问「这个目标开了什么端口」或「快速扫一下」
- 时间有限，需要快速定位攻击面
- 要验证特定目标的服务状态
- 需要轻量扫描后再决定是否深入分析

## 工作流程

> ⚠️ 整个流程是**严格串行**的，每一步依赖上一步的结果，绝不并行执行。

### Step 1：域名解析

将域名解析为 IP 地址列表。如果用户给的已经是 IP，跳过此步。

```
bee_scan(scan_type="domain", targets=["www.baidu.com"])
```

轮询直到完成：

```
bee_status(scan_type="domain", task_id="<domain_task_id>")
bee_result(scan_type="domain", workflow_id="<domain_workflow_id>")
```

**输出示例：**
```
www.baidu.com → [12.34.56.78, 22.33.44.55]
```

> 💡 也可用 `bee_addr_query` 快速获取域名的 IP 信息，但 `domain` 扫描能发现更多子域名和解析记录。

### Step 2：端口扫描

用 Step 1 解析出的 **IP 列表**作为扫描目标：

```
bee_scan(scan_type="port", targets=["12.34.56.78", "22.33.44.55"], options={"port_range": "1-10000", "rate": 1000})
```

轮询直到完成：

```
bee_status(scan_type="port", task_id="<port_task_id>")
bee_result(scan_type="port", workflow_id="<port_workflow_id>")
```

**输出示例：**
```
12.34.56.78 → [80, 443, 8080]
22.33.44.55 → [80, 443]
```

### Step 3：Web 扫描

将**原始域名**与 Step 2 发现的 **IP:端口**组合，构建 Web 扫描目标列表。

**组合规则：** 对每个 IP:端口，用原始域名替换 IP 生成 URL：
- HTTP 端口（80, 8080 等）→ `http://域名:端口`
- HTTPS 端口（443, 8443 等）→ `https://域名:端口`
- 标准端口可省略端口号（80 → `http://域名`，443 → `https://域名`）

**示例：**
```
原始域名: www.baidu.com
端口扫描结果: 12.34.56.78:443, 12.34.56.78:80, 22.33.44.55:443, 22.33.44.55:80

Web 扫描目标:
- https://www.baidu.com       (→ 12.34.56.78:443)
- http://www.baidu.com        (→ 12.34.56.78:80)
- https://www.baidu.com       (→ 22.33.44.55:443)  ← 与上面去重
- http://www.baidu.com        (→ 22.33.44.55:80)   ← 与上面去重
```

> ⚠️ 注意去重：不同 IP 的相同端口映射到同一域名 URL 时，只需扫描一次。

启动 Web 扫描（包含 web-finger 指纹识别 + web 漏洞扫描）：

```
bee_scan(scan_type="web-finger", targets=["https://www.baidu.com", "http://www.baidu.com"])
bee_scan(scan_type="web", targets=["https://www.baidu.com", "http://www.baidu.com"])
```

> 💡 Step 3 中的 web-finger 和 web 扫描可以**并行启动**，因为它们的目标列表相同且互不依赖。

轮询并获取结果：

```
bee_status(scan_type="web-finger", task_id="<finger_task_id>")
bee_status(scan_type="web", task_id="<web_task_id>")
bee_result(scan_type="web-finger", workflow_id="<finger_workflow_id>")
bee_result(scan_type="web", workflow_id="<web_workflow_id>")
```

### Step 4：汇总报告

输出完整报告：

```
# 快速扫描报告 — <目标域名>

## 域名解析
| 域名 | 解析 IP |
|------|---------|

## 开放端口
| IP | 端口 | 协议 | 服务 | 版本 |
|----|------|------|------|------|

## Web 指纹
| URL | 技术栈 | 框架 | 服务器 |
|-----|--------|------|--------|

## Web 漏洞
| URL | 漏洞类型 | 严重性 | 详情 |
|-----|----------|--------|------|

## 建议下一步
- 对 <高价值服务> 使用 nmap_scan 深入探测
- 使用 execute_command 进行针对性服务探测
```

## 参数配置建议

| 参数 | 内网环境 | 外网环境 |
|------|----------|----------|
| `rate` | 5000+ | ≤ 1000 |
| `port_range` | `"1-65535"`（全端口） | `"1-10000"`（常用端口） |

## 最佳实践

- 整个流程**严格串行**：域名解析 → 端口扫描 → Web 扫描，每步依赖上步结果
- Step 3 中 web-finger 和 web 扫描是同一步内唯一可以并行的操作
- `rate` 参数控制端口扫描速率：越高越快但越激进，外网目标建议 ≤ 1000 以避免触发告警
- 默认端口范围覆盖常用端口；全端口扫描设 `"1-65535"`，耗时更长
- Web 扫描目标必须用**域名 URL** 而非 IP——确保 Host 头正确，CDN/虚拟主机能正确路由
- 构建 Web 目标时注意去重：多个 IP 解析到同一域名时，相同协议+端口的 URL 只需扫描一次
- 所有结果由 ResultStore 自动落盘；如内联摘要被截断，使用 `read_file` 读取完整数据
- 如需对特定端口做详细服务版本检测，后续使用 `nmap_scan` 的 `-sV` 配置
- 如果用户给出的目标已经是 IP 地址，直接跳过 Step 1 从 Step 2 开始
