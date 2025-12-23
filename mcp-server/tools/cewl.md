# CeWL - Custom Word List Generator

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `cewl` |
| Category | Dictionary Generation, OSINT |
| Risk Level | Low |

## Description
CeWL (Custom Word List generator) spiders a target website and extracts unique words to create a custom wordlist tailored to the target organization.

---

## Usage Patterns

### 1. Basic Website Spider
**Goal:** Extract words from website.
```bash
cewl <url>
```
**Example:** `cewl http://target.com`

### 2. Set Depth
**Goal:** Spider multiple levels deep.
```bash
cewl -d <depth> <url>
```
**Example:** `cewl -d 3 http://target.com`

### 3. Minimum Word Length
**Goal:** Filter short words.
```bash
cewl -m <min_length> <url>
```
**Example:** `cewl -m 6 http://target.com`

### 4. Save to File
**Goal:** Output wordlist to file.
```bash
cewl -w <output_file> <url>
```

### 5. Extract Emails
**Goal:** Also harvest email addresses.
```bash
cewl -e -w words.txt --email_file emails.txt <url>
```

### 6. With Authentication
**Goal:** Spider authenticated pages.
```bash
cewl --auth_type basic --auth_user admin --auth_pass secret <url>
```

### 7. Include Numbers
**Goal:** Include words with numbers.
```bash
cewl --with-numbers <url>
```

### 8. Follow External Links
**Goal:** Spider offsite links too.
```bash
cewl --offsite <url>
```

---

## Important Options
| Flag | Description |
|------|-------------|
| `-d` | Depth to spider (default: 2) |
| `-m` | Minimum word length (default: 3) |
| `-w` | Output wordlist file |
| `-e` | Extract emails |
| `--email_file` | Email output file |
| `--with-numbers` | Accept words with numbers |
| `-c` | Show word count |
| `--lowercase` | Convert all to lowercase |
| `-a` | Include metadata from files |
| `--meta_file` | Metadata output file |
| `-u` | Custom User-Agent |
| `--proxy_host` | Proxy hostname |
| `--proxy_port` | Proxy port |

---

## Use Cases

### Password Wordlist for Company
```bash
cewl -d 3 -m 5 -w company_words.txt http://company.com
```

### Combined with Crunch for Variations
```bash
# Get base words
cewl -m 6 -w base.txt http://target.com

# Add common suffixes
for word in $(cat base.txt); do
    echo "${word}123"
    echo "${word}2024"
    echo "${word}!"
done >> custom_passwords.txt
```

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Traffic** | Deep spidering generates many requests |
| **Detection** | Crawler pattern may trigger alerts |

---

## Output
Default output: One word per line, sorted by frequency.

With `-c` flag: Shows count of each word.
```
15, company
12, services
8, contact
```

---

## Best Practices
1. Start with low depth (`-d 2`) and increase if needed
2. Use `-m 6` minimum to filter common words
3. Combine output with common password patterns
4. Useful for targeted attacks against specific organizations
