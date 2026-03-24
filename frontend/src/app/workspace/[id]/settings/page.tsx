'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ChevronLeft, Settings, Plug, Loader2, Copy, Check, RotateCcw,
    User, Users, CreditCard, FileText, Shield, Sliders, RefreshCw, Edit2, Save
} from 'lucide-react';
import { workspaceService } from '@/services/api';
import { Workspace } from '@/types';
import clsx from 'clsx';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useToastStore } from '@/store/toastStore';
import ToastContainer from '@/components/ToastContainer';

export default function WorkspaceSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const workspaceId = params.id as string;

    const { addToast } = useToastStore();
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [activeSection, setActiveSection] = useState<'ai' | 'mcp'>('ai');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('dark'); // Kept from original

    // AI Config State
    const [aiConfig, setAiConfig] = useState<{
        provider: string;
        model: string;
        api_key: string;
        api_base: string;
    }>({
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        api_key: '',
        api_base: 'https://api.deepseek.com'
    });

    // MCP Info State
    const [mcpInfo, setMcpInfo] = useState<{
        mcp_ws_url: string;
        mcp_token: string;
        code_server_password: string;
        code_server_url: string;
        docker_compose_yml: string;
    } | null>(null);
    const [mcpLoading, setMcpLoading] = useState(false);
    const [regenerating, setRegenerating] = useState(false);
    const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

    // Edit Mode State (Added for MCP Settings Sync)
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        code_server_url: '',
        code_server_password: ''
    });

    const [backendUrl, setBackendUrl] = useState('');

    useEffect(() => {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const url = process.env.NEXT_PUBLIC_API_URL || `${protocol}//${hostname}:8000`;
        setBackendUrl(url.replace(/\/$/, ''));
    }, []);

    const PROVIDER_PRESETS: Record<string, { model: string; api_base: string }> = {
        'anthropic': { model: 'claude-3-5-sonnet-20240620', api_base: '' },
        'openai': { model: 'gpt-4-turbo', api_base: '' },
        'deepseek': { model: 'deepseek-reasoner', api_base: 'https://api.deepseek.com' },
        'qwen': { model: 'qwen-turbo', api_base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    };

    // Load workspace data
    useEffect(() => {
        loadWorkspace();
    }, [workspaceId]);

    // Load MCP info when switching to MCP section
    useEffect(() => {
        if (activeSection === 'mcp' && !mcpInfo) {
            loadMcpInfo();
        }
    }, [activeSection]);

    const loadWorkspace = async () => {
        try {
            const data = await workspaceService.get(workspaceId);
            setWorkspace(data);

            // Load AI config
            if (data.config?.ai && Object.keys(data.config.ai).length > 0) {
                setAiConfig({
                    provider: data.config.ai.provider || 'anthropic',
                    model: data.config.ai.model || '',
                    api_key: data.config.ai.api_key || '',
                    api_base: data.config.ai.api_base || ''
                });
            } else {
                setAiConfig({
                    provider: 'deepseek',
                    model: 'deepseek-reasoner',
                    api_key: '',
                    api_base: 'https://api.deepseek.com'
                });
            }
        } catch (error) {
            console.error('Failed to load workspace:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMcpInfo = async () => {
        setMcpLoading(true);
        try {
            const data = await workspaceService.getMcpConnectionInfo(workspaceId);
            setMcpInfo(data);
            // Initialize form
            setEditForm({
                code_server_url: data.code_server_url || '',
                code_server_password: data.code_server_password || ''
            });
        } catch (error) {
            console.error('Failed to load MCP info:', error);
        } finally {
            setMcpLoading(false);
        }
    };

    const handleProviderChange = (newProvider: string) => {
        const preset = PROVIDER_PRESETS[newProvider];
        setAiConfig(prev => ({
            ...prev,
            provider: newProvider,
            model: (!prev.model || Object.values(PROVIDER_PRESETS).some(p => p.model === prev.model)) && preset ? preset.model : prev.model,
            api_base: (!prev.api_base || Object.values(PROVIDER_PRESETS).some(p => p.api_base === prev.api_base)) && preset ? preset.api_base : prev.api_base,
        }));
    };

    const handleSaveAiConfig = async () => {
        if (!workspace) return;

        setSaving(true);
        try {
            const newConfig = {
                ...workspace.config,
                ai: {
                    provider: aiConfig.provider,
                    model: aiConfig.model,
                    api_key: aiConfig.api_key,
                    api_base: aiConfig.api_base
                }
            };

            const updated = await workspaceService.update(workspaceId, {
                // @ts-ignore
                config: newConfig
            });
            setWorkspace(updated);
            addToast('AI 配置已成功保存', 'success');
        } catch (error) {
            console.error('Failed to save config:', error);
            addToast('保存失败，请稍后重试', 'error');
        } finally {
            setSaving(false);
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
            handleRegenerateToken();
        } else {
            setConfirmingRegenerate(true);
        }
    };

    const handleRegenerateToken = async () => {
        setRegenerating(true);
        setConfirmingRegenerate(false);
        try {
            const data = await workspaceService.regenerateMcpToken(workspaceId);
            setMcpInfo({
                mcp_ws_url: data.mcp_ws_url,
                mcp_token: data.mcp_token,
                code_server_password: data.code_server_password,
                code_server_url: data.code_server_url,
                docker_compose_yml: data.docker_compose_yml
            });
            addToast('Token regenerated successfully. Please update your MCP server configuration.', 'success');
        } catch (error) {
            console.error('Failed to regenerate token:', error);
            addToast('Failed to regenerate token. Please try again.', 'error');
        } finally {
            setRegenerating(false);
        }
    };

    const handleSaveSettings = async () => {
        if (!workspace) return;
        setSaving(true);
        try {
            await workspaceService.update(workspace.id, {
                code_server_url: editForm.code_server_url,
                code_server_password: editForm.code_server_password
            });

            // Reload info to get updated docker templates
            await loadMcpInfo();

            setIsEditing(false);
            addToast('Settings updated successfully. Docker configuration has been refreshed.', 'success');
        } catch (error) {
            console.error('Failed to update settings:', error);
            addToast('Failed to update settings.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleCancelEdit = () => {
        // Reset form
        if (mcpInfo) {
            setEditForm({
                code_server_url: mcpInfo.code_server_url || '',
                code_server_password: mcpInfo.code_server_password || ''
            });
        }
        setIsEditing(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
                <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
            </div>
        );
    }

    return (
        <>
            <ToastContainer />
            <div className="flex h-screen bg-gray-950 text-gray-200 font-sans overflow-hidden">
                {/* Left Sidebar */}
                <aside className="w-[260px] flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-950">
                    {/* Back Button */}
                    <div className="p-4">
                        <button
                            onClick={() => router.push(`/workspace/${workspaceId}`)}
                            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors w-max"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back to conversations
                        </button>
                    </div>

                    {/* Navigation Groups */}
                    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-8 custom-scrollbar">

                        {/* General Group */}
                        <div>
                            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 px-3">General</h3>
                            <nav className="space-y-0.5">
                                <button
                                    onClick={() => setActiveSection('ai')}
                                    className={clsx(
                                        "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                                        activeSection === 'ai'
                                            ? "bg-gray-800 text-white font-medium"
                                            : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                                    )}
                                >
                                    <Settings className="w-4 h-4" />
                                    <span>AI Configuration</span>
                                </button>
                            </nav>
                        </div>

                        {/* Integrations Group */}
                        <div>
                            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 px-3">Integrations</h3>
                            <nav className="space-y-0.5">
                                <button
                                    onClick={() => setActiveSection('mcp')}
                                    className={clsx(
                                        "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
                                        activeSection === 'mcp'
                                            ? "bg-gray-800 text-white font-medium"
                                            : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                                    )}
                                >
                                    <Plug className="w-4 h-4" />
                                    <span>MCP Server</span>
                                </button>
                            </nav>
                        </div>

                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto bg-gray-950 custom-scrollbar">
                    <div className="max-w-4xl mx-auto py-12 px-12">

                        {/* Header Section */}
                        <div className="flex items-center justify-between mb-12">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-blue-900/20">
                                    {workspace?.name?.charAt(0) || 'W'}
                                </div>
                                <div>
                                    <h1 className="text-xl font-semibold text-white tracking-tight">{workspace?.name}</h1>
                                    <p className="text-sm text-gray-500">{workspace?.id}</p>
                                </div>
                            </div>
                            <div className="px-3 py-1 rounded-full border border-gray-800 bg-gray-900 text-xs font-medium text-gray-400">
                                {workspace?.mode?.toUpperCase()} PLAN
                            </div>
                        </div>

                        {/* Render Content Based on Active Section */}
                        {activeSection === 'ai' && (
                            <div className="space-y-0">
                                {/* Provider Setting */}
                                <div className="py-8 border-b border-gray-800 flex items-start justify-between">
                                    <div className="max-w-sm">
                                        <label className="block text-sm font-medium text-gray-300 mb-1">AI Provider</label>
                                        <p className="text-sm text-gray-500">Select the underlying AI model provider for this workspace.</p>
                                    </div>
                                    <div className="w-[300px]">
                                        <select
                                            value={aiConfig.provider}
                                            onChange={(e) => handleProviderChange(e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-500 transition-colors appearance-none"
                                        >
                                            <option value="anthropic">Anthropic</option>
                                            <option value="openai">OpenAI</option>
                                            <option value="deepseek">DeepSeek</option>
                                            <option value="qwen">Qwen / Custom</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Model Name */}
                                <div className="py-8 border-b border-gray-800 flex items-start justify-between">
                                    <div className="max-w-sm">
                                        <label className="block text-sm font-medium text-gray-300 mb-1">Model Name</label>
                                        <p className="text-sm text-gray-500">The specific model identifier (e.g., claude-3-opus).</p>
                                    </div>
                                    <div className="w-[300px]">
                                        <input
                                            type="text"
                                            value={aiConfig.model}
                                            onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                                            className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-500 transition-colors"
                                        />
                                    </div>
                                </div>

                                {/* API Key */}
                                <div className="py-8 border-b border-gray-800 flex items-start justify-between">
                                    <div className="max-w-sm">
                                        <label className="block text-sm font-medium text-gray-300 mb-1">API Key</label>
                                        <p className="text-sm text-gray-500">Your secret API key for authentication.</p>
                                    </div>
                                    <div className="w-[300px] text-right">
                                        {aiConfig.api_key ? (
                                            <div className="flex items-center justify-end gap-2 text-gray-400">
                                                <span className="font-mono text-sm">••••••••••••••••</span>
                                                <button
                                                    onClick={() => setAiConfig({ ...aiConfig, api_key: '' })}
                                                    className="text-xs text-blue-500 hover:text-blue-400"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        ) : (
                                            <input
                                                type="password"
                                                placeholder="Enter API Key"
                                                value={aiConfig.api_key}
                                                onChange={(e) => setAiConfig({ ...aiConfig, api_key: e.target.value })}
                                                className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-500 transition-colors placeholder:text-gray-700"
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* API Base */}
                                <div className="py-8 border-b border-gray-800 flex items-start justify-between">
                                    <div className="max-w-sm">
                                        <label className="block text-sm font-medium text-gray-300 mb-1">API Base URL</label>
                                        <p className="text-sm text-gray-500">Optional override for the API endpoint.</p>
                                    </div>
                                    <div className="w-[300px]">
                                        <input
                                            type="text"
                                            placeholder="Default"
                                            value={aiConfig.api_base}
                                            onChange={(e) => setAiConfig({ ...aiConfig, api_base: e.target.value })}
                                            className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-gray-500 transition-colors placeholder:text-gray-700"
                                        />
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="py-8 flex justify-end">
                                    <button
                                        onClick={handleSaveAiConfig}
                                        disabled={saving}
                                        className="px-6 py-2 bg-white text-black text-sm font-medium rounded hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        )}


                        {activeSection === 'mcp' && (
                            <div className="space-y-0">
                                {/* Section Header */}
                                <div className="mb-8">
                                    <h3 className="text-sm font-medium text-gray-300">MCP Connection</h3>
                                    <p className="text-sm text-gray-500 mt-1">Configure your Model Context Protocol server connection.</p>
                                </div>

                                {mcpLoading ? (
                                    <div className="py-12 flex items-center justify-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
                                    </div>
                                ) : mcpInfo ? (
                                    <>
                                        <h2 className="text-sm font-semibold text-white mb-4">🚀 Quick Setup (Recommended)</h2>
                                        {/* Automated Setup Scripts */}
                                        <div className="space-y-2 pb-2 pt-2 border-l border-green-600 pl-4 border-l-4 mb-8">

                                            {/* Check Environment */}
                                            <div className="space-y-2">
                                                <label className="block text-xs font-medium text-gray-400">
                                                    1. Create server folder
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
                                                                return `mkdir -p redagent-mcp/workspace-${workspaceId}\ncd redagent-mcp/workspace-${workspaceId}`;
                                                            })()}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                </div>
                                                <label className="block text-xs font-medium text-gray-400">
                                                    2. Check Environment
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
                                                                return `curl -s "${backendUrl}/workspaces/${workspaceId}/check.sh" | bash`;
                                                            })()}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            handleCopy(`curl -s "${backendUrl}/workspaces/${workspaceId}/check.sh" | bash`, 'check');
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
                                                    3. Initialize Configuration
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
                                                                return `curl -s "${backendUrl}/workspaces/${workspaceId}/init.sh" | bash`;
                                                            })()}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            handleCopy(`curl -s "${backendUrl}/workspaces/${workspaceId}/init.sh" | bash`, 'init');
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
                                        <div className="py-8 border-b border-gray-800 flex items-start justify-between">
                                            <div className="max-w-sm">
                                                <label className="block text-sm font-medium text-gray-300 mb-1">WebSocket URL</label>
                                            </div>
                                            <div className="w-[400px]">
                                                <div className="relative group">
                                                    <input
                                                        type="text"
                                                        readOnly
                                                        value={mcpInfo.mcp_ws_url}
                                                        className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-gray-500 transition-colors pr-10"
                                                    />
                                                    <button
                                                        onClick={() => handleCopy(mcpInfo.mcp_ws_url, 'url')}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                                    >
                                                        {copied === 'url' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Token */}
                                        <div className="py-8 border-b border-gray-800 flex items-start justify-between">
                                            <div className="max-w-sm">
                                                <label className="block text-sm font-medium text-gray-300 mb-1">Authentication Token</label>
                                            </div>
                                            <div className="w-[400px]">
                                                <div className="flex items-center gap-2">
                                                    <div className="relative group flex-1">
                                                        <input
                                                            type="text"
                                                            readOnly
                                                            value={mcpInfo.mcp_token}
                                                            className="w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-gray-500 transition-colors pr-10"
                                                        />
                                                        <button
                                                            onClick={() => handleCopy(mcpInfo.mcp_token, 'token')}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                                        >
                                                            {copied === 'token' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                    <button
                                                        onClick={handleRegenerateClick}
                                                        onBlur={() => setConfirmingRegenerate(false)}
                                                        disabled={regenerating}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed ${confirmingRegenerate
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
                                        </div>

                                        {/* Code Server Settings (Editable) */}
                                        <div className="space-y-4 pt-4 border-t border-gray-800">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-semibold text-white">Code Server Configuration</h3>
                                                {!isEditing ? (
                                                    <button
                                                        onClick={() => setIsEditing(true)}
                                                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                                                    >
                                                        <Edit2 className="w-3 h-3" />
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
                                                            <Save className="w-3 h-3" />
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
                                                                {mcpInfo.code_server_url}
                                                            </code>
                                                            <button
                                                                onClick={() => handleCopy(mcpInfo.code_server_url, 'code_url')}
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
                                                                {mcpInfo.code_server_password}
                                                            </code>
                                                            <button
                                                                onClick={() => handleCopy(mcpInfo.code_server_password, 'code_pass')}
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
                                        <div className="space-y-2 pt-8">
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
                                                    {mcpInfo.docker_compose_yml}
                                                </SyntaxHighlighter>
                                                <button
                                                    onClick={() => handleCopy(mcpInfo.docker_compose_yml, 'docker')}
                                                    className="absolute top-2 right-2 px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                                                    title="Copy Command"
                                                >
                                                    {copied === 'docker' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                                </button>
                                            </div>
                                        </div>

                                    </>
                                ) : null}
                            </div>
                        )}

                    </div>
                </main>
            </div>
        </>
    );
}
