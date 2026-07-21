"use client";

import { useState } from "react";
import RepoIntake from "@/components/RepoIntake";
import ChatPanel from "@/components/ChatPanel";
import type { RepoSummary } from "@/lib/types";

export default function Home() {
  const [repo, setRepo] = useState<RepoSummary | null>(null);

  return (
    <main className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col px-4 sm:px-6">
        {!repo ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <RepoIntake onIndexed={setRepo} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col py-6 min-h-0">
            <ChatPanel repo={repo} onReset={() => setRepo(null)} />
          </div>
        )}
      </div>
      <footer className="text-center text-[11px] text-text-faint py-4 border-t border-border">

        repochat — clones public repos to a temp dir, indexes text files in memory, no data leaves this session
      </footer>
    </main>
  );
}
