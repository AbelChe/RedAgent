import api from './api';

export interface Job {
    id: string;
    command: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    priority: number;
    workspace_id: string;
    task_id?: string;  // For conversation filtering
    agent_id?: string;
    exit_code?: number;
    stdout?: string;
    stderr?: string;
    output_files?: string[];
    error_message?: string;
    created_at: string;
    started_at?: string;
    completed_at?: string;
}

export const jobsService = {
    async list(workspaceId: string, status?: string, conversationId?: string): Promise<Job[]> {
        const params = new URLSearchParams({ workspace_id: workspaceId });
        if (status) params.append('status', status);
        if (conversationId) params.append('conversation_id', conversationId);

        const response = await api.get(`/api/jobs?${params}`);
        return response.data;
    },

    async get(jobId: string): Promise<Job> {
        const response = await api.get(`/api/jobs/${jobId}`);
        return response.data;
    },

    async create(workspaceId: string, command: string, priority?: number, taskId?: string): Promise<Job> {
        const response = await api.post('/api/jobs', {
            workspace_id: workspaceId,
            command,
            priority: priority || 5,
            task_id: taskId
        });
        return response.data;
    },

    async cancel(jobId: string): Promise<void> {
        await api.delete(`/api/jobs/${jobId}`);
    }
};
