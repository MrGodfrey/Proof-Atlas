import type { NormalizedObject } from "./types";
import type { ResolvedRoute, ResolvedRouteNode } from "./routeResolver";
import { routeBoundaryKind } from "./routeResolver";

export interface LinearRouteGroup {
  key: string;
  title: string;
  nodes: ResolvedRouteNode[];
}

export interface LinearRoute {
  nodes: ResolvedRouteNode[];
  groups: LinearRouteGroup[];
}

const GROUP_ORDER = [
  "settings",
  "accepted_inputs",
  "context_cuts",
  "claims",
  "proofs",
  "issues",
  "sources",
  "target",
  "other"
];

function groupForObject(object: NormalizedObject, targetName: string, decision: string): { key: string; title: string } {
  if (object.name === targetName) return { key: "target", title: "Target" };
  if (decision === "boundary") {
    const boundary = routeBoundaryKind({ object, decision: "boundary" });
    return boundary === "accepted_input"
      ? { key: "accepted_inputs", title: "Accepted Inputs" }
      : { key: "context_cuts", title: "Context Cuts" };
  }
  if (object.kind === "math" && ["setting", "notation", "definition", "assumption", "problem"].includes(object.role)) {
    return { key: "settings", title: "Definitions and Settings" };
  }
  if (object.kind === "math" && object.role === "claim") return { key: "claims", title: "Supporting Claims" };
  if (object.kind === "math" && object.role === "proof") return { key: "proofs", title: "Proofs" };
  if (object.kind === "issue") return { key: "issues", title: "Open Issues" };
  if (object.kind === "note" || object.provenance !== "internal") return { key: "sources", title: "Source Manifest" };
  return { key: "other", title: "Other Context" };
}

function sortWithinGroup(a: ResolvedRouteNode, b: ResolvedRouteNode, hintedIndex = new Map<string, number>()): number {
  const importance: Record<string, number> = { main: 0, supporting: 1, background: 2, local: 3 };
  const missingHint = Number.MAX_SAFE_INTEGER;
  return (hintedIndex.get(a.object.name) ?? missingHint) - (hintedIndex.get(b.object.name) ?? missingHint)
    || (importance[a.object.importance] ?? 9) - (importance[b.object.importance] ?? 9)
    || a.depth - b.depth
    || a.object.name.localeCompare(b.object.name);
}

export function linearizeRoute(route: ResolvedRoute): LinearRoute {
  const hintedIndex = new Map(route.orderHints.map((name, index) => [name, index]));
  const sortNodes = (a: ResolvedRouteNode, b: ResolvedRouteNode) => sortWithinGroup(a, b, hintedIndex);
  const nodeMap = new Map(route.nodes.map((node) => [node.object.name, node]));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of route.nodes) indegree.set(node.object.name, 0);

  for (const edge of route.edges) {
    if (edge.strength !== "hard" || !["requires", "uses"].includes(edge.type)) continue;
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    // Dependencies should appear before dependents.
    outgoing.set(edge.target, [...(outgoing.get(edge.target) ?? []), edge.source]);
    indegree.set(edge.source, (indegree.get(edge.source) ?? 0) + 1);
  }

  const ready = [...route.nodes]
    .filter((node) => (indegree.get(node.object.name) ?? 0) === 0)
    .sort(sortNodes);
  const ordered: ResolvedRouteNode[] = [];
  while (ready.length) {
    const node = ready.shift()!;
    ordered.push(node);
    for (const nextName of outgoing.get(node.object.name) ?? []) {
      indegree.set(nextName, (indegree.get(nextName) ?? 0) - 1);
      if ((indegree.get(nextName) ?? 0) === 0) {
        const next = nodeMap.get(nextName);
        if (next) {
          ready.push(next);
          ready.sort(sortNodes);
        }
      }
    }
  }

  const missing = route.nodes.filter((node) => !ordered.some((item) => item.object.name === node.object.name));
  ordered.push(...missing.sort(sortNodes));

  const grouped = new Map<string, LinearRouteGroup>();
  for (const node of ordered) {
    const group = groupForObject(node.object, route.target.name, node.decision);
    grouped.set(group.key, {
      key: group.key,
      title: group.title,
      nodes: [...(grouped.get(group.key)?.nodes ?? []), node]
    });
  }

  const groups = [...grouped.values()].sort((a, b) => GROUP_ORDER.indexOf(a.key) - GROUP_ORDER.indexOf(b.key));
  return { nodes: ordered, groups };
}
