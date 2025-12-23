# Nuclei - 快速漏洞扫描器

## 概述
| 属性 | 值 |
|------|-----|
| 二进制 | `nuclei` |
| 类别 | 漏洞扫描 |
| 风险等级 | 中 |

## 描述
Nuclei 是一个基于模板的快速漏洞扫描器，使用 YAML 模板定义扫描规则，支持大规模并发扫描。

---

## 使用场景

### 1. 基础扫描
```bash
nuclei -u http://target.com
```

### 2. 批量目标扫描
```bash
nuclei -l targets.txt
```

### 3. 使用特定模板
```bash
nuclei -u http://target.com -t cves/
```

### 4. 按严重程度过滤
```bash
nuclei -u http://target.com -severity critical,high
```

### 5. 按标签过滤
```bash
nuclei -u http://target.com -tags rce,sqli
```

### 6. 更新模板库
```bash
nuclei -update-templates
```

### 7. 输出结果
```bash
nuclei -u http://target.com -o results.txt
nuclei -u http://target.com -json -o results.json
```

### 8. 限制并发
```bash
nuclei -u http://target.com -c 10 -rl 50
```
- `-c`: 并发数
- `-rl`: 每秒请求数

---

## 常用选项
| 选项 | 说明 |
|------|------|
| `-u` | 单个目标 URL |
| `-l` | 目标列表文件 |
| `-t` | 模板路径 |
| `-tags` | 按标签过滤 |
| `-severity` | 按严重程度过滤 |
| `-c` | 并发数 |
| `-rl` | 速率限制 |
| `-o` | 输出文件 |
| `-json` | JSON 输出 |
| `-silent` | 静默模式 |
| `-update-templates` | 更新模板 |

---

## 严重程度
- `info` - 信息
- `low` - 低危
- `medium` - 中危
- `high` - 高危
- `critical` - 严重

---

## 安全提示
| 风险 | 说明 |
|------|------|
| **流量** | 大规模扫描产生大量请求 |
| **检测** | 某些模板会触发 WAF |
