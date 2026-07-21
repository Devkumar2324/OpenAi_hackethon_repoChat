import { NextRequest } from "next/server";
import { getRepo } from "@/lib/store";
import { selectRelevantFiles } from "@/lib/relevance";
import { streamChatCompletion, GroqError } from "@/lib/groq";
import type { ChatRequestBody } from "@/lib/types";

export const maxDuration = 60;

// Marker line sent as the very first line of the stream so the client can
// pull out which files were used as context before rendering the answer.
const FILES_MARKER = "@@REPOCHAT_FILES@@";

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const { repoId, question } = body;
  if (!repoId || !question?.trim()) {
    return jsonError("Missing repoId or question.", 400);
  }

  const repo = getRepo(repoId);
  if (!repo) {
    return jsonError(
      "This repo session has expired or was never indexed. Please re-submit the repo URL.",
      404
    );
  }

  const { files: relevantFiles, scored } = selectRelevantFiles(
    repo.files,
    question,
    5
  );

  let upstream: Response;
  try {
    upstream = await streamChatCompletion(question, relevantFiles);
  } catch (err) {
    if (err instanceof GroqError) {
      return jsonError(err.message, err.status ?? 502);
    }
    console.error("Chat request failed:", err);
    return jsonError("Unexpected error while contacting the AI model.", 500);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Send the files-used metadata first, as its own line.
      const filesLine =
        FILES_MARKER +
        JSON.stringify(scored.map((s) => s.path)) +
        "\n";
      controller.enqueue(encoder.encode(filesLine));

      const reader = upstream.body!.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta: string | undefined =
                parsed?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // Skip malformed SSE chunks rather than failing the whole stream.
            }
          }
        }
        controller.close();
      } catch (err) {
        console.error("Stream read failed:", err);
        controller.enqueue(
          encoder.encode(
            "\n\n[Error: the response stream was interrupted. Please try again.]"
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Repo-Id": repoId,
    },
  });
}
