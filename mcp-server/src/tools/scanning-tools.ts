/**
 * Scanning Tools - nmap_scan, execute_command
 * Category: scanning / reconnaissance
 */
import { z } from 'zod';
import { CanonicalToolDef, ExecutionContext, ToolEvent } from '../types/tool-definition';
import { DockerExecutor } from '../executor';
import { ContainersConfig } from '../config';
import { ResultStore } from '../utils/result-store';
import crypto from 'crypto';

/**
 * Creates the unified executeTool helper with proper MCP standard notifications
 */
function createToolExecutor(
    executor: DockerExecutor,
    containerConfig: ContainersConfig,
    mode: string,
    resultStore: ResultStore
) {
    return async function executeTool(
        toolName: string,
        args: string[],
        context: ExecutionContext
    ) {
        const fullCommand = `${toolName} ${args.join(' ')}`;
        const volumeName = context.workspaceId ? `pentest-ws-${context.workspaceId}` : undefined;

        try {
            // Detect if command contains shell syntax
            const shellSyntaxPattern = /[;&|<>(){}]|^\s*(if|for|while|case|until|select)\b/;
            const needsShell = shellSyntaxPattern.test(fullCommand);

            const cmd = needsShell
                ? ['/bin/sh', '-c', fullCommand]
                : [toolName, ...args];

            if (needsShell) {
                console.error(`🐚 [MCP-SHELL] Command contains shell syntax, wrapping in /bin/sh -c`);
            }

            if (mode === 'docker') {
                // Streaming callback using MCP-standard progress notifications
                const streamLogger = (data: string) => {
                    if (context.onProgress) {
                        context.onProgress({
                            type: 'log',
                            data: data
                        });
                    }
                };

                // Smart Routing: tool-specific → default → shared sandbox
                try {
                    const toolConfig = containerConfig[toolName];
                    let output = '';

                    if (toolConfig) {
                        output = await executor.executeEphemeralCaptured(cmd, toolConfig, streamLogger, volumeName, context.signal);
                    } else if (containerConfig.default) {
                        console.error(`MCP: Routing ${toolName} to default container: ${containerConfig.default.image}`);
                        output = await executor.executeEphemeralCaptured(cmd, {
                            ...containerConfig.default,
                        }, streamLogger, volumeName, context.signal);
                    } else {
                        console.error(`MCP: Tool '${toolName}' not configured. Running in shared sandbox.`);
                        output = await executor.execute(cmd);
                    }

                    // Notify completion
                    if (context.onProgress) {
                        context.onProgress({ type: 'result', data: 'completed' });
                    }

                    // Persist results to disk, return summary if output is large
                    const { text } = resultStore.save(toolName, output, {
                        command: fullCommand,
                        target: args[args.length - 1], // last arg is usually the target
                        workspaceId: context.workspaceId
                    });

                    return {
                        content: [{ type: 'text' as const, text }]
                    };
                } catch (error: any) {
                    if (context.onProgress) {
                        context.onProgress({ type: 'error', data: error.message });
                    }
                    throw error;
                }
            } else {
                return {
                    content: [{
                        type: 'text' as const,
                        text: 'Error: Local execution is disabled for security. MCP is running in Docker-only mode.'
                    }],
                    isError: true
                };
            }
        } catch (error: any) {
            return {
                content: [{ type: 'text' as const, text: `Execution Error: ${error.message}` }],
                isError: true
            };
        }
    };
}

export function createScanningTools(
    executor: DockerExecutor,
    containerConfig: ContainersConfig,
    mode: string,
    workspaceDir: string
): CanonicalToolDef[] {
    const resultStore = new ResultStore(workspaceDir);
    const executeTool = createToolExecutor(executor, containerConfig, mode, resultStore);

    return [
        {
            name: 'nmap_scan',
            displayName: 'Network Scanner (Nmap)',
            description: 'Run nmap network scans against a target. Supports multiple scan profiles: ping discovery, quick scan, full port scan, version detection, and OS fingerprinting.',
            inputSchema: z.object({
                target: z.string().describe('Target IP or Hostname'),
                profile: z.enum(['ping', 'quick', 'full', 'versions', 'os']).default('quick').describe('Scan profile'),
                workspace_id: z.string().optional().describe('Workspace isolation ID')
            }),
            annotations: {
                title: 'Network Scanner (Nmap)',
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true
            },
            security: {
                riskLevel: 'low',
                requiresApproval: false,
                category: 'reconnaissance',
                tags: ['nmap', 'network', 'scan', 'port', 'reconnaissance']
            },
            execution: {
                executor: 'docker',
                containerConfigKey: 'nmap',
                supportsStreaming: true,
                timeout: 300000 // 5 minutes
            },
            knowledgeFile: 'nmap.md',
            handler: async (input: any, context) => {
                const profiles: Record<string, string[]> = {
                    'ping': ['-sn'],
                    'quick': ['-F'],
                    'full': ['-p-', '-T4'],
                    'versions': ['-sV', '-sC', '--version-light'],
                    'os': ['-O', '--osscan-limit']
                };
                const args = [...profiles[input.profile], input.target];
                // Use context directly — workspaceId is already resolved by index.ts
                // (from input.workspace_id or workspaceContext.getCurrentWorkspaceId())
                return executeTool('nmap', args, context);
            }
        },
        {
            name: 'execute_command',
            displayName: 'Execute Command',
            description: 'Execute any supported penetration testing command in an isolated Docker container. The command is automatically routed to the appropriate container based on the tool configuration.',
            inputSchema: z.object({
                command: z.string().describe("Full command to execute (e.g., 'nmap -sV target.com')"),
                workspace_id: z.string().optional().describe('Workspace isolation ID')
            }),
            annotations: {
                title: 'Generic Command Executor',
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: true
            },
            security: {
                riskLevel: 'high',
                requiresApproval: true,
                category: 'utility',
                tags: ['command', 'execute', 'generic', 'shell']
            },
            execution: {
                executor: 'docker',
                supportsStreaming: true,
                timeout: 600000 // 10 minutes
            },
            knowledgeFile: 'execute_command.md',
            handler: async (input: any, context) => {
                const parts = input.command.trim().split(/\s+/);
                if (parts.length === 0) {
                    return { content: [{ type: 'text', text: 'Error: Empty command' }], isError: true };
                }

                const toolName = parts[0];
                const args = parts.slice(1);
                console.error(`MCP: Received execute_command: ${toolName} args: ${args.join(' ')}`);

                // Use context directly — workspaceId is already resolved by index.ts
                // (from input.workspace_id or workspaceContext.getCurrentWorkspaceId())
                return executeTool(toolName, args, context);
            }
        }
    ];
}
