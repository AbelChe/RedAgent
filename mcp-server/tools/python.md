# Python - 数据分析与脚本执行

## 概述
| 属性 | 值 |
|------|-----|
| 二进制 | `python3` / `python` |
| 类别 | 数据分析、脚本执行 |
| 风险等级 | 低 |

## 描述
Python 用于数据处理、结果分析、自定义脚本执行。在渗透测试中常用于处理扫描结果、编写自动化脚本。

---

## 使用场景

### 1. 执行脚本
```bash
python3 script.py
```

### 2. 一行命令
```bash
python3 -c "print('Hello')"
```

### 3. 解析 JSON 结果
```bash
python3 -c "import json; data=json.load(open('scan.json')); print(data['hosts'])"
```

### 4. Base64 编解码
```bash
# 编码
python3 -c "import base64; print(base64.b64encode(b'payload').decode())"

# 解码
python3 -c "import base64; print(base64.b64decode('cGF5bG9hZA==').decode())"
```

### 5. 简单 HTTP 服务器
```bash
python3 -m http.server 8000
```

### 6. 处理 CSV 文件
```bash
python3 -c "import csv; [print(row) for row in csv.reader(open('data.csv'))]"
```

### 7. 正则提取
```bash
python3 -c "import re; print(re.findall(r'\d+\.\d+\.\d+\.\d+', open('log.txt').read()))"
```

---

## 常用模块
| 模块 | 用途 |
|------|------|
| `json` | JSON 处理 |
| `csv` | CSV 处理 |
| `re` | 正则表达式 |
| `base64` | 编解码 |
| `hashlib` | 哈希计算 |
| `socket` | 网络编程 |
| `requests` | HTTP 请求 |
| `subprocess` | 执行命令 |

---

## 与其他工具配合

### 解析 Nmap XML 输出
```bash
python3 -c "
import xml.etree.ElementTree as ET
tree = ET.parse('scan.xml')
for host in tree.findall('.//host'):
    ip = host.find('address').get('addr')
    for port in host.findall('.//port'):
        print(f'{ip}:{port.get(\"portid\")}')
"
```

### 处理目录扫描结果
```bash
cat gobuster.txt | python3 -c "
import sys
for line in sys.stdin:
    if 'Status: 200' in line:
        print(line.strip())
"
```

---

## 安全提示
- Python 容器环境为最小化镜像
- 某些第三方库可能不可用
- 可通过 pip 安装额外依赖（如果网络允许）
