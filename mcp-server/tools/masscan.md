# Masscan - Mass IP Port Scanner

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `masscan` |
| Category | Port Scanning |
| Risk Level | High |

## Description
Masscan is the fastest Internet port scanner, capable of scanning the entire Internet in under 6 minutes. It uses asynchronous transmission to achieve extreme speed.

---

## Usage Patterns

### 1. Basic Port Scan
**Goal:** Scan specific ports on a target.
```bash
masscan <target> -p<ports>
```
**Example:** `masscan 192.168.1.0/24 -p80,443,8080`

### 2. Full Port Scan
**Goal:** Scan all 65535 ports.
```bash
masscan <target> -p1-65535
```

### 3. Rate-Limited Scan
**Goal:** Control scan speed to avoid detection/crashes.
```bash
masscan <target> -p<ports> --rate <packets_per_second>
```
**Example:** `masscan 10.0.0.0/8 -p80 --rate 10000`

### 4. Banner Grabbing
**Goal:** Retrieve service banners.
```bash
masscan <target> -p<ports> --banners
```

### 5. Exclude Targets
**Goal:** Skip sensitive hosts.
```bash
masscan <target> -p<ports> --excludefile exclude.txt
```

---

## Output Formats
| Flag | Format | Use Case |
|------|--------|----------|
| `-oL` | List | Simple list output |
| `-oJ` | JSON | Machine parsing |
| `-oG` | Grepable | Compatible with nmap tools |
| `-oX` | XML | Report generation |

> Standard text output is auto-persisted by ResultStore. For structured output, use `-oJ masscan/<filename>.json` to write JSON to the workspace volume.

---

## Output Parsing

### Sample Output (Text)
```
Starting masscan 1.3.2 (http://bit.ly/14GZzcT) at 2024-01-15 10:30:00 GMT
Initiating SYN Stealth Scan
Scanning 256 hosts [3 ports/host]
Discovered open port 80/tcp on 192.168.1.10
Discovered open port 443/tcp on 192.168.1.10
Discovered open port 22/tcp on 192.168.1.15
Discovered open port 8080/tcp on 192.168.1.20
Discovered open port 3306/tcp on 192.168.1.25
```

### Sample Output (JSON with `-oJ`)
```json
[
  {"ip": "192.168.1.10", "timestamp": "1705312200", "ports": [{"port": 80, "proto": "tcp", "status": "open", "reason": "syn-ack", "ttl": 64}]},
  {"ip": "192.168.1.10", "timestamp": "1705312201", "ports": [{"port": 443, "proto": "tcp", "status": "open", "reason": "syn-ack", "ttl": 64}]}
]
```

### Parsing Rules
- `Discovered open port` lines = found open ports
- JSON format provides structured data with IP, port, protocol, and TTL
- `--banners` output adds service info after port discovery
- Use JSON output for pipeline processing with other tools

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Open ports discovered | `nmap` for service detection | `nmap -sV -p 80,443 192.168.1.10` |
| Web ports (80/443/8080) | `nikto`, `gobuster` | `nikto -h http://192.168.1.10` |
| SSH port found | `hydra`/`ncrack` | `hydra -l root -P wordlist.txt target ssh` |
| Database ports (3306/5432) | `hydra` for DB brute-force | `hydra -l root -P wordlist.txt target mysql` |
| Large number of hosts | Filter and prioritize | Focus on hosts with most open ports |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Network Disruption** | High rates can crash routers/firewalls |
| **Legal Issues** | Scanning without permission is illegal |
| **Detection** | Easily detected by IDS/IPS |

> **CRITICAL:** Always use `--rate` to limit speed. Default is too aggressive.

---

## Common Errors & Solutions
| Error | Cause | Solution |
|-------|-------|----------|
| `FAIL: failed to detect router` | No default route | Specify `--router-mac` |
| `Permissions denied` | Needs raw sockets | Run with `sudo` |

---

## Comparison with Nmap
| Aspect | Masscan | Nmap |
|--------|---------|------|
| Speed | Extremely fast | Moderate |
| Accuracy | Lower | Higher |
| Features | Port scan only | Full recon |
| Use Case | Large networks | Targeted scans |

> **Tip:** Use masscan for discovery, then nmap `-sV` on found ports.
