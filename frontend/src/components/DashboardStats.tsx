import { Activity, Box, Zap, Clock } from 'lucide-react';
import { Workspace } from '@/types';

interface DashboardStatsProps {
    workspaces: Workspace[];
}

export function DashboardStats({ workspaces }: DashboardStatsProps) {
    // Calculate stats
    const totalWorkspaces = workspaces.length;
    const activeTasks = workspaces.reduce((acc, ws) => acc + (ws.stats?.task_count || 0), 0);
    const totalTools = workspaces.reduce((acc, ws) => acc + (ws.stats?.tool_run_count || 0), 0);
    const planningMode = workspaces.filter(w => w.mode === 'planning').length;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="relative overflow-hidden bg-gray-900/50 border border-gray-800 p-5 rounded-2xl group hover:border-blue-500/30 transition-all">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Box className="w-16 h-16 text-blue-500 -rotate-12 translate-x-4 -translate-y-4" />
                </div>
                <div className="flex flex-col relative z-10">
                    <span className="text-gray-400 text-sm font-medium mb-1">Total Workspaces</span>
                    <span className="text-3xl font-bold text-white mb-2">{totalWorkspaces}</span>
                    <div className="h-1 w-12 bg-blue-500/50 rounded-full" />
                </div>
            </div>

            <div className="relative overflow-hidden bg-gray-900/50 border border-gray-800 p-5 rounded-2xl group hover:border-purple-500/30 transition-all">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Activity className="w-16 h-16 text-purple-500 -rotate-12 translate-x-4 -translate-y-4" />
                </div>
                <div className="flex flex-col relative z-10">
                    <span className="text-gray-400 text-sm font-medium mb-1">Active Tasks</span>
                    <span className="text-3xl font-bold text-white mb-2">{activeTasks}</span>
                    <div className="h-1 w-12 bg-purple-500/50 rounded-full" />
                </div>
            </div>

            <div className="relative overflow-hidden bg-gray-900/50 border border-gray-800 p-5 rounded-2xl group hover:border-green-500/30 transition-all">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Zap className="w-16 h-16 text-green-500 -rotate-12 translate-x-4 -translate-y-4" />
                </div>
                <div className="flex flex-col relative z-10">
                    <span className="text-gray-400 text-sm font-medium mb-1">Tool Executions</span>
                    <span className="text-3xl font-bold text-white mb-2">{totalTools}</span>
                    <div className="h-1 w-12 bg-green-500/50 rounded-full" />
                </div>
            </div>

            <div className="relative overflow-hidden bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-gray-800 p-5 rounded-2xl group hover:border-indigo-500/30 transition-all">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Clock className="w-16 h-16 text-indigo-400 -rotate-12 translate-x-4 -translate-y-4" />
                </div>
                <div className="flex flex-col relative z-10">
                    <span className="text-indigo-300 text-sm font-medium mb-1">Planning Mode</span>
                    <span className="text-3xl font-bold text-white mb-2">{planningMode}</span>
                    <div className="h-1 w-12 bg-indigo-500/50 rounded-full" />
                </div>
            </div>
        </div>
    );
}
