# RedAgent - MCP Server

An "Agentic Edge Node" that bridges the gap between AI Models (Cloud) and Security Tools (Local Execution).
Built on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), this server acts as the "Hands" of your AI Agent.

## 🌟 Capabilities

1.  **Smart Execution**: Automatically routes tasks to the appropriate environment:
    *   **Disposable Containers**: For risky or one-off tools (nmap, nuclei).
    *   **Persistent Sandbox**: For complex, multi-step operations.
2.  **Stateful Memory**: Maintains shell sessions (`cwd`, `env`) across multiple interactions.
3.  **Real-time Vision**: Integrated Headless Browser (Puppeteer) to "see" and interact with web targets.
4.  **Cloud-Native**: Supports **"Call Home"** mode via WebSocket to connect to SaaS platforms securely.

---

## 🏗 Architecture

```mermaid
graph TD
    subgraph "Cloud (Your SaaS)"
        Brain[AI Agent / Brain]
        Hub[WebSocket Hub]
    end

    subgraph "Edge (User's Network)"
        MCP[MCP Server (Node.js)]
        Docker[Host Docker Engine]
        
        Tool1[Nmap Container]
        Tool2[Browser Session]
    end

    Brain <-->|JSON-RPC| Hub
    Hub <-->|WSS (Reverse Connection)| MCP
    MCP -->|Control| Docker
    Docker -->|Launch| Tool1
    Docker -->|Launch| Tool2
```

---

## 🚀 Getting Started

### Prerequisites
*   Node.js 20+
*   Docker Desktop / Docker Engine (Running)

### 1. Installation

```bash
cd mcp-server
npm install
npm run build
```

### 2. Configuration (`tools/config/containers.yaml`)
Define which Docker images handle which tools. The file is located at `../../backend/app/config/containers.yaml`.

```yaml
# Default sandbox for general commands
default:
  image: "pentest-sandbox:latest"

# Specialized containers for specific tools
nmap:
  image: "instrumentisto/nmap:latest"
  capabilities: ["NET_ADMIN"]
```

---

## 🏃‍♂️ usage Modes

### Mode A: Local Development (Stdio)
Ideal for testing logic locally or connecting to a local Desktop Agent (e.g., Cursor).

**Option 1: Quick Verification**
Run the included test script which mimics an MCP client:
```bash
npx ts-node verify.ts
```

**Option 2: Connect from VS Code / Cursor**
Configure your IDE to run the server directly:
```json
"mcpServers": {
  "pentest-agent": {
    "command": "node",
    "args": ["/path/to/mcp-server/dist/index.js"],
    "env": {
      "PATH": "/usr/local/bin:/usr/bin" 
    }
  }
}
```

### Mode B: Cloud / SaaS Node (WebSocket)
Deploy as an edge node that connects to your cloud platform.

**Run via Docker:**
```bash
docker run -d \
  --name pentest-node \
  --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e MCP_HUB_URL="wss://api.your-saas.com/connect" \
  -e MCP_TOKEN="your-node-token" \
  my-registry/mcp-server:latest
```

*   **MCP_HUB_URL**: Where to connect to (e.g., your SaaS WebSocket Gateway).
*   **MCP_TOKEN**: Authentication token for this node.

---

## 🛠️ Tool Development

To add new capabilities, edit `src/index.ts` and register a new tool:

```typescript
server.tool(
    "tool_name",
    { arg: z.string() },
    async ({ arg }) => {
        // Use SessionManager or DockerExecutor
        return { content: [{ type: "text", text: "Result" }] };
    }
);
```
