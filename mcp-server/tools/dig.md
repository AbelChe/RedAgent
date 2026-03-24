# dig - DNS Query Tool

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `dig` |
| Category | Information Gathering, DNS Enumeration |
| Risk Level | Low |

## Description
dig (Domain Information Groper) is a flexible DNS query tool used to look up DNS records, debug DNS issues, and enumerate DNS infrastructure during reconnaissance.

---

## Usage Patterns

### 1. Query A Record
**Goal:** Resolve a domain to its IP address(es).
```bash
dig target.com
```

### 2. Query Specific Record Types
**Goal:** Look up different DNS record types.
```bash
dig target.com MX      # Mail servers
dig target.com NS      # Name servers
dig target.com TXT     # TXT records (SPF, DKIM)
dig target.com CNAME   # Alias records
dig target.com SOA     # Start of Authority
dig target.com ANY     # All records
```

### 3. Specify DNS Server
**Goal:** Query a specific resolver instead of the system default.
```bash
dig @8.8.8.8 target.com
```

### 4. Reverse DNS Lookup
**Goal:** Find the hostname for an IP address.
```bash
dig -x 8.8.8.8
```

### 5. Short Output
**Goal:** Get only the answer values (concise output).
```bash
dig target.com +short
```

### 6. Trace DNS Resolution Path
**Goal:** Follow the full DNS resolution chain from root servers.
```bash
dig target.com +trace
```

### 7. Zone Transfer (AXFR)
**Goal:** Attempt to dump all DNS records from a nameserver.
```bash
dig @ns1.target.com target.com AXFR
```
> **Note:** Most servers disable AXFR; success reveals all subdomains.

---

## Common Options
| Option | Description |
|--------|-------------|
| `@server` | Specify DNS server |
| `-x` | Reverse lookup (IP → hostname) |
| `+short` | Concise output (answer values only) |
| `+trace` | Trace resolution path |
| `+noall +answer` | Show only the answer section |
| `-t` | Specify record type |

---

## Output Parsing

### Sample Output
```
; <<>> DiG 9.18.18 <<>> target.com
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345
;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1

;; ANSWER SECTION:
target.com.          300     IN      A       192.168.1.10
target.com.          300     IN      A       192.168.1.11

;; Query time: 15 msec
;; SERVER: 8.8.8.8#53(8.8.8.8)
;; WHEN: Mon Jan 15 10:30:00 UTC 2024
;; MSG SIZE  rcvd: 72
```

### Parsing Rules
- `ANSWER SECTION:` contains the DNS records
- `status: NOERROR` = successful query; `NXDOMAIN` = domain not found
- `+short` flag gives only the answer values (IPs, hostnames)
- Multiple A records may indicate load balancing or CDN
- `300` (second column) = TTL in seconds

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| IP addresses resolved | `nmap` for port scan | `nmap -sV 192.168.1.10` |
| MX records found | Check mail security | `nmap -p 25,465,587 mail.target.com` |
| NS records found | Zone transfer attempt | `dig @ns1.target.com target.com AXFR` |
| Multiple IPs (CDN) | `bee_addr_query` for CDN check | Use bee_addr_query tool |
| TXT records (SPF/DKIM) | Document for reporting | N/A |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Passive** | DNS queries are passive reconnaissance — generally do not alert the target. |
| **AXFR** | Zone transfers are more intrusive and may be logged by the nameserver. |
