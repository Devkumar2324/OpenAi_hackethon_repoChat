import { simpleGit } from "simple-git";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { RepoFile } from "./types";

const MAX_FILE_SIZE = 200 * 1024; // 200KB
const MAX_FILES = 400; // safety cap so huge repos don't blow up memory
const CLONE_TIMEOUT_MS = 45_000;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  ".cache",
  "coverage",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
]);

const SKIP_FILE_PATTERNS = [
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock\.yaml$/i,
  /bun\.lockb?$/i,
  /composer\.lock$/i,
  /gemfile\.lock$/i,
  /cargo\.lock$/i,
];

const BINARY_EXTENSIONS = new Set([
  // images
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg", ".avif",
  // media
  ".mp3", ".mp4", ".wav", ".mov", ".avi", ".webm", ".flac", ".ogg",
  // archives
  ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2",
  // fonts
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  // binaries / compiled
  ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".pyc", ".o", ".a",
  ".wasm", ".node",
  // docs / other
  ".pdf", ".psd", ".ai", ".sketch", ".db", ".sqlite", ".sqlite3",
]);

function isSkippedFile(relPath: string): boolean {
  return SKIP_FILE_PATTERNS.some((p) => p.test(relPath));
}

function isBinaryExt(relPath: string): boolean {
  const ext = path.extname(relPath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

async function walk(dir: string, root: string, out: RepoFile[]) {
  if (out.length >= MAX_FILES) return;

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(root, fullPath).split(path.sep).join("/");

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      await walk(fullPath, root, out);
      continue;
    }

    if (!entry.isFile()) continue;
    if (isSkippedFile(relPath) || isBinaryExt(relPath)) continue;

    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      continue;
    }
    if (stat.size === 0 || stat.size > MAX_FILE_SIZE) continue;

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(fullPath);
    } catch {
      continue;
    }

    // Heuristic binary detection: bail if there's a null byte in the first 8KB.
    const sample = buffer.subarray(0, 8000);
    if (sample.includes(0)) continue;

    const content = buffer.toString("utf-8");
    out.push({ path: relPath, content, size: stat.size });
  }
}

export class CloneError extends Error {}

export async function cloneAndIndex(
  cloneUrl: string
): Promise<{ files: RepoFile[]; fileCount: number }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repochat-"));

  try {
    const git = simpleGit({ timeout: { block: CLONE_TIMEOUT_MS } });

    try {
      await git.clone(cloneUrl, tmpDir, ["--depth", "1", "--single-branch"]);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const notFound =
        /could not read username|repository not found|not found/i.test(raw);
      throw new CloneError(
        notFound
          ? "That repo couldn't be found. Check the URL and make sure it's public."
          : `Could not clone repository: ${raw || "unknown error"}`
      );
    }

    const files: RepoFile[] = [];
    await walk(tmpDir, tmpDir, files);

    if (files.length === 0) {
      throw new CloneError(
        "No readable text files were found in this repository."
      );
    }

    return { files, fileCount: files.length };
  } finally {
    // Best-effort cleanup; don't let cleanup failure mask real errors.
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
