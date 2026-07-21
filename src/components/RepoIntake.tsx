"use client";

import { useState, FormEvent } from "react";
import type { RepoSummary } from "@/lib/types";

interface Props {
  onIndexed: (repo: RepoSummary) => void;
}

type Status = "idle" | "cloning" | "error";

const CLONE_STEPS = [
  "resolving repo",
  "shallow clone --depth 1",
  "walking file tree",
  "indexing text files",
];

export default function RepoIntake({ onIndexed }: Props) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || status === "cloning") return;

    setStatus("cloning");
    setError(null);
    setStepIndex(0);

    const stepTimer = window.setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, CLONE_STEPS.length - 1));
    }, 900);

    try {
      const res = await fetch("/api/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to clone repository.");
      }

      window.clearInterval(stepTimer);
      setStatus("idle");
      onIndexed(data as RepoSummary);
    } catch (err) {
      window.clearInterval(stepTimer);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto rise-in">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 text-[13px] text-accent mb-4 tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
          repochat v0.1
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mb-3">
          Ask any public repo{" "}
          <span className="text-accent">a question.</span>
        </h1>
        <p className="text-text-dim text-sm sm:text-base leading-relaxed">
          Paste a GitHub URL. RepoChat clones it, reads the source, and
          answers questions grounded in the actual files — every reply shows
          its receipts.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-stretch gap-2 bg-panel border border-border rounded-lg p-1.5 focus-within:border-accent-dim transition-colors">
          <div className="flex items-center pl-2 text-text-faint text-sm select-none">
            $
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={status === "cloning"}
            spellCheck={false}
            autoFocus
            className="flex-1 bg-transparent outline-none text-sm sm:text-[15px] text-foreground placeholder:text-text-faint py-2.5 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status === "cloning" || !url.trim()}
            className="shrink-0 px-4 sm:px-5 rounded-md bg-accent text-[#04140a] text-sm font-semibold hover:bg-accent/90 active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none"
          >
            {status === "cloning" ? "cloning…" : "clone & index"}
          </button>
        </div>
      </form>

      <div className="mt-4 min-h-[28px]">
        {status === "cloning" && (
          <div className="flex items-center gap-2.5 text-[13px] text-text-dim rise-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            {CLONE_STEPS[stepIndex]}…
          </div>
        )}
        {status === "error" && error && (
          <div className="flex items-start gap-2 text-[13px] text-danger rise-in">
            <span className="mt-0.5">✕</span>
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[12px] text-text-faint">
        <span>no auth</span>
        <span className="text-border">·</span>
        <span>no database</span>
        <span className="text-border">·</span>
        <span>public repos only</span>
        <span className="text-border">·</span>
        <span>shallow clone, depth 1</span>
      </div>
    </div>
  );
}
