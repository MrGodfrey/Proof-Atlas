export const RELATION_DISPLAY_ORDER = [
  "proved_by",
  "used_by",
  "proves",
  "uses",
  "requires",
  "required_by",
  "blocked_by",
  "blocks",
  "refined_by",
  "refines",
  "replaced_by",
  "replaces",
  "cited_by",
  "cites",
  "related_to"
] as const;

const RELATION_DISPLAY_RANK = new Map<string, number>(
  RELATION_DISPLAY_ORDER.map((label, index) => [label, index])
);

export function relationLabel(key: string): string {
  return key.replaceAll("_", " ").toUpperCase();
}

export function relationDisplayRank(label: string): number {
  return RELATION_DISPLAY_RANK.get(label) ?? RELATION_DISPLAY_ORDER.length;
}

export function sortRelationRows<T extends { label: string }>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ index, row }))
    .sort((a, b) => relationDisplayRank(a.row.label) - relationDisplayRank(b.row.label) || a.index - b.index)
    .map((item) => item.row);
}
