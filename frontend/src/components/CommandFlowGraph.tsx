'use client';

import { useToolLogStore, ToolRun } from '@/store/toolLogStore';
import clsx from 'clsx';
import { CheckCircle, AlertOctagon, Play, Terminal, Zap } from 'lucide-react';

interface CommandFlowGraphProps {
    onNodeClick?: (runId: string) => void;
    className?: string;
    workspaceId: string;
}

export default function CommandFlowGraph({ onNodeClick, className, workspaceId }: CommandFlowGraphProps) {
    const { runs, highlightedRunId, setHighlightedRun, getAllRuns } = useToolLogStore();

    const allRuns = getAllRuns(workspaceId);

    if (allRuns.length === 0) {
        return null;
    }

    const handleClick = (runId: string) => {
        setHighlightedRun(runId);
        onNodeClick?.(runId);
    };

    // Group runs by tool for visual organization
    const runsByTool: Record<string, ToolRun[]> = {};
    allRuns.forEach(run => {
        if (!runsByTool[run.tool]) runsByTool[run.tool] = [];
        runsByTool[run.tool].push(run);
    });

    return (
        <div className={clsx("bg-gray-900/50 border border-gray-800 rounded-lg p-4", className)}>
            {/* Header */}
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <Terminal className="w-3.5 h-3.5" />
                <span className="font-medium">Command Execution Flow</span>
                <span className="text-gray-600">({allRuns.length} commands)</span>
            </div>

            {/* Flow Graph - Horizontal layout */}
            <div className="flex flex-wrap gap-2">
                {allRuns.map((run, index) => {
                    const isHighlighted = highlightedRunId === run.id;
                    const isRunning = run.status === 'running';
                    const isCompleted = run.status === 'completed';
                    const isFailed = run.status === 'failed';

                    return (
                        <div key={run.id} className="flex items-center">
                            {/* Node */}
                            <button
                                onClick={() => handleClick(run.id)}
                                className={clsx(
                                    "group relative flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono transition-all cursor-pointer",
                                    isHighlighted
                                        ? "bg-blue-600/20 border-blue-500 text-blue-400 ring-2 ring-blue-500/30"
                                        : isRunning
                                            ? "bg-blue-900/20 border-blue-800/50 text-blue-400 animate-pulse"
                                            : isFailed
                                                ? "bg-red-900/20 border-red-800/50 text-red-400"
                                                : "bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800",
                                    "hover:scale-105"
                                )}
                                title={`${run.command}\nStatus: ${run.status}\nClick to view logs`}
                            >
                                {/* Status Icon */}
                                {isRunning ? (
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                    </span>
                                ) : isFailed ? (
                                    <AlertOctagon className="w-3 h-3 text-red-500" />
                                ) : (
                                    <CheckCircle className="w-3 h-3 text-gray-500" />
                                )}

                                {/* Command (truncated) */}
                                <span className="max-w-[120px] truncate">{run.command.split(' ').slice(0, 2).join(' ')}</span>

                                {/* Async Task Indicator */}
                                {run.tool === 'celery_job' && (
                                    <div className="absolute -top-1 -right-1 bg-purple-600 rounded-full p-0.5 border border-gray-900" title="Async Queue Task">
                                        <Zap className="w-2.5 h-2.5 text-white" />
                                    </div>
                                )}

                                {/* Tooltip on hover */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black border border-gray-700 rounded text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                    {run.command}
                                    {run.tool === 'celery_job' && <span className="text-purple-400 ml-2">(Async)</span>}
                                </div>
                            </button>

                            {/* Connector Arrow */}
                            {index < allRuns.length - 1 && (
                                <div className="flex items-center px-1">
                                    <div className="w-4 h-px bg-gray-700"></div>
                                    <div className="w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-gray-700"></div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
