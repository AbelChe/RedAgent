'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Loader2, Briefcase } from 'lucide-react';
import { workspaceService } from '@/services/api';
import { Workspace } from '@/types';
import moment from 'moment';

export function WorkspaceList() {
    const router = useRouter();
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadWorkspaces();
    }, []);

    const loadWorkspaces = async () => {
        try {
            const list = await workspaceService.list();
            setWorkspaces(list);
        } catch (error) {
            console.error('Failed to load workspaces:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateWorkspace = () => {
        router.push('/workspace/new');
    };

    const filteredWorkspaces = workspaces.filter(ws =>
        ws.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col h-screen">
            {/* Header */}
            <div className="p-4 border-b border-gray-800">
                <h2 className="text-lg font-semibold text-white mb-3">Workspaces</h2>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search workspaces..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                </div>
            </div>

            {/* Workspace List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                ) : filteredWorkspaces.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 text-sm">
                        {searchQuery ? 'No workspaces found' : 'No workspaces yet'}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredWorkspaces.map((workspace) => (
                            <button
                                key={workspace.id}
                                onClick={() => router.push(`/workspace/${workspace.id}`)}
                                className="w-full p-3 bg-gray-950 hover:bg-gray-800 border border-gray-800 rounded-lg transition-colors text-left group"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                                        {workspace.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                                            {workspace.name}
                                        </h3>
                                        {workspace.description && (
                                            <p className="text-xs text-gray-500 truncate mt-0.5">
                                                {workspace.description}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-gray-600">
                                                {moment(workspace.created_at).fromNow()}
                                            </span>
                                            <span className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
                                                {workspace.mode}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
