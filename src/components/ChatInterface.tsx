import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { type ChatMessage } from '../lib/openai';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatInterfaceProps {
    messages: ChatMessage[];
    onSendMessage: (message: string) => Promise<void>;
    loading: boolean;
}

export interface ChatInterfaceRef {
    setInputValue: (value: string) => void;
}

const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(
    ({ messages, onSendMessage, loading }, ref) => {
        const [input, setInput] = useState('');
        const messagesEndRef = useRef<HTMLDivElement>(null);
        const inputRef = useRef<HTMLInputElement>(null);

        const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

        useEffect(() => scrollToBottom(), [messages]);

        useImperativeHandle(ref, () => ({
            setInputValue: (value: string) => {
                setInput(value);
                // Focus the input after setting the value
                setTimeout(() => {
                    inputRef.current?.focus();
                    // Select the placeholder text (like "X" or "Y") for easy replacement
                    const inputElement = inputRef.current;
                    if (inputElement) {
                        const placeholderPattern = /\b(X|Y|resource X|job Y)\b/gi;
                        const match = value.match(placeholderPattern);
                        if (match) {
                            const startIndex = value.indexOf(match[0]);
                            const endIndex = startIndex + match[0].length;
                            inputElement.setSelectionRange(startIndex, endIndex);
                        }
                    }
                }, 0);
            },
        }));

        const handleSubmit = async (e: React.FormEvent) => {
            e.preventDefault();

            if (!input.trim() || loading)
                return;

            const message = input.trim();
            setInput('');
            await onSendMessage(message);
        };

        return (
            <div className="flex flex-col h-full overflow-hidden bg-gradient-to-br from-background to-muted/20">
                <ScrollArea className="flex-1 p-6 min-h-0">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-3">
                            <div className="p-4 rounded-full bg-primary/10 mb-2">
                                <Bot className="h-8 w-8 text-primary" />
                            </div>
                            <p className="text-lg font-medium">Start a conversation</p>
                            <p className="text-sm max-w-sm">Ask me anything! I can use MCP tools and resources to help you.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {messages.map((message, index) => (
                                <div
                                    key={index}
                                    className={`flex flex-col gap-2 ${message.role === 'user' ? 'items-end' : 'items-start'
                                        }`}
                                >
                                    <div className="text-xs font-semibold text-muted-foreground uppercase">
                                        {message.role === 'user' ? 'You' : 'Assistant'}
                                    </div>
                                    <div
                                        className={`rounded-lg px-4 py-3 max-w-[80%] shadow-sm ${message.role === 'user'
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-card border text-card-foreground'
                                            }`}
                                    >
                                        {message.content && (
                                            <div className="markdown-content prose prose-sm max-w-none dark:prose-invert prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:text-sm prose-pre:my-1 prose-blockquote:my-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                                <ReactMarkdown
                                                    components={{
                                                        // Style code blocks
                                                        code: ({ className, children, ...props }: any) => {
                                                            const match = /language-(\w+)/.exec(className || '');
                                                            const isInline = !match && !className?.includes('language-');
                                                            return isInline ? (
                                                                <code className="px-1.5 py-0.5 rounded bg-muted/60 text-xs font-mono before:content-[''] after:content-['']" {...props}>
                                                                    {children}
                                                                </code>
                                                            ) : (
                                                                <code className="block p-2 rounded bg-muted/60 text-xs font-mono overflow-x-auto my-1" {...props}>
                                                                    {children}
                                                                </code>
                                                            );
                                                        },
                                                        // Style pre blocks
                                                        pre: ({ children, ...props }: any) => {
                                                            return (
                                                                <pre className="p-2 rounded bg-muted/60 text-xs font-mono overflow-x-auto my-1" {...props}>
                                                                    {children}
                                                                </pre>
                                                            );
                                                        },
                                                        // Style paragraphs - remove excessive spacing
                                                        p: ({ children, ...props }: any) => {
                                                            // Don't render empty paragraphs
                                                            if (typeof children === 'string' && children.trim() === '') return null;
                                                            return (
                                                                <p className="my-1 leading-relaxed" {...props}>
                                                                    {children}
                                                                </p>
                                                            );
                                                        },
                                                        // Style lists with tighter spacing
                                                        ul: ({ children, ...props }: any) => (
                                                            <ul className="list-disc list-outside ml-4 my-1 space-y-0.5" {...props}>
                                                                {children}
                                                            </ul>
                                                        ),
                                                        ol: ({ children, ...props }: any) => (
                                                            <ol className="list-decimal list-outside ml-4 my-1 space-y-0.5" {...props}>
                                                                {children}
                                                            </ol>
                                                        ),
                                                        // Style list items
                                                        li: ({ children, ...props }: any) => (
                                                            <li className="my-0.5 leading-relaxed" {...props}>
                                                                {children}
                                                            </li>
                                                        ),
                                                        // Style links
                                                        a: ({ children, ...props }: any) => (
                                                            <a className="text-primary underline hover:text-primary/80" {...props}>
                                                                {children}
                                                            </a>
                                                        ),
                                                        // Style headings with less spacing
                                                        h1: ({ children, ...props }: any) => (
                                                            <h1 className="text-xl font-bold my-2 first:mt-0" {...props}>
                                                                {children}
                                                            </h1>
                                                        ),
                                                        h2: ({ children, ...props }: any) => (
                                                            <h2 className="text-lg font-bold my-1.5 first:mt-0" {...props}>
                                                                {children}
                                                            </h2>
                                                        ),
                                                        h3: ({ children, ...props }: any) => (
                                                            <h3 className="text-base font-semibold my-1 first:mt-0" {...props}>
                                                                {children}
                                                            </h3>
                                                        ),
                                                        // Style blockquotes
                                                        blockquote: ({ children, ...props }: any) => (
                                                            <blockquote className="border-l-2 border-muted pl-3 italic my-1 text-sm" {...props}>
                                                                {children}
                                                            </blockquote>
                                                        ),
                                                        // Style horizontal rules
                                                        hr: ({ ...props }: any) => (
                                                            <hr className="my-2 border-muted" {...props} />
                                                        ),
                                                        // Style strong/bold
                                                        strong: ({ children, ...props }: any) => (
                                                            <strong className="font-semibold" {...props}>
                                                                {children}
                                                            </strong>
                                                        ),
                                                        // Style emphasis/italic
                                                        em: ({ children, ...props }: any) => (
                                                            <em className="italic" {...props}>
                                                                {children}
                                                            </em>
                                                        ),
                                                    }}
                                                >
                                                    {message.content}
                                                </ReactMarkdown>
                                            </div>
                                        )}
                                        {message.toolCalls && message.toolCalls.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-white/20">
                                                <div className="text-xs font-semibold mb-2">Tool Calls:</div>
                                                {message.toolCalls.map((tc, tcIndex) => (
                                                    <div key={tcIndex} className="mb-2 p-2 bg-black/20 rounded text-xs">
                                                        <code className="font-semibold">{tc.name}</code>
                                                        <pre className="mt-1 text-xs overflow-x-auto">
                                                            {JSON.stringify(tc.arguments, null, 2)}
                                                        </pre>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {message.toolCallResults && message.toolCallResults.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-white/20">
                                                <div className="text-xs font-semibold mb-2">Tool Results:</div>
                                                {message.toolCallResults.map((tcr, tcrIndex) => (
                                                    <div key={tcrIndex} className="p-2 bg-black/20 rounded text-xs">
                                                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                                                            {JSON.stringify(tcr.result, null, 2)}
                                                        </pre>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex flex-col gap-2 items-start">
                                    <div className="text-xs font-semibold text-muted-foreground uppercase">
                                        Assistant
                                    </div>
                                    <div className="rounded-lg px-4 py-2 bg-muted text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <span>Thinking</span>
                                            <span className="animate-pulse">...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </ScrollArea>
                <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t bg-background/80 backdrop-blur-sm">
                    <Input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type your message..."
                        disabled={loading}
                        className="flex-1"
                    />
                    <Button type="submit" disabled={loading || !input.trim()} className="shadow-sm">
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            'Send'
                        )}
                    </Button>
                </form>
            </div>
        );
    });

ChatInterface.displayName = 'ChatInterface';

export default ChatInterface;
