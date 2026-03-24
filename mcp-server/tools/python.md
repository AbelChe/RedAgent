# Python - Data Analysis & Script Execution

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `python3` / `python` |
| Category | Data Analysis, Script Execution |
| Risk Level | Low |

## Description
Python is used for data processing, result analysis, and custom script execution. In penetration testing, it is commonly used to parse scan results, write automation scripts, encode/decode data, and create simple utilities.

---

## Usage Patterns

### 1. Execute Script
**Goal:** Run a Python script file.
```bash
python3 script.py
```

### 2. One-Liner Command
**Goal:** Execute a quick inline command.
```bash
python3 -c "print('Hello')"
```

### 3. Parse JSON Results
**Goal:** Extract data from scan output in JSON format.
```bash
python3 -c "import json; data=json.load(open('scan.json')); print(data['hosts'])"
```

### 4. Base64 Encode/Decode
**Goal:** Encode or decode Base64 data.
```bash
# Encode
python3 -c "import base64; print(base64.b64encode(b'payload').decode())"

# Decode
python3 -c "import base64; print(base64.b64decode('cGF5bG9hZA==').decode())"
```

### 5. Simple HTTP Server
**Goal:** Serve files over HTTP for payload delivery.
```bash
python3 -m http.server 8000
```

### 6. Process CSV Files
**Goal:** Read and display CSV data.
```bash
python3 -c "import csv; [print(row) for row in csv.reader(open('data.csv'))]"
```

### 7. Regex Extraction
**Goal:** Extract patterns (e.g., IP addresses) from text files.
```bash
python3 -c "import re; print(re.findall(r'\d+\.\d+\.\d+\.\d+', open('log.txt').read()))"
```

---

## Common Modules
| Module | Purpose |
|--------|---------|
| `json` | JSON parsing and generation |
| `csv` | CSV file processing |
| `re` | Regular expressions |
| `base64` | Base64 encoding/decoding |
| `hashlib` | Hash computation (MD5, SHA) |
| `socket` | Network programming |
| `requests` | HTTP requests (if installed) |
| `subprocess` | Execute system commands |

---

## Integration with Other Tools

### Parse Nmap XML Output
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

### Filter Directory Scan Results
```bash
cat gobuster.txt | python3 -c "
import sys
for line in sys.stdin:
    if 'Status: 200' in line:
        print(line.strip())
"
```

---

## Output Parsing

### Sample Output (JSON Parsing)
```
$ python3 -c "import json; data=json.load(open('scan.json')); print(json.dumps(data, indent=2))"
{
  "hosts": [
    {"ip": "192.168.1.10", "ports": [22, 80, 443]},
    {"ip": "192.168.1.11", "ports": [22, 3306]}
  ]
}
```

### Sample Output (IP Extraction)
```
$ python3 -c "import re; print(re.findall(r'\d+\.\d+\.\d+\.\d+', open('log.txt').read()))"
['192.168.1.10', '192.168.1.11', '10.0.0.1']
```

### Parsing Rules
- Python output varies depending on the script
- Use `json.dumps(data, indent=2)` for pretty-printing JSON
- Use `-c` for one-liners; scripts for complex analysis
- Combine with `sys.stdin` to process piped output from other tools

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| IP list extracted | `nmap`/`masscan` to scan | `nmap -iL targets.txt` |
| Parsed scan results | Continue pentest workflow | Use appropriate tool for findings |
| Custom exploit script | `msfconsole` for listener | `use exploit/multi/handler` |
| HTTP server started | Deliver payloads | Upload via target vulnerability |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Container Environment** | Python runs in a minimal Docker container. |
| **Third-Party Libraries** | Some packages may not be available; install via `pip` if network allows. |
