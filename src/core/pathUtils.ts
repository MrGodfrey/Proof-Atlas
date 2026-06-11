import path from "node:path";
import fs from "node:fs/promises";

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function relativePosix(from: string, to: string): string {
  return toPosixPath(path.relative(from, to));
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function listFilesRecursive(root: string, predicate?: (filePath: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (!predicate || predicate(full)) {
        out.push(full);
      }
    }
  }
  await walk(root);
  out.sort();
  return out;
}
