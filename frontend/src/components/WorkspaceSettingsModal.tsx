
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Save } from 'lucide-react';
import { workspaceService } from '@/services/api';
import { Workspace } from '@/types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    workspace: Workspace;
    onUpdate: (updatedWorkspace: Workspace) => void;
}

export function WorkspaceSettingsModal({ isOpen, onClose, workspace, onUpdate }: Props) {
    const [config, setConfig] = useState({
        provider: 'anthropic',
        model: '',
        api_key: '',
        api_base: ''
    });

    const PROVIDER_PRESETS: Record<string, { model: string; api_base: string }> = {
        'anthropic': { model: 'claude-3-5-sonnet-20240620', api_base: '' },
        'openai': { model: 'gpt-4-turbo', api_base: '' },
        'deepseek': { model: 'deepseek-reasoner', api_base: 'https://api.deepseek.com' },
        'qwen': { model: 'qwen-turbo', api_base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    };

    const handleProviderChange = (newProvider: string) => {
        const preset = PROVIDER_PRESETS[newProvider];
        setConfig(prev => ({
            ...prev,
            provider: newProvider,
            // Only auto-fill if current value is empty or matches another preset
            model: (!prev.model || Object.values(PROVIDER_PRESETS).some(p => p.model === prev.model)) && preset ? preset.model : prev.model,
            api_base: (!prev.api_base || Object.values(PROVIDER_PRESETS).some(p => p.api_base === prev.api_base)) && preset ? preset.api_base : prev.api_base,
        }));
    };

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Load initial config from workspace
    useEffect(() => {
        if (workspace.config && workspace.config.ai && Object.keys(workspace.config.ai).length > 0) {
            setConfig({
                provider: workspace.config.ai.provider || 'anthropic',
                model: workspace.config.ai.model || '',
                api_key: workspace.config.ai.api_key || '',
                api_base: workspace.config.ai.api_base || ''
            });
        } else {
            // Defaults for new workspace
            setConfig({
                provider: 'deepseek', // User preference seems to be deepseek
                model: 'deepseek-reasoner',
                api_key: '',
                api_base: 'https://api.deepseek.com'
            });
        }
    }, [workspace]);

    if (!isOpen || !mounted) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Merge into existing config
            const newConfig = {
                ...workspace.config,
                ai: {
                    provider: config.provider,
                    model: config.model,
                    api_key: config.api_key,
                    api_base: config.api_base
                }
            };

            const updated = await workspaceService.update(workspace.id, {
                // @ts-ignore - Backend supports config update
                config: newConfig
            });
            onUpdate(updated);
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to update settings. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
                    <h2 className="text-lg font-semibold text-white">Workspace Settings</h2>
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

                    {/* Provider Selection */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">
                            AI Provider
                        </label>
                        <select
                            value={config.provider}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        >
                            <option value="anthropic">Anthropic</option>
                            <option value="openai">OpenAI</option>
                            <option value="deepseek">DeepSeek</option>
                            <option value="qwen">Qwen / Other OpenAI Compatible</option>
                        </select>
                    </div>

                    {/* Model Name */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">
                            Model Name
                        </label>
                        <input
                            type="text"
                            value={config.model}
                            onChange={(e) => setConfig({ ...config, model: e.target.value })}
                            placeholder="e.g. claude-3-opus-20240229"
                            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        />
                        <p className="text-xs text-gray-500">
                            For DeepSeek Reasoning, use <code>deepseek-reasoner</code>
                        </p>
                    </div>

                    {/* API Key */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">
                            API Key
                        </label>
                        <input
                            type="password"
                            value={config.api_key}
                            onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                            placeholder="sk-..."
                            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        />
                    </div>

                    {/* API Base URL */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">
                            API Base URL (Optional)
                        </label>
                        <input
                            type="text"
                            value={config.api_base}
                            onChange={(e) => setConfig({ ...config, api_base: e.target.value })}
                            placeholder="e.g. https://api.deepseek.com"
                            className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        />
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
                            disabled={loading}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shadow-lg shadow-blue-900/20"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    Save Configuration
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
