'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { workspaceService } from '@/services/api';
import { Workspace } from '@/types';
import { CreateWorkspaceModal } from '@/components/CreateWorkspaceModal';
import { Plus, Terminal, Clock, Loader2, Bot, Search, LayoutGrid, List as ListIcon, MoreVertical, Settings, Edit2, Trash2 } from 'lucide-react';
import { WorkspaceSettingsModal } from '@/components/WorkspaceSettingsModal';
import { DashboardStats } from '@/components/DashboardStats';
import clsx from 'clsx';

export function WorkspaceDashboard() {
    const router = useRouter();
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [settingsModal, setSettingsModal] = useState<{ isOpen: boolean; workspace: Workspace | null }>({
        isOpen: false,
        workspace: null
    });
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchWorkspaces = async () => {
        try {
            setLoading(true);
            const data = await workspaceService.list();
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
        setWorkspaces(prev => [newWorkspace, ...prev]);
        setIsCreateModalOpen(false);
    };

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

    // Editing state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');

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

    const filteredWorkspaces = workspaces.filter(ws =>
        ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ws.description && ws.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <main className="flex-1 bg-gray-950 p-8 overflow-y-auto custom-scrollbar h-screen">
            <div className="max-w-7xl mx-auto w-full space-y-8 pb-12">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Overview</h1>
                        <p className="text-gray-400">Manage and monitor your security assessment environments</p>
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:-translate-y-0.5"
                    >
                        <Plus className="w-4 h-4" />
                        New Workspace
                    </button>
                </div>

                {/* Stats Row */}
                <DashboardStats workspaces={workspaces} />

                {/* Toolbar */}
                <div className="flex flex-col md:flex-row items-center gap-4 bg-gray-900/30 p-2 rounded-2xl border border-gray-800/50 backdrop-blur-sm sticky top-0 z-30">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search workspaces..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-950/50 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-gray-600"
                        />
                    </div>
                    <div className="flex items-center gap-1 bg-gray-950/50 p-1 rounded-xl border border-gray-800">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={clsx(
                                "p-2 rounded-lg transition-colors",
                                viewMode === 'grid' ? "bg-gray-800 text-blue-400 shadow-sm" : "text-gray-500 hover:bg-gray-800/50 hover:text-gray-300"
                            )}
                            title="Grid View"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={clsx(
                                "p-2 rounded-lg transition-colors",
                                viewMode === 'list' ? "bg-gray-800 text-blue-400 shadow-sm" : "text-gray-500 hover:bg-gray-800/50 hover:text-gray-300"
                            )}
                            title="List View"
                        >
                            <ListIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                ) : filteredWorkspaces.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-96 border border-gray-800 border-dashed rounded-3xl bg-gray-900/20">
                        <div className="w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-black/20">
                            <Bot className="w-10 h-10 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-300 mb-2">No Workspaces Found</h3>
                        <p className="text-gray-500 max-w-sm text-center mb-8">
                            {searchQuery ? "No workspaces match your search query." : "Create your first workspace to begin running AI-powered security agents."}
                        </p>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 transition-all border border-blue-500/20"
                        >
                            Create Workspace &rarr;
                        </button>
                    </div>
                ) : (
                    <div className={clsx(
                        viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-3"
                    )}>
                        {/* New Workspace Card (Only in Grid) */}
                        {viewMode === 'grid' && !searchQuery && (
                            <button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="group flex flex-col items-center justify-center p-6 bg-gray-900/20 border border-gray-800 border-dashed rounded-2xl hover:bg-gray-900/40 hover:border-blue-500/50 transition-all min-h-[180px]"
                            >
                                <div className="w-14 h-14 rounded-full bg-gray-800 group-hover:bg-blue-500/10 flex items-center justify-center mb-4 transition-colors">
                                    <Plus className="w-7 h-7 text-gray-500 group-hover:text-blue-400" />
                                </div>
                                <span className="font-medium text-gray-400 group-hover:text-blue-400">Create New Workspace</span>
                            </button>
                        )}

                        {filteredWorkspaces.map(ws => (
                            <div
                                key={ws.id}
                                onClick={() => router.push(`/workspace/${ws.id}`)}
                                className={clsx(
                                    "group relative bg-gray-900 border border-gray-800 rounded-2xl hover:shadow-2xl hover:shadow-black/60 hover:border-gray-700 transition-all cursor-pointer overflow-hidden",
                                    viewMode === 'grid' ? "p-6 flex flex-col" : "p-4 flex items-center gap-6"
                                )}
                            >
                                {/* Background Gradient for active state */}
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                                {viewMode === 'grid' && (
                                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                        <Terminal className="w-48 h-48 text-gray-800/10 -rotate-12 translate-x-12 -translate-y-12 pointer-events-none" />
                                    </div>
                                )}

                                {/* Card Header */}
                                <div className={clsx("relative z-10 flex items-start gap-4", viewMode === 'list' && "flex-1")}>
                                    <div className={clsx(
                                        "rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shrink-0 text-white font-bold uppercase",
                                        viewMode === 'grid' ? "w-12 h-12 text-xl" : "w-10 h-10 text-lg"
                                    )}>
                                        {ws.name.substring(0, 2)}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        {editingId === ws.id ? (
                                            <form
                                                onSubmit={handleSaveEdit}
                                                onClick={e => e.stopPropagation()}
                                                className="flex flex-col gap-2 w-full"
                                            >
                                                <div className="flex items-center gap-2 w-full">
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="bg-gray-800 border border-blue-500 rounded px-2 py-1 text-white text-lg font-bold w-full focus:outline-none"
                                                        autoFocus
                                                        placeholder="Workspace Name"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Escape') handleCancelEdit();
                                                        }}
                                                    />
                                                    <div className="flex shrink-0">
                                                        <button type="submit" className="p-1 text-green-400 hover:text-green-300">
                                                            <div className="w-5 h-5 flex items-center justify-center rounded border border-green-500/30 bg-green-500/10">✓</div>
                                                        </button>
                                                        <button type="button" onClick={(e) => handleCancelEdit(e)} className="p-1 text-red-400 hover:text-red-300">
                                                            <div className="w-5 h-5 flex items-center justify-center rounded border border-red-500/30 bg-red-500/10">✕</div>
                                                        </button>
                                                    </div>
                                                </div>
                                            </form>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-bold text-gray-100 group-hover:text-blue-400 transition-colors truncate">
                                                    {ws.name}
                                                </h3>
                                                <span className={clsx(
                                                    "text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 uppercase tracking-wider",
                                                    ws.mode === 'agent' ? "bg-green-500/10 text-green-400 border-green-500/20" :
                                                        ws.mode === 'planning' ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                                                            "bg-gray-800 text-gray-400 border-gray-700"
                                                )}>
                                                    {ws.mode}
                                                </span>
                                            </div>
                                        )}
                                        {editingId !== ws.id && (
                                            <p className="text-sm text-gray-400 line-clamp-1 opacity-70 mt-0.5">
                                                {ws.description || "No description provided"}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* List View Stats */}
                                {viewMode === 'list' && (
                                    <div className="flex items-center gap-8 text-sm text-gray-500 px-4 border-l border-gray-800 h-10">
                                        <div className="flex items-center gap-2" title="Tasks">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                                            <span>{ws.stats?.task_count || 0} Tasks</span>
                                        </div>
                                        <div className="flex items-center gap-2" title="Tools">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                                            <span>{ws.stats?.tool_run_count || 0} Tools</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-3.5 h-3.5" />
                                            <span className="font-mono text-xs">
                                                {new Date(ws.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Grid View Stats & Footer */}
                                {viewMode === 'grid' && (
                                    <div className="mt-8 pt-4 border-t border-gray-800/50 relative z-10">
                                        {editingId === ws.id ? (
                                            <textarea
                                                value={editDescription}
                                                onChange={(e) => setEditDescription(e.target.value)}
                                                className="w-full bg-gray-800 border border-blue-500 rounded px-2 py-1 text-sm text-gray-300 focus:outline-none resize-none min-h-[3em] mb-2"
                                                placeholder="Description (optional)"
                                            />
                                        ) : null}

                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1.5" title="Tasks">
                                                    <div className="w-2 h-2 rounded-full bg-green-500/50" />
                                                    <span>{ws.stats?.task_count || 0}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5" title="Tools">
                                                    <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                                                    <span>{ws.stats?.tool_run_count || 0}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 opacity-60">
                                                <Clock className="w-3 h-3" />
                                                <span>{new Date(ws.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Actions Menu - Hover Only */}
                                <div className={clsx(
                                    "relative z-20 flex gap-1 transition-opacity",
                                    viewMode === 'grid' ? "absolute top-4 right-4 opacity-0 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100 ml-4"
                                )}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSettingsModal({ isOpen: true, workspace: ws });
                                        }}
                                        className="p-2 rounded-lg bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-700 backdrop-blur-sm transition-colors border border-gray-700/50"
                                        title="Settings"
                                    >
                                        <Settings className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => handleStartEdit(e, ws.id, ws.name, ws.description)}
                                        className="p-2 rounded-lg bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-700 backdrop-blur-sm transition-colors border border-gray-700/50"
                                        title="Edit"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(e, ws.id)}
                                        className="p-2 rounded-lg bg-gray-800/80 text-red-400 hover:text-red-300 hover:bg-gray-700 backdrop-blur-sm transition-colors border border-gray-700/50"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
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
