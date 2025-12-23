# wget - 网络文件下载工具

## 概述
| 属性 | 值 |
|------|-----|
| 二进制 | `wget` |
| 类别 | 信息收集、文件下载 |
| 风险等级 | 低 |

## 描述
wget 是一个非交互式网络下载工具，支持 HTTP、HTTPS、FTP 协议。支持递归下载、断点续传和后台运行。

---

## 使用场景

### 1. 下载文件
```bash
wget http://target.com/file.zip
```

### 2. 指定保存文件名
```bash
wget -O custom_name.zip http://target.com/file.zip
```

### 3. 断点续传
```bash
wget -c http://target.com/large_file.zip
```

### 4. 后台下载
```bash
wget -b http://target.com/file.zip
```

### 5. 递归下载网站
```bash
wget -r -l 3 http://target.com
```
- `-r`: 递归下载
- `-l 3`: 限制深度为 3 层

### 6. 下载整个网站（镜像）
```bash
wget --mirror -p --convert-links http://target.com
```

### 7. 忽略 SSL 证书
```bash
wget --no-check-certificate https://target.com
```

### 8. 限速下载
```bash
wget --limit-rate=100k http://target.com/file.zip
```

---

## 常用选项
| 选项 | 说明 |
|------|------|
| `-O` | 指定输出文件名 |
| `-c` | 断点续传 |
| `-b` | 后台运行 |
| `-r` | 递归下载 |
| `-l` | 递归深度 |
| `-p` | 下载页面所需资源 |
| `--mirror` | 镜像模式 |
| `-q` | 静默模式 |
| `--limit-rate` | 限制下载速度 |
| `--no-check-certificate` | 忽略 SSL 证书 |

---

## 安全提示
- 递归下载可能下载大量数据，注意磁盘空间
- 镜像模式可能触发目标防护机制
