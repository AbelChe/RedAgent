import { create } from 'zustand';

interface TerminalState {
    socket: WebSocket | null;
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    sessionId: string | null;

    // Actions
    connect: (sessionId: string, workspaceId: string) => void;
    disconnect: () => void;
    sendInput: (data: string) => void;
    resize: (cols: number, rows: number) => void;

    // Stream Subscription
    // We use a simple callback array pattern for multiple listeners (Host + Cards)
    listeners: ((data: string) => void)[];
    subscribe: (callback: (data: string) => void) => () => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
    socket: null,
    status: 'disconnected',
    sessionId: null,
    listeners: [],

    connect: (sessionId: string, workspaceId: string) => {
        const { socket, status, sessionId: currentSessionId } = get();

        // Enhanced idempotency check:
        // 1. If already connected/connecting to the SAME session, skip
        // 2. If connected to a DIFFERENT session, disconnect first
        if (currentSessionId === sessionId && (status === 'connected' || status === 'connecting')) {
            console.log(`[TerminalStore] Already connected to session: ${sessionId}, skipping`);
            return;
        }

        // Disconnect old socket if connecting to a different session
        if (socket && currentSessionId !== sessionId) {
            console.log(`[TerminalStore] Disconnecting old session: ${currentSessionId}`);
            socket.close();
        }

        console.log(`[TerminalStore] Connecting to session: ${sessionId}`);
        set({ status: 'connecting', sessionId });

        const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const wsUrl = `ws://${hostname}:8000/terminal/ws/${sessionId}?workspaceId=${workspaceId}`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[TerminalStore] Connected');
            set({ status: 'connected', socket: ws });
            // Broadcast initial message
            get().listeners.forEach(cb => cb('\r\n\x1b[32m[Connected to RedAgent Terminal]\x1b[0m\r\n'));
        };

        ws.onmessage = (event) => {
            const data = event.data;
            // Broadcast to all listeners
            get().listeners.forEach(cb => cb(data));
        };

        ws.onclose = () => {
            console.log('[TerminalStore] Closed');
            set({ status: 'disconnected', socket: null });
            get().listeners.forEach(cb => cb('\r\n\x1b[31m[Connection Closed]\x1b[0m\r\n'));
        };

        ws.onerror = (err) => {
            console.error('[TerminalStore] Error', err);
            set({ status: 'error' });
        };
    },

    disconnect: () => {
        const { socket } = get();
        if (socket) {
            socket.close();
        }
        set({ socket: null, status: 'disconnected', sessionId: null });
    },

    sendInput: (data: string) => {
        const { socket, status } = get();
        if (socket && status === 'connected') {
            socket.send(JSON.stringify({ type: 'input', data }));
        }
    },

    resize: (cols: number, rows: number) => {
        const { socket, status } = get();
        if (socket && status === 'connected') {
            socket.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
    },

    subscribe: (callback: (data: string) => void) => {
        set(state => ({ listeners: [...state.listeners, callback] }));
        return () => {
            set(state => ({ listeners: state.listeners.filter(cb => cb !== callback) }));
        };
    }
}));
