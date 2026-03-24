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

> Standard text output is auto-persisted by ResultStore. For file output, use `-o gobuster/<filename>` to save to the workspace volume.

---

## Common Wordlists (Parrot OS)
| Path | Description |
|------|-------------|
| `/usr/share/wordlists/dirb/common.txt` | Common directories |
| `/usr/share/wordlists/dirb/big.txt` | Large directory list |
| `/usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt` | DirBuster medium |
| `/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt` | SecLists directories |

---

## Output Parsing

### Sample Output
```
===============================================================
Gobuster v3.6
by OJ Reeves (@TheColonial) & Christian Mehlmauer (@firefart)
===============================================================
[+] Url:                     http://192.168.1.10
[+] Method:                  GET
[+] Threads:                 10
[+] Wordlist:                /usr/share/wordlists/dirb/common.txt
[+] Status codes:            200,204,301,302,307,401,403
===============================================================
Starting gobuster in directory enumeration mode
===============================================================
/.htaccess            (Status: 403) [Size: 278]
/.htpasswd            (Status: 403) [Size: 278]
/admin                (Status: 301) [Size: 316] [--> http://192.168.1.10/admin/]
/api                  (Status: 301) [Size: 314] [--> http://192.168.1.10/api/]
/backup               (Status: 200) [Size: 1024]
/config               (Status: 403) [Size: 278]
/login                (Status: 200) [Size: 4521]
/uploads              (Status: 301) [Size: 318] [--> http://192.168.1.10/uploads/]

===============================================================
Finished
===============================================================
```

### Parsing Rules
- Format: `/<path> (Status: <code>) [Size: <bytes>] [--> <redirect>]`
- Status 200 = accessible content, investigate further
- Status 301/302 = redirect, follow the `-->` URL
- Status 403 = forbidden but exists, may be accessible with auth
- Status 401 = requires authentication
- Size helps distinguish real pages from error pages (filter identical sizes)

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Login page found | `hydra` for brute-force | `hydra -l admin -P wordlist.txt target http-post-form "..."` |
| API directory found | `ffuf` for API fuzzing | `ffuf -u http://target/api/FUZZ -w api-wordlist.txt` |
| Admin panel found | `nikto` for deeper scan | `nikto -h http://target/admin/` |
| Upload directory | Test file upload vuln | `curl -F "file=@shell.php" http://target/uploads/` |
| Backup files found | `curl`/`wget` to download | `curl http://target/backup -o backup.zip` |

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
