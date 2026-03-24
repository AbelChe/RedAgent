# Dirb - Web Content Scanner

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `dirb` |
| Category | Web Content Discovery |
| Risk Level | Low-Medium |

## Description
Dirb is a classic web content scanner that looks for existing (and hidden) web objects by launching a dictionary-based attack against a web server.

---

## Usage Patterns

### 1. Basic Directory Scan
**Goal:** Find hidden directories using default wordlist.
```bash
dirb <url>
```
**Example:** `dirb http://target.com`

### 2. Custom Wordlist
**Goal:** Use specific wordlist.
```bash
dirb <url> <wordlist>
```
**Example:**
```bash
dirb http://target.com /usr/share/wordlists/dirb/big.txt
```

### 3. With Extensions
**Goal:** Append extensions to each word.
```bash
dirb <url> -X .php,.html,.txt
```

### 4. Save Output
**Goal:** Log results to file.
```bash
dirb <url> -o results.txt
```

### 5. Authenticated Scan
**Goal:** Scan with HTTP Basic Auth.
```bash
dirb <url> -u username:password
```

### 6. Custom Cookie
**Goal:** Scan authenticated session.
```bash
dirb <url> -c "PHPSESSID=abc123"
```

### 7. Ignore Specific Codes
**Goal:** Skip certain HTTP responses.
```bash
dirb <url> -N 404
```

---

## Important Options
| Flag | Description |
|------|-------------|
| `-o` | Output file |
| `-X` | Extensions to append |
| `-u` | HTTP Basic Auth (user:pass) |
| `-c` | Cookie header |
| `-a` | Custom User-Agent |
| `-H` | Custom header |
| `-r` | Don't search recursively |
| `-z` | Delay between requests (ms) |
| `-N` | Ignore responses with this code |

---

## Common Wordlists (Parrot OS)
| Path | Description |
|------|-------------|
| `/usr/share/dirb/wordlists/common.txt` | Default common list |
| `/usr/share/dirb/wordlists/big.txt` | Large wordlist |
| `/usr/share/dirb/wordlists/vulns/` | Vulnerability-specific lists |

---

## Output Parsing

### Sample Output
```
-----------------
DIRB v2.22
By The Dark Raver
-----------------

START_TIME: Mon Jan 15 10:30:00 2024
URL_BASE: http://192.168.1.10/
WORDLIST_FILES: /usr/share/dirb/wordlists/common.txt

-----------------

GENERATED WORDS: 4614

---- Scanning URL: http://192.168.1.10/ ----
+ http://192.168.1.10/admin (CODE:301|SIZE:316)
+ http://192.168.1.10/cgi-bin/ (CODE:403|SIZE:278)
+ http://192.168.1.10/index.html (CODE:200|SIZE:11321)
+ http://192.168.1.10/server-status (CODE:403|SIZE:278)

---- Entering directory: http://192.168.1.10/admin/ ----
+ http://192.168.1.10/admin/index.html (CODE:200|SIZE:4521)
+ http://192.168.1.10/admin/login.php (CODE:200|SIZE:2103)

-----------------
END_TIME: Mon Jan 15 10:35:22 2024
DOWNLOADED: 9228 - FOUND: 6
```

### Parsing Rules
- `+ URL (CODE:xxx|SIZE:xxx)` = discovered resource
- CODE 200 = accessible; CODE 301 = redirect; CODE 403 = forbidden but exists
- `Entering directory:` = recursive scan into subdirectory
- `DOWNLOADED: N - FOUND: M` = summary (total requests vs findings)

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Login page found | `hydra` for brute-force | `hydra -l admin -P wordlist.txt target http-post-form "..."` |
| Admin panel found | `nikto` for vuln scan | `nikto -h http://target/admin/` |
| CGI directory found | Test for Shellshock | `nmap --script http-shellshock -p 80 target` |
| Server-status exposed | Direct access for info | `curl http://target/server-status` |
| Need faster scanning | Switch to `gobuster` | `gobuster dir -u http://target -w wordlist.txt -t 50` |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Detection** | Sequential requests easily detected |
| **Slow** | Single-threaded, slower than gobuster |

---

## Comparison with Gobuster
| Aspect | Dirb | Gobuster |
|--------|------|----------|
| Speed | Slow (single-threaded) | Fast (multi-threaded) |
| Recursion | Automatic | Manual |
| Output | Verbose | Clean |
| Use Case | Simple scans | Large-scale discovery |
