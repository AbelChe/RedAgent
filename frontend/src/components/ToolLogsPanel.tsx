'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useToolLogStore, ToolRun } from '@/store/toolLogStore';
import clsx from 'clsx';
import { Terminal, X, ChevronDown, ChevronRight, Activity, CheckCircle, AlertOctagon, Clock, GitGraph, Copy, Check, Terminal as TerminalIcon, ClipboardList, SquareIcon, RotateCw } from 'lucide-react';
import CommandFlowGraph from './CommandFlowGraph';
import { toolRunService } from '../services/api';
import { CopyButton } from '@/components/CopyButton';

interface ToolLogsPanelProps {
    onClose: () => void;
    workspaceId: string;
    conversationId?: string;
    onRerun: (command: string) => Promise<void>;
    taskConversationMap: Map<string, string | null>;
}

export default function ToolLogsPanel({ workspaceId, onClose, onRerun, conversationId, taskConversationMap }: ToolLogsPanelProps) {
    const { runs, activeRunId, highlightedRunId, setActiveRun, setHighlightedRun, clear, getAllRuns, getRunsByTool, completeRun } = useToolLogStore();
    const scrollRef = useRef<HTMLDivElement>(null);
    const runRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const containerRef = useRef<HTMLDivElement>(null);
    const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [flowHeight, setFlowHeight] = useState(200);
    const [isDragging, setIsDragging] = useState(false);

    // Get all runs, then filter by conversation using task_id
    const allRuns = useMemo(() => {
        const workspaceRuns = getAllRuns(workspaceId);

        if (!conversationId) {
            console.log(`📊 ToolLogs: showing all ${workspaceRuns.length} runs (no conversation filter)`);
            return workspaceRuns;
        }

        const filtered = workspaceRuns.filter(run => {
            const taskId = run.task_id;
            // STRICT ISOLATION: Hide runs that have no task_id
            if (!taskId) return false;

            const taskConvId = taskConversationMap.get(taskId);
            // Only hide if it explicitly belongs to ANOTHER conversation
            if (taskConvId && taskConvId !== conversationId) return false;

            return true;
        });

        console.log(`📊 ToolLogs: ${filtered.length}/${workspaceRuns.length} runs for conversation ${conversationId}`);
        return filtered;
    }, [workspaceId, conversationId, runs, taskConversationMap]);

    // Get unique tool names for tabs
    const toolNames = [...new Set(allRuns.map(r => r.tool))];

    // Initialize active tab
    useEffect(() => {
        if (!activeTab && toolNames.length > 0) {
            setActiveTab(toolNames[0]);
        }
    }, [toolNames, activeTab]);

    // Get runs for current tab (already filtered by conversation above)
    const currentRuns = activeTab ? allRuns.filter(r => r.tool === activeTab) : [];
    const latestRun = currentRuns.slice(-1)[0];

    // Auto-scroll on new logs
    useEffect(() => {
        if (scrollRef.current && latestRun) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [latestRun?.logs.length]);

    // Auto-expand latest run
    useEffect(() => {
        if (latestRun && !expandedRuns.has(latestRun.id)) {
            setExpandedRuns(prev => new Set([...prev, latestRun.id]));
        }
    }, [latestRun?.id]);

    // Scroll to highlighted run
    useEffect(() => {
        if (highlightedRunId) {
            const run = runs[highlightedRunId];
            if (run) {
                console.log(`📍 Highlighting run: ${highlightedRunId} (tool: ${run.tool})`);
                // Always switch to the correct tab first
                setActiveTab(run.tool);
                // Expand the run
                setExpandedRuns(prev => new Set([...prev, highlightedRunId]));
                // Wait longer for DOM to update, then scroll
                setTimeout(() => {
                    const element = runRefs.current[highlightedRunId];
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        console.log('✅ Scrolled to highlighted run');
                    } else {
                        console.warn('⚠️ Element ref not found for run:', highlightedRunId);
                    }
                }, 300); // Increased delay for panel animation
            } else {
                console.warn('⚠️ Run not found in store:', highlightedRunId);
            }
        }
    }, [highlightedRunId, runs]);

    const toggleRun = (runId: string) => {
        setExpandedRuns(prev => {
            const next = new Set(prev);
            if (next.has(runId)) next.delete(runId);
            else next.add(runId);
            return next;
        });
    };

    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour12: false });

    // Handle node click from internal graph
    const handleNodeClick = (runId: string) => {
        // Highlighting is handled by the graph updating the store
        // The useEffect above will catch it and switch tabs/scroll
    };

    const handleKillRun = async (runId: string) => {
        try {
            // Immediately update UI to show cancelled state
            completeRun(runId, 'cancelled');

            await toolRunService.kill(runId);
        } catch (error) {
            console.error('Failed to kill tool run:', error);
            // UI already updated optimistically, no need to revert
        }
    };

    // Drag resize handlers for flow section
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const newHeight = containerRect.bottom - e.clientY;
            // Clamp between 100px and 400px
            setFlowHeight(Math.max(100, Math.min(400, newHeight)));
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    if (allRuns.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-gray-950/50 backdrop-blur border-l border-gray-800">
                <Activity className="w-12 h-12 opacity-20 mb-4" />
                <p className="text-sm font-medium">No tools running</p>
                <p className="text-xs opacity-50 mt-1">Execute a command to see logs here</p>
                <div className="absolute top-2 right-2">
                    <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded text-gray-500">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-gray-950 border-l border-gray-800 w-full">
            {/* Header / Tabs */}
            <div className="flex items-center overflow-x-auto bg-gray-900/50 border-b border-gray-800 backdrop-blur-sm no-scrollbar flex-shrink-0" style={{ height: '45px' }}>
                {toolNames.map((name) => {
                    const toolRuns = getRunsByTool(name, workspaceId);
                    const isActive = activeTab === name;
                    const isRunning = toolRuns.some(r => r.status === 'running');

                    return (
                        <button
                            key={name}
                            onClick={() => setActiveTab(name)}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-3 text-xs font-medium border-r border-gray-800/50 transition-colors whitespace-nowrap h-full",
                                isActive ? "bg-gray-800 text-blue-400 border-b-2 border-b-blue-500" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                            )}
                        >
                            {isRunning ? (
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                            ) : (
                                <CheckCircle className="w-3 h-3 text-green-500" />
                            )}
                            <span className="font-mono">{name}</span>
                            <span className="text-[10px] text-gray-600">({toolRuns.length})</span>
                        </button>
                    );
                })}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-black/20 text-xs border-b border-gray-800/50 flex-shrink-0">
                <div className="flex items-center gap-2 text-gray-500">
                    <Terminal className="w-3.5 h-3.5" />
                    <span className="font-mono opacity-70">{activeTab || 'Select a tool'}</span>
                </div>
                <div className="flex items-center gap-2">

                    <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded text-gray-500">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Split Container */}
            <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden relative">

                {/* Log View (Top Section) */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto bg-[#1e1e1e] text-gray-300 custom-scrollbar selection:bg-blue-500/30"
                >
                    {currentRuns.length > 0 ? (
                        <div className="space-y-4 p-2">
                            {/* Group runs by command */}
                            {(() => {
                                const groups = new Map<string, ToolRun[]>();
                                currentRuns.forEach(run => {
                                    if (!groups.has(run.command)) groups.set(run.command, []);
                                    groups.get(run.command)?.push(run);
                                });

                                // Sort groups by latest run time
                                const sortedGroups = Array.from(groups.entries()).sort(([, runsA], [, runsB]) => {
                                    const latestA = Math.max(...runsA.map(r => r.startTime));
                                    const latestB = Math.max(...runsB.map(r => r.startTime));
                                    return latestA - latestB; // Keep chronological order of commands (oldest first? User usually wants latest at bottom)
                                });

                                return sortedGroups.map(([command, groupRuns]) => (
                                    <div key={command} className="bg-gray-900/40 rounded-lg border border-gray-800/50 overflow-hidden">
                                        {/* Group Header: Command + Actions */}
                                        <div className="flex items-center gap-3 px-3 py-2 bg-gray-900/60 border-b border-gray-800/50">
                                            <div className="font-mono text-xs text-blue-300 truncate flex-1 font-semibold">{command}</div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRerun(command);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-blue-500/20 text-gray-400 hover:text-blue-300 transition-colors"
                                                    title="Rerun command"
                                                >
                                                    <RotateCw className="w-3.5 h-3.5" />
                                                </button>
                                                <CopyButton content={command} className="hover:bg-gray-700/50 p-1.5 rounded" />
                                            </div>
                                        </div>

                                        {/* Individual Runs */}
                                        <div className="divide-y divide-gray-800/30">
                                            {groupRuns.map((run, index) => {
                                                const isExpanded = expandedRuns.has(run.id);
                                                const isRunning = run.status === 'running';
                                                const isHighlighted = highlightedRunId === run.id;
                                                const runIndex = index + 1; // 1-based index for "Run #1"

                                                return (
                                                    <div
                                                        key={run.id}
                                                        ref={el => { runRefs.current[run.id] = el; }}
                                                        className={clsx(
                                                            "transition-colors",
                                                            isHighlighted && "bg-blue-900/20 ring-1 ring-blue-500/30",
                                                            index % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"
                                                        )}
                                                    >
                                                        {/* Run Row Trigger */}
                                                        <div
                                                            onClick={() => toggleRun(run.id)}
                                                            className="flex items-center gap-3 px-3 py-1.5 cursor-pointer hover:bg-white/[0.04]"
                                                        >
                                                            {/* Expand Icon */}
                                                            {isExpanded ? (
                                                                <ChevronDown className="w-3 h-3 text-gray-600" />
                                                            ) : (
                                                                <ChevronRight className="w-3 h-3 text-gray-600" />
                                                            )}

                                                            {/* Status */}
                                                            {isRunning ? (
                                                                <span className="relative flex h-2 w-2">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                                </span>
                                                            ) : run.status === 'completed' ? (
                                                                <div className="w-2 h-2 rounded-full bg-green-500/50" />
                                                            ) : (
                                                                <AlertOctagon className="w-3 h-3 text-red-500" />
                                                            )}

                                                            <span className="text-[10px] text-gray-500 font-mono">#{runIndex}</span>

                                                            <div className="flex-1 text-[10px] text-gray-500 flex items-center gap-2">
                                                                <Clock className="w-3 h-3 opacity-50" />
                                                                {formatTime(run.startTime)}
                                                            </div>

                                                            {/* Close/Stop Button */}
                                                            {isRunning && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleKillRun(run.id);
                                                                    }}
                                                                    className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                                                                >
                                                                    <SquareIcon className="w-3 h-3" fill="currentColor" />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Logs Content */}
                                                        {isExpanded && (
                                                            <div className="px-3 py-2 bg-black/40 border-t border-gray-800/30">
                                                                <div className="font-mono text-xs whitespace-pre-wrap break-all leading-relaxed text-gray-300 max-h-[300px] overflow-y-auto custom-scrollbar">
                                                                    {run.logs.length > 0 ? (
                                                                        run.logs.map((log, i) => (
                                                                            <span key={i} className="block">{log}</span>
                                                                        ))
                                                                    ) : (
                                                                        <span className="text-gray-600 italic">Waiting for output...</span>
                                                                    )}
                                                                    {isRunning && (
                                                                        <span className="inline-block w-1.5 h-3 bg-blue-500 animate-pulse ml-0.5 align-middle"></span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600">
                            <p>Select a tool to view logs</p>
                        </div>
                    )}
                </div>

                {/* Drag Handle */}
                <div
                    onMouseDown={handleMouseDown}
                    className={clsx(
                        "h-2 bg-gray-900 border-t border-gray-800 cursor-ns-resize flex items-center justify-center hover:bg-gray-800 transition-colors flex-shrink-0",
                        isDragging && "bg-blue-900/50"
                    )}
                >
                    <div className="w-10 h-0.5 bg-gray-700 rounded-full" />
                </div>

                {/* Flow Graph (Bottom Section - Resizable) */}
                <div
                    style={{ height: flowHeight }}
                    className="bg-gray-950 flex-shrink-0 flex flex-col min-h-[100px] max-h-[400px]"
                >
                    <div className="flex items-center px-3 py-1.5 bg-gray-900/30 border-b border-gray-800/50 flex-shrink-0">
                        <GitGraph className="w-3 h-3 text-gray-500 mr-2" />
                        <span className="text-[10px] font-mono font-medium text-gray-400 uppercase tracking-wider">Execution Flow</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 min-h-0 bg-[#1e1e1e]/50 custom-scrollbar">
                        <CommandFlowGraph
                            workspaceId={workspaceId}
                            onNodeClick={handleNodeClick}
                            className="bg-transparent border-0 p-0"
                        />
                    </div>
                </div>
            </div>


        </div>
    );
}
