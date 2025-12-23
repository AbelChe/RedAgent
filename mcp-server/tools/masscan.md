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

**Recommended:** `-oJ -` for JSON to stdout.

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
