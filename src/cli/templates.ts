import type { AtlasConfig } from "../core/types";

export function atlasConfigTemplate(project = "proof-atlas-project", title = "Proof Atlas Project"): AtlasConfig {
  return {
    schema_version: "0.1",
    project,
    title,
    default_view: "views/dashboard.md",
    math_renderer: "katex"
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

export function agentsTemplate(config?: Pick<AtlasConfig, "project" | "title">): string {
  const project = config?.project ?? "proof-atlas-project";
  const title = config?.title ?? "Proof Atlas Project";
  return `# Proof Atlas Project Instructions

This directory is a local, file-driven mathematical object graph for ${title}.

## Object Protocol Quick Reference

Required object fields: \`uid\`, \`name\`, \`kind\`, \`role\`, \`title\`, \`body\`.

Kinds: \`math\`, \`issue\`, \`note\`.

Math roles: \`problem\`, \`setting\`, \`notation\`, \`definition\`, \`model\`, \`assumption\`, \`claim\`, \`proof\`, \`proof_fragment\`, \`construction\`, \`calculation\`, \`example\`, \`counterexample\`.

Issue roles: \`gap\`, \`question\`, \`todo\`, \`risk\`, \`possible_error\`, \`review_concern\`, \`missing_reference\`.

Note roles: \`literature\`, \`ai_note\`, \`meeting\`, \`review_note\`, \`historical\`, \`scratch\`, \`external_context\`.

Forward edge types: \`uses\`, \`proves\`, \`blocks\`, \`refines\`, \`replaces\`, \`cites\`, \`related_to\`.

\`blocks\` direction is \`issue -> blocked object\`. Do not write reverse edges such as \`blocked_by\` in YAML; they are derived by the builder.

## CLI Quick Reference

- \`atlas init\`: create \`ProofAtlas/\`, \`atlas.yml\`, default dashboard, and this \`AGENTS.md\`.
- \`atlas new <kind> <role> <name> "Title"\`: create an object with an opaque uid.
- \`atlas rename <old.name> <new.name>\`: rewrite YAML edges, Markdown links, view embeds, move the object directory by default, and record an alias.
- \`atlas locate <name-or-uid>\`: print the same local-reference format used by the web copy button.
- \`atlas check\` and \`atlas check --strict\`: validate the object graph.
- \`atlas doctor\`: check project structure and refresh this file.

## Location Rules

The \`uid\` is permanent. Paths may become stale after rename. When receiving a ProofAtlas local reference, prefer \`uid\`; use \`atlas locate <uid>\` to recover the current path.

## Selection Rules

If a local reference includes \`selection\`, locate the block by searching the listed Markdown file for the \`excerpt\`. The \`block\` id is an auxiliary browser anchor and may drift after edits.

## Do Not

- Do not handwrite semantic uids.
- Do not put \`![[...]]\` embeds in object body files.
- Do not start object body files with a level-1 Markdown heading; \`object.yml.title\` is the displayed title.
- Do not define TeX macros with \`\\newcommand\`, \`\\renewcommand\`, or \`\\def\` in normal body/math text.
- Do not manually edit \`.atlas/aliases.yml\` for routine renames; use \`atlas rename\`.
- Do not store \`blocked_by\`, \`proved_by\`, or other reverse edges in YAML.
- Do not use \`status: false\`; use \`status: disproved\`.

## Defaults

- \`importance: supporting\`
- \`status: open\` for issue objects
- \`status: draft\` for math and note objects
- \`provenance: internal\`
- \`display_as\` is derived from \`kind\` and \`role\`.

Project id: \`${project}\`
`;
}
