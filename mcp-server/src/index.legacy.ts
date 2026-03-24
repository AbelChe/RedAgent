import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Config loaded first to ensure env vars are set
import { Config } from './config';

import { z } from "zod";
import fs from 'fs';
import path from 'path';
import { DockerExecutor } from './executor';
import { SessionManager } from './session';
import { BrowserHandler } from './browser';
import { WebSocketReverseTransport } from './transport';
import { KnowledgeLoader } from './knowledge_loader';
import { TerminalManager } from './terminal';

import crypto from 'crypto';

// Initialize Server
const server = new McpServer({
    name: "Pentest Knowledge Server",
    version: "1.0.0"
});

// ... (skipping context, I will target executeTool replacment)
// Wait, I cannot skip context in replace_file_content effectively if I target imports AND executeTool separately if they are far apart.
// I will target imports first.

// Setup paths
// Setup paths
let TOOLS_DIR = path.resolve(__dirname, '../tools');
const EXTERNAL_TOOLS_DIR = '/app/config/tools';

if (fs.existsSync(EXTERNAL_TOOLS_DIR)) {
    console.error(`MCP: Detected external tools configuration at ${EXTERNAL_TOOLS_DIR}`);
    TOOLS_DIR = EXTERNAL_TOOLS_DIR;
} else {
    console.error(`MCP: No external tools found at ${EXTERNAL_TOOLS_DIR}. Using default: ${TOOLS_DIR}`);
}
const WORKSPACE_DIR = path.resolve(__dirname, '../workspace_data');
if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// Initialize Logic
const executor = new DockerExecutor();
const sessionManager = new SessionManager(executor);

// Global transport reference (will be set in run())
let globalTransport: any = null;

// Initialize Terminal Manager (will receive transport reference later)
const terminalManager = new TerminalManager(server);
const knowledgeLoader = new KnowledgeLoader(TOOLS_DIR); // Use tools dir
const containerConfig = Config.containerConfig;

// Terminal Notifications
// We use setNotificationHandler to register listeners.
// The SDK requires the schema to contain a 'method' literal to route the notification.
(server.server as any).setNotificationHandler(z.object({
    method: z.literal("terminal/input"),
    params: z.object({
        sessionId: z.string(),
        data: z.string()
    })
}), async ({ params }: { params: { sessionId: string, data: string } }) => {
    // The handler receives the full validated message or part of it depending on SDK, 
    // but usually if we validate the whole object, we get the whole object.
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


// ... (existing tools)

/**
 * Tool: Create Session
 */
server.tool(
    "create_session",
    {
        container: z.string().optional().describe("Container name to attach to (default: pentest-sandbox)")
    },
    async ({ container }) => {
        try {
            const session = sessionManager.createSession(container || 'pentest-sandbox');
            return {
                content: [{
                    type: "text",
                    text: `Session created: ${session.id} (Container: ${session.containerName})`
                }]
            };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Error creating session: ${e.message}` }], isError: true };
        }
    }
);

// ... (existing tools)

/**
 * Tool: Start Terminal
 */
server.tool(
    "start_terminal",
    {
        id: z.string().describe("Session ID to use (frontend generated)"),
        image: z.string().optional().describe("Image to start")
    },
    async ({ id, image }) => {
        try {
            await terminalManager.createTerminal(id, image);
            return {
                content: [{ type: "text", text: `Terminal started: ${id}` }]
            };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    "run_shell",
    {
        sessionId: z.string().describe("Session ID"),
        command: z.string().describe("Shell command to execute")
    },
    async ({ sessionId, command }) => {
        try {
            const output = await sessionManager.runCommand(sessionId, command, (data) => {
                // Attempt to send logging notification
                // We cast to any because McpServer's type definition might hide the underlying Server instance
                // or specific methods depending on SDK version.
                const srv = server as any;
                if (srv.server && typeof srv.server.sendLoggingMessage === 'function') {
                    srv.server.sendLoggingMessage({
                        level: "info",
                        data: data
                    });
                }
            });
            return {
                content: [{
                    type: "text",
                    text: output
                }]
            };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Error executing shell: ${e.message}` }], isError: true };
        }
    }
);

const mode = process.argv.includes('--mode') && process.argv.includes('local') ? 'local' : 'docker';

console.error(`MCP: Initializing in ${mode} mode`);

/**
 * Resource: Available Tools Documentation
 */
server.resource(
    "tool-doc",
    new ResourceTemplate("pentest://tools/{toolName}", { list: undefined }),
    async (uri, { toolName }) => {
        // Security Check
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

/**
 * Tool: Nmap Scan (High Level)
 */
server.tool(
    "nmap_scan",
    {
        target: z.string().describe("Target IP or Hostname"),
        profile: z.enum(["ping", "quick", "full", "versions", "os"]).default("quick").describe("Scan profile"),
        workspace_id: z.string().optional().describe("Workspace isolation ID")
    },
    async ({ target, profile, workspace_id }) => {
        // ... (Existing Nmap Logic implementation, reusing execute_command logic internally would be better but let's keep it simple)
        const toolName = "nmap";
        const profiles: Record<string, string[]> = {
            "ping": ["-sn"],
            "quick": ["-F"],
            "full": ["-p-", "-T4"],
            "versions": ["-sV", "-sC", "--version-light"],
            "os": ["-O", "--osscan-limit"]
        };
        const args = [...profiles[profile], target];

        // Delegate to common execution logic
        return await executeTool(toolName, args, workspace_id);
    }
);

/**
 * Tool: Execute Command (Generic)
 * Allows the Agent to run supported tools directly.
 */
server.tool(
    "execute_command",
    {
        command: z.string().describe("Full command to execute (e.g., 'nmap -sV target.com')"),
        workspace_id: z.string().optional().describe("Workspace isolation ID")
    },
    async ({ command, workspace_id }) => {
        // 1. Parse Command
        const parts = command.trim().split(/\s+/);
        if (parts.length === 0) {
            return { content: [{ type: "text", text: "Error: Empty command" }], isError: true };
        }

        const toolName = parts[0];
        const args = parts.slice(1);

        console.error(`MCP: Received execute_command request: ${toolName} args: ${args.join(' ')}`);

        // 2. Execute
        return await executeTool(toolName, args, workspace_id);
    }
);

// Helper function to unify execution logic
// Helper function to unify execution logic
// Helper function to unify execution logic
async function executeTool(toolName: string, args: string[], workspaceId?: string) {
    // Generate truly unique runId using crypto.randomUUID
    const runId = crypto.randomUUID();
    const fullCommand = `${toolName} ${args.join(' ')}`;

    // Determine volume name if workspaceId provided
    const volumeName = workspaceId ? `pentest-ws-${workspaceId}` : undefined;

    try {
        // Detect if command contains shell syntax (&&, ||, |, ;, if, for, while, etc.)
        const shellSyntaxPattern = /[;&|<>(){}]|^\s*(if|for|while|case|until|select)\b/;
        const needsShell = shellSyntaxPattern.test(fullCommand);

        const cmd = needsShell
            ? ["/bin/sh", "-c", fullCommand]  // Wrap in shell for complex syntax
            : [toolName, ...args];             // Direct execution for simple commands

        if (needsShell) {
            console.error(`🐚 [MCP-SHELL] Command contains shell syntax, wrapping in /bin/sh -c`);
        }

        if (mode === 'docker') {
            // Real-time logging callback for streaming container output
            const streamLogger = (data: string) => {
                // Send real-time output via custom 'tool/log' notification to identify tool source
                // Use globalTransport if available, otherwise try to use server access
                if (globalTransport) {
                    try {
                        globalTransport.send({
                            jsonrpc: "2.0",
                            method: "tool/log",
                            params: {
                                tool: toolName,
                                runId: runId,
                                command: fullCommand,
                                data: data,
                                workspaceId: workspaceId // Pass workspace context
                            }
                        });
                    } catch (e) {
                        console.error("MCP: Failed to send log notification", e);
                    }
                } else {
                    console.error("MCP: No transport available for logging");
                }
            };

            // Helper to send exit status
            const sendExitStatus = (status: 'completed' | 'failed', error?: string) => {
                if (globalTransport) {
                    try {
                        globalTransport.send({
                            jsonrpc: "2.0",
                            method: "tool/exit",
                            params: {
                                tool: toolName,
                                runId: runId,
                                status: status,
                                error: error,
                                workspaceId: workspaceId // Pass workspace context
                            }
                        });
                    } catch (e) {
                        console.error("MCP: Failed to send exit notification", e);
                    }
                }
            };

            // Smart Routing
            try {
                const toolConfig = containerConfig[toolName];
                let output = "";
                if (toolConfig) {
                    output = await executor.executeEphemeralCaptured(cmd, toolConfig, streamLogger, volumeName);
                } else if (containerConfig.default) {
                    // Default fallback container
                    console.error(`MCP: Routing ${toolName} to default container: ${containerConfig.default.image}`);
                    output = await executor.executeEphemeralCaptured(cmd, {
                        ...containerConfig.default,
                    }, streamLogger, volumeName);
                } else {
                    // Absolute Fallback: Main Sandbox (Long running) - preserving original logic
                    console.error(`MCP: Tool '${toolName}' not configured. Running in shared sandbox.`);
                    output = await executor.execute(cmd);
                }

                sendExitStatus('completed');
                return {
                    content: [{
                        type: "text" as const,
                        text: output
                    }]
                };
            } catch (error: any) {
                sendExitStatus('failed', error.message);
                throw error;
            }
        } else {
            return {
                content: [{
                    type: "text" as const,
                    text: "Error: Local execution is disabled for security. MCP is running in Docker-only mode."
                }],
                isError: true
            };
        }
    } catch (error: any) {
        return {
            content: [{ type: "text" as const, text: `Execution Error: ${error.message}` }],
            isError: true
        };
    }
}

/**
 * Tool: Read File
 */
server.tool(
    "read_file",
    { path: z.string().describe("Relative path within workspace") },
    async ({ path: relPath }) => {
        const safePath = path.normalize(path.join(WORKSPACE_DIR, relPath));
        if (!safePath.startsWith(WORKSPACE_DIR)) {
            return { content: [{ type: "text", text: "Access denied: Path outside workspace" }], isError: true };
        }

        try {
            const content = fs.readFileSync(safePath, 'utf8');
            return { content: [{ type: "text", text: content }] };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Error reading file: ${e.message}` }], isError: true };
        }
    }
);

/**
 * Tool: Write File
 */
server.tool(
    "write_file",
    {
        path: z.string().describe("Relative path within workspace"),
        content: z.string().describe("Content to write")
    },
    async ({ path: relPath, content }) => {
        const safePath = path.normalize(path.join(WORKSPACE_DIR, relPath));
        if (!safePath.startsWith(WORKSPACE_DIR)) {
            return { content: [{ type: "text", text: "Access denied: Path outside workspace" }], isError: true };
        }

        try {
            fs.writeFileSync(safePath, content, 'utf8');
            return { content: [{ type: "text", text: `Success: Written ${content.length} bytes to ${relPath}` }] };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Error writing file: ${e.message}` }], isError: true };
        }
    }
);

// Initialize Browser
const browserHandler = new BrowserHandler();

/**
 * Tool: Visit Page (Browser)
 */
server.tool(
    "visit_page",
    {
        url: z.string().url().describe("URL to visit")
    },
    async ({ url }) => {
        try {
            console.error(`MCP: Visiting ${url}...`);
            const result = await browserHandler.visitPage(url);

            return {
                content: [
                    {
                        type: "text",
                        text: `Title: ${result.title}\n\n${result.content}`
                    },
                    {
                        type: "image",
                        data: result.screenshot,
                        mimeType: "image/jpeg"
                    }
                ]
            };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Error visiting page: ${e.message}` }], isError: true };
        }
    }
);

// Start Server
async function run() {
    // Check Docker Images (Docker mode only)
    if (mode === 'docker') {
        console.error('[MCP-INIT] Verifying Docker images...');
        const imagesToCheck = new Set<string>();

        // Collect unique images from container config
        for (const [toolName, config] of Object.entries(containerConfig)) {
            if (config && config.image) {
                imagesToCheck.add(config.image);
            }
        }

        // Check each image
        for (const imageName of imagesToCheck) {
            const exists = await executor.ensureImage(imageName);
            if (exists) {
                console.error(`✅ [MCP-INIT] Image ready: ${imageName}`);
            } else {
                console.error(`⚠️  [MCP-INIT] Image missing: ${imageName} (run 'docker pull ${imageName}')`);
            }
        }
        console.error('[MCP-INIT] Image verification complete.');
    }

    // Load Knowledge
    await knowledgeLoader.registerPrompts(server);

    const hubUrl = Config.mcpHubUrl;
    const token = Config.mcpToken;

    if (hubUrl) {
        console.error(`MCP: Starting in Cloud Mode (Connecting to ${hubUrl})...`);
        const transport = new WebSocketReverseTransport(hubUrl, token || "");
        globalTransport = transport; // Save reference for TerminalManager
        // Terminal notifications now use MCP standard sendLoggingMessage (no transport needed)
        await server.connect(transport);
        console.error("MCP: Connected to Cloud Hub");
    } else {
        console.error("MCP: Starting in Local Mode (Stdio)");
        const transport = new StdioServerTransport();
        globalTransport = transport; // Save reference for TerminalManager
        // Terminal notifications now use MCP standard sendLoggingMessage (no transport needed)
        await server.connect(transport);
    }
}

run().catch(console.error);
