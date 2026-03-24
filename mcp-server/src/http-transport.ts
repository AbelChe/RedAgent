/**
 * Streamable HTTP Transport for MCP 2025-03-26
 * 
 * Implements the MCP Streamable HTTP transport specification:
 * - Single HTTP endpoint (/mcp)
 * - POST: Send JSON-RPC request/notification/response
 * - GET: Establish SSE stream for server-initiated messages
 * - Mcp-Session-Id header for session management
 * - Backwards compatible with older HTTP+SSE transport
 * 
 * @see https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

// ============================================================
// Session Management
// ============================================================

interface HttpSession {
    id: string;
    createdAt: number;
    lastActivity: number;
    sseResponse?: Response;
}

// ============================================================
// StreamableHttpTransport
// ============================================================

export class StreamableHttpTransport implements Transport {
    private app: express.Express;
    private sessions: Map<string, HttpSession> = new Map();
    private port: number;
    private mcpEndpoint: string;
    private authToken?: string;

    // Transport interface callbacks
    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public onmessage?: (message: JSONRPCMessage) => void;

    // Current active session for sending
    private activeSseResponses: Set<Response> = new Set();

    constructor(port: number = 3001, mcpEndpoint: string = '/mcp', authToken?: string) {
        this.port = port;
        this.mcpEndpoint = mcpEndpoint;
        this.authToken = authToken;
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Get the Express app instance (for adding additional routes like A2A)
     */
    getApp(): express.Express {
        return this.app;
    }

    // ============================================================
    // Transport Interface Implementation
    // ============================================================

    async start(): Promise<void> {
        return new Promise((resolve) => {
            this.app.listen(this.port, () => {
                console.error(`[HTTP-Transport] Streamable HTTP server listening on port ${this.port}`);
                console.error(`[HTTP-Transport] MCP endpoint: http://localhost:${this.port}${this.mcpEndpoint}`);
                resolve();
            });
        });
    }

    async send(message: JSONRPCMessage): Promise<void> {
        const data = JSON.stringify(message);

        // Send to all active SSE connections
        for (const res of this.activeSseResponses) {
            try {
                const eventId = crypto.randomUUID();
                res.write(`id: ${eventId}\n`);
                res.write(`data: ${data}\n\n`);
            } catch (err) {
                console.error('[HTTP-Transport] Error writing to SSE stream:', err);
                this.activeSseResponses.delete(res);
            }
        }
    }

    async close(): Promise<void> {
        // Close all SSE connections
        for (const res of this.activeSseResponses) {
            try {
                res.end();
            } catch (_) { }
        }
        this.activeSseResponses.clear();
        this.sessions.clear();

        if (this.onclose) {
            this.onclose();
        }
    }

    // ============================================================
    // Express Setup
    // ============================================================

    private setupMiddleware() {
        this.app.use(express.json({ limit: '10mb' }));

        // CORS for browser clients
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID');
            res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
            if (req.method === 'OPTIONS') {
                res.status(204).end();
                return;
            }
            next();
        });

        // Bearer Token authentication
        // Public endpoints: /health, /.well-known/agent.json (A2A discovery)
        // Protected endpoints: /mcp, /a2a
        if (this.authToken) {
            const publicPaths = new Set(['/health', '/.well-known/agent.json']);
            this.app.use((req: Request, res: Response, next: NextFunction) => {
                if (publicPaths.has(req.path)) {
                    next();
                    return;
                }
                const authHeader = req.headers['authorization'];
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    res.status(401).json({ error: 'Unauthorized: Bearer token required' });
                    return;
                }
                const token = authHeader.slice(7);
                if (token !== this.authToken) {
                    res.status(403).json({ error: 'Forbidden: Invalid token' });
                    return;
                }
                next();
            });
            console.error('[HTTP-Transport] 🔒 Bearer Token authentication enabled');
        } else {
            console.error('[HTTP-Transport] ⚠️  No auth token set — running without authentication (set MCP_TOKEN to enable)');
        }
    }

    private setupRoutes() {
        // POST /mcp - Handle JSON-RPC messages from client
        this.app.post(this.mcpEndpoint, (req: Request, res: Response) => {
            this.handlePost(req, res);
        });

        // GET /mcp - Establish SSE stream for server-to-client messages
        this.app.get(this.mcpEndpoint, (req: Request, res: Response) => {
            this.handleGet(req, res);
        });

        // DELETE /mcp - Terminate session
        this.app.delete(this.mcpEndpoint, (req: Request, res: Response) => {
            this.handleDelete(req, res);
        });

        // Health check
        this.app.get('/health', (_req: Request, res: Response) => {
            res.json({
                status: 'ok',
                transport: 'streamable-http',
                mcpEndpoint: this.mcpEndpoint,
                activeSessions: this.sessions.size,
                activeSseConnections: this.activeSseResponses.size
            });
        });
    }

    // ============================================================
    // Request Handlers
    // ============================================================

    /**
     * POST /mcp - Client sends JSON-RPC request/notification
     * 
     * Per MCP spec:
     * - If request has `id`, server MUST return JSON-RPC response (or open SSE stream)
     * - If notification (no `id`), server returns 202 Accepted
     * - Server MAY return Mcp-Session-Id for session management
     */
    private handlePost(req: Request, res: Response) {
        const sessionId = this.getOrCreateSession(req);
        const session = this.sessions.get(sessionId)!;
        session.lastActivity = Date.now();

        // Set session header
        res.setHeader('Mcp-Session-Id', sessionId);

        const body = req.body;

        // Validate JSON-RPC
        if (!body || !body.jsonrpc) {
            res.status(400).json({
                jsonrpc: '2.0',
                error: { code: -32600, message: 'Invalid Request' },
                id: null
            });
            return;
        }

        // Check if this is a batch request
        if (Array.isArray(body)) {
            // JSON-RPC batch - forward each message
            for (const msg of body) {
                if (this.onmessage) {
                    this.onmessage(msg as JSONRPCMessage);
                }
            }
            // For batch, we use SSE to stream responses
            this.startSseResponse(res, sessionId);
            return;
        }

        // Single message
        if (this.onmessage) {
            this.onmessage(body as JSONRPCMessage);
        }

        // If it's a notification (no id), return 202
        if (!('id' in body)) {
            res.status(202).end();
            return;
        }

        // For requests with id, we need to send the response
        // Use SSE for streaming the response back
        this.startSseResponse(res, sessionId);
    }

    /**
     * GET /mcp - Client opens SSE stream for server-initiated messages
     * 
     * Per MCP spec:
     * - Server opens SSE stream
     * - Sends server-initiated requests/notifications
     * - Client MAY include Last-Event-ID for resumability
     */
    private handleGet(req: Request, res: Response) {
        const sessionId = req.headers['mcp-session-id'] as string;

        if (!sessionId || !this.sessions.has(sessionId)) {
            res.status(400).json({ error: 'Invalid or missing session' });
            return;
        }

        this.startSseResponse(res, sessionId);
    }

    /**
     * DELETE /mcp - Terminate session
     */
    private handleDelete(req: Request, res: Response) {
        const sessionId = req.headers['mcp-session-id'] as string;

        if (sessionId && this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId)!;
            if (session.sseResponse) {
                try { session.sseResponse.end(); } catch (_) { }
            }
            this.sessions.delete(sessionId);
            res.status(200).json({ message: 'Session terminated' });
        } else {
            res.status(404).json({ error: 'Session not found' });
        }
    }

    // ============================================================
    // Helpers
    // ============================================================

    private getOrCreateSession(req: Request): string {
        let sessionId = req.headers['mcp-session-id'] as string;

        if (sessionId && this.sessions.has(sessionId)) {
            return sessionId;
        }

        // Create new session
        sessionId = crypto.randomUUID();
        this.sessions.set(sessionId, {
            id: sessionId,
            createdAt: Date.now(),
            lastActivity: Date.now()
        });

        console.error(`[HTTP-Transport] New session created: ${sessionId}`);
        return sessionId;
    }

    private startSseResponse(res: Response, sessionId: string) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Mcp-Session-Id', sessionId);
        res.flushHeaders();

        this.activeSseResponses.add(res);

        const session = this.sessions.get(sessionId);
        if (session) {
            session.sseResponse = res;
        }

        // Handle client disconnect
        res.on('close', () => {
            this.activeSseResponses.delete(res);
            if (session) {
                session.sseResponse = undefined;
            }
            console.error(`[HTTP-Transport] SSE connection closed for session ${sessionId}`);
        });
    }
}
