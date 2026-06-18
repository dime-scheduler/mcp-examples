export interface PromptMessageContent {
  type: string;
  text?: string;
}

export interface PromptMessage {
  role: string;
  content: PromptMessageContent;
}

export interface GetPromptResult {
  description?: string;
  messages: PromptMessage[];
}
