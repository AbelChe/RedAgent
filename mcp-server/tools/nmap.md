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

> For structured output files, use `-oA nmap/<target>` to write XML/grepable/normal files to the workspace volume. Standard text output is auto-persisted by ResultStore.

---

## Output Parsing

### Sample Output
```
Starting Nmap 7.94 ( https://nmap.org ) at 2024-01-15 10:30 UTC
Nmap scan report for 192.168.1.10
Host is up (0.0032s latency).

PORT     STATE  SERVICE    VERSION
22/tcp   open   ssh        OpenSSH 8.9p1 Ubuntu 3ubuntu0.4 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey:
|   256 xx:xx:xx:xx (ECDSA)
|_  256 xx:xx:xx:xx (ED25519)
80/tcp   open   http       Apache httpd 2.4.52 ((Ubuntu))
|_http-title: Default Page
|_http-server-header: Apache/2.4.52 (Ubuntu)
443/tcp  open   ssl/http   Apache httpd 2.4.52
3306/tcp closed mysql
8080/tcp open   http-proxy

Nmap done: 1 IP address (1 host up) scanned in 12.34 seconds
```

### Parsing Rules
- Port table starts with `PORT` header line
- Extract columns: `PORT`, `STATE`, `SERVICE`, `VERSION`
- Open ports have `STATE = open`; closed/filtered ports are usually not interesting
- VERSION column → identify software for vulnerability lookups
- Script output (indented `|` lines) → additional info from NSE scripts
- `Nmap done:` line = scan summary

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Open HTTP/HTTPS ports | `nikto`, `gobuster`, `ffuf` | `nikto -h http://target:80` |
| Open SSH port | `hydra`, `ncrack`, `medusa` | `hydra -l root -P wordlist.txt target ssh` |
| Service versions found | `nuclei`, `msfconsole` | `nuclei -u http://target -severity critical,high` |
| Open SMB ports (445) | `msfconsole` | `use auxiliary/scanner/smb/smb_version` |
| Multiple hosts alive | `masscan` for wider port scan | `masscan <range> -p1-65535 --rate 1000` |
| OS detected | Document for reporting | N/A |

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
