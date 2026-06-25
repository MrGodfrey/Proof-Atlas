import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AtlasConfig } from "../core/types";

export function atlasConfigTemplate(project = "proof-atlas-project", title = "Proof Atlas Project"): AtlasConfig {
  return {
    schema_version: "0.2",
    project,
    title,
    default_view: "views/dashboard.md",
    math_renderer: "katex",
    atlas_type: "project"
  };
}

export const dashboardTemplate = `# Dashboard

## 主问题

<!-- 在这里用 ![[...]] 放主问题对象。 -->

## 主结论

<!-- 在这里用 ![[...]] 放主结论对象。 -->

## 当前证明路线

<!-- 在这里用 ![[...]] 放当前 proof 对象。 -->

## 开放 issue

<!-- 在这里用 ![[...]] 放 open issue。 -->
`;

function defaultToolRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

export function atlasGitignoreEntries(atlasRoot: string, workspaceRoot: string): string[] {
  const atlasDir = toPosix(path.relative(workspaceRoot, atlasRoot)) || ".";
  const prefix = atlasDir === "." ? "" : `${atlasDir}/`;
  return [
    `${prefix}.atlas/local.yml`,
    `${prefix}.atlas/cache/`,
    `${prefix}.atlas/exports/`,
    `${prefix}.atlas/suggestions/`
  ];
}

export function agentsTemplate(config?: Pick<AtlasConfig, "project" | "title">, options?: {
  atlasRoot?: string;
  workspaceRoot?: string | null;
  toolRoot?: string;
}): string {
  const project = config?.project ?? "proof-atlas-project";
  const title = config?.title ?? "Proof Atlas Project";
  const toolRoot = options?.toolRoot ?? defaultToolRoot();
  const atlasRoot = options?.atlasRoot ?? "<this ProofAtlas directory>";
  const workspaceRoot = options?.workspaceRoot ?? "<containing paper/workspace directory>";
  return `# Proof Atlas Project Link

This directory is the local Proof Atlas data source for:

${title}

Project id: \`${project}\`

## Canonical Rules

Do not duplicate the Proof Atlas object protocol here. The canonical tool repository and docs are:

- Tool repository: \`${toolRoot}\`
- Wiki index: \`${toolRoot}/wiki/README.md\`
- File layout and path rules: \`${toolRoot}/wiki/reference/file-layout.md\`
- Object protocol: \`${toolRoot}/wiki/reference/object-protocol.md\`
- Edges: \`${toolRoot}/wiki/reference/edges.md\`
- Markdown links: \`${toolRoot}/wiki/reference/markdown-links.md\`
- Validation: \`${toolRoot}/wiki/reference/validation.md\`

## Local Paths

- Atlas root: \`${atlasRoot}\`
- Workspace root: \`${workspaceRoot}\`

## CLI Quick Reference

Run Proof Atlas commands from the tool repository:

\`\`\`bash
cd ${toolRoot}
npm run atlas -- check --strict "${workspaceRoot}"
npm run atlas -- dev "${workspaceRoot}" --port 3217
npm run atlas -- locate <uid-or-name> "${workspaceRoot}"
\`\`\`

## Location Rules

The \`uid\` is permanent. When receiving a ProofAtlas local reference, prefer \`uid\`; use \`atlas locate <uid-or-name> <workspace-root>\` to recover the current path. Do not copy this project's objects into the tool repository.
`;
}
