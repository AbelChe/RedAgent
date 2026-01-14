'use client';

import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { useTerminalStore } from '../store/terminalStore';

interface TerminalProps {
    sessionId: string;
    workspaceId: string;
    readOnly?: boolean;
}

export default function TerminalComponent({ sessionId, workspaceId, readOnly = false }: TerminalProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    // Store Actions
    const connect = useTerminalStore(state => state.connect);
    const subscribe = useTerminalStore(state => state.subscribe);
    const sendInput = useTerminalStore(state => state.sendInput);
    const resize = useTerminalStore(state => state.resize);

    useEffect(() => {
        // Initialize Connection on Mount
        connect(sessionId, workspaceId);
    }, [sessionId, workspaceId, connect]);

    useEffect(() => {
        if (!terminalRef.current) return;
        if (termRef.current) return;

        let cleanupFn: (() => void) | null = null;
        let resizeObserver: ResizeObserver | null = null;

        // Delay initialization to ensure DOM is fully ready
        const initTimeout = setTimeout(() => {
            if (!terminalRef.current) return;

            console.log("Initializing Terminal View");

            const term = new Terminal({
                cursorBlink: !readOnly,
                disableStdin: readOnly,
                theme: {
                    background: '#09090b',
                    foreground: '#f4f4f5',
                },
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                fontSize: 13,
                lineHeight: 1.2,
                convertEol: true,
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            term.open(terminalRef.current);
            termRef.current = term;
            fitAddonRef.current = fitAddon;

            // Delay fit to ensure xterm internals are ready
            setTimeout(() => {
                if (terminalRef.current?.offsetWidth && fitAddonRef.current && termRef.current) {
                    try {
                        fitAddonRef.current.fit();
                        termRef.current.focus();
                        resize(termRef.current.cols, termRef.current.rows);
                    } catch (e) { /* ignore */ }
                }
            }, 50);

            const unsubscribe = subscribe((data) => {
                if (termRef.current) termRef.current.write(data);
            });

            // Handle Input (only if not readOnly)
            if (!readOnly) {
                term.onData(data => sendInput(data));
            }

            resizeObserver = new ResizeObserver(() => {
                if (fitAddonRef.current && termRef.current && terminalRef.current?.offsetWidth) {
                    try {
                        fitAddonRef.current.fit();
                        resize(termRef.current.cols, termRef.current.rows);
                    } catch (e) { /* ignore */ }
                }
            });
            resizeObserver.observe(terminalRef.current);

            cleanupFn = () => {
                console.log("Unmounting Terminal View (Connection preserved in store)");
                resizeObserver?.disconnect();
                unsubscribe();
            };
        }, 100);

        return () => {
            clearTimeout(initTimeout);
            cleanupFn?.();
            if (termRef.current) {
                termRef.current.dispose();
                termRef.current = null;
            }
        };
    }, [readOnly, subscribe, sendInput, resize]);

    return (
        <div className="w-full h-full bg-black/90 p-2 rounded-lg border border-gray-800 shadow-inner overflow-hidden" ref={terminalRef} />
    );
}
