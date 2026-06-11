import path from "node:path";
import { pathExists } from "./pathUtils";

export class ProjectError extends Error {
  readonly exitCode = 2;
}

export async function resolveProjectRoot(input?: string, cwd = process.cwd()): Promise<string> {
  if (input) {
    const candidate = path.resolve(cwd, input);
    if (await pathExists(path.join(candidate, "atlas.yml"))) return candidate;
    if (await pathExists(path.join(candidate, "ProofAtlas", "atlas.yml"))) {
      return path.join(candidate, "ProofAtlas");
    }
    throw new ProjectError(`ProofAtlas project not recognized at ${candidate}`);
  }

  let current = path.resolve(cwd);
  while (true) {
    if (await pathExists(path.join(current, "atlas.yml"))) return current;
    if (await pathExists(path.join(current, "ProofAtlas", "atlas.yml"))) {
      return path.join(current, "ProofAtlas");
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new ProjectError(`ProofAtlas project not recognized from ${cwd}`);
}

