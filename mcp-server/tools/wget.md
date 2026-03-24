# wget - Network File Download Tool

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `wget` |
| Category | Information Gathering, File Download |
| Risk Level | Low |

## Description
wget is a non-interactive network download tool supporting HTTP, HTTPS, and FTP protocols. It supports recursive downloads, resume capability, and background operation. Commonly used for downloading files, mirroring websites, and retrieving exposed resources.

---

## Usage Patterns

### 1. Download a File
**Goal:** Download a single file from a URL.
```bash
wget http://target.com/file.zip
```

### 2. Custom Output Filename
**Goal:** Save with a specific filename.
```bash
wget -O custom_name.zip http://target.com/file.zip
```

### 3. Resume Interrupted Download
**Goal:** Continue a partially downloaded file.
```bash
wget -c http://target.com/large_file.zip
```

### 4. Background Download
**Goal:** Download in the background.
```bash
wget -b http://target.com/file.zip
```

### 5. Recursive Download
**Goal:** Spider and download a website recursively.
```bash
wget -r -l 3 http://target.com
```
- `-r`: Enable recursive download
- `-l 3`: Limit depth to 3 levels

### 6. Mirror Entire Website
**Goal:** Create a local copy of a website.
```bash
wget --mirror -p --convert-links http://target.com
```

### 7. Skip SSL Certificate Verification
**Goal:** Download from sites with invalid certificates.
```bash
wget --no-check-certificate https://target.com
```

### 8. Rate-Limited Download
**Goal:** Limit download speed to avoid detection.
```bash
wget --limit-rate=100k http://target.com/file.zip
```

---

## Common Options
| Option | Description |
|--------|-------------|
| `-O` | Specify output filename |
| `-c` | Resume interrupted download |
| `-b` | Run in background |
| `-r` | Recursive download |
| `-l` | Recursion depth limit |
| `-p` | Download page prerequisites (CSS, images) |
| `--mirror` | Mirror mode (recursive + timestamps) |
| `-q` | Quiet mode |
| `--limit-rate` | Limit download speed |
| `--no-check-certificate` | Skip SSL verification |

---

## Output Parsing

### Sample Output
```
--2024-01-15 10:30:00--  http://target.com/file.zip
Resolving target.com... 192.168.1.10
Connecting to target.com|192.168.1.10|:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 1048576 (1.0M) [application/zip]
Saving to: 'file.zip'

file.zip            100%[===================>]   1.00M  5.00MB/s    in 0.2s

2024-01-15 10:30:01 (5.00 MB/s) - 'file.zip' saved [1048576/1048576]
```

### Parsing Rules
- Status code appears in `HTTP request sent, awaiting response...` line
- `Length:` = file size and MIME type
- Progress bar shows download progress
- Final summary shows speed and saved byte count
- Recursive downloads log each file individually

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Website mirrored | Manual analysis, `grep` | Search downloaded files for credentials |
| Backup files downloaded | `python3` to parse | `python3 -c "print(open('config.bak').read())"` |
| Git repo dumped | Git tools to extract | `git log`, `git show` on dumped repo |
| Sensitive files found | Document for reporting | N/A |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Disk Space** | Recursive downloads can consume large amounts of storage |
| **Detection** | Mirror mode may trigger target defense mechanisms |
| **Legal** | Only download from authorized targets |
