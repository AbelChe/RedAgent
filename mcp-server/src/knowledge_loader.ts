import fs from 'fs/promises';
import path from 'path';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export class KnowledgeLoader {
    private knowledgeDir: string;

    constructor(knowledgeDir: string) {
        this.knowledgeDir = knowledgeDir;
    }

    async registerPrompts(server: McpServer) {
        try {
            const files = await fs.readdir(this.knowledgeDir);
            const mdFiles = files.filter(f => f.endsWith('.md'));

            console.error(`MCP: Loading ${mdFiles.length} knowledge modules...`);

            for (const file of mdFiles) {
                const name = path.basename(file, '.md');
                const content = await fs.readFile(path.join(this.knowledgeDir, file), 'utf-8');

                // Extract description from first line or use generic
                const firstLine = content.split('\n')[0].replace(/^#\s*/, '').trim();
                const description = firstLine || `Guide for ${name}`;

                server.prompt(
                    `usage-${name}`,
                    { topic: z.string().optional().describe("Specific topic (optional)") },
                    async ({ topic }) => {
                        return {
                            messages: [
                                {
                                    role: "user",
                                    content: {
                                        type: "text",
                                        text: `Here is the usage guide for ${name}:\n\n${content}`
                                    }
                                }
                            ]
                        };
                    }
                );
            }
            console.error("MCP: Knowledge modules registered as Prompts.");

        } catch (error) {
            console.error("MCP: Failed to load knowledge:", error);
        }
    }
}
