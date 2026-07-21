import type { RepoRecord } from "./types";

// Module-level in-memory store. Persists for the life of the server
// process (fine for a single-instance deployment, no DB, no auth).
declare global {
  var __repoStore: Map<string, RepoRecord> | undefined;
}

export const repoStore: Map<string, RepoRecord> =
  global.__repoStore ?? (global.__repoStore = new Map<string, RepoRecord>());

const MAX_REPOS = 20;

export function saveRepo(record: RepoRecord) {
  // Simple eviction so long-running dev/preview instances don't leak memory.
  if (repoStore.size >= MAX_REPOS) {
    const oldestKey = [...repoStore.values()].sort(
      (a, b) => a.createdAt - b.createdAt
    )[0]?.id;
    if (oldestKey) repoStore.delete(oldestKey);
  }
  repoStore.set(record.id, record);
}

export function getRepo(id: string): RepoRecord | undefined {
  return repoStore.get(id);
}
