import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import WebSocket from "ws";

/**
 * Client-Side Transport that connects UP to a Server (Gateway/Hub)
 * Reversed direction: This Node.js process initiates the WS connection.
 */
export class WebSocketReverseTransport implements Transport {
    private _ws?: WebSocket;
    private _url: string;
    private _token?: string;

    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public onmessage?: (message: JSONRPCMessage) => void;

    constructor(url: string, token?: string) {
        this._url = url;
        this._token = token;
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            const options: WebSocket.ClientOptions = {};
            if (this._token) {
                options.headers = {
                    "x-mcp-token": this._token
                };
            }

            this._ws = new WebSocket(this._url, options);

            this._ws.on("open", () => {
                console.error(`MCP: Connected to Hub at ${this._url}`);
                resolve();
            });

            this._ws.on("error", (err) => {
                console.error(`MCP: Connection Error: ${err.message}`);
                if (this.onerror) this.onerror(err);
                reject(err);
            });

            this._ws.on("close", () => {
                console.error("MCP: Connection Closed");
                if (this.onclose) this.onclose();
            });

            this._ws.on("message", (data) => {
                try {
                    const text = data.toString();
                    const message = JSON.parse(text) as JSONRPCMessage;
                    if (this.onmessage) {
                        this.onmessage(message);
                    }
                } catch (error) {
                    console.error("MCP: Failed to parse message", error);
                }
            });
        });
    }

    async send(message: JSONRPCMessage): Promise<void> {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected");
        }

        // Debug: Log the message type and content to debug serialization issues
        console.error(`[MCP-TRANSPORT] send() called. Type: ${typeof message}, IsStringObj? ${message instanceof String}`);

        if (typeof message === 'string' || message instanceof String) {
            // SDK passed a serialized string or String object - send as is
            console.error(`[MCP-TRANSPORT] Sending string: ${message.toString().substring(0, 100)}...`);
            this._ws.send(message.toString());
        } else {
            // SDK passed an object - stringify it
            const text = JSON.stringify(message);
            console.error(`[MCP-TRANSPORT] Stringified to: ${text.substring(0, 150)}...`);
            this._ws.send(text);
        }
    }

    async close(): Promise<void> {
        if (this._ws) {
            this._ws.close();
        }
    }
}
