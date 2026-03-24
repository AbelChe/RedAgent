/**
 * RedAgent MCP Server - Main Entry Point
 * 
 * Protocol Compliance:
 * - MCP 2025-03-26 (Streamable HTTP, Tool Annotations, standard notifications)
 * - A2A v0.3.0 (Agent Card, Task JSON-RPC)
 * 
 * Transport Modes:
 * - --mode http   : Streamable HTTP (for Claude Code HTTP, VSCode HTTP)
 * - --mode stdio  : stdio (for Claude Code stdio, VSCode stdio, Cursor, Windsurf)
 * - --mode ws     : WebSocket reverse connection (legacy Hub compatibility)
 * 
 * Architecture:
 * - ToolRegistry (CanonicalToolDef) → protocol-agnostic tool definitions
 * - MCP Adapter → server.tool() with annotations
 * - A2A Adapter → Agent Card + /a2a endpoint
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Config loaded first to ensure env vars are set
import { Config } from './config';

import { z } from "zod";
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { DockerExecutor } from './executor';
import { SessionManager } from './session';
import { BrowserHandler } from './browser';
import { WebSocketReverseTransport } from './transport';
import { StreamableHttpTransport } from './http-transport';
import { KnowledgeLoader } from './knowledge_loader';
import { TerminalManager } from './terminal';

// Tool Registry & Definitions
import { toolRegistry, ExecutionContext } from './types/tool-definition';
import { createSessionTools } from './tools/session-tools';
import { createScanningTools } from './tools/scanning-tools';
import { createFileTools } from './tools/file-tools';
import { createBrowserTools } from './tools/browser-tools';
import { createBeeTools } from './tools/bee-tools';
import { createWorkspaceTools } from './tools/workspace-tools';
import { createCommandTool } from './tools/command-tools';

// Workspace Context
import { workspaceContext } from './workspace-context';

// A2A Protocol
import { registerA2AEndpoints } from './a2a/agent-card';

// ============================================================
// Parse CLI Arguments
// ============================================================

function parseArgs() {
    const args = process.argv.slice(2);
    let mode: 'http' | 'stdio' | 'ws' = 'stdio'; // Default to stdio for maximum compatibility
    let port = parseInt(process.env.MCP_HTTP_PORT || '3001');
    let executionMode: 'docker' | 'local' = 'docker';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--mode' && args[i + 1]) {
            const m = args[i + 1].toLowerCase();
            if (m === 'http' || m === 'stdio' || m === 'ws') {
                mode = m;
            }
            i++;
        }
        if (args[i] === '--port' && args[i + 1]) {
            port = parseInt(args[i + 1]);
            i++;
        }
        if (args[i] === '--local' || args[i] === 'local') {
            executionMode = 'local';
        }
    }

    // Auto-detect mode from env
    if (Config.mcpHubUrl && mode === 'stdio') {
        mode = 'ws'; // Legacy: if hub URL is set, use WebSocket
    }

    return { mode, port, executionMode };
}

const { mode: transportMode, port: httpPort, executionMode } = parseArgs();

console.error(`[RedAgent MCP] Transport: ${transportMode} | Execution: ${executionMode} | Port: ${httpPort}`);

// ============================================================
// Initialize Server
// ============================================================

const server = new McpServer({
    name: "RedAgent Pentest MCP Server",
    version: "2.0.0"
});

// ============================================================
// Setup Paths
// ============================================================

let TOOLS_DIR = path.resolve(__dirname, '../tools');
const EXTERNAL_TOOLS_DIR = '/app/config/tools';

if (fs.existsSync(EXTERNAL_TOOLS_DIR)) {
    console.error(`[RedAgent MCP] External tools: ${EXTERNAL_TOOLS_DIR}`);
    TOOLS_DIR = EXTERNAL_TOOLS_DIR;
} else {
    console.error(`[RedAgent MCP] Using default tools dir: ${TOOLS_DIR}`);
}

const WORKSPACE_DIR = path.resolve(__dirname, '../workspace_data');
if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// ============================================================
// Initialize Components
// ============================================================

const executor = new DockerExecutor();
const sessionManager = new SessionManager(executor);
const browserHandler = new BrowserHandler();
const terminalManager = new TerminalManager(server);
const knowledgeLoader = new KnowledgeLoader(TOOLS_DIR);
const containerConfig = Config.containerConfig;

// Global transport reference
let globalTransport: any = null;

// ============================================================
// Register Terminal Notification Handlers
// ============================================================

(server.server as any).setNotificationHandler(z.object({
    method: z.literal("terminal/input"),
    params: z.object({
        sessionId: z.string(),
        data: z.string()
    })
}), async ({ params }: { params: { sessionId: string, data: string } }) => {
    terminalManager.handleInput(params.sessionId, params.data);
});

(server.server as any).setNotificationHandler(z.object({
    method: z.literal("terminal/resize"),
    params: z.object({
        sessionId: z.string(),
        cols: z.number(),
        rows: z.number()
    })
}), async ({ params }: { params: { sessionId: string, cols: number, rows: number } }) => {
    await terminalManager.handleResize(params.sessionId, params.cols, params.rows);
});

// ============================================================
// Register Tools via ToolRegistry
// ============================================================

// 1. Session tools
for (const tool of createSessionTools(sessionManager, terminalManager)) {
    toolRegistry.register(tool);
}

// 2. Scanning tools (nmap_scan, execute_command) — results persisted to disk
for (const tool of createScanningTools(executor, containerConfig, executionMode, WORKSPACE_DIR)) {
    toolRegistry.register(tool);
}

// 3. File tools
for (const tool of createFileTools(WORKSPACE_DIR)) {
    toolRegistry.register(tool);
}

// 4. Workspace management tools
for (const tool of createWorkspaceTools()) {
    toolRegistry.register(tool);
}

// Command tool (CLI-style interface)
toolRegistry.register(createCommandTool());

// 5. Browser tools
for (const tool of createBrowserTools(browserHandler)) {
    toolRegistry.register(tool);
}

// 6. Bee scanning tools (bee_scan, bee_status, bee_result, bee_verify_unit) — async reconnaissance
if (Config.beeApiUrl) {
    for (const tool of createBeeTools(
        Config.beeApiUrl,
        Config.beeApiToken || '',
        WORKSPACE_DIR,
        Config.beeTaskQueue,
        Config.unitFilterUrl,
        Config.unitFilterToken,
        Config.icpApiUrl,
        Config.icpApiToken,
        Config.addrApiUrl,
        Config.addrApiToken
    )) {
        toolRegistry.register(tool);
    }
    console.error(`🐝 Bee tools enabled (API: ${Config.beeApiUrl})`);
} else {
    console.error(`⚠️ Bee tools disabled — set BEE_API_URL to enable`);
}

// ============================================================
// Register with MCP Server (with annotations)
// ============================================================

/**
 * Register each tool from the registry with the MCP server.
 * This uses the MCP 2025-03-26 tool annotations format.
 */
function registerToolsWithMcp() {
    for (const tool of toolRegistry.getAllTools()) {
        // Build the Zod shape for MCP SDK
        const shape = tool.inputSchema instanceof z.ZodObject
            ? (tool.inputSchema as z.ZodObject<any>).shape
            : { input: tool.inputSchema };

        // Append knowledgeFile hint to description so Agent can discover usage guides
        let description = tool.description;
        if (tool.knowledgeFile) {
            const promptName = `usage-${path.basename(tool.knowledgeFile, '.md')}`;
            description += `\nFor usage guide, use the prompt: ${promptName}`;
        }

        // Use the 5-arg overload: name, description, schema, annotations, callback
        server.tool(
            tool.name,
            description,
            shape,
            {
                title: tool.annotations.title,
                readOnlyHint: tool.annotations.readOnlyHint,
                destructiveHint: tool.annotations.destructiveHint,
                idempotentHint: tool.annotations.idempotentHint,
                openWorldHint: tool.annotations.openWorldHint
            },
            async (params: any, extra: any) => {
                // Build execution context with MCP-standard progress logging
                const context: ExecutionContext = {
                    workspaceId: params.workspace_id || workspaceContext.getCurrentWorkspaceId(),
                    runId: crypto.randomUUID(),
                    mode: executionMode as 'docker' | 'local',
                    signal: extra?.signal,  // Pass MCP AbortSignal to enable container cancellation
                    onProgress: (event) => {
                        // Use MCP standard logging instead of custom notifications
                        try {
                            const srv = server as any;
                            if (srv.server && typeof srv.server.sendLoggingMessage === 'function') {
                                srv.server.sendLoggingMessage({
                                    level: event.type === 'error' ? 'error' : 'info',
                                    logger: tool.name,
                                    data: event.data
                                });
                            }
                        } catch (e) {
                            // Logging failure should not break tool execution
                        }
                    }
                };

                return tool.handler(params, context) as any;
            }
        );
    }
    console.error(`[RedAgent MCP] ${toolRegistry.getAllTools().length} tools registered with MCP server (with annotations)`);
}

registerToolsWithMcp();

// ============================================================
// Register Resources (Tool Documentation)
// ============================================================

server.resource(
    "tool-doc",
    new ResourceTemplate("pentest://tools/{toolName}", { list: undefined }),
    async (uri, { toolName }) => {
        if (typeof toolName !== 'string' || toolName.includes('..') || toolName.includes('/') || toolName.includes('\\')) {
            throw new Error("Invalid tool name");
        }

        const filePath = path.join(TOOLS_DIR, `${toolName}.md`);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return {
                contents: [{
                    uri: uri.href,
                    text: content
                }]
            };
        } catch (e) {
            throw new Error(`Tool '${toolName}' not found.`);
        }
    }
);

// ============================================================
// Start Server
// ============================================================

async function run() {
    // Verify Docker Images
    if (executionMode === 'docker') {
        console.error('[RedAgent MCP] Verifying Docker images...');
        const imagesToCheck = new Set<string>();
        for (const [_, config] of Object.entries(containerConfig)) {
            if (config && config.image) {
                imagesToCheck.add(config.image);
            }
        }
        for (const imageName of imagesToCheck) {
            const exists = await executor.ensureImage(imageName);
            if (exists) {
                console.error(`  ✅ ${imageName}`);
            } else {
                console.error(`  ⚠️  Missing: ${imageName}`);
            }
        }
    }

    // Load Knowledge Prompts
    await knowledgeLoader.registerPrompts(server);

    // Register workspace command prompts (for slash completion in supported clients)
    server.prompt(
        'workspace-list',
        {},
        async () => ({
            messages: [{
                role: "user",
                content: { type: "text", text: "Execute command: workspace list" }
            }]
        })
    );

    server.prompt(
        'workspace-create',
        { name: z.string().optional().describe("Workspace name") },
        async ({ name }) => ({
            messages: [{
                role: "user",
                content: { type: "text", text: `Execute command: workspace create ${name || ''}`.trim() }
            }]
        })
    );

    server.prompt(
        'workspace-current',
        {},
        async () => ({
            messages: [{
                role: "user",
                content: { type: "text", text: "Execute command: workspace current" }
            }]
        })
    );

    // ============================================================
    // Select Transport Mode
    // ============================================================

    switch (transportMode) {
        case 'http': {
            // Mode 1: Streamable HTTP (MCP 2025-03-26)
            console.error(`[RedAgent MCP] Starting Streamable HTTP on port ${httpPort}...`);
            const transport = new StreamableHttpTransport(httpPort, '/mcp', Config.mcpToken);
            globalTransport = transport;

            // Register A2A endpoints on the same Express app
            registerA2AEndpoints(transport.getApp(), toolRegistry, `http://localhost:${httpPort}`, executionMode as 'docker' | 'local');

            await server.connect(transport);
            console.error(`[RedAgent MCP] ✅ Streamable HTTP ready at http://localhost:${httpPort}/mcp`);
            console.error(`[RedAgent MCP] ✅ A2A Agent Card at http://localhost:${httpPort}/.well-known/agent.json`);
            console.error(`[RedAgent MCP] ✅ Health check at http://localhost:${httpPort}/health`);
            break;
        }

        case 'ws': {
            // Mode 2: WebSocket reverse connection (legacy Hub compatibility)
            const hubUrl = Config.mcpHubUrl;
            const token = Config.mcpToken;
            if (!hubUrl) {
                console.error('[RedAgent MCP] ERROR: --mode ws requires MCP_HUB_URL environment variable');
                process.exit(1);
            }
            console.error(`[RedAgent MCP] Starting WebSocket connection to ${hubUrl}...`);
            const transport = new WebSocketReverseTransport(hubUrl, token || "");
            globalTransport = transport;
            await server.connect(transport);
            console.error('[RedAgent MCP] ✅ Connected to Hub via WebSocket');
            break;
        }

        case 'stdio':
        default: {
            // Mode 3: stdio (maximum compatibility)
            console.error('[RedAgent MCP] Starting stdio transport...');
            const transport = new StdioServerTransport();
            globalTransport = transport;
            await server.connect(transport);
            console.error('[RedAgent MCP] ✅ stdio transport ready');
            break;
        }
    }
}

run().catch((err) => {
    console.error('[RedAgent MCP] Fatal error:', err);
    process.exit(1);
});
