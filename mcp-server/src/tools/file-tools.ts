/**
 * File Tools - read_file, write_file
 * Category: utility
 */
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CanonicalToolDef } from '../types/tool-definition';

export function createFileTools(workspaceDir: string): CanonicalToolDef[] {
    return [
        {
            name: 'read_file',
            displayName: 'Read File',
            description: 'Read the contents of a file from the workspace directory. Path traversal outside workspace is blocked.',
            inputSchema: z.object({
                path: z.string().describe('Relative path within workspace')
            }),
            annotations: {
                title: 'Read File from Workspace',
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            },
            security: {
                riskLevel: 'low',
                requiresApproval: false,
                category: 'utility',
                tags: ['file', 'read', 'workspace']
            },
            execution: {
                executor: 'native',
                supportsStreaming: false
            },
            handler: async (input: any) => {
                const safePath = path.normalize(path.join(workspaceDir, input.path));
                if (!safePath.startsWith(workspaceDir)) {
                    return { content: [{ type: 'text', text: 'Access denied: Path outside workspace' }], isError: true };
                }
                try {
                    const content = fs.readFileSync(safePath, 'utf8');
                    return { content: [{ type: 'text', text: content }] };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error reading file: ${e.message}` }], isError: true };
                }
            }
        },
        {
            name: 'write_file',
            displayName: 'Write File',
            description: 'Write content to a file in the workspace directory. Path traversal outside workspace is blocked.',
            inputSchema: z.object({
                path: z.string().describe('Relative path within workspace'),
                content: z.string().describe('Content to write')
            }),
            annotations: {
                title: 'Write File to Workspace',
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: false
            },
            security: {
                riskLevel: 'medium',
                requiresApproval: true,
                category: 'utility',
                tags: ['file', 'write', 'workspace']
            },
            execution: {
                executor: 'native',
                supportsStreaming: false
            },
            handler: async (input: any) => {
                const safePath = path.normalize(path.join(workspaceDir, input.path));
                if (!safePath.startsWith(workspaceDir)) {
                    return { content: [{ type: 'text', text: 'Access denied: Path outside workspace' }], isError: true };
                }
                try {
                    fs.writeFileSync(safePath, input.content, 'utf8');
                    return { content: [{ type: 'text', text: `Success: Written ${input.content.length} bytes to ${input.path}` }] };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error writing file: ${e.message}` }], isError: true };
                }
            }
        }
    ];
}
