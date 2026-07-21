export interface RepoFile {
  path: string;
  content: string;
  size: number;
}

export interface RepoRecord {
  id: string;
  url: string;
  owner: string;
  name: string;
  files: RepoFile[];
  fileCount: number;
  createdAt: number;
}

export interface RepoSummary {
  id: string;
  url: string;
  owner: string;
  name: string;
  fileCount: number;
}

export interface ChatRequestBody {
  repoId: string;
  question: string;
}

export interface RelevantFile {
  path: string;
  score: number;
}
