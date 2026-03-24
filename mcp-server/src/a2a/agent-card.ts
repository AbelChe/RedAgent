/**
 * A2A (Agent-to-Agent) Protocol Support
 * 
 * Implements Google A2A protocol endpoints:
 * - GET /.well-known/agent.json - Agent Card discovery
 * - POST /a2a - JSON-RPC 2.0 task operations
 * 
 * @see https://github.com/a2aproject/A2A
 */

import { Express, Request, Response } from 'express';
import crypto from 'crypto';
import { ToolRegistry, ExecutionContext, CanonicalToolDef } from '../types/tool-definition';

/**
 * A2A Agent Card
 * @see https://github.com/a2aproject/A2A/blob/main/specification.md
 */
interface AgentCard {
    name: string;
    description: string;
    url: string;
    version: string;
    capabilities: {
        streaming: boolean;
        pushNotifications: boolean;
        stateTransitionHistory: boolean;
    };
    skills: Array<{
        id: string;
        name: string;
        description: string;
        tags: string[];
    }>;
    authentication: {
        schemes: string[];
    };
    defaultInputModes: string[];
    defaultOutputModes: string[];
}

/**
 * A2A Task State
 */
type TaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';

interface A2ATask {
    id: string;
    state: TaskState;
    createdAt: number;
    updatedAt: number;
    description?: string;
    artifacts: Array<{
        name: string;
        mimeType: string;
        data: string;
    }>;
}

/**
 * Register A2A endpoints on an Express app
 */
export function registerA2AEndpoints(
    app: Express,
    toolRegistry: ToolRegistry,
    baseUrl: string = 'http://localhost:3001',
    executionMode: 'docker' | 'local' = 'docker'
): void {
    const tasks: Map<string, A2ATask> = new Map();

    /**
     * Dispatch a tool execution for an A2A task.
     * Resolves the tool from the registry, executes it, and updates task state.
     */
    async function dispatchTask(task: A2ATask, toolName: string, toolInput: Record<string, any>): Promise<void> {
        const tool = toolRegistry.getToolByName(toolName);
        if (!tool) {
            task.state = 'failed';
            task.updatedAt = Date.now();
            task.artifacts.push({
                name: 'error',
                mimeType: 'text/plain',
                data: `Tool not found: ${toolName}. Available: ${toolRegistry.getAllTools().map(t => t.name).join(', ')}`
            });
            return;
        }

        // Security gate: reject high/critical tools without explicit approval flag
        if (tool.security.requiresApproval) {
            task.state = 'input-required';
            task.updatedAt = Date.now();
            task.artifacts.push({
                name: 'approval-required',
                mimeType: 'application/json',
                data: JSON.stringify({
                    message: `Tool '${toolName}' requires human approval (risk: ${tool.security.riskLevel})`,
                    riskLevel: tool.security.riskLevel,
                    tool: toolName
                })
            });
            return;
        }

        task.state = 'working';
        task.updatedAt = Date.now();

        try {
            const context: ExecutionContext = {
                workspaceId: toolInput.workspace_id,
                runId: crypto.randomUUID(),
                mode: executionMode,
                onProgress: (event) => {
                    // Append progress events as artifacts
                    if (event.type === 'progress' || event.type === 'log') {
                        task.artifacts.push({
                            name: `log-${Date.now()}`,
                            mimeType: 'text/plain',
                            data: event.data
                        });
                        task.updatedAt = Date.now();
                    }
                }
            };

            const result = await tool.handler(toolInput, context);

            task.state = result.isError ? 'failed' : 'completed';
            task.updatedAt = Date.now();

            // Convert tool result content to A2A artifacts
            for (const item of result.content) {
                if (item.type === 'text') {
                    task.artifacts.push({
                        name: 'result',
                        mimeType: 'text/plain',
                        data: item.text
                    });
                } else if (item.type === 'image') {
                    task.artifacts.push({
                        name: 'image',
                        mimeType: item.mimeType,
                        data: item.data
                    });
                }
            }
        } catch (error: any) {
            task.state = 'failed';
            task.updatedAt = Date.now();
            task.artifacts.push({
                name: 'error',
                mimeType: 'text/plain',
                data: `Execution failed: ${error.message}`
            });
        }
    }

    /**
     * Parse A2A message to extract tool name and input parameters.
     *
     * Supports two formats:
     * 1. Structured: params.skill + params.input (preferred)
     * 2. Text-based: first word of message text as tool name, rest as command
     */
    function parseTaskMessage(params: any): { toolName: string; input: Record<string, any> } | null {
        // Format 1: Explicit skill + input
        if (params?.skill) {
            return {
                toolName: params.skill,
                input: params.input || {}
            };
        }

        // Format 2: Parse from message text
        const text = params?.message?.parts?.[0]?.text;
        if (!text) return null;

        // Try "toolName: args" format
        const colonIdx = text.indexOf(':');
        if (colonIdx > 0 && colonIdx < 30) {
            const toolName = text.substring(0, colonIdx).trim();
            if (toolRegistry.getToolByName(toolName)) {
                return {
                    toolName,
                    input: { command: text.substring(colonIdx + 1).trim() }
                };
            }
        }

        // Try first word as tool name
        const parts = text.trim().split(/\s+/);
        const candidate = parts[0];
        if (toolRegistry.getToolByName(candidate)) {
            return {
                toolName: candidate,
                input: { command: text }
            };
        }

        // Fallback: use execute_command if it exists
        if (toolRegistry.getToolByName('execute_command')) {
            return {
                toolName: 'execute_command',
                input: { command: text }
            };
        }

        return null;
    }

    // ============================================================
    // Agent Card Discovery
    // ============================================================

    const agentCard: AgentCard = {
        name: 'RedAgent',
        description: 'AI-powered penetration testing agent. Provides network scanning, vulnerability assessment, web reconnaissance, exploit execution, and security reporting capabilities through isolated Docker containers.',
        url: baseUrl,
        version: '1.0.0',
        capabilities: {
            streaming: true,
            pushNotifications: false,
            stateTransitionHistory: true
        },
        skills: toolRegistry.getA2ASkills(),
        authentication: {
            schemes: ['bearer']
        },
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain', 'application/json']
    };

    // Standard A2A discovery endpoint
    app.get('/.well-known/agent.json', (_req: Request, res: Response) => {
        // Refresh skills from registry (in case tools were added dynamically)
        agentCard.skills = toolRegistry.getA2ASkills();
        res.json(agentCard);
    });

    // ============================================================
    // A2A JSON-RPC Endpoint
    // ============================================================

    app.post('/a2a', async (req: Request, res: Response) => {
        const { method, params, id } = req.body;

        if (!method) {
            res.status(400).json({
                jsonrpc: '2.0',
                error: { code: -32600, message: 'Invalid Request: missing method' },
                id: id || null
            });
            return;
        }

        try {
            switch (method) {
                case 'tasks/send': {
                    const taskId = params?.id || crypto.randomUUID();
                    const task: A2ATask = {
                        id: taskId,
                        state: 'submitted',
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        description: params?.message?.parts?.[0]?.text,
                        artifacts: []
                    };
                    tasks.set(taskId, task);

                    // Parse message to identify tool and input
                    const parsed = parseTaskMessage(params);
                    if (!parsed) {
                        task.state = 'failed';
                        task.updatedAt = Date.now();
                        task.artifacts.push({
                            name: 'error',
                            mimeType: 'text/plain',
                            data: 'Could not determine tool from message. Use { skill: "tool_name", input: {...} } or send a recognized command.'
                        });
                        res.json({
                            jsonrpc: '2.0',
                            result: { id: task.id, state: task.state, artifacts: task.artifacts },
                            id
                        });
                        break;
                    }

                    // Dispatch tool execution asynchronously
                    dispatchTask(task, parsed.toolName, parsed.input).catch(err => {
                        task.state = 'failed';
                        task.updatedAt = Date.now();
                        task.artifacts.push({
                            name: 'error',
                            mimeType: 'text/plain',
                            data: `Dispatch error: ${err.message}`
                        });
                    });

                    // Return immediately with current state (caller polls via tasks/get)
                    res.json({
                        jsonrpc: '2.0',
                        result: {
                            id: task.id,
                            state: task.state,
                            artifacts: task.artifacts
                        },
                        id
                    });
                    break;
                }

                case 'tasks/get': {
                    const task = tasks.get(params?.id);
                    if (!task) {
                        res.json({
                            jsonrpc: '2.0',
                            error: { code: -32602, message: 'Task not found' },
                            id
                        });
                        return;
                    }
                    res.json({
                        jsonrpc: '2.0',
                        result: {
                            id: task.id,
                            state: task.state,
                            artifacts: task.artifacts
                        },
                        id
                    });
                    break;
                }

                case 'tasks/cancel': {
                    const task = tasks.get(params?.id);
                    if (!task) {
                        res.json({
                            jsonrpc: '2.0',
                            error: { code: -32602, message: 'Task not found' },
                            id
                        });
                        return;
                    }
                    task.state = 'canceled';
                    task.updatedAt = Date.now();
                    res.json({
                        jsonrpc: '2.0',
                        result: { id: task.id, state: task.state },
                        id
                    });
                    break;
                }

                default:
                    res.json({
                        jsonrpc: '2.0',
                        error: { code: -32601, message: `Method not found: ${method}` },
                        id
                    });
            }
        } catch (error: any) {
            res.json({
                jsonrpc: '2.0',
                error: { code: -32603, message: error.message },
                id
            });
        }
    });

    // ============================================================
    // Security & Tool Info Endpoints
    // ============================================================

    // Tool security summary (useful for orchestration agents)
    app.get('/api/tools/security', (_req: Request, res: Response) => {
        res.json(toolRegistry.getSecuritySummary());
    });

    // List all tools with full metadata
    app.get('/api/tools', (_req: Request, res: Response) => {
        const tools = toolRegistry.getAllTools().map(t => ({
            name: t.name,
            displayName: t.displayName,
            description: t.description,
            annotations: t.annotations,
            security: t.security,
            execution: {
                executor: t.execution.executor,
                timeout: t.execution.timeout,
                supportsStreaming: t.execution.supportsStreaming
            }
        }));
        res.json({ tools });
    });

    console.error('[A2A] Agent Card endpoint registered at /.well-known/agent.json');
    console.error('[A2A] Task endpoint registered at /a2a');
}
