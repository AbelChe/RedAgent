import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import dotenv from 'dotenv';

// Load environment variables
// Priority: .env.mcp (MCP standalone mode) → .env (default)
const envFile = fs.existsSync(path.resolve(process.cwd(), '.env.mcp'))
    ? '.env.mcp'
    : '.env';
dotenv.config({ path: envFile });
console.error(`[Config] Loaded env from: ${envFile}`);

export interface ContainerConfig {
    image: string;
    capabilities?: string[];
    memory_limit?: string;
    cpu_limit?: number | string;
    pids_limit?: number;
    async?: boolean;
    output?: string;
}

export interface ContainersConfig {
    default?: ContainerConfig;
    [toolName: string]: ContainerConfig | undefined;
}

class AppConfig {
    public readonly mcpHubUrl: string | undefined;
    public readonly mcpToken: string | undefined;
    public readonly mcpHttpPort: number;
    public readonly mcpTransportMode: 'http' | 'stdio' | 'ws';
    public readonly containerConfig: ContainersConfig;

    // Bee Security Scan Platform
    public readonly beeApiUrl: string | undefined;
    public readonly beeApiToken: string | undefined;

    // Bee UnitFilter Service (单位名称验证与分类)
    public readonly unitFilterUrl: string | undefined;
    public readonly unitFilterToken: string | undefined;

    // Bee ICP Filing Query Service (ICP 备案查询)
    public readonly icpApiUrl: string | undefined;
    public readonly icpApiToken: string | undefined;

    // Bee Addr Query Service (网络地址查询 - IP/域名属性、CDN/WAF检测)
    public readonly addrApiUrl: string | undefined;
    public readonly addrApiToken: string | undefined;

    // Bee Task Queue (Temporal 任务队列名称，必须与 Worker 注册的队列匹配)
    public readonly beeTaskQueue: string;

    // S3/MinIO OSS Configuration (for fetching Bee scan result data)
    public readonly s3Endpoint: string | undefined;
    public readonly s3AccessKey: string | undefined;
    public readonly s3SecretKey: string | undefined;
    public readonly s3Region: string;
    public readonly s3ForcePathStyle: boolean;

    constructor() {
        this.mcpHubUrl = process.env.MCP_HUB_URL;
        this.mcpToken = process.env.MCP_TOKEN;
        this.mcpHttpPort = parseInt(process.env.MCP_HTTP_PORT || '3001');
        this.mcpTransportMode = (process.env.MCP_TRANSPORT_MODE as any) || 'stdio';
        this.containerConfig = this.loadContainerConfig();

        // Bee API config
        this.beeApiUrl = process.env.BEE_API_URL;
        this.beeApiToken = process.env.BEE_API_TOKEN;

        // UnitFilter config
        this.unitFilterUrl = process.env.UNITFILTER_API_URL;
        this.unitFilterToken = process.env.UNITFILTER_API_TOKEN;

        // ICP Filing Query config
        this.icpApiUrl = process.env.ICP_API_URL;
        this.icpApiToken = process.env.ICP_API_TOKEN;

        // Addr Query config
        this.addrApiUrl = process.env.ADDR_API_URL;
        this.addrApiToken = process.env.ADDR_API_TOKEN;

        // Bee Task Queue config
        this.beeTaskQueue = process.env.BEE_TASK_QUEUE || 'prod-01';

        // S3/MinIO OSS config
        this.s3Endpoint = process.env.S3_ENDPOINT;
        this.s3AccessKey = process.env.S3_ACCESS_KEY;
        this.s3SecretKey = process.env.S3_SECRET_KEY;
        this.s3Region = process.env.S3_REGION || 'us-east-1';
        this.s3ForcePathStyle = process.env.S3_FORCE_PATH_STYLE !== 'false'; // default true for MinIO
    }

    private loadContainerConfig(): ContainersConfig {
        const potentialPaths = [
            process.env.CONTAINERS_CONFIG_PATH, // 1. Env Var (Highest Priority)
            '/app/config/containers.yaml',      // 2. External Volume Mount
            '/app/containers.yaml',             // 3. Docker Standard Location (Legacy/Fallback)
            path.join(process.cwd(), 'containers.yaml'), // 4. Local Runtime Fallback
            path.resolve(__dirname, '../containers.yaml') // 5. Dev/Build Fallback
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
