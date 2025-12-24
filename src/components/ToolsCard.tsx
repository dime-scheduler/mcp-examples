import { type ChatInterfaceRef } from './ChatInterface'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Sparkles, Wrench } from 'lucide-react'
import toolSampleQuestions from '../toolSampleQuestions.json'
import { useMCPSessionStore } from '../services/mcpSession'

interface ToolsCardProps {
    chatInterfaceRef: React.RefObject<ChatInterfaceRef | null>
    chatLoading: boolean
}

// Get sample questions for a tool based on its name/ID
const getSampleQuestionsForTool = (toolName: string): string[] => {
    // Exact match by tool name/ID
    if (toolName in toolSampleQuestions) {
        return (toolSampleQuestions as Record<string, string[]>)[toolName]
    }

    return [];
}

export default function ToolsCard({ chatInterfaceRef, chatLoading }: ToolsCardProps) {
    // Only re-render when tools or aiService change - select values separately
    const tools = useMCPSessionStore((state) => state.tools)
    const aiService = useMCPSessionStore((state) => state.aiService)
    return (
        <Card className="shadow-lg border-2 flex flex-col h-full">
            <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent flex-shrink-0">
                <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-primary" />
                    Available Tools
                    <span className="ml-auto text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded-full">
                        {tools.length}
                    </span>
                </CardTitle>
                <CardDescription>MCP tools available for use</CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col min-h-0 overflow-hidden">
                <ScrollArea className="flex-1 min-h-0">
                    <div className="p-4">
                        {tools.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-8">
                                <Wrench className="h-8 w-8 text-muted-foreground/50 mb-2" />
                                <p className="text-muted-foreground text-sm">No tools available</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {tools.map((tool, index) => {
                                    const sampleQuestions = getSampleQuestionsForTool(tool.name)
                                    return (
                                        <div
                                            key={index}
                                            className="border rounded-lg p-4 space-y-3"
                                        >
                                            <div className="flex items-start gap-2">
                                                <Wrench className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-sm">{tool.name}</h3>
                                                    {tool.description && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {tool.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Sample Questions for this tool */}
                                            <div className="space-y-2 mt-3 pt-3 border-t">
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                                    <Sparkles className="h-3 w-3" />
                                                    Try asking:
                                                </p>
                                                {sampleQuestions.map((question, qIndex) => (
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
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    )
}

