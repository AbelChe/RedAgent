# execute_command - Generic Command Executor

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | various |
| Category | Generic Execution |
| Risk Level | High |

## Description

The `execute_command` tool is a generic command executor that runs any penetration testing command inside an isolated Docker container. Commands are automatically routed to the appropriate container based on the `containers.yaml` configuration.

The platform follows a **two-tier tool model**:

| Tier | Example | Schema | Risk | Approval |
|------|---------|--------|------|----------|
| **Tier 1 — Specialized tools** | `nmap_scan` | Constrained (typed parameters) | Lower | Not required |
| **Tier 2 — `execute_command`** | `execute_command("nmap -sV ...")` | Free-form (raw command string) | Higher | Required (`destructiveHint: true`) |

Tier 1 tools expose a narrow, validated interface for the most common operations (e.g., `nmap_scan` accepts `target`, `ports`, `scan_type`). When a task falls outside a specialized tool's schema — uncommon flags, chained commands, or tools without a dedicated wrapper — `execute_command` serves as the universal fallback.

---

## Routing Rules

When `execute_command` receives a command, the container is resolved in the following order:

1. **Tool-specific configuration** — If `containers.yaml` defines a container for the detected binary, that container is used.
2. **Default container** — If no tool-specific entry exists, the platform's configured default container is used.
3. **Shared sandbox fallback** — If no default is configured, the command runs in a shared sandbox container.

> All commands execute inside Docker containers for isolation. The host system is never directly exposed.

---

## Supported Tools

The following tools are registered in `containers.yaml` and automatically routed to their designated container images:

| Tool | Container Image | Category | Doc Reference |
|------|----------------|----------|---------------|
| nmap | `parrotsec/security:7.0` | Port Scanning | `usage-nmap` |
| masscan | `parrotsec/security:7.0` | Port Scanning | `usage-masscan` |
| gobuster | `parrotsec/security:7.0` | Web Content Discovery | `usage-gobuster` |
| dirb | `parrotsec/security:7.0` | Web Content Discovery | `usage-dirb` |
| ffuf | `parrotsec/security:7.0` | Fuzzing | `usage-ffuf` |
| crunch | `parrotsec/security:7.0` | Wordlist Generation | `usage-crunch` |
| cewl | `parrotsec/security:7.0` | Wordlist Generation | `usage-cewl` |
| hydra | `parrotsec/security:7.0` | Credential Brute-forcing | `usage-hydra` |
| medusa | `parrotsec/security:7.0` | Credential Brute-forcing | `usage-medusa` |
| ncrack | `parrotsec/security:7.0` | Credential Brute-forcing | `usage-ncrack` |
| python / python3 | `python:3.11-slim` | Data Analysis | `usage-python` |
| msfconsole | `metasploitframework/metasploit-framework:6.4.0` | Exploitation | `usage-msfconsole` |
| msfvenom | `metasploitframework/metasploit-framework:6.4.0` | Payload Generation | `usage-msfvenom` |
| curl | `parrotsec/security:7.0` | HTTP Utility | `usage-curl` |
| wget | `parrotsec/security:7.0` | HTTP Utility | `usage-wget` |
| whois | `parrotsec/security:7.0` | Information Gathering | `usage-whois` |
| dig | `parrotsec/security:7.0` | DNS Lookup | `usage-dig` |
| nikto | `parrotsec/security:7.0` | Web Vulnerability Scanning | `usage-nikto` |
| sqlmap | `parrotsec/security:7.0` | SQL Injection | `usage-sqlmap` |
| nuclei | `projectdiscovery/nuclei:v3.6.2` | Vulnerability Scanning | `usage-nuclei` |

---

## Usage Examples

### Port Scan
```bash
execute_command("nmap -sV -sC 192.168.1.1")
```

### Directory Brute-force
```bash
execute_command("gobuster dir -u http://target.com -w /usr/share/wordlists/dirb/common.txt")
```

### SQL Injection Test
```bash
execute_command("sqlmap -u 'http://target.com/page?id=1' --batch --dbs")
```

---

## Output Handling

ResultStore automatically captures stdout from every command execution and persists the output to disk:

- **Save path:** `workspace_data/results/<tool>/<tool>_<timestamp>.txt`

The return behavior depends on the size of the output:

| Output Size | Returned Content | File Path |
|-------------|-----------------|-----------|
| **> 4 KB** | Preview (first 40 lines + last 10 lines) | Included |
| **≤ 4 KB** | Full output | Included |

When results are truncated, use the `read_file` tool with the returned file path to access the complete output.

---

## Safety Warnings

| Concern | Detail |
|---------|--------|
| **Approval required** | `execute_command` is marked with `destructiveHint: true`. Every invocation requires explicit user approval before execution. |
| **Container isolation** | All commands run inside ephemeral Docker containers. Containers are destroyed after execution; no persistent state leaks to the host. |
| **Shell syntax detection** | Commands containing shell syntax (pipes `\|`, redirects `>`, command chaining `&&`) are automatically detected and wrapped in `/bin/sh -c` for correct execution. |
| **Authorized targets only** | Only scan targets that you have explicit written authorization to test. Unauthorized scanning is illegal and unethical. |
