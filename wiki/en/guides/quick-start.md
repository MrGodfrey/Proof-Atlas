# Quick Start

## Install

```bash
npm install
```

## Validate The Example

```bash
npm run atlas -- check examples/semidiscrete
npm run atlas -- check --strict examples/semidiscrete
npm run atlas -- check --strict examples/reference-atlas/ProofAtlas
```

## Start The Local Workbench

```bash
npm run atlas -- dev examples/semidiscrete --port 3217
```

Then open:

```text
http://localhost:3217
```

If the port is already in use, the dev server will try following ports.

You can also pass the `ProofAtlas/` directory directly:

```bash
npm run atlas -- dev examples/semidiscrete/ProofAtlas --port 3217
```

Proof Atlas is currently a local trusted-file workbench. Do not open
`ProofAtlas/` projects from untrusted sources directly; review their Markdown,
YAML, and reference files as ordinary local files first.

## Recent Projects

```bash
npm run atlas -- register examples/semidiscrete
npm run atlas -- projects
npm run atlas -- dev semi-discrete-stochastic-control
```

When `npm run atlas -- dev` receives no path and the current directory is not a project, it opens the recent-projects home page.

## Open Your Own Paper Project

If the paper directory is:

```text
/path/to/my-paper
```

and it already contains `ProofAtlas/atlas.yml`, open it with:

```bash
npm run atlas -- dev /path/to/my-paper --port 3217
```

For a paper path that does not yet have `ProofAtlas/atlas.yml`, run:

```bash
npm run atlas -- init /path/to/my-paper
```

Then configure `ProofAtlas/atlas.yml`:

```yaml
workspace:
  root: ..
  tex_main: ../main.tex
  bib:
    - ../bibitems.bib
```

If the web UI is already serving a project, use the top `Open` button and enter the paper root to switch projects. You can also stop the current server with `Ctrl+C` and rerun `npm run atlas -- dev <paper-root>`. Web Open does not add the project to recent projects; run `npm run atlas -- register <paper-root>` when you want it listed there.

If the project uses a shared Reference Atlas, declare the mount in `ProofAtlas/atlas.yml`:

```yaml
references:
  mounts:
    - id: shared-reference-atlas
      mode: readonly
```

Put local machine paths in `ProofAtlas/.atlas/local.yml` or `~/.proof-atlas/reference-atlases.yml`. Do not commit local absolute paths. See [Reference Atlas and citation sources](../reference/reference-atlases.md).

## Common CLI Commands

Locate an object:

```bash
npm run atlas -- locate main.claim.null_controllability examples/semidiscrete
```

Create an object:

```bash
npm run atlas -- new math claim main.claim.some_result "Some result" examples/semidiscrete
```

Rename an object:

```bash
npm run atlas -- rename old.name new.name examples/semidiscrete
```

## Recommended Workflow

1. Edit `ProofAtlas/objects/...` and `ProofAtlas/views/...` with an editor or local AI.
2. Run `npm run atlas -- check --strict ...` to catch broken links and protocol errors.
3. Open the graph with `npm run atlas -- dev <paper-root>` or `npm run atlas -- dev <project-id>`.
4. In the UI, copy `Copy local AI reference` and give it to local AI for precise object edits.

## Next Steps

Quick start only gets the project running. After that, read:

1. [Navigation and UI controls](navigation.md): three-column layout, top toolbar, Generated View, `Local AI` / `Export`.
2. [Concepts and workflows](concepts-and-workflows.md): object graphs, routes, exports, local AI, LLM suggestions, and common scenarios.
3. [Design philosophy](../design/philosophy.md): why files are the source of truth, why the web UI is read-only, and why sufficient context matters more than aggressive token compression.
