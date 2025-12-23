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
