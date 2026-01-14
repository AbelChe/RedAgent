import { create } from 'zustand';
import { toolRunService, ToolRunData } from '@/services/api';

export interface ToolRun {
    id: string;           // UUID from MCP
    tool: string;         // Tool name (nmap, curl, etc.)
    command: string;      // Full command string
    logs: string[];       // Log entries
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    startTime: number;
    workspaceId: string;  // Added for isolation
    task_id?: string;     // Task ID for conversation filtering
    task?: { conversation_id?: string | null };  // For conversation filtering
}

interface ToolLogStore {
    // Flat map of runs keyed by UUID - prevents duplicates
    runs: Record<string, ToolRun>;

    // Active selection
    activeRunId: string | null;
    highlightedRunId: string | null;  // For flow graph click highlighting

    // Loading state
    isLoading: boolean;

    // Actions
    loadRuns: (workspaceId: string, conversationId?: string) => Promise<void>;
    addRun: (run: ToolRun) => void;
    startRun: (runId: string, tool: string, command: string, workspaceId: string, taskId?: string) => void;
    appendLog: (runId: string, data: string) => void;
    completeRun: (runId: string, status?: 'completed' | 'failed' | 'cancelled') => void;
    setActiveRun: (runId: string) => void;
    setHighlightedRun: (runId: string | null) => void;
    clear: (workspaceId?: string) => Promise<void>;

    // Selectors
    getRunsByTool: (tool: string, workspaceId: string) => ToolRun[];
    getAllRuns: (workspaceId: string) => ToolRun[];
}

export const useToolLogStore = create<ToolLogStore>()((set, get) => ({
    runs: {},
    activeRunId: null,
    highlightedRunId: null,
    isLoading: false,

    loadRuns: async (workspaceId: string, conversationId?: string) => {
        set({ isLoading: true });
        try {
            const runsFromApi = await toolRunService.list(workspaceId, conversationId);
            const runsMap: Record<string, ToolRun> = {};

            // Merge with existing runs (preserve real-time updates)
            const existingRuns = get().runs;
            Object.values(existingRuns).forEach(run => {
                if (run.workspaceId === workspaceId) {
                    runsMap[run.id] = run;
                }
            });

            // Apply API data (may override with persisted data)
            runsFromApi.forEach((run: ToolRunData) => {
                // Only override if not currently running (preserve real-time state)
                if (!runsMap[run.id] || runsMap[run.id].status !== 'running') {
                    runsMap[run.id] = {
                        id: run.id,
                        tool: run.tool,
                        command: run.command,
                        logs: run.logs,
                        status: run.status as 'running' | 'completed' | 'failed',
                        startTime: run.startTime,
                        workspaceId: run.workspaceId,
                        task_id: run.task_id
                    };
                }
            });

            set((state) => ({
                runs: { ...state.runs, ...runsMap },
                isLoading: false
            }));
        } catch (error) {
            console.error('Failed to load tool runs:', error);
            set({ isLoading: false });
        }
    },

    startRun: (runId, tool, command, workspaceId, taskId) => set((state) => {
        // Skip if run already exists (deduplication)
        if (state.runs[runId]) {
            return state;
        }

        console.log(`[ToolLogStore] Starting run: ${runId} (${tool}) for ws ${workspaceId}, task ${taskId}`);

        return {
            runs: {
                ...state.runs,
                [runId]: {
                    id: runId,
                    tool,
                    command,
                    logs: [],
                    status: 'running',
                    startTime: Date.now(),
                    workspaceId,
                    task_id: taskId
                }
            },
            activeRunId: runId
        };
    }),

    addRun: (run: ToolRun) => set((state) => ({
        runs: {
            ...state.runs,
            [run.id]: run
        }
    })),

    appendLog: (runId, data) => set((state) => {
        const run = state.runs[runId];
        if (!run) {
            return state;
        }

        return {
            runs: {
                ...state.runs,
                [runId]: {
                    ...run,
                    logs: [...run.logs, data]
                }
            }
        };
    }),

    completeRun: (runId, status = 'completed') => set((state) => {
        const run = state.runs[runId];
        if (!run) return state;

        return {
            runs: {
                ...state.runs,
                [runId]: { ...run, status }
            }
        };
    }),

    setActiveRun: (runId) => set({ activeRunId: runId }),

    setHighlightedRun: (runId) => set({ highlightedRunId: runId }),

    clear: async (workspaceId?: string) => {
        if (workspaceId) {
            try {
                await toolRunService.clear(workspaceId);
            } catch (error) {
                console.error('Failed to clear tool runs from server:', error);
            }
        }
        set((state) => {
            if (workspaceId) {
                // Clear only runs for this workspace
                const filteredRuns: Record<string, ToolRun> = {};
                Object.values(state.runs).forEach(run => {
                    if (run.workspaceId !== workspaceId) {
                        filteredRuns[run.id] = run;
                    }
                });
                return { runs: filteredRuns, activeRunId: null, highlightedRunId: null };
            }
            return { runs: {}, activeRunId: null, highlightedRunId: null };
        });
    },

    // Selectors
    getRunsByTool: (tool, workspaceId) => {
        const runs = get().runs;
        return Object.values(runs)
            .filter(r => r.tool === tool && r.workspaceId === workspaceId)
            .sort((a, b) => a.startTime - b.startTime);
    },

    getAllRuns: (workspaceId) => {
        return Object.values(get().runs)
            .filter(r => r.workspaceId === workspaceId)
            .sort((a, b) => a.startTime - b.startTime);
    }
}));

