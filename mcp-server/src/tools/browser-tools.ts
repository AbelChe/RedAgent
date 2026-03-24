/**
 * Browser Tools - visit_page
 * Category: reconnaissance
 */
import { z } from 'zod';
import { CanonicalToolDef } from '../types/tool-definition';
import { BrowserHandler } from '../browser';

export function createBrowserTools(browserHandler: BrowserHandler): CanonicalToolDef[] {
    return [
        {
            name: 'visit_page',
            displayName: 'Visit Web Page',
            description: 'Visit a URL using a headless browser, capture the page title, text content, and a screenshot. Useful for web reconnaissance and content analysis.',
            inputSchema: z.object({
                url: z.string().url().describe('URL to visit')
            }),
            annotations: {
                title: 'Visit Web Page (Browser)',
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true
            },
            security: {
                riskLevel: 'medium',
                requiresApproval: false,
                category: 'reconnaissance',
                tags: ['browser', 'web', 'screenshot', 'reconnaissance']
            },
            execution: {
                executor: 'browser',
                supportsStreaming: false,
                timeout: 30000
            },
            handler: async (input: any) => {
                try {
                    console.error(`MCP: Visiting ${input.url}...`);
                    const result = await browserHandler.visitPage(input.url);

                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Title: ${result.title}\n\n${result.content}`
                            },
                            {
                                type: 'image',
                                data: result.screenshot,
                                mimeType: 'image/jpeg'
                            }
                        ]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error visiting page: ${e.message}` }], isError: true };
                }
            }
        }
    ];
}
