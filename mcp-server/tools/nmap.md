# Nmap - Network Mapper

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `nmap` |
| Category | Port Scanning, Service Detection |
| Risk Level | Low-Medium |

## Description
Nmap is the industry-standard network scanner for host discovery, port scanning, service/version detection, and OS fingerprinting.

---

## Usage Patterns

### 1. Host Discovery (Ping Sweep)
**Goal:** Identify live hosts in a subnet.
```bash
nmap -sn <target_range>
```
**Example:** `nmap -sn 192.168.1.0/24`

### 2. Fast Port Scan (Top 100 Ports)
**Goal:** Quick scan for common open ports.
```bash
nmap -F <target>
```

### 3. Full Port Scan (All 65535 Ports)
**Goal:** Comprehensive port enumeration.
```bash
nmap -p- -T4 <target>
```
> **Note:** Use `-T4` to speed up. This scan is slow.

### 4. Service & Version Detection
**Goal:** Identify running services and versions.
```bash
nmap -sV -sC <target>
```
- `-sV`: Version detection
- `-sC`: Default NSE scripts

### 5. OS Detection
**Goal:** Fingerprint operating system.
```bash
nmap -O <target>
```
> **Requires root/sudo privileges.**

### 6. Aggressive Scan (Full Recon)
**Goal:** Complete enumeration in one command.
```bash
nmap -A -T4 <target>
```
> Combines `-sV`, `-sC`, `-O`, and traceroute.

### 7. Vulnerability Scan
**Goal:** Check for known vulnerabilities.
```bash
nmap --script vuln <target>
```

### 8. Stealth SYN Scan
**Goal:** Evade basic detection.
```bash
nmap -sS <target>
```
> **Requires root/sudo privileges.**

---

## Output Formats
| Flag | Format | Use Case |
|------|--------|----------|
| `-oN` | Normal | Human-readable |
| `-oG` | Grepable | Quick parsing with grep/awk |
| `-oX` | XML | Machine parsing, report tools |
| `-oA` | All | Saves all 3 formats |

**Recommended:** Use `-oG -` for inline grepable output.

---

## Safety Warnings
| Option | Risk | Notes |
|--------|------|-------|
| `-Pn` | Medium | Skips host discovery, may scan unintended hosts |
| `-T5` | High | Extremely aggressive, may crash weak targets |
| `--script` | Variable | Some NSE scripts are intrusive |

---

## Common Errors & Solutions
| Error | Cause | Solution |
|-------|-------|----------|
| `Host seems down` | ICMP blocked | Use `-Pn` to skip ping |
| `Permission denied` | SYN/OS scan needs root | Run with `sudo` |
| `Note: Host is up (latency)` | Normal | Target is reachable |

---

## Parsing Tips
- Port table starts with `PORT` header line
- Extract columns: `PORT`, `STATE`, `SERVICE`, `VERSION`
- Open ports have `STATE = open`
