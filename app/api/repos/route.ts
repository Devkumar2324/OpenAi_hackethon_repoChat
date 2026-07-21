import { NextRequest, NextResponse } from "next/server";
import { cloneAndIndex } from "@/lib/repo-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (typeof url !== "string") return NextResponse.json({ error: "A repository URL is required." }, { status: 400 });
    const repo = await cloneAndIndex(url);
    return NextResponse.json({ repoId: repo.id, name: repo.name, fileCount: repo.files.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to index the repository." }, { status: 400 });
  }
}
