export interface Tool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

