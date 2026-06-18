import fs from "node:fs/promises";
import path from "node:path";
import { edgeTargets, hardEdgeTargets } from "./edgeUtils";
import { parseMarkdownReferences } from "./markdownRefs";
import type { NormalizedGraph, NormalizedObject, RepresentationMode, RouteView } from "./types";
import type { ResolvedRoute, RouteDiagnostic, ResolvedRouteNode } from "./routeResolver";
import { linearizeRoute } from "./routeLinearizer";

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

function metadataLines(graph: NormalizedGraph, node: ResolvedRouteNode): string[] {
  const object = node.object;
  return [
    `uid: ${object.uid}`,
    `name: ${object.name}`,
    `status: ${object.status}`,
    `provenance: ${object.provenance}`,
    `source path: ${path.posix.join(object.dir, "object.yml")}`,
    `representation: ${node.representation}`,
    `decision: ${node.decision}`,
    `inclusion_class: ${node.inclusionClass}`,
    `hardness: ${node.hardness}`,
    `project: ${graph.config.project}`
  ];
}

async function readBodyFile(graph: NormalizedGraph, object: NormalizedObject, bodyFile: string, diagnostics: RouteDiagnostic[]): Promise<string> {
  const filePath = path.join(graph.root, object.dir, bodyFile);
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
  if (object.kind === "math" && ["setting", "notation", "definition", "model", "construction", "calculation"].includes(object.role)) {
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

function rewriteAtlasLinks(
  graph: NormalizedGraph,
  source: string,
  currentObject: NormalizedObject,
  included: Set<string>,
  diagnostics: RouteDiagnostic[]
): string {
  const refs = parseMarkdownReferences(source)
    .sort((a, b) => b.start - a.start);
  const hardTargets = new Set([
    ...hardEdgeTargets(currentObject.edges.requires),
    ...hardEdgeTargets(currentObject.edges.uses)
  ]);
  let out = source;
  for (const ref of refs) {
    const resolved = graph.objectsByName[ref.target] ?? graph.objectsByUid[ref.target] ?? graph.objectsByUid[graph.aliases[ref.target]];
    const label = linkLabel(resolved?.title ?? ref.target, ref.displayText);
    let replacement: string;
    if (resolved && included.has(resolved.name)) {
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
  return out;
}

function sectionForNode(node: ResolvedRouteNode, targetName: string): string {
  if (node.object.name === targetName) return "Target";
  if (node.decision === "boundary") return "Imported Assumptions / Boundaries";
  if (node.object.kind === "math" && ["setting", "notation", "definition", "assumption", "problem"].includes(node.object.role)) {
    return "Definitions and Settings";
  }
  if (node.object.kind === "math" && ["model", "construction", "calculation"].includes(node.object.role)) {
    return "Definitions and Settings";
  }
  if (node.object.kind === "math" && node.object.role === "claim") return "Supporting Claims";
  if (node.object.kind === "math" && ["proof", "proof_fragment"].includes(node.object.role)) return "Proofs and Proof Fragments";
  if (node.object.kind === "issue") return "Open Issues";
  return "Source Manifest";
}

async function objectSection(
  graph: NormalizedGraph,
  node: ResolvedRouteNode,
  included: Set<string>,
  diagnostics: RouteDiagnostic[]
): Promise<string> {
  const body = await materializeObjectBody(graph, node, diagnostics);
  const rewritten = rewriteAtlasLinks(graph, body, node.object, included, diagnostics).trim();
  const boundary = node.decision === "boundary" ? "\n\n> Accepted boundary; dependencies are not expanded in this context." : "";
  return [
    `<a id="${anchorForName(node.object.name)}"></a>`,
    `### ${node.object.title}`,
    "",
    "```yaml",
    metadataLines(graph, node).join("\n"),
    "```",
    boundary,
    rewritten
  ].filter((part) => part !== "").join("\n");
}

export function createLocalManifest(graph: NormalizedGraph, route: ResolvedRoute): Record<string, unknown> {
  return {
    project_uid: graph.config.project,
    graph_built_at: graph.builtAt,
    target: route.target.name,
    profile: route.profile,
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
      hardness: node.hardness,
      token_estimates: node.tokenEstimates
    }))
  };
}

export async function exportCloudMarkdown(graph: NormalizedGraph, route: ResolvedRoute): Promise<ExportResult> {
  const diagnostics = [...route.diagnostics];
  const included = new Set(route.nodes.map((node) => node.object.name));
  const linear = linearizeRoute(route);
  const selectedProofs = Object.entries(route.selectedProofs)
    .map(([claim, proof]) => `- ${claim}: ${proof}`)
    .join("\n") || "- No proof choices selected.";

  const sections = new Map<string, ResolvedRouteNode[]>();
  for (const node of linear.nodes) {
    const section = sectionForNode(node, route.target.name);
    sections.set(section, [...(sections.get(section) ?? []), node]);
  }

  const out: string[] = [
    `# Proof Atlas Cloud Context: ${route.target.title}`,
    "",
    "## Task",
    "",
    `Use this context to reason about \`${route.target.name}\` under the \`${route.profile}\` profile. Hard dependencies are materialized at or above their representation floor; boundary nodes are accepted inputs whose dependencies are intentionally not expanded.`,
    "",
    "## Selected Proof Route",
    "",
    selectedProofs
  ];

  const orderedSections = [
    "Target",
    "Definitions and Settings",
    "Imported Assumptions / Boundaries",
    "Supporting Claims",
    "Proofs and Proof Fragments",
    "Open Issues",
    "Source Manifest"
  ];
  for (const title of orderedSections) {
    const nodes = sections.get(title) ?? [];
    if (!nodes.length) continue;
    out.push("", `## ${title}`, "");
    for (const node of nodes) {
      out.push(await objectSection(graph, node, included, diagnostics), "");
    }
  }

  out.push("## Diagnostics", "");
  if (diagnostics.length === 0) {
    out.push("No diagnostics.");
  } else {
    for (const item of diagnostics) {
      out.push(`- [${item.severity}] ${item.code}: ${item.message}`);
    }
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
        total_tokens: route.totalTokens,
        closed: route.closed,
        content_sufficient: route.contentSufficient,
        nodes: route.nodes.map((node) => ({
          name: node.object.name,
          uid: node.object.uid,
          role: node.role,
          decision: node.decision,
          representation: node.representation,
          depth: node.depth,
          hardness: node.hardness,
          direct: node.direct,
          witness_paths: node.witnessPaths,
          token_estimates: node.tokenEstimates,
          marginal_cost: node.marginalCost
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
