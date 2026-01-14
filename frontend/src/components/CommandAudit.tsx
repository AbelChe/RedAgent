import { Activity } from 'lucide-react';
import clsx from 'clsx';

interface CommandAuditProps {
    logs?: any[];
}

export const CommandAudit = ({ logs }: CommandAuditProps) => {
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
                        <span className="text-blue-400 font-mono text-[10px] break-all">{log.command}</span>
                        <span className={clsx("px-1.5 py-0.5 rounded text-[9px] font-bold", log.exit_code === 0 ? "text-green-500" : "text-red-500")}>EXIT {log.exit_code}</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar bg-black/50 p-3">
                        {log.stdout && <div className="text-gray-300 whitespace-pre-wrap">{log.stdout}</div>}
                        {log.stderr && <div className="text-red-400 whitespace-pre-wrap mt-2">{log.stderr}</div>}
                    </div>
                </div>
            ))}
        </div>
    );
};
