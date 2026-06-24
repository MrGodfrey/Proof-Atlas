export type RouteNarrativeScope = {
  target: { name: string };
  nodes: Array<{ object: { name: string }; inclusionClass: string }>;
  selectedProofs: Record<string, string>;
};

const NARRATIVE_INCLUSION_CLASSES = new Set(["spine", "boundary", "open"]);

export function routeNarrativeRelatedNames(route: RouteNarrativeScope): Set<string> {
  const names = new Set<string>();

  for (const node of route.nodes) {
    if (node.object.name === route.target.name) continue;
    if (!NARRATIVE_INCLUSION_CLASSES.has(node.inclusionClass)) continue;
    names.add(node.object.name);
  }

  for (const proofName of Object.values(route.selectedProofs)) {
    names.add(proofName);
  }

  return names;
}
