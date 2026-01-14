'use client';

import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { useTerminalStore } from '../store/terminalStore';
import { SquareTerminal, Maximize2 } from 'lucide-react';

export default function LiveCommandCard() {
    const terminalRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    // Subscribe only
    const subscribe = useTerminalStore(state => state.subscribe);

    useEffect(() => {
        if (!terminalRef.current) return;
        if (termRef.current) return;

        let cleanupFn: (() => void) | null = null;
        let resizeObserver: ResizeObserver | null = null;

        // Delay initialization to ensure DOM is fully ready
        const initTimeout = setTimeout(() => {
            if (!terminalRef.current) return;

            const term = new Terminal({
                cursorBlink: false,
                disableStdin: true,
                theme: {
                    background: '#18181b',
                    foreground: '#a1a1aa',
                    cursor: 'transparent'
                },
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                fontSize: 11,
                lineHeight: 1.3,
                convertEol: true,
                rows: 12,
                cols: 80
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            term.open(terminalRef.current);
            termRef.current = term;
            fitAddonRef.current = fitAddon;

            // Delay fit to ensure xterm internals are ready
            setTimeout(() => {
                if (terminalRef.current?.offsetWidth && fitAddonRef.current) {
                    try { fitAddonRef.current.fit(); } catch (e) { /* ignore */ }
                }
            }, 50);

            const unsubscribe = subscribe((data) => {
                if (termRef.current) termRef.current.write(data);
            });

            resizeObserver = new ResizeObserver(() => {
                if (fitAddonRef.current && terminalRef.current?.offsetWidth) {
                    try { fitAddonRef.current.fit(); } catch (e) { /* ignore */ }
                }
            });
            resizeObserver.observe(terminalRef.current);

            cleanupFn = () => {
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
    }, [subscribe]);

    return (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 overflow-hidden my-4 shadow-sm">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 bg-gray-900/80">
                <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                    <SquareTerminal className="w-3 h-3" />
                    Live Output
                </div>
            </div>
            <div className="p-2 bg-[#18181b]">
                <div ref={terminalRef} className="h-[200px] w-full" />
            </div>
        </div>
    );
}
