# whois - Domain/IP Information Lookup

## Overview
| Attribute | Value |
|-----------|-------|
| Binary | `whois` |
| Category | Information Gathering, OSINT |
| Risk Level | Low |

## Description
whois queries domain registration information, IP address ownership, and network block details. It is a fundamental tool in the reconnaissance phase of penetration testing.

---

## Usage Patterns

### 1. Query Domain Information
**Goal:** Look up domain registration details.
```bash
whois target.com
```

### 2. Query IP Information
**Goal:** Find IP address ownership and network block.
```bash
whois 8.8.8.8
```

### 3. Specify WHOIS Server
**Goal:** Query a specific WHOIS registry server.
```bash
whois -h whois.verisign-grs.com target.com
```

---

## Common Options
| Option | Description |
|--------|-------------|
| `-h` | Specify WHOIS server |
| `-p` | Specify port |

---

## Output Parsing

### Sample Output (Domain)
```
   Domain Name: TARGET.COM
   Registry Domain ID: 12345678_DOMAIN_COM-VRSN
   Registrar WHOIS Server: whois.registrar.com
   Registrar URL: http://www.registrar.com
   Updated Date: 2023-06-15T12:00:00Z
   Creation Date: 2010-03-20T08:00:00Z
   Registry Expiry Date: 2025-03-20T08:00:00Z
   Registrar: Example Registrar Inc.
   Name Server: NS1.EXAMPLE.COM
   Name Server: NS2.EXAMPLE.COM
   DNSSEC: unsigned
```

### Key Fields
- `Registrar:` = domain registrar
- `Creation Date:` = domain age (older = more established)
- `Registry Expiry Date:` = renewal date
- `Name Server:` = DNS infrastructure
- `Registrant:` = owner info (may be privacy-protected)
- For IP queries, look for `NetRange`, `OrgName`, `CIDR`

---

## Next Steps

| Finding | Recommended Next Tool | Example |
|---------|----------------------|---------|
| Name servers found | `dig` for DNS enum | `dig @ns1.example.com target.com AXFR` |
| Registrant email found | OSINT research | Document for social engineering |
| IP range (CIDR) found | `masscan`/`nmap` to scan range | `masscan 192.168.1.0/24 -p1-65535` |
| Domain age known | Document for reporting | N/A |

---

## Safety Warnings
| Risk | Description |
|------|-------------|
| **Passive** | WHOIS is passive reconnaissance — does not alert the target. |
| **Privacy Protection** | Many domains use privacy services that hide registrant details. |
