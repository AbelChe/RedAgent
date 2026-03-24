'use client';

import { useToastStore } from '@/store/toastStore';
import { X, CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

export default function ToastContainer() {
    const { toasts, removeToast } = useToastStore();

    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
            ))}
        </div>
    );
}

function Toast({ toast, onClose }: { toast: any; onClose: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const icons = {
        success: <CheckCircle className="w-5 h-5 text-green-400" />,
        error: <XCircle className="w-5 h-5 text-red-400" />,
        info: <Info className="w-5 h-5 text-blue-400" />,
        warning: <AlertTriangle className="w-5 h-5 text-yellow-400" />
    };

    const bgColors = {
        success: 'bg-green-500/10 border-green-500/20',
        error: 'bg-red-500/10 border-red-500/20',
        info: 'bg-blue-500/10 border-blue-500/20',
        warning: 'bg-yellow-500/10 border-yellow-500/20'
    };

    return (
        <div
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-xl shadow-lg animate-slide-in-right ${bgColors[toast.type as keyof typeof bgColors]}`}
            style={{ minWidth: '300px', maxWidth: '400px' }}
        >
            {icons[toast.type as keyof typeof icons]}
            <p className="flex-1 text-sm text-white font-medium">{toast.message}</p>
            <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
