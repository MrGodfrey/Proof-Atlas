# Proof Atlas Wiki

[Chinese wiki](../)

Proof Atlas is a local, file-driven workbench for mathematical object graphs: Markdown stores the prose, YAML stores object metadata and dependency relations, and the local web UI handles browsing, jumps, progressive disclosure, diagnostics, and stable local AI references.

The complete example is:

```text
examples/semidiscrete/ProofAtlas
```

## Directory

```text
wiki/en/
  README.md
  guides/
    quick-start.md
    navigation.md
    concepts-and-workflows.md
    local-ai.md
    open-source-release.md
  reference/
    projects-and-paths.md
    file-layout.md
    object-protocol.md
    edges.md
    reference-atlases.md
    routes-and-export.md
    markdown-links.md
    validation.md
    llm-suggestions.md
  design/
    philosophy.md
  examples/
    semidiscrete-paper.md
    splitting-guidelines.md
```

## Recommended Reading Paths

New users:

1. [Quick start](guides/quick-start.md)
2. [Navigation and UI controls](guides/navigation.md)
3. [Concepts and workflows](guides/concepts-and-workflows.md)
4. [Semi-discrete paper example](examples/semidiscrete-paper.md)

Writing objects or asking local AI to edit objects:

1. [Projects and paths](reference/projects-and-paths.md)
2. [File layout](reference/file-layout.md)
3. [Object protocol](reference/object-protocol.md)
4. [Edge semantics](reference/edges.md)
5. [Reference Atlas and citation sources](reference/reference-atlases.md)
6. [Routes and export](reference/routes-and-export.md)
7. [Markdown links](reference/markdown-links.md)
8. [Validation and common errors](reference/validation.md)
9. [LLM / local AI suggestion workflow](reference/llm-suggestions.md)

Product design:

1. [Design philosophy](design/philosophy.md)
2. [Concepts and workflows](guides/concepts-and-workflows.md)
3. [Splitting guidelines](examples/splitting-guidelines.md)

Open source release:

1. [Open source release and demo verification](guides/open-source-release.md)

## For Local AI Agents

When using Proof Atlas with a local AI coding agent, do not paste large proof bodies into the prompt. Send the agent the relevant wiki link and, when available, the `Copy local AI reference` text from the UI. The agent can then read the files directly, locate objects by `uid`, edit `object.yml` and body Markdown, and run strict validation.

## Common Commands

```bash
npm install
npm run atlas -- check --strict examples/semidiscrete
npm run atlas -- dev examples/semidiscrete --port 3217
npm run atlas -- register examples/semidiscrete
npm run atlas -- projects
```
