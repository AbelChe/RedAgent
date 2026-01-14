import { useState, useEffect, useRef, useMemo } from 'react';
import { Brain, ChevronDown, Sparkles } from 'lucide-react';
import clsx from 'clsx';

interface ThinkingProcessProps {
    content?: string;
    isRunning?: boolean;
}

export const ThinkingProcess = ({ content, isRunning }: ThinkingProcessProps) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const isAtBottomRef = useRef(true); // Default to true to scroll on first load

    // Handle user scroll to detect if they want to stick to bottom
    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        // Check if user is near bottom (within 50px)
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
        isAtBottomRef.current = isNearBottom;
    };

    // Auto-scroll to bottom of thinking process when running, ONLY if user was already at bottom
    useEffect(() => {
        if (isRunning && isExpanded && scrollRef.current) {
            // We use a ref to track "intent" because after render, scrollHeight is already updated.
            // But if we trust our handleScroll, isAtBottomRef tells us if we SHOULD scroll.
            if (isAtBottomRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }
    }, [content, isRunning, isExpanded]);

    const parsedBlocks = useMemo(() => {
        if (!content) return [];

        // 1. Split by Markdown headers, Bold titles, or Numbered Lists
        const regex = /(?:^|\n)(?:(#{1,4})\s+(.+?)|(?:\*\*(.+?)\*\*)|(?:Step\s+(\d+))|(?:\d+\.\s+(.{1,60})))(?:\s*[:\n]|$)/g;

        const blocks: { title: string, content: string }[] = [];
        let lastIndex = 0;
        let match;

        // Default initial block (Summary/Intro)
        while ((match = regex.exec(content)) !== null) {
            // Content BEFORE this header is the previous block's body
            const preContent = content.substring(lastIndex, match.index).trim();

            if (blocks.length === 0) {
                // First chunk of text before any header
                if (preContent) {
                    blocks.push({ title: "Thinking Process", content: preContent });
                }
            } else if (preContent) {
                // Append content to previous block
                blocks[blocks.length - 1].content = preContent;
            }

            // Create New Block from Header
            let title = match[2] || match[3] || match[5];
            if (!title && match[4]) title = `Step ${match[4]}`;
            if (!title) title = "Next Step";

            blocks.push({ title: title.trim(), content: "" });

            lastIndex = regex.lastIndex;
        }

        // Capture remaining content/tail
        const tail = content.substring(lastIndex).trim();
        if (blocks.length > 0) {
            blocks[blocks.length - 1].content = tail;
        } else if (tail) {
            blocks.push({ title: "Thinking Process", content: tail });
        }

        // Filter empty blocks just in case
        return blocks.filter(b => b.content || (isRunning && b === blocks[blocks.length - 1]));
    }, [content, isRunning]);

    if (!content) return null;

    return (
        <div className="bg-gray-800/20 border border-gray-800 rounded-xl overflow-hidden mb-4 shadow-sm">
            {/* Main Collapsible Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-gray-500 hover:bg-gray-800/40 bg-gray-900/30 border-b border-gray-800/50 transition-colors"
            >
                <Brain className={clsx("w-3.5 h-3.5", isRunning && "animate-pulse text-blue-400")} />
                <span className="uppercase tracking-wide opacity-80">Reasoning Chain</span>
                {isRunning && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-mono animate-pulse">THINKING</span>}
                <div className="flex-1" />
                <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform opacity-50", !isExpanded && "rotate-180")} />
            </button>

            {isExpanded && (
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="max-h-[500px] overflow-y-auto custom-scrollbar bg-gray-900/20 p-2 space-y-2"
                >
                    {parsedBlocks.map((block, idx) => (
                        <ThinkingBlock
                            key={idx}
                            title={block.title}
                            content={block.content}
                            defaultOpen={idx === parsedBlocks.length - 1} // Auto-open last block
                            isRunning={isRunning && idx === parsedBlocks.length - 1}
                        />
                    ))}
                    {parsedBlocks.length === 0 && isRunning && (
                        <div className="p-4 text-xs text-gray-500 italic flex items-center gap-2">
                            <Sparkles className="w-3 h-3 animate-pulse" />
                            Analyzing request...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Sub-component for individual thinking steps
const ThinkingBlock = ({ title, content, defaultOpen, isRunning }: { title: string, content: string, defaultOpen: boolean, isRunning?: boolean }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    // Auto-open if running and content grows
    useEffect(() => {
        if (isRunning) setIsOpen(true);
    }, [isRunning, content.length]);

    return (
        <div className="rounded-lg border border-gray-800/50 bg-black/20 overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
            >
                <div className={clsx(
                    "w-1 h-1 rounded-full",
                    isRunning ? "bg-blue-400 animate-pulse" : "bg-gray-600"
                )} />
                <span className="text-xs font-bold text-gray-400 flex-1 truncate">{title}</span>
                <ChevronDown className={clsx("w-3 h-3 text-gray-600 transition-transform duration-200", !isOpen && "-rotate-90")} />
            </button>

            {isOpen && (
                <div className="px-3 pb-3 pt-1">
                    <div className="text-[11px] leading-relaxed text-gray-400 font-mono whitespace-pre-wrap border-l-2 border-gray-800 pl-3 ml-0.5">
                        {content || (isRunning ? <span className="animate-pulse opacity-50">Thinking...</span> : <span className="italic opacity-30">Empty step</span>)}
                    </div>
                </div>
            )}
        </div>
    );
};
