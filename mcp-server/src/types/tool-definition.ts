/**
 * CanonicalToolDef - 通用工具描述符
 * 
 * 这是 RedAgent 的核心抽象层，将所有渗透测试能力统一描述为
 * 协议无关的工具定义。ToolRegistry 负责将这些定义自动转换为：
 * - MCP Tools (with annotations)
 * - MCP Resources (documentation)
 * - MCP Prompts (usage guides)
 * - A2A Skills (agent card)
 * - REST API Endpoints (future)
 */

import { z, ZodTypeAny } from 'zod';

// ============================================================
// Core Types
// ============================================================

/**
 * MCP 2025-03-26 Tool Annotations
 * @see https://modelcontextprotocol.io/specification/2025-03-26/server/tools
 */
export interface ToolAnnotations {
    /** Human-readable title for the tool */
    title?: string;
    /** If true, the tool does not modify its environment */
    readOnlyHint?: boolean;
    /** If true, the tool may perform destructive updates */
    destructiveHint?: boolean;
    /** If true, calling the tool repeatedly with the same args has no additional effect */
    idempotentHint?: boolean;
    /** If true, the tool may interact with external entities */
    openWorldHint?: boolean;
}

/**
 * Security metadata for penetration testing tools
 */
export interface SecurityMetadata {
    /** Risk classification */
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    /** Whether human approval is required before execution */
    requiresApproval: boolean;
    /** Tool category for classification */
    category: 'reconnaissance' | 'scanning' | 'exploitation' | 'post-exploitation' | 'reporting' | 'utility';
    /** Tags for searchability */
    tags: string[];
}

/**
 * Execution configuration
 */
export interface ExecutionConfig {
    /** How the tool is executed */
    executor: 'docker' | 'native' | 'browser';
    /** Docker container config key (matches containers.yaml) */
    containerConfigKey?: string;
    /** Timeout in milliseconds */
    timeout?: number;
    /** Whether the tool supports streaming output */
    supportsStreaming?: boolean;
}

/**
 * Tool event emitted during execution (for streaming)
 */
export interface ToolEvent {
    type: 'progress' | 'log' | 'result' | 'error';
    data: string;
    /** Progress percentage (0-100), only for type='progress' */
    progress?: number;
    /** Total items, only for type='progress' */
    total?: number;
}

/**
 * Execution context passed to tool handlers
 */
export interface ExecutionContext {
    /** Workspace isolation ID */
    workspaceId?: string;
    /** Unique run identifier */
    runId: string;
    /** Callback for streaming output */
    onProgress?: (event: ToolEvent) => void;
    /** Mode: docker or local */
    mode: 'docker' | 'local';
    /** Abort signal from MCP client — used to cancel long-running operations */
    signal?: AbortSignal;
}

/**
 * The canonical tool definition - protocol-agnostic description of a tool
 */
export interface CanonicalToolDef<TInput extends ZodTypeAny = ZodTypeAny> {
    // === Identity ===
    /** Unique tool name (used as MCP tool name, A2A skill id) */
    name: string;
    /** Human-readable display name */
    displayName: string;
    /** Detailed description of what the tool does */
    description: string;

    // === Schema ===
    /** Input parameters schema (Zod) */
    inputSchema: TInput;

    // === MCP Annotations ===
    annotations: ToolAnnotations;

    // === Security ===
    security: SecurityMetadata;

    // === Execution ===
    execution: ExecutionConfig;

    // === Documentation ===
    /** Path to tool knowledge markdown file (relative to tools dir) */
    knowledgeFile?: string;
    /** External documentation URL */
    documentationUrl?: string;

    // === Handler ===
    /** 
     * The actual tool execution function.
     * Receives validated input and execution context.
     * Returns MCP-compatible content array.
     */
    handler: (
        input: any,
        context: ExecutionContext
    ) => Promise<ToolResult>;
}

/**
 * Tool execution result (MCP-compatible)
 */
export interface ToolResult {
    content: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; data: string; mimeType: string }
        | { type: 'audio'; data: string; mimeType: string }
    >;
    isError?: boolean;
}

// ============================================================
// Tool Registry
// ============================================================

/**
 * ToolRegistry - Central registry for all RedAgent tools
 * 
 * Manages tool lifecycle and provides adapters for different protocols:
 * - registerTool(): Register a CanonicalToolDef
 * - getMcpTools(): Get tools formatted for MCP server.tool() registration
 * - getA2ASkills(): Get skills formatted for A2A Agent Card
 * - getToolByName(): Lookup individual tool
 */
export class ToolRegistry {
    private tools: Map<string, CanonicalToolDef> = new Map();

    /**
     * Register a tool definition
     */
    register<T extends ZodTypeAny>(tool: CanonicalToolDef<T>): void {
        if (this.tools.has(tool.name)) {
            console.warn(`[ToolRegistry] Warning: Overwriting existing tool '${tool.name}'`);
        }
        this.tools.set(tool.name, tool as CanonicalToolDef);
        console.error(`[ToolRegistry] Registered: ${tool.name} [${tool.security.category}/${tool.security.riskLevel}]`);
    }

    /**
     * Get a tool by name
     */
    getToolByName(name: string): CanonicalToolDef | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all registered tools
     */
    getAllTools(): CanonicalToolDef[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get tools filtered by category
     */
    getToolsByCategory(category: SecurityMetadata['category']): CanonicalToolDef[] {
        return this.getAllTools().filter(t => t.security.category === category);
    }

    /**
     * Get tools filtered by risk level
     */
    getToolsByRiskLevel(riskLevel: SecurityMetadata['riskLevel']): CanonicalToolDef[] {
        return this.getAllTools().filter(t => t.security.riskLevel === riskLevel);
    }

    /**
     * Register all tools from this registry to an MCP Server instance
     * This is the MCP protocol adapter
     */
    registerWithMcpServer(server: any): void {
        for (const tool of this.getAllTools()) {
            server.tool(
                tool.name,
                tool.description,
                // Input schema as Zod shape (for MCP SDK)
                tool.inputSchema instanceof z.ZodObject 
                    ? (tool.inputSchema as z.ZodObject<any>).shape 
                    : { input: tool.inputSchema },
                {
                    annotations: tool.annotations
                },
                async (params: any) => {
                    const context: ExecutionContext = {
                        workspaceId: params.workspace_id,
                        runId: crypto.randomUUID(),
                        mode: 'docker'
                    };
                    return tool.handler(params, context);
                }
            );
        }
        console.error(`[ToolRegistry] Registered ${this.tools.size} tools with MCP Server`);
    }

    /**
     * Generate A2A Agent Card skills array
     */
    getA2ASkills(): Array<{
        id: string;
        name: string;
        description: string;
        tags: string[];
    }> {
        return this.getAllTools().map(tool => ({
            id: tool.name,
            name: tool.displayName,
            description: tool.description,
            tags: tool.security.tags
        }));
    }

    /**
     * Generate security summary for all tools
     */
    getSecuritySummary(): Record<string, {
        riskLevel: string;
        requiresApproval: boolean;
        annotations: ToolAnnotations;
    }> {
        const summary: Record<string, any> = {};
        for (const tool of this.getAllTools()) {
            summary[tool.name] = {
                riskLevel: tool.security.riskLevel,
                requiresApproval: tool.security.requiresApproval,
                annotations: tool.annotations
            };
        }
        return summary;
    }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
