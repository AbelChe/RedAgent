import Docker = require('dockerode');
import path from 'path';
import { ContainerConfig } from './config';

export class DockerExecutor {
    private docker: Docker;
    private defaultContainer: string;

    constructor(defaultContainer: string = 'pentest-sandbox') {
        this.docker = new Docker();
        this.defaultContainer = defaultContainer;
    }

    async executeInContainer(containerName: string, command: string[], onData?: (data: string) => void): Promise<string> {
        try {
            const container = this.docker.getContainer(containerName);
            const exec = await container.exec({
                Cmd: command,
                AttachStdout: true,
                AttachStderr: true,
            });

            const stream = await exec.start({ Detach: false, Tty: false });

            let output = '';
            stream.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                output += text;
                if (onData) {
                    onData(text);
                }
            });

            await new Promise((resolve, reject) => {
                stream.on('end', resolve);
                stream.on('error', reject);
            });
            return output;
        } catch (error: any) {
            if (error.statusCode === 404) {
                throw new Error(`Container '${containerName}' not found. Is it running?`);
            }
            throw new Error(`Docker Execution Error: ${error.message}`);
        }
    }

    async execute(command: string[]): Promise<string> {
        return this.executeInContainer(this.defaultContainer, command);
    }

    async executeEphemeral(command: string[], config: ContainerConfig, volumeName?: string): Promise<string> {
        // Use Docker named volume for secure workspace sharing
        // Volume name is passed via WORKSPACE_VOLUME_NAME env var or argument
        const targetVolume = volumeName || process.env.WORKSPACE_VOLUME_NAME || 'redagent-workspace';

        try {
            // Pull image if not exists (simplified, might want to check first)
            // await this.docker.pull(config.image);

            const runStream = await this.docker.run(config.image, command, process.stdout, {
                HostConfig: {
                    Binds: [`${targetVolume}:/workspace`],
                    AutoRemove: true,
                    CapAdd: config.capabilities as any
                },
                WorkingDir: '/workspace'
            });

            return "Execution finished (Ephemeral container mode)";
        } catch (error: any) {
            return `Docker Run Error: ${error.message}`;
        }
    }

    // Revised executeEphemeral to capture output
    async executeEphemeralCaptured(command: string[], config: ContainerConfig, onData?: (data: string) => void, volumeName?: string, signal?: AbortSignal): Promise<string> {
        // Use Docker named volume for secure workspace sharing
        const targetVolume = volumeName || process.env.WORKSPACE_VOLUME_NAME || 'redagent-workspace';
        console.error(`🚀 [MCP-EDGE] STARTING TOOL: ${command.join(' ')} (Image: ${config.image})`);

        // Check if already aborted before starting
        if (signal?.aborted) {
            console.error(`⚠️ [MCP-EDGE] Request already cancelled, skipping: ${command.join(' ')}`);
            return 'Cancelled: request was aborted before execution started.';
        }

        try {
            // We use createContainer directly to control auto-remove and streams better
            const container = await this.docker.createContainer({
                Image: config.image,
                Cmd: command,
                HostConfig: {
                    Binds: [`${targetVolume}:/workspace`],
                    AutoRemove: true,
                    CapAdd: config.capabilities as any
                },
                WorkingDir: '/workspace',
                Tty: false
            });

            const stream = await container.attach({ stream: true, stdout: true, stderr: true });
            await container.start();

            let output = '';
            let aborted = false;

            // Listen for abort signal — stop the container when client cancels
            const onAbort = () => {
                if (aborted) return;
                aborted = true;
                console.error(`🛑 [MCP-EDGE] CANCELLED by client, stopping container: ${command.join(' ')}`);
                container.stop({ t: 2 }).catch((err: any) => {
                    // Container may have already exited or been auto-removed
                    if (err.statusCode !== 304 && err.statusCode !== 404) {
                        console.error(`⚠️ [MCP-EDGE] Error stopping container: ${err.message}`);
                    }
                });
            };

            if (signal) {
                signal.addEventListener('abort', onAbort, { once: true });
            }

            // Stream handler with real-time callback support (like docker logs -f)
            stream.on('data', (chunk: Buffer) => {
                // Demux Docker stream (remove 8-byte header)
                const data = this.demuxDockerStream(chunk);
                if (data) {
                    output += data;
                    // Real-time callback for streaming output to caller
                    if (onData) {
                        onData(data);
                    }
                }
            });

            await container.wait();

            // Clean up abort listener
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }

            if (aborted) {
                console.error(`🛑 [MCP-EDGE] ABORTED: ${command.join(' ')}`);
                return output + '\n\n⚠️ Scan was cancelled by user.';
            }

            console.error(`✅ [MCP-EDGE] COMPLETED: ${command.join(' ')}`);
            return output;

        } catch (error: any) {
            console.error(`❌ [MCP-EDGE] ERROR: ${error.message}`);
            return `Docker Ephemeral Error: ${error.message}`;
        }
    }

    async ensureImage(imageName: string): Promise<boolean> {
        try {
            const image = this.docker.getImage(imageName);
            await image.inspect();
            return true;
        } catch (error: any) {
            if (error.statusCode === 404) {
                return false;
            }
            // Ignore other errors (e.g. connection) for now, return false to be safe or rethrow?
            // Let's allow startup but warn.
            console.error(`Error checking image ${imageName}: ${error.message}`);
            return false;
        }
    }

    /**
     * Starts a persistent container with PTY enabled and returns the stream.
     * Used for interactive terminal sessions.
     */
    async startPtyContainer(image: string, cmd: string[] = ['/bin/bash']): Promise<{ container: Docker.Container, stream: NodeJS.ReadWriteStream }> {
        // Use Docker named volume for secure workspace sharing
        const volumeName = process.env.WORKSPACE_VOLUME_NAME || 'redagent-workspace';

        const container = await this.docker.createContainer({
            Image: image,
            Cmd: cmd,
            Tty: true,
            OpenStdin: true,
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            HostConfig: {
                Binds: [`${volumeName}:/workspace`],  // Changed from /data to /workspace
                AutoRemove: true,
            },
            WorkingDir: '/workspace'  // Set working directory to match mount point
        });

        // Attach stream BEFORE starting to capture initial output
        const stream = await container.attach({
            stream: true,
            stdin: true,
            stdout: true,
            stderr: true
        });

        await container.start();

        // Resize to standard terminal size initially
        await container.resize({ h: 24, w: 80 });

        return { container, stream };
    }

    /**
     * Demux Docker stream format (removes 8-byte header from multiplexed streams)
     * Docker stream format: [stream_type(1)][padding(3)][size(4)][payload]
     * @param chunk Raw Buffer from Docker stream
     * @returns Demuxed payload as string, or null if invalid
     */
    private demuxDockerStream(chunk: Buffer): string | null {
        if (chunk.length < 8) {
            return null; // Not enough bytes for header
        }

        // Read the 4-byte size from bytes 4-7 (big-endian)
        const payloadSize = chunk.readUInt32BE(4);

        if (chunk.length < 8 + payloadSize) {
            // Incomplete payload, might be fragmented
            // For simplicity, return what we have (could be improved)
            return chunk.slice(8).toString('utf8');
        }

        // Extract payload (skip 8-byte header)
        const payload = chunk.slice(8, 8 + payloadSize);
        return payload.toString('utf8');
    }
}

