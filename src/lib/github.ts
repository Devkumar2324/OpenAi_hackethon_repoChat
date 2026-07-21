export interface ParsedRepo {
  owner: string;
  name: string;
  cloneUrl: string;
}

const GITHUB_URL_PATTERNS = [
  /^https?:\/\/(www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/i,
  /^git@github\.com:([\w.-]+)\/([\w.-]+?)(\.git)?$/i,
];

export function parseGithubUrl(input: string): ParsedRepo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  for (const pattern of GITHUB_URL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      // pattern 0: [_, www, owner, name, .git]
      // pattern 1: [_, owner, name, .git]
      const owner = pattern === GITHUB_URL_PATTERNS[0] ? match[2] : match[1];
      const name = pattern === GITHUB_URL_PATTERNS[0] ? match[3] : match[2];
      if (!owner || !name) continue;
      return {
        owner,
        name,
        cloneUrl: `https://github.com/${owner}/${name}.git`,
      };
    }
  }
  return null;
}
