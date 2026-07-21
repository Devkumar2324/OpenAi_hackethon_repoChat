"use client";

import { FormEvent, useState } from "react";

type Message = { role: "user" | "assistant"; text: string; files?: string[] };

export default function Home() {
  const [url, setUrl] = useState("");
  const [repo, setRepo] = useState<{ id: string; name: string; fileCount: number } | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  async function indexRepository(event: FormEvent) {
    event.preventDefault();
    setError("");
    setIsIndexing(true);
    setStatus("Cloning repository…");
    try {
      const response = await fetch("/api/repos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRepo({ id: data.repoId, name: data.name, fileCount: data.fileCount });
      setMessages([]);
      setStatus("Indexed and ready to chat.");
    } catch (caught) {
      setRepo(null);
      setStatus("");
      setError(caught instanceof Error ? caught.message : "Unable to index the repository.");
    } finally {
      setIsIndexing(false);
    }
  }

  async function askQuestion(event: FormEvent) {
    event.preventDefault();
    if (!repo || !question.trim() || isAsking) return;
    const asked = question.trim();
    setQuestion("");
    setError("");
    setIsAsking(true);
    setMessages((current) => [...current, { role: "user", text: asked }, { role: "assistant", text: "" }]);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repoId: repo.id, question: asked }) });
      if (!response.ok || !response.body) throw new Error((await response.text()) || "Unable to get an answer.");
      const filesHeader = response.headers.get("X-Context-Files");
      const files: string[] = filesHeader ? JSON.parse(decodeURIComponent(filesHeader)) : [];
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages((current) => [...current.slice(0, -1), { role: "assistant", text: answer, files }]);
      }
    } catch (caught) {
      setMessages((current) => current.slice(0, -1));
      setError(caught instanceof Error ? caught.message : "Unable to get an answer.");
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <main>
      <section className="shell">
        <header>
          <div className="mark">R</div>
          <div><h1>RepoChat</h1><p>Understand any public GitHub repo, one question at a time.</p></div>
        </header>

        <form className="repo-form" onSubmit={indexRepository}>
          <label htmlFor="repo-url">Public GitHub repository</label>
          <div className="input-row">
            <input id="repo-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/repository" required disabled={isIndexing} />
            <button type="submit" disabled={isIndexing}>{isIndexing ? "Indexing…" : "Load repo"}</button>
          </div>
          {status && <p className="status">{status}{repo && ` · ${repo.name} · ${repo.fileCount} files`}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </form>

        {repo ? <section className="chat" aria-label="Repository chat">
          <div className="chat-heading"><span>Chatting with <strong>{repo.name}</strong></span><span className="ready">● Ready</span></div>
          <div className="messages">
            {messages.length === 0 && <div className="empty"><span>✦</span><h2>What would you like to know?</h2><p>Ask about architecture, data flow, a specific file, or where a feature is implemented.</p></div>}
            {messages.map((message, index) => <article className={`message ${message.role}`} key={index}>
              <div className="role">{message.role === "user" ? "You" : "RepoChat"}</div>
              <div className="message-text">{message.text || <span className="cursor">Thinking</span>}</div>
              {message.files && <details><summary>Context used · {message.files.length} files</summary><ul>{message.files.map((file) => <li key={file}>{file}</li>)}</ul></details>}
            </article>)}
          </div>
          <form className="ask-form" onSubmit={askQuestion}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about this repository…" disabled={isAsking} />
            <button type="submit" disabled={isAsking || !question.trim()}>{isAsking ? "Thinking…" : "Ask"}</button>
          </form>
        </section> : <section className="placeholder"><span>⌘</span><p>Load a repository to begin exploring its code.</p></section>}
      </section>
    </main>
  );
}
