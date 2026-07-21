export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  filesUsed?: string[];
  isStreaming?: boolean;
  error?: string;
}
