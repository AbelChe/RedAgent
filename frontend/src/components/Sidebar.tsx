'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { workspaceService } from '@/services/api';
import { Workspace } from '@/types';
import { Plus, MessageSquare, Loader2, History, Box, Search, Pencil, Check, X, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import moment from 'moment';
import { Dialog } from './ui/Dialog';

export function Sidebar() {
    const params = useParams();
    const router = useRouter();
    const currentId = params?.id as string;

    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    useEffect(() => {
        loadWorkspaces();
    }, []);

    const loadWorkspaces = async () => {
        try {
            const list = await workspaceService.list();
            setWorkspaces(list);
        } catch (err) {
            console.error('Failed to load workspaces', err);
        } finally {
            setLoading(false);
        }
    };

    const handleNewChat = async () => {
        setCreating(true);
        try {
            // Default name with timestamp or random?
            // User flow in homepage asks for name. Here we can prompt or just create "New Chat".
            // Let's create with generic name and let user rename later (if implemented) or just "New Session"
            const name = `Session ${moment().format('MM-DD HH:mm')}`;
            const ws = await workspaceService.create(name, 'agent');
            // Optimistic update
            setWorkspaces([ws, ...workspaces]);
            router.push(`/workspace/${ws.id}`);
        } catch (err) {
            console.error(err);
        } finally {
            setCreating(false);
        }
    };

    const startEditing = (ws: Workspace, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingId(ws.id);
        setEditName(ws.name);
    };

    const cancelEditing = (e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        setEditingId(null);
        setEditName('');
    };

    const saveEditing = async (e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        if (!editingId || !editName.trim()) return;

        try {
            const updated = await workspaceService.update(editingId, { name: editName });
            setWorkspaces(workspaces.map(ws => ws.id === editingId ? updated : ws));
            setEditingId(null);
        } catch (err) {
            console.error('Failed to update workspace name', err);
            alert('Failed to rename session');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            saveEditing();
        } else if (e.key === 'Escape') {
            cancelEditing();
        }
    };

    const handleDelete = (ws: Workspace, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setWorkspaceToDelete(ws);
    };

    const confirmDelete = async () => {
        if (workspaceToDelete && workspaceToDelete.id === 'BATCH') {
            // Batch delete logic
            try {
                await workspaceService.batchDelete(Array.from(selectedIds));
                setWorkspaces(workspaces.filter(w => !selectedIds.has(w.id)));
                // If active session is deleted, redirect
                if (selectedIds.has(currentId)) {
                    router.push('/workspace');
                }
                setIsSelectionMode(false);
                setSelectedIds(new Set());
            } catch (err) {
                console.error('Failed to batch delete workspaces', err);
                alert('Failed to delete sessions');
            } finally {
                setWorkspaceToDelete(null);
            }
        } else if (workspaceToDelete) {
            // Single delete logic
            try {
                await workspaceService.delete(workspaceToDelete.id);
                setWorkspaces(workspaces.filter(w => w.id !== workspaceToDelete.id));
                if (currentId === workspaceToDelete.id) {
                    router.push('/workspace');
                }
            } catch (err) {
                console.error('Failed to delete workspace', err);
                alert('Failed to delete session');
            } finally {
                setWorkspaceToDelete(null);
            }
        }
    };

    const toggleSelection = (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedIds(new Set());
    };

    const confirmBatchDelete = () => {
        // We can reuse the Dialog by creating a fake "batch workspace" object or just handling it in render
        // Actually best to handle different dialog modes?
        // Let's modify Dialog component usage below
    };

    return (
        <div className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col h-screen flex-shrink-0">
            {/* Header / New Chat */}
            <div className="p-4 border-b border-gray-800">
                <button
                    onClick={handleNewChat}
                    disabled={creating}
                    className="w-full flex items-center gap-2 justify-center bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    <span>New Session</span>
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <History className="w-3 h-3" />
                        History
                    </div>
                    {workspaces.length > 0 && (
                        <button
                            onClick={toggleSelectionMode}
                            className={clsx(
                                "hover:text-gray-300 transition-colors",
                                isSelectionMode ? "text-blue-400" : "text-gray-600"
                            )}
                        >
                            {isSelectionMode ? "Done" : "Select"}
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
                    </div>
                ) : workspaces.length === 0 ? (
                    <div className="text-center py-8 text-gray-600 text-sm">
                        No history yet.
                    </div>
                ) : (
                    workspaces.map((ws) => (
                        <Link
                            key={ws.id}
                            href={`/workspace/${ws.id}`}
                            onClick={(e) => isSelectionMode && toggleSelection(ws.id, e)}
                            className={clsx(
                                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors relative",
                                ws.id === currentId && !isSelectionMode
                                    ? "bg-gray-800 text-white"
                                    : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                            )}
                        >
                            {isSelectionMode ? (
                                <div className={clsx(
                                    "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                    selectedIds.has(ws.id) ? "bg-blue-600 border-blue-600" : "border-gray-600 group-hover:border-gray-500"
                                )}>
                                    {selectedIds.has(ws.id) && <Check className="w-3 h-3 text-white" />}
                                </div>
                            ) : (
                                <MessageSquare className={clsx(
                                    "w-4 h-4 shrink-0",
                                    ws.id === currentId ? "text-blue-400" : "text-gray-600 group-hover:text-gray-500"
                                )} />
                            )}

                            {editingId === ws.id ? (
                                <div className="flex-1 min-w-0 flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
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
                                        <div className="truncate font-medium">{ws.name}</div>
                                        <div className="text-[10px] text-gray-600 truncate">
                                            {moment(ws.created_at).fromNow()}
                                        </div>
                                    </div>

                                    {!isSelectionMode && (
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => startEditing(ws, e)}
                                                className="p-1.5 text-gray-500 hover:text-white transition-colors"
                                                title="Rename"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(ws, e)}
                                                className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </Link>
                    ))
                )}
            </div>

            {/* Batch Delete Footer */}
            {isSelectionMode && selectedIds.size > 0 && (
                <div className="p-4 border-t border-gray-800 bg-gray-950">
                    <button
                        onClick={() => setWorkspaceToDelete({ id: 'BATCH', name: `${selectedIds.size} sessions` } as any)}
                        className="w-full bg-red-600 hover:bg-red-500 text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete ({selectedIds.size})</span>
                    </button>
                </div>
            )}

            {/* User / Footer */}
            {!isSelectionMode && (
                <div className="p-4 border-t border-gray-800 bg-gray-950">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center border border-blue-500/20 text-blue-400 text-xs font-bold">
                            AI
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-300 truncate">Admin User</div>
                            <div className="text-xs text-gray-600">Pro Plan</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Dialog */}
            <Dialog
                isOpen={!!workspaceToDelete}
                onClose={() => setWorkspaceToDelete(null)}
                onConfirm={confirmDelete}
                title={workspaceToDelete?.id === 'BATCH' ? "Batch Delete" : "Delete Session"}
                description={workspaceToDelete?.id === 'BATCH'
                    ? `Are you sure you want to delete ${selectedIds.size} sessions? This action cannot be undone.`
                    : `Are you sure you want to delete "${workspaceToDelete?.name}"? This action cannot be undone.`
                }
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
}
