/**
 * Bee Tools - Bee Security Scan Platform MCP Tool Suite
 * Category: reconnaissance
 *
 * Provides atomic MCP tools for interacting with the Bee async scanning API.
 * Pattern: Fire-and-Forget + Polling
 *   1. bee_scan         → Start scan, return task_id immediately
 *   2. bee_status       → Poll task/workflow status
 *   3. bee_result       → Fetch workflow result (legacy)
 *   4. bee_fetch_result → Download data from OSS links
 *   5. bee_workers      → Check worker capacity
 *   6. bee_cancel_scan  → Cancel/terminate running scans
 *   7. bee_verify_unit  → Validate company names
 *   8. bee_icp_query    → ICP filing lookup
 *   9. bee_addr_query   → IP/domain property query
 */
import { z } from 'zod';
import crypto from 'crypto';
import { CanonicalToolDef, ExecutionContext, ToolResult } from '../types/tool-definition';
import { BeeClient, BeeScanType, SCAN_POLL_HINTS, getStatusTotal, UnitFilterClient, IcpClient, ICPRecord, AddrClient, AddrQueryResponse, BeeCancelTaskResponse } from '../utils/bee-client';
import { ResultStore } from '../utils/result-store';
import { Config } from '../config';

// ============================================================
// Schema Definitions
// ============================================================

const BeeScanTypeEnum = z.enum([
    'company',
    'cyberspace',
    'port',
    'web',
    'web-finger',
    'domain',
    'discovery',
    'netattrib'
]);

const BeeScanInputSchema = z.object({
    scan_type: BeeScanTypeEnum.describe(
        'Type of scan to run. Options:\n' +
        '  - company: Company asset discovery (ICP filing, subdomains, ports)\n' +
        '  - cyberspace: Cyberspace search engine query (FOFA/Shodan/ZoomEye)\n' +
        '  - port: Port scanning (masscan + nmap service detection)\n' +
        '  - web: Web vulnerability scanning\n' +
        '  - web-finger: Web fingerprint identification\n' +
        '  - domain: DNS resolution & subdomain enumeration\n' +
        '  - discovery: Host/service discovery\n' +
        '  - netattrib: Network attribution scan'
    ),
    targets: z.array(z.string()).min(1).describe(
        'List of scan targets. Format varies by scan_type:\n' +
        '  - company: Enterprise names (use verified full name from bee_verify_unit), e.g. ["北京百度网讯科技有限公司"]\n' +
        '  - cyberspace: Domains or public IPs, e.g. ["example.com", "8.8.8.8"]. NOTE: Not FOFA query syntax!\n' +
        '  - port: IPv4 addresses or CIDRs, e.g. ["192.168.1.0/24"]\n' +
        '  - web/web-finger: URL,IP pairs, e.g. ["https://www.example.com,1.2.3.4"]\n' +
        '  - domain/discovery: IP/CIDR/domain, e.g. ["192.168.1.0/24"]\n' +
        '  - netattrib: Domains or IPs, e.g. ["example.com", "1.2.3.4"]\n' +
        'IDN support: International domain names (e.g. "百度.com") are auto-converted to Punycode by the API.'
    ),
    workspace_id: z.string().optional().describe(
        'Workspace isolation ID. If provided, will be used as task_id to group all scans under the same workspace. ' +
        'This allows querying all scan tasks for a workspace using the same task_id.'
    ),
    max_concurrent: z.number().int().positive().optional().describe(
        'Maximum number of concurrent scan workflows. ' +
        'Use bee_workers to check available worker count first, then set this to ≤ worker count for optimal performance. ' +
        'If omitted, the Bee platform uses its default concurrency.'
    ),
    options: z.record(z.string(), z.any()).optional().describe(
        'Additional scan options (passed directly to the API). Examples:\n' +
        '  - company scan:\n' +
        '    - depth: int (0-3) - Query depth for subsidiary discovery\n' +
        '    - percent: float (0-1) - Shareholding threshold for subsidiaries\n' +
        '    - is_search_icp: bool - Search ICP filing records (recommended: true)\n' +
        '    - is_icp_hi: bool - Include ICP history records\n' +
        '    - is_search_wechat: bool - Search WeChat official accounts\n' +
        '    - is_supply: bool - Collect supplier info (costs extra API credits)\n' +
        '    - is_bid: bool - Collect bidding info (costs extra API credits)\n' +
        '  - port scan: {"ports": "top100", "protocol": "tcp"}\n' +
        '  - discovery: {"discovery_mode": "all", "discovery_ports": ["80", "443"]}\n' +
        '  - web: {"crawl_depth": 2}\n' +
        '  - task_queue: "prod-01" (override default Temporal task queue)'
    )
});

const BeeStatusInputSchema = z.object({
    scan_type: BeeScanTypeEnum.describe('The scan type (must match the original bee_scan call)'),
    task_id: z.string().describe('Task ID returned by bee_scan'),
    workflow_id: z.string().optional().describe(
        'Optional: specific workflow_id to check. ' +
        'If omitted, returns overall task status for all workflows.'
    )
});

const BeeResultInputSchema = z.object({
    scan_type: BeeScanTypeEnum.describe('The scan type (must match the original bee_scan call)'),
    workflow_id: z.string().describe('Workflow ID to fetch result for (from bee_status response)')
});

const BeeVerifyUnitInputSchema = z.object({
    unit_name: z.string().min(1).describe(
        '待验证的单位/公司名称。支持简称、别名、全称。\n' +
        '示例: "百度"、"北京大学"、"中华人民共和国教育部"'
    ),
    force: z.boolean().optional().describe(
        '是否强制刷新缓存（跳过缓存直接查询）。默认 false。'
    )
});

const BeeIcpQueryInputSchema = z.object({
    query_type: z.enum(['company', 'domain', 'task_status']).describe(
        '查询类型:\n' +
        '  - company: 按公司名称查询 ICP 备案的域名列表\n' +
        '  - domain: 按域名/IP 反查 ICP 备案信息\n' +
        '  - task_status: 查询异步任务状态（公司查询可能是异步的）'
    ),
    word: z.string().optional().describe(
        '查询关键词（query_type 为 company 或 domain 时必填）。\n' +
        '  - company: 公司名称，如 "北京百度网讯科技有限公司"\n' +
        '  - domain: 域名或IP，如 "baidu.com"'
    ),
    task_id: z.string().optional().describe(
        '异步任务 ID（query_type 为 task_status 时必填）。来自 company 查询返回的 task_id。'
    ),
    force: z.boolean().optional().describe(
        '是否强制查询（跳过缓存）。默认 false。'
    ),
    history: z.boolean().optional().describe(
        '是否包含历史备案记录。默认 false，仅返回当前有效备案。'
    )
});

const BeeAddrQueryInputSchema = z.object({
    addr: z.string().min(1).describe(
        '要查询的网络地址（域名或 IP）。\n' +
        '示例: "www.baidu.com"、"8.8.8.8"、"example.com"'
    ),
    skip_wildcard: z.boolean().optional().describe(
        '是否跳过泛域名解析检测（使用快速模式）。默认 false。\n' +
        '  - false: 完整检测，包含泛域名解析判断（耗时较长）\n' +
        '  - true: 快速模式，跳过泛域名检测'
    )
});

const BeeFetchResultInputSchema = z.object({
    oss_links: z.array(z.string().url()).min(1).describe(
        'List of OSS URLs to fetch result data from. ' +
        'These URLs come from bee_status response (Summary.resultOssLinks, domainOssLinks, ipOssLinks, etc.) ' +
        'or from result_oss_links in workflow results.'
    ),
    scan_type: BeeScanTypeEnum.describe('The scan type this result belongs to (for organizing saved files)')
});

const BeeWorkersInputSchema = z.object({
    scan_type: BeeScanTypeEnum.describe(
        'Type of scan to check workers for. Must match the scan type you plan to use with bee_scan.'
    )
});

const BeeCancelScanInputSchema = z.object({
    scan_type: BeeScanTypeEnum.describe('The scan type (must match the original bee_scan call)'),
    task_id: z.string().describe('Task ID returned by bee_scan'),
    reason: z.string().optional().describe('Reason for cancellation (for audit/logging)'),
    force: z.boolean().optional().describe(
        'Cancellation mode:\n' +
        '  - false (default): Graceful cancel — workflow can clean up resources\n' +
        '  - true: Force terminate — immediate hard stop, no cleanup. Use only when graceful cancel fails or workflow is stuck.'
    )
});

// ============================================================
// Tool Creators
// ============================================================

export function createBeeTools(
    beeApiUrl: string,
    beeApiToken: string = '',
    workspaceDir: string,
    taskQueue: string = 'prod-01',
    unitFilterUrl?: string,
    unitFilterToken?: string,
    icpApiUrl?: string,
    icpApiToken?: string,
    addrApiUrl?: string,
    addrApiToken?: string
): CanonicalToolDef[] {
    const client = new BeeClient(beeApiUrl, beeApiToken);
    const resultStore = new ResultStore(workspaceDir);
    const unitFilterClient = unitFilterUrl
        ? new UnitFilterClient(unitFilterUrl, unitFilterToken || '')
        : null;
    const icpClient = icpApiUrl
        ? new IcpClient(icpApiUrl, icpApiToken || '')
        : null;
    const addrClient = addrApiUrl
        ? new AddrClient(addrApiUrl, addrApiToken || '')
        : null;

    // ----------------------------------------------------------
    // bee_scan
    // ----------------------------------------------------------
    const beeScan: CanonicalToolDef<typeof BeeScanInputSchema> = {
        name: 'bee_scan',
        displayName: 'Bee Scan - Start Async Scan',
        description:
            'Start an asynchronous security scan via the Bee platform. ' +
            'Returns a task_id and workflow_ids immediately — the scan runs in background. ' +
            'Use bee_status to poll progress, bee_result to fetch completed results. ' +
            'Supported scan types: company, cyberspace, port, web, web-finger, domain, discovery, netattrib.',

        inputSchema: BeeScanInputSchema,

        annotations: {
            title: 'Bee Scan - Start Async Security Scan',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true
        },

        security: {
            riskLevel: 'medium',
            requiresApproval: false,
            category: 'reconnaissance',
            tags: ['bee', 'async', 'scan', 'reconnaissance']
        },

        execution: {
            executor: 'native' as const,
            timeout: 30_000,
            supportsStreaming: false
        },

        knowledgeFile: 'bee.md',

        handler: async (input: z.infer<typeof BeeScanInputSchema>, _context: ExecutionContext): Promise<ToolResult> => {
            try {
                const { scan_type, targets, max_concurrent, options } = input;

                // Use context.workspaceId as task_id (always available: user-provided or session-generated)
                const taskId = _context.workspaceId || crypto.randomUUID();

                // Inject task_queue and max_concurrent into request body
                const mergedOptions: Record<string, any> = { task_queue: taskQueue, ...(options || {}) };
                if (max_concurrent !== undefined) {
                    mergedOptions.max_concurrent = max_concurrent;
                }

                const result = await client.startScan(scan_type as BeeScanType, targets, mergedOptions, taskId);
                const hints = SCAN_POLL_HINTS[scan_type as BeeScanType];

                const summary = [
                    `✅ Scan started successfully`,
                    ``,
                    `📋 Scan Type: ${scan_type}`,
                    `🎯 Targets: ${targets.join(', ')}`,
                    `🆔 Task ID: ${result.task_id}`,
                    `📦 Workflows: ${result.workflow_ids.length}`,
                    ...result.workflow_ids.map((id, i) => `   [${i + 1}] ${id}`),
                    ``,
                    `⏱️ Estimated duration: ${hints.typical}`,
                    `💡 Recommended poll interval: ${hints.interval}`,
                    ``,
                    `Next steps:`,
                    `  1. Use bee_status(scan_type="${scan_type}", task_id="${result.task_id}") to check progress`,
                    `  2. When a workflow completes, use bee_result(scan_type="${scan_type}", workflow_id="<id>") to fetch results`
                ].join('\n');

                return { content: [{ type: 'text', text: summary }] };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `❌ Failed to start scan: ${error.message}` }],
                    isError: true
                };
            }
        }
    };

    // ----------------------------------------------------------
    // bee_status
    // ----------------------------------------------------------
    const beeStatus: CanonicalToolDef<typeof BeeStatusInputSchema> = {
        name: 'bee_status',
        displayName: 'Bee Status - Check Scan Progress',
        description:
            'Check the status of an ongoing Bee scan task. ' +
            'Returns overall progress (completed/total/failed) and per-workflow status. ' +
            'Optionally specify a workflow_id to get detailed status for a single workflow.',

        inputSchema: BeeStatusInputSchema,

        annotations: {
            title: 'Bee Status - Check Scan Progress',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        },

        security: {
            riskLevel: 'low',
            requiresApproval: false,
            category: 'reconnaissance',
            tags: ['bee', 'status', 'polling']
        },

        execution: {
            executor: 'native' as const,
            timeout: 15_000,
            supportsStreaming: false
        },

        knowledgeFile: 'bee.md',

        handler: async (input: z.infer<typeof BeeStatusInputSchema>, _context: ExecutionContext): Promise<ToolResult> => {
            try {
                const { scan_type, task_id, workflow_id } = input;

                // Single workflow detail
                if (workflow_id) {
                    const detail = await client.getWorkflowDetail(scan_type as BeeScanType, workflow_id);
                    const lines = [
                        `📊 Workflow Status`,
                        ``,
                        `🔹 Scan Type: ${scan_type}`,
                        `🔹 Workflow ID: ${workflow_id}`,
                        `🔹 Status: ${detail.status}`,
                    ];
                    if (detail.progress) {
                        lines.push(`🔹 Progress: ${JSON.stringify(detail.progress)}`);
                    }
                    if (detail.error) {
                        lines.push(`⚠️ Error: ${detail.error}`);
                    }
                    return { content: [{ type: 'text', text: lines.join('\n') }] };
                }

                // Overall task status
                const status = await client.getTaskStatus(scan_type as BeeScanType, task_id);
                const totalWorkflows = getStatusTotal(status);
                const lines = [
                    `📊 Task Status Overview`,
                    ``,
                    `🔹 Scan Type: ${scan_type}`,
                    `🔹 Task ID: ${task_id}`,
                    `🔹 Total: ${totalWorkflows} | Completed: ${status.completed} | Running: ${status.running} | Failed: ${status.failed}`,
                    ``
                ];

                if (status.workflows && status.workflows.length > 0) {
                    lines.push(`Workflows:`);
                    for (const wf of status.workflows) {
                        const statusIcon = wf.status === 'COMPLETED' ? '✅' :
                            wf.status === 'RUNNING' ? '🔄' :
                                wf.status === 'FAILED' ? '❌' : '⏳';
                        lines.push(`  ${statusIcon} ${wf.workflow_id} — ${wf.status}`);
                    }
                }

                // Give Agent a hint about next actions
                if (status.completed > 0) {
                    const completedWfs = status.workflows.filter(w => w.status === 'COMPLETED');
                    if (completedWfs.length > 0) {
                        lines.push(``);
                        lines.push(`💡 ${completedWfs.length} workflow(s) completed. Use bee_result to fetch results.`);
                    }
                }
                if (status.running > 0) {
                    const hints = SCAN_POLL_HINTS[scan_type as BeeScanType];
                    lines.push(`⏱️ ${status.running} still running. Poll again in ~${hints.interval}.`);
                }

                return { content: [{ type: 'text', text: lines.join('\n') }] };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `❌ Failed to get status: ${error.message}` }],
                    isError: true
                };
            }
        }
    };

    // ----------------------------------------------------------
    // bee_result
    // ----------------------------------------------------------
    const beeResult: CanonicalToolDef<typeof BeeResultInputSchema> = {
        name: 'bee_result',
        displayName: 'Bee Result - Fetch Scan Results',
        description:
            'Fetch the result of a completed Bee scan workflow. ' +
            'Results are automatically saved to disk via ResultStore. ' +
            'Large results return a summary with file path — use read_file to access full data.',

        inputSchema: BeeResultInputSchema,

        annotations: {
            title: 'Bee Result - Fetch & Persist Scan Results',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        },

        security: {
            riskLevel: 'low',
            requiresApproval: false,
            category: 'reconnaissance',
            tags: ['bee', 'result', 'persistence']
        },

        execution: {
            executor: 'native' as const,
            timeout: 60_000,
            supportsStreaming: false
        },

        knowledgeFile: 'bee.md',

        handler: async (input: z.infer<typeof BeeResultInputSchema>, _context: ExecutionContext): Promise<ToolResult> => {
            try {
                const { scan_type, workflow_id } = input;

                const result = await client.getWorkflowResult(scan_type as BeeScanType, workflow_id);
                const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

                // Persist to disk via ResultStore (same pattern as scanning tools)
                const toolName = `bee_${scan_type}`;
                const { text } = resultStore.save(toolName, resultText, {
                    command: `bee_result ${scan_type} ${workflow_id}`,
                    target: workflow_id,
                    workspaceId: _context.workspaceId
                });

                return { content: [{ type: 'text', text }] };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `❌ Failed to fetch result: ${error.message}` }],
                    isError: true
                };
            }
        }
    };

    // ----------------------------------------------------------
    // bee_workers
    // ----------------------------------------------------------
    const beeWorkers: CanonicalToolDef<typeof BeeWorkersInputSchema> = {
        name: 'bee_workers',
        displayName: 'Bee Workers - Check Alive Worker Nodes',
        description:
            'Check available worker nodes for a specific Bee scan type. ' +
            'Returns worker count, versions, and resource info. ' +
            'Call this BEFORE bee_scan to verify workers are available and determine appropriate batch_size.',

        inputSchema: BeeWorkersInputSchema,

        annotations: {
            title: 'Bee Workers - Check Available Scan Nodes',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        },

        security: {
            riskLevel: 'low',
            requiresApproval: false,
            category: 'reconnaissance',
            tags: ['bee', 'workers', 'status', 'capacity']
        },

        execution: {
            executor: 'native' as const,
            timeout: 15_000,
            supportsStreaming: false
        },

        knowledgeFile: 'bee.md',

        handler: async (input: z.infer<typeof BeeWorkersInputSchema>, _context: ExecutionContext): Promise<ToolResult> => {
            try {
                const { scan_type } = input;
                const result = await client.getWorkers(scan_type as BeeScanType, taskQueue);

                const lines = [
                    `📊 Worker Status for ${scan_type}`,
                    ``,
                    `🔹 Total Workers: ${result.total}`,
                ];

                if (result.total === 0) {
                    lines.push(``, `⚠️ No workers available for ${scan_type}. Scan tasks will be queued until a worker comes online.`);
                } else {
                    lines.push(``, `Workers:`);
                    for (const w of result.workers) {
                        lines.push(`  🖥️ ${w.hostname} (${w.arch})`);
                        lines.push(`     Version: ${w.version} | Build: ${w.build_id}`);
                        lines.push(`     Queue: ${w.task_queue}`);
                        lines.push(`     CPU: ${w.cpu}`);
                        lines.push(`     Mem: ${w.mem}`);
                        lines.push(`     Disk: ${w.disk}`);
                        if (w.internal_ip && w.internal_ip.length > 0) {
                            lines.push(`     IP: ${w.internal_ip.join(', ')}`);
                        }
                        lines.push(``);
                    }

                    lines.push(`💡 Recommended: Set max_concurrent ≤ ${result.total} for optimal performance.`);
                }

                return { content: [{ type: 'text', text: lines.join('\n') }] };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `❌ Failed to get workers: ${error.message}` }],
                    isError: true
                };
            }
        }
    };

    // ----------------------------------------------------------
    // bee_verify_unit (requires UnitFilter service)
    // ----------------------------------------------------------
    const tools: CanonicalToolDef[] = [beeWorkers, beeScan, beeStatus, beeResult];

    // ----------------------------------------------------------
    // bee_fetch_result (fetch actual data from OSS links)
    // ----------------------------------------------------------
    const beeFetchResult: CanonicalToolDef<typeof BeeFetchResultInputSchema> = {
        name: 'bee_fetch_result',
        displayName: 'Bee Fetch Result - Download Scan Data from OSS',
        description:
            'Fetch actual scan result data from OSS storage links returned by bee_status. ' +
            'Bee scan results contain OSS URLs (resultOssLinks, domainOssLinks, etc.) pointing to the actual data. ' +
            'This tool downloads those JSON files and persists them via ResultStore for further analysis.',

        inputSchema: BeeFetchResultInputSchema,

        annotations: {
            title: 'Bee Fetch Result - Download Scan Data',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        },

        security: {
            riskLevel: 'low',
            requiresApproval: false,
            category: 'reconnaissance',
            tags: ['bee', 'result', 'oss', 'download', 'persistence']
        },

        execution: {
            executor: 'native' as const,
            timeout: 120_000,
            supportsStreaming: false
        },

        knowledgeFile: 'bee.md',

        handler: async (input: z.infer<typeof BeeFetchResultInputSchema>, _context: ExecutionContext): Promise<ToolResult> => {
            try {
                const { oss_links, scan_type } = input;
                const results: string[] = [];
                let totalRecords = 0;

                for (let i = 0; i < oss_links.length; i++) {
                    const link = oss_links[i];
                    try {
                        let res = await fetch(link);

                        // S3 signing fallback: if direct fetch returns 403/401, check if S3 config is available
                        if (!res.ok && (res.status === 403 || res.status === 401)) {
                            const s3Endpoint = Config.s3Endpoint;
                            const s3AccessKey = Config.s3AccessKey;
                            const s3SecretKey = Config.s3SecretKey;

                            if (s3Endpoint && s3AccessKey && s3SecretKey) {
                                // TODO: When @aws-sdk/client-s3 or @aws-sdk/s3-request-presigner is added,
                                // parse bucket & key from the URL and generate a presigned URL for re-fetch.
                                // For now, provide a clear error message with guidance.
                                results.push(
                                    `❌ [${i + 1}] HTTP ${res.status} — S3 config is set but @aws-sdk/s3-request-presigner is not installed. ` +
                                    `Install it with: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
                                );
                                continue;
                            } else {
                                results.push(
                                    `❌ [${i + 1}] HTTP ${res.status} — OSS link requires authentication. ` +
                                    `The link is not a presigned URL. Configure S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY in .env.mcp to enable S3 signed downloads.`
                                );
                                continue;
                            }
                        }

                        if (!res.ok) {
                            results.push(`❌ [${i + 1}] Failed to fetch ${link}: HTTP ${res.status}`);
                            continue;
                        }
                        const text = await res.text();

                        // Try to parse as JSON to count records
                        let recordCount = 0;
                        try {
                            const parsed = JSON.parse(text);
                            if (Array.isArray(parsed)) {
                                recordCount = parsed.length;
                            } else if (typeof parsed === 'object') {
                                recordCount = 1;
                            }
                        } catch {
                            // Not JSON, save as-is
                        }
                        totalRecords += recordCount;

                        // Persist via ResultStore
                        const toolName = `bee_${scan_type}`;
                        const { text: savedText, saved } = resultStore.save(toolName, text, {
                            command: `bee_fetch_result ${scan_type}`,
                            target: link,
                            workspaceId: _context.workspaceId
                        });

                        results.push(`✅ [${i + 1}] Fetched ${saved.size > 1024 ? (saved.size / 1024).toFixed(1) + ' KB' : saved.size + ' B'} (${recordCount} records) → ${saved.relativePath}`);
                    } catch (fetchErr: any) {
                        results.push(`❌ [${i + 1}] Error fetching ${link}: ${fetchErr.message}`);
                    }
                }

                const summary = [
                    `📦 Bee Fetch Result Complete`,
                    ``,
                    `🔹 Scan Type: ${scan_type}`,
                    `🔹 Links Processed: ${oss_links.length}`,
                    `🔹 Total Records: ${totalRecords}`,
                    ``,
                    ...results,
                    ``,
                    `💡 Use read_file to view the full result data.`
                ].join('\n');

                return { content: [{ type: 'text', text: summary }] };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `❌ Failed to fetch results: ${error.message}` }],
                    isError: true
                };
            }
        }
    };

    tools.push(beeFetchResult);

    if (unitFilterClient) {
        const beeVerifyUnit: CanonicalToolDef<typeof BeeVerifyUnitInputSchema> = {
            name: 'bee_verify_unit',
            displayName: 'Bee 单位名称验证',
            description:
                '验证并标准化用户输入的单位/公司名称。' +
                '返回标准全称、置信度、行业分类、行政归属及天眼查公司基本信息。' +
                '在使用 bee_scan(scan_type="company") 前应先调用此工具确认公司名称准确性。',

            inputSchema: BeeVerifyUnitInputSchema,

            annotations: {
                title: 'Bee 单位名称验证 - 校验并标准化公司名称',
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true
            },

            security: {
                riskLevel: 'low',
                requiresApproval: false,
                category: 'reconnaissance',
                tags: ['bee', 'verify', 'company', 'unitfilter']
            },

            execution: {
                executor: 'native' as const,
                timeout: 30_000,
                supportsStreaming: false
            },

            knowledgeFile: 'bee.md',

            handler: async (input: z.infer<typeof BeeVerifyUnitInputSchema>, _context: ExecutionContext): Promise<ToolResult> => {
                try {
                    const { unit_name, force } = input;
                    const detail = await unitFilterClient.getCompanyDetail(unit_name, force || false);

                    const v = detail.validation_result;
                    const c = detail.classification;
                    const info = detail.company_info;

                    const lines: string[] = [];

                    // Validation result
                    if (v.is_valid) {
                        lines.push(`✅ 名称验证通过`);
                        lines.push(``);
                        lines.push(`📝 原始输入: ${v.original_name}`);
                        lines.push(`📋 标准全称: ${v.validated_name}`);
                        lines.push(`🎯 置信度: ${(v.confidence * 100).toFixed(0)}%`);
                    } else {
                        lines.push(`⚠️ 名称验证未通过`);
                        lines.push(``);
                        lines.push(`📝 原始输入: ${v.original_name}`);
                        lines.push(`🎯 置信度: ${(v.confidence * 100).toFixed(0)}%`);
                        if (v.suggestions && v.suggestions.length > 0) {
                            lines.push(`💡 建议名称:`);
                            for (const s of v.suggestions) {
                                lines.push(`   - ${s}`);
                            }
                        }
                        lines.push(``);
                        lines.push(`⚠️ 请使用建议的标准名称重新验证，或让用户确认后再进行扫描。`);
                    }

                    // Classification
                    if (c) {
                        lines.push(``);
                        lines.push(`📊 分类信息:`);
                        lines.push(`   行业领域: ${c.industry_sector}`);
                        lines.push(`   行政归属: ${c.administrative_affiliation}`);
                    }

                    // Company info
                    if (info) {
                        lines.push(``);
                        lines.push(`🏢 公司信息:`);
                        lines.push(`   名称: ${info.name}`);
                        if (info.credit_code) lines.push(`   统一社会信用代码: ${info.credit_code}`);
                        if (info.legal_person_name) lines.push(`   法人: ${info.legal_person_name}`);
                        if (info.reg_capital) lines.push(`   注册资本: ${info.reg_capital}`);
                        if (info.status) lines.push(`   状态: ${info.status}`);
                        if (info.industry) lines.push(`   行业: ${info.industry}`);
                    }

                    // Next step hint
                    if (v.is_valid && v.validated_name) {
                        lines.push(``);
                        lines.push(`💡 下一步: 使用验证后的标准名称启动公司资产扫描:`);
                        lines.push(`   bee_scan(scan_type="company", targets=["${v.validated_name}"])`);
                    }

                    return { content: [{ type: 'text', text: lines.join('\n') }] };
                } catch (error: any) {
                    return {
                        content: [{ type: 'text', text: `❌ 单位名称验证失败: ${error.message}` }],
                        isError: true
                    };
                }
            }
        };

        tools.push(beeVerifyUnit);
        console.error(`🔍 bee_verify_unit enabled (UnitFilter: ${unitFilterUrl})`);
    }

    // ----------------------------------------------------------
    // bee_icp_query (requires ICP service)
    // ----------------------------------------------------------
    if (icpClient) {
        const beeIcpQuery: CanonicalToolDef<typeof BeeIcpQueryInputSchema> = {
            name: 'bee_icp_query',
            displayName: 'Bee ICP 备案查询',
            description:
                '查询 ICP 备案信息。支持两种模式：\n' +
                '1. 按公司名称查询其备案的所有域名（可能是异步的，返回 task_id 需轮询）\n' +
                '2. 按域名/IP 反查备案公司信息\n' +
                '公司名称查询可能耗时较长，如返回 status=2 表示处理中，需用 task_status 模式轮询。',

            inputSchema: BeeIcpQueryInputSchema,

            annotations: {
                title: 'Bee ICP 备案查询 - 企业域名备案信息',
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true
            },

            security: {
                riskLevel: 'low',
                requiresApproval: false,
                category: 'reconnaissance',
                tags: ['bee', 'icp', 'filing', 'domain', 'reconnaissance']
            },

            execution: {
                executor: 'native' as const,
                timeout: 60_000,
                supportsStreaming: false
            },

            knowledgeFile: 'bee.md',

            handler: async (input: z.infer<typeof BeeIcpQueryInputSchema>, _context: ExecutionContext): Promise<ToolResult> => {
                try {
                    const { query_type, word, task_id, force, history } = input;

                    // --- task_status mode ---
                    if (query_type === 'task_status') {
                        if (!task_id) {
                            return {
                                content: [{ type: 'text', text: '❌ query_type="task_status" 需要提供 task_id 参数' }],
                                isError: true
                            };
                        }
                        const status = await icpClient.getTaskStatus(task_id);
                        return {
                            content: [{ type: 'text', text: `📋 任务状态:\n${JSON.stringify(status, null, 2)}` }]
                        };
                    }

                    // --- company / domain mode ---
                    if (!word) {
                        return {
                            content: [{ type: 'text', text: `❌ query_type="${query_type}" 需要提供 word 参数` }],
                            isError: true
                        };
                    }

                    const result = query_type === 'company'
                        ? await icpClient.searchByCompany(word, force || false, history || false)
                        : await icpClient.searchByDomain(word, force || false, history || false);

                    // Handle async (status=2 = processing)
                    if (result.status === 2) {
                        const lines = [
                            `⏳ 查询处理中（异步模式）`,
                            ``,
                            `📝 查询: ${word}`,
                            `💬 信息: ${result.message}`,
                        ];
                        // Extract task_id from message or response
                        const taskIdMatch = result.message?.match(/task_id[：:]\s*([\w-]+)/i)
                            || result.message?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
                        const extractedTaskId = (result as any).task_id || (taskIdMatch ? taskIdMatch[1] : null);
                        if (extractedTaskId) {
                            lines.push(`🆔 Task ID: ${extractedTaskId}`);
                            lines.push(``);
                            lines.push(`💡 请稍后使用以下命令查询结果:`);
                            lines.push(`   bee_icp_query(query_type="task_status", task_id="${extractedTaskId}")`);
                        } else {
                            lines.push(``);
                            lines.push(`💡 请稍后重新查询: bee_icp_query(query_type="company", word="${word}")`);
                        }
                        return { content: [{ type: 'text', text: lines.join('\n') }] };
                    }

                    // Handle error (status=1)
                    if (result.status === 1) {
                        return {
                            content: [{ type: 'text', text: `❌ ICP 查询失败: ${result.message}` }],
                            isError: true
                        };
                    }

                    // Success (status=0)
                    const lines = [
                        `✅ ICP 备案查询完成`,
                        ``,
                        `🔍 查询类型: ${query_type === 'company' ? '按公司名称' : '按域名/IP'}`,
                        `📝 查询词: ${word}`,
                        `📦 结果数量: ${result.count}`,
                    ];

                    if (result.data && result.data.length > 0) {
                        lines.push(``);
                        lines.push(`| 公司名称 | 域名 | 许可证号 | 审核时间 | 来源 |`);
                        lines.push(`|----------|------|----------|----------|------|`);
                        for (const r of result.data) {
                            lines.push(
                                `| ${r.name} | ${r.domain} | ${r.service_licence || '-'} | ${r.verify_time || '-'} | ${r.data_source} |`
                            );
                        }

                        // If too many records, persist to disk
                        if (result.data.length > 20) {
                            const fullText = JSON.stringify(result.data, null, 2);
                            const { text: savedSummary } = resultStore.save('bee_icp', fullText, {
                                command: `bee_icp_query ${query_type} ${word}`,
                                target: word,
                                workspaceId: _context.workspaceId
                            });
                            lines.push(``);
                            lines.push(`📁 完整结果已保存到磁盘（共 ${result.count} 条）:`);
                            lines.push(savedSummary.split('\n').filter(l => l.includes('workspace_data')).join('\n'));
                        }
                    } else {
                        lines.push(``);
                        lines.push(`ℹ️ 未找到备案记录`);
                    }

                    return { content: [{ type: 'text', text: lines.join('\n') }] };
                } catch (error: any) {
                    return {
                        content: [{ type: 'text', text: `❌ ICP 查询失败: ${error.message}` }],
                        isError: true
                    };
                }
            }
        };

        tools.push(beeIcpQuery);
        console.error(`📋 bee_icp_query enabled (ICP API: ${icpApiUrl})`);
    }

    // ----------------------------------------------------------
    // bee_addr_query (requires AddrQuery service)
    // ----------------------------------------------------------
    if (addrClient) {
        const beeAddrQuery: CanonicalToolDef<typeof BeeAddrQueryInputSchema> = {
            name: 'bee_addr_query',
            displayName: 'Bee 网络地址查询',
            description:
                '查询域名或 IP 的网络属性信息。返回内容包括：\n' +
                '  - DNS 解析 IP\n' +
                '  - CDN / WAF 检测\n' +
                '  - IP 地理位置、ISP、AS 号\n' +
                '  - 泛域名解析检测（可选跳过）\n' +
                '适用于侦察阶段判断目标 IP 真实性、是否有 CDN/WAF 防护、地理归属等。',

            inputSchema: BeeAddrQueryInputSchema,

            annotations: {
                title: 'Bee 网络地址查询 - IP/域名属性 & CDN/WAF 检测',
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true
            },

            security: {
                riskLevel: 'low',
                requiresApproval: false,
                category: 'reconnaissance',
                tags: ['bee', 'addr', 'ip', 'cdn', 'waf', 'geolocation', 'reconnaissance']
            },

            execution: {
                executor: 'native' as const,
                timeout: 30_000,
                supportsStreaming: false
            },

            knowledgeFile: 'bee.md',

            handler: async (input: z.infer<typeof BeeAddrQueryInputSchema>, _context: ExecutionContext): Promise<ToolResult> => {
                try {
                    const { addr, skip_wildcard } = input;

                    const result: AddrQueryResponse = skip_wildcard
                        ? await addrClient.queryFast(addr)
                        : await addrClient.query(addr);

                    const ip = result.resolve_ip;
                    const geo = result.resolve_ip_prop_aiwen;
                    const cdn = result.cdn_check;

                    const lines = [
                        `✅ 网络地址查询完成`,
                        ``,
                        `📍 输入: ${result.input}`,
                        `🌐 解析 IP: ${ip}`,
                        ``,
                        `## CDN / WAF 检测`,
                    ];

                    if (cdn.cdn) {
                        lines.push(`  🛡️ CDN: **是** — ${cdn.cdn_name} (检测方式: ${cdn.checkItem})`);
                    } else if (cdn.waf) {
                        lines.push(`  🔥 WAF: **是** — ${cdn.waf_name} (检测方式: ${cdn.checkItem})`);
                    } else {
                        lines.push(`  ✅ 未检测到 CDN/WAF`);
                    }

                    lines.push(``);
                    lines.push(`## IP 属性`);
                    lines.push(`| 属性 | 值 |`);
                    lines.push(`|------|-----|`);
                    lines.push(`| 国家/地区 | ${geo.country} ${geo.province} ${geo.city} ${geo.district} |`);
                    lines.push(`| ISP | ${geo.isp} |`);
                    lines.push(`| 所有者 | ${geo.owner} |`);
                    lines.push(`| AS 号 | ${geo.asnumber} |`);
                    lines.push(`| 场景 | ${geo.ip_scene || '-'} |`);
                    lines.push(`| 时区 | ${geo.timezone} |`);
                    lines.push(`| 精度 | ${geo.accuracy} |`);
                    lines.push(`| 坐标 | ${geo.latwgs}, ${geo.lngwgs} |`);

                    // Wildcard domain detection (only present in full mode)
                    if (result.wildcard_domain) {
                        const wd = result.wildcard_domain;
                        lines.push(``);
                        lines.push(`## 泛域名解析检测`);
                        if (wd.is_wildcard) {
                            lines.push(`  ⚠️ **检测到泛域名解析** (置信度: ${wd.confidence})`);
                            if (wd.wildcard_ips.length > 0) {
                                lines.push(`  泛解析 IP: ${wd.wildcard_ips.join(', ')}`);
                            }
                        } else {
                            lines.push(`  ✅ 未检测到泛域名解析`);
                        }
                    } else if (!skip_wildcard) {
                        // API didn't return wildcard info even though we requested it
                    }

                    return { content: [{ type: 'text', text: lines.join('\n') }] };
                } catch (error: any) {
                    return {
                        content: [{ type: 'text', text: `❌ 网络地址查询失败: ${error.message}` }],
                        isError: true
                    };
                }
            }
        };

        tools.push(beeAddrQuery);
        console.error(`🌐 bee_addr_query enabled (Addr API: ${addrApiUrl})`);
    }

    // ----------------------------------------------------------
    // bee_cancel_scan
    // ----------------------------------------------------------
    const beeCancelScan: CanonicalToolDef<typeof BeeCancelScanInputSchema> = {
        name: 'bee_cancel_scan',
        displayName: 'Bee Cancel Scan',
        description:
            'Cancel or force-terminate a running Bee scan task. ' +
            'Use graceful cancel (default) to let workflows clean up, or force=true to hard-terminate stuck workflows. ' +
            'Returns per-workflow cancellation status.',
        inputSchema: BeeCancelScanInputSchema,
        annotations: {
            title: 'Cancel Bee Scan Task',
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: true
        },
        security: {
            riskLevel: 'low',
            requiresApproval: false,
            category: 'utility',
            tags: ['bee', 'cancel', 'task-management']
        },
        execution: {
            executor: 'native',
            timeout: 30_000,
            supportsStreaming: false
        },
        knowledgeFile: 'bee.md',
        handler: async (input: z.infer<typeof BeeCancelScanInputSchema>, _ctx: ExecutionContext): Promise<ToolResult> => {
            const { scan_type, task_id, reason, force } = input;

            try {
                const result: BeeCancelTaskResponse = await client.cancelTask(
                    scan_type as BeeScanType,
                    task_id,
                    { reason, force }
                );

                const mode = force ? '强制终止' : '优雅取消';
                const lines: string[] = [
                    `## ${mode}结果`,
                    ``,
                    `| 指标 | 数值 |`,
                    `|------|------|`,
                    `| 任务 ID | \`${result.task_id}\` |`,
                    `| 总 Workflow 数 | ${result.total_workflows} |`,
                    `| 已取消 | ${result.cancelled} |`,
                    `| 已完成（无需取消） | ${result.already_finished} |`,
                    `| 取消失败 | ${result.failed_to_cancel} |`,
                ];

                if (result.workflows && result.workflows.length > 0) {
                    lines.push(``, `### Workflow 详情`);
                    for (const wf of result.workflows) {
                        const icon = wf.cancel_success ? '✅' : '❌';
                        lines.push(`- ${icon} \`${wf.workflow_id}\` (原状态: ${wf.previous_status}) — ${wf.message}`);
                    }
                }

                return { content: [{ type: 'text', text: lines.join('\n') }] };
            } catch (error: any) {
                return {
                    content: [{ type: 'text', text: `❌ 取消扫描任务失败: ${error.message}` }],
                    isError: true
                };
            }
        }
    };
    tools.push(beeCancelScan);

    return tools;
}
