import OpenAI from 'openai';
import { MCPClient } from '../mcp';
import type { Tool } from '../mcp/types';
import type { ChatMessage } from './types';

export class AIService {
    private openai: OpenAI | null = null;
    private mcpClient: MCPClient | null = null;
    private tools: Tool[] = [];

    constructor(openaiApiKey: string, mcpClient: MCPClient) {
        this.openai = new OpenAI({
            apiKey: openaiApiKey,
            dangerouslyAllowBrowser: true, // Note: In production, use a backend proxy
        });
        this.mcpClient = mcpClient;
    }

    /**
     * Set the available MCP tools
     */
    setTools(tools: Tool[]): void {
        this.tools = tools;
    }

    /**
     * Convert MCP tools to OpenAI function format
     */
    private mcpToolsToOpenAIFunctions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
        return this.tools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description || `Tool: ${tool.name}`,
                parameters: (tool.inputSchema as OpenAI.FunctionParameters) || {
                    type: 'object',
                    properties: {},
                },
            },
        }));
    }

    /**
     * Execute a tool call via MCP
     */
    private async executeToolCall(toolName: string, arguments_: Record<string, unknown>): Promise<unknown> {
        if (!this.mcpClient) {
            throw new Error('MCP client not initialized');
        }

        try {
            const result = await this.mcpClient.callTool(toolName, arguments_);
            return result;
        } catch (error) {
            console.error(`Error executing tool ${toolName}:`, error);
            throw error;
        }
    }

    /**
     * Fetch a resource via MCP
     */
    async fetchResource(uri: string): Promise<unknown> {
        if (!this.mcpClient) {
            throw new Error('MCP client not initialized');
        }

        try {
            const result = await this.mcpClient.fetchResource(uri);
            return result;
        } catch (error) {
            console.error(`Error fetching resource ${uri}:`, error);
            throw error;
        }
    }

    /**
     * Generate a system message with current context (date/time, identity, etc.)
     */
    private getSystemContextMessage(): ChatMessage {
        const now = new Date();
        const dateTime = now.toISOString();
        const date = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const time = now.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            timeZoneName: 'short',
        });

        return {
            role: 'system',
            content: `You are an AI assistant integrated with the Dime.Scheduler MCP (Model Context Protocol) server.

Current Date and Time:
- ISO DateTime: ${dateTime}
- Date: ${date}
- Time: ${time}

You have access to tools and resources from the Dime.Scheduler MCP server. When users ask questions about scheduling, resources, or related topics, you can use the available MCP tools to fetch real-time information and perform actions.

Always be helpful, accurate, and provide clear explanations. When using tools, explain what you're doing to help the user understand the process.`,
        };
    }

    /**
     * Send a chat message and get AI response with tool calling support
     */
    async chat(messages: ChatMessage[]): Promise<ChatMessage> {
        if (!this.openai) {
            throw new Error('OpenAI client not initialized');
        }

        // Prepend system context message (with current date/time) at the beginning
        // Only add if the first message is not already a system message
        const messagesWithSystemContext: ChatMessage[] = [];
        const hasSystemMessage = messages.length > 0 && messages[0].role === 'system';

        if (!hasSystemMessage) {
            messagesWithSystemContext.push(this.getSystemContextMessage());
        }
        messagesWithSystemContext.push(...messages);

        // Convert messages to OpenAI format
        const openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        for (const msg of messagesWithSystemContext) {
            if (msg.role === 'system' || msg.role === 'user') {
                openAIMessages.push({
                    role: msg.role,
                    content: msg.content,
                });
            } else {
                // Assistant message
                const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
                    role: 'assistant',
                    content: msg.content,
                };

                // Add tool calls if present
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.arguments),
                        },
                    }));
                }

                openAIMessages.push(assistantMsg);

                // Add tool call results as tool messages immediately after the assistant message
                if (msg.toolCallResults && msg.toolCallResults.length > 0) {
                    msg.toolCallResults.forEach((tcr) => {
                        openAIMessages.push({
                            role: 'tool',
                            tool_call_id: tcr.toolCallId,
                            content: JSON.stringify(tcr.result),
                        });
                    });
                }
            }
        }

        // Get available tools
        const tools = this.mcpToolsToOpenAIFunctions();

        // Call OpenAI API
        const response = await this.openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: openAIMessages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
        });

        const assistantMessage = response.choices[0]?.message;

        if (!assistantMessage) {
            throw new Error('No response from OpenAI');
        }

        // Handle tool calls
        const toolCalls: ChatMessage['toolCalls'] = [];
        const toolCallResults: ChatMessage['toolCallResults'] = [];

        if (assistantMessage.tool_calls) {
            for (const toolCall of assistantMessage.tool_calls) {
                if (toolCall.type === 'function') {
                    const toolName = toolCall.function.name;
                    let toolArguments: Record<string, unknown> = {};

                    try {
                        toolArguments = JSON.parse(toolCall.function.arguments);
                    } catch (error) {
                        console.error('Error parsing tool arguments:', error);
                    }

                    toolCalls.push({
                        id: toolCall.id,
                        name: toolName,
                        arguments: toolArguments,
                    });

                    // Execute the tool call
                    try {
                        const result = await this.executeToolCall(toolName, toolArguments);
                        toolCallResults.push({
                            toolCallId: toolCall.id,
                            result,
                        });
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        toolCallResults.push({
                            toolCallId: toolCall.id,
                            result: { error: errorMessage },
                        });
                    }
                }
            }
        }

        // If there were tool calls, we need to make another request with the results
        if (toolCalls.length > 0) {
            // Create assistant message with tool calls
            const assistantMsgWithToolCalls: ChatMessage = {
                role: 'assistant',
                content: assistantMessage.content || '',
                toolCalls,
                toolCallResults, // Attach tool call results to the same message
            };

            // Note: messages already includes the system context from the initial call,
            // so we don't need to add it again in the recursive call
            const updatedMessages: ChatMessage[] = [
                ...messages,
                assistantMsgWithToolCalls,
            ];

            // Recursively call chat with tool results
            // The system context will be prepended again, but that's fine as OpenAI
            // will handle multiple system messages appropriately
            return this.chat(updatedMessages);
        }

        return {
            role: 'assistant',
            content: assistantMessage.content || '',
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            toolCallResults: toolCallResults.length > 0 ? toolCallResults : undefined,
        };
    }
}

