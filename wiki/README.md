# Proof Atlas Wiki

[中文维基](README.zh-CN.md)

Proof Atlas is a local, file-driven proof graph workbench. It stores mathematical objects as Markdown bodies plus YAML metadata, validates the graph, and renders a local web UI for navigation, review, and local AI handoff.

## Start Here

1. [Getting started](getting-started.md)
2. [Object model](object-model.md)
3. [Markdown links and views](markdown-links.md)
4. [Local AI workflow](local-ai.md)
5. [Semi-discrete example](example-semidiscrete.md)

## What Is a Proof Atlas?

A Proof Atlas project is a `ProofAtlas/` folder. The folder is the database:

```text
ProofAtlas/
  atlas.yml
  objects/
  views/
  .atlas/
  AGENTS.md
```

Objects carry stable `uid` values, readable `name` values, roles, statuses, Markdown body files, and directed graph edges such as `uses`, `proves`, `blocks`, and `cites`.

Views are Markdown entry points that embed objects into readable routes such as a dashboard, a paper route, a proof map, or an audit list.

## Core Workflows

- Run `atlas check --strict` before committing a project.
- Use `atlas rename` instead of hand-editing object names.
- Use object links for references inside Markdown bodies.
- Use view embeds only inside `views/`.
- Copy local AI references from the web UI when you want an editor agent to modify a precise object.

## Included Example

The repository includes a complete example at:

```text
examples/semidiscrete/ProofAtlas
```

It models a semi-discrete stochastic controllability proof with problem objects, settings, claims, proofs, equation objects, audit issues, and literature notes.
