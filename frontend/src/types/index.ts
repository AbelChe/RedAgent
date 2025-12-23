export interface Workspace {
    id: string;
    name: string;
    mode: 'ask' | 'planning' | 'agent';
    created_at: string;
    config?: Record<string, any>;
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
    command: string;
    mode: 'ask' | 'planning' | 'agent';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_approval';
    result?: CommandResult | AgentResult | null;
    thinking?: string; // Current turn's thinking
    created_at: string;
    updated_at?: string;
}

export type TaskStatus = Task['status'];
