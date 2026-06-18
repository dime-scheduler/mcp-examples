import { useState, useEffect, useRef } from 'react'
import type { ChatMessage } from './lib/openai'
import ChatInterface, { type ChatInterfaceRef } from './components/ChatInterface'
import CapabilitiesPanel from './components/CapabilitiesPanel'
import ApiKeysWarning from './components/ApiKeysWarning'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles, AlertCircle, Bot, Loader2 } from 'lucide-react'
import { useMCPSession, initializeMCPSession } from './services/mcpSession'

// Get API keys from environment variables
const getApiKeys = () => {
    const openaiApiKey = import.meta.env.VITE_OPENAI_API_KEY || ''
    const mcpApiKey = import.meta.env.VITE_DIME_SCHEDULER_API_KEY || ''
    return { openaiApiKey, mcpApiKey }
}

// Tools pane width (px) — controlled by the vertical splitter on lg+ screens
const TOOLS_WIDTH_KEY = 'toolsPaneWidth'
const DEFAULT_TOOLS_WIDTH = 300
const MIN_TOOLS_WIDTH = 240
const MAX_TOOLS_WIDTH = 560

function App() {
    const { openaiApiKey: envOpenAIKey, mcpApiKey: envMcpKey } = getApiKeys()
    const { aiService, connected, isLoading: loading, error, connect, openaiApiKey, mcpApiKey } = useMCPSession()
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [chatLoading, setChatLoading] = useState(false)
    const chatInterfaceRef = useRef<ChatInterfaceRef>(null)

    // Resizable tools pane
    const mainRowRef = useRef<HTMLDivElement>(null)
    const [toolsWidth, setToolsWidth] = useState<number>(() => {
        const stored = Number(localStorage.getItem(TOOLS_WIDTH_KEY))
        return stored >= MIN_TOOLS_WIDTH && stored <= MAX_TOOLS_WIDTH ? stored : DEFAULT_TOOLS_WIDTH
    })

    useEffect(() => {
        localStorage.setItem(TOOLS_WIDTH_KEY, String(toolsWidth))
    }, [toolsWidth])

    const startResize = (e: React.MouseEvent) => {
        e.preventDefault()
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const onMove = (ev: MouseEvent) => {
            const rect = mainRowRef.current?.getBoundingClientRect()
            if (!rect) return
            const next = Math.min(MAX_TOOLS_WIDTH, Math.max(MIN_TOOLS_WIDTH, rect.right - ev.clientX))
            setToolsWidth(next)
        }
        const onUp = () => {
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    // Initialize session when API keys change
    useEffect(() => initializeMCPSession(envOpenAIKey, envMcpKey), [envOpenAIKey, envMcpKey])

    // Auto-connect when API keys are available
    useEffect(() => {
        if (openaiApiKey.trim() && mcpApiKey.trim() && !connected && !loading) {
            connect()
        }
    }, [openaiApiKey, mcpApiKey, connected, loading, connect])

    const handleSendMessage = async (message: string) => {
        if (!aiService)
            return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: message,
        }

        setChatMessages((prev) => [...prev, userMessage])
        setChatLoading(true)

        try {
            const response = await aiService.chat([...chatMessages, userMessage])
            setChatMessages((prev) => [...prev, response])
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to send message'
            const errorChatMessage: ChatMessage = {
                role: 'assistant',
                content: `Error: ${errorMessage}`,
            }
            setChatMessages((prev) => [...prev, errorChatMessage])
        } finally {
            setChatLoading(false)
        }
    }

    return (
        <div className="h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/20 overflow-hidden">
            {/* Top Bar Header */}
            <header className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto px-4">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-md bg-primary/10 border border-primary/20">
                                <Sparkles className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-lg font-semibold leading-tight">MCP Playground</h1>
                                <p className="text-xs text-muted-foreground">Dime.Scheduler AI Assistant</p>
                            </div>
                        </div>
                        {loading && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                                <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                                <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Connecting...</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 flex flex-col flex-1 min-h-0">
                <div className="flex flex-col flex-1 min-h-0 space-y-4 py-4">
                    <div className="flex-shrink-0 space-y-4">
                        <ApiKeysWarning openaiApiKey={envOpenAIKey} mcpApiKey={envMcpKey} />

                        {error && (
                            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="text-destructive font-medium text-sm">Error</p>
                                    <p className="text-destructive/80 text-sm mt-1">{error}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div ref={mainRowRef} className="flex flex-col lg:flex-row gap-6 lg:gap-0 items-stretch flex-1 min-h-0">
                        {/* AI Chat Card */}
                        <Card className="shadow-lg border-2 flex flex-col h-full min-h-0 flex-1 min-w-0">
                            <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent flex-shrink-0">
                                <CardTitle className="flex items-center gap-2">
                                    <Bot className="h-5 w-5 text-primary" />
                                    Chat
                                </CardTitle>
                                <CardDescription>Talk to OpenAI and ask it Dime.Scheduler related questions.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0 flex-1 flex flex-col min-h-0 overflow-hidden">
                                <ChatInterface
                                    ref={chatInterfaceRef}
                                    messages={chatMessages}
                                    onSendMessage={handleSendMessage}
                                    loading={chatLoading}
                                />
                            </CardContent>
                        </Card>

                        {/* Vertical splitter (lg+ only) */}
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize tools pane"
                            onMouseDown={startResize}
                            className="group relative mx-3 hidden w-1.5 flex-shrink-0 cursor-col-resize items-center justify-center rounded-full bg-border/60 transition-colors hover:bg-primary/40 lg:flex"
                        >
                            <div className="h-8 w-1 rounded-full bg-muted-foreground/40 transition-colors group-hover:bg-primary/70" />
                        </div>

                        {/* Tools Sidebar */}
                        <div
                            className="flex flex-col min-h-0 h-full w-full flex-shrink-0 lg:w-[var(--tools-w)]"
                            style={{ '--tools-w': `${toolsWidth}px` } as React.CSSProperties}
                        >
                            <CapabilitiesPanel
                                chatInterfaceRef={chatInterfaceRef}
                                chatLoading={chatLoading}
                            />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}

export default App
