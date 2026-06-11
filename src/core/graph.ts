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
  AtlasView,
  BodyFile,
  EdgeMap,
  EdgeType,
  IssuePriority,
  NormalizedGraph,
  NormalizedObject,
  ObjectKind,
  ObjectRole,
  RawObjectRecord,
  ViewItem
} from "./types";
import {
  findForbiddenTexMacros,
  parseInvalidEmbedOptionSpacing,
  parseMarkdownReferences
} from "./markdownRefs";
import { pathExists, relativePosix, isPlainObject, listFilesRecursive, toPosixPath } from "./pathUtils";
import { problem, resetProblemCounter } from "./problems";
import { resolveProjectRoot } from "./project";
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

async function loadConfig(root: string, problems: AtlasProblem[]): Promise<AtlasConfig> {
  const configPath = path.join(root, "atlas.yml");
  const raw = await readYamlFile<Record<string, unknown>>(configPath);
  const fallbackProject = path.basename(path.dirname(root)) || "proof-atlas";
  const config: AtlasConfig = {
    schema_version: "0.1",
    project: typeof raw?.project === "string" ? raw.project : fallbackProject,
    title: typeof raw?.title === "string" ? raw.title : fallbackProject,
    default_view: normalizeDefaultView(raw?.default_view),
    math_renderer: "katex"
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
  if (raw.math_renderer && raw.math_renderer !== "katex") {
    problems.push(problem({
      severity: "error",
      code: "invalid_math_renderer",
      message: `math_renderer must be katex in v0.1.`,
      path: "atlas.yml",
      strict: true
    }));
  }
  return config;
}

async function loadRawObjects(root: string): Promise<Array<{ file: string; data: RawObjectRecord }>> {
  const objectsDir = path.join(root, "objects");
  const out: Array<{ file: string; data: RawObjectRecord }> = [];
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
    out.push({ file: objectFile, data: await readYamlFile<RawObjectRecord>(objectFile) });
  }
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;
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
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      problems.push(problem({
        severity: "error",
        code: "invalid_edge_targets",
        message: `edges.${edgeKey} must be a list of object names.`,
        path: objectPath,
        objectName,
        objectUid,
        strict: true
      }));
      continue;
    }
    edges[edgeKey] = [...new Set(value as string[])];
  }
  return edges;
}

function normalizeObject(
  raw: RawObjectRecord,
  file: string,
  root: string,
  index: number,
  problems: AtlasProblem[]
): NormalizedObject {
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
    objectPath
  };
}

async function loadAliases(root: string, graph: Pick<NormalizedGraph, "objectsByUid" | "objectsByName">, problems: AtlasProblem[]): Promise<Record<string, string>> {
  const aliasesPath = path.join(root, ".atlas", "aliases.yml");
  if (!(await pathExists(aliasesPath))) return {};
  const raw = await readYamlFile<Record<string, unknown>>(aliasesPath);
  const aliases: Record<string, string> = {};
  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_aliases",
      message: ".atlas/aliases.yml must be a YAML mapping of old name to uid.",
      path: ".atlas/aliases.yml",
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
        path: ".atlas/aliases.yml",
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
        path: ".atlas/aliases.yml",
        target: key,
        strict: true
      }));
    }
    if (!graph.objectsByUid[value]) {
      problems.push(problem({
        severity: "error",
        code: "alias_to_missing_uid",
        message: `Alias ${key} points to missing uid ${value}.`,
        path: ".atlas/aliases.yml",
        target: key,
        strict: true
      }));
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

function validateAndResolveEdges(graph: NormalizedGraph): void {
  for (const object of graph.objects) {
    const resolvedEdges: EdgeMap = {};
    for (const [edgeType, targets] of Object.entries(object.edges) as Array<[EdgeType, string[]]>) {
      for (const target of targets) {
        const resolved = resolveObject(graph, target);
        if (!resolved) {
          graph.problems.push(problem({
            severity: "error",
            code: "missing_edge_target",
            message: `${object.name} has ${edgeType} edge to missing object ${target}.`,
            path: object.objectPath,
            objectUid: object.uid,
            objectName: object.name,
            target,
            strict: true
          }));
          addUnique(resolvedEdges, edgeType, target);
          continue;
        }
        if (graph.aliases[target]) {
          graph.problems.push(problem({
            severity: "warning",
            code: "alias_reference",
            message: `${object.name} references old alias ${target}; prefer ${resolved.name}.`,
            path: object.objectPath,
            objectUid: object.uid,
            objectName: object.name,
            target,
            strict: false
          }));
        }
        addUnique(resolvedEdges, edgeType, resolved.name);
      }
    }
    object.edges = resolvedEdges;
  }
}

function deriveReverseEdges(graph: NormalizedGraph): void {
  for (const object of graph.objects) object.reverseEdges = {};
  for (const object of graph.objects) {
    for (const [edgeType, targets] of Object.entries(object.edges) as Array<[EdgeType, string[]]>) {
      for (const targetName of targets) {
        const target = graph.objectsByName[targetName];
        if (!target) continue;
        if (edgeType === "related_to") {
          addUnique(object.reverseEdges, "related_to", target.name);
          addUnique(target.reverseEdges, "related_to", object.name);
          addUnique(target.edges, "related_to", object.name);
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
      const full = path.join(graph.root, object.dir, bodyPath);
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
      const full = path.join(graph.root, object.dir, bodyPath);
      const relativeBodyPath = relativePosix(graph.root, full);
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
        graph.problems.push(problem({
          severity: "error",
          code: "missing_embed",
          message: `View embeds missing object ${ref.target}.`,
          path: viewPath,
          viewPath,
          target: ref.target,
          strict: true
        }));
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
  return items;
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

function lintGraph(graph: NormalizedGraph): void {
  for (const object of graph.objects) {
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
    for (const targetName of object.edges.blocks ?? []) {
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
    for (const targetName of object.edges.proves ?? []) {
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
    for (const targetName of object.edges.uses ?? []) {
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
      if (object.role === "claim" && target?.edges.proves?.includes(object.name)) {
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
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const object of graph.objects) {
    adjacency.set(object.name, [...(object.edges.uses ?? []), ...(object.edges.proves ?? [])]);
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
          severity: "warning",
          code: "dependency_cycle",
          message: `uses/proves dependency cycle: ${key}.`,
          path: object?.objectPath,
          objectUid: object?.uid,
          objectName: object?.name,
          strict: false
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

export async function buildGraph(projectInput?: string): Promise<NormalizedGraph> {
  resetProblemCounter();
  const root = await resolveProjectRoot(projectInput);
  const problems: AtlasProblem[] = [];
  const config = await loadConfig(root, problems);
  const rawObjects = await loadRawObjects(root);
  if (rawObjects.length === 0) {
    problems.push(problem({
      severity: "error",
      code: "missing_objects",
      message: "Project has no objects/*/object.yml files.",
      path: "objects",
      strict: true
    }));
  }
  const objects = rawObjects.map((record, index) => normalizeObject(record.data, record.file, root, index, problems));
  duplicateProblems(objects, problems);
  const objectsByUid = Object.fromEntries(objects.map((object) => [object.uid, object]));
  const objectsByName = Object.fromEntries(objects.map((object) => [object.name, object]));
  const graph: NormalizedGraph = {
    root,
    config,
    objects,
    objectsByUid,
    objectsByName,
    aliases: {},
    views: [],
    problems,
    builtAt: new Date().toISOString()
  };
  graph.aliases = await loadAliases(root, graph, problems);
  validateBodyPathsAndContent(graph);
  validateAndResolveEdges(graph);
  deriveReverseEdges(graph);
  await validateBodyContent(graph);
  await loadViews(graph);
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
    const full = path.join(graph.root, object.dir, bodyPath);
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
