'use client';

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastStore {
    toasts: Toast[];
    addToast: (message: string, type: ToastType) => void;
    removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
    toasts: [],
    addToast: (message: string, type: ToastType) => {
        const id = Math.random().toString(36).substring(7);
        set((state) => ({
            toasts: [...state.toasts, { id, message, type }]
        }));
        // Auto remove after 3 seconds
        setTimeout(() => {
            set((state) => ({
                toasts: state.toasts.filter((t) => t.id !== id)
            }));
        }, 3000);
    },
    removeToast: (id: string) => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id)
        }));
    }
}));
