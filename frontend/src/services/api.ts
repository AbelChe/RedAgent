import axios from 'axios';
import { Task, Workspace } from '../types';

export interface ToolRunData {
    id: string;
    tool: string;
    command: string;
    logs: string[];
    status: 'running' | 'completed' | 'failed';
    startTime: number;  // Timestamp in milliseconds
    workspaceId: string;
    task_id?: string;
}

const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || `http://${hostname}:8000`;

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const workspaceService = {
    create: async (data: { name: string; description?: string; mode: string; config?: Record<string, any> }) => {
        const response = await api.post<Workspace>('/workspaces/', data);
        return response.data;
    },

    list: async (): Promise<Workspace[]> => {
        const response = await api.get('/workspaces/');
        return response.data;
    },

    get: async (id: string): Promise<Workspace> => {
        // Backend: GET /workspaces/{workspace_id} 
        const response = await api.get(`/workspaces/${id}`);
        return response.data;
    },

    getConnectionToken: async (id: string): Promise<string> => {
        const response = await api.post<{ token: string }>(`/workspaces/${id}/connection-token`);
        return response.data.token;
    },

    listTasks: async (id: string): Promise<Task[]> => {
        const response = await api.get(`/workspaces/${id}/tasks`);
        return response.data;
    },

    update: async (id: string, data: { name?: string; description?: string }): Promise<Workspace> => {
        const response = await api.patch(`/workspaces/${id}`, data);
        return response.data;
    },

    delete: async (id: string): Promise<void> => {
        await api.delete(`/workspaces/${id}`);
    },

    batchDelete: async (ids: string[]): Promise<{ count: number }> => {
        const response = await api.post('/workspaces/batch_delete', { ids });
        return response.data;
    },

    runCommand: async (workspaceId: string, command: string): Promise<void> => {
        await api.post(`/workspaces/${workspaceId}/commands/run`, { command });
    }
};

export const taskService = {
    create: async (workspaceId: string, command: string, mode: 'ask' | 'planning' | 'agent' = 'agent', conversationId?: string): Promise<Task> => {
        const response = await api.post('/tasks/', {
            workspace_id: workspaceId,
            content: command,
            mode,
            conversation_id: conversationId
        });
        return response.data;
    },

    get: async (taskId: string): Promise<Task> => {
        const response = await api.get(`/tasks/${taskId}`);
        return response.data;
    },

    run: async (taskId: string): Promise<Task> => {
        const response = await api.post(`/tasks/${taskId}/run`);
        return response.data;
    },

    approve: async (taskId: string): Promise<Task> => {
        const response = await api.post(`/tasks/${taskId}/approve`);
        return response.data;
    },

    cancel: async (taskId: string): Promise<Task> => {
        const response = await api.post(`/tasks/${taskId}/cancel`);
        return response.data;
    }
};

export const toolRunService = {
    list: async (workspaceId: string, conversationId?: string): Promise<ToolRunData[]> => {
        const params = new URLSearchParams();
        if (conversationId) params.append('conversation_id', conversationId);
        const url = `/workspaces/${workspaceId}/tool-runs${params.toString() ? `?${params}` : ''}`;
        const response = await api.get(url);
        return response.data;
    },

    clear: async (workspaceId: string): Promise<void> => {
        await api.delete(`/workspaces/${workspaceId}/tool-runs`);
    },

    kill: async (runId: string): Promise<void> => {
        await api.post(`/workspaces/tool-runs/${runId}/kill`);
    }
};

export const toolsService = {
    getList: async (): Promise<string[]> => {
        const response = await api.get('/tools/');
        return response.data;
    }
};

export default api;
