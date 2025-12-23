'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { taskService, workspaceService } from '@/services/api';
import { Task, Workspace } from '@/types';
import { Send, Terminal, Loader2, Play, AlertTriangle, CheckCircle, XCircle, ShieldAlert, Brain, ChevronDown, Sparkles, Activity, Code, Copy } from 'lucide-react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function WorkspacePage() {
    const params = useParams();
    const workspaceId = params.id as string;
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [input, setInput] = useState('');
    const [selectedMode, setSelectedMode] = useState<'ask' | 'planning' | 'agent'>('agent');
    const [loading, setLoading] = useState(false);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [connectionKey, setConnectionKey] = useState(0);
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

    // SSE Integration with Semantic Buffering
    useEffect(() => {
        if (!workspaceId) return;

        // Fetch initial state
        workspaceService.get(workspaceId).then(setWorkspace).catch(console.error);
        workspaceService.listTasks(workspaceId).then(fetchedTasks => {
            setTasks(fetchedTasks);
            setTasksLoading(false);
        }).catch(console.error);


        // CRITICAL: Connect DIRECTLY to backend for SSE, bypassing Next.js proxy
        // Next.js proxy buffers responses and breaks SSE streaming
        const sseUrl = `http://localhost:8000/workspaces/${workspaceId}/stream`;

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
                    const idx = updated.findIndex(t => t.id === taskId);

                    if (data.type === 'task_update') {
                        if (idx === -1) return; // Or push if new (logic omitted for simplicity)
                        updated[idx] = { ...updated[idx], status: data.status, result: data.result };
                        hasChanges = true;
                    }
                    else if (data.type === 'agent_state_update') {
                        if (idx === -1) return;
                        const current = updated[idx];

                        // Smart merge logic
                        updated[idx] = {
                            ...current,
                            status: data.state_summary.status ? data.state_summary.status.replace('executing_', '') : 'running',
                            thinking: data.state_summary.thinking || current.thinking,
                            result: data.state_summary.content
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
                if (data.type === 'task_update' || data.type === 'agent_state_update') {
                    // Just push to buffer
                    pendingUpdates.set(data.task_id || data.data?.task_id, data);
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
            const newTask = await taskService.create(workspaceId, input, selectedMode);
            setTasks(prev => [...prev, newTask]);
            setInput('');
            await taskService.run(newTask.id);
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

    const ThinkingProcess = ({ content, isRunning }: { content?: string, isRunning?: boolean }) => {
        const [isExpanded, setIsExpanded] = useState(true);
        const [startTime] = useState<number>(Date.now());
        const [duration, setDuration] = useState<number>(0);
        const contentRef = useRef<HTMLDivElement>(null);

        // Auto collapse when done
        useEffect(() => {
            if (!isRunning && content) {
                const timeout = setTimeout(() => setIsExpanded(false), 2000);
                return () => clearTimeout(timeout);
            } else if (isRunning) {
                setIsExpanded(true);
            }
        }, [isRunning, content]);

        // Timer effect
        useEffect(() => {
            if (isRunning) {
                const interval = setInterval(() => {
                    setDuration(Math.floor((Date.now() - startTime) / 1000));
                }, 1000);
                return () => clearInterval(interval);
            }
        }, [isRunning, startTime]);

        // Auto-scroll thinking content to bottom when streaming
        useEffect(() => {
            if (isRunning && contentRef.current && content) {
                contentRef.current.scrollTop = contentRef.current.scrollHeight;
            }
        }, [content, isRunning]);

        if (!content) return null;

        return (
            <div className="bg-gray-800/20 border border-gray-800 rounded-xl overflow-hidden mb-4 shadow-sm group/think transition-all duration-300">
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-800/40 transition-colors text-xs font-semibold"
                >
                    <div className="flex items-center gap-2.5 uppercase tracking-widest text-[9px]">
                        <div className={clsx(
                            "w-1.5 h-1.5 rounded-full",
                            isRunning ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-gray-600"
                        )} />
                        <Brain className={clsx("w-3.5 h-3.5", isRunning ? "text-blue-400" : "text-gray-500")} />
                        <span className={isRunning ? "text-blue-400" : "text-gray-500"}>
                            {isRunning ? "思考中..." : "思维链"}
                        </span>
                        {isRunning && (
                            <span className="text-gray-600 font-mono ml-2">
                                {String(Math.floor(duration / 60)).padStart(2, '0')}:{String(duration % 60).padStart(2, '0')}
                            </span>
                        )}
                    </div>
                    <ChevronDown className={clsx("w-3.5 h-3.5 text-gray-600 transition-transform duration-500", isExpanded && "rotate-180")} />
                </button>
                {isExpanded && (
                    <div
                        ref={contentRef}
                        className="px-5 py-4 border-t border-gray-800/50 text-xs text-gray-400 leading-relaxed bg-gray-900/40 max-h-80 overflow-y-auto custom-scrollbar"
                    >
                        <div className={clsx("prose prose-invert prose-sm max-w-none font-sans text-gray-300/90 leading-7", isRunning && "animate-in fade-in duration-300")}>
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                    code: ({ className, children }) => <code className={clsx("bg-gray-800/50 px-1 py-0.5 rounded text-blue-300 font-mono not-italic text-[10px]", className)}>{children}</code>,
                                    pre: ({ children }) => <pre className="bg-gray-950/50 p-2 rounded-lg border border-gray-800/50 overflow-x-auto my-2 not-italic">{children}</pre>
                                }}
                            >
                                {content}
                            </ReactMarkdown>
                            {isRunning && <span className="inline-block w-2 h-4 ml-1 align-middle bg-blue-400 animate-pulse" />}
                        </div>
                    </div>
                )}
            </div>
        );
    };


    const CommandAudit = ({ logs }: { logs?: any[] }) => {
        if (!logs || logs.length === 0) return null;

        return (
            <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 text-[9px] font-bold text-gray-500 uppercase tracking-widest px-1">
                    <Activity className="w-3 h-3" />
                    <span>命令执行审计</span>
                </div>
                {logs.map((log, i) => (
                    <div key={i} className="bg-black/30 border border-gray-800 rounded-lg overflow-hidden font-mono text-[11px]">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900/30 border-b border-gray-800/50">
                            <div className="flex items-center gap-2">
                                <Code className="w-3 h-3 text-blue-400 shrink-0" />
                                <span className="text-gray-300 font-mono text-[10px] break-all">{log.command}</span>
                            </div>
                            <span className={clsx(
                                "px-1.5 py-0.5 rounded text-[9px] font-bold",
                                log.exit_code === 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                            )}>
                                EXIT {log.exit_code}
                            </span>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar bg-black/50 border-t border-gray-800/50">
                            {log.stdout && (
                                <SyntaxHighlighter
                                    style={vscDarkPlus}
                                    language="bash"
                                    PreTag="div"
                                    customStyle={{ margin: 0, padding: '12px', background: 'transparent', fontSize: '11px', lineHeight: '1.5' }}
                                    showLineNumbers={true}
                                    wrapLines={true}
                                >
                                    {log.stdout.replace(/\n$/, '')}
                                </SyntaxHighlighter>
                            )}
                            {log.stderr && (
                                <div className="border-t border-red-500/10">
                                    <div className="px-3 py-1 text-[9px] font-bold text-red-400 bg-red-500/5 uppercase tracking-widest border-b border-red-500/10">Error Output</div>
                                    <SyntaxHighlighter
                                        style={vscDarkPlus}
                                        language="bash"
                                        PreTag="div"
                                        customStyle={{ margin: 0, padding: '12px', background: 'rgba(255, 0, 0, 0.02)', fontSize: '11px' }}
                                        showLineNumbers={true}
                                        wrapLines={true}
                                    >
                                        {log.stderr.replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // Markdown Components for professional rendering
    const MarkdownContent = ({ content }: { content: string }) => {
        return (
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                            <div className="relative group/code my-4">
                                <div className="absolute right-2 top-2 z-10 opacity-0 group-hover/code:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => navigator.clipboard.writeText(String(children).replace(/\n$/, ''))}
                                        className="p-1 px-2 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 flex items-center gap-1 border border-gray-700"
                                    >
                                        <Copy className="w-3 h-3" /> Copy
                                    </button>
                                </div>
                                <SyntaxHighlighter
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                    className="rounded-lg !bg-gray-950 !border !border-gray-800 !m-0"
                                    showLineNumbers={true}
                                    wrapLines={true}
                                    {...props}
                                >
                                    {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                            </div>
                        ) : (
                            <code className={clsx("bg-gray-800 px-1.5 py-0.5 rounded text-blue-300 font-mono", className)} {...props}>
                                {children}
                            </code>
                        );
                    },
                    table({ children }) {
                        return (
                            <div className="overflow-x-auto my-4 rounded-lg border border-gray-800">
                                <table className="w-full text-left border-collapse">
                                    {children}
                                </table>
                            </div>
                        );
                    },
                    thead({ children }) {
                        return <thead className="bg-gray-800/50">{children}</thead>;
                    },
                    th({ children }) {
                        return <th className="px-4 py-2 border-b border-gray-800 font-bold text-gray-200">{children}</th>;
                    },
                    td({ children }) {
                        return <td className="px-4 py-2 border-b border-gray-800 text-gray-400">{children}</td>;
                    },
                    p({ children }) {
                        return <p className="mb-4 last:mb-0 leading-relaxed text-gray-300">{children}</p>;
                    },
                    a({ children, href }) {
                        return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{children}</a>;
                    }
                }}
            >
                {content}
            </ReactMarkdown>
        );
    };

    return (
        <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-500/30">
            {/* Header */}
            <header className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-950/80 backdrop-blur-md z-10 sticky top-0">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600/20 p-1.5 rounded-lg border border-blue-500/30">
                        <Terminal className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="font-semibold text-base leading-tight">{workspace?.name || '正在加载环境...'}</h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                                {workspace?.mode || '代理'} 模式 · 活跃会话
                            </span>
                        </div>
                    </div>
                </div>
                <div className="text-gray-600 text-[10px] font-mono select-all">SID: {workspaceId.slice(0, 8)}...</div>
            </header>

            {/* Main Content (Chat/Task Stream) */}
            <main
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 scroll-smooth custom-scrollbar"
            >
                {tasks.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-6">
                        <div className="relative">
                            <div className="absolute -inset-4 bg-blue-500/5 blur-2xl rounded-full"></div>
                            <Terminal className="w-20 h-20 relative opacity-20" />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-sm font-medium">已就绪，请输入渗透测试指令。</p>
                            <p className="text-xs opacity-50">例如：扫描目标 192.168.1.1 的开放端口并分析风险</p>
                        </div>
                    </div>
                )}

                {tasks.map((task) => (
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

                                {/* Content */}
                                <div className="text-sm">
                                    {(() => {
                                        const rawContent = (task.result as any)?.final_message || (typeof task.result === 'string' ? task.result : '');
                                        let displayThinking = task.thinking || (task.result as any)?.thinking || '';
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
                                                <ThinkingProcess
                                                    content={displayThinking}
                                                    isRunning={task.status === 'running'}
                                                />

                                                {task.status === 'waiting_approval' && (
                                                    <div className="bg-amber-950/20 border border-amber-700/30 rounded-xl p-5 my-4">
                                                        <div className="flex items-start gap-4">
                                                            <div className="bg-amber-500/20 p-2 rounded-lg">
                                                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                                            </div>
                                                            <div className="space-y-3 flex-1">
                                                                <h3 className="text-amber-500 font-bold text-sm">拦截到高风险命令</h3>
                                                                <p className="text-gray-400 text-xs">代理尝试执行一个可能对系统稳定性或安全造成影响的指令：</p>
                                                                <code className="block bg-black/40 p-3 rounded-lg text-red-400 text-[11px] font-mono border border-red-900/20 break-all">
                                                                    {(task.result as any)?.pending_command || '未知命令'}
                                                                </code>
                                                                <div className="flex gap-3 pt-2">
                                                                    <button
                                                                        onClick={() => handleApprove(task.id)}
                                                                        className="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-green-900/20"
                                                                    >
                                                                        核准执行
                                                                    </button>
                                                                    <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-5 py-2 rounded-lg text-xs font-bold border border-gray-700 transition-all">
                                                                        拒绝
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                <CommandAudit logs={(task.result as any)?.audit_logs} />

                                                {(task.status === 'completed' || displayContent) && (
                                                    <div className="mt-4 pt-4 border-t border-gray-800/50">
                                                        <MarkdownContent content={displayContent || JSON.stringify(task.result, null, 2)} />
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}

                                    {task.status === 'running' && !task.thinking && (
                                        <div className="flex items-center gap-3 text-gray-500 text-xs italic">
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

            {/* Input Area */}
            <footer className="p-4 md:p-6 border-t border-gray-800 bg-gray-950/80 backdrop-blur-md sticky bottom-0">
                <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl blur opacity-25 group-focus-within:opacity-100 transition duration-1000"></div>
                    <div className="relative flex items-center gap-3">
                        <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 shrink-0">
                            {[
                                { id: 'ask', icon: Brain, label: 'Ask' },
                                { id: 'planning', icon: Activity, label: 'Plan' },
                                { id: 'agent', icon: Terminal, label: 'Agent' }
                            ].map((mode) => (
                                <button
                                    key={mode.id}
                                    type="button"
                                    onClick={() => setSelectedMode(mode.id as any)}
                                    className={clsx(
                                        "p-2 rounded-lg transition-all flex items-center gap-2",
                                        selectedMode === mode.id
                                            ? "bg-blue-600 text-white shadow-lg"
                                            : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                                    )}
                                    title={`${mode.label} Mode`}
                                >
                                    <mode.icon className="w-4 h-4" />
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="输入渗透测试任务..."
                                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-5 pr-12 py-3.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-2xl"
                                disabled={loading}
                                autoFocus
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
                <div className="max-w-4xl mx-auto mt-3 flex justify-center gap-4">
                    <button className="text-[10px] text-gray-600 hover:text-blue-400 transition-colors uppercase tracking-widest font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" />
                        快速探测
                    </button>
                    <button className="text-[10px] text-gray-600 hover:text-blue-400 transition-colors uppercase tracking-widest font-bold flex items-center gap-1.5">
                        <ShieldAlert className="w-3 h-3" />
                        漏洞分析
                    </button>
                </div>
            </footer>

            {/* Global Styles for Scrollbar */}
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1f2937;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #374151;
                }
            `}</style>
        </div>
    );
}
