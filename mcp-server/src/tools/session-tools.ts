/**
 * Session Tools - create_session, start_terminal, run_shell
 * Category: utility
 */
import { z } from 'zod';
import { CanonicalToolDef } from '../types/tool-definition';
import { SessionManager } from '../session';
import { TerminalManager } from '../terminal';

export function createSessionTools(
    sessionManager: SessionManager,
    terminalManager: TerminalManager
): CanonicalToolDef[] {
    return [
        {
            name: 'create_session',
            displayName: 'Create Session',
            description: 'Create a new persistent shell session in a Docker container for multi-step command execution with CWD tracking.',
            inputSchema: z.object({
                container: z.string().optional().describe('Container name to attach to (default: pentest-sandbox)')
            }),
            annotations: {
                title: 'Create Shell Session',
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false
            },
            security: {
                riskLevel: 'low',
                requiresApproval: false,
                category: 'utility',
                tags: ['session', 'container', 'shell']
            },
            execution: {
                executor: 'docker',
                supportsStreaming: false
            },
            handler: async (input: any) => {
                try {
                    const session = sessionManager.createSession(input.container || 'pentest-sandbox');
                    return {
                        content: [{
                            type: 'text',
                            text: `Session created: ${session.id} (Container: ${session.containerName})`
                        }]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error creating session: ${e.message}` }], isError: true };
                }
            }
        },
        {
            name: 'start_terminal',
            displayName: 'Start Interactive Terminal',
            description: 'Start an interactive PTY terminal session for real-time shell interaction.',
            inputSchema: z.object({
                id: z.string().describe('Session ID to use (frontend generated)'),
                image: z.string().optional().describe('Docker image to start')
            }),
            annotations: {
                title: 'Start Interactive Terminal',
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false
            },
            security: {
                riskLevel: 'medium',
                requiresApproval: false,
                category: 'utility',
                tags: ['terminal', 'interactive', 'pty']
            },
            execution: {
                executor: 'docker',
                supportsStreaming: true
            },
            handler: async (input: any) => {
                try {
                    await terminalManager.createTerminal(input.id, input.image);
                    return {
                        content: [{ type: 'text', text: `Terminal started: ${input.id}` }]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
                }
            }
        },
        {
            name: 'run_shell',
            displayName: 'Run Shell Command',
            description: 'Execute a shell command within a persistent session, maintaining working directory and environment variables across calls.',
            inputSchema: z.object({
                sessionId: z.string().describe('Session ID'),
                command: z.string().describe('Shell command to execute')
            }),
            annotations: {
                title: 'Run Shell Command in Session',
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: true
            },
            security: {
                riskLevel: 'high',
                requiresApproval: false,
                category: 'utility',
                tags: ['shell', 'command', 'execute']
            },
            execution: {
                executor: 'docker',
                supportsStreaming: true
            },
            handler: async (input: any, context) => {
                try {
                    const output = await sessionManager.runCommand(input.sessionId, input.command, (data) => {
                        if (context.onProgress) {
                            context.onProgress({ type: 'log', data });
                        }
                    });
                    return {
                        content: [{ type: 'text', text: output }]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error executing shell: ${e.message}` }], isError: true };
                }
            }
        }
    ];
}
