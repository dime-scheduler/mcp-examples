import OpenAI from 'openai';
import { MCPClient } from '../mcp';
import type { Tool, Resource } from '../mcp/types';
import type { ChatMessage } from './types';

// Synthetic tool name used to let the model read MCP resources (which are not
// real tools server-side). Handled client-side via mcpClient.fetchResource.
const READ_RESOURCE_TOOL = 'read_resource';

export class AIService {
    private openai: OpenAI | null = null;
    private mcpClient: MCPClient | null = null;
    private tools: Tool[] = [];
    private resources: Resource[] = [];
    private userTimeZone: string;

    constructor(openaiApiKey: string, mcpClient: MCPClient) {
        this.openai = new OpenAI({
            apiKey: openaiApiKey,
            dangerouslyAllowBrowser: true, // Note: In production, use a backend proxy
        });
        this.mcpClient = mcpClient;
        // Detect user's timezone (IANA timezone identifier like "Europe/Brussels")
        this.userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    /**
     * Set the available MCP tools
     */
    setTools(tools: Tool[]): void {
        this.tools = tools;
    }

    /**
     * Set the available MCP resources (exposed to the model via a read_resource tool)
     */
    setResources(resources: Resource[]): void {
        this.resources = resources;
    }

    /**
     * Convert MCP tools to OpenAI function format
     */
    private mcpToolsToOpenAIFunctions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
        const functions: OpenAI.Chat.Completions.ChatCompletionTool[] = this.tools.map((tool) => ({
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

        // Expose MCP resources through a single generic read tool. Resources are
        // read-only data (categories, time markers, the resource roster, etc.)
        // that have no dedicated tool, so the model needs a way to fetch them.
        if (this.resources.length > 0) {
            const catalogue = this.resources
                .map((r) => `- ${r.uri}${r.description ? `: ${r.description}` : ''}`)
                .join('\n');

            functions.push({
                type: 'function',
                function: {
                    name: READ_RESOURCE_TOOL,
                    description:
                        'Read a Dime.Scheduler MCP resource by URI. Use this for read-only reference data. ' +
                        'For templated URIs (containing {placeholders}), substitute the real value before calling. ' +
                        `Available resources:\n${catalogue}`,
                    parameters: {
                        type: 'object',
                        properties: {
                            uri: {
                                type: 'string',
                                description: 'The resource URI to read, e.g. "dimescheduler://categories".',
                            },
                        },
                        required: ['uri'],
                    },
                },
            });
        }

        return functions;
    }

    /**
     * Execute a tool call via MCP
     */
    private async executeToolCall(toolName: string, arguments_: Record<string, unknown>): Promise<unknown> {
        if (!this.mcpClient) {
            throw new Error('MCP client not initialized');
        }

        try {
            // The synthetic read_resource tool maps to an MCP resource read.
            if (toolName === READ_RESOURCE_TOOL) {
                const uri = String(arguments_.uri ?? '');
                return await this.mcpClient.fetchResource(uri);
            }

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
     *
     * Adapted from the production Dime.Scheduler chat assistant prompt, corrected
     * for this playground: messaging tools ARE exposed here, tool calls execute
     * immediately (no approval dialog), and tool results are shown as raw JSON.
     */
    private getSystemContextMessage(): ChatMessage {
        const now = new Date();
        const todayISO = now.toISOString();
        const currentYear = now.getFullYear();
        const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });

        const resourceLines = this.resources
            .map((r) => `- ${r.uri}${r.description ? ` — ${r.description}` : ''}`)
            .join('\n');

        const sections = [
            `You are a Dime.Scheduler AI assistant. Only answer scheduling-related questions.

CORE ENTITIES (do not confuse — they're related but distinct):
- Job: top-level project container (e.g. 'JOB-001'). Holds tasks.
- Task: a work item to be planned (e.g. 'TASK-024'). Belongs to a Job. Not yet on the calendar until it becomes an appointment.
- Appointment: a scheduled instance of a Task — a specific resource at a specific time. Has an appointmentNo (opaque hash). Lives on the calendar.
- Resource: a scheduling target (technician, vehicle, equipment, room). Appointments are assigned to resources. Has a display name and may have a contact email.
- User: a login principal (a person who signs in). Receives messages. Resources and users are NOT the same — a resource MAY correspond to a user if its email matches a user account, but most resources have no user.

ABSOLUTE RULE - NO HALLUCINATION:
- NEVER invent appointment data, resource names, availability windows, or any other facts.
- If a question requires data, you MUST call a tool or read a resource to obtain it.
- If no relevant tool/resource exists, or a tool call fails, say so explicitly and stop. Do not guess.
- "I made up the data" is the worst possible failure mode - prefer answering "I don't have that information" instead.

TOOL ERRORS — SURFACE THEM VERBATIM:
- When a tool returns an error, DO NOT paraphrase, soften, or hide it. Quote the tool's exact error message, including any "suggestion" or "example" fields it provided.
- A useless "Sorry, there was an error" reply blocks the user from diagnosing the problem.
- If the error mentions a missing/ambiguous resource, missing appointmentNo, or invalid parameter — say so directly, name the specific field, and ask the user for the missing/corrected value.
- Do NOT substitute a different tool (especially not delete/bulk_delete tools) as a workaround for a failed call.`,

            `TODAY: ${todayISO} (${weekday}), Year: ${currentYear}
TIMEZONE: ${this.userTimeZone} (detected from the browser)`,

            `DATE HANDLING:
- All dates must be ISO 8601 with year (e.g., ${currentYear}-01-15T14:00:00).
- For relative expressions ("this week", "tomorrow"), call parse_relative_time FIRST to get concrete ISO dates.
- timeZone parameter: the server falls back to the user's profile then the organization default when timeZone is blank. Tool schemas may mark timeZone as Required for technical reasons — you can still pass it empty and the fallback applies. Pass an explicit IANA value (e.g. "${this.userTimeZone}") only when the user asks for a different timezone than their default.
- Tool responses carry a "Timezone" field describing the dates they contain. When showing dates to the user, state the timezone (e.g. "9:00 AM Europe/Brussels").`,

            `WRITE OPERATIONS (create/update/delete/reschedule/bulk_*):
- Extract parameters from the CURRENT request only (ignore unrelated earlier messages).
- If critical info is missing (time, duration, resource), ask ONCE then proceed.
- NOTE: this is a playground — write operations execute immediately against the connected server. There is no separate approval dialog, so double-check you have the right target before a destructive call.
- For reschedules: prefer change_appointment_time (just moves) or change_appointment_resources (just reassigns) over the wider reschedule_appointment when the user's intent is narrow.`,

            `TOOL SELECTION (use the NAMED TOOL when the request mentions a specific resource/task/etc.):
- Session orientation: get_session_context returns the resolved timezone and server "now" — useful when the user asks "what's today".
- "When is X available" / "X's availability" -> get_resource_availability (raw periods) OR find_available_slots (if a duration is given).
- "Is X free at TIME" -> check_time_slot_availability.
- "X's schedule / planning / appointments" -> get_resource_planning.
- "What's next for X?" / "X's next job" -> get_next_appointment.
- "Find someone who can ..." / "find a plumber" / "who speaks French" -> get_recommendations (DISCOVERY — accepts ANY filter values: skills, languages, regions, certifications, etc.). find_resource_by_skill is a simpler shortcut.
- "Move/reschedule X to a new time" -> change_appointment_time (needs appointmentNo + newStartDateTime).
- "Reassign X to someone else" / "Give appointment X to Y" -> change_appointment_resources (needs appointmentNo + resources). Use this for ANY reassignment when you already know the appointmentNo — don't fall back to reschedule_appointment unless time/duration also change.
- "Move/reassign + change duration in one go" -> reschedule_appointment (wider).
- "Bulk reschedule / cancel many appointments" -> bulk_reschedule_appointments / bulk_delete_appointments.
- "Notify / message a user" -> send_message. This targets USERS by login email, NOT resources. Passing a resource's contact email only works if a user account exists with that exact email; otherwise the tool errors. Do NOT pass a resource display name as the email.
- "Log / record a notification" -> create_notification. "What notifications exist for X" -> search_notifications.
- "Optimize routes" -> optimize_field_service.
- "Search appointments / tasks / jobs / resources" -> search_appointments / search_tasks / search_jobs / search_resources.

IDENTIFICATION: prefer appointmentNo (hashed ID from search_appointments / get_appointment_details) on every mutating call. Subject + date matching is fuzzy and can pick the wrong record.

read_resource is ONLY for the URIs listed in RESOURCES below. NEVER invent a URI — if a resource doesn't exist for what you need, use a tool.`,

            resourceLines.length > 0
                ? `RESOURCES (read with read_resource, no tool budget burned):\n${resourceLines}`
                : `RESOURCES: none discovered`,

            `FORMAT:
- This is a developer playground: the raw tool calls and JSON results are shown below each answer for inspection. Many partners reading along are NOT technical, so your text reply is the human-friendly answer.
- After a tool call, give a clear, concise summary of what the data shows and present the actual results the user asked for (a short markdown list or table when there are several rows).
- Use **bold** for key facts and human-readable dates (e.g., Monday, Jan 8 at 2 PM, with timezone). Answer the question — don't dump every field.`,
        ];

        return {
            role: 'system',
            content: sections.join('\n\n'),
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
            model: 'gpt-4o',
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

