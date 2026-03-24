# Crunch - Wordlist Generator

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `crunch` |
| Category | Dictionary Generation |
| Risk Level | None |

## Description
Crunch is a wordlist generator that creates custom wordlists based on specified criteria such as character sets, patterns, and length ranges.

---

## Basic Syntax
```bash
crunch <min_length> <max_length> [charset] [options]
```

---

## Usage Patterns

### 1. Basic Wordlist (Lowercase)
**Goal:** Generate all lowercase combinations.
```bash
crunch 4 4 abcdefghijklmnopqrstuvwxyz
```

### 2. Numeric Wordlist
**Goal:** Generate all 4-digit PINs.
```bash
crunch 4 4 0123456789 -o pins.txt
```

### 3. Mixed Character Set
**Goal:** Alphanumeric combinations.
```bash
crunch 6 8 abcdefghijklmnopqrstuvwxyz0123456789
```

### 4. Using Character Set Files
**Goal:** Use predefined character sets.
```bash
crunch 4 6 -f /usr/share/crunch/charset.lst mixalpha-numeric
```

### 5. Pattern-Based Generation
**Goal:** Generate words matching a pattern.
```bash
crunch 8 8 -t @@@@%%%%
```
Pattern symbols:
- `@` = lowercase letter
- `,` = uppercase letter
- `%` = number
- `^` = special character

**Example:** `crunch 8 8 -t admin%%%` generates `admin000` to `admin999`

### 6. Start/End Words
**Goal:** Resume or limit generation.
```bash
crunch 4 4 0123456789 -s 5000 -e 6000
```

### 7. Pipe to Tool (No File)
**Goal:** Stream directly to hydra.
```bash
crunch 4 4 0123456789 | hydra -l admin -P - <target> ssh
```

---

## Important Options
| Flag | Description |
|------|-------------|
| `-o` | Output file |
| `-t` | Pattern template |
| `-f` | Charset file |
| `-s` | Start word |
| `-e` | End word |
| `-b` | Split output by size (e.g., `1mb`) |
| `-c` | Number of lines per file |
| `-d` | Limit duplicate characters |
| `-p` | Permutation mode (no repeat) |

---

## Character Set File
Default location: `/usr/share/crunch/charset.lst`

Common sets:
| Name | Characters |
|------|------------|
| `numeric` | 0-9 |
| `lalpha` | a-z |
| `ualpha` | A-Z |
| `mixalpha` | a-z + A-Z |
| `mixalpha-numeric` | a-z + A-Z + 0-9 |
| `mixalpha-numeric-all-space` | All printable + space |

---

## Output Parsing

### Sample Output
```
Crunch will now generate the following amount of data: 50000 bytes
0 MB
0 GB
0 TB
0 PB
Crunch will now generate the following number of lines: 10000

aaaa
aaab
aaac
...
```

### Parsing Rules
- Header shows estimated data size and line count
- Output is one word per line
- Pipe directly to tools: `crunch ... | hydra -l admin -P - target ssh`
- `-o` saves to file instead of stdout

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Wordlist generated | `hydra` for brute-force | `hydra -l admin -P wordlist.txt target ssh` |
| PIN list generated | `hydra` for PIN testing | `hydra -l admin -P pins.txt target http-post-form "..."` |
| Custom patterns made | `medusa`/`ncrack` | `medusa -h target -u admin -P custom.txt -M ssh` |
| Wordlist too large | Narrow with `-s`/`-e` or pattern | `crunch 8 8 -t admin%%%` |

---

## Safety Warnings
| Warning | Description |
|---------|-------------|
| **Disk Space** | Large wordlists consume gigabytes |
| **Time** | Long combinations take hours/days |

> **Tip:** Calculate size first: `crunch 8 8 -c 0` shows count without generating.

---

## Size Estimation
| Length | Charset Size | Combinations |
|--------|--------------|--------------|
| 4 | 26 (a-z) | 456,976 |
| 6 | 26 (a-z) | 308,915,776 |
| 8 | 36 (a-z0-9) | 2,821,109,907,456 |

> **Warning:** 8-char alphanumeric = ~2.8 trillion combinations = ~25TB file!
