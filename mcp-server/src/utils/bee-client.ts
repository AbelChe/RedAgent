/**
 * BeeClient - Bee Security Scan API HTTP Client
 *
 * Wraps the Bee Platform REST API (Temporal-based async scanning workflows).
 * All scan types follow the same pattern: start → status → result.
 */

// ============================================================
// Types
// ============================================================

/** Supported scan types */
export type BeeScanType =
    | 'company'
    | 'cyberspace'
    | 'port'
    | 'web'
    | 'web-finger'
    | 'domain'
    | 'discovery'
    | 'netattrib';

/** Map scan_type to API path prefix */
const SCAN_TYPE_TO_PATH: Record<BeeScanType, string> = {
    'company': 'company-scan',
    'cyberspace': 'cyberspace-search',
    'port': 'port-scan',
    'web': 'web-scan',
    'web-finger': 'web-finger-scan',
    'domain': 'domain-resolution',
    'discovery': 'discovery-scan',
    'netattrib': 'netattrib-scan'
};

/** Map scan_type to the target field name in request body */
const SCAN_TYPE_TO_TARGET_FIELD: Record<BeeScanType, string> = {
    'company': 'targets',
    'cyberspace': 'targets',  // 实际 API 使用 targets，不是 address
    'port': 'targets',
    'web': 'targets',
    'web-finger': 'targets',
    'domain': 'targets',
    'discovery': 'targets',
    'netattrib': 'targets'  // 实际 API 使用 targets
};

/** Estimated poll interval (seconds) per scan type */
export const SCAN_POLL_HINTS: Record<BeeScanType, { interval: string; typical: string }> = {
    'company': { interval: '3-5 min', typical: '10-30 min' },
    'cyberspace': { interval: '1-2 min', typical: '3-10 min' },
    'port': { interval: '30s', typical: '1-5 min' },
    'web': { interval: '30s', typical: '1-5 min' },
    'web-finger': { interval: '30s', typical: '1-3 min' },
    'domain': { interval: '15s', typical: '30s-2 min' },
    'discovery': { interval: '15s', typical: '30s-2 min' },
    'netattrib': { interval: '15s', typical: '30s-2 min' }
};

export interface BeeStartResponse {
    task_id: string;
    total_targets: number;
    workflow_ids: string[];
    status: string;
    message: string;
    [key: string]: any; // scan-type specific extra fields
}

export interface BeeStatusResponse {
    task_id: string;
    /** Some scan types return 'total', others 'total_workflows'. Use helper getter. */
    total?: number;
    total_workflows?: number;
    completed: number;
    failed: number;
    running: number;
    workflows: Array<{
        scan_id: string;
        workflow_id: string;
        status: string;
        progress?: any;
        results?: any;
        error?: string | null;
        [key: string]: any;
    }>;
    [key: string]: any;
}

/**
 * Get total workflow count from a BeeStatusResponse,
 * handling the API inconsistency between 'total' and 'total_workflows' fields.
 */
export function getStatusTotal(status: BeeStatusResponse): number {
    return status.total_workflows ?? status.total ?? 0;
}

export interface BeeWorkflowDetail {
    scan_id: string;
    workflow_id: string;
    status: string;
    progress?: any;
    results?: any;
    heartbeat?: any;
    error?: string | null;
    [key: string]: any;
}

export interface CancelledWorkflowInfo {
    workflow_id: string;
    scan_id: string;
    previous_status: string;
    cancel_success: boolean;
    message: string;
}

export interface BeeCancelTaskResponse {
    task_id: string;
    total_workflows: number;
    cancelled: number;
    already_finished: number;
    failed_to_cancel: number;
    workflows: CancelledWorkflowInfo[];
}

// ============================================================
// BeeClient
// ============================================================

export class BeeClient {
    private baseUrl: string;
    private token: string;

    constructor(baseUrl: string, token: string = '') {
        // Remove trailing slash
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.token = token;
    }

    /**
     * Start a scan task
     * @param taskId - Optional custom task ID (query param). Format: {timestamp}-{uuid}
     */
    async startScan(
        scanType: BeeScanType,
        targets: string[],
        options: Record<string, any> = {},
        taskId?: string
    ): Promise<BeeStartResponse> {
        const path = SCAN_TYPE_TO_PATH[scanType];
        const targetField = SCAN_TYPE_TO_TARGET_FIELD[scanType];

        const body = {
            [targetField]: targets,
            ...options
        };

        const queryString = taskId ? `?task_id=${encodeURIComponent(taskId)}` : '';
        return this.post<BeeStartResponse>(`/api/v1/${path}/start${queryString}`, body);
    }

    /**
     * Get task overall status (all workflows)
     */
    async getTaskStatus(
        scanType: BeeScanType,
        taskId: string
    ): Promise<BeeStatusResponse> {
        const path = SCAN_TYPE_TO_PATH[scanType];
        return this.get<BeeStatusResponse>(`/api/v1/${path}/${taskId}/status`);
    }

    /**
     * Get single workflow detail
     */
    async getWorkflowDetail(
        scanType: BeeScanType,
        workflowId: string
    ): Promise<BeeWorkflowDetail> {
        const path = SCAN_TYPE_TO_PATH[scanType];
        return this.get<BeeWorkflowDetail>(`/api/v1/${path}/workflows/${workflowId}`);
    }

    /**
     * Get workflow progress (real-time from Temporal Query Handler)
     */
    async getWorkflowProgress(
        scanType: BeeScanType,
        workflowId: string
    ): Promise<any> {
        const path = SCAN_TYPE_TO_PATH[scanType];
        return this.get<any>(`/api/v1/${path}/workflows/${workflowId}/progress`);
    }

    /**
     * Get workflow execution result
     */
    async getWorkflowResult(
        scanType: BeeScanType,
        workflowId: string
    ): Promise<any> {
        const path = SCAN_TYPE_TO_PATH[scanType];
        return this.get<any>(`/api/v1/${path}/workflows/${workflowId}/result`);
    }

    /**
     * Cancel/terminate workflows under a task.
     * @param force - If true, hard-terminate workflows (no cleanup). If false (default), graceful cancel.
     */
    async cancelTask(
        scanType: BeeScanType,
        taskId: string,
        options?: { reason?: string; force?: boolean }
    ): Promise<BeeCancelTaskResponse> {
        const path = SCAN_TYPE_TO_PATH[scanType];
        return this.post<BeeCancelTaskResponse>(`/api/v1/${path}/${taskId}/cancel`, {
            reason: options?.reason,
            force: options?.force ?? false
        });
    }

    /**
     * Check if Bee API is reachable
     */
    async healthCheck(): Promise<{ status: string; temporal: string; oss: string; version: string }> {
        return this.get('/health');
    }

    /**
     * Get workers for a scan type (check alive worker nodes)
     */
    async getWorkers(
        scanType: BeeScanType,
        taskQueue: string
    ): Promise<{ total: number; workers: Array<{ worker_id: string; worker_type: string; task_queue: string; build_id: string; version: string; hostname: string; arch: string; cpu: string; mem: string; disk: string; internal_ip: string[]; [key: string]: any }> }> {
        const path = SCAN_TYPE_TO_PATH[scanType];
        return this.get(`/api/v1/${path}/workers?task_queue=${encodeURIComponent(taskQueue)}`);
    }

    // ============================================================
    // HTTP helpers
    // ============================================================

    private async get<T>(endpoint: string): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: this.buildHeaders()
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Bee API GET ${endpoint} failed (${res.status}): ${text}`);
        }
        return res.json() as Promise<T>;
    }

    private async post<T>(endpoint: string, body: any): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                ...this.buildHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Bee API POST ${endpoint} failed (${res.status}): ${text}`);
        }
        return res.json() as Promise<T>;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }
}

// ============================================================
// ICP Types
// ============================================================

export interface ICPRecord {
    name: string;
    domain: string;
    service_licence: string | null;
    verify_time: string | null;
    company_type: string | null;
    last_update: string;
    is_historical: boolean;
    data_source: string;
}

export interface ICPSearchResponse {
    /** 0=成功, 1=异常, 2=处理中(异步) */
    status: number;
    message: string;
    data: ICPRecord[];
    count: number;
    /** Only present when status=2 (async processing) */
    task_id?: string;
}

// ============================================================
// IcpClient
// ============================================================

/**
 * IcpClient - ICP 备案查询服务 HTTP Client
 *
 * Wraps the ICP Filing Query API.
 * Supports: company name search (async), domain search, task status polling.
 */
export class IcpClient {
    private baseUrl: string;
    private token: string;

    constructor(baseUrl: string, token: string = '') {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.token = token;
    }

    /**
     * Search ICP records by company name (may be async)
     * If status=2, returns task_id for polling.
     */
    async searchByCompany(
        companyName: string,
        force: boolean = false,
        history: boolean = false
    ): Promise<ICPSearchResponse> {
        const params = new URLSearchParams({ word: companyName });
        if (force) params.set('force', '1');
        if (history) params.set('history', '1');
        return this.get<ICPSearchResponse>(`/icp/company/search?${params.toString()}`);
    }

    /**
     * Search ICP records by domain or IP
     */
    async searchByDomain(
        domain: string,
        force: boolean = false,
        history: boolean = false
    ): Promise<ICPSearchResponse> {
        const params = new URLSearchParams({ word: domain });
        if (force) params.set('force', '1');
        if (history) params.set('history', '1');
        return this.get<ICPSearchResponse>(`/icp/domain/search?${params.toString()}`);
    }

    /**
     * Check async task status (for company search that returned status=2)
     */
    async getTaskStatus(taskId: string): Promise<any> {
        return this.get<any>(`/icp/task/${taskId}/status`);
    }

    /**
     * Get ICP data statistics
     */
    async getStats(): Promise<any> {
        return this.get<any>(`/icp/stats`);
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<any> {
        return this.get<any>('/health');
    }

    // ============================================================
    // HTTP helpers
    // ============================================================

    private async get<T>(endpoint: string): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: this.buildHeaders()
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`ICP API GET ${endpoint} failed (${res.status}): ${text}`);
        }
        return res.json() as Promise<T>;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }
}

// ============================================================
// AddrQuery Types
// ============================================================

export interface CdnCheckResult {
    timestamp: string;
    input: string;
    ip: string;
    cdn?: boolean;
    cdn_name?: string;
    waf?: boolean;
    waf_name?: string;
    itemType: string;   // "cdn" | "waf" | "none"
    checkItem: string;  // "CNAME" | "IPAddr" etc.
}

export interface IpPropertyAiwen {
    accuracy: string;
    adcode: string;
    areacode: string;
    asnumber: string;
    city: string;
    continent: string;
    country: string;
    district: string;
    ip_scene: string;
    isp: string;
    latwgs: string;
    lngwgs: string;
    owner: string;
    province: string;
    radius: string;
    source: string;
    timezone: string;
    zipcode: string;
}

export interface WildcardDomainResult {
    domain: string;
    is_wildcard: boolean;
    wildcard_ips: string[];
    strategy: number;
    confidence: number;
    detected_at: string;
    response_time: number;
    metadata: Record<string, any>;
}

export interface AddrQueryResponse {
    input: string;
    resolve_ip: string;
    cdn_check: CdnCheckResult;
    resolve_ip_prop_aiwen: IpPropertyAiwen;
    timestamp: string;
    /** Only present when wildcard detection is enabled (non-/x/ path) */
    wildcard_domain?: WildcardDomainResult;
}

// ============================================================
// AddrClient
// ============================================================

/**
 * AddrClient - Network Address Query HTTP Client
 *
 * Queries an address (domain/IP) for:
 *   - DNS resolution (resolve_ip)
 *   - CDN / WAF detection
 *   - IP geolocation & ASN info (aiwen)
 *   - Wildcard domain detection (optional)
 *
 * Two modes:
 *   - Normal (GET /?addr=...):   full check including wildcard detection
 *   - Fast   (GET /x/?addr=...): skip wildcard detection
 */
export class AddrClient {
    private baseUrl: string;
    private token: string;

    constructor(baseUrl: string, token: string = '') {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.token = token;
    }

    /**
     * Query address with full checks (including wildcard domain detection).
     */
    async query(addr: string): Promise<AddrQueryResponse> {
        return this.get<AddrQueryResponse>(`/?addr=${encodeURIComponent(addr)}`);
    }

    /**
     * Query address in fast mode — skip wildcard domain detection.
     */
    async queryFast(addr: string): Promise<AddrQueryResponse> {
        return this.get<AddrQueryResponse>(`/x/?addr=${encodeURIComponent(addr)}`);
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.get('/?addr=127.0.0.1');
            return true;
        } catch {
            return false;
        }
    }

    // ============================================================
    // HTTP helpers
    // ============================================================

    private async get<T>(endpoint: string): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: this.buildHeaders()
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`AddrQuery GET ${endpoint} failed (${res.status}): ${text}`);
        }
        return res.json() as Promise<T>;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }
}

// ============================================================
// UnitFilter Types
// ============================================================

export interface UnitValidationResult {
    original_name: string;
    validated_name: string | null;
    is_valid: boolean;
    confidence: number;
    suggestions: string[];
}

export interface CompanyDetailResponse {
    validation_result: UnitValidationResult;
    classification: {
        industry_sector: string;
        administrative_affiliation: string;
    } | null;
    company_info: {
        id: number;
        name: string;
        credit_code: string;
        legal_person_name: string;
        reg_capital: string;
        status: string;
        industry: string;
        [key: string]: any;
    } | null;
}

export interface BatchUnitResponse {
    total_count: number;
    success_count: number;
    failed_count: number;
    results: Array<{
        unit_name: string;
        industry_sector: string;
        administrative_affiliation: string;
        validation_result: UnitValidationResult | null;
    }>;
    failed_units: string[];
}

// ============================================================
// UnitFilterClient
// ============================================================

/**
 * UnitFilterClient - Bee UnitFilter Server HTTP Client
 *
 * Wraps the bee-unitfilter-server API (AI-based unit name recognition
 * and administrative classification service).
 */
export class UnitFilterClient {
    private baseUrl: string;
    private token: string;

    constructor(baseUrl: string, token: string = '') {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.token = token;
    }

    /**
     * Get full company detail by name (validate + classify + company info)
     * Uses the all-in-one /api/units/company-detail endpoint.
     */
    async getCompanyDetail(unitName: string, force: boolean = false): Promise<CompanyDetailResponse> {
        const params = force ? '?force=true' : '';
        return this.post<CompanyDetailResponse>(`/api/units/company-detail${params}`, {
            unit_name: unitName
        });
    }

    /**
     * Validate a unit name (returns standard name + confidence + suggestions)
     */
    async validateUnitName(unitName: string, force: boolean = false): Promise<UnitValidationResult> {
        const params = force ? '?force=true' : '';
        return this.post<UnitValidationResult>(`/api/units/validate${params}`, {
            unit_name: unitName
        });
    }

    /**
     * Batch classify multiple unit names
     */
    async batchClassify(
        unitNames: string[],
        includeValidation: boolean = true,
        force: boolean = false
    ): Promise<BatchUnitResponse> {
        const params = force ? '?force=true' : '';
        return this.post<BatchUnitResponse>(`/api/units/batch${params}`, {
            unit_names: unitNames,
            include_validation: includeValidation
        });
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<any> {
        return this.get('/health');
    }

    // ============================================================
    // HTTP helpers
    // ============================================================

    private async get<T>(endpoint: string): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: this.buildHeaders()
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`UnitFilter GET ${endpoint} failed (${res.status}): ${text}`);
        }
        return res.json() as Promise<T>;
    }

    private async post<T>(endpoint: string, body: any): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                ...this.buildHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`UnitFilter POST ${endpoint} failed (${res.status}): ${text}`);
        }
        return res.json() as Promise<T>;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }
}
