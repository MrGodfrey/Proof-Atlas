# Routes And Export

A route is Proof Atlas's recipe for answering "starting from this object, what context is currently needed?"

The current implementation stores routes in `views/*.route.yml`. The web UI only reads and displays them; the CLI creates, resolves, and exports them.

Code source of truth:

- `src/core/types.ts`: `RouteProfile`, `RepresentationMode`, `RouteView`.
- `src/core/graph.ts`: route YAML normalization and schema validation.
- `src/core/routeResolver.ts`: profile expansion, proof choice, boundary, representation floors, token estimates.
- `src/core/contextExporter.ts`: materialization rules for Markdown / manifest / JSON export.

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
  show_graph: true
  show_status: true
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
| `target` | Route root object, using object `name` or resolvable alias. |
| `profile` | `meaning`, `proof`, `audit`, or `history`; missing values resolve as `proof`. |
| `proof_choices` | Explicit mapping from claim name to proof object name. The proof must `proves` the claim. |
| `boundaries` | Objects included but not expanded through outgoing hard dependencies. |
| `representation` | Object name to `full`, `statement`, `summary`, `reference`, or `omit`. |
| `render.order` | Currently only `prerequisites_first`. |
| `render.show_graph` / `render.show_status` | Saved route rendering preferences; the current UI supports graph and status in Generated View. |
| `render.order_hints` | Same-layer linearization hints; does not change dependency edges. |

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
- `representation` defaults to empty, so the resolver suggests modes from profile, hard/soft dependency status, object role, and selected proof.
- `render` defaults to empty; the UI can still display the Generated View.

## Profile Behavior

| profile | Current resolution behavior |
|---|---|
| `meaning` | Expands the transitive closure of target hard `requires`, stopping at boundaries. |
| `proof` | If target is a claim, selects a proof, expands hard `uses` of that proof, recursively handles used claims, and expands hard `requires`. |
| `proof` with proof target | Uses the proof object as root, includes the claim it `proves` as context, and expands the proof's hard `uses`. It does not seek a proof of the proof object. |
| `audit` | Starts from proof route behavior and includes blocking issues as soft context. |
| `history` | Expands along hard `refines`, `replaces`, and `cites` relations. |

The current implementation also includes direct soft `requires` / `uses` of objects already in the slice, but it does not transitively expand soft dependencies.

Profile selection:

| Goal | Recommended profile | Reason |
|---|---|---|
| Help AI understand a definition, model, assumption, or theorem statement | `meaning` | Expands only hard `requires` needed for statement/definition meaning, without seeking proofs. |
| Explain why a claim holds | `proof` | Selects or uses a specified proof and expands hard `uses`. |
| Audit proof-route risk | `audit` | Adds issues that block the proof route. |
| Trace old versions, replacement relations, or literature sources | `history` | Follows `refines`, `replaces`, and `cites`. |

Examples:

```yaml
# Explain only symbols, spaces, and settings for the forward system.
target: main.model.forward_semidiscrete_system
profile: meaning
```

```yaml
# Explain the proof route for the main result.
target: main.claim.null_controllability
profile: proof
proof_choices:
  main.claim.null_controllability: main.proof.lr_iteration
```

```yaml
# Audit the main proof and include blocking issues.
target: main.claim.null_controllability
profile: audit
```

If `proof` profile is used on a non-claim object, code falls back to expanding hard `requires` / `uses` and emits a `profile_target_mismatch` warning.

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

Boundary objects still appear in the route node list and Markdown export:

```text
Accepted boundary; dependencies are not expanded in this context.
```

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
| `full` | All Markdown files listed in `body`. | Target, selected proof, or construction/calculation whose full reasoning must be checked. | `main.proof.lr_iteration: full`. |
| `statement` | Statement-level source only. | Hard dependency where the statement is needed but not its proof. | `main.claim.partial_null_control: statement`. |
| `summary` | Only `object.yml.summary`; empty if missing. | Soft context where AI only needs the gist. | Background literature or related objects. |
| `reference` | Metadata only, no body. | Citation/provenance or objects that only need to be locatable by name. | `source.boyer_2010: reference`. |
| `omit` | No body; token estimate 0. | Only for soft context explicitly excluded from export. | Remove a large side note from context. |

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
| `meaning` | `statement` | `reference` |
| `audit` | `reference` | `reference` |
| `history` | `reference` | `reference` |

Hard dependencies cannot be `omit`. In `proof` / `meaning`, if a hard dependency needs `statement` but the object has no extractable statement source, content-sufficiency diagnostics are emitted.

Default suggestion rules:

| Case | Default suggestion |
|---|---|
| route target | `full` |
| selected proof | `full` |
| soft dependency has `summary` | `summary` |
| soft dependency has no `summary` | `reference` |
| hard dependency in `audit` / `history` | `reference` |
| hard claim dependency | `statement` |
| hard proof / proof_fragment dependency | `full` |
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
- `setting` / `notation` / `definition` / `model` / `construction` / `calculation` can use the first body file as `statement` when `statement.md` is absent.
- Other objects, including `claim`, `problem`, `assumption`, `equation`, `proof`, `proof_fragment`, and `note`, cannot reliably materialize `statement` without `statement.md`; export records diagnostics and tries to fall back to summary.
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
| `--profile <profile>` | Profile when creating a temporary route from an object target. |
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

`npm run atlas -- route` output includes closure, cloud context sufficiency, object count, token estimate, selected proofs, boundaries, witness paths, and marginal costs.

## Machine Editing Rules

Local AI or scripts that edit routes should follow these rules:

1. Only create or edit routes under `ProofAtlas/views/*.route.yml`.
2. Use object `name` for `target`, `proof_choices`, `boundaries`, `representation`, and `render.order_hints`; do not use titles.
3. When given a local reference, locate by `uid` first, then write the current `name`.
4. New routes must include `schema_version: "0.1"`, `type: route`, `uid`, `title`, `target`, and `profile`.
5. `profile` can only be `meaning`, `proof`, `audit`, or `history`.
6. `representation` can only be `full`, `statement`, `summary`, `reference`, or `omit`.
7. Do not set a hard dependency to `omit`.
8. `proof_choices` can only select `role: proof` or `role: proof_fragment` objects that actually `proves` the corresponding claim.
9. To reduce tokens, downgrade soft context from `summary` to `reference` before compressing hard dependencies.
10. After edits, run `npm run atlas -- check --strict <paper-root-or-ProofAtlas-root>`.

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

Markdown export:

- Outputs Task, Selected Proof Route, Target, Definitions and Settings, Boundaries, Supporting Claims, Proofs, Issues, Source Manifest, and Diagnostics.
- Adds `uid`, `name`, `status`, `provenance`, source path, representation, decision, hardness, and project to each object section.
- Rewrites included `[[object.name]]` / `![[object.name]]` links into Markdown anchor links.
- Marks links outside the slice as `not included in this context`.
- Emits diagnostics for outside-slice hard dependency links.

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
