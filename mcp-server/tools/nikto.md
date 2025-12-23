# nikto - Web 服务器漏洞扫描器

## 概述
| 属性 | 值 |
|------|-----|
| 二进制 | `nikto` |
| 类别 | Web 漏洞扫描 |
| 风险等级 | 中 |

## 描述
Nikto 是一个开源的 Web 服务器扫描器，可检测危险文件、过期软件版本、配置错误等安全问题。

---

## 使用场景

### 1. 基础扫描
```bash
nikto -h http://target.com
```

### 2. 指定端口
```bash
nikto -h target.com -p 8080
```

### 3. 多端口扫描
```bash
nikto -h target.com -p 80,443,8080
```

### 4. SSL 站点扫描
```bash
nikto -h https://target.com -ssl
```

### 5. 保存输出
```bash
nikto -h target.com -o report.html -Format htm
```

### 6. 使用代理
```bash
nikto -h target.com -useproxy http://127.0.0.1:8080
```

### 7. 指定 Cookie
```bash
nikto -h target.com -C "session=abc123"
```

---

## 常用选项
| 选项 | 说明 |
|------|------|
| `-h` | 目标主机 |
| `-p` | 端口 |
| `-ssl` | 强制 SSL |
| `-o` | 输出文件 |
| `-Format` | 输出格式 (txt, html, csv, xml) |
| `-C` | Cookie |
| `-id` | HTTP 认证 user:pass |
| `-useproxy` | 代理服务器 |
| `-Tuning` | 扫描调优（限制扫描类型） |
| `-update` | 更新插件数据库 |

---

## 扫描调优 (-Tuning)
| 值 | 说明 |
|----|------|
| 1 | 有趣的文件 |
| 2 | 配置错误 |
| 3 | 信息泄露 |
| 4 | 注入漏洞 |
| 5 | 远程文件获取 |
| 6 | 拒绝服务 |
| 7 | 远程 Shell |
| 8 | 命令执行 |
| 9 | SQL 注入 |
| 0 | 文件上传 |

---

## 安全提示
| 风险 | 说明 |
|------|------|
| **检测** | 扫描流量特征明显，易被 WAF 拦截 |
| **法律** | 未授权扫描违法 |
