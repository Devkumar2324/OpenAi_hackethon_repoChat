"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import type { RepoSummary } from "@/lib/types";
import type { ChatMessage } from "@/lib/client-types";

interface Props {
  repo: RepoSummary;
  onReset: () => void;
}

const FILES_MARKER = "@@REPOCHAT_FILES@@";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ChatPanel({ repo, onReset }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", content: q };
    const assistantId = uid();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setQuestion("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId: repo.id, question: q }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "The request failed.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let filesUsed: string[] | undefined;
      let sawFilesLine = false;
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        if (!sawFilesLine) {
          const nlIndex = buffer.indexOf("\n");
          if (nlIndex === -1) continue; // wait for full first line
          const firstLine = buffer.slice(0, nlIndex);
          buffer = buffer.slice(nlIndex + 1);
          sawFilesLine = true;
          if (firstLine.startsWith(FILES_MARKER)) {
            try {
              filesUsed = JSON.parse(firstLine.slice(FILES_MARKER.length));
            } catch {
              filesUsed = undefined;
            }
          } else {
            accumulated += firstLine;
          }
        }

        if (sawFilesLine && buffer) {
          accumulated += buffer;
          buffer = "";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: accumulated, filesUsed }
                : m
            )
          );
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: accumulated, filesUsed, isStreaming: false }
            : m
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, isStreaming: false, error: msg }
            : m
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col h-full rise-in">
      <header className="flex items-center justify-between border-b border-border pb-4 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] text-accent">
            <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
            connected
          </div>
          <h2 className="text-lg font-semibold text-foreground truncate mt-0.5">
            {repo.owner}/{repo.name}
          </h2>
          <p className="text-[12px] text-text-faint mt-0.5">
            {repo.fileCount} file{repo.fileCount === 1 ? "" : "s"} indexed
          </p>
        </div>
        <button
          onClick={onReset}
          className="shrink-0 text-[12px] text-text-dim hover:text-foreground border border-border hover:border-text-faint rounded-md px-3 py-1.5 transition"
        >
          new repo
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-5 pr-1 pb-4"
      >
        {messages.length === 0 && (
          <div className="text-center py-16 text-text-faint text-[13px]">
            ask something about the codebase — e.g. &ldquo;where is
            authentication handled?&rdquo;
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="pt-3 border-t border-border">
        <div className="flex items-stretch gap-2 bg-panel border border-border rounded-lg p-1.5 focus-within:border-accent-dim transition-colors">
          <div className="flex items-center pl-2 text-text-faint text-sm select-none">
            ?
          </div>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="ask a question about this repo…"
            disabled={busy}
            spellCheck={false}
            className="flex-1 bg-transparent outline-none text-sm sm:text-[15px] text-foreground placeholder:text-text-faint py-2.5 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="shrink-0 px-4 sm:px-5 rounded-md bg-accent text-[#04140a] text-sm font-semibold hover:bg-accent/90 active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none"
          >
            {busy ? "thinking…" : "ask"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`rise-in ${isUser ? "flex justify-end" : ""}`}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
        {isUser ? (
          <div className="bg-panel border border-border rounded-lg px-4 py-2.5 text-[14px] text-foreground">
            {message.content}
          </div>
        ) : (
          <div className="space-y-2.5">
            {message.filesUsed && message.filesUsed.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {message.filesUsed.map((f) => (
                  <span
                    key={f}
                    title={f}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-accent bg-accent/10 border border-accent-dim/40 rounded px-2 py-0.5 max-w-[240px] truncate"
                  >
                    <span className="text-text-faint">·</span>
                    {f}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[14px] leading-relaxed text-foreground whitespace-pre-wrap">
              {message.content}
              {message.isStreaming && (
                <span className="inline-block w-[7px] h-[15px] bg-accent/80 ml-0.5 align-middle" style={{ animation: "blink-caret 1s step-end infinite" }} />
              )}
            </div>
            {message.error && (
              <div className="text-[13px] text-danger flex items-start gap-2">
                <span className="mt-0.5">✕</span>
                <span>{message.error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
