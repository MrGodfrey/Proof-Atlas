# Projects And Paths

The source of truth for each paper is its own `ProofAtlas/` directory. The tool repository only contains the program and examples; it does not store all user paper objects.

Recommended structure:

```text
<workspace-root>/
  main.tex
  references.bib
  figures/
  ProofAtlas/
    atlas.yml
    objects/
    views/
    .atlas/
      aliases.yml
      local.yml
      suggestions/
```

## Path Resolution

All project commands accept either path shape:

```bash
npm run atlas -- dev /path/to/paper/ProofAtlas
npm run atlas -- dev /path/to/paper
npm run atlas -- check --strict /path/to/paper/ProofAtlas
npm run atlas -- check --strict /path/to/paper
```

Resolution rules are fixed:

```text
1. Expand ~.
2. Convert relative paths to absolute paths.
3. If <path>/atlas.yml exists, <path> is atlas_root.
4. Otherwise if <path>/ProofAtlas/atlas.yml exists, <path> is workspace_root.
5. Otherwise fail and list both atlas.yml paths that were tried.
```

When no path is passed, commands use the current directory. The current directory can be `ProofAtlas/` or a paper directory containing `ProofAtlas/`. If the current directory is not a project, `dev` opens the recent-projects home page.

## Initialize A Paper Project

For an uninitialized paper directory:

```bash
npm run atlas -- init /path/to/paper
```

The generated `ProofAtlas/atlas.yml` can look like:

```yaml
schema_version: "0.1"
project: my-paper
title: My Paper
default_view: views/dashboard.md
math_renderer: katex
workspace:
  root: ..
  tex_main: ../main.tex
  bib:
    - ../references.bib
```

`npm run atlas -- init` also adds local file rules to the paper root `.gitignore`:

```text
# Proof Atlas local files.
ProofAtlas/.atlas/local.yml
ProofAtlas/.atlas/cache/
ProofAtlas/.atlas/suggestions/
```

For older or manually created projects, run:

```bash
npm run atlas -- doctor /path/to/paper
```

`doctor` refreshes the `ProofAtlas/AGENTS.md` pointer and completes `.gitignore` rules for local files.

Then validate and open:

```bash
npm run atlas -- check --strict /path/to/paper
npm run atlas -- dev /path/to/paper --port 3217
```

## Switching An Open Project

There are three ways to switch.

First, switch in the web UI:

```text
Top Open button
-> enter paper root, ProofAtlas/ path, or registry project-id
-> Open
```

The web backend closes the old project watcher, clears the graph and problems, resolves the new path, and loads the new project. It still opens one project at a time. Web Open only switches the active project for the current server; it does not write or update `~/.proof-atlas/projects.yml`.

Second, click a recent project:

```text
Top Open button
-> Recent projects
-> click project
```

Recent projects only come from projects explicitly registered in local `~/.proof-atlas/projects.yml`. Register once:

```bash
npm run atlas -- register /path/to/paper
```

Then open by project id:

```bash
npm run atlas -- dev my-paper
```

Third, restart the CLI:

```text
Ctrl+C the current npm run atlas -- dev
npm run atlas -- dev <another paper-root or ProofAtlas/>
```

## atlas.yml And local.yml

`atlas.yml` stores shared configuration that can be committed. Prefer relative paths:

```yaml
schema_version: "0.1"
project: my-paper
title: My Paper
default_view: views/dashboard.md
math_renderer: katex
workspace:
  root: ..
  tex_main: ../main.tex
  bib:
    - ../references.bib
```

Local absolute paths go in `ProofAtlas/.atlas/local.yml`, not shared configuration:

```yaml
workspace:
  root: /path/to/local/paper-copy
  tex_main: main.tex
  bib:
    - references.bib
```

`local.yml` can only override workspace path fields and `reference_atlases` local path mappings. It cannot override `project`, `title`, objects, edges, aliases, or body text.

## Reference Atlas Paths

Ordinary projects can declare mounts in `atlas.yml`:

```yaml
references:
  mounts:
    - id: shared-reference-atlas
      mode: readonly
```

The mount id is a committed structural fact; the mount path is a local machine fact. Put the path in project-local config:

```yaml
reference_atlases:
  shared-reference-atlas:
    root: ../reference-atlas/ProofAtlas
```

or in the user-level registry:

```text
~/.proof-atlas/reference-atlases.yml
```

```yaml
reference_atlases:
  shared-reference-atlas:
    root: /path/to/reference-atlas/ProofAtlas
```

If a nearby `reference-atlas/ProofAtlas` exists and its `atlas.yml` `project` matches the mount id, the resolver can use it automatically. See [Reference Atlas and citation sources](reference-atlases.md).

## AGENTS.md In External Projects

External paper projects should not copy the full Proof Atlas rules. Rules are maintained in the tool repository. An external project's `AGENTS.md` should only connect to them:

```text
tool repository: /path/to/Proof-Atlas
canonical wiki: /path/to/Proof-Atlas/wiki/en/README.md
workspace root: <paper-root>
atlas root: <paper-root>/ProofAtlas
```

Recommended pointers:

```text
<paper-root>/AGENTS.md
<paper-root>/ProofAtlas/AGENTS.md
```

The root `AGENTS.md` helps AI find Proof Atlas when started from the paper workspace. `ProofAtlas/AGENTS.md` helps AI find the same rules when started inside the object directory. Neither file should copy the object protocol, edge semantics, or Markdown link rules; they should point to the canonical wiki.

## Recent Project Registry

The local recent-project file is:

```text
~/.proof-atlas/projects.yml
```

It is only a launcher registry, not a database. Deleting it does not delete any `ProofAtlas/` project data.
