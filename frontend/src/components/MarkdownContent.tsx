import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownContentProps {
    content: string;
}

export const MarkdownContent = ({ content }: MarkdownContentProps) => {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed text-gray-300 text-[13px]">{children}</p>,
                h1: ({ children }) => <h1 className="text-xl font-bold text-white mt-6 mb-4 pb-2 border-b border-gray-800">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-bold text-gray-100 mt-5 mb-3 pb-1 border-b border-gray-800/50">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold text-gray-200 mt-4 mb-2">{children}</h3>,
                h4: ({ children }) => <h4 className="text-sm font-semibold text-gray-300 mt-3 mb-2">{children}</h4>,
                ul: ({ children }) => <ul className="list-disc list-outside mb-4 space-y-1 text-gray-300 ml-4 pl-1 marker:text-gray-500">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-outside mb-4 space-y-1 text-gray-300 ml-4 pl-1 marker:text-gray-500">{children}</ol>,
                li: ({ children }) => <li className="text-[13px] leading-relaxed">{children}</li>,
                blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-gray-700 pl-4 py-1 my-4 bg-gray-900/30 rounded-r text-gray-400 italic text-sm">
                        {children}
                    </blockquote>
                ),
                a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                        {children}
                    </a>
                ),
                table: ({ children }) => (
                    <div className="my-4 overflow-x-auto custom-scrollbar rounded-lg border border-gray-800">
                        <table className="w-full text-left text-sm border-collapse">{children}</table>
                    </div>
                ),
                thead: ({ children }) => <thead className="bg-gray-900/80 text-gray-400 font-medium">{children}</thead>,
                tbody: ({ children }) => <tbody className="divide-y divide-gray-800/50 bg-black/20">{children}</tbody>,
                tr: ({ children }) => <tr className="hover:bg-white/5 transition-colors">{children}</tr>,
                th: ({ children }) => <th className="px-4 py-3 font-semibold border-b border-gray-800 whitespace-nowrap text-xs uppercase tracking-wider">{children}</th>,
                td: ({ children }) => <td className="px-4 py-2.5 text-gray-300 border-b border-gray-800/30 text-[13px] whitespace-nowrap">{children}</td>,
                code: ({ inline, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                        <div className="my-4 rounded-lg overflow-hidden border border-gray-800">
                            {/* Wrapper div controls the scrollbar exclusively */}
                            <div className="overflow-x-auto custom-scrollbar p-0">
                                <SyntaxHighlighter
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{ margin: 0, background: '#0f1117', overflow: 'hidden' }} // Disable inner scroll
                                    codeTagProps={{ style: { fontFamily: 'inherit' } }}
                                    showLineNumbers={true}
                                >
                                    {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                            </div>
                        </div>
                    ) : <code className="bg-gray-800/50 border border-gray-700/50 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[11px]" {...props}>{children}</code>
                }
            }}
        >
            {content}
        </ReactMarkdown>
    );
};
