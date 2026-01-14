'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { conversationService } from '@/services/conversations';
import { ConversationWithStats } from '@/types/conversation';
import { Plus, MessageCircle, Loader2, History, Pencil, Check, X, Trash2, ChevronsLeft, ChevronsRight, Edit2 } from 'lucide-react';
import clsx from 'clsx';
import moment from 'moment';
import { Dialog } from './ui/Dialog';
import { WorkspaceSettingsModal } from './WorkspaceSettingsModal';
import { Settings } from 'lucide-react';
import { Workspace } from '@/types';
import { workspaceService } from '@/services/api';

export function Sidebar() {
    const params = useParams();
    const router = useRouter();
    const workspaceId = params?.id as string;

    const [conversations, setConversations] = useState<ConversationWithStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [conversationToDelete, setConversationToDelete] = useState<ConversationWithStats | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    // URL params from path
    const activeConversationId = params?.conversationId as string;

    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        if (workspaceId) {
            loadConversations();
            loadWorkspace();
        }
    }, [workspaceId]);

    const loadWorkspace = async () => {
        try {
            const data = await workspaceService.get(workspaceId);
            setWorkspace(data);
        } catch (err) {
            console.error('Failed to load workspace details', err);
        }
    };

    // No need for URL update effect as we rely on Next.js routing now

    const loadConversations = async () => {
        if (!workspaceId) return;

        try {
            const list = await conversationService.list(workspaceId);
            setConversations(list);
        } catch (err) {
            console.error('Failed to load conversations', err);
        } finally {
            setLoading(false);
        }
    };

    const handleNewConversation = async () => {
        if (!workspaceId) return;

        setCreating(true);
        try {
            const title = `Conversation ${moment().format('MM-DD HH:mm')}`;
            const newConv = await conversationService.create(workspaceId, { title });
            const newConvWithStats: ConversationWithStats = {
                ...newConv,
                task_count: 0,
                message_count: 0
            };
            setConversations([newConvWithStats, ...conversations]);
            // Navigate to new conversation
            router.push(`/workspace/${workspaceId}/c/${newConv.id}`);
        } catch (err) {
            console.error(err);
            alert('Failed to create conversation');
        } finally {
            setCreating(false);
        }
    };

    const startEditing = (conv: ConversationWithStats, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isCollapsed) return;
        setEditingId(conv.id);
        setEditTitle(conv.title);
    };

    const cancelEditing = (e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        setEditingId(null);
        setEditTitle('');
    };

    const saveEditing = async (e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        if (!editingId || !editTitle.trim()) return;

        try {
            await conversationService.update(editingId, { title: editTitle });
            setConversations(conversations.map(c => c.id === editingId ? { ...c, title: editTitle } : c));
            setEditingId(null);
        } catch (err) {
            console.error('Failed to update conversation title', err);
            alert('Failed to rename conversation');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            saveEditing();
        } else if (e.key === 'Escape') {
            cancelEditing();
        }
    };

    const handleDelete = (conv: ConversationWithStats, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setConversationToDelete(conv);
    };

    const confirmDelete = async () => {
        if (!conversationToDelete) return;

        try {
            await conversationService.delete(conversationToDelete.id);

            const remaining = conversations.filter(c => c.id !== conversationToDelete.id);
            setConversations(remaining);

            // If deleted current conversation, navigate to another
            if (activeConversationId === conversationToDelete.id) {
                if (remaining.length > 0) {
                    router.push(`/workspace/${workspaceId}/c/${remaining[0].id}`);
                } else {
                    router.push(`/workspace/${workspaceId}`); // Will create new default
                }
            } else {
                router.refresh();
            }
        } catch (err) {
            console.error('Failed to delete conversation', err);
            alert('Failed to delete conversation');
        } finally {
            setConversationToDelete(null);
        }
    };

    // Don't show sidebar if no workspace selected
    if (!workspaceId) {
        return null;
    }

    return (
        <div className={clsx(
            "bg-gray-950 border-r border-gray-800 flex flex-col h-screen flex-shrink-0 transition-all duration-300 ease-in-out relative z-50",
            isCollapsed ? "w-[70px]" : "w-64"
        )}>
            {/* Logo / Brand Header */}
            <div className={clsx("p-4 border-b border-gray-800 flex items-center justify-between gap-3 overflow-hidden whitespace-nowrap", isCollapsed && "justify-center px-0 py-4")}>
                {isCollapsed ? (
                    <button
                        onClick={() => setIsCollapsed(false)}
                        className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-xs shadow-lg shadow-blue-900/20 hover:scale-105 transition-transform"
                        title="Expand"
                    >
                        💬
                    </button>
                ) : (
                    <div className="flex items-center gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-xs shadow-lg shadow-blue-900/20">💬</div>
                        <div>
                            <h1 className="text-sm font-bold text-white">Conversations</h1>
                            <p className="text-[10px] text-gray-500">Current Workspace</p>
                        </div>
                    </div>
                )}

                {!isCollapsed && (
                    <button
                        onClick={() => setIsCollapsed(true)}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                        title="Collapse Sidebar"
                    >
                        <ChevronsLeft className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {/* New Conversation Button */}
                <button
                    onClick={handleNewConversation}
                    disabled={creating}
                    className={clsx(
                        "flex items-center gap-2 justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 mb-3",
                        isCollapsed ? "w-10 h-10 mx-auto p-0 rounded-xl" : "w-full py-2 px-3 text-sm font-medium"
                    )}
                    title={isCollapsed ? "New Conversation" : undefined}
                >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {!isCollapsed && <span>New Conversation</span>}
                </button>

                <div className={clsx(
                    "px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2 overflow-hidden whitespace-nowrap",
                    isCollapsed && "hidden"
                )}>
                    <History className="w-3 h-3" />
                    All Conversations
                </div>

                {loading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="text-center py-8 text-gray-600 text-sm">
                        {!isCollapsed && "No conversations yet."}
                    </div>
                ) : (
                    conversations.map((conv) => (
                        <div
                            key={conv.id}
                            onClick={() => !editingId && router.push(`/workspace/${workspaceId}/c/${conv.id}`)}
                            className={clsx(
                                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors relative cursor-pointer",
                                activeConversationId === conv.id
                                    ? "bg-gray-800 text-white"
                                    : "text-gray-400 hover:bg-gray-900 hover:text-gray-200",
                                isCollapsed && "justify-center px-0 py-3"
                            )}
                            title={isCollapsed ? conv.title : undefined}
                        >
                            <MessageCircle className={clsx(
                                "w-4 h-4 shrink-0",
                                activeConversationId === conv.id ? "text-blue-400" : "text-gray-600 group-hover:text-gray-500"
                            )} />

                            {!isCollapsed && (
                                <>
                                    {editingId === conv.id ? (
                                        <div className="flex-1 min-w-0 flex items-center gap-1">
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                onKeyDown={handleKeyDown}
                                                onClick={(e) => e.preventDefault()}
                                                className="w-full bg-gray-950 border border-blue-500 rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                                                autoFocus
                                            />
                                            <button onClick={saveEditing} className="text-green-400 hover:text-green-300">
                                                <Check className="w-3 h-3" />
                                            </button>
                                            <button onClick={cancelEditing} className="text-gray-400 hover:text-gray-300">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex-1 min-w-0">
                                                <div className="truncate font-medium">{conv.title}</div>
                                                <div className="text-[10px] text-gray-600 truncate flex items-center gap-2">
                                                    <span>{conv.task_count} tasks</span>
                                                    <span>·</span>
                                                    <span>{moment(conv.updated_at).fromNow()}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => startEditing(conv, e)}
                                                    className="p-1.5 text-gray-500 hover:text-white transition-colors"
                                                    title="Rename"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                {conversations.length > 1 && (
                                                    <button
                                                        onClick={(e) => handleDelete(conv, e)}
                                                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-800 bg-gray-950">
                {!isCollapsed ? (
                    <div className="space-y-3">
                        {/* Settings Button (Full Width) */}
                        <button
                            onClick={() => setShowSettings(true)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            <Settings className="w-4 h-4" />
                            <span>Workspace Settings</span>
                        </button>

                        {/* Stats Row */}
                        <div className="flex items-center gap-3 px-1">
                            <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center border border-blue-500/20 text-blue-400 text-xs font-bold">
                                {conversations.length}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-300 truncate">Conversations</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <button
                            onClick={() => setShowSettings(true)}
                            className="w-8 h-8 mx-auto flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                            title="Workspace Settings"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center border border-blue-500/20 text-blue-400 text-xs font-bold mx-auto" title={`${conversations.length} Conversations`}>
                            {conversations.length}
                        </div>
                    </div>
                )}
            </div>

            {/* Settings Modal */}
            {showSettings && workspace && (
                <WorkspaceSettingsModal
                    isOpen={showSettings}
                    workspace={workspace}
                    onClose={() => setShowSettings(false)}
                    onUpdate={(updated) => setWorkspace(updated)}
                />
            )}

            {/* Delete Dialog */}
            <Dialog
                isOpen={!!conversationToDelete}
                onClose={() => setConversationToDelete(null)}
                onConfirm={confirmDelete}
                title="Delete Conversation"
                description={`Are you sure you want to delete "${conversationToDelete?.title}"? All tasks and messages will be removed. This action cannot be undone.`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
}
