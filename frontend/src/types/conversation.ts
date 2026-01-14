// Conversation types for frontend

export interface Conversation {
    id: string;
    workspace_id: string;
    title: string;
    created_at: string;
    updated_at: string;
    system_prompt?: string;
    context_summary?: string;
}

export interface ConversationWithStats extends Conversation {
    task_count: number;
    message_count: number;
}

export interface ConversationCreate {
    title?: string;
    system_prompt?: string;
}

export interface ConversationUpdate {
    title?: string;
    context_summary?: string;
}
