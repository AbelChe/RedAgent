import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, RotateCcw, Loader2, Edit2, Save } from 'lucide-react';
import { Workspace } from '@/types';
import { workspaceService } from '@/services/api';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
    workspace: Workspace;
    isOpen: boolean;
    onClose: () => void;
}

export function McpConnectionInfoModal({ workspace, isOpen, onClose }: Props) {
    const [copied, setCopied] = useState<string | null>(null);
    const [regenerating, setRegenerating] = useState(false);
    const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
    const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
    const [connectionInfo, setConnectionInfo] = useState<{
        mcp_ws_url: string;
        mcp_token: string;
        code_server_password: string;
        code_server_url: string;
        docker_compose_yml: string;
    } | null>(null);

    // Edit Mode State
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        code_server_url: '',
        code_server_password: ''
    });
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState<{
        message: string;
        type: 'success' | 'error';
    } | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Load connection info when modal opens
    useEffect(() => {
        if (isOpen && !connectionInfo) {
            loadConnectionInfo();
        }
    }, [isOpen, connectionInfo]);

    // Auto-hide notification after 3 seconds
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // Click outside to cancel confirmation
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (confirmingRegenerate) {
                const target = e.target as HTMLElement;
                // Check if click is outside the regenerate button
                if (!target.closest('[data-regenerate-button]')) {
                    setConfirmingRegenerate(false);
                }
            }
        };

        if (confirmingRegenerate) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [confirmingRegenerate]);

    // Detect scroll position
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const isAtBottom = Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 5;
        setIsScrolledToBottom(isAtBottom);
    };

    const loadConnectionInfo = async () => {
        setLoading(true);
        try {
            const data = await workspaceService.getMcpConnectionInfo(workspace.id);
            setConnectionInfo(data);
            // Initialize form
            setEditForm({
                code_server_url: data.code_server_url || '',
                code_server_password: data.code_server_password || ''
            });
        } catch (error) {
            console.error('Failed to load MCP connection info:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    const handleRegenerateClick = () => {
        if (confirmingRegenerate) {
            // Second click - execute regeneration
            handleRegenerateToken();
        } else {
            // First click - show confirmation state
            setConfirmingRegenerate(true);
        }
    };

    const handleRegenerateToken = async () => {
        setRegenerating(true);
        setConfirmingRegenerate(false);
        try {
            const data = await workspaceService.regenerateMcpToken(workspace.id);
            // Use the complete response data from API
            setConnectionInfo({
                mcp_ws_url: data.mcp_ws_url,
                mcp_token: data.mcp_token,
                code_server_password: data.code_server_password,
                code_server_url: data.code_server_url || '',
                docker_compose_yml: data.docker_compose_yml
            });
            setNotification({
                message: 'Token regenerated successfully. Please update your MCP server configuration.',
                type: 'success'
            });
        } catch (error) {
            console.error('Failed to regenerate token:', error);
            setNotification({
                message: 'Failed to regenerate token. Please try again.',
                type: 'error'
            });
        } finally {
            setRegenerating(false);
        }
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        try {
            await workspaceService.update(workspace.id, {
                code_server_url: editForm.code_server_url,
                code_server_password: editForm.code_server_password
            });

            // Reload info to get updated docker templates
            await loadConnectionInfo();

            setIsEditing(false);
            setNotification({
                message: 'Settings updated successfully. Docker configuration has been refreshed.',
                type: 'success'
            });
        } catch (error) {
            console.error('Failed to update settings:', error);
            setNotification({
                message: 'Failed to update settings.',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleCancelEdit = () => {
        // Reset form
        if (connectionInfo) {
            setEditForm({
                code_server_url: connectionInfo.code_server_url || '',
                code_server_password: connectionInfo.code_server_password || ''
            });
        }
        setIsEditing(false);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50 flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-semibold text-white">MCP Connection Info</h2>
                        <p className="text-sm text-gray-500 mt-0.5">Deploy your own MCP server with these credentials</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="relative">
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="p-6 space-y-4 overflow-y-auto custom-scrollbar max-h-[calc(90vh-160px)]"
                    >
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            </div>
                        ) : connectionInfo ? (
                            <>
                                <h2 className="text-sm font-semibold text-white">🚀 Quick Setup (Recommended)</h2>
                                {/* Automated Setup Scripts */}
                                <div className="space-y-2 pb-2 pt-2 border-l border-green-600 pl-4 border-l-4">

                                    {/* Check Environment */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-medium text-gray-400">
                                            1. Check Environment
                                        </label>
                                        <div className="relative group">
                                            <div className="rounded-lg overflow-hidden border border-gray-800">
                                                <SyntaxHighlighter
                                                    language="bash"
                                                    style={vscDarkPlus}
                                                    customStyle={{ margin: 0, padding: '1rem', background: '#030712', wordBreak: 'break-all', whiteSpace: 'pre-wrap', overflowX: 'hidden' }}
                                                    codeTagProps={{ style: { wordBreak: 'break-all', whiteSpace: 'pre-wrap' } }}
                                                    wrapLongLines={true}
                                                >
                                                    {(() => {
                                                        const backendUrl = connectionInfo!.mcp_ws_url
                                                            .replace('ws://', 'http://')
                                                            .replace('wss://', 'https://')
                                                            .split('/mcp')[0];
                                                        const curlUrl = backendUrl.includes('host.docker.internal') ? 'http://localhost:8000' : backendUrl;
                                                        return `curl -s "${curlUrl}/workspaces/${workspace.id}/check.sh" | bash`;
                                                    })()}
                                                </SyntaxHighlighter>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const backendUrl = connectionInfo!.mcp_ws_url.replace('ws://', 'http://').replace('wss://', 'https://').split('/mcp')[0];
                                                    const curlUrl = backendUrl.includes('host.docker.internal') ? 'http://localhost:8000' : backendUrl;
                                                    handleCopy(`curl -s "${curlUrl}/workspaces/${workspace.id}/check.sh" | bash`, 'check');
                                                }}
                                                className="absolute top-2 right-2 px-2 py-1 bg-gray-800/80 hover:bg-gray-700 text-gray-300 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                title="Copy Command"
                                            >
                                                {copied === 'check' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Initialize */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-medium text-gray-400">
                                            2. Initialize Configuration
                                        </label>
                                        <div className="relative group">
                                            <div className="rounded-lg overflow-hidden border border-gray-800">
                                                <SyntaxHighlighter
                                                    language="bash"
                                                    style={vscDarkPlus}
                                                    customStyle={{ margin: 0, padding: '1rem', background: '#030712', wordBreak: 'break-all', whiteSpace: 'pre-wrap', overflowX: 'hidden' }}
                                                    codeTagProps={{ style: { wordBreak: 'break-all', whiteSpace: 'pre-wrap' } }}
                                                    wrapLongLines={true}
                                                >
                                                    {(() => {
                                                        const backendUrl = connectionInfo!.mcp_ws_url
                                                            .replace('ws://', 'http://')
                                                            .replace('wss://', 'https://')
                                                            .split('/mcp')[0];
                                                        const curlUrl = backendUrl.includes('host.docker.internal') ? 'http://localhost:8000' : backendUrl;
                                                        return `curl -s "${curlUrl}/workspaces/${workspace.id}/init.sh" | bash`;
                                                    })()}
                                                </SyntaxHighlighter>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const backendUrl = connectionInfo!.mcp_ws_url.replace('ws://', 'http://').replace('wss://', 'https://').split('/mcp')[0];
                                                    const curlUrl = backendUrl.includes('host.docker.internal') ? 'http://localhost:8000' : backendUrl;
                                                    handleCopy(`curl -s "${curlUrl}/workspaces/${workspace.id}/init.sh" | bash`, 'init');
                                                }}
                                                className="absolute top-2 right-2 px-2 py-1 bg-gray-800/80 hover:bg-gray-700 text-gray-300 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                title="Copy Command"
                                            >
                                                {copied === 'init' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <h2 className="text-sm font-semibold text-white">MCP Listener</h2>

                                {/* WebSocket URL */}
                                <div className="space-y-2">
                                    <label className="block text-xs font-medium text-gray-400">
                                        WebSocket URL
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={connectionInfo.mcp_ws_url}
                                            readOnly
                                            className="flex-1 px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500"
                                        />
                                        <button
                                            onClick={() => handleCopy(connectionInfo.mcp_ws_url, 'url')}
                                            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                                            title="Copy URL"
                                        >
                                            {copied === 'url' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Authentication Token */}
                                <div className="space-y-2">
                                    <label className="block text-xs font-medium text-gray-400">
                                        Authentication Token
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={connectionInfo.mcp_token}
                                            readOnly
                                            className="flex-1 px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500"
                                        />
                                        <button
                                            onClick={() => handleCopy(connectionInfo.mcp_token, 'token')}
                                            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                                            title="Copy Token"
                                        >
                                            {copied === 'token' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                        <button
                                            onClick={handleRegenerateClick}
                                            disabled={regenerating}
                                            data-regenerate-button
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${confirmingRegenerate
                                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                                                }`}
                                            title={confirmingRegenerate ? "Click again to confirm" : "Regenerate Token"}
                                        >
                                            {confirmingRegenerate ? (
                                                <>
                                                    <Check className="w-4 h-4" />
                                                    <span className="text-sm">Confirm?</span>
                                                </>
                                            ) : (
                                                <>
                                                    <RotateCcw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                                                    <span className="text-sm">Regenerate</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>


                                {/* Code Server Settings (Editable) */}
                                <div className="space-y-4 pt-4 border-t border-gray-800">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-white">Code Server Configuration</h3>
                                        {!isEditing ? (
                                            <button
                                                onClick={() => setIsEditing(true)}
                                                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                            >
                                                Edit Settings
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={handleCancelEdit}
                                                    className="text-xs text-gray-400 hover:text-white transition-colors"
                                                    disabled={saving}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleSaveSettings}
                                                    disabled={saving}
                                                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors flex items-center gap-1"
                                                >
                                                    {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                                                    Save
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="block text-xs font-medium text-gray-400">
                                                Code Server URL
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editForm.code_server_url}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, code_server_url: e.target.value }))}
                                                    className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                                    placeholder="http://localhost:8080"
                                                />
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-gray-300 text-sm font-mono truncate">
                                                        {connectionInfo.code_server_url}
                                                    </code>
                                                    <button
                                                        onClick={() => handleCopy(connectionInfo.code_server_url, 'code_url')}
                                                        className="px-2 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                                                    >
                                                        {copied === 'code_url' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="block text-xs font-medium text-gray-400">
                                                Password
                                            </label>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editForm.code_server_password}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, code_server_password: e.target.value }))}
                                                    className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                                />
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-gray-300 text-sm font-mono truncate">
                                                        {connectionInfo.code_server_password}
                                                    </code>
                                                    <button
                                                        onClick={() => handleCopy(connectionInfo.code_server_password, 'code_pass')}
                                                        className="px-2 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                                                    >
                                                        {copied === 'code_pass' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>



                                {/* Docker Compose Configuration */}
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-white">Docker Compose Configuration</h3>
                                    <div className="relative">
                                        <SyntaxHighlighter
                                            language="yaml"
                                            style={vscDarkPlus}
                                            customStyle={{
                                                margin: 0,
                                                borderRadius: '0.5rem',
                                                fontSize: '0.75rem',
                                                background: '#030712',
                                                border: '1px solid #1f2937',
                                                wordBreak: 'break-all',
                                                whiteSpace: 'pre-wrap'
                                            }}
                                            wrapLongLines={true}
                                            lineProps={{ style: { wordBreak: 'break-all', whiteSpace: 'pre-wrap' } }}
                                        >
                                            {connectionInfo.docker_compose_yml}
                                        </SyntaxHighlighter>
                                        <button
                                            onClick={() => handleCopy(connectionInfo.docker_compose_yml, 'docker')}
                                            className="absolute top-2 right-2 px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                                            title="Copy Command"
                                        >
                                            {copied === 'docker' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                Failed to load connection information
                            </div>
                        )}
                    </div>
                    {/* Bottom gradient fade - hide when scrolled to bottom */}
                    {!isScrolledToBottom && (
                        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none rounded-b-xl"></div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end px-6 py-4 border-t border-gray-800 bg-gray-900/50">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:-translate-y-0.5"
                    >
                        <Check className="w-4 h-4" />
                        I've Saved This Information
                    </button>
                </div>

                {/* Notification Toast */}
                {notification && (
                    <div className="absolute top-4 right-4 max-w-md animate-slide-in-right">
                        <div className={`px-4 py-3 rounded-lg border ${notification.type === 'success'
                            ? 'bg-green-900/50 border-green-700 text-green-200'
                            : 'bg-red-900/50 border-red-700 text-red-200'
                            } flex items-start gap-3`}>
                            {notification.type === 'success' ? (
                                <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            ) : (
                                <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            )}
                            <p className="text-sm flex-1">{notification.message}</p>
                            <button
                                onClick={() => setNotification(null)}
                                className="text-current hover:opacity-70 transition-opacity"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div >,
        document.body
    );
}
