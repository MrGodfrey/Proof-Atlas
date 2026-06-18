# Proof Atlas

**Proof Atlas is a local-first workbench for mathematical research: write proofs in Markdown, describe the proof graph in YAML, and browse the whole project as a clickable atlas.**

[中文 README](README.zh-CN.md) · [Wiki](wiki/README.md) · [Example project](examples/semidiscrete/ProofAtlas)

Mathematical writing is linear at the end, but research rarely is. A theorem depends on lemmas, a proof is blocked by a gap, a failed route is replaced by a better one, and a citation may support only one fragile estimate. Proof Atlas keeps those relationships explicit while leaving the source of truth as ordinary files that work with Git, editors, and local AI tools.

## What It Gives You

- A file format for proof objects: claims, proofs, equations, models, constructions, calculations, issues, and literature notes.
- A graph-aware local web UI with views, object cards, dependency links, reverse links, status, and KaTeX rendering.
- A CLI for initializing projects, validating object graphs, locating objects by stable IDs, creating objects, resolving generated proof routes, exporting cloud contexts, and safely renaming object references.
- Generated Views that separate the proof spine from vocabulary/context nodes, boundary assumptions, and open obligations.
- Obsidian-style object links such as `[[main.claim.observability]]` and view embeds such as `![[main.proof.lr_iteration]]{expanded}`.
- Stable local references that can be copied into local AI workflows without pasting whole proof bodies.
- A real example atlas for a semi-discrete stochastic controllability proof.

## Quick Start

Requirements:

- Node.js 20.19+ or 22.12+
- npm 10+

Clone and install:

```bash
git clone git@github.com:MrGodfrey/Proof-Atlas.git
cd Proof-Atlas
npm ci
```

Validate the included example:

```bash
npm run atlas -- check examples/semidiscrete/ProofAtlas
npm run atlas -- check --strict examples/semidiscrete/ProofAtlas
```

Start the local workbench:

```bash
npm run atlas -- dev examples/semidiscrete/ProofAtlas --port 3217
```

Open:

```text
http://localhost:3217
```

## First Commands

Create a new atlas project:

```bash
npm run atlas -- init my-paper
```

Create a claim object:

```bash
npm run atlas -- new math claim main.claim.some_result "Some result" --project my-paper/ProofAtlas
```

Locate an object by name or stable `uid`:

```bash
npm run atlas -- locate main.claim.null_controllability examples/semidiscrete/ProofAtlas
```

Rename an object and rewrite YAML edges plus Markdown links:

```bash
npm run atlas -- rename old.name new.name examples/semidiscrete/ProofAtlas
```

Resolve a generated proof route and export a cloud-readable context:

```bash
npm run atlas -- route views/null_controllability.route.yml examples/semidiscrete/ProofAtlas
npm run atlas -- export views/null_controllability.route.yml examples/semidiscrete/ProofAtlas --format markdown
```

## Project Shape

```text
ProofAtlas/
  atlas.yml
  objects/
    main.claim.null_controllability/
      object.yml
      statement.md
    main.proof.lr_iteration/
      object.yml
      proof.md
  views/
    dashboard.md
    paper.md
  .atlas/
    aliases.yml
  AGENTS.md
```

The `uid` is the permanent identity. The `name` is the readable reference used in Markdown links. Paths can change; `atlas locate <uid>` recovers the current location.

## Documentation

- [Wiki home](wiki/README.md)
- [Quick start](wiki/guides/quick-start.md)
- [Concepts and workflows](wiki/guides/concepts-and-workflows.md)
- [Navigation and UI controls](wiki/guides/navigation.md)
- [Reference Atlas and citation sources](wiki/reference/reference-atlases.md)
- [Routes and export](wiki/reference/routes-and-export.md)
- [Local AI workflow](wiki/guides/local-ai.md)
- [Semi-discrete example](wiki/examples/semidiscrete-paper.md)

## Development

```bash
npm ci
npm test
npm run build
```

Run the example UI during development:

```bash
npm run atlas -- dev examples/semidiscrete/ProofAtlas --port 3217
```

## Status

Proof Atlas is early software. The file protocol is intentionally small and readable, but schema details may still evolve before a stable 1.0 release.

## Contributing

Issues, examples, documentation fixes, and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
