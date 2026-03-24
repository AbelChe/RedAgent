# curl - Command-Line HTTP Client

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `curl` |
| Category | Information Gathering, HTTP Requests |
| Risk Level | Low |

## Description
curl is a command-line tool for transferring data via URLs. It supports HTTP, HTTPS, FTP, and many other protocols. Commonly used for web interface testing, file downloads, API calls, and header inspection.

---

## Usage Patterns

### 1. Basic GET Request
**Goal:** Fetch a web page.
```bash
curl http://target.com
```

### 2. View Response Headers
**Goal:** Inspect server headers without downloading body.
```bash
curl -I http://target.com
```

### 3. POST Request
**Goal:** Send form data via POST.
```bash
curl -X POST -d "username=admin&password=123" http://target.com/login
```

### 4. JSON Request
**Goal:** Send JSON payload to an API.
```bash
curl -X POST -H "Content-Type: application/json" -d '{"key":"value"}' http://target.com/api
```

### 5. With Cookie
**Goal:** Send session cookies for authenticated requests.
```bash
curl -b "session=abc123" http://target.com/dashboard
```

### 6. Save Response to File
**Goal:** Download response body to disk.
```bash
curl -o output.html http://target.com
```

### 7. Follow Redirects
**Goal:** Automatically follow HTTP redirects.
```bash
curl -L http://target.com
```

### 8. Skip SSL Verification
**Goal:** Ignore certificate errors (test environments only).
```bash
curl -k https://target.com
```

---

## Common Options
| Option | Description |
|--------|-------------|
| `-I` | Fetch headers only (HEAD request) |
| `-X` | Specify HTTP method |
| `-d` | POST data |
| `-H` | Add request header |
| `-b` | Send cookies |
| `-c` | Save cookies to file |
| `-o` | Output to file |
| `-L` | Follow redirects |
| `-k` | Skip SSL certificate verification |
| `-v` | Verbose output (full request/response) |
| `-s` | Silent mode |
| `-u` | HTTP Basic Auth (user:pass) |
| `-A` | Custom User-Agent string |

> Standard text output is auto-persisted by ResultStore. For large downloads, use `-o curl/<filename>` to save to the workspace volume.

---

## Output Parsing

### Sample Output (Headers)
```
HTTP/1.1 200 OK
Date: Mon, 15 Jan 2024 10:30:00 GMT
Server: Apache/2.4.52 (Ubuntu)
Content-Type: text/html; charset=UTF-8
Set-Cookie: PHPSESSID=abc123; path=/
X-Powered-By: PHP/8.1.2
Content-Length: 4521
```

### Parsing Rules
- `-I` shows only response headers — look for `Server`, `Set-Cookie`, `X-Powered-By`
- `-v` shows full request/response including TLS handshake details
- `Server:` header reveals web server software and version
- `Set-Cookie:` reveals session handling (check for `httponly`, `secure` flags)
- Response body = HTML/JSON content for further analysis

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Server header revealed | `nikto` for vuln scan | `nikto -h http://target` |
| API endpoint found | `sqlmap` for injection | `sqlmap -u "http://target/api?id=1"` |
| Cookie without httponly | Document for reporting | N/A |
| Redirect chain found | Follow with `-L` | `curl -L http://target` |
| Login form found | `hydra` for brute-force | `hydra target http-post-form "..."` |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Credentials Exposure** | Avoid passing sensitive data in CLI arguments (visible in process list) |
| **SSL Bypass** | Using `-k` ignores certificate validation; only for test environments |
