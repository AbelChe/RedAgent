# ffuf - Fast Web Fuzzer

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `ffuf` |
| Category | Web Fuzzing, Content Discovery |
| Risk Level | Low-Medium |

## Description
ffuf (Fuzz Faster U Fool) is a fast web fuzzer written in Go. It's highly flexible and can fuzz any part of HTTP requests including URLs, headers, POST data, and more.

---

## Key Concepts
- `FUZZ` keyword: Placeholder replaced with wordlist entries
- Can place `FUZZ` anywhere in the request
- Supports multiple `FUZZ` keywords (e.g., `FUZZ1`, `FUZZ2`)

---

## Usage Patterns

### 1. Directory Discovery
**Goal:** Find hidden paths.
```bash
ffuf -u http://target.com/FUZZ -w <wordlist>
```
**Example:**
```bash
ffuf -u http://target.com/FUZZ -w /usr/share/wordlists/dirb/common.txt
```

### 2. File Discovery with Extensions
**Goal:** Find files with specific extensions.
```bash
ffuf -u http://target.com/FUZZ -w <wordlist> -e .php,.html,.txt
```

### 3. Subdomain Enumeration
**Goal:** Discover subdomains via Host header.
```bash
ffuf -u http://target.com -H "Host: FUZZ.target.com" -w <wordlist>
```

### 4. POST Parameter Fuzzing
**Goal:** Fuzz POST data.
```bash
ffuf -u http://target.com/login -X POST -d "username=admin&password=FUZZ" -w <wordlist>
```

### 5. Filter by Response Size
**Goal:** Hide responses of specific size.
```bash
ffuf -u http://target.com/FUZZ -w <wordlist> -fs 4242
```

### 6. Filter by Status Code
**Goal:** Only show specific codes.
```bash
ffuf -u http://target.com/FUZZ -w <wordlist> -mc 200,301
```

### 7. Filter by Words/Lines
**Goal:** Filter based on response content.
```bash
ffuf -u http://target.com/FUZZ -w <wordlist> -fw 12  # Filter by word count
ffuf -u http://target.com/FUZZ -w <wordlist> -fl 5   # Filter by line count
```

---

## Important Options
| Flag | Description |
|------|-------------|
| `-u` | Target URL with FUZZ keyword |
| `-w` | Wordlist |
| `-e` | Extensions to append |
| `-X` | HTTP method |
| `-d` | POST data |
| `-H` | Header (can use multiple) |
| `-t` | Threads (default: 40) |
| `-mc` | Match status codes |
| `-fc` | Filter status codes |
| `-ms` | Match response size |
| `-fs` | Filter response size |
| `-fw` | Filter word count |
| `-fl` | Filter line count |
| `-o` | Output file |
| `-of` | Output format (json, csv, html) |
| `-c` | Colorized output |

---

## Common Wordlists (Parrot OS)
| Path | Description |
|------|-------------|
| `/usr/share/seclists/Discovery/Web-Content/common.txt` | Common paths |
| `/usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt` | Medium directory list |
| `/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt` | Top subdomains |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **High Traffic** | Default 40 threads generates heavy load |
| **Detection** | May trigger WAF/rate limiting |

> **Tip:** Use `-t 10` and `-rate 100` for stealth.

---

## Output Parsing
JSON output (`-of json`) is recommended for parsing:
```bash
ffuf -u http://target.com/FUZZ -w wordlist.txt -o results.json -of json
```
