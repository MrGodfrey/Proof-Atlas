import type { ProofTreeNode, RouteProofTree } from "../core/routeProofTree";

function indexProofTreeNodes(root: ProofTreeNode): Map<string, ProofTreeNode> {
  const nodes = new Map<string, ProofTreeNode>();
  const visit = (node: ProofTreeNode) => {
    nodes.set(node.id, node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return nodes;
}

export function uniqueMainPathExpansionNodeIds(
  tree: Pick<RouteProofTree, "root" | "mainPathNodeIds">
): Set<string> {
  const nodes = indexProofTreeNodes(tree.root);
  const expandedIds = new Set<string>();
  const expandedObjectNames = new Set<string>();
  for (const id of tree.mainPathNodeIds) {
    const node = nodes.get(id);
    if (!node || node.children.length === 0 || expandedObjectNames.has(node.object.name)) continue;
    expandedObjectNames.add(node.object.name);
    expandedIds.add(id);
  }
  return expandedIds;
}

export function mergeUniqueMainPathExpansion(
  tree: Pick<RouteProofTree, "root" | "mainPathNodeIds">,
  expandedNodes: ReadonlySet<string>
): Set<string> {
  const mainPathIds = new Set(tree.mainPathNodeIds);
  const uniqueMainPathIds = uniqueMainPathExpansionNodeIds(tree);
  const next = new Set([...expandedNodes].filter((id) => !mainPathIds.has(id)));
  for (const id of uniqueMainPathIds) next.add(id);
  return next;
}

export function hasUniqueMainPathExpansionChange(
  tree: Pick<RouteProofTree, "root" | "mainPathNodeIds">,
  expandedNodes: ReadonlySet<string>
): boolean {
  const mainPathIds = new Set(tree.mainPathNodeIds);
  const uniqueMainPathIds = uniqueMainPathExpansionNodeIds(tree);
  for (const id of uniqueMainPathIds) {
    if (!expandedNodes.has(id)) return true;
  }
  for (const id of expandedNodes) {
    if (mainPathIds.has(id) && !uniqueMainPathIds.has(id)) return true;
  }
  return false;
}
