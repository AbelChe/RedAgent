'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { workspaceService } from '@/services/api';
import { Workspace } from '@/types';
import { CreateWorkspaceModal } from '@/components/CreateWorkspaceModal';
import { Plus, Terminal, Clock, Activity, Loader2, Bot } from 'lucide-react';
import { WorkspaceSettingsModal } from '@/components/WorkspaceSettingsModal';
import clsx from 'clsx';

export default function WorkspaceList() {
    const router = useRouter();
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [settingsModal, setSettingsModal] = useState<{ isOpen: boolean; workspace: Workspace | null }>({
        isOpen: false,
        workspace: null
    });

    const fetchWorkspaces = async () => {
        try {
            setLoading(true);
            const data = await workspaceService.list();
            // Sort by creation time desc if possible, or just mock it for now
            // Assuming backend returns list, reverse to show newest first if not sorted
            setWorkspaces(data.reverse());
        } catch (error) {
            console.error("Failed to fetch workspaces:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWorkspaces();
    }, []);

    const handleCreateSuccess = (newWorkspace: Workspace) => {
        // Add to list and close modal
        setWorkspaces(prev => [newWorkspace, ...prev]);
        setIsCreateModalOpen(false);
        // Optionally navigate immediately:
        // router.push(`/workspace/${newWorkspace.id}`);
    };

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this workspace? This action cannot be undone.')) return;

        try {
            await workspaceService.delete(id);
            setWorkspaces(prev => prev.filter(w => w.id !== id));
        } catch (error) {
            console.error("Failed to delete workspace:", error);
            alert("Failed to delete workspace");
        }
    };

    const handleStartEdit = (e: React.MouseEvent, id: string, currentName: string, currentDescription?: string) => {
        e.stopPropagation();
        setEditingId(id);
        setEditName(currentName);
        setEditDescription(currentDescription || '');
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!editingId || !editName.trim()) return;

        try {
            const updated = await workspaceService.update(editingId, {
                name: editName,
                description: editDescription
            });
            setWorkspaces(prev => prev.map(w => w.id === editingId ? {
                ...w,
                name: updated.name,
                description: updated.description
            } : w));
            setEditingId(null);
            setEditName('');
            setEditDescription('');
        } catch (error) {
            console.error("Failed to update workspace:", error);
            alert("Failed to update workspace");
        }
    };

    const handleCancelEdit = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setEditingId(null);
        setEditName('');
        setEditDescription('');
    };

    return (
        <main className="min-h-screen bg-gray-950 p-6">
            <div className="max-w-7xl mx-auto w-full space-y-8">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Workspaces</h1>
                        <p className="text-gray-400">Manage your security assessment environments</p>
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20"
                    >
                        <Plus className="w-4 h-4" />
                        New Workspace
                    </button>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                ) : workspaces.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-96 border border-gray-800 border-dashed rounded-2xl bg-gray-900/20">
                        <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mb-4">
                            <Bot className="w-8 h-8 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-300 mb-2">No Workspaces Found</h3>
                        <div className="text-gray-500 max-w-sm text-center mb-6">
                            Create your first workspace to begin running AI-powered security agents.
                        </div>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-2"
                        >
                            Create Workspace &rarr;
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* New Workspace Card (Quick Access) */}
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="group flex flex-col items-center justify-center p-6 bg-gray-900/40 border border-gray-800 border-dashed rounded-xl hover:bg-gray-900 hover:border-blue-500/50 transition-all min-h-[180px]"
                        >
                            <div className="w-12 h-12 rounded-full bg-gray-800 group-hover:bg-blue-500/10 flex items-center justify-center mb-3 transition-colors">
                                <Plus className="w-6 h-6 text-gray-500 group-hover:text-blue-400" />
                            </div>
                            <span className="font-medium text-gray-400 group-hover:text-blue-400">Create New</span>
                        </button>

                        {/* Workspace Cards */}
                        {workspaces.map(ws => (
                            <div
                                key={ws.id}
                                onClick={() => router.push(`/workspace/${ws.id}`)}
                                className="group relative bg-gray-900 border border-gray-800 rounded-xl p-6 hover:shadow-xl hover:shadow-black/40 hover:border-gray-700 transition-all cursor-pointer overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Terminal className="w-48 h-48 text-gray-800/10 -rotate-12 translate-x-12 -translate-y-12 pointer-events-none" />
                                </div>

                                {/* Actions Overlay */}
                                <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSettingsModal({ isOpen: true, workspace: ws });
                                        }}
                                        className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                                        title="Settings"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </button>
                                    <button
                                        onClick={(e) => handleStartEdit(e, ws.id, ws.name, ws.description)}
                                        className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                                        title="Edit"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(e, ws.id)}
                                        className="p-1.5 rounded-lg bg-gray-800 text-red-400 hover:text-red-300 hover:bg-gray-700 transition-colors"
                                        title="Delete"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>

                                <div className="relative z-10 flex flex-col h-full justify-between">
                                    <div>
                                        <div className="flex items-start gap-4 mb-4">
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shrink-0">
                                                <span className="text-lg font-bold text-white uppercase">{ws.name.substring(0, 2)}</span>
                                            </div>

                                            <div className="flex-1 min-w-0 pt-0.5">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {editingId === ws.id ? (
                                                        <form
                                                            onSubmit={handleSaveEdit}
                                                            onClick={e => e.stopPropagation()}
                                                            className="flex flex-col gap-2 flex-1 w-full"
                                                        >
                                                            <div className="flex items-center gap-2 w-full">
                                                                <input
                                                                    type="text"
                                                                    value={editName}
                                                                    onChange={(e) => setEditName(e.target.value)}
                                                                    className="bg-gray-800 border border-blue-500 rounded px-2 py-0.5 text-white text-xl font-bold w-full focus:outline-none"
                                                                    autoFocus
                                                                    placeholder="Workspace Name"
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Escape') handleCancelEdit();
                                                                    }}
                                                                />
                                                                <div className="flex shrink-0">
                                                                    <button
                                                                        type="submit"
                                                                        className="p-1 text-green-400 hover:text-green-300"
                                                                        title="Save"
                                                                    >
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => handleCancelEdit(e)}
                                                                        className="p-1 text-red-400 hover:text-red-300"
                                                                        title="Cancel"
                                                                    >
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </form>
                                                    ) : (
                                                        <h3 className="text-xl font-bold text-gray-100 group-hover:text-blue-400 transition-colors truncate">
                                                            {ws.name}
                                                        </h3>
                                                    )}
                                                    <span className={clsx(
                                                        "text-[10px] font-mono px-1.5 py-0.5 rounded-full border shrink-0",
                                                        ws.mode === 'agent' ? "bg-green-500/10 text-green-400 border-green-500/20" :
                                                            ws.mode === 'planning' ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                                                                "bg-gray-800 text-gray-400 border-gray-700"
                                                    )}>
                                                        {ws.mode.toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        {editingId === ws.id ? (
                                            <div onClick={e => e.stopPropagation()} className="mb-2">
                                                <textarea
                                                    value={editDescription}
                                                    onChange={(e) => setEditDescription(e.target.value)}
                                                    className="w-full bg-gray-800 border border-blue-500 rounded px-2 py-1 text-sm text-gray-300 focus:outline-none resize-none min-h-[3em]"
                                                    placeholder="Description (optional)"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Escape') handleCancelEdit();
                                                    }}
                                                />
                                            </div>
                                        ) : ws.description && (
                                            <p className="text-sm text-gray-400 mb-2 line-clamp-2 min-h-[2.5em]">
                                                {ws.description}
                                            </p>
                                        )}
                                        <p className="text-sm text-gray-500 font-mono text-xs truncate opacity-70">
                                            ID: {ws.id}
                                        </p>
                                    </div>

                                    <div className="mt-6 flex items-center text-xs text-gray-500 gap-4">
                                        <div className="flex items-center gap-1.5" title="Tasks">
                                            <div className="w-2 h-2 rounded-full bg-green-500/50" />
                                            <span>{ws.stats?.task_count || 0} Tasks</span>
                                        </div>
                                        <div className="flex items-center gap-1.5" title="Tool runs">
                                            <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                                            <span>{ws.stats?.tool_run_count || 0} Tools</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 ml-auto">
                                            <Clock className="w-3.5 h-3.5" />
                                            <span>
                                                {new Date(ws.created_at).toLocaleString('zh-CN', {
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                    hour12: false
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Modal */}
            <CreateWorkspaceModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={handleCreateSuccess}
            />
            {settingsModal.workspace && (
                <WorkspaceSettingsModal
                    isOpen={settingsModal.isOpen}
                    workspace={settingsModal.workspace}
                    onClose={() => setSettingsModal({ ...settingsModal, isOpen: false })}
                    onUpdate={(updated) => {
                        setWorkspaces(prev => prev.map(w => w.id === updated.id ? updated : w));
                    }}
                />
            )}
        </main>
    );
}
