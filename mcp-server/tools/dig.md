# dig - DNS 查询工具

## 概述
| 属性 | 值 |
|------|-----|
| 二进制 | `dig` |
| 类别 | 信息收集、DNS 枚举 |
| 风险等级 | 低 |

## 描述
dig (Domain Information Groper) 是一个灵活的 DNS 查询工具，用于查询 DNS 记录、调试 DNS 问题。

---

## 使用场景

### 1. 查询 A 记录
```bash
dig target.com
```

### 2. 查询特定记录类型
```bash
dig target.com MX      # 邮件服务器
dig target.com NS      # DNS 服务器
dig target.com TXT     # TXT 记录
dig target.com CNAME   # 别名记录
dig target.com SOA     # 权威记录
dig target.com ANY     # 所有记录
```

### 3. 指定 DNS 服务器
```bash
dig @8.8.8.8 target.com
```

### 4. 反向 DNS 查询
```bash
dig -x 8.8.8.8
```

### 5. 简洁输出
```bash
dig target.com +short
```

### 6. 跟踪 DNS 解析路径
```bash
dig target.com +trace
```

### 7. 区域传输（AXFR）
```bash
dig @ns1.target.com target.com AXFR
```
> 注意：大多数服务器禁用 AXFR

---

## 常用选项
| 选项 | 说明 |
|------|------|
| `@server` | 指定 DNS 服务器 |
| `-x` | 反向查询 |
| `+short` | 简洁输出 |
| `+trace` | 跟踪解析路径 |
| `+noall +answer` | 只显示答案部分 |
| `-t` | 指定记录类型 |

---

## 安全提示
- 被动信息收集，不会触发告警
- AXFR 区域传输可能暴露大量子域名
