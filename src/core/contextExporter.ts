import fs from "node:fs/promises";
import path from "node:path";
import { hardEdgeTargets } from "./edgeUtils";
import { parseMarkdownReferences } from "./markdownRefs";
import type { NormalizedGraph, NormalizedObject, RouteView } from "./types";
import { routeBoundaryKind, routeStatusLine } from "./routeResolver";
import type { ResolvedRoute, RouteDiagnostic, ResolvedRouteNode } from "./routeResolver";
import { linearizeRoute } from "./routeLinearizer";
import { deriveRouteProofTree, type ProofTreeNode } from "./routeProofTree";

export type ExportFormat = "markdown" | "manifest" | "json";

export interface ExportResult {
  format: ExportFormat;
  content: string;
  diagnostics: RouteDiagnostic[];
}

export interface RouteSnapshot {
  schema_version: "0.1";
  type: "snapshot";
  exported_at: string;
  project_uid: string;
  graph_built_at: string;
  route: RouteView;
  object_names: string[];
  markdown: string;
  diagnostics: RouteDiagnostic[];
}

function anchorForName(name: string): string {
  return `object-${name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "")}`;
}

async function readBodyFile(graph: NormalizedGraph, object: NormalizedObject, bodyFile: string, diagnostics: RouteDiagnostic[]): Promise<string> {
  const filePath = path.join(object.origin.atlasRoot, object.dir, bodyFile);
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    diagnostics.push({
      severity: "error",
      code: "missing_body_export",
      message: `${object.name} references missing body file ${bodyFile}.`,
      objectName: object.name
    });
    return "";
  }
}

function statementSource(object: NormalizedObject): string | undefined {
  if (object.body.includes("statement.md")) return "statement.md";
  if (object.kind === "math" && ["setting", "notation", "definition"].includes(object.role)) {
    return object.body[0];
  }
  return undefined;
}

async function materializeObjectBody(
  graph: NormalizedGraph,
  node: ResolvedRouteNode,
  diagnostics: RouteDiagnostic[]
): Promise<string> {
  const object = node.object;
  if (node.representation === "omit") return "";
  if (node.representation === "reference") return "";
  if (node.representation === "summary") return object.summary ?? "";
  if (node.representation === "statement") {
    const source = statementSource(object);
    if (!source) {
      diagnostics.push({
        severity: "error",
        code: "missing_statement_export",
        message: `${object.name} cannot be exported as statement under the v1 statement rules.`,
        objectName: object.name
      });
      return object.summary ?? "";
    }
    return readBodyFile(graph, object, source, diagnostics);
  }
  const bodies = await Promise.all(object.body.map((file) => readBodyFile(graph, object, file, diagnostics)));
  return bodies.filter(Boolean).join("\n\n");
}

function linkLabel(refTarget: string, displayText?: string): string {
  return displayText && displayText.trim() ? displayText.trim() : refTarget;
}

function collapseRepeatedSelfLinkLabels(source: string, labels: Set<string>): string {
  let out = source;
  for (const label of [...labels].sort((a, b) => b.length - a.length)) {
    if (!label) continue;
    const escaped = escapeRegex(label);
    out = out.replace(new RegExp(`${escaped}\\s*--\\s*${escaped}`, "g"), label);
  }
  return out;
}

function rewriteAtlasLinks(
  graph: NormalizedGraph,
  source: string,
  currentObject: NormalizedObject,
  included: Set<string>,
  diagnostics: RouteDiagnostic[],
  collectReference?: (object: NormalizedObject) => void
): string {
  const refs = parseMarkdownReferences(source)
    .sort((a, b) => b.start - a.start);
  const hardTargets = new Set([
    ...hardEdgeTargets(currentObject.edges.requires),
    ...hardEdgeTargets(currentObject.edges.uses)
  ]);
  const selfLabels = new Set<string>();
  let out = source;
  for (const ref of refs) {
    const resolved = graph.objectsByName[ref.target] ?? graph.objectsByUid[ref.target] ?? graph.objectsByUid[graph.aliases[ref.target]];
    if (resolved?.citation) collectReference?.(resolved);
    const label = linkLabel(resolved?.title ?? ref.target, ref.displayText);
    let replacement: string;
    if (resolved?.name === currentObject.name) {
      selfLabels.add(label);
      replacement = label;
    } else if (resolved && included.has(resolved.name)) {
      replacement = `[${label}](#${anchorForName(resolved.name)})`;
    } else {
      if (resolved && hardTargets.has(resolved.name)) {
        diagnostics.push({
          severity: "error",
          code: "hard_link_not_in_context",
          message: `${currentObject.name} links to hard dependency ${resolved.name}, but it is not included in the export.`,
          objectName: currentObject.name,
          target: resolved.name
        });
      }
      replacement = `${label} (not included in this context)`;
    }
    out = `${out.slice(0, ref.start)}${replacement}${out.slice(ref.end)}`;
  }
  return collapseRepeatedSelfLinkLabels(out, selfLabels);
}

function sectionForNode(node: ResolvedRouteNode, targetName: string): string {
  if (node.object.name === targetName) return "Target";
  const boundary = routeBoundaryKind(node);
  if (boundary === "accepted_input") return "Accepted Inputs";
  if (boundary === "context_cut") return "Context Cuts";
  if (node.object.kind === "math" && ["setting", "notation", "definition", "assumption", "problem"].includes(node.object.role)) {
    return "Definitions and Settings";
  }
  if (node.object.kind === "math" && node.object.role === "claim") return "Supporting Claims";
  if (node.object.kind === "math" && node.object.role === "proof") return "Proofs";
  if (node.object.kind === "issue") return "Open Issues";
  return "Citation and Source Notes";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripBibValue(value: string): string {
  return value
    .replace(/\\[{}]/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findBibEntry(source: string, bibkey: string): string | undefined {
  const match = new RegExp(`@\\w+\\s*\\{\\s*${escapeRegex(bibkey)}\\s*,`, "i").exec(source);
  if (!match) return undefined;
  const start = match.index;
  const open = source.indexOf("{", start);
  if (open < 0) return undefined;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return undefined;
}

function parseBibFields(entry: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const firstComma = entry.indexOf(",");
  const lastBrace = entry.lastIndexOf("}");
  if (firstComma < 0 || lastBrace < firstComma) return fields;
  const body = entry.slice(firstComma + 1, lastBrace);
  let index = 0;
  while (index < body.length) {
    while (index < body.length && /[\s,]/.test(body[index])) index += 1;
    const nameStart = index;
    while (index < body.length && /[A-Za-z0-9_-]/.test(body[index])) index += 1;
    const name = body.slice(nameStart, index).toLowerCase();
    while (index < body.length && /\s/.test(body[index])) index += 1;
    if (!name || body[index] !== "=") {
      index += 1;
      continue;
    }
    index += 1;
    while (index < body.length && /\s/.test(body[index])) index += 1;
    let value = "";
    if (body[index] === "{") {
      const valueStart = index + 1;
      let depth = 1;
      index += 1;
      while (index < body.length && depth > 0) {
        if (body[index] === "{") depth += 1;
        if (body[index] === "}") depth -= 1;
        index += 1;
      }
      value = body.slice(valueStart, index - 1);
    } else if (body[index] === "\"") {
      const valueStart = index + 1;
      index += 1;
      while (index < body.length && body[index] !== "\"") index += 1;
      value = body.slice(valueStart, index);
      index += 1;
    } else {
      const valueStart = index;
      while (index < body.length && body[index] !== ",") index += 1;
      value = body.slice(valueStart, index);
    }
    fields[name] = stripBibValue(value);
  }
  return fields;
}

async function citationReferenceLine(object: NormalizedObject): Promise<string | undefined> {
  if (!object.citation) return undefined;
  const bibkey = object.citation.bibkey;
  if (!object.citation.bibfile) return `[${bibkey}] ${object.title}.`;
  try {
    const source = await fs.readFile(object.citation.bibfile, "utf8");
    const entry = findBibEntry(source, bibkey);
    if (!entry) return `[${bibkey}] ${object.title}.`;
    const fields = parseBibFields(entry);
    const author = fields.author ?? fields.editor;
    const title = fields.title;
    const venue = fields.journal ?? fields.booktitle ?? fields.publisher ?? fields.school;
    const volumeIssue = [
      fields.volume,
      fields.number ? `(${fields.number})` : undefined
    ].filter(Boolean).join("");
    const pages = fields.pages ? `pp. ${fields.pages}` : undefined;
    const year = fields.year;
    const doi = fields.doi ? `DOI: ${fields.doi}` : undefined;
    const parts = [author, title, venue, volumeIssue, pages, year, doi].filter((part): part is string => Boolean(part));
    return parts.length ? `[${bibkey}] ${parts.join(". ")}.` : `[${bibkey}] ${object.title}.`;
  } catch {
    return `[${bibkey}] ${object.title}.`;
  }
}

function citationRole(node: ResolvedRouteNode): string {
  if (routeBoundaryKind(node) === "accepted_input") {
    return "accepted input";
  }
  if (routeBoundaryKind(node) === "context_cut") return "context cut";
  if (node.object.source_result || (node.object.provenance !== "internal" && node.object.kind === "math")) {
    return "source of imported statement";
  }
  return "background reference";
}

function linkedCitationRole(object: NormalizedObject): string {
  if (object.source_result || (object.provenance !== "internal" && object.kind === "math")) {
    return "source of imported statement";
  }
  return "background reference";
}

async function referenceContext(route: ResolvedRoute, linkedObjects: NormalizedObject[]): Promise<string[]> {
  const entries = new Map<string, { line: string; roles: Set<string> }>();
  const lines: string[] = [];
  const addObject = async (object: NormalizedObject, role: string) => {
    const bibkey = object.citation?.bibkey;
    if (!bibkey) return;
    const existing = entries.get(bibkey);
    if (existing) {
      existing.roles.add(role);
      return;
    }
    const line = await citationReferenceLine(object);
    if (line) entries.set(bibkey, { line, roles: new Set([role]) });
  };

  for (const node of route.nodes) {
    await addObject(node.object, citationRole(node));
  }
  for (const object of linkedObjects) {
    await addObject(object, linkedCitationRole(object));
  }
  for (const entry of entries.values()) {
    lines.push(`- ${entry.line}`);
    lines.push(`  Role in this context: ${[...entry.roles].join("; ")}.`);
  }
  return lines;
}

const PROOF_TREE_MAX_NODES = 80;
const PROOF_TREE_MAX_DEPTH = 10;

function proofTreeAnnotation(node: ProofTreeNode): string {
  if (node.role === "boundary") {
    return routeBoundaryKind(node.routeNode ?? { object: node.object, decision: "boundary" }) === "accepted_input"
      ? " [accepted input]"
      : " [context cut]";
  }
  if (node.role === "shared_reference") return " [shared]";
  if (node.role === "open") return " [open]";
  return "";
}

function proofTreeLines(
  node: ProofTreeNode,
  state: { emitted: number; truncated: boolean },
  prefix = "",
  isLast = true,
  isRoot = true
): string[] {
  if (state.emitted >= PROOF_TREE_MAX_NODES) {
    state.truncated = true;
    return [];
  }

  const connector = isRoot ? "" : `${prefix}${isLast ? "`-- " : "|-- "}`;
  const lines = [`${connector}${node.object.name}${proofTreeAnnotation(node)}`];
  state.emitted += 1;

  if (node.depth >= PROOF_TREE_MAX_DEPTH) {
    if (node.children.length) state.truncated = true;
    return lines;
  }

  const childPrefix = isRoot ? "" : `${prefix}${isLast ? "    " : "|   "}`;
  node.children.forEach((child, index) => {
    lines.push(...proofTreeLines(child, state, childPrefix, index === node.children.length - 1, false));
  });
  return lines;
}

function proofRouteSection(route: ResolvedRoute, graph: NormalizedGraph): string[] {
  const tree = deriveRouteProofTree(route, graph);
  const state = { emitted: 0, truncated: false };
  const lines = proofTreeLines(tree.root, state);
  if (state.truncated) lines.push("... proof tree truncated; see object sections for remaining context.");

  return [
    "## Proof Route",
    "",
    `Target: \`${route.target.name}\``,
    "",
    "Short proof tree; full dependency edges are intentionally omitted.",
    "",
    "```text",
    ...lines,
    "```"
  ];
}

function acceptedInputsIntro(nodes: ResolvedRouteNode[]): string[] {
  if (!nodes.length) {
    return ["No accepted inputs are included without proof in this context."];
  }
  return [
    "The following statements are included, but their proofs are not included in this context.",
    "",
    ...nodes.map((node) => `- \`${node.object.name}\``)
  ];
}

function contextCutsIntro(nodes: ResolvedRouteNode[]): string[] {
  if (!nodes.length) {
    return ["No internal context cuts are included in this context."];
  }
  return [
    "The following internal or support objects are included without expanding their outgoing dependencies.",
    "",
    ...nodes.map((node) => `- \`${node.object.name}\``)
  ];
}

async function objectSection(
  graph: NormalizedGraph,
  node: ResolvedRouteNode,
  included: Set<string>,
  diagnostics: RouteDiagnostic[],
  collectReference?: (object: NormalizedObject) => void
): Promise<string> {
  const body = await materializeObjectBody(graph, node, diagnostics);
  const rewritten = rewriteAtlasLinks(graph, body, node.object, included, diagnostics, collectReference).trim();
  const parts = [
    `<a id="${anchorForName(node.object.name)}"></a>`,
    `### ${node.object.title}`,
    "",
    `Object: \`${node.object.name}\``
  ];
  if (node.decision === "boundary") {
    const boundary = routeBoundaryKind(node);
    parts.push("", boundary === "accepted_input"
      ? "> Accepted input; proof not included."
      : "> Context cut; dependencies are not expanded in this context.");
  }
  if (rewritten) {
    parts.push("", rewritten);
  }
  return parts.join("\n");
}

export function createLocalManifest(graph: NormalizedGraph, route: ResolvedRoute): Record<string, unknown> {
  return {
    project_uid: graph.config.project,
    graph_built_at: graph.builtAt,
    target: route.target.name,
    profile: route.profile,
    route_status: route.status,
    selected_proofs: route.selectedProofs,
    boundaries: route.boundaries,
    object_count: route.nodes.length,
    representation: Object.fromEntries(route.nodes.map((node) => [node.object.name, node.representation])),
    inclusion_reasons: Object.fromEntries(route.nodes.map((node) => [
      node.object.name,
      node.witnessPaths.map((pathItems) => pathItems.join(" -> "))
    ])),
    diagnostics: route.diagnostics,
    objects: route.nodes.map((node) => ({
      uid: node.object.uid,
      name: node.object.name,
      title: node.object.title,
      status: node.object.status,
      provenance: node.object.provenance,
      representation: node.representation,
      decision: node.decision,
      inclusion_class: node.inclusionClass,
      hardness: node.hardness
    }))
  };
}

export async function exportCloudMarkdown(graph: NormalizedGraph, route: ResolvedRoute): Promise<ExportResult> {
  const diagnostics = [...route.diagnostics];
  const included = new Set(route.nodes.map((node) => node.object.name));
  const linear = linearizeRoute(route);
  const linkedReferenceObjects = new Map<string, NormalizedObject>();
  const collectReference = (object: NormalizedObject) => {
    if (!object.citation) return;
    linkedReferenceObjects.set(object.citation.bibkey, object);
  };

  const sections = new Map<string, ResolvedRouteNode[]>();
  for (const node of linear.nodes) {
    const section = sectionForNode(node, route.target.name);
    sections.set(section, [...(sections.get(section) ?? []), node]);
  }
  const acceptedInputNodes = sections.get("Accepted Inputs") ?? [];
  const contextCutNodes = sections.get("Context Cuts") ?? [];

  const out: string[] = [
    `# Proof Verification Context: ${route.target.title}`,
    "",
    "This Markdown file isolates the local context for checking whether the included proof route establishes the target statement. It is not a proof verdict; workflow status, citation trust, export diagnostics, and export-integrity metadata are intentionally omitted from this context.",
    "",
    `Route status: ${routeStatusLine(route.status)}.`,
    "",
    ...proofRouteSection(route, graph),
    "",
    "## Accepted Inputs",
    "",
    ...acceptedInputsIntro(acceptedInputNodes)
  ];

  for (const node of acceptedInputNodes) {
    out.push("", await objectSection(graph, node, included, diagnostics, collectReference), "");
  }

  if (contextCutNodes.length) {
    out.push("", "## Context Cuts", "", ...contextCutsIntro(contextCutNodes));
    for (const node of contextCutNodes) {
      out.push("", await objectSection(graph, node, included, diagnostics, collectReference), "");
    }
  }

  const orderedSections = [
    "Target",
    "Definitions and Settings",
    "Supporting Claims",
    "Proofs",
    "Open Issues",
    "Citation and Source Notes"
  ];
  for (const title of orderedSections) {
    const nodes = sections.get(title) ?? [];
    if (!nodes.length) continue;
    out.push("", `## ${title}`, "");
    for (const node of nodes) {
      out.push(await objectSection(graph, node, included, diagnostics, collectReference), "");
    }
  }

  const references = await referenceContext(route, [...linkedReferenceObjects.values()]);
  if (references.length) {
    out.push("", "## References", "", ...references);
  }

  return { format: "markdown", content: out.join("\n").replace(/\n{3,}/g, "\n\n"), diagnostics };
}

export function exportManifest(graph: NormalizedGraph, route: ResolvedRoute): ExportResult {
  return {
    format: "manifest",
    content: `${JSON.stringify(createLocalManifest(graph, route), null, 2)}\n`,
    diagnostics: [...route.diagnostics]
  };
}

export function exportJson(graph: NormalizedGraph, route: ResolvedRoute): ExportResult {
  return {
    format: "json",
    content: `${JSON.stringify({
      manifest: createLocalManifest(graph, route),
      resolved_route: {
        target: route.target.name,
        profile: route.profile,
        selected_proofs: route.selectedProofs,
        boundaries: route.boundaries,
        closed: route.closed,
        content_sufficient: route.contentSufficient,
        route_status: route.status,
        nodes: route.nodes.map((node) => ({
          name: node.object.name,
          uid: node.object.uid,
          role: node.role,
          decision: node.decision,
          representation: node.representation,
          depth: node.depth,
          hardness: node.hardness,
          direct: node.direct,
          witness_paths: node.witnessPaths
        })),
        edges: route.edges,
        diagnostics: route.diagnostics
      }
    }, null, 2)}\n`,
    diagnostics: [...route.diagnostics]
  };
}

export async function exportRoute(graph: NormalizedGraph, route: ResolvedRoute, format: ExportFormat): Promise<ExportResult> {
  if (format === "markdown") return exportCloudMarkdown(graph, route);
  if (format === "json") return exportJson(graph, route);
  return exportManifest(graph, route);
}

export async function createSnapshot(graph: NormalizedGraph, routeRecipe: RouteView, route: ResolvedRoute): Promise<RouteSnapshot> {
  const markdown = await exportCloudMarkdown(graph, route);
  return {
    schema_version: "0.1",
    type: "snapshot",
    exported_at: new Date().toISOString(),
    project_uid: graph.config.project,
    graph_built_at: graph.builtAt,
    route: routeRecipe,
    object_names: route.nodes.map((node) => node.object.name),
    markdown: markdown.content,
    diagnostics: markdown.diagnostics
  };
}
