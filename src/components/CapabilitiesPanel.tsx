import { useState } from 'react'
import { type ChatInterfaceRef } from './ChatInterface'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Sparkles, Wrench, Database, Wand2 } from 'lucide-react'
import toolSampleQuestions from '../toolSampleQuestions.json'
import resourceSampleQuestions from '../resourceSampleQuestions.json'
import promptSampleQuestions from '../promptSampleQuestions.json'
import { useMCPSessionStore } from '../services/mcpSession'

interface CapabilitiesPanelProps {
    chatInterfaceRef: React.RefObject<ChatInterfaceRef | null>
    chatLoading: boolean
}

type TabId = 'tools' | 'resources' | 'prompts'

// A single thing the user can try, normalised across tools / resources / prompts.
interface CapabilityItem {
    key: string
    name: string
    description?: string
    questions: string[]
}

const lookup = (map: Record<string, string[]>, key: string): string[] => map[key] ?? []

export default function CapabilitiesPanel({ chatInterfaceRef, chatLoading }: CapabilitiesPanelProps) {
    const tools = useMCPSessionStore((state) => state.tools)
    const resources = useMCPSessionStore((state) => state.resources)
    const prompts = useMCPSessionStore((state) => state.prompts)
    const aiService = useMCPSessionStore((state) => state.aiService)

    const [activeTab, setActiveTab] = useState<TabId>('tools')

    const toolItems: CapabilityItem[] = tools.map((t) => ({
        key: t.name,
        name: t.name,
        description: t.description,
        questions: lookup(toolSampleQuestions as Record<string, string[]>, t.name),
    }))

    const resourceItems: CapabilityItem[] = resources.map((r) => ({
        key: r.uri,
        name: r.name || r.uri,
        description: r.description,
        questions: lookup(resourceSampleQuestions as Record<string, string[]>, r.uri),
    }))

    const promptItems: CapabilityItem[] = prompts.map((p) => ({
        key: p.name,
        name: p.name,
        description: p.description,
        questions: lookup(promptSampleQuestions as Record<string, string[]>, p.name),
    }))

    const tabs: { id: TabId; label: string; icon: typeof Wrench; items: CapabilityItem[] }[] = [
        { id: 'tools', label: 'Tools', icon: Wrench, items: toolItems },
        { id: 'resources', label: 'Resources', icon: Database, items: resourceItems },
        { id: 'prompts', label: 'Prompts', icon: Wand2, items: promptItems },
    ]

    const active = tabs.find((t) => t.id === activeTab) ?? tabs[0]
    const ItemIcon = active.icon

    return (
        <Card className="shadow-lg border-2 flex flex-col h-full">
            <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent flex-shrink-0">
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    What you can do
                </CardTitle>
                <CardDescription>Click a question to try it</CardDescription>

                {/* Simple tab switcher */}
                <div className="flex gap-1 mt-3">
                    {tabs.map((tab) => {
                        const TabIcon = tab.icon
                        const selected = tab.id === activeTab
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                                    selected
                                        ? 'border-primary/50 bg-primary/10 text-primary'
                                        : 'border-transparent text-muted-foreground hover:bg-muted'
                                }`}
                            >
                                <TabIcon className="h-3.5 w-3.5" />
                                {tab.label}
                                <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                                    {tab.items.length}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </CardHeader>

            <CardContent className="p-0 flex-1 flex flex-col min-h-0 overflow-hidden">
                <ScrollArea className="flex-1 min-h-0">
                    <div className="p-4">
                        {active.items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-8">
                                <ItemIcon className="h-8 w-8 text-muted-foreground/50 mb-2" />
                                <p className="text-muted-foreground text-sm">No {active.label.toLowerCase()} available</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {active.items.map((item) => (
                                    <div key={item.key} className="border rounded-lg p-4 space-y-3">
                                        <div className="flex items-start gap-2">
                                            <ItemIcon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-sm break-words">{item.name}</h3>
                                                {item.description && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {item.questions.length > 0 && (
                                            <div className="space-y-2 mt-3 pt-3 border-t">
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                                    <Sparkles className="h-3 w-3" />
                                                    Try asking:
                                                </p>
                                                {item.questions.map((question, qIndex) => (
                                                    <Button
                                                        key={qIndex}
                                                        variant="outline"
                                                        size="sm"
                                                        className="w-full text-left justify-start h-auto py-2 px-2 text-xs hover:bg-accent hover:border-primary/50 transition-all group"
                                                        onClick={() => chatInterfaceRef.current?.setInputValue(question)}
                                                        disabled={chatLoading || !aiService}
                                                    >
                                                        <span className="text-foreground group-hover:text-primary transition-colors">{question}</span>
                                                    </Button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    )
}
