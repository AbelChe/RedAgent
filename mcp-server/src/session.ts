import { v4 as uuidv4 } from 'uuid';
import { DockerExecutor } from './executor';

export interface Session {
    id: string;
    containerName: string;
    cwd: string;
    env: Record<string, string>;
    createdAt: number;
}

export class SessionManager {
    private sessions: Map<string, Session> = new Map();
    private executor: DockerExecutor;

    constructor(executor: DockerExecutor) {
        this.executor = executor;
    }

    createSession(containerName: string = 'pentest-sandbox'): Session {
        const id = uuidv4();
        const session: Session = {
            id,
            containerName,
            cwd: '/data', // Default to workspace mount
            env: {},
            createdAt: Date.now()
        };
        this.sessions.set(id, session);
        return session;
    }

    getSession(id: string): Session | undefined {
        return this.sessions.get(id);
    }

    listSessions(): Session[] {
        return Array.from(this.sessions.values());
    }

    async runCommand(sessionId: string, command: string, onLog?: (data: string) => void): Promise<string> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        // internal command to capture pwd
        const MARKER = "---MCP-CWD-MARKER---";

        // Construct command chain:
        // 1. Restore Env
        const envStr = Object.entries(session.env).map(([k, v]) => `export ${k}="${v}"`).join(' && ');
        const envPrefix = envStr ? `${envStr} && ` : '';

        // 2. Restore CWD -> Run Command -> Echo Marker -> Echo PWD
        // We wrap in bash -c to ensure && chaining works even if the command is complex
        // But docker exec takes a command list.
        // We'll construct a single bash command string.

        // Note: We need to handle `cd` specially or rely on `pwd` capture.
        // If command is `cd /foo`, the shell executes it, then we run `pwd`.

        const fullCommand = `cd "${session.cwd}" && ${envPrefix}${command} && echo "${MARKER}" && pwd`;

        // Execute via Docker (using bash to interpret the && chains)
        // We assume /bin/bash exists in the container (standard for kali/parrot)
        // Important: We need to strip the marker and pwd from the streamed log, 
        // otherwise the user sees "---MCP-CWD-MARKER---" in their console.
        // This is tricky with streaming.
        // Enhanced strategy: 
        // We stream everything. If the user sees the marker, it's a small price for streaming context.
        // Or we try to buffer the end. For V1 OpenHands parity, raw stream is acceptable. (OpenHands shows everything usually)

        const result = await this.executor.executeInContainer(
            session.containerName,
            ["/bin/bash", "-c", fullCommand],
            (data) => {
                // Filter out marker if possible, or just pass through
                if (onLog) onLog(data);
            }
        );

        // Parse result
        // Output should end with: \nMARKER\n/new/path\n

        // Warning: result includes both stdout and stderr merged or separated?
        // DockerExecutor.execute returns a string combined.

        // Let's rely on string parsing.
        const lines = result.split('\n');
        let outputLines: string[] = [];
        let newCwd = session.cwd;
        let foundMarker = false;

        // We iterate from end to find marker
        // But stdout/stderr might be mixed. 
        // The MARKER and pwd should be on stdout.
        // If command failed (e.g. invalid command), the chain might stop before echoing marker?
        // Yes, if `command` fails (non-zero exit), the `&&` stops.
        // So we might not get the marker. In that case, CWD doesn't change.

        if (result.includes(MARKER)) {
            // Split by marker
            const parts = result.split(MARKER);
            const content = parts[0].trim();
            const tail = parts[1].trim(); // Should contain pwd

            // Update CWD
            // tail might have extra newlines or whitespace
            if (tail) {
                // The tail should be the new path. 
                // Might need validation (is absolute path?)
                const potentialPath = tail.split('\n')[0].trim();
                if (potentialPath.startsWith('/')) {
                    session.cwd = potentialPath;
                }
            }
            return content;
        } else {
            // Command likely failed or didn't reach the end
            // Return original result
            return result;
        }
    }
}
