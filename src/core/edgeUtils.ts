import type { EdgeMap, EdgeRef, EdgeType } from "./types";

export function edgeTarget(ref: EdgeRef): string {
  return ref.target;
}

export function edgeTargets(refs: EdgeRef[] | undefined): string[] {
  return (refs ?? []).map((ref) => ref.target);
}

export function hardEdgeRefs(refs: EdgeRef[] | undefined): EdgeRef[] {
  return (refs ?? []).filter((ref) => ref.strength !== "soft");
}

export function softEdgeRefs(refs: EdgeRef[] | undefined): EdgeRef[] {
  return (refs ?? []).filter((ref) => ref.strength === "soft");
}

export function hardEdgeTargets(refs: EdgeRef[] | undefined): string[] {
  return hardEdgeRefs(refs).map((ref) => ref.target);
}

export function addUniqueEdge(map: EdgeMap, key: EdgeType, ref: EdgeRef): void {
  const list = map[key] ?? [];
  if (!list.some((item) => item.target === ref.target && item.strength === ref.strength && item.reason === ref.reason)) {
    list.push(ref);
  }
  map[key] = list;
}
