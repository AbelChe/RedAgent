import React, { useState, useEffect, useMemo } from 'react';
import { jobsService, Job } from '@/services/jobs';
import { Clock, CheckCircle, XCircle, Loader2, X, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { CodeServerViewer } from './CodeServerViewer';

interface Props {
    workspaceId: string;
    conversationId?: string;  // Filter jobs by conversation
    onJobClick?: (jobId: string) => void;
    taskConversationMap: Map<string, string | null>;
}

export default function TaskQueuePanel({ workspaceId, conversationId, onJobClick, taskConversationMap }: Props) {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [filter, setFilter] = useState<'all' | 'running' | 'pending' | 'completed'>('all');
    const [loading, setLoading] = useState(true);
    const [viewingFile, setViewingFile] = useState<{ workspaceId: string; filePath: string } | null>(null);

    // Load jobs list
    useEffect(() => {
        loadJobs();
        const interval = setInterval(loadJobs, 3000); // Refresh every 3 seconds
        return () => clearInterval(interval);
    }, [workspaceId, conversationId]);  // Re-load when conversation changes

    const loadJobs = async () => {
        try {
            const data = await jobsService.list(workspaceId, undefined, conversationId);
            // Filter by conversation using task_id
            const filteredData = conversationId
                ? data.filter(job => {
                    const taskId = job.task_id;
                    // STRICT ISOLATION: Hide jobs that have no task_id (legacy/orphan)
                    if (!taskId) return false;

                    const taskConvId = taskConversationMap.get(taskId);
                    // Only hide if it explicitly belongs toANOTHER conversation
                    if (taskConvId && taskConvId !== conversationId) return false;

                    return true;
                })
                : data;
            console.log(`📋 TaskQueue: ${data.length} jobs for conversation ${conversationId || 'all'}`);
            setJobs(data);
        } catch (error) {
            console.error('Failed to load jobs:', error);
        } finally {
            setLoading(false);
        }
    };

    const groupedJobs = useMemo(() => ({
        running: jobs.filter(j => j.status === 'running'),
        pending: jobs.filter(j => j.status === 'pending'),
        completed: jobs.filter(j => ['completed', 'failed', 'cancelled'].includes(j.status))
    }), [jobs]);

    const filteredJobs = useMemo(() => {
        if (filter === 'all') return jobs;
        if (filter === 'pending') return groupedJobs.pending;
        if (filter === 'running') return groupedJobs.running;
        return groupedJobs.completed;
    }, [filter, jobs, groupedJobs]);

    const handleCancel = async (jobId: string) => {
        try {
            await jobsService.cancel(jobId);
            await loadJobs();
        } catch (error) {
            console.error('Failed to cancel job:', error);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-blue-400" size={32} />
            </div>
        );
    }

    return (
        <div className="task-queue-panel h-full flex flex-col bg-gray-950">
            {/* Header & Tabs */}
            <div className="border-b border-gray-800">
                <div className="flex items-center justify-between p-4">
                    <h2 className="text-lg font-semibold text-gray-100">Task Queue</h2>
                    <div className="text-xs text-gray-500">
                        Auto-refresh every 3s
                    </div>
                </div>

                <div className="flex px-4 gap-4">
                    <TabButton
                        active={filter === 'all'}
                        onClick={() => setFilter('all')}
                        label="All"
                        count={jobs.length}
                    />
                    <TabButton
                        active={filter === 'running'}
                        onClick={() => setFilter('running')}
                        label="Running"
                        count={groupedJobs.running.length}
                    />
                    <TabButton
                        active={filter === 'pending'}
                        onClick={() => setFilter('pending')}
                        label="Pending"
                        count={groupedJobs.pending.length}
                    />
                    <TabButton
                        active={filter === 'completed'}
                        onClick={() => setFilter('completed')}
                        label="Completed"
                        count={groupedJobs.completed.length}
                    />
                </div>
            </div>

            {/* Job List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                {filteredJobs.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                        <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No {filter !== 'all' && filter} tasks</p>
                    </div>
                ) : (
                    filteredJobs.map(job => (
                        <JobCard
                            key={job.id}
                            job={job}
                            onCancel={handleCancel}
                            onJobClick={onJobClick}
                            onViewFile={(wsId, path) => setViewingFile({ workspaceId: wsId, filePath: path })}
                        />
                    ))
                )}
            </div>

            {/* Code Server File Viewer */}
            {viewingFile && (
                <CodeServerViewer
                    workspaceId={viewingFile.workspaceId}
                    filePath={viewingFile.filePath}
                    onClose={() => setViewingFile(null)}
                />
            )}
        </div>
    );
}

function TabButton({ active, onClick, label, count }: {
    active: boolean;
    onClick: () => void;
    label: string;
    count: number;
}) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                active
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-300"
            )}
        >
            {label} <span className="text-xs opacity-75">({count})</span>
        </button>
    );
}

function JobCard({ job, onCancel, onJobClick, onViewFile }: {
    job: Job;
    onCancel: (id: string) => void;
    onJobClick?: (id: string) => void;
    onViewFile?: (workspaceId: string, filePath: string) => void;
}) {
    // Determine actual success/failure based on exit_code
    const isActuallyFailed = job.status === 'failed' ||
        (job.status === 'completed' && job.exit_code !== undefined && job.exit_code !== 0);
    const isActuallySuccessful = job.status === 'completed' && (job.exit_code === undefined || job.exit_code === 0);

    const StatusIcon = {
        pending: Clock,
        running: Loader2,
        completed: isActuallyFailed ? XCircle : CheckCircle,
        failed: XCircle,
        cancelled: XCircle
    }[job.status];

    const statusColor = {
        pending: 'text-yellow-400',
        running: 'text-blue-400',
        completed: isActuallyFailed ? 'text-red-400' : 'text-green-400',
        failed: 'text-red-400',
        cancelled: 'text-gray-400'
    }[job.status];

    const formatDuration = (start: string) => {
        const diff = new Date().getTime() - new Date(start).getTime();
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        if (minutes > 0) return `${minutes}m ${seconds}s ago`;
        return `${seconds}s ago`;
    };

    return (
        <div
            className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors cursor-pointer"
            onClick={() => onJobClick?.(job.id)}
            title="Click to view logs"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <StatusIcon
                        className={clsx(
                            "w-5 h-5 flex-shrink-0 mt-0.5",
                            statusColor,
                            job.status === 'running' && 'animate-spin'
                        )}
                    />

                    <div className="flex-1 min-w-0">
                        <code className="text-sm text-gray-200 block truncate font-mono">
                            {job.command}
                        </code>

                        <div className="mt-2 space-y-1 text-xs text-gray-500">
                            <div>
                                Job ID: <span className="text-gray-400 font-mono">{job.id.slice(0, 8)}</span>
                            </div>
                            {job.agent_id && (
                                <div>
                                    Worker: <span className="text-gray-400">{job.agent_id}</span>
                                </div>
                            )}
                            {job.started_at && (
                                <div>
                                    Started: <span className="text-gray-400">{formatDuration(job.started_at)}</span>
                                </div>
                            )}
                            {job.exit_code !== undefined && (
                                <div>
                                    Exit Code: <span className={clsx(
                                        job.exit_code === 0 ? 'text-green-400' : 'text-red-400'
                                    )}>{job.exit_code}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {job.status === 'running' && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent card onClick
                            onCancel(job.id);
                        }}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Cancel job"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {job.error_message && (
                <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300 font-mono">
                    {job.error_message}
                </div>
            )}

            {/* Stdout Output */}
            {job.stdout && (
                <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Output:</div>
                    <div className="p-2 bg-gray-800/50 border border-gray-700 rounded text-xs text-gray-300 font-mono max-h-40 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                        {job.stdout}
                    </div>
                </div>
            )}

            {/* Stderr Output */}
            {job.stderr && (
                <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Errors:</div>
                    <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300 font-mono max-h-40 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                        {job.stderr}
                    </div>
                </div>
            )}

            {/* Output Files */}
            {job.output_files && job.output_files.length > 0 && (
                <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">📁 Scan Results:</div>
                    <div className="space-y-1">
                        {job.output_files.map((file, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-300 font-mono hover:bg-blue-500/20 transition cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onJobClick?.(job.id);
                                    onViewFile?.(job.workspace_id, file);
                                }}
                                title={`Click to view: ${file}`}
                            >
                                <span className="flex-1 truncate">{file.split('/').pop()}</span>
                                <span className="text-gray-500 text-[10px]">{file.includes('.xml') ? 'XML' : file.includes('.txt') ? 'TXT' : 'DATA'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
