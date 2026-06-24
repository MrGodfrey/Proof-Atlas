import { hardEdgeRefs } from "./edgeUtils";
import { isProofObligationObject } from "./proofObjects";
import type { NormalizedGraph, NormalizedObject } from "./types";
import type { ResolvedRoute, ResolvedRouteNode, RouteDiagnostic } from "./routeResolver";

export type ProofTreeNodeRole =
  | "target"
  | "selected_proof"
  | "support"
  | "boundary"
  | "shared_reference"
  | "open";

export interface ProofTreeNode {
  id: string;
  object: NormalizedObject;
  routeNode?: ResolvedRouteNode;
  role: ProofTreeNodeRole;
  depth: number;
  children: ProofTreeNode[];
  diagnostics: RouteDiagnostic[];
}

export interface RouteProofTree {
  target: NormalizedObject;
  selectedRootProof?: NormalizedObject;
  root: ProofTreeNode;
  defaultExpandedNodeIds: string[];
  mainPathNodeIds: string[];
  foundationNodes: ResolvedRouteNode[];
  boundaryNodes: ResolvedRouteNode[];
  openNodes: ResolvedRouteNode[];
  diagnostics: RouteDiagnostic[];
}

const TREE_SUPPORT_ROLES = new Set(["proof", "proof_fragment", "construction", "calculation"]);
const CONTEXT_ROLES = new Set(["problem", "setting", "notation", "definition", "model", "assumption", "example", "counterexample"]);
const CONTEXT_DISPLAYS = new Set(["statement", "estimate"]);

function proofTreeObjectKey(path: string[], object: NormalizedObject): string {
  return [...path, object.name].join(">");
}

function diagnosticsForObject(diagnostics: RouteDiagnostic[], object: NormalizedObject): RouteDiagnostic[] {
  return diagnostics.filter((item) => item.objectName === object.name || item.target === object.name);
}

function isTreeSupportObject(object: NormalizedObject): boolean {
  return object.kind === "math" && TREE_SUPPORT_ROLES.has(object.role);
}

function isContextObject(object: NormalizedObject): boolean {
  if (object.kind !== "math") return true;
  if (CONTEXT_DISPLAYS.has(object.display_as)) return true;
  return CONTEXT_ROLES.has(object.role);
}

function routeNodeSortKey(route: ResolvedRoute, object: NormalizedObject): string {
  const hintIndex = route.orderHints.indexOf(object.name);
  const hinted = hintIndex === -1 ? Number.MAX_SAFE_INTEGER : hintIndex;
  const node = route.nodes.find((item) => item.object.name === object.name);
  return [String(hinted).padStart(8, "0"), String(node?.depth ?? 999).padStart(4, "0"), object.name].join("|");
}

function hardTreeDependencies(graph: NormalizedGraph, route: ResolvedRoute, object: NormalizedObject): NormalizedObject[] {
  const included = new Set(route.nodes.map((node) => node.object.name));
  const refs = object.role === "claim"
    ? []
    : [...hardEdgeRefs(object.edges.uses), ...hardEdgeRefs(object.edges.requires)];
  const out: NormalizedObject[] = [];
  for (const ref of refs) {
    const dependency = graph.objectsByName[ref.target];
    if (!dependency || !included.has(dependency.name)) continue;
    const routeNode = route.nodes.find((node) => node.object.name === dependency.name);
    if (routeNode?.decision === "boundary" || isProofObligationObject(dependency) || isTreeSupportObject(dependency)) {
      out.push(dependency);
    }
  }
  return out.sort((a, b) => routeNodeSortKey(route, a).localeCompare(routeNodeSortKey(route, b)));
}

export function deriveRouteProofTree(route: ResolvedRoute, graph: NormalizedGraph): RouteProofTree {
  const routeNodesByName = new Map(route.nodes.map((node) => [node.object.name, node]));
  const treeObjectNames = new Set<string>();
  const expandedObjectNames = new Set<string>();
  const openObjectNames = new Set(
    route.nodes
      .filter((node) => node.inclusionClass === "open" || node.decision === "unresolved")
      .map((node) => node.object.name)
  );

  const makeNode = (
    object: NormalizedObject,
    role: ProofTreeNodeRole,
    path: string[],
    depth: number
  ): ProofTreeNode => {
    treeObjectNames.add(object.name);
    const routeNode = routeNodesByName.get(object.name);
    const id = proofTreeObjectKey(path, object);
    const diagnostics = diagnosticsForObject(route.diagnostics, object);
    const boundary = routeNode?.decision === "boundary" || route.boundaries.includes(object.name);
    const open = routeNode?.decision === "unresolved" || openObjectNames.has(object.name);
    const shared = role !== "target" && expandedObjectNames.has(object.name);
    const nodeRole: ProofTreeNodeRole = shared
      ? "shared_reference"
      : boundary
        ? "boundary"
        : open
          ? "open"
          : role;

    if (shared || boundary || open) {
      return { id, object, routeNode, role: nodeRole, depth, children: [], diagnostics };
    }

    expandedObjectNames.add(object.name);
    const children: ProofTreeNode[] = [];
    if (isProofObligationObject(object)) {
      const selectedProofName = route.selectedProofs[object.name];
      const selectedProof = selectedProofName ? graph.objectsByName[selectedProofName] : undefined;
      if (selectedProof && routeNodesByName.has(selectedProof.name)) {
        children.push(makeNode(selectedProof, "selected_proof", [...path, object.name], depth + 1));
      }
    } else if (isTreeSupportObject(object)) {
      for (const dependency of hardTreeDependencies(graph, route, object)) {
        children.push(makeNode(dependency, "support", [...path, object.name], depth + 1));
      }
    }

    return { id, object, routeNode, role: nodeRole, depth, children, diagnostics };
  };

  const root = makeNode(route.target, "target", [], 0);
  const defaultExpandedNodeIds = root.children.length ? [root.id] : [];
  const mainPathNodeIds: string[] = [];
  const collectMainPath = (node: ProofTreeNode) => {
    if (
      node.role !== "boundary"
      && node.role !== "shared_reference"
      && (isProofObligationObject(node.object) || isTreeSupportObject(node.object))
    ) {
      mainPathNodeIds.push(node.id);
    }
    for (const child of node.children) collectMainPath(child);
  };
  collectMainPath(root);

  const selectedRootProofName = route.selectedProofs[route.target.name];
  const selectedRootProof = selectedRootProofName ? graph.objectsByName[selectedRootProofName] : undefined;
  const foundationNodes = route.nodes.filter((node) => !treeObjectNames.has(node.object.name) && isContextObject(node.object));
  const boundaryNodes = route.nodes.filter((node) => node.inclusionClass === "boundary");
  const openNodes = route.nodes.filter((node) => node.inclusionClass === "open" || node.decision === "unresolved");

  return {
    target: route.target,
    selectedRootProof,
    root,
    defaultExpandedNodeIds,
    mainPathNodeIds,
    foundationNodes,
    boundaryNodes,
    openNodes,
    diagnostics: route.diagnostics
  };
}
