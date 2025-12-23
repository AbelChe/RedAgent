import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface ContainerConfig {
    image: string;
    capabilities?: string[];
    memory_limit?: string;
}

export interface ContainersConfig {
    default?: ContainerConfig;
    [toolName: string]: ContainerConfig | undefined;
}

const CONFIG_PATHS = [
    process.env.CONTAINERS_CONFIG_PATH, // 1. Env Var
    path.join(process.cwd(), 'config', 'containers.yaml'), // 2. Runtime ./config
    path.resolve(__dirname, '../config/containers.yaml'), // 3. Build artifact location
    path.resolve(__dirname, '../../backend/app/config/containers.yaml') // 4. Dev Monorepo
];

export function loadContainerConfig(): ContainersConfig {
    for (const configPath of CONFIG_PATHS) {
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
