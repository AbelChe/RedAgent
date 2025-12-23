# whois - 域名/IP 信息查询

## 概述
| 属性 | 值 |
|------|-----|
| 二进制 | `whois` |
| 类别 | 信息收集、OSINT |
| 风险等级 | 低 |

## 描述
whois 用于查询域名注册信息、IP 地址归属等。是信息收集阶段的基础工具。

---

## 使用场景

### 1. 查询域名信息
```bash
whois target.com
```

### 2. 查询 IP 信息
```bash
whois 8.8.8.8
```

### 3. 指定 WHOIS 服务器
```bash
whois -h whois.verisign-grs.com target.com
```

---

## 输出解析
重要字段：
- **Registrar**: 注册商
- **Creation Date**: 注册日期
- **Expiration Date**: 到期日期
- **Name Server**: DNS 服务器
- **Registrant**: 注册人信息（可能隐私保护）

---

## 常用选项
| 选项 | 说明 |
|------|------|
| `-h` | 指定 WHOIS 服务器 |
| `-p` | 指定端口 |

---

## 安全提示
- 被动信息收集，不会触发目标告警
- 某些域名开启隐私保护，信息有限
