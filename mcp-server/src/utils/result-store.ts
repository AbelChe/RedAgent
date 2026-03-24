/**
 * ResultStore - 扫描结果持久化存储
 *
 * 将工具执行的输出保存到磁盘，避免大量结果直接返回给 Agent 造成上下文压力。
 * 策略：
 *   - 所有结果都落盘到 workspace_data/{workspace_id}/results/{tool}_{timestamp}.txt
 *   - 小于阈值的输出：全文返回 + 文件路径引用
 *   - 超过阈值的输出：返回摘要（首尾 N 行 + 统计）+ 文件路径
 *   - Agent 可通过 read_file 工具按需读取完整结果
 *
 * 目录结构：
 *   workspace_data/
 *   └── {workspace_id}/
 *       ├── results/           # 扫描结果（客观）
 *       │   └── bee_{step}/
 *       ├── ai_analysis/       # AI 分析结果
 *       └── verified/          # 预测验证结果
 */
import fs from 'fs';
import path from 'path';

// ============================================================
// Configuration
// ============================================================

/** Output size threshold (bytes). Beyond this, only a summary is returned inline */
const OUTPUT_THRESHOLD_BYTES = 4096; // 4KB

/** Number of head lines to include in summary preview */
const PREVIEW_HEAD_LINES = 40;

/** Number of tail lines to include in summary preview */
const PREVIEW_TAIL_LINES = 10;

// ============================================================
// Types
// ============================================================

/** AI 分析类型 */
export type AnalysisType =
    | 'subdomain_forecast'   // 子域名预测
    | 'ip_forecast'          // IP 预测
    | 'attack_path'          // 攻击路径推荐
    | 'vuln_analysis'        // 漏洞关联分析
    | 'report';              // 智能报告

/** 扫描步骤类型 */
export type ScanStep =
    | 'company'
    | 'cyberspace'
    | 'domain'
    | 'port'
    | 'web'
    | 'web-finger'
    | 'discovery'
    | 'netattrib';

export interface SavedResult {
    /** Absolute path to saved file */
    filePath: string;
    /** Path relative to workspace root (usable with read_file tool) */
    relativePath: string;
    /** File size in bytes */
    size: number;
    /** Total line count */
    lineCount: number;
    /** Timestamp when saved */
    timestamp: string;
}

/** AI 分析结果 */
export interface SavedAnalysis {
    filePath: string;
    relativePath: string;
    analysisType: AnalysisType;
    isForecast: boolean;
    confidence?: number;
    timestamp: string;
}

/** 预测验证结果 */
export interface SavedVerification {
    filePath: string;
    relativePath: string;
    forecastType: 'subdomain' | 'ip';
    hitRate: number;
    timestamp: string;
}

// ============================================================
// ResultStore
// ============================================================

export class ResultStore {
    private baseDir: string;  // workspace_data/

    constructor(baseDir: string) {
        this.baseDir = baseDir;
        // 不再在构造时创建目录，而是按需创建每个 workspace 的子目录
    }

    /**
     * 获取指定 workspace 的根目录路径
     */
    private getWorkspaceDir(workspaceId: string): string {
        return path.join(this.baseDir, workspaceId);
    }

    /**
     * 获取指定 workspace 的 results 目录
     */
    private getResultsDir(workspaceId: string): string {
        return path.join(this.baseDir, workspaceId, 'results');
    }

    /**
     * 获取指定 workspace 的 ai_analysis 目录
     */
    private getAiAnalysisDir(workspaceId: string): string {
        return path.join(this.baseDir, workspaceId, 'ai_analysis');
    }

    /**
     * 获取指定 workspace 的 verified 目录
     */
    private getVerifiedDir(workspaceId: string): string {
        return path.join(this.baseDir, workspaceId, 'verified');
    }

    /**
     * Save tool output to disk and return formatted text for the LLM.
     *
     * @param toolName  The tool/command name (e.g. 'nmap', 'nuclei')
     * @param output    Raw stdout captured from execution
     * @param meta      Optional metadata to embed in the file header
     * @returns         Formatted text containing either full output or summary + file path
     */
    save(
        toolName: string,
        output: string,
        meta?: { command?: string; target?: string; workspaceId?: string }
    ): { text: string; saved: SavedResult } {
        // 新目录结构: workspace_data/{workspace_id}/results/{tool}/
        const workspaceId = meta?.workspaceId || 'default';
        const toolDir = path.join(this.getResultsDir(workspaceId), toolName);
        this.ensureDir(toolDir);

        // Generate timestamped filename
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
        const fileName = `${toolName}_${timestamp}.txt`;
        const filePath = path.join(toolDir, fileName);
        // 相对路径基于 baseDir，便于 read_file 工具使用
        const relativePath = path.relative(this.baseDir, filePath);

        // Build file content with metadata header
        const header = this.buildHeader(toolName, now, meta);
        const fileContent = header + output;

        fs.writeFileSync(filePath, fileContent, 'utf8');

        const lineCount = output.split('\n').length;
        const size = Buffer.byteLength(output, 'utf8');

        const saved: SavedResult = {
            filePath,
            relativePath,
            size,
            lineCount,
            timestamp: now.toISOString()
        };

        // Format the inline text based on output size
        const text = this.formatInlineResult(output, saved);

        return { text, saved };
    }

    /**
     * List all saved result files for a given tool in a workspace
     */
    listResults(toolName: string, workspaceId: string = 'default'): string[] {
        const toolDir = path.join(this.getResultsDir(workspaceId), toolName);
        if (!fs.existsSync(toolDir)) return [];

        return fs.readdirSync(toolDir)
            .filter(f => f.endsWith('.txt') || f.endsWith('.json'))
            .sort()
            .reverse();
    }

    /**
     * List all workspaces (top-level directories under baseDir)
     */
    listWorkspaces(): string[] {
        if (!fs.existsSync(this.baseDir)) return [];
        return fs.readdirSync(this.baseDir).filter(d =>
            fs.statSync(path.join(this.baseDir, d)).isDirectory()
        );
    }

    // ============================================================
    // Private helpers
    // ============================================================

    /**
     * Format the text that will be returned inline to the LLM
     */
    private formatInlineResult(output: string, saved: SavedResult): string {
        const sizeStr = this.formatBytes(saved.size);
        const fileRef = `📄 Results saved: ${saved.relativePath} (${saved.lineCount} lines, ${sizeStr})`;

        if (saved.size <= OUTPUT_THRESHOLD_BYTES) {
            // Small output → return full content + file reference
            return `${output}\n\n---\n${fileRef}`;
        }

        // Large output → return summary + file reference
        const lines = output.split('\n');
        const headLines = lines.slice(0, PREVIEW_HEAD_LINES);
        const tailLines = lines.slice(-PREVIEW_TAIL_LINES);
        const omitted = lines.length - PREVIEW_HEAD_LINES - PREVIEW_TAIL_LINES;

        let preview = headLines.join('\n');
        if (omitted > 0) {
            preview += `\n\n... [${omitted} lines omitted] ...\n\n`;
            preview += tailLines.join('\n');
        }

        return [
            `📊 Scan completed — output is large, saved to disk.`,
            ``,
            `📈 Stats: ${saved.lineCount} lines, ${sizeStr}`,
            `📄 File: ${saved.relativePath}`,
            ``,
            `--- Preview (first ${PREVIEW_HEAD_LINES} + last ${PREVIEW_TAIL_LINES} lines) ---`,
            preview,
            `--- End Preview ---`,
            ``,
            `💡 Tip: Use \`read_file\` tool with path "${saved.relativePath}" to view full results or specific sections.`
        ].join('\n');
    }

    /**
     * Build metadata header for the saved file
     */
    private buildHeader(
        toolName: string,
        timestamp: Date,
        meta?: { command?: string; target?: string; workspaceId?: string }
    ): string {
        const lines = [
            `# RedAgent Scan Results`,
            `# Tool: ${toolName}`,
            `# Time: ${timestamp.toISOString()}`,
        ];
        if (meta?.command) lines.push(`# Command: ${meta.command}`);
        if (meta?.target) lines.push(`# Target: ${meta.target}`);
        if (meta?.workspaceId) lines.push(`# Workspace: ${meta.workspaceId}`);
        lines.push(`# ` + '='.repeat(60), ``);
        return lines.join('\n') + '\n';
    }

    private ensureDir(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    // ============================================================
    // AI Analysis Methods
    // ============================================================

    /**
     * Load the most recent result file for a given scan step.
     * Returns parsed JSON if the content is JSON, otherwise returns raw text.
     *
     * @param step       The scan step (company, cyberspace, domain, port, web, web-finger)
     * @param workspaceId Workspace ID (defaults to 'default')
     * @returns          The loaded content (parsed JSON or raw string) and file metadata
     */
    loadResult(
        step: ScanStep,
        workspaceId: string = 'default'
    ): { data: any; filePath: string; relativePath: string } | null {
        const toolName = `bee_${step}`;
        const toolDir = path.join(this.getResultsDir(workspaceId), toolName);

        if (!fs.existsSync(toolDir)) {
            return null;
        }

        // Find the most recent file
        const files = fs.readdirSync(toolDir)
            .filter(f => f.endsWith('.txt') || f.endsWith('.json'))
            .sort()
            .reverse();

        if (files.length === 0) {
            return null;
        }

        const filePath = path.join(toolDir, files[0]);
        const relativePath = path.relative(this.baseDir, filePath);
        const content = fs.readFileSync(filePath, 'utf8');

        // Strip header comments if present
        const contentWithoutHeader = this.stripHeader(content);

        // Try to parse as JSON
        let data: any;
        try {
            data = JSON.parse(contentWithoutHeader);
        } catch {
            data = contentWithoutHeader;
        }

        return { data, filePath, relativePath };
    }

    /**
     * List all result files for a workspace
     */
    listResultsForWorkspace(workspaceId: string = 'default'): { step: ScanStep; files: string[] }[] {
        const resultsDir = this.getResultsDir(workspaceId);

        if (!fs.existsSync(resultsDir)) {
            return [];
        }

        const result: { step: ScanStep; files: string[] }[] = [];
        const stepDirs = fs.readdirSync(resultsDir).filter(d =>
            fs.statSync(path.join(resultsDir, d)).isDirectory()
        );

        for (const dir of stepDirs) {
            // Extract step name from directory (e.g., "bee_company" -> "company")
            const stepMatch = dir.match(/^bee_(.+)$/);
            if (stepMatch) {
                const step = stepMatch[1] as ScanStep;
                const files = fs.readdirSync(path.join(resultsDir, dir))
                    .filter(f => f.endsWith('.txt') || f.endsWith('.json'))
                    .sort()
                    .reverse();
                if (files.length > 0) {
                    result.push({ step, files });
                }
            }
        }

        return result;
    }

    /**
     * Save AI analysis result.
     *
     * @param analysisType  The type of analysis (subdomain_forecast, ip_forecast, attack_path, vuln_analysis, report)
     * @param data          The analysis result data (will be serialized to JSON)
     * @param confidence    Optional confidence score (0-1) for forecast types
     * @param workspaceId   Workspace ID
     * @returns             Saved analysis metadata
     */
    saveAnalysis(
        analysisType: AnalysisType,
        data: any,
        confidence?: number,
        workspaceId: string = 'default'
    ): SavedAnalysis {
        const analysisDir = this.getAiAnalysisDir(workspaceId);
        this.ensureDir(analysisDir);

        const now = new Date();
        const isForecast = analysisType === 'subdomain_forecast' || analysisType === 'ip_forecast';

        // Build file content with metadata
        const fileName = `${analysisType}.json`;
        const filePath = path.join(analysisDir, fileName);
        const relativePath = path.relative(this.baseDir, filePath);

        const content = {
            _meta: {
                analysis_type: analysisType,
                is_forecast: isForecast,
                confidence: confidence,
                generated_at: now.toISOString(),
                source: 'ai_analysis',
                workspace_id: workspaceId
            },
            ...data
        };

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');

        return {
            filePath,
            relativePath,
            analysisType,
            isForecast,
            confidence,
            timestamp: now.toISOString()
        };
    }

    /**
     * Load an existing AI analysis result.
     */
    loadAnalysis(
        analysisType: AnalysisType,
        workspaceId: string = 'default'
    ): { data: any; filePath: string; relativePath: string } | null {
        const fileName = `${analysisType}.json`;
        const filePath = path.join(this.getAiAnalysisDir(workspaceId), fileName);

        if (!fs.existsSync(filePath)) {
            return null;
        }

        const relativePath = path.relative(this.baseDir, filePath);
        const content = fs.readFileSync(filePath, 'utf8');

        try {
            const data = JSON.parse(content);
            return { data, filePath, relativePath };
        } catch {
            return null;
        }
    }

    /**
     * Save forecast verification result.
     * This compares AI predictions against actual scan results.
     *
     * @param forecastType  Type of forecast being verified (subdomain or ip)
     * @param data          Verification data including predictions and actuals
     * @param workspaceId   Workspace ID
     */
    saveVerification(
        forecastType: 'subdomain' | 'ip',
        data: {
            predictions: string[];
            actuals: string[];
            hits: string[];
            misses: string[];
            extra_findings: string[];
        },
        workspaceId: string = 'default'
    ): SavedVerification {
        const verifyDir = this.getVerifiedDir(workspaceId);
        this.ensureDir(verifyDir);

        const now = new Date();
        const fileName = `${forecastType}_verified.json`;
        const filePath = path.join(verifyDir, fileName);
        const relativePath = path.relative(this.baseDir, filePath);

        const hitRate = data.predictions.length > 0
            ? data.hits.length / data.predictions.length
            : 0;

        const content = {
            _meta: {
                forecast_type: forecastType,
                verified_at: now.toISOString(),
                hit_rate: hitRate,
                workspace_id: workspaceId
            },
            ...data
        };

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');

        return {
            filePath,
            relativePath,
            forecastType,
            hitRate,
            timestamp: now.toISOString()
        };
    }

    /**
     * Strip header comments from file content.
     * Headers are lines starting with '# ' at the beginning of the file.
     */
    private stripHeader(content: string): string {
        const lines = content.split('\n');
        let startIndex = 0;

        // Skip header lines (lines starting with '#')
        while (startIndex < lines.length && lines[startIndex].startsWith('#')) {
            startIndex++;
        }

        // Skip empty lines after header
        while (startIndex < lines.length && lines[startIndex].trim() === '') {
            startIndex++;
        }

        return lines.slice(startIndex).join('\n');
    }
}
