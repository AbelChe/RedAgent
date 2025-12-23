import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import process from "process";

async function main() {
    const transport = new StdioClientTransport({
        command: "node",
        args: ["dist/index.js", "--mode", "local"]
    });

    const client = new Client({
        name: "example-client",
        version: "1.0.0"
    }, {
        capabilities: {
            // prompts: {}, 
            roots: { listChanged: true }
        }
    });

    try {
        await client.connect(transport);
        console.log("Connected to MCP Server");

        // Listen for logging notifications
        // SDK Client notification handling
        client.setNotificationHandler(
            z.object({
                method: z.literal("notifications/message"),
                params: z.object({
                    level: z.string().optional(),
                    data: z.any()
                })
            }) as any,
            async (notification: any) => {
                const data = notification.params.data;
                console.log(`[STREAM]: ${data}`);
            }
        );

        // List Resources
        const resources = await client.listResources();
        console.log("\n--- Resources ---");
        resources.resources.forEach(r => console.log(`- ${r.name} (${r.uri})`));

        // List Tools
        const tools = await client.listTools();
        console.log("\n--- Tools ---");
        tools.tools.forEach(t => console.log(`- ${t.name}: ${t.description}`));

        // Test File Ops
        console.log("\n--- Testing File Ops ---");
        const testFile = "verify_node.txt";
        const content = "Hello from Node.js Verification!";

        await client.callTool({
            name: "write_file",
            arguments: { path: testFile, content }
        });
        console.log(`Written to ${testFile}`);

        const readResult = await client.callTool({
            name: "read_file",
            arguments: { path: testFile }
        });
        const readContent = readResult.content as any[];
        const readText = readContent[0].text;
        console.log(`Read content: ${readText}`);

        // Test Stateful Session
        console.log("\n--- Testing Stateful Session ---");
        const sessionRes = await client.callTool({
            name: "create_session",
            arguments: {}
        });
        const sessionContent = sessionRes.content as any[];
        const sessionOutput = sessionContent[0].text;
        const sessionId = sessionOutput.split('Session created: ')[1].split(' ')[0];
        console.log(`Session ID: ${sessionId}`);

        // Command 1: Export Var and Change Dir
        await client.callTool({
            name: "run_shell",
            arguments: {
                sessionId,
                command: "export TEST_VAR=mcp_stateful && cd /tmp"
            }
        });

        // Command 2: Verify Persistence
        const verifyRes = await client.callTool({
            name: "run_shell",
            arguments: {
                sessionId,
                command: "pwd && echo $TEST_VAR"
            }
        });
        const verifyContent = verifyRes.content as any[];
        const verifyText = verifyContent[0].text;
        console.log(`State Verification: ${verifyText.trim()}`);

        // Test Streaming
        console.log("\n--- Testing Streaming ---");
        // We run a command that produces output over time
        await client.callTool({
            name: "run_shell",
            arguments: {
                sessionId,
                command: "echo 'Start' && sleep 1 && echo 'Middle' && sleep 1 && echo 'End'"
            }
        });

        // Test Browser
        console.log("\n--- Testing Browser ---");
        const pageRes = await client.callTool({
            name: "visit_page",
            arguments: { url: "http://example.com" }
        });
        const pageContent = pageRes.content as any[];
        const pageText = pageContent[0].text;
        const pageImage = pageContent[1];
        console.log(`Page Title: ${pageText.split('\n')[0]}`);
        console.log(`Screenshot received: ${pageImage.type === 'image' ? 'Yes' : 'No'} (${pageImage.data?.length} bytes)`);

        // Test Knowledge Prompts
        console.log("\n--- Testing Knowledge Prompts ---");
        try {
            const prompts = await client.listPrompts();
            console.log(`Found ${prompts.prompts.length} prompts.`);
            prompts.prompts.forEach(p => console.log(`- ${p.name}: ${p.description}`));

            if (prompts.prompts.find(p => p.name === 'usage-nmap')) {
                console.log("Fetching 'usage-nmap'...");
                const nmapGuide = await client.getPrompt({
                    name: "usage-nmap",
                    arguments: { topic: "general" } // Provide explicit arg to be safe
                });
                const guideText = nmapGuide.messages[0].content.type === 'text' ? nmapGuide.messages[0].content.text : "Not text";
                console.log(`Guide content length: ${guideText.length} chars`);
            } else {
                console.warn("usage-nmap prompt not found!");
            }
        } catch (e: any) {
            console.error(`Prompt Error: ${e.message} (Code: ${e.code})`);
        }



    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

main();
