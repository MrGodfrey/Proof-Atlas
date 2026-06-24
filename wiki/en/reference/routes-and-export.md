# Routes And Export

A route is Proof Atlas's recipe for answering "how is this proof-obligation claim currently proved?"

The current implementation stores routes in `views/*.route.yml`. The web UI reads them as Proof Trees; the CLI creates, resolves, and exports them.

Code source of truth:

- `src/core/types.ts`: `RouteProfile`, `RepresentationMode`, `RouteView`.
- `src/core/graph.ts`: route YAML normalization and schema validation.
- `src/core/proofObjects.ts`: proof-obligation claim eligibility.
- `src/core/routeResolver.ts`: proof expansion, proof choice, boundary, representation floors, and route status.
- `src/core/routeProofTree.ts`: projection from resolved route to the web Proof Tree.
- `src/core/contextExporter.ts`: materialization rules for Markdown / manifest / JSON export.

Markdown export is the cloud-AI verification context: it materializes the
selected route into a readable `.context.md` file for checking whether the
included proof route establishes the target statement. It intentionally omits
full diagnostics, citation trust, schema/version metadata, hashes, and local
integrity bookkeeping from the Markdown body. It does include one lightweight
`Route status:` line so exported contexts remain interpretable away from the UI.
Full details remain available through the resolver, CLI diagnostics, JSON
export, manifest export, and optional snapshots.

Current legal representation values are `full`, `statement`, `summary`, `reference`, and `omit`. Do not write `full_statement` or `full statement`.

## Route File Schema

Current `views/*.route.yml` supports these fields:

```yaml
schema_version: "0.1"
uid: view_20260618_null_controllability
type: route
title: Why null controllability holds

target: main.claim.null_controllability
profile: proof

proof_choices:
  main.claim.null_controllability: main.proof.lr_iteration
  main.claim.partial_null_control: main.proof.partial_null_control

boundaries:
  - source.boyer_2010a.claim.partial_discrete_lr

representation:
  main.claim.null_controllability: full
  source.boyer_2010a.claim.partial_discrete_lr: statement

render:
  order: prerequisites_first
  order_hints:
    - main.setting.probability_and_spaces
    - main.setting.domain_and_coefficients
```

Field meanings:

| Field | Current implementation |
|---|---|
| `schema_version` | Must be `"0.1"`. |
| `uid` | Route identity. Missing value is a strict error, though code derives a filename fallback to continue graph build. |
| `type` | Must be `route`. |
| `title` | Left-column and Generated View title. Missing value is a strict error. |
| `target` | Route root object. It must be a proof-obligation claim, using object `name` or resolvable alias. |
| `profile` | Must be `proof`; missing values resolve as `proof`. |
| `proof_choices` | Explicit mapping from claim name to proof object name. The proof must `proves` the claim. |
| `boundaries` | Objects included but not expanded through outgoing hard dependencies. |
| `representation` | Object name to `full`, `statement`, `summary`, `reference`, or `omit`. |
| `render.order` | Currently only `prerequisites_first`. |
| `render.order_hints` | Same-layer ordering hints; does not change dependency edges and does not imply a Linear View. |

`npm run atlas -- rename` rewrites `target`, `proof_choices`, `boundaries`, `representation`, and `render.order_hints` inside route files.

## Minimal Route

Minimal usable route:

```yaml
schema_version: "0.1"
uid: view_20260618_partial_null_control
type: route
title: Why partial null controllability holds
target: main.claim.partial_null_control
profile: proof
```

Default behavior when fields are omitted:

- `profile` resolves as `proof` in code; write it explicitly in files.
- `proof_choices` defaults to empty, so the resolver chooses by proof candidate ordering.
- `boundaries` defaults to empty.
- `representation` defaults to empty, so the resolver suggests modes from the proof route, hard/soft dependency status, object role, and selected proof.
- `render` defaults to empty; the UI can still display the Proof Tree.

## Proof Tree Behavior

Generated View only supports `profile: proof`, and it generates a Proof Tree.

A legal target must be a proof obligation:

```text
kind: math
role: claim
```

Theorems, lemmas, propositions, corollaries, conjectures, and plain claims can be roots. `proof`,
`definition`, `setting`, `notation`, `assumption`, `problem`, `note`, and `issue` cannot be Generated View roots.

If a `profile: proof` target is not a proof obligation, the resolver emits
`unsupported_proof_tree_target`; the web UI shows diagnostics instead of falling back to a generic dependency view.

Proof Tree spine:

```text
claim
  -> selected proof
      -> hard uses: claim / proof
          -> if claim, selected proof recursively
          -> if boundary or external accepted claim, leaf
          -> if already expanded elsewhere, shared reference
```

`setting`, `definition`, `notation`, and `assumption`
do not mix into the main tree. The web UI places them below the main tree in single-column context groups derived from incoming relation types, such as `Required Context`, `Used Inputs`, and `Citation and Source Context`. The right-column relations still show the selected object's full outgoing and reverse edges.

## Proof Choice

Proof candidates for a claim come from reverse `proved_by`, derived from proof objects:

```yaml
edges:
  proves:
    - target: main.claim.null_controllability
```

Without explicit `proof_choices`, the resolver chooses in this order:

1. Exclude `disproved`, `obsolete`, and `archived` proofs.
2. Sort proof status: `checked` > `needs_check` > `partial` > `draft`.
3. Sort equal status by importance: `main` > `supporting` > `background` > `local`.
4. Sort by object name for deterministic output.

If multiple candidates are reasonable, the resolver emits `needs_confirmation`. Then write the choice explicitly:

```yaml
proof_choices:
  main.claim.partial_null_control: main.proof.partial_null_control
```

Explicit choices must satisfy:

- claim object exists
- proof object exists
- proof `edges.proves` points to that claim

If an explicit choice selects a `disproved`, `obsolete`, or `archived` proof, code warns but does not override it.

## Boundary

`boundaries` means "include this object as an accepted input in context, but do not expand its outgoing hard dependencies."

Good boundary objects:

- External literature theorem or imported result.
- Accepted large background theorem whose proof should not enter the current route.
- Intermediate result that can be treated as a black box for the current task.

Poor boundary objects:

- The current target.
- The key proof currently being audited.
- An object whose dependencies you want AI to check for sufficiency.

Example:

```yaml
boundaries:
  - source.lue_2011
  - source.boyer_2010a.claim.partial_discrete_lr
```

Only boundaries actually encountered from the target appear in the route node list. An explicit boundary that is not encountered produces an `unused_boundary` warning and is not written back by `route --save`.

Resolved boundaries are classified as:

- `Accepted Inputs`: external or imported math claim boundaries.
- `Context Cuts`: internal settings, definitions, notation, assumptions, proofs, or other support boundaries.

Markdown export labels these cases separately:

```text
Accepted input; proof not included.
Context cut; dependencies are not expanded in this context.
```

When a boundary cites a bibliography entry, Markdown export includes a compact
`Citation Context` entry with author, title, venue, year, and DOI when those
fields are available from the mounted bib registry.

## Representation Modes

`representation` controls how much content each object contributes during export:

```text
full
statement
summary
reference
omit
```

| representation | Exported content | When to use | Example |
|---|---|---|---|
| `full` | All Markdown files listed in `body`. | Target, selected proof, or proof/definition object whose full reasoning must be checked. | `main.proof.lr_iteration: full`. |
| `statement` | Statement-level source only. | Hard dependency where the statement is needed but not its proof. | `main.claim.partial_null_control: statement`. |
| `summary` | Only `object.yml.summary`; empty if missing. | Soft context where AI only needs the gist. | Background literature or related objects. |
| `reference` | Metadata only, no body. | Citation/provenance or objects that only need to be locatable by name. | `source.boyer_2010: reference`. |
| `omit` | No body. | Only for soft context explicitly excluded from export. | Remove a large side note from context. |

`statement` is not spelled "full statement". YAML must use:

```yaml
representation:
  main.claim.partial_null_control: statement
```

Do not write:

```yaml
representation:
  main.claim.partial_null_control: full statement
```

Current floor rules:

| profile | hard dependency floor | soft dependency floor |
|---|---|---|
| `proof` | `statement` | `reference` |

Hard dependencies cannot be `omit`. In proof routes, if a hard dependency needs `statement` but the object has no extractable statement source, content-sufficiency diagnostics are emitted.

Default suggestion rules:

| Case | Default suggestion |
|---|---|
| route target | `full` |
| selected proof | `full` |
| soft dependency has `summary` | `summary` |
| soft dependency has no `summary` | `reference` |
| hard claim dependency | `statement` |
| hard proof dependency | `full` |
| external/imported hard object | `statement` |
| other hard object has statement source | `statement` |
| other hard object has no statement source | `full` |

Before overriding suggestions, ask:

1. Is it a hard dependency? If yes, do not go below the current profile floor.
2. Does this task need to check internal reasoning? If yes, use `full`; if only the statement is needed, use `statement`.

Common pattern:

```yaml
representation:
  # target and selected proof are usually full
  main.claim.null_controllability: full
  main.proof.lr_iteration: full

  # hard supporting claims are usually statement
  main.claim.partial_null_control: statement
  main.claim.free_decay: statement

  # background literature or soft context is usually summary/reference
  source.lue_2011: reference
  main.note.introduction: summary
```

If route resolution reports `representation_below_floor` or `hard_dependency_omitted`, the override is too aggressive. Raise that object to `statement` or `full`.

Statement materialization rules:

- Any object with `statement.md` uses `statement.md` for `statement`.
- `setting` / `notation` / `definition` can use the first body file as `statement` when `statement.md` is absent.
- Other objects, including `claim`, `problem`, `assumption`, `proof`, and `note`, cannot reliably materialize `statement` without `statement.md`; export records diagnostics and tries to fall back to summary.
- In proof routes, selected proofs usually use `full`.

## CLI: Resolve Route

Command:

```bash
npm run atlas -- route <target-or-route> [project] [options]
```

Example:

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof
```

You can also resolve an existing route file:

```bash
npm run atlas -- route views/null_controllability.route.yml \
  examples/semidiscrete/ProofAtlas
```

Options:

| Option | Purpose |
|---|---|
| `--profile <profile>` | Profile when creating a temporary route from an object target; currently only `proof`. |
| `--save <file>` | Save the resolved route recipe inside the project. |
| `--proof-choice <claim=proof>` | Explicit proof choice for a claim; repeatable. |
| `--boundary <name>` | Set a boundary; repeatable. |
| `--representation <name=mode>` | Set a representation override; repeatable. |

`--save` writes selected proofs, boundaries, and representation for each node into the route file. Save paths resolve relative to the `ProofAtlas/` root:

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof \
  --boundary source.boyer_2010a.claim.partial_discrete_lr \
  --representation source.boyer_2010a.claim.partial_discrete_lr=statement \
  --save views/null_controllability.route.yml
```

`npm run atlas -- route` output includes route status, object count, selected proofs, actually encountered boundaries, open blockers, diagnostics, and witness paths. Route status summarizes structure, context, proof choice, verification counts, accepted inputs, context cuts, and open blockers.

## Machine Editing Rules

Local AI or scripts that edit routes should follow these rules:

1. Only create or edit routes under `ProofAtlas/views/*.route.yml`.
2. Use object `name` for `target`, `proof_choices`, `boundaries`, `representation`, and `render.order_hints`; do not use titles.
3. When given a local reference, locate by `uid` first, then write the current `name`.
4. New routes must include `schema_version: "0.1"`, `type: route`, `uid`, `title`, `target`, and `profile`.
5. `profile` can only be `proof`.
6. `representation` can only be `full`, `statement`, `summary`, `reference`, or `omit`.
7. Do not set a hard dependency to `omit`.
8. `proof_choices` can only select `role: proof` objects that actually `proves` the corresponding claim.
9. After edits, run `npm run atlas -- check --strict <paper-root-or-ProofAtlas-root>`.

## CLI: Export Context

Command:

```bash
npm run atlas -- export <route-file> [project] [options]
```

Supported formats:

| format | Output |
|---|---|
| `markdown` | Materialized Markdown context for cloud AI. Default. |
| `manifest` | JSON manifest for local AI; does not include full body text. |
| `json` | Manifest plus resolved route structure. |

Example:

```bash
npm run atlas -- export views/null_controllability.route.yml \
  examples/semidiscrete/ProofAtlas \
  --format markdown \
  --output /tmp/null-control-context.md \
  --snapshot snapshots/null-control.snapshot.yml
```

Path rules:

- Absolute `--output` paths are used as given; relative paths are relative to the current shell working directory.
- Absolute `--snapshot` paths are used as given; relative paths are relative to the `ProofAtlas/` root.
- Without `--output`, export writes to stdout.

### Web Export Button

The Generated View `Export` button does not run the CLI and does not directly write files. It only copies a local Terminal command. The command has this general shape:

```bash
TOOL_ROOT='/path/to/proof-atlas-tool'
ATLAS_ROOT='/path/to/paper/ProofAtlas'
ROUTE_FILE='views/example.route.yml'
OUT='/path/to/paper/ProofAtlas/.atlas/exports/example.context.md'

mkdir -p "$(dirname "$OUT")" &&
cd "$TOOL_ROOT" &&
npm run atlas -- export "$ROUTE_FILE" "$ATLAS_ROOT" --format markdown --output "$OUT" &&
if command -v pbcopy >/dev/null 2>&1; then
  pbcopy < "$OUT"
  echo "Wrote and copied: $OUT"
else
  echo "Wrote: $OUT"
fi
```

These paths are generated at runtime, not hard-coded in the source:

- `TOOL_ROOT` is the Proof Atlas tool repository running the dev server.
- `ATLAS_ROOT` is the `atlasRoot` of the project currently open in the web UI.
- `ROUTE_FILE` must be a loaded `views/*.route.yml` in the current project graph; the server rejects route paths that do not belong to the current project.
- `OUT` defaults to the current project's `.atlas/exports/`. This directory is a local generated artifact and should be ignored by `.gitignore`.

Users normally only need to configure two things:

1. Start the right tool repository and project with `npm run atlas -- dev <paper-root-or-ProofAtlas-root>`.
2. Use the web `Open` control to switch to the project they want to export.

If the tool repository or project directory moved, restart the dev server or reopen the project before copying the command. The copied command contains local absolute paths and may reveal your username and directory structure; it is meant to be run in your local Terminal, not pasted directly into cloud AI. The generated Markdown context is the material to send to cloud AI. On macOS the command uses `pbcopy` to place the Markdown context on the clipboard; without `pbcopy`, it writes the file and prints the path.

Markdown export:

- Emits one lightweight `Route status` line near the top, but not full diagnostics, certificates, or large YAML metadata blocks.
- Outputs Proof Route, Accepted Inputs, Context Cuts when present, Target, Definitions and Settings, Supporting Claims, Proofs, Issues, Citation / Source Notes, and References.
- Keeps Proof Route as a short proof tree covering the target, selected proof, main supporting claims, and proof components. Full dependency edges remain in JSON / manifest export.
- Derives Accepted Inputs from resolved `decision: boundary` nodes whose object is an external/imported math claim, including explicit `boundaries` and implicit boundaries created when an external claim is included without expanding a proof. Internal boundaries are shown as Context Cuts.
- Each object section keeps only the title, an `Object:` line, and body text by default; it does not emit `uid`, `status`, `trust`, `content_included`, or a YAML metadata block.
- Rewrites included `[[object.name]]` / `![[object.name]]` links into Markdown anchor links.
- Keeps links that point to the current object as plain display text instead of generating self-links.
- Marks links outside the slice as `not included in this context`.
- Materializes citation bibkeys into a final References section and records whether each reference is an accepted input, a source of an imported statement, or a background reference in this context.
- Returns export diagnostics through the CLI/API result, but does not print a Diagnostics section into the Markdown context.

Snapshot freezes the material:

```yaml
schema_version: "0.1"
type: snapshot
exported_at: ...
project_uid: ...
graph_built_at: ...
route: ...
object_names: [...]
markdown: ...
diagnostics: [...]
```

Use snapshots to record the exact Markdown sent to cloud AI, not only the route recipe.
