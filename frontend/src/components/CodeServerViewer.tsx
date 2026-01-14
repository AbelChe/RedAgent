// Code-Server file viewer component for viewing scan result files
'use client';

import { X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface CodeServerViewerProps {
    workspaceId: string;
    filePath: string;  // e.g., "/workspace/nmap/20251229_163240_scan.xml"
    onClose: () => void;
}

export function CodeServerViewer({ workspaceId, filePath, onClose }: CodeServerViewerProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Construct code-server URL
    // We need to translate the workspace-relative path to the actual volume path
    const volumePath = `/workspaces/workspace_${workspaceId}/_data${filePath.replace('/workspace', '')}`;
    const codeServerUrl = `http://localhost:8080/?folder=${encodeURIComponent(volumePath)}`;

    useEffect(() => {
        // Reset states when file changes
        setLoading(true);
        setError(null);

        // Simulate loading time for iframe
        const timer = setTimeout(() => setLoading(false), 1000);
        return () => clearTimeout(timer);
    }, [filePath]);

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-gray-900 rounded-lg overflow-hidden flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                        <div>
                            <h3 className="text-white font-semibold text-sm">Code Server - File Viewer</h3>
                            <p className="text-gray-400 text-xs font-mono truncate max-w-md" title={filePath}>
                                {filePath.split('/').pop()}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white hover:bg-gray-800 p-2 rounded-lg transition-colors"
                        title="Close viewer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 relative bg-gray-950">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
                            <div className="text-center">
                                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                                <p className="text-gray-400 text-sm">Loading code-server...</p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
                            <div className="text-center max-w-md">
                                <div className="text-red-500 mb-4">
                                    <X className="w-16 h-16 mx-auto" />
                                </div>
                                <h4 className="text-white font-semibold mb-2">Failed to Load</h4>
                                <p className="text-gray-400 text-sm">{error}</p>
                            </div>
                        </div>
                    )}

                    <iframe
                        src={codeServerUrl}
                        className="w-full h-full border-0"
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                        onError={() => setError('Failed to connect to code-server. Make sure it is running on port 8080.')}
                        title="Code Server Viewer"
                    />
                </div>

                {/* Footer hint */}
                <div className="p-2 border-t border-gray-800 bg-gray-900/50 text-xs text-gray-500 text-center flex-shrink-0">
                    💡 Tip: Use Ctrl+P to search files, Ctrl+F to find in file
                </div>
            </div>
        </div>
    );
}
