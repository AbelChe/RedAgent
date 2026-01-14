import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as pty from 'node-pty';
import * as os from 'os';
import * as fs from 'fs';
import * as cp from 'child_process';

interface TerminalSession {
    id: string;
    // Abstracted process interface to handle both PTY and CP
    process: {
        write: (data: string) => void;
        resize: (cols: number, rows: number) => void;
        kill: () => void;
    };
    createdAt: number;
    type: 'pty' | 'process';
}

export class TerminalManager {
    private sessions: Map<string, TerminalSession> = new Map();
    private server: McpServer;
    private transport: any = null;

    constructor(server: McpServer) {
        this.server = server;
    }

    setTransport(transport: any) {
        this.transport = transport;
        console.error('[MCP-TERM] Transport set successfully');
    }

    async createTerminal(id: string, _image?: string): Promise<string> {
        console.error(`[MCP-TERM] Creating host terminal session ${id}`);

        // 1. Resolve candidates
        let candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh', '/usr/bin/bash', '/usr/bin/sh', 'powershell.exe', 'cmd.exe'];

        const validShell = candidates.find(sh => {
            if (!sh || sh.trim() === '') return false;
            // platform specific validation could go here
            if (os.platform() === 'win32') return true;
            try { return fs.existsSync(sh); } catch (e) { return false; }
        });

        const targetShell = validShell || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/sh');
        const cwd = process.env.HOME || process.cwd();

        console.error(`[MCP-TERM] Selected shell: '${targetShell}'`);

        try {
            // Attempt 1: Node-PTY (High Fidelity)
            const ptyProcess = pty.spawn(targetShell, [], {
                name: 'xterm-color',
                cols: 80,
                rows: 24,
                cwd: cwd,
                env: process.env as any
            });

            this.sessions.set(id, {
                id,
                process: ptyProcess,
                createdAt: Date.now(),
                type: 'pty'
            });

            ptyProcess.onData((data: string) => this.emitOutput(id, data));
            ptyProcess.onExit(({ exitCode, signal }) => {
                console.error(`[MCP-TERM] PTY Session ${id} exited: ${exitCode}`);
                this.cleanup(id);
            });

            return id;

        } catch (spawnError: any) {
            console.error(`[MCP-TERM] Node-PTY failed: ${spawnError.message}. Switching to Fallback Mode (child_process).`);

            // Attempt 2: Child Process (Safe Implementation)
            try {
                const child = cp.spawn(targetShell, [], {
                    cwd: cwd,
                    env: process.env,
                    stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
                });

                const safeProcess = {
                    write: (data: string) => {
                        if (child.stdin && child.stdin.writable) child.stdin.write(data);
                    },
                    resize: (_cols: number, _rows: number) => {
                        // resizing not supported in raw pipe
                    },
                    kill: () => child.kill()
                };

                this.sessions.set(id, {
                    id,
                    process: safeProcess,
                    createdAt: Date.now(),
                    type: 'process'
                });

                // Pipe stdout/stderr
                child.stdout.on('data', (chunk) => {
                    // Convert raw newlines to CRLF for basic xterm rendering compatibility in non-raw mode
                    const str = chunk.toString('utf8');
                    this.emitOutput(id, str.replace(/\r?\n/g, '\r\n'));
                });

                child.stderr.on('data', (chunk) => {
                    const str = chunk.toString('utf8');
                    this.emitOutput(id, str.replace(/\r?\n/g, '\r\n'));
                });

                child.on('close', (code) => {
                    console.error(`[MCP-TERM] Process Session ${id} closed: ${code}`);
                    this.cleanup(id);
                });

                return id;

            } catch (fallbackError: any) {
                console.error(`[MCP-TERM] FATAL: Both PTY and CP spawn failed. ${fallbackError.message}`);
                throw fallbackError;
            }
        }
    }

    private emitOutput(sessionId: string, data: string) {
        console.error(`[MCP-TERM] emitOutput for ${sessionId}. Data len: ${data.length}`);
        try {
            // Construct a proper JSON-RPC 2.0 notification using the internal transport
            const notification = {
                jsonrpc: "2.0" as const,
                method: "terminal/output",
                params: {
                    sessionId: sessionId,
                    data: data
                }
            };

            // Send via the underlying transport directly
            if (this.transport && typeof this.transport.send === 'function') {
                this.transport.send(notification);
                console.error(`[MCP-TERM] Notification sent via transport.`);
            } else {
                console.error(`[MCP-TERM] Error: Transport not initialized!`);
            }
        } catch (err: any) {
            console.error(`[MCP-TERM] Failed to send notification: ${err.message}`);
        }
    }

    handleInput(sessionId: string, data: string) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.process.write(data);
        } else {
            // Silently ignore or log input to closed session
        }
    }

    async handleResize(sessionId: string, cols: number, rows: number) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.process.resize(cols, rows);
        }
    }

    private cleanup(id: string) {
        const session = this.sessions.get(id);
        if (session) {
            try { session.process.kill(); } catch (e) { }
            this.sessions.delete(id);
        }
    }
}
