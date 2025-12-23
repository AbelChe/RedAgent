# Gobuster - Directory/File Brute-forcer

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `gobuster` |
| Category | Web Content Discovery |
| Risk Level | Low-Medium |

## Description
Gobuster is a fast directory and file brute-forcing tool written in Go. It supports multiple modes including directory enumeration, DNS subdomain discovery, and virtual host discovery.

---

## Modes
| Mode | Flag | Purpose |
|------|------|---------|
| Directory | `dir` | Brute-force directories/files |
| DNS | `dns` | Subdomain enumeration |
| VHost | `vhost` | Virtual host discovery |
| FUZZ | `fuzz` | Generic fuzzing |

---

## Usage Patterns

### 1. Directory Brute-force
**Goal:** Find hidden directories and files.
```bash
gobuster dir -u <url> -w <wordlist>
```
**Example:**
```bash
gobuster dir -u http://target.com -w /usr/share/wordlists/dirb/common.txt
```

### 2. With Extensions
**Goal:** Find files with specific extensions.
```bash
gobuster dir -u <url> -w <wordlist> -x php,html,txt,bak
```

### 3. Authenticated Scan
**Goal:** Scan behind login.
```bash
gobuster dir -u <url> -w <wordlist> -c "SESSIONID=abc123"
```

### 4. DNS Subdomain Enumeration
**Goal:** Discover subdomains.
```bash
gobuster dns -d <domain> -w <wordlist>
```
**Example:**
```bash
gobuster dns -d target.com -w /usr/share/wordlists/subdomains.txt
```

### 5. VHost Discovery
**Goal:** Find virtual hosts on same IP.
```bash
gobuster vhost -u <url> -w <wordlist>
```

---

## Important Options
| Flag | Description |
|------|-------------|
| `-u` | Target URL |
| `-w` | Wordlist path |
| `-x` | File extensions to search |
| `-t` | Number of threads (default: 10) |
| `-s` | Positive status codes (default: 200,204,301,302,307,401,403) |
| `-b` | Negative status codes to skip |
| `-c` | Cookies for authentication |
| `-H` | Custom headers |
| `-k` | Skip TLS verification |
| `-o` | Output file |

---

## Common Wordlists (Parrot OS)
| Path | Description |
|------|-------------|
| `/usr/share/wordlists/dirb/common.txt` | Common directories |
| `/usr/share/wordlists/dirb/big.txt` | Large directory list |
| `/usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt` | DirBuster medium |
| `/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt` | SecLists directories |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Detection** | High request volume triggers WAF/IDS |
| **Rate Limiting** | Use `-t` to reduce threads |
| **Legal** | Only scan authorized targets |

---

## Common Errors & Solutions
| Error | Cause | Solution |
|-------|-------|----------|
| `invalid certificate` | Self-signed cert | Use `-k` flag |
| `connection refused` | Target down | Verify target is up |
| `too many open files` | Thread limit | Reduce `-t` value |

---

## Output Parsing
Output format: `/<path> (Status: <code>) [Size: <bytes>]`

Filter interesting results:
```bash
gobuster dir -u <url> -w <wordlist> -o results.txt
grep "Status: 200" results.txt
```
