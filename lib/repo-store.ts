import { randomUUID } from "crypto";
import { mkdtemp, readdir, readFile, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import simpleGit from "simple-git";

export type RepoFile = { path: string; content: string };
export type IndexedRepo = { id: string; url: string; name: string; files: RepoFile[]; createdAt: number };

const repos = new Map<string, IndexedRepo>();
const MAX_FILE_SIZE = 200 * 1024;
const ignoredDirectories = new Set([".git", "node_modules", ".next", "dist", "build", "coverage"]);
const ignoredFileNames = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "composer.lock", "gemfile.lock", "cargo.lock"]);
const binaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".avif", ".pdf", ".zip", ".gz", ".tar", ".7z", ".mp3", ".mp4", ".mov", ".woff", ".woff2", ".ttf", ".eot", ".exe", ".dll", ".so", ".bin"]);

export function getRepo(id: string) {
  return repos.get(id);
}

function parseGitHubUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid public GitHub repository URL.");
  }
  if (url.hostname !== "github.com") throw new Error("Only github.com repository URLs are supported.");
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo) throw new Error("Enter a repository URL like https://github.com/owner/repository.");
  return { cloneUrl: `https://github.com/${owner}/${repo.replace(/\.git$/, "")}.git`, name: `${owner}/${repo.replace(/\.git$/, "")}` };
}

function isProbablyText(buffer: Buffer) {
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, 8000);
  let controlCharacters = 0;
  for (const byte of sample) if (byte < 9 || (byte > 13 && byte < 32)) controlCharacters++;
  return sample.length === 0 || controlCharacters / sample.length < 0.05;
}

async function collectFiles(root: string, directory = root): Promise<RepoFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: RepoFile[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...(await collectFiles(root, path.join(directory, entry.name))));
      continue;
    }
    if (!entry.isFile() || ignoredFileNames.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (binaryExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const details = await stat(fullPath);
    if (details.size > MAX_FILE_SIZE) continue;
    const buffer = await readFile(fullPath);
    if (!isProbablyText(buffer)) continue;
    files.push({ path: path.relative(root, fullPath).replaceAll(path.sep, "/"), content: buffer.toString("utf8") });
  }
  return files;
}

export async function cloneAndIndex(inputUrl: string): Promise<IndexedRepo> {
  const { cloneUrl, name } = parseGitHubUrl(inputUrl);
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "repochat-"));
  try {
    await simpleGit().clone(cloneUrl, temporaryDirectory, ["--depth", "1", "--single-branch"]);
    const files = await collectFiles(temporaryDirectory);
    if (!files.length) throw new Error("No readable text files were found in this repository.");
    const repo = { id: randomUUID(), url: inputUrl.trim(), name, files, createdAt: Date.now() };
    repos.set(repo.id, repo);
    return repo;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clone this repository.";
    throw new Error(message.includes("not found") || message.includes("Repository not found") ? "Repository not found or not public." : `Could not clone and index this repository: ${message}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function findRelevantFiles(files: RepoFile[], question: string, limit = 5) {
  const terms = question.toLowerCase().match(/[a-z0-9_./-]{2,}/g) ?? [];
  const uniqueTerms = [...new Set(terms)].slice(0, 20);
  return files
    .map((file) => {
      const pathText = file.path.toLowerCase();
      const content = file.content.toLowerCase();
      const score = uniqueTerms.reduce((total, term) => total + (pathText.includes(term) ? 8 : 0) + (content.split(term).length - 1), 0);
      return { ...file, score };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}
