import type { MCPRequest, MCPResponse, InitializeResult, ListResourcesResult, ListToolsResult } from './types';

/**
 * MCP Client for connecting to Dime.Scheduler MCP Server
 * Uses HTTP transport to communicate with the MCP server
 */
export class MCPClient {
  private serverUrl: string;
  private requestId: number;
  private apiKey: string | null;

  constructor(serverUrl: string, apiKey: string | null = null) {
    this.serverUrl = serverUrl;
    this.requestId = 0;
    this.apiKey = apiKey;
  }

  /**
   * Set or update the API key
   */
  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey;
  }

  /**
   * Generate a unique request ID
   */
  private getNextRequestId(): number {
    return ++this.requestId;
  }

  /**
   * Parse Server-Sent Events (SSE) response
   */
  private async parseSSEResponse(response: Response): Promise<string> {
    const contentType = response.headers.get('content-type') || '';
    const isSSE = contentType.includes('text/event-stream') || contentType.includes('text/plain');
    
    if (!isSSE) {
      // Not SSE, try to parse as JSON directly
      return await response.text();
    }

    // Parse SSE format
    const text = await response.text();
    const lines = text.split('\n');
    let jsonData = '';

    for (const line of lines) {
      // Skip empty lines and comments
      if (!line.trim() || line.startsWith(':')) {
        continue;
      }

      // Extract data from "data: {...}" lines
      if (line.startsWith('data: ')) {
        const data = line.substring(6); // Remove "data: " prefix
        jsonData += data;
      } else if (line.startsWith('event: ')) {
        // Skip event type lines
        continue;
      } else if (line.trim() && !line.startsWith('id:') && !line.startsWith('retry:')) {
        // If it's not a standard SSE field, it might be raw JSON
        jsonData += line;
      }
    }

    return jsonData || text; // Fallback to original text if no data found
  }

  /**
   * Send a request to the MCP server
   */
  private async request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.getNextRequestId();
    
    const requestBody: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['X-API-KEY'] = this.apiKey;
      }

      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Parse response (handles both JSON and SSE formats)
      const responseText = await this.parseSSEResponse(response);
      let data: MCPResponse<T>;

      try {
        data = JSON.parse(responseText) as MCPResponse<T>;
      } catch (parseError) {
        // If parsing fails, try to extract JSON from the text
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[0]) as MCPResponse<T>;
        } else {
          throw new Error(`Failed to parse response as JSON: ${responseText.substring(0, 100)}`);
        }
      }

      if (data.error) {
        throw new Error(data.error.message || 'MCP server error');
      }

      if (data.result === undefined) {
        throw new Error('No result in MCP response');
      }

      return data.result;
    } catch (error) {
      console.error('MCP request error:', error);
      throw error;
    }
  }

  /**
   * Initialize the MCP connection
   */
  async initialize(): Promise<InitializeResult> {
    try {
      const result = await this.request<InitializeResult>('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'mcp-example-react',
          version: '1.0.0'
        }
      });
      return result;
    } catch (error) {
      console.error('Failed to initialize MCP connection:', error);
      throw error;
    }
  }

  /**
   * List available resources from the MCP server
   * Returns empty list if resources are not supported
   */
  async listResources(server: string | null = null): Promise<ListResourcesResult> {
    try {
      const params: Record<string, unknown> = {};
      if (server) {
        params.server = server;
      }
      const result = await this.request<ListResourcesResult>('resources/list', params);
      return result;
    } catch (error) {
      // If method is not available, return empty resources instead of throwing
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not available') || errorMessage.includes('Method') || errorMessage.includes('-32601')) {
        console.warn('Resources not supported by this MCP server, returning empty list');
        return { resources: [] };
      }
      console.error('Failed to list resources:', error);
      throw error;
    }
  }

  /**
   * Fetch a specific resource
   */
  async fetchResource(uri: string, server: string | null = null): Promise<unknown> {
    try {
      const params: Record<string, unknown> = { uri };
      if (server) {
        params.server = server;
      }
      const result = await this.request('resources/read', params);
      return result;
    } catch (error) {
      console.error('Failed to fetch resource:', error);
      throw error;
    }
  }

  /**
   * List available tools
   * Returns empty list if tools are not supported
   */
  async listTools(server: string | null = null): Promise<ListToolsResult> {
    try {
      const params: Record<string, unknown> = {};
      if (server) {
        params.server = server;
      }
      const result = await this.request<ListToolsResult>('tools/list', params);
      return result;
    } catch (error) {
      // If method is not available, return empty tools instead of throwing
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not available') || errorMessage.includes('Method') || errorMessage.includes('-32601')) {
        console.warn('Tools not supported by this MCP server, returning empty list');
        return { tools: [] };
      }
      console.error('Failed to list tools:', error);
      throw error;
    }
  }

  /**
   * Call a tool
   */
  async callTool(name: string, arguments_: Record<string, unknown> = {}, server: string | null = null): Promise<unknown> {
    try {
      const params: Record<string, unknown> = {
        name,
        arguments: arguments_
      };
      if (server) {
        params.server = server;
      }
      const result = await this.request('tools/call', params);
      return result;
    } catch (error) {
      console.error('Failed to call tool:', error);
      throw error;
    }
  }
}

