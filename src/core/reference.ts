import type { BodyBlock, NormalizedGraph, NormalizedObject } from "./types";
import { relativePosix } from "./pathUtils";

export interface ReferenceSelection {
  file: string;
  block: string;
  kind: BodyBlock["kind"];
  excerpt: string;
}

function displayPath(graph: NormalizedGraph, filePath: string): string {
  if (graph.workspace.root) {
    const relative = relativePosix(graph.workspace.root, filePath);
    if (relative && !relative.startsWith("../") && relative !== "..") return relative;
  }
  return filePath;
}

export function formatLocalReference(
  graph: NormalizedGraph,
  object: NormalizedObject,
  selection?: ReferenceSelection
): string {
  const lines = [
    "ProofAtlas local reference",
    `project: ${graph.config.project}`,
    `atlas_root: ${graph.atlasRoot}`,
    `workspace_root: ${graph.workspace.root ?? ""}`,
    ...(graph.workspace.texMain ? [`tex_main: ${displayPath(graph, graph.workspace.texMain)}`] : []),
    `uid: ${object.uid}`,
    `name: ${object.name}`,
    ...(object.origin.kind === "project" ? [] : [`origin: ${object.origin.kind}`]),
    ...(object.origin.atlasId ? [`origin_atlas: ${object.origin.atlasId}`] : []),
    ...(object.origin.kind === "project" ? [] : [`origin_atlas_root: ${object.origin.atlasRoot}`]),
    ...(object.citation ? [
      `citation_bibkey: ${object.citation.bibkey}`,
      ...(object.citation.trust ? [`citation_trust: ${object.citation.trust}`] : [])
    ] : []),
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
