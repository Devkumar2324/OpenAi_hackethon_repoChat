import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { parseGithubUrl } from "@/lib/github";
import { cloneAndIndex, CloneError } from "@/lib/clone";
import { saveRepo } from "@/lib/store";
import type { RepoRecord, RepoSummary } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json(
      { error: "Please provide a GitHub repository URL." },
      { status: 400 }
    );
  }

  const parsed = parseGithubUrl(url);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "That doesn't look like a valid public GitHub repo URL. Expected something like https://github.com/owner/name.",
      },
      { status: 400 }
    );
  }

  try {
    const { files, fileCount } = await cloneAndIndex(parsed.cloneUrl);

    const record: RepoRecord = {
      id: randomUUID(),
      url: parsed.cloneUrl,
      owner: parsed.owner,
      name: parsed.name,
      files,
      fileCount,
      createdAt: Date.now(),
    };
    saveRepo(record);

    const summary: RepoSummary = {
      id: record.id,
      url: record.url,
      owner: record.owner,
      name: record.name,
      fileCount: record.fileCount,
    };

    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof CloneError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Clone/index failed:", err);
    return NextResponse.json(
      { error: "Something went wrong while cloning the repository." },
      { status: 500 }
    );
  }
}
