'use client';

import { useState, useEffect } from 'react';
import { MessageCircle, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { ConversationWithStats } from '@/types/conversation';
import { conversationService } from '@/services/conversations';
import clsx from 'clsx';

interface Props {
    workspaceId: string;
    activeConversationId?: string;
    onConversationSelect: (conversationId: string) => void;
    collapsed?: boolean;
}

export function ConversationList({ workspaceId, activeConversationId, onConversationSelect, collapsed = false }: Props) {
    const [conversations, setConversations] = useState<ConversationWithStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');

    useEffect(() => {
        loadConversations();
    }, [workspaceId]);

    const loadConversations = async () => {
        try {
            const data = await conversationService.list(workspaceId);
            setConversations(data);
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = async () => {
        setIsCreating(true);
        try {
            const newConv = await conversationService.create(workspaceId, {
                title: `Conversation ${conversations.length + 1}`
            });
            const newConvWithStats: ConversationWithStats = {
                ...newConv,
                task_count: 0,
                message_count: 0
            };
            setConversations([newConvWithStats, ...conversations]);
            onConversationSelect(newConv.id);
        } catch (error) {
            console.error('Failed to create conversation:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (conversationId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Delete this conversation? All tasks and messages will be removed.')) return;

        try {
            await conversationService.delete(conversationId);
            setConversations(conversations.filter(c => c.id !== conversationId));

            if (conversationId === activeConversationId && conversations.length > 1) {
                const next = conversations.find(c => c.id !== conversationId);
                if (next) onConversationSelect(next.id);
            }
        } catch (error) {
            console.error('Failed to delete conversation:', error);
        }
    };

    const startEditing = (conv: ConversationWithStats, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(conv.id);
        setEditTitle(conv.title);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditTitle('');
    };

    const saveEdit = async (conversationId: string) => {
        if (!editTitle.trim()) {
            cancelEditing();
            return;
        }

        try {
            await conversationService.update(conversationId, { title: editTitle });
            setConversations(conversations.map(c =>
                c.id === conversationId ? { ...c, title: editTitle } : c
            ));
            cancelEditing();
        } catch (error) {
            console.error('Failed to update conversation:', error);
        }
    };

    const handleTitleDoubleClick = (conv: ConversationWithStats, e: React.MouseEvent) => {
        e.stopPropagation();
        startEditing(conv, e);
    };

    if (loading) {
        return (
            <div className="p-4 text-center text-gray-500">
                <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className={clsx(
                "p-3 border-b border-gray-800 flex items-center justify-between",
                collapsed && "justify-center"
            )}>
                {!collapsed && <h3 className="text-sm font-semibold text-gray-300">Conversations</h3>}
                <button
                    onClick={handleCreateNew}
                    disabled={isCreating}
                    className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    title={collapsed ? "New Conversation" : ""}
                >
                    <Plus className="w-4 h-4 text-white" />
                </button>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {conversations.length === 0 ? (
                    <div className={clsx(
                        "p-6 text-center text-gray-500 text-sm",
                        collapsed && "p-2"
                    )}>
                        <MessageCircle className={clsx(
                            "mx-auto mb-2 opacity-50",
                            collapsed ? "w-5 h-5" : "w-8 h-8"
                        )} />
                        {!collapsed && (
                            <>
                                <p>No conversations yet</p>
                                <p className="text-xs mt-1">Click + to start</p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className={clsx("space-y-1", collapsed ? "p-1" : "p-2")}>
                        {conversations.map((conv) => (
                            <div
                                key={conv.id}
                                onClick={() => onConversationSelect(conv.id)}
                                className={clsx(
                                    "group rounded-lg cursor-pointer transition-all relative",
                                    collapsed ? "p-2" : "p-3",
                                    activeConversationId === conv.id
                                        ? "bg-blue-600/20 border border-blue-500/50"
                                        : "bg-gray-800/50 hover:bg-gray-800 border border-transparent"
                                )}
                                title={collapsed ? conv.title : undefined}
                            >
                                {collapsed ? (
                                    // Collapsed view: Icon only
                                    <div className="flex items-center justify-center">
                                        <MessageCircle className="w-5 h-5 text-gray-400" />
                                        {conv.task_count > 0 && (
                                            <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full"></span>
                                        )}
                                    </div>
                                ) : (
                                    // Expanded view: Full details
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            {editingId === conv.id ? (
                                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="text"
                                                        value={editTitle}
                                                        onChange={e => setEditTitle(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') saveEdit(conv.id);
                                                            if (e.key === 'Escape') cancelEditing();
                                                        }}
                                                        className="flex-1 px-2 py-1 text-sm bg-gray-900 border border-blue-500 rounded text-white focus:outline-none"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={() => saveEdit(conv.id)}
                                                        className="p-1 rounded hover:bg-green-500/20 text-green-400"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={cancelEditing}
                                                        className="p-1 rounded hover:bg-red-500/20 text-red-400"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <h4
                                                    className="text-sm font-medium text-white truncate"
                                                    onDoubleClick={e => handleTitleDoubleClick(conv, e)}
                                                    title="Double-click to edit"
                                                >
                                                    {conv.title}
                                                </h4>
                                            )}
                                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                                <span>{conv.task_count} tasks</span>
                                                <span>{conv.message_count} messages</span>
                                            </div>
                                            <div className="text-xs text-gray-600 mt-1">
                                                {new Date(conv.updated_at).toLocaleDateString()}
                                            </div>
                                        </div>

                                        <div className="flex gap-1">
                                            {editingId !== conv.id && (
                                                <button
                                                    onClick={(e) => startEditing(conv, e)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-500/20 text-gray-500 hover:text-blue-400 transition-all"
                                                    title="Rename conversation"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {conversations.length > 1 && (
                                                <button
                                                    onClick={(e) => handleDelete(conv.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all"
                                                    title="Delete conversation"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
