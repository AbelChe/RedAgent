const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const server = new McpServer({
    name: "test",
    version: "1.0.0"
});

console.log("Keys of McpServer instance:");
console.log(Object.keys(server));
console.log("Prototype of McpServer:");
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(server)));

if (server.server) {
    console.log("\nKeys of server.server:");
    console.log(Object.keys(server.server));
    console.log("Prototype of server.server:");
    console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(server.server)));

    // Check deeper prototype chain for typical JSON-RPC methods
    let proto = Object.getPrototypeOf(server.server);
    while (proto) {
        console.log("Proto:", Object.getOwnPropertyNames(proto));
        proto = Object.getPrototypeOf(proto);
    }
}
