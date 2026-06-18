import path from "node:path";
import fs from "node:fs/promises";
import { pathExists } from "./pathUtils";
import type { ResolvedAtlasProject } from "./types";

export class ProjectError extends Error {
  readonly exitCode = 2;
}

export function expandHome(input: string): string {
  if (input === "~") return process.env.HOME ?? input;
  if (input.startsWith("~/")) return path.join(process.env.HOME ?? "~", input.slice(2));
  return input;
}

function normalizeInputPath(input: string | undefined, cwd: string): string {
  const raw = input && input.trim() ? input : cwd;
  const expanded = expandHome(raw);
  return path.resolve(cwd, expanded);
}

async function safeRealpath(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch {
    return filePath;
  }
}

async function localConfigPath(atlasRoot: string): Promise<string | null> {
  const candidate = path.join(atlasRoot, ".atlas", "local.yml");
  return await pathExists(candidate) ? candidate : null;
}

async function makeResolved(atlasRoot: string, workspaceRoot: string | null): Promise<ResolvedAtlasProject> {
  return {
    atlasRoot,
    workspaceRoot,
    configPath: path.join(atlasRoot, "atlas.yml"),
    localConfigPath: await localConfigPath(atlasRoot),
    realAtlasRoot: await safeRealpath(atlasRoot)
  };
}

export async function resolveAtlasProject(input?: string, cwd = process.cwd()): Promise<ResolvedAtlasProject> {
  const candidate = normalizeInputPath(input, cwd);
  const directConfig = path.join(candidate, "atlas.yml");
  const nestedRoot = path.join(candidate, "ProofAtlas");
  const nestedConfig = path.join(nestedRoot, "atlas.yml");

  if (await pathExists(directConfig)) {
    return makeResolved(candidate, path.dirname(candidate));
  }

  if (await pathExists(nestedConfig)) {
    return makeResolved(nestedRoot, candidate);
  }

  if (path.basename(candidate) === "ProofAtlas" && await pathExists(candidate)) {
    throw new ProjectError([
      "ProofAtlas/ exists but atlas.yml is missing.",
      "Run atlas init <path> to create a new project, or pass an existing ProofAtlas directory."
    ].join("\n"));
  }

  if (await pathExists(nestedRoot)) {
    throw new ProjectError([
      "ProofAtlas/ exists but atlas.yml is missing.",
      "Run atlas init <path> to create a new project, or pass an existing ProofAtlas directory."
    ].join("\n"));
  }

  throw new ProjectError([
    "Cannot find Proof Atlas project.",
    "Tried:",
    `  ${directConfig}`,
    `  ${nestedConfig}`,
    "Pass either a ProofAtlas directory or a paper/workspace directory that contains ProofAtlas/."
  ].join("\n"));
}

export async function resolveProjectRoot(input?: string, cwd = process.cwd()): Promise<string> {
  return (await resolveAtlasProject(input, cwd)).atlasRoot;
}
