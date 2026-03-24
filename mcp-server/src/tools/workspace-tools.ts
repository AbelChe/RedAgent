/**
 * Workspace Tools - workspace_create, workspace_switch, workspace_list
 * Category: utility
 */
import { z } from 'zod';
import { CanonicalToolDef, ExecutionContext, ToolResult } from '../types/tool-definition';
import { workspaceContext } from '../workspace-context';

export function createWorkspaceTools(): CanonicalToolDef[] {
    return [
        {
            name: 'workspace_create',
            displayName: 'Create New Workspace',
            description: 'Create a new workspace and switch to it. All subsequent tool executions will use this workspace ID for result isolation.',
            inputSchema: z.object({
                name: z.string().optional().describe('Optional workspace name for identification (e.g., "project-alpha", "pentest-2024")')
            }),
            annotations: {
                title: 'Create New Workspace',
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false
            },
            security: {
                riskLevel: 'low',
                requiresApproval: false,
                category: 'utility',
                tags: ['workspace', 'management', 'context']
            },
            execution: {
                executor: 'native',
                timeout: 5_000,
                supportsStreaming: false
            },
            handler: async (input: any, _context: ExecutionContext): Promise<ToolResult> => {
                const workspace = workspaceContext.createWorkspace(input.name);
                return {
                    content: [{
                        type: 'text',
                        text: [
                            `✅ New workspace created and activated`,
                            ``,
                            `🆔 Workspace ID: ${workspace.id}`,
                            workspace.name ? `📝 Name: ${workspace.name}` : '',
                            `🕐 Created: ${workspace.createdAt.toISOString()}`,
                            ``,
                            `💡 All subsequent tool executions will save results to: results/${workspace.id}/`
                        ].filter(Boolean).join('\n')
                    }]
                };
            }
        },
        {
            name: 'workspace_list',
            displayName: 'List Workspaces',
            description: 'List all workspaces in the current session and show which one is currently active.',
            inputSchema: z.object({}),
            annotations: {
                title: 'List Workspaces',
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            },
            security: {
                riskLevel: 'low',
                requiresApproval: false,
                category: 'utility',
                tags: ['workspace', 'management', 'list']
            },
            execution: {
                executor: 'native',
                timeout: 5_000,
                supportsStreaming: false
            },
            handler: async (_input: any, _context: ExecutionContext): Promise<ToolResult> => {
                const workspaces = workspaceContext.listWorkspaces();
                const lines = [
                    `📋 Workspaces (${workspaces.length} total)`,
                    ``
                ];
                for (const ws of workspaces) {
                    const marker = ws.isCurrent ? '👉' : '  ';
                    lines.push(`${marker} ${ws.id}${ws.name ? ` (${ws.name})` : ''}`);
                    lines.push(`   Created: ${ws.createdAt.toISOString()}`);
                    if (ws.isCurrent) {
                        lines.push(`   Status: ACTIVE`);
                    }
                    lines.push(``);
                }
                return {
                    content: [{ type: 'text', text: lines.join('\n') }]
                };
            }
        },
        {
            name: 'workspace_switch',
            displayName: 'Switch Workspace',
            description: 'Switch to an existing workspace. All subsequent tool executions will use the selected workspace ID.',
            inputSchema: z.object({
                workspace_id: z.string().describe('The workspace ID to switch to (from workspace_list)')
            }),
            annotations: {
                title: 'Switch Workspace',
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            },
            security: {
                riskLevel: 'low',
                requiresApproval: false,
                category: 'utility',
                tags: ['workspace', 'management', 'switch']
            },
            execution: {
                executor: 'native',
                timeout: 5_000,
                supportsStreaming: false
            },
            handler: async (input: any, _context: ExecutionContext): Promise<ToolResult> => {
                const success = workspaceContext.switchWorkspace(input.workspace_id);
                if (success) {
                    return {
                        content: [{
                            type: 'text',
                            text: `✅ Switched to workspace: ${input.workspace_id}\n\n💡 All subsequent tool executions will save results to: results/${input.workspace_id}/`
                        }]
                    };
                } else {
                    return {
                        content: [{
                            type: 'text',
                            text: `❌ Workspace not found: ${input.workspace_id}\n\nUse workspace_list to see available workspaces.`
                        }],
                        isError: true
                    };
                }
            }
        }
    ];
}
