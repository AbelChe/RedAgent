# Nikto - Web Server Vulnerability Scanner

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `nikto` |
| Category | Web Vulnerability Scanning |
| Risk Level | Medium |

## Description
Nikto is an open-source web server scanner that checks for dangerous files, outdated software versions, misconfigured servers, and other security issues across thousands of known vulnerability signatures.

---

## Usage Patterns

### 1. Basic Scan
**Goal:** Run a default vulnerability scan against a web server.
```bash
nikto -h http://target.com
```

### 2. Specify Port
**Goal:** Scan a non-standard web port.
```bash
nikto -h target.com -p 8080
```

### 3. Multi-Port Scan
**Goal:** Scan multiple ports on the same host.
```bash
nikto -h target.com -p 80,443,8080
```

### 4. SSL Site Scan
**Goal:** Force SSL/TLS for the connection.
```bash
nikto -h https://target.com -ssl
```

### 5. Save Output
**Goal:** Write results to a file in a specific format.
```bash
nikto -h target.com -o report.html -Format htm
```

### 6. Use Proxy
**Goal:** Route scan through a proxy (e.g., Burp Suite).
```bash
nikto -h target.com -useproxy http://127.0.0.1:8080
```

### 7. With Cookie
**Goal:** Scan authenticated pages with session cookies.
```bash
nikto -h target.com -C "session=abc123"
```

---

## Common Options
| Option | Description |
|--------|-------------|
| `-h` | Target host |
| `-p` | Port(s) to scan |
| `-ssl` | Force SSL connection |
| `-o` | Output file |
| `-Format` | Output format (txt, html, csv, xml) |
| `-C` | Cookie header |
| `-id` | HTTP Basic Auth (user:pass) |
| `-useproxy` | Proxy server URL |
| `-Tuning` | Scan tuning (limit scan types) |
| `-update` | Update plugin database |

---

## Scan Tuning (-Tuning)
| Value | Description |
|-------|-------------|
| 1 | Interesting files |
| 2 | Misconfigurations |
| 3 | Information disclosure |
| 4 | Injection vulnerabilities |
| 5 | Remote file retrieval |
| 6 | Denial of service |
| 7 | Remote shell |
| 8 | Command execution |
| 9 | SQL injection |
| 0 | File upload |

---

## Output Parsing

### Sample Output
```
- Nikto v2.5.0
---------------------------------------------------------------------------
+ Target IP:          192.168.1.10
+ Target Hostname:    target.com
+ Target Port:        80
+ Start Time:         2024-01-15 10:30:00 (GMT0)
---------------------------------------------------------------------------
+ Server: Apache/2.4.52 (Ubuntu)
+ /: The anti-clickjacking X-Frame-Options header is not present.
+ /: The X-Content-Type-Options header is not set.
+ /icons/README: Apache default file found.
+ /login.php: Cookie PHPSESSID created without the httponly flag.
+ /admin/: Directory indexing found.
+ /config.php.bak: PHP config backup file found. May contain database credentials.
+ /.git/HEAD: Git repository found.
+ 8102 requests: 0 error(s) and 7 item(s) reported on remote host
+ End Time:           2024-01-15 10:35:22 (GMT0) (322 seconds)
---------------------------------------------------------------------------
```

### Parsing Rules
- Lines starting with `+` = findings (each is a potential vulnerability or misconfiguration)
- `Server:` = web server identification and version
- Items count at end = total findings summary
- `error(s)` count indicates connection issues during scan
- Use `-Format xml` for machine-parseable output

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Server version identified | `nuclei` for CVE checks | `nuclei -u http://target -tags apache` |
| Directory indexing found | `gobuster`/`ffuf` for deeper enum | `gobuster dir -u http://target/admin/ -w wordlist.txt` |
| Backup files found (.bak) | `curl`/`wget` to download | `curl http://target/config.php.bak` |
| Git repository exposed | `wget` to dump repo | `wget -r http://target/.git/` |
| Missing security headers | Document for reporting | N/A |
| Login pages found | `hydra` for brute-force | `hydra -l admin -P wordlist.txt target http-post-form "..."` |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Detection** | Scan traffic has well-known signatures; easily blocked by WAF. |
| **Legal** | Unauthorized scanning is illegal. |

> **Warning:** Only scan targets with explicit written authorization.

---

## Common Errors & Solutions
| Error | Cause | Solution |
|-------|-------|----------|
| `ERROR: Cannot resolve hostname` | DNS resolution failure | Verify hostname or use IP address |
| `Connection refused` | Target port not open | Verify port with `nmap` first |
| `SSL handshake failure` | TLS version mismatch | Try `-ssl` flag or check certificate |
