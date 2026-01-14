'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { taskService, workspaceService, toolsService } from '@/services/api';
import { jobsService } from '@/services/jobs';
import { Task, Workspace } from '@/types';
import { Send, Terminal as TerminalIcon, Loader2, Play, AlertTriangle, CheckCircle, XCircle, ShieldAlert, ChevronDown, SquareTerminal, PanelRightOpen, PanelRightClose, HelpCircle, ClipboardList, Bot, BotIcon, SquareIcon, Sparkles, X, Brain, Activity, Code2 } from 'lucide-react';
import clsx from 'clsx';
import { useToolLogStore } from '@/store/toolLogStore';
import { ThinkingProcess } from '@/components/ThinkingProcess';
import { CommandAudit } from '@/components/CommandAudit';
import { MarkdownContent } from '@/components/MarkdownContent';
import { CopyButton } from '@/components/CopyButton';

import { FloatingIde } from '@/components/FloatingIde';

// Dynamic import for Terminal (No SSR)
const TerminalComponent = dynamic(() => import('@/components/Terminal'), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-black flex items-center justify-center text-gray-500 font-mono text-xs">Loading Terminal...</div>
});

const LiveCommandCard = dynamic(() => import('@/components/LiveCommandCard'), { ssr: false });
const ToolLogsPanel = dynamic(() => import('@/components/ToolLogsPanel'), { ssr: false });
const CommandFlowGraph = dynamic(() => import('@/components/CommandFlowGraph'), { ssr: false });
const TaskQueuePanel = dynamic(() => import('@/components/TaskQueuePanel'), { ssr: false });
const WorkspaceSelector = dynamic(() => import('@/components/WorkspaceSelector').then(mod => ({ default: mod.WorkspaceSelector })));

export default function ConversationPage() {
    const params = useParams();
    const workspaceId = params.id as string;
    const conversationId = params.conversationId as string;

    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [input, setInput] = useState('');
    const [selectedMode, setSelectedMode] = useState<'ask' | 'planning' | 'agent'>('agent');
    const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [connectionKey, setConnectionKey] = useState(0);
    const [showTerminal, setShowTerminal] = useState(false);
    const [showIde, setShowIde] = useState(false);
    const [ideMinimized, setIdeMinimized] = useState(false);
    const [terminalHeight, setTerminalHeight] = useState(250); // Resizable terminal height
    const [logsWidth, setLogsWidth] = useState(30); // Logs panel width as percentage
    const [queueWidth, setQueueWidth] = useState(30); // Queue panel width as percentage
    const [filesWidth, setFilesWidth] = useState(70); // Files panel width as percentage
    const [showLogs, setShowLogs] = useState(false); // Tool Logs panel toggle
    const [showQueue, setShowQueue] = useState(false); // Task Queue panel toggle
    const [showFiles, setShowFiles] = useState(false); // Files panel toggle
    const [mcpStatus, setMcpStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
    const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);
    const [availableTools, setAvailableTools] = useState<string[]>([]);

    // Check if there's any running task
    const hasRunningTask = tasks.some(t => t.status === 'running');

    // Build task ID to conversation ID mapping
    const taskConversationMap = useMemo(() => {
        const map = new Map<string, string | null>();
        tasks.forEach(task => {
            map.set(task.id, task.conversation_id || null);
        });
        return map;
    }, [tasks]);

    // Filter tasks by active conversation (from URL params)
    const filteredTasks = useMemo(() => {
        if (!conversationId) {
            return tasks;
        }
        const filtered = tasks.filter(t =>
            t.conversation_id === conversationId ||
            !t.conversation_id // Legacy support
        );
        console.log(`🔍 Filtering tasks: ${filtered.length}/${tasks.length} tasks for conversation ${conversationId}`);
        return filtered;
    }, [tasks, conversationId]);

    // MCP Status Polling
    useEffect(() => {
        const checkMcpStatus = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`;
                const res = await fetch(`${apiUrl}/mcp/status`);
                const data = await res.json();
                setMcpStatus(data.connected ? 'connected' : 'disconnected');
            } catch {
                setMcpStatus('disconnected');
            }
        };

        checkMcpStatus(); // Initial check
        const interval = setInterval(checkMcpStatus, 5000); // Poll every 5s

        return () => clearInterval(interval);
    }, []);

    // Custom Store
    const toolLogStore = useToolLogStore();

    const scrollRef = useRef<HTMLDivElement>(null);

    const isAtBottomRef = useRef(true);
    const prevTasksLengthRef = useRef(0);

    // Check scroll position to determine if we should stick to bottom
    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        // Consider "at bottom" if within 100px of the bottom
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
        isAtBottomRef.current = isAtBottom;
    };

    // Auto-scroll logic with stick-to-bottom behavior
    useEffect(() => {
        if (!scrollRef.current) return;

        const isNewTask = tasks.length > prevTasksLengthRef.current;
        prevTasksLengthRef.current = tasks.length;

        // Only auto-scroll if we are adding a new task OR the user was already at the bottom
        if (isNewTask || isAtBottomRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'auto'
            });
        }
    }, [tasks]);

    // Reload tool runs when active conversation changes to ensure isolation
    // Reload tool runs and sync with jobs when active conversation changes
    useEffect(() => {
        async function syncLogs() {
            if (!workspaceId) return;

            // Clear existing logs
            toolLogStore.clear(workspaceId);

            // Load persisted runs first
            await toolLogStore.loadRuns(workspaceId, conversationId);

            // Then sync jobs as runs (fallback for missing logs)
            try {
                // Pass undefined for status to filter by conversationId correctly
                const jobs = await jobsService.list(workspaceId, undefined, conversationId);
                const currentRunIds = new Set(Object.keys(toolLogStore.runs));

                jobs.forEach(job => {
                    const synthesizedId = `job-${job.id}`;
                    // Avoid re-adding if exactly this ID exists
                    if (!currentRunIds.has(synthesizedId)) {
                        const toolName = job.command.split(' ')[0] || 'command';
                        // Construct logs from stdout/stderr/error
                        const logs = [];
                        if (job.stdout) logs.push(job.stdout);
                        if (job.stderr) logs.push(`[stderr] ${job.stderr}`);
                        if (job.error_message) logs.push(`[error] ${job.error_message}`);

                        toolLogStore.addRun({
                            id: synthesizedId,
                            tool: toolName,
                            command: job.command,
                            logs: logs.length > 0 ? logs : (job.status === 'running' ? ['Running...'] : []),
                            status: job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'failed' : job.status === 'running' ? 'running' : 'cancelled',
                            startTime: new Date(job.created_at).getTime(),
                            workspaceId: workspaceId,
                            task_id: job.task_id
                        });
                    }
                });
            } catch (e) {
                console.error("Failed to sync jobs to logs:", e);
            }
        }

        syncLogs();
    }, [workspaceId, conversationId]);

    // SSE Integration
    useEffect(() => {
        if (!workspaceId) return;

        // Fetch initial state
        workspaceService.get(workspaceId).then(setWorkspace).catch(console.error);
        workspaceService.listTasks(workspaceId).then(fetchedTasks => {
            console.log('📋 Initial tasks loaded:', fetchedTasks);
            setTasks(fetchedTasks);
            setTasksLoading(false);
        }).catch(console.error);



        // Fetch available tools for suggestions
        toolsService.getList().then(setAvailableTools).catch((err: any) => console.error("Failed to load tools:", err));

        // Use window.location to determine backend URL dynamically if env not set
        const getBackendUrl = () => {
            if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
            // Fallback for local dev/LAN: assume backend is on same host, port 8000
            return `${window.location.protocol}//${window.location.hostname}:8000`;
        };

        const sseUrl = `${getBackendUrl()}/workspaces/${workspaceId}/stream`;

        console.log(`📡 Connecting to SSE (Attempt ${connectionKey}):`, sseUrl);
        const eventSource = new EventSource(sseUrl);

        // Throttling Buffer
        const pendingUpdates = new Map<string, any>();

        // Flush loop (30fps)
        const flushInterval = setInterval(() => {
            if (pendingUpdates.size === 0) return;

            setTasks(prev => {
                const updated = [...prev];
                let hasChanges = false;

                pendingUpdates.forEach((data, taskId) => {
                    if (taskId === 'tool_log') return; // Skip tool logs for task list

                    const idx = updated.findIndex(t => t.id === taskId);

                    if (data.type === 'task_update') {
                        if (idx === -1) return;
                        const current = updated[idx];

                        // Merge result instead of overwriting, preserving accumulated thinking
                        updated[idx] = {
                            ...current,
                            status: data.status,
                            result: {
                                ...(current.result as any),
                                ...data.result
                            },
                            // Preserve thinking from streaming if final result doesn't have it
                            thinking: data.result?.thinking || current.thinking
                        };
                        hasChanges = true;
                    }
                    else if (data.type === 'agent_state_update') {
                        if (idx === -1) return;
                        const current = updated[idx];

                        // Extract status properly
                        let newStatus = current.status || 'running';
                        if (data.state_summary?.status) {
                            newStatus = data.state_summary.status.replace('executing_', '');
                        } else if (data.data?.status) {
                            newStatus = data.data.status;
                        }

                        // Ensure status is set to running if not pending/completed/failed/cancelled
                        if (!['pending', 'completed', 'failed', 'cancelled'].includes(newStatus)) {
                            newStatus = 'running';
                        }

                        // Smart merge logic - accumulate thinking and content
                        updated[idx] = {
                            ...current,
                            status: newStatus as any,
                            thinking: data.state_summary?.thinking || current.thinking,
                            result: data.state_summary?.content
                                ? { ...(current.result as any), final_message: data.state_summary.content }
                                : current.result
                        };
                        hasChanges = true;
                    }
                });

                return hasChanges ? updated : prev;
            });
            pendingUpdates.clear();
        }, 33);


        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // Handle Tool Logs (Direct Store Update)
                if (data.type === 'tool_log') {
                    const { tool, runId, command, data: logData, task_id } = data.data; // Extract task_id from payload

                    // Check if this run already exists using new flat structure
                    const runExists = !!toolLogStore.runs[runId];

                    if (!runExists && runId && command) {
                        toolLogStore.startRun(runId, tool, command, workspaceId, task_id);
                        // Only auto-open logs if relevant to current conversation
                        if (taskConversationMap.get(task_id) === conversationId) {
                            setShowLogs(true);
                        }
                    }

                    if (runId && logData) {
                        toolLogStore.appendLog(runId, logData);
                    }
                    return;
                }

                if (data.type === 'tool_exit') {
                    const { runId, status, error } = data.data;
                    if (runId) {
                        if (error) {
                            toolLogStore.appendLog(runId, `\nError: ${error}`);
                        }
                        toolLogStore.completeRun(runId, status as any);
                    }
                    return;
                }

                if (data.type === 'task_update' || data.type === 'agent_state_update') {
                    // Just push to buffer
                    pendingUpdates.set(data.task_id || data.data?.task_id, data);
                }

                if (data.type === 'task_cancelled') {
                    // Update task status immediately
                    const taskId = data.task_id;
                    setTasks(prev => prev.map(t =>
                        t.id === taskId ? { ...t, status: 'cancelled' } : t
                    ));
                }
            } catch (e) {
                console.error("SSE Parse Error", e);
            }
        };

        eventSource.onerror = (err) => {
            console.error('❌ SSE Error:', err);
            eventSource.close();
            clearInterval(flushInterval); // Stop timer on error
            // Retry after 3s
            setTimeout(() => {
                setConnectionKey(prev => prev + 1);
            }, 3000);
        };

        return () => {
            eventSource.close();
            clearInterval(flushInterval); // Clean up timer
            console.log('🔌 SSE Closed');
        };
    }, [workspaceId, connectionKey]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        setLoading(true);
        try {
            // Include conversation_id in task creation if in specific conversation
            // Assuming taskService.create supports it, or backend handles it via session?
            // Wait, taskService.create doesn't have conversation_id arg yet in frontend?
            // It uses active conversation from backend context or we need to pass it?

            // Checking backend `tasks.py`: `create_task`. It takes `conversation_id`.
            // Checking frontend `taskService.create`:
            // async (workspaceId, command, mode) => post('/tasks/', {workspaceId, command, mode})
            // We need to UPDATE `taskService.create` to accept `conversation_id`!

            // For now, I will assume taskService needs update or I pass it.
            // Let's pass it in the body if I update `taskService`.

            // Actually, I should update `taskService.create` signature in `api.ts`.
            // But for now let's modify the call here and assume I'll fix api.ts momentarily.

            const newTask = await taskService.create(workspaceId, input, selectedMode, conversationId);
            setTasks(prev => [...prev, newTask]);
            setInput('');

            // Run the task
            await taskService.run(newTask.id);

            // Immediately update status to running for instant UI feedback
            setTasks(prev => prev.map(t =>
                t.id === newTask.id ? { ...t, status: 'running' as const } : t
            ));
        } catch (err) {
            console.error(err);
            alert('Failed to submit task');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (taskId: string) => {
        try {
            await taskService.approve(taskId);
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, status: "pending" } : t
            ));
        } catch (err) {
            alert("Approval failed");
        }
    };

    const handleCancel = async (taskId: string) => {
        try {
            // Set loading state
            setCancellingTaskId(taskId);

            // Call cancel API and wait for response
            await taskService.cancel(taskId);

            // SSE will update the status, but we can optimistically update here too
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, status: "cancelled" as const } : t
            ));
        } catch (err) {
            console.error("Failed to cancel task:", err);
            alert("Failed to cancel task");
        } finally {
            setCancellingTaskId(null);
        }
    };





    // Slash Command Logic
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
    const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [showSlashMenu, setShowSlashMenu] = useState(true);

    const slashMatches = useMemo(() => {
        if (!input.startsWith('/')) return [];
        const query = input.slice(1).toLowerCase();
        // If query contains space, user is typing args, so stop suggesting
        if (query.includes(' ')) return [];

        const tools = ['list_tool', ...availableTools];
        return query === '' ? tools : tools.filter(t => t.toLowerCase().includes(query));
    }, [input, availableTools]);

    // Reset selection and visibility when input changes
    useEffect(() => {
        setSelectedSuggestionIndex(0);
        setShowSlashMenu(true);
    }, [input]);

    // Auto-scroll to selected suggestion
    useEffect(() => {
        if (suggestionRefs.current[selectedSuggestionIndex]) {
            suggestionRefs.current[selectedSuggestionIndex]?.scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
        }
    }, [selectedSuggestionIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (slashMatches.length > 0 && showSlashMenu) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedSuggestionIndex(prev => (prev + 1) % slashMatches.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedSuggestionIndex(prev => (prev - 1 + slashMatches.length) % slashMatches.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const selected = slashMatches[selectedSuggestionIndex];
                if (selected) {
                    setInput(`/${selected} `);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowSlashMenu(false);
            }
        }
    };


    return (
        <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-500/30">
            {/* Header */}
            <header className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-950/80 backdrop-blur-md z-10 sticky top-0">
                <div className="flex items-center gap-4">
                    {/* Workspace Selector */}
                    <WorkspaceSelector currentWorkspaceId={workspaceId} />

                    {/* MCP Status */}
                    <div className="flex items-center gap-2">
                        <span className={clsx(
                            "flex h-1.5 w-1.5 rounded-full",
                            mcpStatus === 'connected' ? "bg-green-500 animate-pulse" :
                                mcpStatus === 'disconnected' ? "bg-red-500" : "bg-yellow-500 animate-pulse"
                        )}></span>
                        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                            {workspace?.mode || 'Agent'} Mode · {
                                mcpStatus === 'connected' ? 'MCP Connected' :
                                    mcpStatus === 'disconnected' ? 'MCP Offline' : 'Checking...'
                            }
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-4">

                    {/* Tool Logs Toggle */}
                    <button
                        onClick={() => {
                            setShowLogs(!showLogs);
                            if (!showLogs) setShowFiles(false);
                        }}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                            showLogs ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : "bg-gray-900 border-gray-800 text-gray-400"
                        )}
                        title="Toggle Tool Logs Panel"
                    >
                        <PanelRightOpen className="w-4 h-4" />
                        <span>Logs</span>
                    </button>

                    {/* Task Queue Toggle Button */}
                    <button
                        onClick={() => {
                            setShowQueue(!showQueue);
                            if (!showQueue) setShowFiles(false);
                        }}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                            showQueue ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700"
                        )}
                        title="Toggle Task Queue Panel"
                    >
                        <ClipboardList className="w-4 h-4" />
                        <span>Queue</span>
                    </button>


                    {/* Files / IDE Button */}
                    <button
                        onClick={() => {
                            if (!workspace) return;
                            if (!showIde) {
                                // Open and ensure expanded
                                setShowIde(true);
                                setIdeMinimized(false);
                            } else {
                                // If already open and user clicks again, toggle minimization
                                setIdeMinimized(!ideMinimized);
                            }
                        }}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-lg",
                            showIde
                                ? "bg-blue-600 border-blue-500 text-white shadow-blue-900/40"
                                : "bg-gray-900 border-gray-800 text-gray-400 hover:text-blue-400 hover:border-blue-500/50"
                        )}
                        title={showIde ? (ideMinimized ? "Restore IDE" : "Minimize IDE") : "Open Code Server IDE"}
                    >
                        <Code2 className="w-4 h-4" />
                        <span>IDE</span>
                    </button>

                    {/* Terminal Toggle Button */}
                    <button
                        onClick={() => setShowTerminal(!showTerminal)}
                        className={clsx(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                            showTerminal
                                ? "bg-purple-600/20 border-purple-500/50 text-purple-400 shadow-sm shadow-purple-900/20"
                                : "bg-gray-900 border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                        )}
                    >
                        <SquareTerminal className="w-4 h-4" />
                        {showTerminal ? 'Hide Terminal' : 'Terminal'}
                    </button>
                </div>
            </header>

            {/* Split View Container */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* Floating IDE Window - Integrated here for absolute positioning */}
                {showIde && workspace && (
                    <FloatingIde
                        workspace={workspace}
                        isMinimized={ideMinimized}
                        onMinimizeChange={setIdeMinimized}
                        onClose={() => setShowIde(false)}
                    />
                )}

                {/* Main Content: Task List - Smooth Transition */}
                <main
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="overflow-y-auto p-4 md:p-6 space-y-8 scroll-smooth custom-scrollbar"
                    style={{
                        width: `${100 - (showLogs ? logsWidth : 0) - (showQueue ? queueWidth : 0) - (showFiles ? filesWidth : 0)}%`
                    }}
                >
                    {filteredTasks.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-6">
                            <div className="relative">
                                <div className="absolute -inset-4 bg-blue-500/5 blur-2xl rounded-full"></div>
                                <BotIcon className="w-20 h-20 relative opacity-20" />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-sm font-medium">Ready to pentest</p>
                                <p className="text-xs opacity-50">e.g. Scan target 192.168.1.1 open ports and analyze risks</p>
                                <p className="text-xs opacity-50">例如：扫描目标 192.168.1.1 的开放端口并分析风险</p>
                            </div>
                        </div>
                    )}

                    {filteredTasks.map((task) => (
                        <div key={task.id} className="w-full max-w-4xl mx-auto space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            {/* User Command */}
                            <div className="flex justify-end pr-2">
                                <div className="bg-blue-600/90 text-white px-5 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] shadow-lg shadow-blue-900/10 text-sm">
                                    {task.command}
                                </div>
                            </div>

                            {/* Agent Response */}
                            <div className="flex justify-start">
                                <div className={clsx(
                                    "w-full max-w-[95%] rounded-2xl rounded-tl-sm border p-5 space-y-4 shadow-xl relative transition-all duration-500 backdrop-blur-sm",
                                    task.status === 'failed' ? "bg-red-950/5 border-red-900/30" :
                                        task.status === 'waiting_approval' ? "bg-amber-950/5 border-amber-900/30" :
                                            "bg-gray-900/40 border-gray-800/80"
                                )}>
                                    {/* Status Header */}
                                    <div className="flex items-center justify-between border-b border-gray-800/50 pb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className={clsx(
                                                "p-1 rounded-md",
                                                task.status === 'running' ? "bg-blue-500/10" :
                                                    task.status === 'completed' ? "bg-green-500/10" :
                                                        task.status === 'failed' ? "bg-red-500/10" : "bg-amber-500/10"
                                            )}>
                                                {task.status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                                                {task.status === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                                                {task.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                                                {task.status === 'waiting_approval' && <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />}
                                            </div>
                                            <span className={clsx(
                                                "text-xs font-bold tracking-widest uppercase",
                                                task.status === 'running' && "text-blue-400",
                                                task.status === 'completed' && "text-green-400",
                                                task.status === 'failed' && "text-red-400",
                                                task.status === 'waiting_approval' && "text-amber-400"
                                            )}>
                                                {task.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-gray-600 font-mono">{new Date(task.updated_at || task.created_at).toLocaleTimeString()}</span>
                                    </div>

                                    {/* Content (Simplified for brevity in update) */}
                                    <div className="text-sm">
                                        {(() => {
                                            // Handle potential double-encoding or string vs object format
                                            let resultObj: any = task.result;
                                            if (typeof task.result === 'string') {
                                                try {
                                                    resultObj = JSON.parse(task.result);
                                                } catch (e) {
                                                    // Plain string result (e.g. from simple command mode)
                                                    resultObj = { final_message: task.result };
                                                }
                                            }

                                            // Determine Content sources
                                            const rawContent = resultObj?.final_message || (typeof resultObj === 'string' ? resultObj : '') || (task.result as any)?.stdout || '';
                                            let displayThinking = task.thinking || resultObj?.thinking || '';
                                            let displayContent = rawContent;

                                            // If content contains <think> tags, extract them for better display
                                            if (rawContent && (rawContent.includes('<think>') || rawContent.includes('</think>'))) {
                                                const thinkMatch = rawContent.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
                                                if (thinkMatch) {
                                                    const extractedThink = thinkMatch[1].trim();
                                                    if (extractedThink) displayThinking = extractedThink;
                                                    displayContent = rawContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
                                                }
                                            }

                                            return (
                                                <>
                                                    <ThinkingProcess content={displayThinking} isRunning={task.status === 'running'} />
                                                    {task.status === 'waiting_approval' && (
                                                        <div className="bg-amber-950/20 border border-amber-700/30 rounded-xl p-5 my-4">
                                                            <h3 className="text-amber-500 font-bold text-sm">拦截到高风险命令</h3>
                                                            <code className="block bg-black/40 p-3 rounded-lg text-red-400 text-[11px] font-mono border border-red-900/20 break-all my-2">{(task.result as any)?.pending_command || '未知命令'}</code>
                                                            <div className="flex gap-3 pt-2">
                                                                <button onClick={() => handleApprove(task.id)} className="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-green-900/20">核准执行</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(() => {
                                                        const finalContent = displayContent || (task.result ? JSON.stringify(task.result, null, 2) : '');
                                                        if (!finalContent && task.status !== 'completed') return null;

                                                        return (
                                                            <div className="mt-4 pt-4 border-t border-gray-800/50 group/response">
                                                                <MarkdownContent content={finalContent} />

                                                                {/* Response Footer */}
                                                                <div className="flex items-center justify-end mt-2 opacity-0 group-hover/response:opacity-100 transition-opacity duration-200">
                                                                    <CopyButton content={finalContent} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </>
                                            );
                                        })()}
                                        {task.status === 'running' && !task.thinking && (
                                            <div className="flex items-center gap-3 text-gray-500 text-xs italic mt-2">
                                                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                                                人工智能正在分析环境并准备方案...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </main>

                {/* Right Panel: Tool Logs & Task Queue - Resizable Width */}
                {showLogs && (
                    <div
                        className="border-l border-gray-800 bg-black flex flex-col shadow-2xl z-20 overflow-hidden relative"
                        style={{ width: `${logsWidth}%` }}
                    >
                        {/* Resize Handle - Left Edge */}
                        <div
                            className="absolute top-0 left-0 bottom-0 w-2 cursor-ew-resize bg-transparent hover:bg-blue-500/30 transition-colors z-10"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startWidth = logsWidth;
                                const containerWidth = (e.target as HTMLElement).parentElement?.parentElement?.offsetWidth || window.innerWidth;

                                const onMouseMove = (e: MouseEvent) => {
                                    const delta = startX - e.clientY;
                                    const deltaPercent = ((startX - e.clientX) / containerWidth) * 100;
                                    const newWidth = Math.min(Math.max(startWidth + deltaPercent, 20), 80);
                                    setLogsWidth(newWidth);
                                };

                                const onMouseUp = () => {
                                    document.removeEventListener('mousemove', onMouseMove);
                                    document.removeEventListener('mouseup', onMouseUp);
                                };

                                document.addEventListener('mousemove', onMouseMove);
                                document.addEventListener('mouseup', onMouseUp);
                            }}
                        />

                        <ToolLogsPanel
                            onClose={() => setShowLogs(false)}
                            workspaceId={workspaceId}
                            conversationId={conversationId || undefined}
                            taskConversationMap={taskConversationMap}
                            onRerun={async (command) => {
                                if (loading) return;
                                try {
                                    // Use standard persistent flow ensuring conversation isolation
                                    // 1. Create a task linked to this conversation
                                    const task = await taskService.create(workspaceId, command, 'agent', conversationId);

                                    // 2. Create the job linked to the task
                                    await jobsService.create(workspaceId, command, 5, task.id);

                                    // Logs panel will auto-update via SSE / Polling
                                } catch (e) {
                                    console.error(e);
                                    alert('Failed to rerun command');
                                }
                            }}
                        />
                    </div>
                )}

                {/* Right Panel: Task Queue - Resizable Width */}
                {showQueue && (
                    <div
                        className="border-l border-gray-800 bg-black flex flex-col shadow-2xl z-20 overflow-hidden relative"
                        style={{ width: `${queueWidth}%` }}
                    >
                        {/* Resize Handle - Left Edge */}
                        <div
                            className="absolute top-0 left-0 bottom-0 w-2 cursor-ew-resize bg-transparent hover:bg-blue-500/30 transition-colors z-10"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startWidth = queueWidth;
                                const containerWidth = (e.target as HTMLElement).parentElement?.parentElement?.offsetWidth || window.innerWidth;

                                const onMouseMove = (e: MouseEvent) => {
                                    const delta = startX - e.clientY;
                                    const deltaPercent = ((startX - e.clientX) / containerWidth) * 100;
                                    const newWidth = Math.min(Math.max(startWidth + deltaPercent, 20), 60);
                                    setQueueWidth(newWidth);
                                };

                                const onMouseUp = () => {
                                    document.removeEventListener('mousemove', onMouseMove);
                                    document.removeEventListener('mouseup', onMouseUp);
                                };

                                document.addEventListener('mousemove', onMouseMove);
                                document.addEventListener('mouseup', onMouseUp);
                            }}
                        />

                        <TaskQueuePanel
                            workspaceId={workspaceId}
                            conversationId={conversationId || undefined}
                            taskConversationMap={taskConversationMap}
                            onJobClick={(jobId) => {
                                // Open logs panel if not already open
                                setShowLogs(true);

                                // Wait for ToolRun to exist in store (poll up to 2 seconds)
                                const pollForRun = async (attempts = 0) => {
                                    const synthesizedId = `job-${jobId}`;
                                    // Check for both direct ID (persisted run) and synthesized ID (from job sync)
                                    const run = toolLogStore.runs[jobId] || toolLogStore.runs[synthesizedId];

                                    if (run) {
                                        toolLogStore.setHighlightedRun(run.id);
                                    } else if (attempts < 5) {
                                        // Retry with backoff, and try reloading if we've waited a bit
                                        if (attempts === 2) {
                                            await toolLogStore.loadRuns(workspaceId, conversationId);
                                        }
                                        setTimeout(() => pollForRun(attempts + 1), 500);
                                    } else {
                                        console.warn('ToolRun not found after polling:', jobId);
                                        // Final attempt to load
                                        await toolLogStore.loadRuns(workspaceId, conversationId);

                                        if (toolLogStore.runs[jobId]) {
                                            toolLogStore.setHighlightedRun(jobId);
                                        } else {
                                            // Fallback: If run is strictly missing from ToolRuns API (e.g. legacy or failed creation),
                                            // try to fetch the JOB details and synthesize a local run so the user can see the logs.
                                            try {
                                                console.log('Fetching job details for fallback:', jobId);
                                                const job = await jobsService.get(jobId);
                                                if (job) {
                                                    const synthesizedRun = {
                                                        id: job.id,
                                                        tool: job.command.split(' ')[0], // Simple heuristic
                                                        command: job.command,
                                                        logs: [job.stdout || '', job.stderr || ''].filter(Boolean),
                                                        status: job.status as any,
                                                        startTime: new Date(job.created_at).getTime(),
                                                        workspaceId: job.workspace_id,
                                                        task_id: job.task_id
                                                    };
                                                    console.log('Synthesized run from job:', synthesizedRun);
                                                    toolLogStore.addRun(synthesizedRun);
                                                    toolLogStore.setHighlightedRun(jobId);
                                                }
                                            } catch (err) {
                                                console.error('Failed to fallback fetch job:', err);
                                            }
                                        }
                                    }
                                };
                                pollForRun();
                            }}
                        />
                    </div>
                )}

            </div>

            {/* Resizable Terminal Panel - Below Split View */}
            {showTerminal && (
                <div
                    className="flex flex-col border-t border-gray-800 bg-black relative"
                    style={{ height: `${terminalHeight}px` }}
                >
                    {/* Resize Handle */}
                    <div
                        className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize bg-transparent hover:bg-blue-500/30 transition-colors z-10"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const startY = e.clientY;
                            const startHeight = terminalHeight;

                            const onMouseMove = (e: MouseEvent) => {
                                const delta = startY - e.clientY;
                                const newHeight = Math.min(Math.max(startHeight + delta, 150), 600);
                                setTerminalHeight(newHeight);
                            };

                            const onMouseUp = () => {
                                document.removeEventListener('mousemove', onMouseMove);
                                document.removeEventListener('mouseup', onMouseUp);
                            };

                            document.addEventListener('mousemove', onMouseMove);
                            document.addEventListener('mouseup', onMouseUp);
                        }}
                    />
                    <TerminalComponent sessionId={workspaceId} workspaceId={workspaceId} />
                </div>
            )}

            {/* Input Area */}
            <footer className="p-4 border-t border-gray-800 bg-gray-950/90 backdrop-blur-sm z-30">
                <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl blur opacity-25 group-focus-within:opacity-100 transition duration-1000"></div>
                    <div className="relative flex items-center gap-3">
                        <div className="relative shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                                className="flex items-center gap-2 px-4 py-3.5 bg-gray-900 border border-gray-800 hover:bg-gray-800 rounded-xl transition-all text-sm font-medium text-gray-200 shadow-xl min-w-[110px]"
                                title="Select Mode"
                            >
                                {selectedMode === 'agent' ? <TerminalIcon className="w-4 h-4 text-blue-400" /> : selectedMode === 'planning' ? <Activity className="w-4 h-4 text-purple-400" /> : <Brain className="w-4 h-4 text-green-400" />}
                                <span>{selectedMode === 'agent' ? 'Agent' : selectedMode === 'planning' ? 'Plan' : 'Ask'}</span>
                                <ChevronDown className={clsx("w-3 h-3 opacity-50 ml-auto transition-transform", isModeDropdownOpen && "rotate-180")} />
                            </button>

                            {/* Custom Dropdown Menu */}
                            {isModeDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsModeDropdownOpen(false)} />
                                    <div className="absolute bottom-full mb-2 left-0 w-56 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 flex flex-col p-1">
                                        {[
                                            { id: 'agent', icon: TerminalIcon, label: 'Agent Mode', desc: 'Auto-execute tasks', color: 'text-blue-400', bg: 'group-hover:text-blue-400' },
                                            { id: 'planning', icon: Activity, label: 'Planning Mode', desc: 'Create detailed plans', color: 'text-purple-400', bg: 'group-hover:text-purple-400' },
                                            { id: 'ask', icon: Brain, label: 'Ask Mode', desc: 'Chat without tools', color: 'text-green-400', bg: 'group-hover:text-green-400' }
                                        ].map((mode) => (
                                            <button
                                                key={mode.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedMode(mode.id as any);
                                                    setIsModeDropdownOpen(false);
                                                }}
                                                className={clsx(
                                                    "group w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors",
                                                    selectedMode === mode.id ? "bg-gray-800" : "hover:bg-gray-800"
                                                )}
                                            >
                                                <div className={clsx("p-1.5 rounded-md bg-gray-950 border border-gray-800 group-hover:border-gray-700 transition-colors", selectedMode === mode.id ? "border-gray-700" : "")}>
                                                    <mode.icon className={clsx("w-4 h-4", mode.color)} />
                                                </div>
                                                <div>
                                                    <div className={clsx("text-sm font-medium text-gray-200 transition-colors", mode.bg)}>{mode.label}</div>
                                                    <div className="text-[10px] text-gray-500 leading-tight">{mode.desc}</div>
                                                </div>
                                                {selectedMode === mode.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex-1 relative">
                            {/* Slash Command Suggestions */}
                            {slashMatches.length > 0 && showSlashMenu && (
                                <div className="absolute bottom-full left-0 mb-3 w-full bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 ring-1 ring-white/10">
                                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#27272a] bg-[#27272a]/50">
                                        <span className="text-[10px] font-semibold text-gray-400 tracking-wider">SLASH COMMANDS</span>
                                        <span className="text-[10px] text-gray-500 font-mono">USE ↑↓ & ENTER</span>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto p-1">
                                        {slashMatches.map((tool, index) => (
                                            <button
                                                key={tool}
                                                ref={el => { suggestionRefs.current[index] = el }}
                                                type="button"
                                                onClick={() => {
                                                    setInput(`/${tool} `);
                                                }}
                                                className={clsx(
                                                    "w-full text-left px-3 py-2.5 text-sm flex items-center gap-3 rounded-lg transition-colors",
                                                    index === selectedSuggestionIndex ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-[#27272a]"
                                                )}
                                            >
                                                <div className={clsx("flex items-center justify-center w-5 h-5 rounded text-[10px] font-mono", index === selectedSuggestionIndex ? "bg-white/20" : "bg-gray-800 text-gray-400")}>
                                                    /
                                                </div>
                                                <span className="font-medium">{tool}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        if (slashMatches.length > 0) {
                                            handleKeyDown(e);
                                        } else {
                                            // Handle submit logic is via form onSubmit, so we just let it bubble or manual submit?
                                            // Input enter submits form by default.
                                            // But if we want to prevent default if slashMatch?
                                            // handleKeyDown calls preventDefault for slash selections.
                                            // For default enter, we don't need to do anything, form onSubmit handles it.
                                        }
                                    } else {
                                        handleKeyDown(e);
                                    }
                                }}
                                placeholder="输入渗透测试任务..."
                                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-5 pr-12 py-3.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-2xl"
                                disabled={loading}
                                autoFocus
                                autoComplete="off"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-[9px] text-gray-500 font-mono tracking-tighter">
                                ENTER
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="bg-blue-600 hover:bg-blue-500 text-white p-3.5 rounded-xl transition-all disabled:opacity-50 disabled:scale-95 shadow-xl shadow-blue-900/20 active:scale-95 flex items-center justify-center min-w-[50px]"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                    </div>
                </form>
            </footer>
        </div>
    );
}
