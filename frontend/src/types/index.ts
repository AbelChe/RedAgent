export interface Workspace {
    id: string;
    name: string;
    description?: string;
    mode: 'ask' | 'planning' | 'agent' | 'sandbox';
    created_at: string;
    config?: Record<string, any>;
    // Service Stack Info
    status?: string;
    code_server_url?: string;  // User-configured Code Server URL
    mcp_endpoint?: string;
    code_server_endpoint?: string;
    mcp_container_id?: string;
    code_container_id?: string;
    stats?: {
        task_count: number;
        tool_run_count: number;
    };
}

export interface CommandResult {
    success: boolean;
    exit_code: number;
    stdout: string;
    stderr: string;
}

export interface AgentResult {
    outcome?: string;
    final_message?: string;
    history?: string[];
    messages?: Record<string, any>[];
    error?: string;
    pending_command?: string; // For waiting_approval
    thinking?: string;
}

export interface Task {
    id: string;
    workspace_id: string;
    conversation_id?: string | null;  // Added for conversation support
    command: string;
    mode: 'ask' | 'planning' | 'agent';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_approval';
    result?: CommandResult | AgentResult | null;
    thinking?: string; // Current turn's thinking
    created_at: string;
    updated_at?: string;
}

export type TaskStatus = Task['status'];
