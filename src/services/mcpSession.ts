import { create } from 'zustand'
import { MCPClient } from '../lib/mcp'
import { AIService } from '../lib/openai'
import type { Tool } from '../lib/mcp'

export const DEFAULT_SERVER_URL = 'https://sandbox.api.dimescheduler.com/mcp'

interface MCPSessionStore {
  // State
  openaiApiKey: string
  aiService: AIService | null
  mcpApiKey: string
  serverUrl: string
  mcpClient: MCPClient | null
  connected: boolean
  tools: Tool[]
  isLoading: boolean
  error: string | null

  // Actions
  initialize: (openaiApiKey: string, mcpApiKey: string, serverUrl?: string) => void
  connect: () => Promise<void>
  loadTools: () => Promise<void>
}

export const useMCPSessionStore = create<MCPSessionStore>((set, get) => ({
  // Initial state
  openaiApiKey: '',
  aiService: null,
  mcpApiKey: '',
  serverUrl: DEFAULT_SERVER_URL,
  mcpClient: null,
  connected: false,
  tools: [],
  isLoading: false,
  error: null,

  // Actions
  initialize: (openaiApiKey: string, mcpApiKey: string, serverUrl?: string) => {
    const server = serverUrl || DEFAULT_SERVER_URL

    // Create MCP client
    const mcpClient = new MCPClient(server, mcpApiKey || null)

    // Create AI service when both are available
    let aiService: AIService | null = null
    if (openaiApiKey.trim() && mcpClient) {
      try {
        aiService = new AIService(openaiApiKey, mcpClient)
      } catch (err) {
        const errorMessage = err instanceof Error
          ? err.message
          : 'Failed to initialize OpenAI service'
        set({ error: errorMessage, aiService: null })
        return
      }
    }

    set({
      openaiApiKey,
      mcpApiKey,
      serverUrl: server,
      mcpClient,
      aiService,
      connected: false,
    })
  },

  connect: async () => {
    const { mcpClient, mcpApiKey } = get()
    if (!mcpClient || !mcpApiKey.trim()) return

    set({ isLoading: true, error: null })

    try {
      await mcpClient.initialize()
      set({ connected: true })
      await get().loadTools()
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : 'Failed to connect to MCP server'
      set({ error: errorMessage, connected: false })
    } finally {
      set({ isLoading: false })
    }
  },

  loadTools: async () => {
    const { mcpClient, aiService } = get()
    if (!mcpClient) return

    try {
      const result = await mcpClient.listTools()
      const tools = result.tools || []
      set({ tools })

      // Update AI service with tools
      if (aiService && tools.length > 0) {
        aiService.setTools(tools)
      }
    } catch (err) {
      console.warn('Tools not available:', err)
      set({ tools: [] })
    }
  },
}))

/**
 * Hook to use MCP session
 * Components can use this directly or use the store with selectors for better performance
 */
export function useMCPSession() {
  const store = useMCPSessionStore()

  return {
    ...store,
  }
}

/**
 * Initialize MCP session with API keys
 */
export function initializeMCPSession(openaiApiKey: string, mcpApiKey: string, serverUrl?: string) {
  useMCPSessionStore.getState().initialize(openaiApiKey, mcpApiKey, serverUrl)
}
