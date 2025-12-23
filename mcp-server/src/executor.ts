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

    async executeEphemeral(command: string[], config: ContainerConfig): Promise<string> {
        const workspacePath = path.resolve(process.cwd(), 'workspace_data');

        try {
            // Pull image if not exists (simplified, might want to check first)
            // await this.docker.pull(config.image);

            const runStream = await this.docker.run(config.image, command, process.stdout, {
                HostConfig: {
                    Binds: [`${workspacePath}:/data`],
                    AutoRemove: true,
                    CapAdd: config.capabilities as any
                }
            });

            // Note: dockerode run returns output differently depending on stream options.
            // For simplicity in this v1, we might need to capture stream manually if process.stdout isn't what we want.
            // However, `docker.run` outputs to the provided stream.
            // We will refine this to capture output to return string.

            return "Execution finished (Ephemeral container mode)";
        } catch (error: any) {
            return `Docker Run Error: ${error.message}`;
        }
    }

    // Revised executeEphemeral to capture output
    async executeEphemeralCaptured(command: string[], config: ContainerConfig): Promise<string> {
        const workspacePath = path.resolve(process.cwd(), 'workspace_data');
        console.error(`🚀 [MCP-EDGE] STARTING TOOL: ${command.join(' ')} (Image: ${config.image})`);

        try {
            // We use createContainer directly to control auto-remove and streams better
            // Pulling image might be needed if not present, but skipping for speed assuming pre-pulled or auto-pull on run
            const container = await this.docker.createContainer({
                Image: config.image,
                Cmd: command,
                HostConfig: {
                    Binds: [`${workspacePath}:/data`],
                    AutoRemove: true,
                    CapAdd: config.capabilities as any
                },
                Tty: false
            });

            const stream = await container.attach({ stream: true, stdout: true, stderr: true });
            await container.start();

            let output = '';

            // Simple stream handler to capture output AND print to console for visibility
            stream.on('data', (chunk: Buffer) => {
                // Remove Docker header bytes (First 8 bytes are header if multiplexed)
                // However, without strict parsing, this is hacky.
                // Dockerode's demuxStream is better for printing.
                // But generally for a quick "Get string", we can just append, but raw output has headers.
                // For this agent V1, we accept minor artifacts or use demux.
                // Let's try to just return standard logging.
                // console.log(chunk.toString()); // Log to MCP console
                output += chunk.toString().replace(/[\x00-\x1F]/g, ''); // Strip control chars roughly
            });

            // Use Dockerode's demux to print cleanly to the MCP Console for the user
            container.modem.demuxStream(stream, process.stdout, process.stderr);

            await container.wait();

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
}

