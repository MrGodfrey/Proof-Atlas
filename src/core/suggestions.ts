import fs from "node:fs/promises";
import path from "node:path";
import { edgeTargets } from "./edgeUtils";
import { linearizeRoute } from "./routeLinearizer";
import { resolveRoute } from "./routeResolver";
import { parseMarkdownReferences } from "./markdownRefs";
import type { EdgeStrength, EdgeType, NormalizedGraph, NormalizedObject } from "./types";
import { readYamlFile, writeYamlFile } from "./yaml";

export type SuggestionKind = "missing_edge" | "summary" | "route_order_hints";
export type SuggestionStatus = "pending" | "accepted" | "rejected";

interface BaseSuggestion {
  id: string;
  kind: SuggestionKind;
  status: SuggestionStatus;
  rationale: string;
}

export interface MissingEdgeSuggestion extends BaseSuggestion {
  kind: "missing_edge";
  object: string;
  edge_type: Extract<EdgeType, "requires" | "uses">;
  target: string;
  strength: EdgeStrength;
  reason: string;
}

export interface SummarySuggestion extends BaseSuggestion {
  kind: "summary";
  object: string;
  summary: string;
}

export interface RouteOrderHintsSuggestion extends BaseSuggestion {
  kind: "route_order_hints";
  route: string;
  order_hints: string[];
}

export type AtlasSuggestion = MissingEdgeSuggestion | SummarySuggestion | RouteOrderHintsSuggestion;

export interface SuggestionSet {
  schema_version: "0.1";
  type: "suggestion_set";
  status: "pending_confirmation";
  created_at: string;
  project: string;
  route?: string;
  generator: "proof_atlas_heuristic_prefill";
  instructions: string;
  suggestions: AtlasSuggestion[];
}

export interface CreateSuggestionOptions {
  routePath?: string;
}

export interface ApplySuggestionResult {
  applied: string[];
  skipped: Array<{ id: string; reason: string }>;
}

function suggestionId(parts: string[]): string {
  return `sug_${parts.join("_").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function existingDependencyTargets(object: NormalizedObject): Set<string> {
  return new Set([
    ...edgeTargets(object.edges.requires),
    ...edgeTargets(object.edges.uses),
    ...edgeTargets(object.edges.proves),
    ...edgeTargets(object.edges.cites),
    ...edgeTargets(object.edges.related_to)
  ]);
}

function suggestedEdgeType(source: NormalizedObject, target: NormalizedObject): "requires" | "uses" | undefined {
  if (source.kind !== "math" || target.kind !== "math") return undefined;
  if (target.role === "proof") return undefined;
  if (source.role === "proof") return "uses";
  return "requires";
}

async function readObjectBodies(graph: NormalizedGraph, object: NormalizedObject): Promise<Array<{ file: string; text: string }>> {
  const bodies: Array<{ file: string; text: string }> = [];
  for (const file of object.body) {
    try {
      bodies.push({ file, text: await fs.readFile(path.join(object.origin.atlasRoot, object.dir, file), "utf8") });
    } catch {
      // The graph validator reports missing bodies. Suggestions should not duplicate that failure.
    }
  }
  return bodies;
}

function resolveReference(graph: NormalizedGraph, target: string): NormalizedObject | undefined {
  return graph.objectsByName[target] ?? graph.objectsByUid[target] ?? graph.objectsByUid[graph.aliases[target]];
}

async function suggestMissingEdges(graph: NormalizedGraph): Promise<MissingEdgeSuggestion[]> {
  const suggestions = new Map<string, MissingEdgeSuggestion>();
  for (const object of graph.objects) {
    if (object.origin.kind !== "project") continue;
    const existing = existingDependencyTargets(object);
    for (const body of await readObjectBodies(graph, object)) {
      for (const ref of parseMarkdownReferences(body.text)) {
        const target = resolveReference(graph, ref.target);
        if (!target || target.name === object.name || existing.has(target.name)) continue;
        const edgeType = suggestedEdgeType(object, target);
        if (!edgeType) continue;
        const id = suggestionId(["edge", object.name, edgeType, target.name]);
        if (suggestions.has(id)) continue;
        suggestions.set(id, {
          id,
          kind: "missing_edge",
          status: "pending",
          object: object.name,
          edge_type: edgeType,
          target: target.name,
          strength: "hard",
          reason: `Referenced from ${body.file}; confirm whether this is a real ${edgeType} dependency.`,
          rationale: `${object.name} links to ${target.name} in ${body.file}, but no requires/uses edge records that dependency.`
        });
      }
    }
  }
  return [...suggestions.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, label?: string) => label ?? target)
    .replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, label?: string) => label ?? target)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[$*_`>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function draftSummary(text: string): string | undefined {
  const plain = markdownToPlainText(text);
  if (!plain) return undefined;
  const firstSentence = plain.match(/^.{40,220}?(?:[.!?](?:\s|$)|$)/)?.[0]?.trim() ?? plain.slice(0, 180).trim();
  if (!firstSentence) return undefined;
  return firstSentence.length > 220 ? `${firstSentence.slice(0, 217).trim()}...` : firstSentence;
}

async function suggestSummaries(graph: NormalizedGraph): Promise<SummarySuggestion[]> {
  const suggestions: SummarySuggestion[] = [];
  for (const object of graph.objects) {
    if (object.origin.kind !== "project") continue;
    if (object.summary) continue;
    const body = (await readObjectBodies(graph, object))[0];
    if (!body) continue;
    const summary = draftSummary(body.text);
    if (!summary) continue;
    suggestions.push({
      id: suggestionId(["summary", object.name]),
      kind: "summary",
      status: "pending",
      object: object.name,
      summary,
      rationale: `${object.name} has no summary; this draft is derived from ${body.file} and must be confirmed before writeback.`
    });
  }
  return suggestions.sort((a, b) => a.id.localeCompare(b.id));
}

function suggestRouteOrderHints(graph: NormalizedGraph, routePath: string | undefined): RouteOrderHintsSuggestion[] {
  if (!routePath) return [];
  const routeView = graph.routeViews.find((view) => view.path === routePath || path.resolve(graph.root, view.path) === path.resolve(graph.root, routePath));
  if (!routeView) return [];
  const route = resolveRoute(graph, routeView.route);
  const linear = linearizeRoute(route);
  const orderHints = linear.nodes.map((node) => node.object.name);
  const existing = routeView.route.render.order_hints ?? [];
  if (existing.join("\n") === orderHints.join("\n")) return [];
  return [{
    id: suggestionId(["order", routeView.path]),
    kind: "route_order_hints",
    status: "pending",
    route: routeView.path,
    order_hints: orderHints,
    rationale: `Suggested route-level order_hints from the current dependency-respecting linearization for ${routeView.path}.`
  }];
}

export async function createSuggestionSet(graph: NormalizedGraph, options: CreateSuggestionOptions = {}): Promise<SuggestionSet> {
  const suggestions = [
    ...(await suggestMissingEdges(graph)),
    ...(await suggestSummaries(graph)),
    ...suggestRouteOrderHints(graph, options.routePath)
  ];
  return {
    schema_version: "0.1",
    type: "suggestion_set",
    status: "pending_confirmation",
    created_at: new Date().toISOString(),
    project: graph.config.project,
    ...(options.routePath ? { route: options.routePath } : {}),
    generator: "proof_atlas_heuristic_prefill",
    instructions: [
      "These are pending suggestions for local AI or human review.",
      "Do not treat them as graph facts until an operator explicitly accepts suggestion ids.",
      "Apply writeback only through atlas apply-suggestions, local AI editing, or direct file edits."
    ].join(" "),
    suggestions
  };
}

function isSuggestionSet(value: unknown): value is SuggestionSet {
  return Boolean(value)
    && typeof value === "object"
    && (value as SuggestionSet).schema_version === "0.1"
    && (value as SuggestionSet).type === "suggestion_set"
    && Array.isArray((value as SuggestionSet).suggestions);
}

function rawEdgeTarget(item: unknown): string | undefined {
  if (item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).target === "string") {
    return (item as Record<string, unknown>).target as string;
  }
  return undefined;
}

async function applyMissingEdge(graph: NormalizedGraph, suggestion: MissingEdgeSuggestion): Promise<void> {
  const object = graph.objectsByName[suggestion.object];
  if (!object) throw new Error(`Suggestion ${suggestion.id} references missing object ${suggestion.object}.`);
  if (object.origin.kind !== "project" || object.origin.readonly) throw new Error(`Suggestion ${suggestion.id} targets readonly mounted object ${suggestion.object}.`);
  if (!graph.objectsByName[suggestion.target]) throw new Error(`Suggestion ${suggestion.id} references missing target ${suggestion.target}.`);
  const file = path.join(graph.root, object.objectPath);
  const raw = await readYamlFile<Record<string, unknown>>(file);
  if (!raw.edges || typeof raw.edges !== "object" || Array.isArray(raw.edges)) raw.edges = {};
  const edges = raw.edges as Record<string, unknown>;
  const list = Array.isArray(edges[suggestion.edge_type]) ? edges[suggestion.edge_type] as unknown[] : [];
  if (!list.some((item) => rawEdgeTarget(item) === suggestion.target)) {
    list.push({
      target: suggestion.target,
      strength: suggestion.strength,
      reason: suggestion.reason
    });
  }
  edges[suggestion.edge_type] = list;
  await writeYamlFile(file, raw);
}

async function applySummary(graph: NormalizedGraph, suggestion: SummarySuggestion): Promise<void> {
  const object = graph.objectsByName[suggestion.object];
  if (!object) throw new Error(`Suggestion ${suggestion.id} references missing object ${suggestion.object}.`);
  if (object.origin.kind !== "project" || object.origin.readonly) throw new Error(`Suggestion ${suggestion.id} targets readonly mounted object ${suggestion.object}.`);
  const file = path.join(graph.root, object.objectPath);
  const raw = await readYamlFile<Record<string, unknown>>(file);
  raw.summary = suggestion.summary;
  await writeYamlFile(file, raw);
}

async function applyRouteOrderHints(graph: NormalizedGraph, suggestion: RouteOrderHintsSuggestion): Promise<void> {
  const routeView = graph.routeViews.find((view) => view.path === suggestion.route || path.resolve(graph.root, view.path) === path.resolve(graph.root, suggestion.route));
  if (!routeView) throw new Error(`Suggestion ${suggestion.id} references missing route ${suggestion.route}.`);
  for (const name of suggestion.order_hints) {
    if (!graph.objectsByName[name]) throw new Error(`Suggestion ${suggestion.id} contains missing order hint ${name}.`);
  }
  const file = path.join(graph.root, routeView.path);
  const raw = await readYamlFile<Record<string, unknown>>(file);
  if (!raw.render || typeof raw.render !== "object" || Array.isArray(raw.render)) raw.render = {};
  (raw.render as Record<string, unknown>).order_hints = suggestion.order_hints;
  await writeYamlFile(file, raw);
}

export async function readSuggestionSet(filePath: string): Promise<SuggestionSet> {
  const raw = await readYamlFile<unknown>(filePath);
  if (!isSuggestionSet(raw)) throw new Error(`${filePath} is not a Proof Atlas suggestion set.`);
  return raw;
}

export async function applySuggestionSet(graph: NormalizedGraph, suggestionSet: SuggestionSet, acceptedIds: Set<string>): Promise<ApplySuggestionResult> {
  const applied: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const suggestion of suggestionSet.suggestions) {
    if (!acceptedIds.has("all") && !acceptedIds.has(suggestion.id)) {
      skipped.push({ id: suggestion.id, reason: "not accepted" });
      continue;
    }
    if (suggestion.status === "rejected") {
      skipped.push({ id: suggestion.id, reason: "rejected" });
      continue;
    }
    if (suggestion.kind === "missing_edge") await applyMissingEdge(graph, suggestion);
    else if (suggestion.kind === "summary") await applySummary(graph, suggestion);
    else await applyRouteOrderHints(graph, suggestion);
    applied.push(suggestion.id);
  }
  return { applied, skipped };
}
