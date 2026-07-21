import type { RepoFile, RelevantFile } from "./types";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "how", "what", "why", "when", "where", "who", "which", "does", "do",
  "this", "that", "these", "those", "in", "on", "at", "to", "for", "of",
  "and", "or", "but", "with", "about", "as", "it", "its", "from", "by",
  "can", "i", "you", "we", "my", "your", "our", "please", "explain",
  "tell", "me", "show", "code", "file", "files", "project", "repo",
  "repository",
]);

function extractKeywords(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Very simple keyword matching: score each file by how often the
 * question's keywords appear in its path (weighted higher) and content.
 */
export function selectRelevantFiles(
  files: RepoFile[],
  question: string,
  topN = 5
): { files: RepoFile[]; scored: RelevantFile[] } {
  const keywords = extractKeywords(question);

  if (keywords.length === 0) {
    // Fall back to a stable set: README + shortest/most central files.
    const fallback = [...files]
      .sort((a, b) => {
        const aReadme = /readme/i.test(a.path) ? 0 : 1;
        const bReadme = /readme/i.test(b.path) ? 0 : 1;
        if (aReadme !== bReadme) return aReadme - bReadme;
        return a.size - b.size;
      })
      .slice(0, topN);
    return {
      files: fallback,
      scored: fallback.map((f) => ({ path: f.path, score: 0 })),
    };
  }

  const scored: RelevantFile[] = files.map((file) => {
    const pathLower = file.path.toLowerCase();
    const contentLower = file.content.toLowerCase();
    let score = 0;

    for (const kw of keywords) {
      if (pathLower.includes(kw)) score += 8;

      // Count occurrences in content, capped so one giant file with a
      // common word doesn't dominate.
      let idx = 0;
      let hits = 0;
      while (hits < 20) {
        idx = contentLower.indexOf(kw, idx);
        if (idx === -1) break;
        hits += 1;
        idx += kw.length;
      }
      score += Math.min(hits, 20);
    }

    // Mild boost for README/entrypoint-ish files so answers have context.
    if (/readme/i.test(file.path)) score += 2;

    return { path: file.path, score };
  });

  const ranked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  if (ranked.length === 0) {
    const fallback = [...files]
      .sort((a, b) => a.size - b.size)
      .slice(0, topN);
    return {
      files: fallback,
      scored: fallback.map((f) => ({ path: f.path, score: 0 })),
    };
  }

  const byPath = new Map(files.map((f) => [f.path, f]));
  const selectedFiles = ranked
    .map((r) => byPath.get(r.path))
    .filter((f): f is RepoFile => Boolean(f));

  return { files: selectedFiles, scored: ranked };
}
