export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}
