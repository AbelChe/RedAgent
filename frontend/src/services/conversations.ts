import api from './api';
import { Conversation, ConversationWithStats, ConversationCreate, ConversationUpdate } from '@/types/conversation';

export const conversationService = {
    async create(workspaceId: string, data: ConversationCreate): Promise<Conversation> {
        const response = await api.post(`/api/workspaces/${workspaceId}/conversations`, data);
        return response.data;
    },

    async list(workspaceId: string): Promise<ConversationWithStats[]> {
        const response = await api.get(`/api/workspaces/${workspaceId}/conversations`);
        return response.data;
    },

    async get(conversationId: string): Promise<Conversation> {
        const response = await api.get(`/api/conversations/${conversationId}`);
        return response.data;
    },

    async update(conversationId: string, data: ConversationUpdate): Promise<Conversation> {
        const response = await api.patch(`/api/conversations/${conversationId}`, data);
        return response.data;
    },

    async delete(conversationId: string): Promise<void> {
        await api.delete(`/api/conversations/${conversationId}`);
    }
};
