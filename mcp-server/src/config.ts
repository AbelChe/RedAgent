import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import dotenv from 'dotenv';

// Load environment variables immediately
dotenv.config();

export interface ContainerConfig {
    image: string;
    capabilities?: string[];
    memory_limit?: string;
    cpu_limit?: number | string;
    pids_limit?: number;
    async?: boolean;
}

export interface ContainersConfig {
    default?: ContainerConfig;
    [toolName: string]: ContainerConfig | undefined;
}

class AppConfig {
    public readonly mcpHubUrl: string | undefined;
    public readonly mcpToken: string | undefined;
    public readonly containerConfig: ContainersConfig;

    constructor() {
        this.mcpHubUrl = process.env.MCP_HUB_URL;
        this.mcpToken = process.env.MCP_TOKEN;
        this.containerConfig = this.loadContainerConfig();
    }

    private loadContainerConfig(): ContainersConfig {
        const potentialPaths = [
            process.env.CONTAINERS_CONFIG_PATH, // 1. Env Var (Highest Priority)
            '/app/containers.yaml',             // 2. Docker Standard Location
            path.join(process.cwd(), 'containers.yaml'), // 3. Local Runtime Fallback
            path.resolve(__dirname, '../containers.yaml') // 4. Dev/Build Fallback
        ];

        for (const configPath of potentialPaths) {
            if (configPath && fs.existsSync(configPath)) {
                try {
                    const fileContents = fs.readFileSync(configPath, 'utf8');
                    const config = yaml.load(fileContents) as ContainersConfig;
                    console.error(`MCP: Loaded container config from ${configPath}`);
                    return config;
                } catch (error) {
                    console.error(`MCP: Error loading container config from ${configPath}: ${error}`);
                    // Continue to next path
                }
            }
        }

        console.warn("MCP: No container configuration found. Ephemeral containers may not work.");
        return {};
    }
}

export const Config = new AppConfig();
