import axios from 'axios';
import { Task, Workspace } from '../types';

const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || `http://${hostname}:8000`;

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const workspaceService = {
    create: async (name: string, mode: 'ask' | 'planning' | 'agent' = 'agent'): Promise<Workspace> => {
        const response = await api.post('/workspaces/', { name, mode });
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

    listTasks: async (id: string): Promise<Task[]> => {
        const response = await api.get(`/workspaces/${id}/tasks`);
        return response.data;
    },

    update: async (id: string, data: { name?: string }): Promise<Workspace> => {
        const response = await api.patch(`/workspaces/${id}`, data);
        return response.data;
    },

    delete: async (id: string): Promise<void> => {
        await api.delete(`/workspaces/${id}`);
    },

    batchDelete: async (ids: string[]): Promise<{ count: number }> => {
        const response = await api.post('/workspaces/batch_delete', { ids });
        return response.data;
    }
};

export const taskService = {
    create: async (workspaceId: string, command: string, mode: 'ask' | 'planning' | 'agent' = 'agent'): Promise<Task> => {
        const response = await api.post('/tasks/', {
            workspace_id: workspaceId,
            content: command,
            mode
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
    }
};

export default api;
