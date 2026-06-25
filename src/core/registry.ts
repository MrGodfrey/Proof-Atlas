import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectError, resolveAtlasProject } from "./project";
import { pathExists } from "./pathUtils";
import { readYamlFile, writeYamlFile } from "./yaml";
import type { AtlasConfig, RegistryProjectEntry, RegistryProjectListItem, ResolvedAtlasProject } from "./types";

export interface ProjectRegistry {
  version: 1;
  recent: RegistryProjectEntry[];
}

export interface RegistryOptions {
  registryPath?: string;
  cwd?: string;
}

export interface RegisterResult {
  entry: RegistryProjectEntry;
  warning?: string;
}

export function proofAtlasHome(): string {
  return process.env.PROOF_ATLAS_HOME ?? path.join(os.homedir(), ".proof-atlas");
}

export function defaultRegistryPath(): string {
  return path.join(proofAtlasHome(), "projects.yml");
}

export function looksLikePath(value: string): boolean {
  return value.startsWith("/")
    || value.startsWith("~/")
    || value === "~"
    || value === "."
    || value === ".."
    || value.startsWith("./")
    || value.startsWith("../")
    || value.includes("/");
}

export function shortenHome(filePath: string): string {
  const home = os.homedir();
  return filePath === home ? "~" : filePath.startsWith(`${home}${path.sep}`) ? `~/${filePath.slice(home.length + 1)}` : filePath;
}

function registryPath(options?: RegistryOptions): string {
  return options?.registryPath ?? defaultRegistryPath();
}

function emptyRegistry(): ProjectRegistry {
  return { version: 1, recent: [] };
}

function normalizeRegistry(raw: unknown): ProjectRegistry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyRegistry();
  const record = raw as Record<string, unknown>;
  const recent = Array.isArray(record.recent) ? record.recent : [];
  const normalized: RegistryProjectEntry[] = [];
  const ids = new Set<string>();
  const invalidEntries: number[] = [];
  const duplicateIds = new Set<string>();
  for (const [index, item] of recent.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      invalidEntries.push(index);
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.id !== "string"
      || typeof entry.title !== "string"
      || typeof entry.atlas_root !== "string"
      || typeof entry.last_opened !== "string"
    ) {
      invalidEntries.push(index);
      continue;
    }
    if (ids.has(entry.id)) duplicateIds.add(entry.id);
    ids.add(entry.id);
    normalized.push({
      id: entry.id,
      title: entry.title,
      atlas_root: entry.atlas_root,
      workspace_root: typeof entry.workspace_root === "string" ? entry.workspace_root : null,
      last_opened: entry.last_opened
    });
  }
  if (invalidEntries.length) {
    throw new ProjectError(`registry_entry_invalid: projects.yml has invalid recent entries at index ${invalidEntries.join(", ")}.`);
  }
  if (duplicateIds.size) {
    throw new ProjectError(`registry_duplicate_project_id: projects.yml has duplicate project id(s): ${[...duplicateIds].join(", ")}.`);
  }
  return {
    version: 1,
    recent: normalized
  };
}

async function safeRealpath(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch {
    return filePath;
  }
}

function localIsoNow(): string {
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const pad = (value: number) => String(value).padStart(2, "0");
  const local = new Date(now.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 19);
  return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export async function readRegistry(options?: RegistryOptions): Promise<ProjectRegistry> {
  const filePath = registryPath(options);
  if (!(await pathExists(filePath))) return emptyRegistry();
  return normalizeRegistry(await readYamlFile<unknown>(filePath));
}

export async function writeRegistry(registry: ProjectRegistry, options?: RegistryOptions): Promise<void> {
  const filePath = registryPath(options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeYamlFile(filePath, registry);
}

export async function registerResolvedProject(
  project: ResolvedAtlasProject,
  config: Pick<AtlasConfig, "project" | "title">,
  options?: RegistryOptions
): Promise<RegisterResult> {
  const registry = await readRegistry(options);
  const atlasReal = await safeRealpath(project.atlasRoot);
  const existingIndex = await asyncFindIndex(registry.recent, async (entry) => (await safeRealpath(entry.atlas_root)) === atlasReal);
  const last_opened = localIsoNow();

  if (existingIndex >= 0) {
    const existing = registry.recent[existingIndex];
    const entry: RegistryProjectEntry = {
      ...existing,
      id: config.project,
      title: config.title,
      atlas_root: project.atlasRoot,
      workspace_root: project.workspaceRoot,
      last_opened
    };
    registry.recent.splice(existingIndex, 1);
    registry.recent.unshift(entry);
    await writeRegistry(registry, options);
    return { entry };
  }

  const existingId = registry.recent.find((entry) => entry.id === config.project);
  if (existingId && await pathExists(path.join(existingId.atlas_root, "atlas.yml"))) {
    throw new ProjectError(`registry_duplicate_project_id: project id ${config.project} already points to ${existingId.atlas_root}.`);
  }

  const entry: RegistryProjectEntry = {
    id: config.project,
    title: config.title,
    atlas_root: project.atlasRoot,
    workspace_root: project.workspaceRoot,
    last_opened
  };
  if (existingId) registry.recent = registry.recent.filter((item) => item.id !== config.project);
  registry.recent.unshift(entry);
  await writeRegistry(registry, options);
  return { entry };
}

async function asyncFindIndex<T>(items: T[], predicate: (item: T) => Promise<boolean>): Promise<number> {
  for (let index = 0; index < items.length; index += 1) {
    if (await predicate(items[index])) return index;
  }
  return -1;
}

export async function listRegistryProjects(options?: RegistryOptions): Promise<RegistryProjectListItem[]> {
  const registry = await readRegistry(options);
  return Promise.all(registry.recent.map(async (entry) => ({
    ...entry,
    missing: !(await pathExists(path.join(entry.atlas_root, "atlas.yml")))
  })));
}

export async function unregisterProject(id: string, options?: RegistryOptions): Promise<boolean> {
  const registry = await readRegistry(options);
  const before = registry.recent.length;
  registry.recent = registry.recent.filter((entry) => entry.id !== id);
  if (registry.recent.length === before) return false;
  await writeRegistry(registry, options);
  return true;
}

export async function projectFromRegistryId(id: string, options?: RegistryOptions): Promise<ResolvedAtlasProject> {
  const registry = await readRegistry(options);
  const entry = registry.recent.find((item) => item.id === id);
  if (!entry) {
    throw new ProjectError(`Project id not found in registry: ${id}`);
  }
  if (!(await pathExists(path.join(entry.atlas_root, "atlas.yml")))) {
    throw new ProjectError(`Registry project ${id} is missing at ${entry.atlas_root}`);
  }
  return resolveAtlasProject(entry.atlas_root, options?.cwd ?? process.cwd());
}

export async function resolveProjectPathOrId(input: string, options?: RegistryOptions): Promise<ResolvedAtlasProject> {
  let pathError: unknown;
  if (looksLikePath(input)) {
    try {
      return await resolveAtlasProject(input, options?.cwd ?? process.cwd());
    } catch (error) {
      pathError = error;
    }
  }
  try {
    return await projectFromRegistryId(input, options);
  } catch (registryError) {
    if (pathError instanceof ProjectError) {
      throw new ProjectError(`${pathError.message}\n\nRegistry lookup also failed: ${registryError instanceof Error ? registryError.message : String(registryError)}`);
    }
    throw registryError;
  }
}
