import type { BodyBlock, NormalizedGraph, NormalizedObject } from "./types";

export interface ReferenceSelection {
  file: string;
  block: string;
  kind: BodyBlock["kind"];
  excerpt: string;
}

export function formatLocalReference(
  graph: NormalizedGraph,
  object: NormalizedObject,
  selection?: ReferenceSelection
): string {
  const lines = [
    "ProofAtlas local reference",
    `project: ${graph.config.project}`,
    `root: ${graph.root}`,
    `uid: ${object.uid}`,
    `name: ${object.name}`,
    `path: ${object.objectPath}`,
    "body:",
    ...object.body.map((item) => `  - ${item}`)
  ];
  if (selection) {
    lines.push(
      "selection:",
      `  file: ${selection.file}`,
      `  block: ${selection.block}`,
      `  kind: ${selection.kind}`,
      `  excerpt: ${JSON.stringify(selection.excerpt)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

