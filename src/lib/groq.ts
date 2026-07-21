import type { RepoFile } from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Groq-hosted model. Override with GROQ_MODEL if you want a different one
// (e.g. "llama-3.1-8b-instant" for a faster/cheaper option).
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MAX_CONTEXT_CHARS_PER_FILE = 12_000;

function buildSystemPrompt(): string {
  return [
    "You are RepoChat, an assistant that answers questions about a specific",
    "GitHub repository using only the file excerpts provided as context.",
    "Ground every answer in the given files. If the context doesn't contain",
    "enough information to answer confidently, say so explicitly instead of",
    "guessing. When you reference code, mention the file path it came from.",
    "Be concise and technical.",
  ].join(" ");
}

function buildUserPrompt(question: string, files: RepoFile[]): string {
  const contextBlocks = files
    .map((f) => {
      const truncated = f.content.slice(0, MAX_CONTEXT_CHARS_PER_FILE);
      const wasTruncated = f.content.length > MAX_CONTEXT_CHARS_PER_FILE;
      return `### File: ${f.path}\n\`\`\`\n${truncated}${
        wasTruncated ? "\n... (truncated)" : ""
      }\n\`\`\``;
    })
    .join("\n\n");

  return `Context files:\n\n${contextBlocks}\n\nQuestion: ${question}`;
}

export class GroqError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Calls the Groq chat completions endpoint (OpenAI-compatible) with
 * streaming enabled and returns the raw upstream Response so the route
 * handler can pipe/transform the SSE stream.
 */
export async function streamChatCompletion(
  question: string,
  files: RepoFile[]
): Promise<Response> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqError(
      "Server is missing GROQ_API_KEY. Set it in your environment to enable chat."
    );
  }

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(question, files) },
        ],
      }),
    });
  } catch {
    throw new GroqError("Could not reach the Groq API. Check network connectivity.");
  }

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message ?? "";
    } catch {
      // ignore parse failure
    }
    throw new GroqError(
      detail || `Groq API request failed (${response.status}).`,
      response.status
    );
  }

  return response;
}
