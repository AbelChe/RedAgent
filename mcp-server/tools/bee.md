# Bee Security Scan Platform - Async Reconnaissance Suite

## Overview
| Attribute | Value |
|-----------|-------|
| Platform | Bee Security Scan |
| Executor | Native (HTTP API) |
| Category | Reconnaissance |
| Risk Level | Low-Medium |
| Async Pattern | Fire-and-Forget + Polling |

## Description
Bee is an async security scanning platform built on Temporal workflows. It provides large-scale reconnaissance capabilities including company asset discovery, cyberspace search engine queries, port scanning, web vulnerability scanning, web fingerprint identification, DNS resolution, and host/service discovery.

All scan operations are **asynchronous**. You submit a scan request and receive a `task_id`, then poll for status until results are ready. Results are stored in OSS (Object Storage Service) and must be fetched separately.

---

## Architecture

From the Agent's perspective, Bee is a black-box async task system accessed entirely through MCP Tools:

```
Agent
  │
  ├── bee_scan(scan_type, targets)      → Submit task, get task_id
  │
  ├── bee_status(scan_type, task_id)    → Poll progress, get OSS links when done
  │
  ├── bee_fetch_result(oss_links)       → Download actual scan data
  │
  └── Auxiliary tools:
        bee_verify_unit / bee_icp_query / bee_addr_query → Pre-scan intelligence
```

- **MCP Tools** are the ONLY interface the Agent uses. All task submission, status polling, and result retrieval are handled through these tool calls.
- **Bee Platform** (internal) handles task scheduling, distributed execution, and result storage — the Agent does not need to manage or understand these internals.
- **Results** are stored as JSON in OSS (Object Storage). The status response provides OSS links, which must be fetched via `bee_fetch_result` to obtain actual data.

---

## Complete Workflow

```
1. bee_workers(scan_type)         → Check alive workers & capacity
2. bee_scan(scan_type, targets)   → Start async scan, get task_id + workflow_ids
3. bee_status(scan_type, task_id) → Poll until completed (check Summary.result_oss_links)
4. bee_fetch_result(oss_links)    → Download actual data from OSS
5. bee_cancel_scan(scan_type, task_id) → [Optional] Cancel running scans if needed
```

### Step-by-Step Agent Guidance

**Step 1: Check Worker Capacity (`bee_workers`)**
- ALWAYS call `bee_workers` before starting a scan.
- This returns the number of alive workers and their capacity for the given `scan_type`.
- If no workers are alive, do NOT submit a scan — inform the user that the service is unavailable.
- Note the worker count: you should set `max_concurrent` to be less than or equal to the available worker count.

**Step 2: Submit the Scan (`bee_scan`)**
- Provide the `scan_type` and `targets` array.
- Optionally set `max_concurrent` (must be ≤ worker count from Step 1).
- The response returns a `task_id` and a list of `workflow_ids`.
- Save the `task_id` — you need it for polling.

**Step 3: Poll for Status (`bee_status`)**
- Use the `task_id` from Step 2 to check progress.
- Poll at intervals appropriate for the scan type (see scan type docs below).
- Check the response fields: `completed`, `running`, `failed`, `total_workflows`.
- The scan is done when `completed + failed == total_workflows` (or `running == 0`).
- **Critical:** The status response may contain OSS links in `Summary.result_oss_links` or similar fields — these are URLs, NOT inline data.

**Step 4: Fetch Results (`bee_fetch_result`)**
- Extract the OSS link URLs from the status response.
- Call `bee_fetch_result` with those links to download the actual scan data.
- The fetched data is the real scan output (JSON) containing discovered assets, ports, vulnerabilities, etc.
- Results are also persisted locally via ResultStore to `workspace_data/results/bee_<scan_type>/`.

> **Important:** The status response itself does NOT contain scan results inline. You MUST call `bee_fetch_result` with the OSS links to obtain the actual data.

---

## Scan Types

### company
| Attribute | Detail |
|-----------|--------|
| Purpose | Company asset discovery (ICP filing, subdomains, ports, associated assets) |
| Target Format | **Verified company full names** (from bee_verify_unit), e.g. `["北京百度网讯科技有限公司"]` |
| Estimated Duration | 10-30 minutes |
| Poll Interval | 3-5 minutes |
| Result OSS Fields | `resultOssLinks` (company asset data), `icpResultOssLinks` (ICP records) |

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `depth` | int | 1 | Query depth for subsidiary discovery (0-3). 0=self only, 1=direct subsidiaries, 2-3=recursive |
| `percent` | float | 0.51 | Shareholding threshold for subsidiaries (0.0-1.0). 0.51=only >51% holdings |
| `is_search_icp` | bool | false | Search ICP filing records via integrated API (**recommended: true**) |
| `is_icp_hi` | bool | true | Include ICP historical records |
| `is_search_wechat` | bool | false | Search WeChat official accounts |
| `is_supply` | bool | false | Collect supplier info (costs extra Tianyancha credits) |
| `is_bid` | bool | false | Collect bidding/procurement info (costs extra credits) |
| `max_concurrent` | int | 3 | Maximum concurrent workflows (1-10, ≤ worker count) |
| `priority` | int | 5 | Task priority (0-10) |
| `task_queue` | string | "prod-01" | Temporal task queue name |

**Notes:**
- Company scans are the most comprehensive and longest-running scan type.
- **Targets MUST be official registered company names** (typically in Chinese). Use `bee_verify_unit` to validate and standardize names before scanning.
- **Do NOT use abbreviations or informal names** - this will cause inaccurate results.
- A single company scan can discover dozens of domains, IPs, and web services.
- **ICP record collection is built-in:** When `is_search_icp` is enabled, the company scan automatically queries ICP filing records. You do NOT need to call `bee_icp_query` separately.
- Enabling `is_supply`, `is_bid` significantly increases Tianyancha API credit consumption.

---

### cyberspace
| Attribute | Detail |
|-----------|--------|
| Purpose | Cyberspace search engine query (FOFA, Shodan, Hunter, etc.) |
| Target Format | **Domains or public IPs**, e.g. `["baidu.com", "8.8.8.8"]` |
| Estimated Duration | 3-10 minutes |
| Poll Interval | 1-2 minutes |
| Result OSS Fields | `resultOssLinks`, `domainOssLinks`, `ipOssLinks`, `addressOssLinks` |

**Options:**
| Option | Type | Description |
|--------|------|-------------|
| `max_concurrent` | int | Maximum concurrent workflows (≤ worker count) |
| `priority` | int | Task priority |
| `task_queue` | string | Temporal task queue name |

**Notes:**
- **IMPORTANT**: Targets should be **domain names or public IP addresses**, NOT FOFA/Shodan query syntax like `org="company"`.
- The API automatically queries FOFA, Hunter, Quake and other cyberspace search engines using the provided domains/IPs.
- Returns rich data including subdomains, IP addresses, open ports, web technologies, and geographic information.
- Private IPs (10.x.x.x, 172.16.x.x, 192.168.x.x), loopback addresses (127.x.x.x), and other reserved addresses are NOT accepted.
- Result data is split across multiple OSS link categories:
  - `resultOssLinks` — primary search results
  - `domainOssLinks` — discovered domain names
  - `ipOssLinks` — discovered IP addresses
  - `addressOssLinks` — resolved address information

---

### port
| Attribute | Detail |
|-----------|--------|
| Purpose | Port scanning (masscan + nmap service detection) |
| Target Format | IPs or CIDRs, e.g. `["11.22.33.44"]` |
| Estimated Duration | 1-5 minutes |
| Poll Interval | 30 seconds |
| Result OSS Fields | `result_oss_links`, `web_server_oss_links` |

**Options:**
| Option | Type | Description |
|--------|------|-------------|
| `ports` | string | Port specification, e.g. `"top5"`, `"top100"`, `"1-1000"`, `"80,443,8080"` |
| `protocol` | string | Protocol to scan: `"tcp"` or `"udp"` |
| `max_concurrent` | int | Maximum concurrent workflows (≤ worker count) |
| `priority` | int | Task priority |
| `timeout` | int | Scan timeout in seconds |
| `task_queue` | string | Temporal task queue name |

**Notes:**
- Uses masscan for fast port discovery followed by nmap for service/version detection.
- `web_server_oss_links` contains identified web servers (HTTP/HTTPS services) — useful for follow-up `web` scans.
- Supports CIDR notation for scanning entire subnets.
- Use `"top5"` or `"top100"` for quick scans; use specific ranges for targeted scanning.

---

### web
| Attribute | Detail |
|-----------|--------|
| Purpose | Web vulnerability scanning |
| Target Format | URL,IP pairs, e.g. `["https://www.example.com,11.22.33.44"]` |
| Estimated Duration | 1-5 minutes |
| Poll Interval | 30 seconds |
| Result OSS Fields | `result_oss_links` |

**Options:**
| Option | Type | Description |
|--------|------|-------------|
| `batch_size` | int | Number of targets per batch |
| `max_concurrent` | int | Maximum concurrent workflows (≤ worker count) |
| `priority` | int | Task priority |
| `timeout` | int | Scan timeout in seconds |
| `task_queue` | string | Temporal task queue name |

**Notes:**
- Target format is `"URL,IP"` where the IP is the resolved address of the URL's host.
- The IP portion helps bypass CDN/WAF by connecting directly to the origin server.
- Use `bee_addr_query` to resolve domain IPs and detect CDN/WAF before constructing targets.
- Scans for common web vulnerabilities including XSS, SQL injection, SSRF, etc.

---

### web-finger
| Attribute | Detail |
|-----------|--------|
| Purpose | Web fingerprint identification (technology stack detection) |
| Target Format | URLs with optional IP, e.g. `["http://11.22.33.44:8088", "https://www.example.com:443,11.22.33.44"]` |
| Estimated Duration | 1-3 minutes |
| Poll Interval | 30 seconds |
| Result OSS Fields | `result_oss_links` |

**Options:**
| Option | Type | Description |
|--------|------|-------------|
| `batch_size` | int | Number of targets per batch |
| `max_concurrent` | int | Maximum concurrent workflows (≤ worker count) |
| `priority` | int | Task priority |
| `task_queue` | string | Temporal task queue name |

**Notes:**
- Identifies web technologies, frameworks, CMS platforms, server software, and other fingerprints.
- Accepts URLs with or without an associated IP address.
- When an IP is provided (comma-separated), the scanner connects directly to that IP.
- Useful for building a technology profile before targeted vulnerability scanning.

---

### domain
| Attribute | Detail |
|-----------|--------|
| Purpose | DNS resolution and subdomain enumeration |
| Target Format | Domain names, e.g. `["www.example.com", "www.target.com"]` |
| Estimated Duration | 30 seconds - 2 minutes |
| Poll Interval | 15 seconds |
| Result OSS Fields | `result_oss_links` |

**Options:**
| Option | Type | Description |
|--------|------|-------------|
| `custom_dns_server` | array | Custom DNS servers, e.g. `["8.8.8.8", "1.1.1.1"]` |
| `resolve_all` | bool | Resolve all DNS record types (A, AAAA, CNAME, MX, NS, TXT, etc.) |
| `max_concurrent` | int | Maximum concurrent workflows (≤ worker count) |
| `priority` | int | Task priority |
| `task_queue` | string | Temporal task queue name |

**Notes:**
- Resolves domain names to IP addresses and enumerates subdomains.
- Set `resolve_all: true` to get comprehensive DNS records beyond just A records.
- Custom DNS servers can be used to bypass local DNS filtering or compare results.
- Fast scan type — results typically available within 1-2 minutes.

---

### discovery
| Attribute | Detail |
|-----------|--------|
| Purpose | Host/service alive detection |
| Target Format | IPs or CIDRs, e.g. `["11.22.33.44", "55.66.77.88"]` |
| Estimated Duration | 30 seconds - 2 minutes |
| Poll Interval | 15 seconds |
| Result OSS Fields | Summary contains `alive_count` and `dead_count` |

**Options:**
| Option | Type | Description |
|--------|------|-------------|
| `timeout` | int | Discovery timeout in seconds |
| `discovery_mode` | string | Discovery mode, e.g. `"all"` |
| `discovery_ports` | array | Ports to probe for alive detection, e.g. `["80", "443", "22"]` |
| `max_concurrent` | int | Maximum concurrent workflows (≤ worker count) |
| `priority` | int | Task priority |
| `task_queue` | string | Temporal task queue name |

**Notes:**
- Determines which hosts are alive/reachable before deeper scanning.
- Results summary includes `alive_count` and `dead_count` directly in the status response.
- Use `discovery_mode: "all"` for comprehensive detection (ICMP + TCP + UDP probes).
- Useful as a pre-filter: run discovery first, then scan only alive hosts with `port` or `web`.

---

## Task Management Tools

### bee_cancel_scan
| Attribute | Detail |
|-----------|--------|
| Purpose | Cancel or force-terminate running scan workflows |
| Sync/Async | Synchronous (immediate response) |
| Added in | Bee API v1.5.1 |

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `scan_type` | string | The scan type (must match original bee_scan call) |
| `task_id` | string | Task ID returned by bee_scan |
| `reason` | string (optional) | Reason for cancellation (for audit/logging) |
| `force` | bool (optional) | `false` (default): graceful cancel, workflow can clean up. `true`: hard terminate, immediate stop, no cleanup. |

**Returns:**
| Field | Description |
|-------|-------------|
| `task_id` | The cancelled task's ID |
| `total_workflows` | Total workflows under this task |
| `cancelled` | Number successfully cancelled |
| `already_finished` | Number already completed/failed (no action needed) |
| `failed_to_cancel` | Number that failed to cancel |
| `workflows[]` | Per-workflow detail with `workflow_id`, `previous_status`, `cancel_success`, `message` |

**When to Use:**
- User requests to stop a running scan
- A scan is taking too long and you want to abort
- A scan was started with incorrect targets
- Use `force=true` only when graceful cancel fails or workflow appears stuck

**Usage Example:**
```
# Graceful cancel
bee_cancel_scan(scan_type="port", task_id="20260319-abc123")

# Force terminate (if graceful cancel didn't work)
bee_cancel_scan(scan_type="port", task_id="20260319-abc123", force=true, reason="Workflow stuck")
```

---

## IDN (Internationalized Domain Name) Support

Since Bee API v1.4.0, international domain names are automatically converted to ASCII Punycode format by the API server. This means you can pass Chinese, Japanese, Korean, or other non-ASCII domain names directly to scan targets:

```
bee_scan(scan_type="domain", targets=["百度.com", "テスト.jp"])
# API auto-converts to: ["xn--55qx5d.com", "xn--zckzah.jp"]
```

**Supported scan types:** domain, cyberspace, web, web-finger, netattrib

**Note:** Port scans only accept IPv4 addresses — IDN conversion does not apply.

---

## Auxiliary Tools

### bee_verify_unit
| Attribute | Detail |
|-----------|--------|
| Purpose | Validate and standardize company names before company scan |
| When to Use | BEFORE `bee_scan(scan_type="company")` |
| Sync/Async | Synchronous (immediate response) |

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `unit_name` | string | Company name to validate (can be partial or informal) |

**Returns:**
- Validated / standardized official company name
- Confidence score
- Alternative name suggestions (if ambiguous)
- Industry sector classification
- Basic company information (registration, status, etc.)

**Usage Flow:**
```
bee_verify_unit(unit_name="百度")
  → Returns: "北京百度网讯科技有限公司" (confidence: high)
  → Agent confirms with user
  → bee_scan(scan_type="company", targets=["北京百度网讯科技有限公司"])
```

> **Best Practice:** Always verify company names before running a company scan. Informal, abbreviated, or misspelled names will cause scan failures or incorrect results.

---

### bee_icp_query
| Attribute | Detail |
|-----------|--------|
| Purpose | Standalone ICP (Internet Content Provider) filing record lookup |
| Sync/Async | Mixed — domain search is sync; company search may be async |

> **Important:** This is a **standalone auxiliary tool** for ad-hoc ICP record lookups. If you are running a full `company` scan, ICP record collection is **already included** via the `is_search_icp` option — there is no need to call `bee_icp_query` separately. Use this tool only when you need to query ICP records independently without triggering a full company asset discovery.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `query_type` | string | Query mode: `"company"`, `"domain"`, or `"task_status"` |
| `word` | string | Search keyword (company name or domain/IP) |
| `task_id` | string | Task ID for polling async company search results |

**Modes:**

**1. Company Search (`query_type="company"`):**
- Searches ICP records by company name.
- May return results immediately (status=1) or asynchronously (status=2).
- If status=2, you receive a `task_id` — poll with `task_status` mode until results are ready.

**2. Domain Search (`query_type="domain"`):**
- Searches ICP records by domain name or IP address.
- Typically returns results immediately (synchronous).

**3. Task Status (`query_type="task_status"`):**
- Polls the status of an async company search using the `task_id`.
- Continue polling until status=1 (completed).

**Returns (per record):**
| Field | Description |
|-------|-------------|
| `name` | Registered company/organization name |
| `domain` | Registered domain name |
| `service_licence` | ICP license number |
| `verify_time` | Filing verification date |
| `company_type` | Organization type (enterprise, individual, etc.) |
| `data_source` | Data source identifier |

**Usage Example:**
```
bee_icp_query(query_type="company", word="北京百度网讯科技有限公司")
  → If status=2: got task_id="abc123"
  → bee_icp_query(query_type="task_status", task_id="abc123")
  → Poll until status=1, then extract domain list
```

---

### bee_addr_query
| Attribute | Detail |
|-----------|--------|
| Purpose | Query network address properties for an IP or domain |
| Sync/Async | Synchronous (immediate response) |

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `addr` | string | IP address or domain name to query |

**Returns:**
| Field | Description |
|-------|-------------|
| Resolved IP | The IP address the domain resolves to |
| CDN Detection | Whether the target is behind a CDN (e.g., Cloudflare, Akamai) |
| WAF Detection | Whether a Web Application Firewall is detected |
| IP Geolocation | Country, region, city of the IP address |
| ISP | Internet Service Provider |
| ASN | Autonomous System Number |
| Wildcard Domain | Whether the domain uses wildcard DNS records |

**When to Use:**
- After obtaining domains from `bee_icp_query`, check each domain for CDN/WAF before scanning.
- If CDN is detected, the resolved IP may not be the origin server — port scanning that IP may be ineffective.
- Use the resolved IP to construct `"URL,IP"` pairs for `web` and `web-finger` scan targets.
- Wildcard domain detection helps avoid false positives in subdomain enumeration.

---

## Typical Reconnaissance Workflow

Below is a complete end-to-end reconnaissance workflow demonstrating how the Bee tools chain together:

```
Step 1: Verify target company
  bee_verify_unit(unit_name="百度")
  → Returns standardized name: "北京百度网讯科技有限公司"
  → Confirm with user before proceeding

Step 2: Run company scan (includes ICP record collection via is_search_icp)
  bee_scan(scan_type="company", targets=["北京百度网讯科技有限公司"])
  → The company scan automatically discovers ICP-registered domains, subdomains, IPs, etc.
  → No need to call bee_icp_query separately — ICP lookup is built into the company scan.
  → Poll with bee_status until completed, then bee_fetch_result to get discovered assets.
  → Extract domain list from results: ["baidu.com", "hao123.com", ...]

  Note: Use bee_icp_query only for standalone ad-hoc ICP lookups (e.g., quick domain→company
  reverse lookups) when you do NOT need a full company asset discovery.

Step 3: Check network properties for key domains
  bee_addr_query(addr="www.example.com")
  → CDN: Yes (Cloudflare)
  → Resolved IP: 11.22.33.44
  → Use this info to decide scanning strategy

Step 4: Check worker availability
  bee_workers(scan_type="cyberspace")
  → 5 workers alive, capacity available
  → Set max_concurrent ≤ 5

Step 5: Start cyberspace search for broad asset discovery
  # IMPORTANT: Use domain names or IPs as targets, NOT FOFA query syntax!
  bee_scan(scan_type="cyberspace", targets=["baidu.com", "hao123.com"], max_concurrent=3)
  → Returns task_id: "task_abc123"

Step 6: Poll for completion
  bee_status(scan_type="cyberspace", task_id="task_abc123")
  → Poll every 1-2 minutes
  → Wait until completed == total_workflows
  → Extract OSS links from response

Step 7: Fetch actual scan results
  bee_fetch_result(oss_links=[...from status response...], scan_type="cyberspace")
  → Download and parse discovered assets (IPs, domains, services)

Step 8: Deep scan discovered assets
  # Port scan discovered IPs
  bee_scan(scan_type="port", targets=["11.22.33.44", "220.181.38.148"], ports="top100")

  # Web vulnerability scan discovered web servers
  bee_scan(scan_type="web", targets=["https://www.example.com,11.22.33.44"])

  # Fingerprint web services
  bee_scan(scan_type="web-finger", targets=["https://www.example.com:443,11.22.33.44"])
```

---

## Status Response Interpretation

When calling `bee_status`, the response contains the following structure:

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | string | Unique identifier for the scan task |
| `total_workflows` | int | Total number of Temporal workflows spawned for this task |
| `completed` | int | Number of workflows that finished successfully |
| `running` | int | Number of workflows still executing |
| `failed` | int | Number of workflows that encountered errors |
| `workflows` | array | Per-workflow detail list |

**Per-Workflow Fields (`workflows[]`):**
| Field | Type | Description |
|-------|------|-------------|
| `workflow_id` | string | Unique workflow identifier |
| `status` | string | Workflow state: `"running"`, `"completed"`, `"failed"`, `"timed_out"` |
| `heartbeat` | string | Last heartbeat timestamp (indicates worker is alive) |
| `results.Summary` | object | Summary data including OSS links and scan statistics |

**Completion Check Logic:**
```
if completed + failed == total_workflows:
    # Scan is done — extract OSS links from Summary
elif running > 0:
    # Still in progress — poll again after appropriate interval
```

**Extracting OSS Links:**
- Look inside `workflows[].results.Summary` for fields ending in `_oss_links` or `OssLinks`.
- The exact field name varies by scan type (see each scan type's "Result OSS Fields" above).
- These are URLs pointing to JSON files in OSS — pass them to `bee_fetch_result`.

---

## Output & Persistence

### Result Flow
```
Bee API → OSS (cloud storage)
  │
  bee_fetch_result(oss_links) → Downloads JSON data
  │
  ResultStore → Saves to workspace_data/results/bee_<scan_type>/
  │
  read_file → Agent reads full result data
```

### Storage Details
- **OSS:** Raw scan results are stored as JSON files in Object Storage Service.
- **ResultStore:** After fetching via `bee_fetch_result`, results are saved locally for persistence.
- **Local Path:** `workspace_data/results/bee_<scan_type>/` (e.g., `workspace_data/results/bee_port/`)
- **Access:** Use `read_file` tool to read the full downloaded result data from local storage.

### Data Lifecycle
1. Scan completes → results uploaded to OSS by workers.
2. Status response includes OSS links (not inline data).
3. `bee_fetch_result` downloads from OSS and saves locally via ResultStore.
4. Agent reads local files for analysis and reporting.

---

## Safety Warnings

| Risk | Level | Description |
|------|-------|-------------|
| Rate Limiting | Medium | Large scans with many targets generate significant network traffic. Respect `max_concurrent` limits. |
| Legal Compliance | High | Only scan targets you are explicitly authorized to test. Unauthorized scanning may violate laws. |
| Resource Consumption | Medium | Company scans can run for 10-30 minutes and consume significant worker resources. |
| Target Impact | Low-Medium | Port and web scans send probes to target hosts — aggressive settings may trigger alerts or cause service degradation. |
| Data Sensitivity | Medium | Scan results may contain sensitive infrastructure details. Handle and store results securely. |

### Best Practices
- **Always check workers first** — never submit scans to a pool with no available workers.
- **Set reasonable `max_concurrent`** — do not exceed the available worker count.
- **Use appropriate poll intervals** — too-frequent polling wastes API calls; too-slow polling delays results.
- **Verify company names** — use `bee_verify_unit` before company scans to avoid wasted time.
- **Check CDN/WAF** — use `bee_addr_query` before port/web scans to understand the target topology.
- **Chain scans intelligently** — use discovery → port → web-finger → web for systematic enumeration.

---

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| No workers available | Workers are offline or overloaded | Wait and retry, or check Temporal worker deployment |
| Task not found | Invalid or expired `task_id` | Verify the `task_id` from the original `bee_scan` response |
| OSS link expired | Result files have a TTL | Re-run the scan if links have expired |
| Empty results | Target has no discoverable assets | Verify target is correct; try different scan types |
| ICP query async (status=2) | Company search is processing | Poll with `task_status` mode until status=1 |
| Company name not found | Name not in verification database | Try alternative names, use `bee_verify_unit` for suggestions |

---

## Quick Reference

| Task | Tool | Key Parameters |
|------|------|----------------|
| Check scan capacity | `bee_workers` | `scan_type` |
| Start a scan | `bee_scan` | `scan_type`, `targets`, `max_concurrent` |
| Check scan progress | `bee_status` | `scan_type`, `task_id` |
| Cancel/stop a scan | `bee_cancel_scan` | `scan_type`, `task_id`, `force` |
| Get legacy result | `bee_result` | `scan_type`, `task_id` |
| Download OSS data | `bee_fetch_result` | `oss_links`, `scan_type` |
| Validate company name | `bee_verify_unit` | `unit_name` |
| Query ICP records | `bee_icp_query` | `query_type`, `word` |
| Check IP/domain info | `bee_addr_query` | `addr` |
