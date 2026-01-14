import { useState, useEffect, useRef } from 'react';
import { Workspace } from '@/types';
import { workspaceService } from '@/services/api';
import { X, Minus, Maximize2, Loader2, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

interface Props {
    workspace: Workspace;
    isMinimized: boolean;
    onMinimizeChange: (minimized: boolean) => void;
    onClose: () => void;
}

export function FloatingIde({ workspace, isMinimized, onMinimizeChange, onClose }: Props) {
    // const [isMinimized, setIsMinimized] = useState(false); // Lifted state
    const [iframeUrl, setIframeUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [position, setPosition] = useState<{ x: number, y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useState<{ x: number, y: number }>({ x: 0, y: 0 })[0]; // Ref-like usage but stable

    useEffect(() => {
        const init = async () => {
            try {
                // Auto-login flow
                const token = await workspaceService.getConnectionToken(workspace.id);
                // Set cookie (shared domain logic: localhost cookies usually share across ports)
                document.cookie = `code-server-session=${token}; path=/; max-age=86400; SameSite=Lax`;

                const targetUrl = new URL(workspace.code_server_endpoint || "");
                targetUrl.hostname = window.location.hostname;
                setIframeUrl(targetUrl.toString());
            } catch (e) {
                console.error(e);
                setError("Failed to authenticate with Code Server.");
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [workspace.id]);

    const pillRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isMinimized) return; // Only draggable when minimized
        setIsDragging(true);
        const rect = e.currentTarget.getBoundingClientRect();
        dragStart.x = e.clientX - rect.left;
        dragStart.y = e.clientY - rect.top;
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            e.preventDefault();
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        };

        const handleMouseUp = () => {
            if (isDragging && pillRef.current) {
                // Snapping Logic
                const rect = pillRef.current.getBoundingClientRect();
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;

                // Horizontal Snap: Nearest Edge
                const centerX = rect.left + rect.width / 2;
                const snapX = centerX < windowWidth / 2 ? 24 : windowWidth - rect.width - 24;

                // Vertical Constraint: Keep within bounds with padding
                const snapY = Math.min(Math.max(rect.top, 24), windowHeight - rect.height - 24);

                setPosition({ x: snapX, y: snapY });
            }
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStart, isMinimized]); // added isMinimized for safety

    return (
        <>
            {/* Minimized Pill Indicator - Independently Animated & Draggable */}
            <div
                ref={pillRef}
                onMouseDown={handleMouseDown}
                style={position ? { left: position.x, top: position.y, bottom: 'auto', right: 'auto' } : undefined}
                className={clsx(
                    "fixed z-50 bg-gray-900 border border-gray-700 rounded-full shadow-2xl flex items-center justify-between px-4 py-2 min-w-[320px] backdrop-blur-md origin-bottom-left cursor-move select-none",
                    // Use transition for open/close animation, but disable movement transition during drag
                    isDragging ? "transition-opacity duration-0" : "transition-all duration-300 ease-out",
                    // Default position (if not dragged yet)
                    !position && "bottom-24 left-6",
                    isMinimized
                        ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                        : "opacity-0 translate-y-4 scale-90 pointer-events-none"
                )}
            >
                <div className="flex items-center gap-2.5">
                    <div className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                    </div>
                    <span className="text-xs font-medium text-gray-200 tracking-wide font-mono">CODE IDE ACTIVE</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking buttons
                        onClick={() => onMinimizeChange(false)}
                        className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-blue-400 transition-colors"
                        title="Expand"
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-red-400 transition-colors"
                        title="Close"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Main Window Container - Always Full Size, Fades/Scales Out */}
            <div
                className={clsx(
                    "absolute inset-4 z-40 bg-gray-950 border border-gray-800 rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 cubic-bezier(0.2, 0, 0, 1) origin-top",
                    isMinimized
                        ? "opacity-0 scale-95 pointer-events-none translate-y-2 blur-sm"
                        : "opacity-100 scale-100 translate-y-0 blur-0"
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50 border-b border-gray-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-2 py-1 bg-blue-500/10 rounded-md border border-blue-500/20">
                            <span className="text-xs font-bold text-blue-400 tracking-wider">RELIC IDE</span>
                            <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                            <span className="text-[10px] text-gray-400 font-mono">{workspace.name}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {iframeUrl && (
                            <a
                                href={iframeUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-gray-300 transition-colors mr-2"
                                title="Open in New Tab"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                        )}
                        <button
                            onClick={() => onMinimizeChange(true)}
                            className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors"
                            title="Minimize to Top"
                        >
                            <Minus className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-red-900/50 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
                            title="Close"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Content - Iframe stays mounted and full size */}
                <div className="flex-1 bg-black/50 relative">
                    {loading ? (
                        <div className="flex flex-col h-full items-center justify-center text-gray-500 gap-4">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                            <span className="text-sm font-mono animate-pulse">Establishing Secure Uplink...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col h-full items-center justify-center text-red-500 gap-2">
                            <span className="text-lg">⚠ Connection Failed</span>
                            <span className="text-sm text-gray-500">{error}</span>
                        </div>
                    ) : (
                        <iframe
                            src={iframeUrl!}
                            className="w-full h-full border-none bg-gray-900"
                            allow="clipboard-read; clipboard-write; fullscreen"
                            title="Code Server IDE"
                        />
                    )}
                </div>
            </div>
        </>
    );
}
