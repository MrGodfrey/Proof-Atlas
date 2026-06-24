import fs from "node:fs/promises";
import path from "node:path";
import {
  defaultDisplayAs,
  DEFAULT_IMPORTANCE,
  DEFAULT_PROVENANCE,
  defaultStatus,
  NAME_PATTERN,
  REVERSE_EDGE,
  UID_PATTERN
} from "./constants";
import {
  EDGE_TYPES,
  EDGE_STRENGTHS,
  DISPLAY_AS,
  IMPORTANCE,
  KINDS,
  NOTE_ROLES,
  PRIORITY,
  PROVENANCE,
  ROLES_BY_KIND,
  STATUS
} from "./types";
import type {
  AtlasConfig,
  AtlasProblem,
  AtlasRouteView,
  AtlasView,
  AtlasWorkspaceConfig,
  BodyFile,
  BibRegistryEntry,
  BibTrust,
  EdgeRef,
  EdgeMap,
  EdgeType,
  IssuePriority,
  NormalizedBibRegistry,
  NormalizedCitation,
  NormalizedGraph,
  NormalizedObject,
  NormalizedWorkspace,
  ObjectOrigin,
  ObjectKind,
  ObjectRole,
  RawObjectRecord,
  ReferenceMountConfig,
  ReferenceMountMode,
  RepresentationMode,
  ResolvedAtlasProject,
  ResolvedReferenceMount,
  RouteProfile,
  RouteView,
  SourceResultInfo,
  ViewItem
} from "./types";
import { addUniqueEdge, edgeTargets, hardEdgeTargets } from "./edgeUtils";
import { isProofTreeRoot } from "./proofObjects";
import {
  findForbiddenTexMacros,
  parseInvalidEmbedOptionSpacing,
  parseMarkdownReferences
} from "./markdownRefs";
import { findMarkdownRenderIssues } from "./markdownLint";
import { pathExists, relativePosix, isPlainObject, listFilesRecursive, toPosixPath } from "./pathUtils";
import { problem, resetProblemCounter } from "./problems";
import { expandHome, resolveAtlasProject } from "./project";
import { proofAtlasHome } from "./registry";
import { renderMarkdownBlock, splitMarkdownBlocks } from "./render";
import { readYamlFile } from "./yaml";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function includesReadonly<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function addUnique(map: Partial<Record<string, string[]>>, key: string, value: string): void {
  const list = map[key] ?? [];
  if (!list.includes(value)) list.push(value);
  map[key] = list;
}

function normalizeDefaultView(value: unknown): string {
  return typeof value === "string" && value.trim() ? toPosixPath(value.trim()) : "views/dashboard.md";
}

function normalizeWorkspace(raw: unknown, problems: AtlasProblem[], sourcePath: string): AtlasWorkspaceConfig | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_workspace",
      message: "workspace must be a YAML mapping.",
      path: sourcePath,
      strict: true
    }));
    return undefined;
  }
  const workspace: AtlasWorkspaceConfig = {};
  if (raw.root !== undefined) {
    if (typeof raw.root === "string" && raw.root.trim()) {
      workspace.root = raw.root;
    } else {
      problems.push(problem({
        severity: "error",
        code: "invalid_workspace_root",
        message: "workspace.root must be a non-empty string.",
        path: sourcePath,
        strict: true
      }));
    }
  }
  if (raw.tex_main !== undefined) {
    if (typeof raw.tex_main === "string" && raw.tex_main.trim()) {
      workspace.tex_main = raw.tex_main;
    } else {
      problems.push(problem({
        severity: "error",
        code: "invalid_workspace_tex_main",
        message: "workspace.tex_main must be a non-empty string.",
        path: sourcePath,
        strict: true
      }));
    }
  }
  if (raw.bib !== undefined) {
    const rawBib = raw.bib;
    const bib = asStringArray(rawBib);
    if (Array.isArray(rawBib) && bib && bib.length === rawBib.length) {
      workspace.bib = bib;
    } else {
      problems.push(problem({
        severity: "error",
        code: "invalid_workspace_bib",
        message: "workspace.bib must be a list of strings.",
        path: sourcePath,
        strict: true
      }));
    }
  }
  return Object.keys(workspace).length ? workspace : undefined;
}

function normalizeReferences(raw: unknown, problems: AtlasProblem[], sourcePath: string): AtlasConfig["references"] | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_references",
      message: "references must be a YAML mapping.",
      path: sourcePath,
      strict: true
    }));
    return undefined;
  }
  const mountsRaw = raw.mounts;
  if (mountsRaw === undefined) return { mounts: [] };
  if (!Array.isArray(mountsRaw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_reference_mounts",
      message: "references.mounts must be a list.",
      path: sourcePath,
      strict: true
    }));
    return { mounts: [] };
  }
  const mounts: ReferenceMountConfig[] = [];
  for (const item of mountsRaw) {
    if (!isPlainObject(item)) {
      problems.push(problem({
        severity: "error",
        code: "invalid_reference_mount",
        message: "references.mounts entries must be YAML mappings.",
        path: sourcePath,
        strict: true
      }));
      continue;
    }
    if (typeof item.id !== "string" || !item.id.trim()) {
      problems.push(problem({
        severity: "error",
        code: "invalid_reference_mount_id",
        message: "references.mounts entries need a non-empty id.",
        path: sourcePath,
        strict: true
      }));
      continue;
    }
    const mode: ReferenceMountMode = item.mode === "readwrite" ? "readwrite" : "readonly";
    if (item.mode !== undefined && item.mode !== "readonly" && item.mode !== "readwrite") {
      problems.push(problem({
        severity: "error",
        code: "invalid_reference_mount_mode",
        message: "references.mounts.mode must be readonly or readwrite.",
        path: sourcePath,
        target: item.id,
        strict: true
      }));
    }
    mounts.push({ id: item.id.trim(), mode });
  }
  return { mounts };
}

function mergeLocalConfig(config: AtlasConfig, raw: unknown, problems: AtlasProblem[]): AtlasConfig {
  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_local_yml",
      message: ".atlas/local.yml must be a YAML mapping.",
      path: ".atlas/local.yml",
      strict: true
    }));
    return config;
  }
  const allowed = new Set(["workspace", "reference_atlases"]);
  for (const key of Object.keys(raw)) {
    if (allowed.has(key)) continue;
    problems.push(problem({
      severity: "error",
      code: "invalid_local_override",
      message: `.atlas/local.yml may not override ${key}; only workspace path fields and reference_atlases are local.`,
      path: ".atlas/local.yml",
      strict: true
    }));
  }
  const localWorkspace = normalizeWorkspace(raw.workspace, problems, ".atlas/local.yml");
  if (!localWorkspace) return config;
  return {
    ...config,
    workspace: {
      ...(config.workspace ?? {}),
      ...localWorkspace
    }
  };
}

function resolvePathFromAtlas(atlasRoot: string, value: string): string {
  const expanded = expandHome(value);
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(atlasRoot, expanded);
}

function resolveWorkspaceFile(atlasRoot: string, workspaceRoot: string | null, value: string): string {
  const expanded = expandHome(value);
  if (path.isAbsolute(expanded)) return path.normalize(expanded);
  if (workspaceRoot && !expanded.startsWith("../") && !expanded.startsWith("./")) {
    return path.resolve(workspaceRoot, expanded);
  }
  return path.resolve(atlasRoot, expanded);
}

function defaultReferenceAtlasRegistryPath(): string {
  return path.join(proofAtlasHome(), "reference-atlases.yml");
}

function resolveConfigPath(baseRoot: string, value: string): string {
  const expanded = expandHome(value);
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(baseRoot, expanded);
}

function safeMapping(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined;
}

async function safeRealpath(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch {
    return filePath;
  }
}

async function readReferenceAtlasMappings(project: ResolvedAtlasProject, problems: AtlasProblem[]): Promise<Record<string, string>> {
  const mappings: Record<string, string> = {};
  const readMappings = async (filePath: string, baseRoot: string, required: boolean) => {
    if (!(await pathExists(filePath))) {
      if (required) {
        problems.push(problem({
          severity: "error",
          code: "missing_reference_atlas_registry",
          message: `Reference atlas registry does not exist: ${filePath}.`,
          path: filePath,
          strict: true
        }));
      }
      return;
    }
    const raw = await readYamlFile<unknown>(filePath);
    const rootMap = safeMapping(raw)?.reference_atlases;
    if (rootMap === undefined) return;
    if (!isPlainObject(rootMap)) {
      problems.push(problem({
        severity: "error",
        code: "invalid_reference_atlas_registry",
        message: "reference_atlases must be a YAML mapping of id to root.",
        path: filePath,
        strict: true
      }));
      return;
    }
    for (const [id, entry] of Object.entries(rootMap)) {
      const root = typeof entry === "string"
        ? entry
        : isPlainObject(entry) && typeof entry.root === "string"
          ? entry.root
          : undefined;
      if (!root?.trim()) {
        problems.push(problem({
          severity: "error",
          code: "invalid_reference_atlas_root",
          message: `reference_atlases.${id}.root must be a non-empty string.`,
          path: filePath,
          target: id,
          strict: true
        }));
        continue;
      }
      mappings[id] = resolveConfigPath(baseRoot, root);
    }
  };

  await readMappings(defaultReferenceAtlasRegistryPath(), process.cwd(), false);
  if (project.localConfigPath) await readMappings(project.localConfigPath, project.atlasRoot, false);
  return mappings;
}

async function findNearbyReferenceAtlas(projectRoot: string, id: string): Promise<string | undefined> {
  let cursor = projectRoot;
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(cursor, "reference-atlas", "ProofAtlas");
    const configPath = path.join(candidate, "atlas.yml");
    if (await pathExists(configPath)) {
      const raw = await readYamlFile<unknown>(configPath);
      if (isPlainObject(raw) && raw.project === id) return candidate;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return undefined;
}

async function resolveReferenceMounts(
  project: ResolvedAtlasProject,
  config: AtlasConfig,
  problems: AtlasProblem[]
): Promise<ResolvedReferenceMount[]> {
  const requested = config.references?.mounts ?? [];
  if (requested.length === 0) return [];
  const mappings = await readReferenceAtlasMappings(project, problems);
  const mounts: ResolvedReferenceMount[] = [];
  const seen = new Set<string>();
  for (const mount of requested) {
    if (seen.has(mount.id)) {
      problems.push(problem({
        severity: "error",
        code: "duplicate_reference_atlas_mount",
        message: `Reference atlas mount ${mount.id} is declared more than once.`,
        path: "atlas.yml",
        target: mount.id,
        strict: true
      }));
      continue;
    }
    seen.add(mount.id);
    const root = mappings[mount.id] ?? await findNearbyReferenceAtlas(project.atlasRoot, mount.id);
    if (!root) {
      const message = `Project declares reference atlas ${mount.id}, but no local path mapping was found.`;
      problems.push(problem({
        severity: "error",
        code: "missing_reference_atlas_mount",
        message,
        path: "atlas.yml",
        target: mount.id,
        strict: true
      }));
      mounts.push({ id: mount.id, mode: mount.mode, root: null, realRoot: null, status: "missing", message });
      continue;
    }
    const atlasFile = path.join(root, "atlas.yml");
    if (!(await pathExists(atlasFile))) {
      const message = `Reference atlas ${mount.id} does not contain atlas.yml at ${root}.`;
      problems.push(problem({
        severity: "error",
        code: "missing_reference_atlas_mount",
        message,
        path: "atlas.yml",
        target: mount.id,
        strict: true
      }));
      mounts.push({ id: mount.id, mode: mount.mode, root, realRoot: await safeRealpath(root), status: "missing", message });
      continue;
    }
    const realRoot = await safeRealpath(root);
    if (realRoot === project.realAtlasRoot) continue;
    mounts.push({ id: mount.id, mode: mount.mode, root, realRoot, status: "mounted" });
  }
  return mounts;
}

function normalizeWorkspacePaths(project: ResolvedAtlasProject, config: AtlasConfig): NormalizedWorkspace {
  const root = config.workspace?.root
    ? resolvePathFromAtlas(project.atlasRoot, config.workspace.root)
    : project.workspaceRoot;
  return {
    root,
    texMain: config.workspace?.tex_main ? resolveWorkspaceFile(project.atlasRoot, root, config.workspace.tex_main) : null,
    bib: (config.workspace?.bib ?? []).map((item) => resolveWorkspaceFile(project.atlasRoot, root, item))
  };
}

async function loadConfig(project: ResolvedAtlasProject, problems: AtlasProblem[]): Promise<AtlasConfig> {
  const raw = await readYamlFile<Record<string, unknown>>(project.configPath);
  const fallbackProject = path.basename(path.dirname(project.atlasRoot)) || "proof-atlas";
  const config: AtlasConfig = {
    schema_version: "0.1",
    project: typeof raw?.project === "string" ? raw.project : fallbackProject,
    title: typeof raw?.title === "string" ? raw.title : fallbackProject,
    default_view: normalizeDefaultView(raw?.default_view),
    math_renderer: raw?.math_renderer === "mathjax" ? "mathjax" : "katex",
    atlas_type: raw?.atlas_type === "reference" ? "reference" : "project"
  };

  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_atlas_yml",
      message: "atlas.yml must be a YAML mapping.",
      path: "atlas.yml",
      strict: true
    }));
    return config;
  }
  for (const key of ["schema_version", "project", "title"] as const) {
    if (typeof raw[key] !== "string" || !raw[key]) {
      problems.push(problem({
        severity: "error",
        code: "missing_atlas_field",
        message: `atlas.yml is missing required field ${key}.`,
        path: "atlas.yml",
        strict: true
      }));
    }
  }
  if (raw.schema_version !== "0.1") {
    problems.push(problem({
      severity: "error",
      code: "invalid_schema_version",
      message: `schema_version must be "0.1".`,
      path: "atlas.yml",
      strict: true
    }));
  }
  const workspace = normalizeWorkspace(raw.workspace, problems, "atlas.yml");
  if (workspace) config.workspace = workspace;
  const references = normalizeReferences(raw.references, problems, "atlas.yml");
  if (references) config.references = references;

  if (raw.math_renderer && !["katex", "mathjax"].includes(String(raw.math_renderer))) {
    problems.push(problem({
      severity: "error",
      code: "invalid_math_renderer",
      message: `math_renderer must be katex or mathjax.`,
      path: "atlas.yml",
      strict: true
    }));
  }
  if (raw.atlas_type !== undefined && !["project", "reference"].includes(String(raw.atlas_type))) {
    problems.push(problem({
      severity: "error",
      code: "invalid_atlas_type",
      message: "atlas_type must be project or reference.",
      path: "atlas.yml",
      strict: true
    }));
  }
  if (!project.localConfigPath) return config;
  return mergeLocalConfig(config, await readYamlFile<Record<string, unknown>>(project.localConfigPath), problems);
}

interface LoadRoot {
  root: string;
  originKind: ObjectOrigin["kind"];
  atlasId?: string;
  readonly: boolean;
}

interface RawObjectLoadRecord {
  file: string;
  data: RawObjectRecord;
  loadRoot: LoadRoot;
}

async function loadRawObjects(loadRoot: LoadRoot): Promise<RawObjectLoadRecord[]> {
  const root = loadRoot.root;
  const objectsDir = path.join(root, "objects");
  const out: RawObjectLoadRecord[] = [];
  let entries;
  try {
    entries = await fs.readdir(objectsDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const objectFile = path.join(objectsDir, entry.name, "object.yml");
    if (!(await pathExists(objectFile))) continue;
    out.push({ file: objectFile, data: await readYamlFile<RawObjectRecord>(objectFile), loadRoot });
  }
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;
}

function normalizeCitation(
  raw: unknown,
  objectPath: string,
  objectName: string,
  objectUid: string,
  problems: AtlasProblem[]
): NormalizedCitation | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_citation",
      message: "citation must be a YAML mapping.",
      path: objectPath,
      objectName,
      objectUid,
      strict: true
    }));
    return undefined;
  }
  if (typeof raw.bibfile === "string") {
    problems.push(problem({
      severity: "warning",
      code: "citation_bibfile_deprecated",
      message: "citation.bibfile is derived from the bib registry; do not keep it as a long-term object fact.",
      path: objectPath,
      objectName,
      objectUid,
      strict: false
    }));
  }
  if (typeof raw.bibkey !== "string" || !raw.bibkey.trim()) {
    problems.push(problem({
      severity: "error",
      code: "invalid_citation_bibkey",
      message: "citation.bibkey must be a non-empty string.",
      path: objectPath,
      objectName,
      objectUid,
      strict: true
    }));
    return undefined;
  }
  return { bibkey: raw.bibkey.trim() };
}

function normalizeSourceResult(
  raw: unknown,
  objectPath: string,
  objectName: string,
  objectUid: string,
  problems: AtlasProblem[]
): SourceResultInfo | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_source_result",
      message: "source_result must be a YAML mapping.",
      path: objectPath,
      objectName,
      objectUid,
      strict: true
    }));
    return undefined;
  }
  const out: SourceResultInfo = {};
  if (raw.parent !== undefined) {
    if (typeof raw.parent === "string" && raw.parent.trim()) out.parent = raw.parent.trim();
    else {
      problems.push(problem({
        severity: "error",
        code: "invalid_source_result_parent",
        message: "source_result.parent must be a non-empty object name.",
        path: objectPath,
        objectName,
        objectUid,
        strict: true
      }));
    }
  }
  if (raw.location !== undefined) {
    if (typeof raw.location === "string" && raw.location.trim()) out.location = raw.location.trim();
    else {
      problems.push(problem({
        severity: "error",
        code: "invalid_source_result_location",
        message: "source_result.location must be a non-empty string.",
        path: objectPath,
        objectName,
        objectUid,
        strict: true
      }));
    }
  }
  if (raw.statement_fidelity !== undefined) {
    if (typeof raw.statement_fidelity === "string" && raw.statement_fidelity.trim()) out.statement_fidelity = raw.statement_fidelity.trim();
    else {
      problems.push(problem({
        severity: "error",
        code: "invalid_source_result_statement_fidelity",
        message: "source_result.statement_fidelity must be a non-empty string.",
        path: objectPath,
        objectName,
        objectUid,
        strict: true
      }));
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeEdges(
  raw: unknown,
  objectPath: string,
  objectName: string,
  objectUid: string,
  problems: AtlasProblem[]
): EdgeMap {
  const edges: EdgeMap = {};
  if (raw == null) return edges;
  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_edges",
      message: "edges must be a YAML mapping.",
      path: objectPath,
      objectName,
      objectUid,
      strict: true
    }));
    return edges;
  }
  for (const [edgeKey, value] of Object.entries(raw)) {
    if (!includesReadonly(EDGE_TYPES, edgeKey)) {
      problems.push(problem({
        severity: "error",
        code: "invalid_edge_type",
        message: `Unsupported edge type ${edgeKey}.`,
        path: objectPath,
        objectName,
        objectUid,
        strict: true
      }));
      continue;
    }
    if (!Array.isArray(value)) {
      problems.push(problem({
        severity: "error",
        code: "invalid_edge_targets",
        message: `edges.${edgeKey} must be a list of edge references.`,
        path: objectPath,
        objectName,
        objectUid,
        strict: true
      }));
      continue;
    }
    const refs: EdgeRef[] = [];
    for (const item of value) {
      if (!isPlainObject(item)) {
        problems.push(problem({
          severity: "error",
          code: "invalid_edge_ref",
          message: `edges.${edgeKey} entries must be mappings with target, strength, and reason fields.`,
          path: objectPath,
          objectName,
          objectUid,
          strict: true
        }));
        continue;
      }
      if (typeof item.target !== "string" || !item.target.trim()) {
        problems.push(problem({
          severity: "error",
          code: "invalid_edge_ref_target",
          message: `edges.${edgeKey} entry is missing a non-empty target.`,
          path: objectPath,
          objectName,
          objectUid,
          strict: true
        }));
        continue;
      }
      const strength = item.strength === undefined ? "hard" : item.strength;
      if (!includesReadonly(EDGE_STRENGTHS, strength)) {
        problems.push(problem({
          severity: "error",
          code: "invalid_edge_ref_strength",
          message: `edges.${edgeKey} strength must be hard or soft.`,
          path: objectPath,
          objectName,
          objectUid,
          target: item.target,
          strict: true
        }));
        continue;
      }
      if (item.reason !== undefined && typeof item.reason !== "string") {
        problems.push(problem({
          severity: "error",
          code: "invalid_edge_ref_reason",
          message: `edges.${edgeKey} reason must be a string when present.`,
          path: objectPath,
          objectName,
          objectUid,
          target: item.target,
          strict: true
        }));
        continue;
      }
      const ref: EdgeRef = {
        target: item.target.trim(),
        strength,
        ...(typeof item.reason === "string" && item.reason.trim() ? { reason: item.reason } : {})
      };
      if (!refs.some((existing) => existing.target === ref.target && existing.strength === ref.strength && existing.reason === ref.reason)) {
        refs.push(ref);
      }
    }
    if (refs.length) edges[edgeKey] = refs;
  }
  return edges;
}

function normalizeObject(
  raw: RawObjectRecord,
  file: string,
  loadRoot: LoadRoot,
  index: number,
  problems: AtlasProblem[]
): NormalizedObject {
  const root = loadRoot.root;
  const objectPath = relativePosix(root, file);
  const dir = relativePosix(root, path.dirname(file));
  const folderName = path.basename(path.dirname(file));

  const rawUid = asString(raw.uid);
  const rawName = asString(raw.name);
  const uid = rawUid ?? `obj_00000000_bad${index}`;
  const name = rawName ?? `invalid.object.${index}`;

  if (!rawUid || !UID_PATTERN.test(rawUid)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_uid",
      message: `uid must match ${UID_PATTERN.source}.`,
      path: objectPath,
      objectUid: rawUid,
      objectName: rawName,
      strict: true
    }));
  }
  if (!rawName || !NAME_PATTERN.test(rawName)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_name",
      message: `name must match ${NAME_PATTERN.source}.`,
      path: objectPath,
      objectUid: rawUid,
      objectName: rawName,
      strict: true
    }));
  }
  if (rawName && folderName !== rawName) {
    problems.push(problem({
      severity: "warning",
      code: "folder_name_mismatch",
      message: `Object folder ${folderName} does not match object name ${rawName}.`,
      path: objectPath,
      objectUid: rawUid,
      objectName: rawName,
      strict: false
    }));
  }

  let kind: ObjectKind = "math";
  if (includesReadonly(KINDS, raw.kind)) {
    kind = raw.kind;
  } else {
    problems.push(problem({
      severity: "error",
      code: "invalid_kind",
      message: `kind must be one of ${KINDS.join(", ")}.`,
      path: objectPath,
      objectUid: uid,
      objectName: name,
      strict: true
    }));
  }

  const defaultRole = kind === "math" ? "claim" : kind === "issue" ? "gap" : NOTE_ROLES[0];
  let role: ObjectRole = defaultRole;
  if (typeof raw.role === "string" && (ROLES_BY_KIND[kind] as readonly string[]).includes(raw.role)) {
    role = raw.role as ObjectRole;
  } else {
    problems.push(problem({
      severity: "error",
      code: "invalid_role",
      message: `role ${String(raw.role)} is not valid for kind ${kind}.`,
      path: objectPath,
      objectUid: uid,
      objectName: name,
      strict: true
    }));
  }

  const title = asString(raw.title) || name;
  if (!asString(raw.title)) {
    problems.push(problem({
      severity: "error",
      code: "missing_title",
      message: "title is required.",
      path: objectPath,
      objectUid: uid,
      objectName: name,
      strict: true
    }));
  }

  const body = asStringArray(raw.body) ?? [];
  if (!Array.isArray(raw.body) || body.length !== raw.body.length || body.length === 0) {
    problems.push(problem({
      severity: "error",
      code: "invalid_body",
      message: "body must be a non-empty list of Markdown files.",
      path: objectPath,
      objectUid: uid,
      objectName: name,
      strict: true
    }));
  }

  let display_as = defaultDisplayAs(kind, role);
  if (raw.display_as !== undefined) {
    if (includesReadonly(DISPLAY_AS, raw.display_as)) {
      display_as = raw.display_as;
    } else {
      problems.push(problem({
        severity: "error",
        code: "invalid_display_as",
        message: `display_as ${String(raw.display_as)} is not valid.`,
        path: objectPath,
        objectUid: uid,
        objectName: name,
        strict: true
      }));
    }
  }

  let importance = DEFAULT_IMPORTANCE;
  if (raw.importance !== undefined) {
    if (includesReadonly(IMPORTANCE, raw.importance)) {
      importance = raw.importance;
    } else {
      problems.push(problem({
        severity: "error",
        code: "invalid_importance",
        message: `importance ${String(raw.importance)} is not valid.`,
        path: objectPath,
        objectUid: uid,
        objectName: name,
        strict: true
      }));
    }
  }

  let status = defaultStatus(kind);
  if (raw.status !== undefined) {
    if (raw.status === false || raw.status === "false") {
      problems.push(problem({
        severity: "error",
        code: "status_false_forbidden",
        message: "status false is forbidden; use status: disproved for wrong or failed results.",
        path: objectPath,
        objectUid: uid,
        objectName: name,
        strict: true
      }));
    } else if (includesReadonly(STATUS, raw.status)) {
      status = raw.status;
    } else {
      problems.push(problem({
        severity: "error",
        code: "invalid_status",
        message: `status ${String(raw.status)} is not valid.`,
        path: objectPath,
        objectUid: uid,
        objectName: name,
        strict: true
      }));
    }
  }

  let provenance = DEFAULT_PROVENANCE;
  if (raw.provenance !== undefined) {
    if (includesReadonly(PROVENANCE, raw.provenance)) {
      provenance = raw.provenance;
    } else {
      problems.push(problem({
        severity: "error",
        code: "invalid_provenance",
        message: `provenance ${String(raw.provenance)} is not valid.`,
        path: objectPath,
        objectUid: uid,
        objectName: name,
        strict: true
      }));
    }
  }

  let priority: IssuePriority | undefined = undefined;
  if (raw.priority !== undefined) {
    if (includesReadonly(PRIORITY, raw.priority)) {
      priority = raw.priority;
    } else {
      problems.push(problem({
        severity: "error",
        code: "invalid_priority",
        message: `priority ${String(raw.priority)} is not valid.`,
        path: objectPath,
        objectUid: uid,
        objectName: name,
        strict: true
      }));
    }
  } else if (kind === "issue") {
    priority = "normal";
  }

  const tags = asStringArray(raw.tags) ?? [];
  const summary = asString(raw.summary);
  const origin: ObjectOrigin = {
    kind: loadRoot.originKind,
    atlasRoot: root,
    ...(loadRoot.atlasId ? { atlasId: loadRoot.atlasId } : {}),
    objectPath,
    readonly: loadRoot.readonly
  };

  return {
    uid,
    name,
    kind,
    role,
    title,
    body,
    display_as,
    importance,
    status,
    summary,
    priority,
    provenance,
    tags,
    edges: normalizeEdges(raw.edges, objectPath, name, uid, problems),
    reverseEdges: {},
    path: dir,
    dir,
    objectPath,
    origin,
    citation: normalizeCitation(raw.citation, objectPath, name, uid, problems),
    source_result: normalizeSourceResult(raw.source_result, objectPath, name, uid, problems)
  };
}

async function loadAliases(loadRoot: LoadRoot, graph: Pick<NormalizedGraph, "objectsByUid" | "objectsByName">, problems: AtlasProblem[]): Promise<Record<string, string>> {
  const root = loadRoot.root;
  const aliasesPath = path.join(root, ".atlas", "aliases.yml");
  if (!(await pathExists(aliasesPath))) return {};
  const raw = await readYamlFile<Record<string, unknown>>(aliasesPath);
  const aliasesProblemPath = loadRoot.originKind === "project"
    ? ".atlas/aliases.yml"
    : `${loadRoot.atlasId ?? "mounted"}:.atlas/aliases.yml`;
  const aliases: Record<string, string> = {};
  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_aliases",
      message: ".atlas/aliases.yml must be a YAML mapping of old name to uid.",
      path: aliasesProblemPath,
      strict: true
    }));
    return aliases;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      problems.push(problem({
        severity: "error",
        code: "invalid_alias_value",
        message: `Alias ${key} must point to a uid string.`,
        path: aliasesProblemPath,
        target: key,
        strict: true
      }));
      continue;
    }
    aliases[key] = value;
    if (graph.objectsByName[key]) {
      problems.push(problem({
        severity: "error",
        code: "alias_key_conflicts_name",
        message: `Alias key ${key} conflicts with an existing object name.`,
        path: aliasesProblemPath,
        target: key,
        strict: true
      }));
    }
    if (!graph.objectsByUid[value]) {
      problems.push(problem({
        severity: "error",
        code: "alias_to_missing_uid",
        message: `Alias ${key} points to missing uid ${value}.`,
        path: aliasesProblemPath,
        target: key,
        strict: true
      }));
    }
  }
  return aliases;
}

async function loadAllAliases(
  roots: LoadRoot[],
  graph: Pick<NormalizedGraph, "objectsByUid" | "objectsByName">,
  problems: AtlasProblem[]
): Promise<Record<string, string>> {
  const aliases: Record<string, string> = {};
  for (const loadRoot of roots) {
    const next = await loadAliases(loadRoot, graph, problems);
    for (const [key, value] of Object.entries(next)) {
      if (aliases[key] && aliases[key] !== value) {
        problems.push(problem({
          severity: "error",
          code: "duplicate_alias",
          message: `Alias ${key} is declared by multiple atlases.`,
          path: loadRoot.originKind === "project" ? ".atlas/aliases.yml" : `${loadRoot.atlasId ?? "mounted"}:.atlas/aliases.yml`,
          target: key,
          strict: true
        }));
        continue;
      }
      aliases[key] = value;
    }
  }
  return aliases;
}

function duplicateProblems(objects: NormalizedObject[], problems: AtlasProblem[]): void {
  for (const [field, code] of [["uid", "duplicate_uid"], ["name", "duplicate_name"]] as const) {
    const seen = new Map<string, NormalizedObject[]>();
    for (const object of objects) {
      const value = object[field];
      seen.set(value, [...(seen.get(value) ?? []), object]);
    }
    for (const [value, matches] of seen) {
      if (matches.length < 2) continue;
      for (const object of matches) {
        problems.push(problem({
          severity: "error",
          code,
          message: `Duplicate ${field}: ${value}.`,
          path: object.objectPath,
          objectUid: object.uid,
          objectName: object.name,
          strict: true
        }));
      }
    }
  }
}

function resolveObject(graph: NormalizedGraph, target: string): NormalizedObject | undefined {
  return graph.objectsByName[target] ?? graph.objectsByUid[target] ?? graph.objectsByUid[graph.aliases[target]];
}

function hasMissingReferenceMount(graph: NormalizedGraph): boolean {
  return graph.referenceMounts.some((mount) => mount.status === "missing");
}

function shouldSuppressMissingReferenceTarget(graph: NormalizedGraph, target: string): boolean {
  return target.startsWith("source.") && hasMissingReferenceMount(graph);
}

function validateAndResolveEdges(graph: NormalizedGraph): void {
  for (const object of graph.objects) {
    const resolvedEdges: EdgeMap = {};
    for (const [edgeType, refs] of Object.entries(object.edges) as Array<[EdgeType, EdgeRef[]]>) {
      for (const ref of refs) {
        const resolved = resolveObject(graph, ref.target);
        if (!resolved) {
          if (!shouldSuppressMissingReferenceTarget(graph, ref.target)) {
            graph.problems.push(problem({
              severity: "error",
              code: "missing_edge_target",
              message: `${object.name} has ${edgeType} edge to missing object ${ref.target}.`,
              path: object.objectPath,
              objectUid: object.uid,
              objectName: object.name,
              target: ref.target,
              strict: true
            }));
          }
          addUniqueEdge(resolvedEdges, edgeType, ref);
          continue;
        }
        if (object.origin.kind === "global_reference" && resolved.origin.kind === "project") {
          graph.problems.push(problem({
            severity: "error",
            code: "reference_atlas_depends_on_project",
            message: `${object.name} is mounted from a global reference atlas and must not depend on project object ${resolved.name}.`,
            path: object.objectPath,
            objectUid: object.uid,
            objectName: object.name,
            target: resolved.name,
            strict: true
          }));
        }
        if (graph.aliases[ref.target]) {
          graph.problems.push(problem({
            severity: "warning",
            code: "alias_reference",
            message: `${object.name} references old alias ${ref.target}; prefer ${resolved.name}.`,
            path: object.objectPath,
            objectUid: object.uid,
            objectName: object.name,
            target: ref.target,
            strict: false
          }));
        }
        addUniqueEdge(resolvedEdges, edgeType, { ...ref, target: resolved.name });
      }
    }
    object.edges = resolvedEdges;
  }
}

function deriveReverseEdges(graph: NormalizedGraph): void {
  for (const object of graph.objects) object.reverseEdges = {};
  for (const object of graph.objects) {
    for (const [edgeType, refs] of Object.entries(object.edges) as Array<[EdgeType, EdgeRef[]]>) {
      for (const ref of refs) {
        const targetName = ref.target;
        const target = graph.objectsByName[targetName];
        if (!target) continue;
        if (edgeType === "related_to") {
          addUnique(object.reverseEdges, "related_to", target.name);
          addUnique(target.reverseEdges, "related_to", object.name);
          addUniqueEdge(target.edges, "related_to", { ...ref, target: object.name });
        } else {
          addUnique(target.reverseEdges, REVERSE_EDGE[edgeType], object.name);
        }
      }
    }
  }
}

function validateBodyPathsAndContent(graph: NormalizedGraph): void {
  for (const object of graph.objects) {
    for (const bodyPath of object.body) {
      const posix = toPosixPath(bodyPath);
      const full = path.join(object.origin.atlasRoot, object.dir, bodyPath);
      if (path.isAbsolute(bodyPath) || posix.includes("../") || !posix.endsWith(".md")) {
        graph.problems.push(problem({
          severity: "error",
          code: "invalid_body_path",
          message: `body path ${bodyPath} must be a relative .md path inside the object folder.`,
          path: object.objectPath,
          objectUid: object.uid,
          objectName: object.name,
          strict: true
        }));
        continue;
      }
      void fs.readFile(full, "utf8").then((source) => source).catch(() => undefined);
    }
  }
}

async function validateBodyContent(graph: NormalizedGraph): Promise<void> {
  for (const object of graph.objects) {
    for (const bodyPath of object.body) {
      const full = path.join(object.origin.atlasRoot, object.dir, bodyPath);
      const relativeBodyPath = relativePosix(object.origin.atlasRoot, full);
      if (!(await pathExists(full))) {
        graph.problems.push(problem({
          severity: "error",
          code: "missing_body",
          message: `body file ${bodyPath} does not exist.`,
          path: object.objectPath,
          objectUid: object.uid,
          objectName: object.name,
          strict: true
        }));
        continue;
      }
      const source = await fs.readFile(full, "utf8");
      if (/^#\s+/.test(source)) {
        graph.problems.push(problem({
          severity: "warning",
          code: "object_body_h1",
          message: "Object body files should not start with a level-1 heading; object.yml title is already rendered as the object title.",
          path: relativeBodyPath,
          objectUid: object.uid,
          objectName: object.name,
          strict: false
        }));
      }
      for (const issue of findMarkdownRenderIssues(source)) {
        graph.problems.push(problem({
          severity: "warning",
          code: issue.code,
          message: issue.message,
          path: relativeBodyPath,
          objectUid: object.uid,
          objectName: object.name,
          strict: true
        }));
      }
      for (const ref of parseMarkdownReferences(source)) {
        if (ref.kind === "embed") {
          graph.problems.push(problem({
            severity: "error",
            code: "body_embed_forbidden",
            message: `Object body cannot embed ${ref.raw}; use embeds only in views.`,
            path: relativeBodyPath,
            objectUid: object.uid,
            objectName: object.name,
            target: ref.target,
            strict: true
          }));
          continue;
        }
        const resolved = resolveObject(graph, ref.target);
        if (!resolved) {
          if (!shouldSuppressMissingReferenceTarget(graph, ref.target)) {
            graph.problems.push(problem({
              severity: "error",
              code: "missing_markdown_link",
              message: `Markdown link points to missing object ${ref.target}.`,
              path: relativeBodyPath,
              objectUid: object.uid,
              objectName: object.name,
              target: ref.target,
              strict: true
            }));
          }
        } else if (graph.aliases[ref.target]) {
          graph.problems.push(problem({
            severity: "warning",
            code: "alias_reference",
            message: `Markdown uses old alias ${ref.target}; prefer ${resolved.name}.`,
            path: relativeBodyPath,
            objectUid: object.uid,
            objectName: object.name,
            target: ref.target,
            strict: false
          }));
        }
      }
      for (const item of findForbiddenTexMacros(source)) {
        graph.problems.push(problem({
          severity: "error",
          code: "tex_macro_forbidden",
          message: `${item.command} is forbidden in object body; expand macros before using Proof Atlas.`,
          path: relativeBodyPath,
          objectUid: object.uid,
          objectName: object.name,
          strict: true
        }));
      }
    }
  }
}

function parseViewItems(graph: NormalizedGraph, source: string, viewPath: string): ViewItem[] {
  const items: ViewItem[] = [];
  for (const spaced of parseInvalidEmbedOptionSpacing(source)) {
    graph.problems.push(problem({
      severity: "warning",
      code: "embed_option_spacing",
      message: `Embed option must be adjacent to the embed syntax: ${spaced.raw}.`,
      path: viewPath,
      viewPath,
      target: spaced.target,
      strict: true
    }));
  }

  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) {
      items.push({
        type: "markdown",
        html: renderMarkdownBlock(paragraph.join("\n"), (name) => resolveObject(graph, name))
      });
      paragraph = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      items.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    const refs = parseMarkdownReferences(trimmed);
    const embed = refs.length === 1 && refs[0].kind === "embed" && refs[0].start === 0 && refs[0].end === trimmed.length;
    if (embed) {
      flushParagraph();
      const ref = refs[0];
      if (ref.invalid) {
        graph.problems.push(problem({
          severity: "warning",
          code: ref.invalid,
          message: `Invalid embed syntax ${ref.raw}. Use ![[name]] or ![[name]]{expanded}.`,
          path: viewPath,
          viewPath,
          target: ref.target,
          strict: true
        }));
      }
      const resolved = resolveObject(graph, ref.target);
      if (!resolved) {
        if (!shouldSuppressMissingReferenceTarget(graph, ref.target)) {
          graph.problems.push(problem({
            severity: "error",
            code: "missing_embed",
            message: `View embeds missing object ${ref.target}.`,
            path: viewPath,
            viewPath,
            target: ref.target,
            strict: true
          }));
        }
      } else if (graph.aliases[ref.target]) {
        graph.problems.push(problem({
          severity: "warning",
          code: "alias_reference",
          message: `View uses old alias ${ref.target}; prefer ${resolved.name}.`,
          path: viewPath,
          viewPath,
          target: ref.target,
          strict: false
        }));
      }
      items.push({
        type: "embed",
        target: ref.target,
        uid: resolved?.uid,
        name: resolved?.name,
        expanded: ref.option === "expanded",
        invalid: ref.invalid
      });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();

  for (const ref of parseMarkdownReferences(source).filter((ref) => ref.kind === "link")) {
    const resolved = resolveObject(graph, ref.target);
    if (!resolved) {
      if (!shouldSuppressMissingReferenceTarget(graph, ref.target)) {
        graph.problems.push(problem({
          severity: "error",
          code: "missing_markdown_link",
          message: `View link points to missing object ${ref.target}.`,
          path: viewPath,
          viewPath,
          target: ref.target,
          strict: true
        }));
      }
    }
  }
  return items;
}

const ROUTE_PROFILES: RouteProfile[] = ["proof"];
const REPRESENTATION_MODES: RepresentationMode[] = ["full", "statement", "summary", "reference", "omit"];

function normalizeRouteRender(raw: unknown, graph: NormalizedGraph, viewPath: string): RouteView["render"] {
  if (!isPlainObject(raw)) return {};
  const render: RouteView["render"] = {};
  if (raw.order === "prerequisites_first") render.order = raw.order;
  if (raw.order_hints !== undefined && (!Array.isArray(raw.order_hints) || raw.order_hints.some((item) => typeof item !== "string"))) {
    graph.problems.push(problem({
      severity: "error",
      code: "invalid_route_order_hints",
      message: "render.order_hints must be a list of object names.",
      path: viewPath,
      viewPath,
      strict: true
    }));
  }
  if (Array.isArray(raw.order_hints)) {
    const orderHints: string[] = [];
    for (const item of raw.order_hints) {
      if (typeof item !== "string") continue;
      const object = resolveObject(graph, item);
      if (!object) {
        graph.problems.push(problem({
          severity: "error",
          code: "missing_route_order_hint",
          message: `render.order_hints entry ${item} does not exist.`,
          path: viewPath,
          viewPath,
          target: item,
          strict: true
        }));
        orderHints.push(item);
      } else {
        if (graph.aliases[item]) {
          graph.problems.push(problem({
            severity: "warning",
            code: "alias_reference",
            message: `Route order hint uses old alias ${item}; prefer ${object.name}.`,
            path: viewPath,
            viewPath,
            target: item,
            strict: false
          }));
        }
        orderHints.push(object.name);
      }
    }
    if (orderHints.length) render.order_hints = [...new Set(orderHints)];
  }
  return render;
}

function normalizeRouteView(raw: unknown, viewPath: string, graph: NormalizedGraph): RouteView | undefined {
  if (!isPlainObject(raw)) {
    graph.problems.push(problem({
      severity: "error",
      code: "invalid_route_view",
      message: "route view must be a YAML mapping.",
      path: viewPath,
      viewPath,
      strict: true
    }));
    return undefined;
  }

  const schemaVersion = raw.schema_version === "0.1" ? "0.1" : "0.1";
  if (raw.schema_version !== "0.1") {
    graph.problems.push(problem({
      severity: "error",
      code: "invalid_route_schema_version",
      message: `route schema_version must be "0.1".`,
      path: viewPath,
      viewPath,
      strict: true
    }));
  }
  if (raw.type !== "route") {
    graph.problems.push(problem({
      severity: "error",
      code: "invalid_route_type",
      message: `route type must be "route".`,
      path: viewPath,
      viewPath,
      strict: true
    }));
  }

  const uid = typeof raw.uid === "string" && raw.uid.trim() ? raw.uid : `view_${path.basename(viewPath, ".route.yml")}`;
  if (typeof raw.uid !== "string" || !raw.uid.trim()) {
    graph.problems.push(problem({
      severity: "error",
      code: "missing_route_uid",
      message: "route uid is required.",
      path: viewPath,
      viewPath,
      strict: true
    }));
  }
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title : path.basename(viewPath, ".route.yml");
  if (typeof raw.title !== "string" || !raw.title.trim()) {
    graph.problems.push(problem({
      severity: "error",
      code: "missing_route_title",
      message: "route title is required.",
      path: viewPath,
      viewPath,
      strict: true
    }));
  }

  const rawTarget = typeof raw.target === "string" ? raw.target : "";
  const resolvedTarget = rawTarget ? resolveObject(graph, rawTarget) : undefined;
  if (!rawTarget || !resolvedTarget) {
    graph.problems.push(problem({
      severity: "error",
      code: "missing_route_target",
      message: rawTarget ? `route target ${rawTarget} does not exist.` : "route target is required.",
      path: viewPath,
      viewPath,
      target: rawTarget,
      strict: true
    }));
  } else if (graph.aliases[rawTarget]) {
    graph.problems.push(problem({
      severity: "warning",
      code: "alias_reference",
      message: `Route target uses old alias ${rawTarget}; prefer ${resolvedTarget.name}.`,
      path: viewPath,
      viewPath,
      target: rawTarget,
      strict: false
    }));
  } else if (!isProofTreeRoot(resolvedTarget)) {
    graph.problems.push(problem({
      severity: "error",
      code: "unsupported_proof_tree_target",
      message: "route target must be a math claim that is not displayed as statement or estimate.",
      path: viewPath,
      viewPath,
      target: resolvedTarget.name,
      strict: true
    }));
  }

  const profile = ROUTE_PROFILES.includes(raw.profile as RouteProfile) ? raw.profile as RouteProfile : "proof";
  if (raw.profile !== undefined && !ROUTE_PROFILES.includes(raw.profile as RouteProfile)) {
    graph.problems.push(problem({
      severity: "error",
      code: "invalid_route_profile",
      message: `route profile must be ${ROUTE_PROFILES.join(", ")}.`,
      path: viewPath,
      viewPath,
      strict: true
    }));
  }

  const proofChoices: Record<string, string> = {};
  if (raw.proof_choices !== undefined && !isPlainObject(raw.proof_choices)) {
    graph.problems.push(problem({
      severity: "error",
      code: "invalid_route_proof_choices",
      message: "proof_choices must be a YAML mapping from claim name to proof name.",
      path: viewPath,
      viewPath,
      strict: true
    }));
  }
  if (isPlainObject(raw.proof_choices)) {
    for (const [claimName, proofName] of Object.entries(raw.proof_choices)) {
      if (typeof proofName !== "string") {
        graph.problems.push(problem({
          severity: "error",
          code: "invalid_route_proof_choice",
          message: `proof choice for ${claimName} must be a proof object name.`,
          path: viewPath,
          viewPath,
          target: claimName,
          strict: true
        }));
        continue;
      }
      const claim = resolveObject(graph, claimName);
      const proofObject = resolveObject(graph, proofName);
      if (!claim) {
        graph.problems.push(problem({
          severity: "error",
          code: "missing_route_proof_choice_claim",
          message: `proof_choices key ${claimName} does not exist.`,
          path: viewPath,
          viewPath,
          target: claimName,
          strict: true
        }));
      }
      if (!proofObject) {
        graph.problems.push(problem({
          severity: "error",
          code: "missing_route_proof_choice_proof",
          message: `proof choice ${proofName} does not exist.`,
          path: viewPath,
          viewPath,
          target: proofName,
          strict: true
        }));
      }
      if (claim && proofObject && !edgeTargets(proofObject.edges.proves).includes(claim.name)) {
        graph.problems.push(problem({
          severity: "error",
          code: "invalid_route_proof_choice_shape",
          message: `${proofObject.name} does not prove ${claim.name}.`,
          path: viewPath,
          viewPath,
          target: proofObject.name,
          strict: true
        }));
      }
      proofChoices[claim?.name ?? claimName] = proofObject?.name ?? proofName;
    }
  }

  const boundaries: string[] = [];
  if (raw.boundaries !== undefined && (!Array.isArray(raw.boundaries) || raw.boundaries.some((item) => typeof item !== "string"))) {
    graph.problems.push(problem({
      severity: "error",
      code: "invalid_route_boundaries",
      message: "boundaries must be a list of object names.",
      path: viewPath,
      viewPath,
      strict: true
    }));
  }
  if (Array.isArray(raw.boundaries)) {
    for (const item of raw.boundaries) {
      if (typeof item !== "string") continue;
      const object = resolveObject(graph, item);
      if (!object) {
        graph.problems.push(problem({
          severity: "error",
          code: "missing_route_boundary",
          message: `route boundary ${item} does not exist.`,
          path: viewPath,
          viewPath,
          target: item,
          strict: true
        }));
        boundaries.push(item);
      } else {
        boundaries.push(object.name);
      }
    }
  }

  const representation: Record<string, RepresentationMode> = {};
  if (raw.representation !== undefined && !isPlainObject(raw.representation)) {
    graph.problems.push(problem({
      severity: "error",
      code: "invalid_route_representation",
      message: "representation must be a YAML mapping from object name to mode.",
      path: viewPath,
      viewPath,
      strict: true
    }));
  }
  if (isPlainObject(raw.representation)) {
    for (const [name, mode] of Object.entries(raw.representation)) {
      const object = resolveObject(graph, name);
      if (!object) {
        graph.problems.push(problem({
          severity: "error",
          code: "missing_route_representation_object",
          message: `representation key ${name} does not exist.`,
          path: viewPath,
          viewPath,
          target: name,
          strict: true
        }));
      }
      if (!REPRESENTATION_MODES.includes(mode as RepresentationMode)) {
        graph.problems.push(problem({
          severity: "error",
          code: "invalid_route_representation_mode",
          message: `representation for ${name} must be one of ${REPRESENTATION_MODES.join(", ")}.`,
          path: viewPath,
          viewPath,
          target: name,
          strict: true
        }));
        continue;
      }
      representation[object?.name ?? name] = mode as RepresentationMode;
    }
  }

  return {
    schema_version: schemaVersion,
    uid,
    type: "route",
    title,
    target: resolvedTarget?.name ?? rawTarget,
    profile,
    proof_choices: proofChoices,
    boundaries,
    representation,
    render: normalizeRouteRender(raw.render, graph, viewPath)
  };
}

async function loadRouteViews(graph: NormalizedGraph): Promise<void> {
  const viewsDir = path.join(graph.root, "views");
  const files = await listFilesRecursive(viewsDir, (filePath) => /\.route\.ya?ml$/.test(filePath));
  graph.routeViews = [];
  for (const file of files) {
    const rawText = await fs.readFile(file, "utf8");
    const viewPath = relativePosix(graph.root, file);
    const raw = await readYamlFile<unknown>(file);
    const route = normalizeRouteView(raw, viewPath, graph);
    if (!route) continue;
    graph.routeViews.push({
      path: viewPath,
      name: path.basename(file).replace(/\.route\.ya?ml$/, ""),
      title: route.title,
      raw: rawText,
      route
    });
  }
}

async function loadViews(graph: NormalizedGraph): Promise<void> {
  const viewsDir = path.join(graph.root, "views");
  const files = await listFilesRecursive(viewsDir, (filePath) => filePath.endsWith(".md"));
  graph.views = [];
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const viewPath = relativePosix(graph.root, file);
    const firstHeading = raw.match(/^#\s+(.+)$/m)?.[1];
    const name = path.basename(file, ".md");
    const items = parseViewItems(graph, raw, viewPath);
    graph.views.push({
      type: "markdown",
      path: viewPath,
      name,
      title: firstHeading ?? name,
      items,
      raw
    });
  }
  if (graph.views.length === 0) {
    graph.problems.push(problem({
      severity: "error",
      code: "missing_views",
      message: "Project has no Markdown views under views/.",
      path: "views",
      strict: true
    }));
  }
  if (!graph.views.some((view) => view.path === graph.config.default_view)) {
    graph.problems.push(problem({
      severity: "error",
      code: "missing_default_view",
      message: `default_view ${graph.config.default_view} does not exist.`,
      path: "atlas.yml",
      strict: true
    }));
  }
}

function statusComboWarning(object: NormalizedObject): string | undefined {
  if (object.kind === "math" && ["open", "resolved"].includes(object.status)) {
    return `status ${object.status} is not recommended for math objects.`;
  }
  if (object.kind === "issue" && ["draft", "partial", "needs_check", "checked", "disproved"].includes(object.status)) {
    return `status ${object.status} is not recommended for issue objects.`;
  }
  if (object.kind === "note" && ["open", "resolved", "partial", "needs_check", "disproved"].includes(object.status)) {
    return `status ${object.status} is not recommended for note objects.`;
  }
  return undefined;
}

const BIB_TRUST_GROUPS: BibTrust[] = ["trusted", "unverified", "rejected"];

function parseBibEntries(source: string): Array<{ bibkey: string; entryType: string }> {
  const entries: Array<{ bibkey: string; entryType: string }> = [];
  const pattern = /@([A-Za-z]+)\s*\{\s*([^,\s]+)\s*,/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    entries.push({ entryType: match[1], bibkey: match[2] });
  }
  return entries;
}

function normalizeBibRegistryFiles(raw: unknown, trust: BibTrust, registryPath: string, problems: AtlasProblem[]): Array<{ id: string; path: string }> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_bib_registry_group",
      message: `bib-registry.yml ${trust} must be a list.`,
      path: registryPath,
      strict: true
    }));
    return [];
  }
  return raw.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return [{ id: `${trust}-${index + 1}`, path: item.trim() }];
    }
    if (!isPlainObject(item) || typeof item.path !== "string" || !item.path.trim()) {
      problems.push(problem({
        severity: "error",
        code: "invalid_bib_registry_file",
        message: `bib-registry.yml ${trust} entries need a path.`,
        path: registryPath,
        strict: true
      }));
      return [];
    }
    return [{
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `${trust}-${index + 1}`,
      path: item.path.trim()
    }];
  });
}

async function loadBibRegistryForRoot(loadRoot: LoadRoot, problems: AtlasProblem[]): Promise<NormalizedBibRegistry> {
  const registryPath = path.join(loadRoot.root, "bib-registry.yml");
  const entriesByKey: Record<string, BibRegistryEntry> = {};
  if (!(await pathExists(registryPath))) return { entriesByKey };
  const raw = await readYamlFile<unknown>(registryPath);
  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_bib_registry",
      message: "bib-registry.yml must be a YAML mapping.",
      path: "bib-registry.yml",
      strict: true
    }));
    return { entriesByKey };
  }
  for (const trust of BIB_TRUST_GROUPS) {
    for (const fileRef of normalizeBibRegistryFiles(raw[trust], trust, registryPath, problems)) {
      const filePath = resolveConfigPath(loadRoot.root, fileRef.path);
      if (!(await pathExists(filePath))) {
        problems.push(problem({
          severity: "error",
          code: "missing_bib_registry_file",
          message: `Bib registry file ${fileRef.path} does not exist.`,
          path: "bib-registry.yml",
          target: fileRef.id,
          strict: true
        }));
        continue;
      }
      const source = await fs.readFile(filePath, "utf8");
      for (const entry of parseBibEntries(source)) {
        const existing = entriesByKey[entry.bibkey];
        if (existing && existing.trust !== trust) {
          problems.push(problem({
            severity: "error",
            code: "duplicate_bibkey_trust",
            message: `BibTeX key ${entry.bibkey} appears in both ${existing.trust} and ${trust}.`,
            path: "bib-registry.yml",
            target: entry.bibkey,
            strict: true
          }));
          continue;
        }
        if (existing) {
          continue;
        }
        entriesByKey[entry.bibkey] = {
          bibkey: entry.bibkey,
          trust,
          file: filePath,
          registryId: loadRoot.atlasId ?? "project",
          registryPath,
          entryType: entry.entryType
        };
      }
    }
  }
  return { entriesByKey };
}

async function loadCompositeBibRegistry(loadRoots: LoadRoot[], problems: AtlasProblem[]): Promise<NormalizedBibRegistry> {
  const entriesByKey: Record<string, BibRegistryEntry> = {};
  for (const loadRoot of loadRoots) {
    const registry = await loadBibRegistryForRoot(loadRoot, problems);
    for (const [bibkey, entry] of Object.entries(registry.entriesByKey)) {
      const existing = entriesByKey[bibkey];
      if (existing && existing.trust !== entry.trust) {
        problems.push(problem({
          severity: "error",
          code: "duplicate_bibkey_trust",
          message: `BibTeX key ${bibkey} appears with conflicting trust in mounted registries.`,
          path: entry.registryPath,
          target: bibkey,
          strict: true
        }));
        continue;
      }
      entriesByKey[bibkey] = existing ?? entry;
    }
  }
  return { entriesByKey };
}

function applyCitationRegistry(graph: NormalizedGraph): void {
  for (const object of graph.objects) {
    if (!object.citation) continue;
    const entry = graph.bibRegistry.entriesByKey[object.citation.bibkey];
    if (!entry) {
      graph.problems.push(problem({
        severity: "error",
        code: "missing_citation_bibkey",
        message: `${object.name} cites BibTeX key ${object.citation.bibkey}, but that key is not in the mounted bib registry.`,
        path: object.objectPath,
        objectUid: object.uid,
        objectName: object.name,
        target: object.citation.bibkey,
        strict: true
      }));
      continue;
    }
    object.citation = {
      bibkey: object.citation.bibkey,
      trust: entry.trust,
      bibfile: entry.file,
      registryId: entry.registryId,
      entryType: entry.entryType
    };
  }
}

function lintGraph(graph: NormalizedGraph): void {
  for (const object of graph.objects) {
    if (object.name.startsWith("source.") && object.origin.kind === "project" && graph.config.atlas_type !== "reference") {
      graph.problems.push(problem({
        severity: "error",
        code: "local_source_namespace_forbidden",
        message: `${object.name} is a local source.* object; source.* is reserved for mounted Reference Atlas objects.`,
        path: object.objectPath,
        objectUid: object.uid,
        objectName: object.name,
        strict: true
      }));
    }
    if (object.name.startsWith("source.") && !object.citation) {
      graph.problems.push(problem({
        severity: "error",
        code: "missing_citation",
        message: `${object.name} needs citation.bibkey so trust can be derived from the bib registry.`,
        path: object.objectPath,
        objectUid: object.uid,
        objectName: object.name,
        strict: true
      }));
    }
    if (object.source_result?.parent && !graph.objectsByName[object.source_result.parent]) {
      graph.problems.push(problem({
        severity: "error",
        code: "missing_source_result_parent",
        message: `${object.name} declares source_result.parent ${object.source_result.parent}, but it does not exist.`,
        path: object.objectPath,
        objectUid: object.uid,
        objectName: object.name,
        target: object.source_result.parent,
        strict: true
      }));
    }
    const combo = statusComboWarning(object);
    if (combo) {
      graph.problems.push(problem({
        severity: "warning",
        code: "status_kind_combo",
        message: combo,
        path: object.objectPath,
        objectUid: object.uid,
        objectName: object.name,
        strict: false
      }));
    }
    for (const targetName of edgeTargets(object.edges.blocks)) {
      if (object.kind !== "issue") {
        graph.problems.push(problem({
          severity: "warning",
          code: "blocks_from_non_issue",
          message: "blocks edges should start from issue objects.",
          path: object.objectPath,
          objectUid: object.uid,
          objectName: object.name,
          target: targetName,
          strict: false
        }));
      }
    }
    for (const targetName of edgeTargets(object.edges.proves)) {
      const target = graph.objectsByName[targetName];
      if (!(object.kind === "math" && ["proof", "proof_fragment"].includes(object.role)) || !(target?.kind === "math" && target.role === "claim")) {
        graph.problems.push(problem({
          severity: "warning",
          code: "proves_shape",
          message: "proves edges should go from math proof/proof_fragment objects to math claim objects.",
          path: object.objectPath,
          objectUid: object.uid,
          objectName: object.name,
          target: targetName,
          strict: false
        }));
      }
    }
    for (const targetName of edgeTargets(object.edges.uses)) {
      const target = graph.objectsByName[targetName];
      if (target && ["proof", "proof_fragment"].includes(target.role)) {
        graph.problems.push(problem({
          severity: "warning",
          code: "uses_points_to_proof",
          message: `${object.name} uses proof object ${target.name}; claim/proof links should normally use proves.`,
          path: object.objectPath,
          objectUid: object.uid,
          objectName: object.name,
          target: targetName,
          strict: false
        }));
      }
      if (object.role === "claim" && edgeTargets(target?.edges.proves).includes(object.name)) {
        graph.problems.push(problem({
          severity: "warning",
          code: "claim_uses_own_proof",
          message: `${object.name} should not use its own proof ${target.name}.`,
          path: object.objectPath,
          objectUid: object.uid,
          objectName: object.name,
          target: target.name,
          strict: false
        }));
      }
      if (object.role === "claim") {
        graph.problems.push(problem({
          severity: "warning",
          code: "claim_uses_dependency",
          message: `${object.name} is a claim with a uses edge; statement context should normally use requires and proof dependencies should live on proof objects.`,
          path: object.objectPath,
          objectUid: object.uid,
          objectName: object.name,
          target: targetName,
          strict: false
        }));
      }
    }
    for (const edgeType of EDGE_TYPES) {
      for (const targetName of edgeTargets(object.edges[edgeType])) {
        const target = graph.objectsByName[targetName];
        if (target?.citation?.trust === "rejected") {
          graph.problems.push(problem({
            severity: "error",
            code: "rejected_citation_usage",
            message: `${object.name} ${edgeType} rejected reference ${target.name}.`,
            path: object.objectPath,
            objectUid: object.uid,
            objectName: object.name,
            target: target.name,
            strict: true
          }));
        }
      }
    }
    if (object.kind === "math" && ["proof", "proof_fragment"].includes(object.role)) {
      for (const targetName of hardEdgeTargets(object.edges.uses)) {
        const target = graph.objectsByName[targetName];
        if (!target?.name.startsWith("source.")) continue;
        if (target.kind === "math" && target.role === "claim" && !target.body.includes("statement.md")) {
          graph.problems.push(problem({
            severity: "error",
            code: "missing_external_statement",
            message: `${target.name} is hard-used by ${object.name} but has no statement.md.`,
            path: target.objectPath,
            objectUid: target.uid,
            objectName: target.name,
            target: object.name,
            strict: true
          }));
        }
        if (target.citation?.trust === "unverified") {
          graph.problems.push(problem({
            severity: "warning",
            code: "unverified_external_dependency",
            message: `${object.name} hard-uses unverified external result ${target.name}.`,
            path: object.objectPath,
            objectUid: object.uid,
            objectName: object.name,
            target: target.name,
            strict: true
          }));
        }
      }
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const object of graph.objects) {
    adjacency.set(object.name, [
      ...hardEdgeTargets(object.edges.requires),
      ...hardEdgeTargets(object.edges.uses)
    ]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleWarnings = new Set<string>();
  const visit = (name: string, stack: string[]) => {
    if (visiting.has(name)) {
      const cycle = stack.slice(stack.indexOf(name)).concat(name);
      const key = cycle.join(" -> ");
      if (!cycleWarnings.has(key)) {
        cycleWarnings.add(key);
        const object = graph.objectsByName[name];
        graph.problems.push(problem({
          severity: "error",
          code: "hard_dependency_cycle",
          message: `hard requires/uses dependency cycle: ${key}.`,
          path: object?.objectPath,
          objectUid: object?.uid,
          objectName: object?.name,
          strict: true
        }));
      }
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    for (const next of adjacency.get(name) ?? []) {
      if (graph.objectsByName[next]) visit(next, [...stack, next]);
    }
    visiting.delete(name);
    visited.add(name);
  };
  for (const object of graph.objects) visit(object.name, [object.name]);
}

export async function buildGraph(projectInput?: string | ResolvedAtlasProject): Promise<NormalizedGraph> {
  resetProblemCounter();
  const project = typeof projectInput === "object" && projectInput !== null
    ? projectInput
    : await resolveAtlasProject(projectInput);
  const root = project.atlasRoot;
  const problems: AtlasProblem[] = [];
  const config = await loadConfig(project, problems);
  const workspace = normalizeWorkspacePaths(project, config);
  const referenceMounts = await resolveReferenceMounts(project, config, problems);
  const projectLoadRoot: LoadRoot = {
    root,
    originKind: "project",
    readonly: false
  };
  const mountedLoadRoots: LoadRoot[] = referenceMounts
    .filter((mount): mount is ResolvedReferenceMount & { root: string } => mount.status === "mounted" && Boolean(mount.root))
    .map((mount) => ({
      root: mount.root,
      originKind: "global_reference",
      atlasId: mount.id,
      readonly: mount.mode === "readonly"
    }));
  const loadRoots = [projectLoadRoot, ...mountedLoadRoots];
  const rawObjectsByRoot = await Promise.all(loadRoots.map((loadRoot) => loadRawObjects(loadRoot)));
  const rawObjects = rawObjectsByRoot.flat();
  const projectObjectCount = rawObjects.filter((record) => record.loadRoot.originKind === "project").length;
  if (projectObjectCount === 0) {
    problems.push(problem({
      severity: "error",
      code: "missing_objects",
      message: "Project has no objects/*/object.yml files.",
      path: "objects",
      strict: true
    }));
  }
  const objects = rawObjects.map((record, index) => normalizeObject(record.data, record.file, record.loadRoot, index, problems));
  duplicateProblems(objects, problems);
  const objectsByUid = Object.fromEntries(objects.map((object) => [object.uid, object]));
  const objectsByName = Object.fromEntries(objects.map((object) => [object.name, object]));
  const bibRegistry = await loadCompositeBibRegistry(loadRoots, problems);
  const graph: NormalizedGraph = {
    root,
    atlasRoot: root,
    workspaceRoot: workspace.root,
    configPath: project.configPath,
    localConfigPath: project.localConfigPath,
    workspace,
    config,
    objects,
    objectsByUid,
    objectsByName,
    aliases: {},
    views: [],
    routeViews: [],
    problems,
    referenceMounts,
    bibRegistry,
    builtAt: new Date().toISOString()
  };
  graph.aliases = await loadAllAliases(loadRoots, graph, problems);
  applyCitationRegistry(graph);
  validateBodyPathsAndContent(graph);
  validateAndResolveEdges(graph);
  deriveReverseEdges(graph);
  await validateBodyContent(graph);
  await loadViews(graph);
  await loadRouteViews(graph);
  lintGraph(graph);
  graph.problems.sort((a, b) => {
    const severity = a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1;
    return severity || (a.path ?? "").localeCompare(b.path ?? "") || a.code.localeCompare(b.code);
  });
  return graph;
}

export async function buildBodyFiles(graph: NormalizedGraph, object: NormalizedObject): Promise<BodyFile[]> {
  const resolve = (name: string) => resolveObject(graph, name);
  const files: BodyFile[] = [];
  for (const bodyPath of object.body) {
    const full = path.join(object.origin.atlasRoot, object.dir, bodyPath);
    if (!(await pathExists(full))) {
      files.push({ file: bodyPath, blocks: [] });
      continue;
    }
    const source = await fs.readFile(full, "utf8");
    files.push({
      file: bodyPath,
      blocks: splitMarkdownBlocks(source, bodyPath, resolve, object.name)
    });
  }
  return files;
}

export function findObject(graph: NormalizedGraph, nameOrUid: string): NormalizedObject | undefined {
  return resolveObject(graph, nameOrUid);
}
