
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { workspaceService } from '@/services/api';
import clsx from 'clsx';
import { Workspace } from '@/types';
import { McpConnectionInfoModal } from './McpConnectionInfoModal';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (workspace: Workspace) => void;
}

export function CreateWorkspaceModal({ isOpen, onClose, onSuccess }: Props) {
    const [data, setData] = useState({
        name: '',
        description: '',
        mode: 'agent',
        code_server_url: 'http://localhost:8080',
        code_server_password: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [createdWorkspace, setCreatedWorkspace] = useState<Workspace | null>(null);
    const [showMcpInfo, setShowMcpInfo] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!isOpen || !mounted) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!data.name.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const workspace = await workspaceService.create({
                name: data.name,
                description: data.description || undefined,
                mode: data.mode,
                code_server_url: data.code_server_url,
                code_server_password: data.code_server_password || undefined,
                config: { ai: {} } // Initialize AI config as empty so backend knows it exists but is unconfigured
            });
            setCreatedWorkspace(workspace);
            setShowMcpInfo(true); // Show MCP connection info instead of immediately closing
        } catch (err) {
            console.error(err);
            setError('Failed to create workspace. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleMcpInfoClose = () => {
        setShowMcpInfo(false);
        if (createdWorkspace) {
            onSuccess(createdWorkspace); // Navigate to workspace after closing MCP info
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
                    <h2 className="text-lg font-semibold text-white">Create Workspace</h2>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="text-gray-500 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Name Input */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">
                            Workspace Name
                        </label>
                        <input
                            type="text"
                            value={data.name}
                            onChange={(e) => setData({ ...data, name: e.target.value })}
                            placeholder="e.g., Security Audit Project"
                            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            autoFocus
                            disabled={loading}
                        />
                    </div>

                    {/* Description Input */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">
                            Description (Optional)
                        </label>
                        <textarea
                            value={data.description}
                            onChange={(e) => setData({ ...data, description: e.target.value })}
                            placeholder="Briefly describe the purpose of this workspace..."
                            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none h-24"
                        />
                    </div>

                    {/* Code Server URL */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">
                            Code Server URL
                        </label>
                        <input
                            type="text"
                            value={data.code_server_url}
                            onChange={(e) => setData({ ...data, code_server_url: e.target.value })}
                            placeholder="http://localhost:8080"
                            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono text-sm"
                            disabled={loading}
                        />
                        <p className="text-xs text-gray-500">
                            URL where your Code Server will be accessible
                        </p>
                    </div>

                    {/* Code Server Password */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">
                            Code Server Password (Optional)
                        </label>
                        <input
                            type="password"
                            value={data.code_server_password}
                            onChange={(e) => setData({ ...data, code_server_password: e.target.value })}
                            placeholder="Leave empty to auto-generate"
                            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono text-sm"
                            disabled={loading}
                        />
                        <p className="text-xs text-gray-500">
                            Custom password for your Code Server, or leave empty to auto-generate
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="pt-2 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!data.name.trim() || loading}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Provisioning...
                                </>
                            ) : (
                                "Create Workspace"
                            )}
                        </button>
                    </div>
                </form>
            </div >

            {/* MCP Connection Info Modal */}
            {showMcpInfo && createdWorkspace && (
                <McpConnectionInfoModal
                    workspace={createdWorkspace}
                    isOpen={showMcpInfo}
                    onClose={handleMcpInfoClose}
                />
            )}
        </div >,
        document.body
    );
}
