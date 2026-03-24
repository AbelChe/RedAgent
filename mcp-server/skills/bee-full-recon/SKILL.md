---
name: bee-full-recon
description: '对目标执行全方位多阶段侦察，覆盖公司资产、域名、端口、Web 指纹和漏洞扫描。当用户要求「全面扫描目标」「完整侦察」「梳理完整攻击面」或需要彻底的信息收集流程时使用。编排 8 种 Bee 扫描类型，严格串行管线执行。'
allowed-tools: bee_scan, bee_status, bee_result, bee_verify_unit, bee_addr_query, read_file
---

# Bee 全面侦察

## 概述

对目标执行全频谱侦察，编排全部 8 种 Bee 扫描类型。整个流程是**严格串行管线**——每一步的输出是下一步的输入，绝不并行。

## 何时使用

当用户：

- 要求「全面侦察」或「梳理完整攻击面」
- 渗透测试初期需要全面信息收集
- 红队评估需要从公司资产到 Web 漏洞的完整覆盖
- 安全审计需要资产清单和暴露面报告
- 提供了公司名称或主域名，期望全面结果

## 扫描类型速查

| 类型 | 用途 | 典型耗时 | 轮询间隔 |
|------|------|----------|----------|
| `company` | 公司资产发现（ICP、子域名、端口） | 10-30 分钟 | 3-5 分钟 |
| `cyberspace` | FOFA/Shodan/ZoomEye 搜索 | 3-10 分钟 | 1-2 分钟 |
| `domain` | DNS 解析 & 子域名枚举 | 30秒-2 分钟 | 15 秒 |
| `discovery` | 主机/服务存活探测 | 30秒-2 分钟 | 15 秒 |
| `port` | 端口扫描（masscan + nmap） | 1-5 分钟 | 30 秒 |
| `web-finger` | Web 指纹识别 | 1-3 分钟 | 30 秒 |
| `web` | Web 漏洞扫描 | 1-5 分钟 | 30 秒 |
| `netattrib` | 网络归属溯源 | 30秒-2 分钟 | 15 秒 |

## 数据依赖关系（严格串行）

```
Step 0: 单位名称验证
    ↓ 公司标准全称
Step 1: company 扫描
    ↓ 域名列表
Step 2: cyberspace 搜索
    ↓ 补充域名/资产
Step 3: domain 解析
    ↓ IP 列表（合并 Step 1-2 所有域名统一解析）
Step 4: discovery 存活探测
    ↓ 存活主机列表
Step 5: port 端口扫描
    ↓ IP:端口列表
Step 6: 构建 Web 目标（域名 + IP:端口 → URL）
    ↓ URL 列表
Step 7: web-finger 指纹识别
    ↓ 技术栈信息
Step 8: web 漏洞扫描
    ↓ 漏洞发现
Step 9: netattrib 网络归属
    ↓
Step 10: 汇总报告
```

> ⚠️ 每一步的输出是下一步的输入，**全程严格串行，绝不并行**。

## 工作流程

### Step 0：单位名称验证

如果用户提供的是公司名称，先验证名称准确性：

```
bee_verify_unit(unit_name="<用户输入的公司名>")
```

处理逻辑：
- ✅ `is_valid=true` 且 `confidence >= 0.8`：使用返回的 `validated_name` 作为后续所有扫描的公司名
- ⚠️ `is_valid=true` 但 `confidence < 0.8`：向用户展示标准名称，请求确认后再继续
- ❌ `is_valid=false`：向用户展示建议名称列表，要求重新输入

> 💡 此步骤还会返回行业分类和公司基本信息，可直接纳入最终报告。

**输出 →** 公司标准全称

### Step 1：公司资产发现

使用 Step 0 验证后的标准全称，发现公司的域名、子域名、ICP 备案等资产：

```
bee_scan(scan_type="company", targets=["<公司标准全称>"])
```

轮询直到完成（每 3-5 分钟）：

```
bee_status(scan_type="company", task_id="<task_id>")
bee_result(scan_type="company", workflow_id="<workflow_id>")
```

**输出 →** 域名列表、子域名列表、关联 IP 段、ICP 备案信息

### Step 2：网络空间搜索

用 Step 1 发现的域名，从 FOFA/Hunter/Quake 补充更多资产：

```
bee_scan(scan_type="cyberspace", targets=[<Step 1 发现的域名列表>])
```

> ⚠️ **重要**：cyberspace 扫描的目标是 **域名或 IP 地址**，不是 FOFA 查询语法。
> 请使用 Step 1 中发现的具体域名作为 targets。

轮询直到完成（每 1-2 分钟）：

```
bee_status(scan_type="cyberspace", task_id="<task_id>")
bee_result(scan_type="cyberspace", workflow_id="<workflow_id>")
```

**输出 →** 补充的域名、IP 地址、CIDR 段

### Step 3：域名解析

合并 Step 1 和 Step 2 发现的**所有域名**（去重后），统一进行 DNS 解析：

```
bee_scan(scan_type="domain", targets=[<Step 1 + Step 2 合并去重后的域名列表>])
```

轮询直到完成（每 15 秒）：

```
bee_status(scan_type="domain", task_id="<task_id>")
bee_result(scan_type="domain", workflow_id="<workflow_id>")
```

**输出 →** 域名到 IP 的映射关系、新发现的子域名、完整 IP 地址列表（含 cyberspace 发现的 IP）

### Step 4：存活主机探测

合并 Step 1-3 所有发现的 IP 和 CIDR 段（去重后），探测存活主机：

```
bee_scan(scan_type="discovery", targets=[<合并去重后的 IP/CIDR 列表>])
```

轮询直到完成（每 15 秒）：

```
bee_status(scan_type="discovery", task_id="<task_id>")
bee_result(scan_type="discovery", workflow_id="<workflow_id>")
```

**输出 →** 存活主机 IP 列表

### Step 5：端口扫描

对 Step 4 确认存活的 **IP 列表**进行端口扫描：

```
bee_scan(scan_type="port", targets=[<存活 IP 列表>], options={"port_range": "1-10000", "rate": 1000})
```

轮询直到完成（每 30 秒）：

```
bee_status(scan_type="port", task_id="<task_id>")
bee_result(scan_type="port", workflow_id="<workflow_id>")
```

**输出 →** 每个 IP 的开放端口列表（IP:端口）

### Step 6：构建 Web 目标列表

将 Step 2 的**域名-IP 映射**与 Step 5 的 **IP:端口**组合，构建 Web 扫描目标：

**组合规则：**
- 对每个域名，找到其解析的 IP（来自 Step 2）
- 对每个 IP:端口，用域名替换 IP 生成 URL
- HTTP 端口（80, 8080 等）→ `http://域名:端口`
- HTTPS 端口（443, 8443 等）→ `https://域名:端口`
- 标准端口可省略端口号（80 → `http://域名`，443 → `https://域名`）
- **去重**：多个 IP 映射到同一域名时，相同协议+端口的 URL 只需一次

**示例：**
```
Step 2: www.example.com → [1.2.3.4, 5.6.7.8]
Step 5: 1.2.3.4 → [80, 443, 8080], 5.6.7.8 → [80, 443]

Web 目标（去重后）:
- http://www.example.com
- https://www.example.com
- http://www.example.com:8080
```

> 此步骤不调用任何扫描工具，仅做数据组合。

**输出 →** 去重后的 URL 列表

### Step 7：Web 指纹识别

对 Step 6 构建的 **URL 列表**识别 Web 技术栈：

```
bee_scan(scan_type="web-finger", targets=[<URL 列表>])
```

轮询直到完成（每 30 秒）：

```
bee_status(scan_type="web-finger", task_id="<task_id>")
bee_result(scan_type="web-finger", workflow_id="<workflow_id>")
```

**输出 →** 每个 URL 的技术栈、框架、服务器信息

### Step 8：Web 漏洞扫描

对相同的 **URL 列表**进行漏洞扫描（可结合 Step 7 的指纹信息优化扫描策略）：

```
bee_scan(scan_type="web", targets=[<URL 列表>])
```

轮询直到完成（每 30 秒）：

```
bee_status(scan_type="web", task_id="<task_id>")
bee_result(scan_type="web", workflow_id="<workflow_id>")
```

**输出 →** 漏洞列表（类型、严重性、详情）

### Step 9：网络归属溯源

对关键 IP 进行归属分析（ISP、ASN、地理位置等）：

```
bee_scan(scan_type="netattrib", targets=[<关键 IP 列表>])
```

轮询直到完成（每 15 秒）：

```
bee_status(scan_type="netattrib", task_id="<task_id>")
bee_result(scan_type="netattrib", workflow_id="<workflow_id>")
```

**输出 →** IP 归属、ASN、ISP、地理位置信息

### Step 10：汇总报告

整理所有步骤的结果，输出结构化报告：

```
# 侦察报告 — <目标>

## 资产总览
- 域名: N 个
- IP 地址: N 个
- 存活主机: N 个
- 开放端口: N 个
- Web 站点: N 个

## 域名解析
| 域名 | 解析 IP |
|------|---------|

## 存活主机
| IP | 状态 |
|----|------|

## 开放端口
| IP | 端口 | 协议 | 服务 | 版本 |
|----|------|------|------|------|

## Web 指纹
| URL | 技术栈 | 框架 | 服务器 |
|-----|--------|------|--------|

## Web 漏洞
| URL | 漏洞类型 | 严重性 | 详情 |
|-----|----------|--------|------|

## 网络归属
| IP | 归属 | ASN | ISP |
|----|------|-----|-----|

## 关键发现
- 高危端口暴露: ...
- 已发现漏洞: ...

## 结果文件
- 公司资产: <ResultStore 路径>
- 域名解析: <ResultStore 路径>
- 端口扫描: <ResultStore 路径>
- Web 指纹: <ResultStore 路径>
- Web 漏洞: <ResultStore 路径>
```

## 最佳实践

- **全程严格串行**：每一步等上一步完成后再启动，绝不并行
- 每一步的输出经过提取、去重后作为下一步的输入
- Web 扫描目标必须用**域名 URL** 而非 IP——确保 Host 头正确，CDN/虚拟主机能正确路由
- 构建 Web 目标时注意去重：多个 IP 解析到同一域名时，相同协议+端口的 URL 只需扫描一次
- 遵循每种扫描类型的建议轮询间隔，不要轮询得更频繁
- 所有结果由 ResultStore 自动落盘——报告中引用文件路径即可
- 如果 ResultStore 返回截断摘要，使用 `read_file` 读取磁盘上的完整数据
- 如果用户给出的是域名而非公司名称，可跳过 Step 0-1，直接从 Step 2 开始
