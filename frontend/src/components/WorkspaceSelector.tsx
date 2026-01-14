import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ChevronDown, Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react';
import { Workspace } from '@/types';
import { workspaceService } from '@/services/api';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';

import { CreateWorkspaceModal } from './CreateWorkspaceModal';

interface Props {
    currentWorkspaceId?: string;
    onWorkspaceChange?: (workspaceId: string) => void;
}

export function WorkspaceSelector({ currentWorkspaceId, onWorkspaceChange }: Props) {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    // Create Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Edit/Delete State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const router = useRouter();
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadWorkspaces();

        // Click outside handler
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadWorkspaces = async () => {
        try {
            const data = await workspaceService.list();
            setWorkspaces(data);
        } catch (error) {
            console.error('Failed to load workspaces:', error);
        } finally {
            setLoading(false);
        }
    };

    const currentWorkspace = useMemo(() => {
        return workspaces.find(w => w.id === currentWorkspaceId);
    }, [workspaces, currentWorkspaceId]);

    const filteredWorkspaces = useMemo(() => {
        if (!searchQuery) return workspaces;
        const query = searchQuery.toLowerCase();
        return workspaces.filter(w =>
            w.name.toLowerCase().includes(query)
        );
    }, [workspaces, searchQuery]);

    const handleSelect = (workspaceId: string) => {
        if (editingId || deletingId) return; // Prevent selection during actions

        setIsOpen(false);
        setSearchQuery('');
        if (onWorkspaceChange) {
            onWorkspaceChange(workspaceId);
        } else {
            router.push(`/workspace/${workspaceId}`);
        }
    };

    const handleCreateNew = () => {
        setIsOpen(false);
        setShowCreateModal(true);
    };

    const handleCreateSuccess = (newWorkspaceId: string) => {
        setShowCreateModal(false);
        // Reload list to include new workspace
        loadWorkspaces();
        // Redirect to new workspace
        router.push(`/workspace/${newWorkspaceId}`);
    };

    const startEdit = (e: React.MouseEvent, workspace: Workspace) => {
        e.stopPropagation();
        setEditingId(workspace.id);
        setEditName(workspace.name);
    };

    const saveEdit = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!editingId || !editName.trim()) return;

        setActionLoading(true);
        try {
            const updated = await workspaceService.update(editingId, { name: editName });
            setWorkspaces(prev => prev.map(w => w.id === editingId ? updated : w));
            setEditingId(null);
        } catch (error) {
            console.error('Failed to update workspace:', error);
        } finally {
            setActionLoading(false);
        }
    };

    const cancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(null);
        setEditName('');
    };

    const startDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeletingId(id);
    };

    const confirmDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!deletingId) return;

        setActionLoading(true);
        try {
            await workspaceService.delete(deletingId);
            setWorkspaces(prev => prev.filter(w => w.id !== deletingId));

            // If deleted active workspace, redirect to home or another workspace
            if (deletingId === currentWorkspaceId) {
                router.push('/');
            }
        } catch (error) {
            console.error('Failed to delete workspace:', error);
        } finally {
            setActionLoading(false);
            setDeletingId(null);
        }
    };

    const cancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeletingId(null);
    };

    return (
        <>
            <div className="relative" ref={dropdownRef}>
                {/* Trigger Button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors min-w-[200px]"
                >
                    <div className="flex-1 text-left">
                        <div className="text-sm font-medium text-white truncate">
                            {currentWorkspace?.name || 'Select workspace...'}
                        </div>
                    </div>
                    <ChevronDown className={clsx(
                        "w-4 h-4 text-gray-400 transition-transform",
                        isOpen && "rotate-180"
                    )} />
                </button>

                {/* Dropdown */}
                {isOpen && (
                    <div className="absolute top-full left-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-50 overflow-hidden">
                        {/* Search */}
                        <div className="p-3 border-b border-gray-700">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search workspaces..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Workspace List */}
                        <div className="max-h-96 overflow-y-auto custom-scrollbar">
                            {loading ? (
                                <div className="p-8 text-center text-gray-500 text-sm">
                                    <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
                                    Loading...
                                </div>
                            ) : filteredWorkspaces.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 text-sm">
                                    No workspaces found
                                </div>
                            ) : (
                                filteredWorkspaces.map((workspace) => (
                                    <div
                                        key={workspace.id}
                                        onClick={() => handleSelect(workspace.id)}
                                        className={clsx(
                                            "group flex items-center justify-between px-4 py-3 cursor-pointer transition-colors border-b border-gray-700/50 last:border-0",
                                            workspace.id === currentWorkspaceId
                                                ? "bg-blue-600/20 hover:bg-blue-600/30"
                                                : "hover:bg-gray-700"
                                        )}
                                    >
                                        <div className="flex-1 min-w-0 mr-3">
                                            {editingId === workspace.id ? (
                                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        className="w-full px-2 py-1 bg-gray-900 border border-blue-500 rounded text-sm text-white focus:outline-none"
                                                        autoFocus
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') saveEdit(e as any);
                                                            if (e.key === 'Escape') cancelEdit(e as any);
                                                        }}
                                                    />
                                                </div>
                                            ) : deletingId === workspace.id ? (
                                                <span className="text-sm text-red-400 font-medium animate-pulse">
                                                    Delete {workspace.name}?
                                                </span>
                                            ) : (
                                                <>
                                                    <div className="font-medium text-white text-sm truncate">
                                                        {workspace.name}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                                                        {workspace.mode} • {new Date(workspace.created_at).toLocaleDateString()}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {/* Edit States */}
                                            {editingId === workspace.id ? (
                                                <>
                                                    <button
                                                        onClick={saveEdit}
                                                        disabled={actionLoading}
                                                        className="p-1.5 text-green-400 hover:bg-green-400/10 rounded disabled:opacity-50"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={cancelEdit}
                                                        disabled={actionLoading}
                                                        className="p-1.5 text-gray-400 hover:bg-gray-400/10 rounded disabled:opacity-50"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            ) : deletingId === workspace.id ? (
                                                /* Delete Confirmation States */
                                                <>
                                                    <button
                                                        onClick={confirmDelete}
                                                        disabled={actionLoading}
                                                        className="p-1.5 text-red-400 hover:bg-red-400/10 rounded disabled:opacity-50"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={cancelDelete}
                                                        disabled={actionLoading}
                                                        className="p-1.5 text-gray-400 hover:bg-gray-400/10 rounded disabled:opacity-50"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            ) : (
                                                /* Default Actions */
                                                <>
                                                    <button
                                                        onClick={(e) => startEdit(e, workspace)}
                                                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                                                        title="Rename"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => startDelete(e, workspace.id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Create New */}
                        <div className="border-t border-gray-700 p-2">
                            <button
                                onClick={handleCreateNew}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Create New Workspace
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Creation Modal */}
            <CreateWorkspaceModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSuccess={handleCreateSuccess}
            />
        </>
    );
}
