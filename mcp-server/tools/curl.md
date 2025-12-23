# curl - 命令行 HTTP 客户端

## 概述
| 属性 | 值 |
|------|-----|
| 二进制 | `curl` |
| 类别 | 信息收集、HTTP 请求 |
| 风险等级 | 低 |

## 描述
curl 是一个命令行工具，用于通过 URL 传输数据。支持 HTTP、HTTPS、FTP 等多种协议，常用于 Web 接口测试、文件下载和 API 调用。

---

## 使用场景

### 1. 基础 GET 请求
```bash
curl http://target.com
```

### 2. 查看响应头
```bash
curl -I http://target.com
```

### 3. POST 请求
```bash
curl -X POST -d "username=admin&password=123" http://target.com/login
```

### 4. JSON 请求
```bash
curl -X POST -H "Content-Type: application/json" -d '{"key":"value"}' http://target.com/api
```

### 5. 携带 Cookie
```bash
curl -b "session=abc123" http://target.com/dashboard
```

### 6. 保存响应到文件
```bash
curl -o output.html http://target.com
```

### 7. 跟随重定向
```bash
curl -L http://target.com
```

### 8. 忽略 SSL 证书验证
```bash
curl -k https://target.com
```

---

## 常用选项
| 选项 | 说明 |
|------|------|
| `-I` | 只获取响应头 |
| `-X` | 指定请求方法 |
| `-d` | POST 数据 |
| `-H` | 添加请求头 |
| `-b` | 发送 Cookie |
| `-c` | 保存 Cookie |
| `-o` | 输出到文件 |
| `-L` | 跟随重定向 |
| `-k` | 忽略 SSL 证书 |
| `-v` | 详细输出 |
| `-s` | 静默模式 |
| `-u` | HTTP 认证 user:pass |
| `-A` | 自定义 User-Agent |

---

## 安全提示
- 使用 `-k` 会忽略证书验证，仅限测试环境
- 注意不要在命令行暴露敏感凭据
