# Nuclei - Fast Vulnerability Scanner

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `nuclei` |
| Category | Vulnerability Scanning |
| Risk Level | Medium |

## Description
Nuclei is a fast, template-based vulnerability scanner that uses YAML templates to define scanning rules. It supports large-scale concurrent scanning across multiple protocols and is widely used for automated security assessments.

---

## Usage Patterns

### 1. Basic Scan
**Goal:** Run a default scan against a single target.
```bash
nuclei -u http://target.com
```
**Example:** `nuclei -u http://192.168.1.10`

### 2. Bulk Target Scan
**Goal:** Scan multiple targets from a file.
```bash
nuclei -l targets.txt
```

### 3. Scan with Specific Templates
**Goal:** Run only specific template categories (e.g., known CVEs).
```bash
nuclei -u http://target.com -t cves/
```

### 4. Filter by Severity
**Goal:** Limit results to critical and high severity.
```bash
nuclei -u http://target.com -severity critical,high
```

### 5. Filter by Tags
**Goal:** Run templates matching specific tags (e.g., RCE, SQLi).
```bash
nuclei -u http://target.com -tags rce,sqli
```

### 6. Update Template Library
**Goal:** Download the latest community templates.
```bash
nuclei -update-templates
```

### 7. Output Results
**Goal:** Save results to file in text or JSON format.
```bash
nuclei -u http://target.com -o results.txt
nuclei -u http://target.com -json -o results.json
```

### 8. Rate Limiting and Concurrency
**Goal:** Control scan speed to avoid overwhelming targets.
```bash
nuclei -u http://target.com -c 10 -rl 50
```
- `-c`: Concurrent templates to execute
- `-rl`: Maximum requests per second

---

## Common Options
| Option | Description |
|--------|-------------|
| `-u` | Single target URL |
| `-l` | File containing target URLs |
| `-t` | Template path or directory |
| `-tags` | Filter templates by tag |
| `-severity` | Filter by severity level |
| `-c` | Number of concurrent templates |
| `-rl` | Rate limit (requests/second) |
| `-o` | Output file path |
| `-json` | Enable JSON output |
| `-silent` | Silent mode (findings only) |
| `-update-templates` | Update templates to latest |

---

## Severity Levels
- `info` — Informational (service detection, technology fingerprinting)
- `low` — Low risk (minor misconfigurations, information disclosure)
- `medium` — Medium risk (significant misconfigurations, potential data exposure)
- `high` — High risk (exploitable vulnerabilities, default credentials)
- `critical` — Critical risk (remote code execution, authentication bypass)

---

## Output Parsing

### Sample Output
```
[2024-01-15 10:45:32] [apache-detect] [http] [info] http://192.168.1.10:80 [Apache/2.4.52]
[2024-01-15 10:45:33] [tech-detect:php] [http] [info] http://192.168.1.10:80
[2024-01-15 10:45:35] [cve-2021-44228] [http] [critical] http://192.168.1.10:8080 [Apache Log4j RCE]
[2024-01-15 10:45:36] [git-config] [http] [medium] http://192.168.1.10:80/.git/config
[2024-01-15 10:45:38] [default-login:tomcat] [http] [high] http://192.168.1.10:8080/manager [tomcat:tomcat]
```

### Parsing Rules
- **Format:** `[timestamp] [template-id] [protocol] [severity] url [extra-info]`
- **Severity levels:** `info`, `low`, `medium`, `high`, `critical`
- **Extra info in brackets** = matched data (version, credentials, CVE details)
- **JSON output** (`-json`) returns structured objects with full template metadata including template ID, name, author, severity, matched-at URL, extracted data, and timestamps.

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Critical/High CVEs | `msfconsole` for exploitation | `search cve:2021-44228` |
| Default credentials found | Manual verification, `curl` | `curl -u tomcat:tomcat http://target:8080/manager` |
| Exposed .git/config | `wget` for repo dump | `wget -r http://target/.git/` |
| Technology detected | `sqlmap` for injection testing | `sqlmap -u "http://target/page?id=1"` |
| Info-level findings | Document for reporting | N/A |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Traffic Volume** | Large-scale scans generate heavy request volume and may degrade services. |
| **WAF Detection** | Certain templates actively probe for vulnerabilities and will trigger WAF/IDS alerts. |

---

## Common Errors & Solutions
| Error | Cause | Solution |
|-------|-------|----------|
| `Could not find template` | Invalid template path | Run `nuclei -update-templates` |
| `context deadline exceeded` | Target not responding | Verify target reachability; increase `-timeout` |
| `rate limit exceeded` | Too many requests | Lower `-c` and `-rl` values |
| `no templates loaded` | Filters too narrow | Broaden `-tags` or `-severity` filters |
