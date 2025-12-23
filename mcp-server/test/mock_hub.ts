import WebSocket, { WebSocketServer } from 'ws';
import { JSONRPCMessage, JSONRPCRequest } from "@modelcontextprotocol/sdk/types.js";

const PORT = 8080;
const TOKEN = "test-token-123";

const wss = new WebSocketServer({ port: PORT });

console.log(`Mock Hub listening on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
    console.log(`Client connected from ${req.socket.remoteAddress}`);

    // simple auth check
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${TOKEN}`) {
        console.error(`Auth failed: ${auth}`);
        ws.close(1008, "Unauthorized");
        return;
    }

    console.log("Auth successful!");

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        console.log("Received:", JSON.stringify(msg, null, 2));
    });

    // Valid MCP JSON-RPC Request to list tools
    const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
    };

    console.log("Sending tools/list request...");
    ws.send(JSON.stringify(request));
});

// Keep alive for a bit then exit
setTimeout(() => {
    console.log("Mock Hub timeout, exiting...");
    process.exit(0);
}, 10000);
