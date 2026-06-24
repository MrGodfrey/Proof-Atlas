export function isObjectCardExpanded(options: {
  collapsed: ReadonlySet<string>;
  defaultExpanded: boolean;
  expanded: ReadonlySet<string>;
  forceExpanded?: boolean;
  uid: string;
}): boolean {
  if (options.collapsed.has(options.uid)) return false;
  return Boolean(options.forceExpanded) || options.expanded.has(options.uid) || options.defaultExpanded;
}

export function nextObjectExpansionState(
  uid: string,
  isExpanded: boolean,
  expanded: ReadonlySet<string>,
  collapsed: ReadonlySet<string>
): { collapsed: Set<string>; expanded: Set<string> } {
  const nextExpanded = new Set(expanded);
  const nextCollapsed = new Set(collapsed);
  if (isExpanded) {
    nextExpanded.delete(uid);
    nextCollapsed.add(uid);
  } else {
    nextCollapsed.delete(uid);
    nextExpanded.add(uid);
  }
  return { collapsed: nextCollapsed, expanded: nextExpanded };
}
