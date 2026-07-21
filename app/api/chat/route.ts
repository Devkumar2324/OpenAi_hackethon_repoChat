import { NextRequest } from "next/server";
import { findRelevantFiles, getRepo } from "@/lib/repo-store";

export const runtime = "nodejs";

const encoder = new TextEncoder();

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) return new Response("GROQ_API_KEY is not configured.", { status: 500 });
    const { repoId, question } = await request.json();
    if (typeof repoId !== "string" || typeof question !== "string" || !question.trim()) return new Response("A repository and question are required.", { status: 400 });
    const repo = getRepo(repoId);
    if (!repo) return new Response("This repo session has expired. Please index it again.", { status: 404 });
    const files = findRelevantFiles(repo.files, question);
    const context = files.map((file) => `--- ${file.path} ---\n${file.content}`).join("\n\n");
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b", stream: true, messages: [
        { role: "system", content: "You answer questions about a code repository. Use the supplied file context faithfully. If it does not contain enough information, say so clearly. Be concise but helpful." },
        { role: "user", content: `Repository: ${repo.name}\n\nRelevant files:\n${context}\n\nQuestion: ${question}` }
      ] }),
    });
    if (!upstream.ok || !upstream.body) return new Response((await upstream.text()) || "The Groq API request failed.", { status: upstream.status || 502 });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { controller.close(); return; }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") { controller.close(); return; }
            try {
              const token = JSON.parse(data).choices?.[0]?.delta?.content;
              if (token) controller.enqueue(encoder.encode(token));
            } catch { /* Ignore incomplete SSE chunks. */ }
          }
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() { reader.cancel(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Context-Files": encodeURIComponent(JSON.stringify(files.map((file) => file.path))) } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unable to answer that question.", { status: 500 });
  }
}
