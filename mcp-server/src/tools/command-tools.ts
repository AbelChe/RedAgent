/**
 * Command Tool - 命令式工具调用接口
 * 提供类似 CLI 的简洁调用方式，避免自然语言理解的开销
 */
import { z } from 'zod';
import { CanonicalToolDef, ExecutionContext, ToolResult } from '../types/tool-definition';
import { workspaceContext } from '../workspace-context';

export function createCommandTool(): CanonicalToolDef {
    return {
        name: 'cmd',
        displayName: 'Command Executor',
        description:
            'Execute commands in CLI-style format. Faster than natural language for direct tool invocation.\n' +
            'Examples:\n' +
            '  - workspace list\n' +
            '  - workspace create my-project\n' +
            '  - workspace switch ws-xxx\n' +
            '  - workspace current',
        inputSchema: z.object({
            command: z.string().describe('Command string (e.g., "workspace list", "workspace create my-project")')
        }),
        annotations: {
            title: 'Command Executor',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false
        },
        security: {
            riskLevel: 'low',
            requiresApproval: false,
            category: 'utility',
            tags: ['command', 'cli', 'utility']
        },
        execution: {
            executor: 'native',
            timeout: 10_000,
            supportsStreaming: false
        },
        handler: async (input: any, _context: ExecutionContext): Promise<ToolResult> => {
            const cmd = input.command.trim();
            const parts = cmd.split(/\s+/);
            const [category, action, ...args] = parts;

            // Workspace commands
            if (category === 'workspace' || category === 'ws') {
                switch (action) {
                    case 'list':
                    case 'ls': {
                        const workspaces = workspaceContext.listWorkspaces();
                        const lines = [`📋 Workspaces (${workspaces.length} total)`, ``];
                        for (const ws of workspaces) {
                            const marker = ws.isCurrent ? '👉' : '  ';
                            lines.push(`${marker} ${ws.id}${ws.name ? ` (${ws.name})` : ''}`);
                            lines.push(`   Created: ${ws.createdAt.toISOString()}`);
                            if (ws.isCurrent) lines.push(`   Status: ACTIVE`);
                            lines.push(``);
                        }
                        return { content: [{ type: 'text', text: lines.join('\n') }] };
                    }

                    case 'create':
                    case 'new': {
                        const name = args.join('-') || undefined;
                        const workspace = workspaceContext.createWorkspace(name);
                        return {
                            content: [{
                                type: 'text',
                                text: [
                                    `✅ Workspace created and activated`,
                                    ``,
                                    `🆔 ID: ${workspace.id}`,
                                    workspace.name ? `📝 Name: ${workspace.name}` : '',
                                    `🕐 Created: ${workspace.createdAt.toISOString()}`,
                                    ``,
                                    `💡 Results will save to: results/${workspace.id}/`
                                ].filter(Boolean).join('\n')
                            }]
                        };
                    }

                    case 'switch':
                    case 'use': {
                        const wsId = args[0];
                        if (!wsId) {
                            return {
                                content: [{ type: 'text', text: '❌ Usage: workspace switch <workspace_id>' }],
                                isError: true
                            };
                        }
                        const success = workspaceContext.switchWorkspace(wsId);
                        if (success) {
                            return {
                                content: [{
                                    type: 'text',
                                    text: `✅ Switched to: ${wsId}\n\n💡 Results will save to: results/${wsId}/`
                                }]
                            };
                        } else {
                            return {
                                content: [{ type: 'text', text: `❌ Workspace not found: ${wsId}` }],
                                isError: true
                            };
                        }
                    }

                    case 'current':
                    case 'pwd': {
                        const currentId = workspaceContext.getCurrentWorkspaceId();
                        return {
                            content: [{ type: 'text', text: `📍 Current workspace: ${currentId}` }]
                        };
                    }

                    default:
                        return {
                            content: [{
                                type: 'text',
                                text: `❌ Unknown workspace command: ${action}\n\nAvailable: list, create, switch, current`
                            }],
                            isError: true
                        };
                }
            }

            // Unknown category
            return {
                content: [{
                    type: 'text',
                    text: `❌ Unknown command category: ${category}\n\nAvailable: workspace (ws)`
                }],
                isError: true
            };
        }
    };
}
