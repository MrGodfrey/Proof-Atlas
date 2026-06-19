# Object Protocol

Each object consists of `object.yml` and one or more Markdown body files.

Minimal form:

```yaml
uid: obj_20260611_a7f3
name: main.claim.null_controllability
kind: math
role: claim
title: "Main theorem: phi-null controllability with drift control"
body:
  - statement.md
```

Recommended full form:

```yaml
uid: obj_20260611_a7f3
name: main.claim.null_controllability
kind: math
role: claim
display_as: theorem
importance: main
status: needs_check
title: "Main theorem: phi-null controllability with drift control"
summary: Main theorem asserting low-mode null control, a uniform drift-control bound, and exponentially small final residual.
body:
  - statement.md
edges:
  requires:
    - target: main.model.forward_semidiscrete_system
      reason: The theorem statement refers to the controlled system.
  cites:
    - target: source.lue_2011
citation:
  bibkey: Lue2011
```

## Code Source Of Truth

This page documents the current implementation, not an idealized schema. Enum values are defined in:

- `src/core/types.ts`: `KINDS`, `MATH_ROLES`, `ISSUE_ROLES`, `NOTE_ROLES`, `DISPLAY_AS`, `IMPORTANCE`, `STATUS`, `PRIORITY`, `PROVENANCE`, `EDGE_TYPES`, `EDGE_STRENGTHS`.
- `src/core/constants.ts`: default `display_as`, default `status`, default body filenames, and status colors.
- `src/core/graph.ts`: YAML normalization, validation, warnings, and route file schema validation.

When machines write objects, use this page and the code enums. Do not invent nearby fields or enum values such as `status: false`, `representation: full_statement`, or `edge: depends_on`.

## Field Overview

| Field | Required | Default | Purpose |
|---|---:|---|---|
| `uid` | Yes | invalid fallback only for continuing graph build | Permanent machine identity. |
| `name` | Yes | invalid fallback only for continuing graph build | Human-readable semantic name and link name. |
| `kind` | Yes | `math` | Top-level category: mathematical object, issue object, or note object. |
| `role` | Yes | fallback by `kind` | Semantic role in the graph. |
| `title` | Yes | `name` fallback | Page and export title. |
| `body` | Yes | none | One or more Markdown files in the same directory. |
| `display_as` | No | derived from `kind + role` | Visual presentation type; does not change semantic identity. |
| `importance` | No | `supporting` | Route sorting and human reading priority. |
| `status` | No | `open` for issues, otherwise `draft` | Current trust, lifecycle, or issue state. |
| `summary` | No | none | Short text used by route `summary` representation and lists. |
| `priority` | recommended for issues | `normal` for issues | Issue handling priority. |
| `provenance` | No | `internal` | Trust boundary: internal, external, or imported. |
| `tags` | No | `[]` | Free-form tags for search and manual organization. |
| `edges` | No | `{}` | Forward relationship edges. |
| `citation` | required for source objects | none | BibTeX key; trust is derived from Bib registry. |
| `source_result` | No | none | Parent entry, location, and statement fidelity for external results. |

## `uid`

Machine identity. Do not change it after creation.

Format:

```text
obj_[0-9]{8}_[a-z0-9]{4,8}
```

Do not hand-write semantic IDs such as `obj_main_theorem`.

## `name`

Human-readable semantic reference name used by Markdown links and view embeds.

Recommended format:

```text
[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+
```

Examples:

```text
main.claim.null_controllability
main.proof.lr_iteration
main.issue.adaptedness
source.boyer_2010a
```

To rename an object, use `npm run atlas -- rename`; do not only edit `object.yml` by hand.

## `kind`

Allowed values:

```text
math
issue
note
```

Meaning:

- `math`: mathematical content, including problems, settings, models, definitions, claims, proofs, constructions, calculations, examples, and counterexamples.
- `issue`: research problems, gaps, risks, or checks.
- `note`: non-core mathematical objects, including literature notes, AI discussions, history, review comments, and external context.

## `role`

`math` roles:

```text
problem
setting
notation
definition
model
assumption
claim
proof
proof_fragment
construction
calculation
example
counterexample
```

`issue` roles:

```text
gap
question
todo
risk
possible_error
review_concern
missing_reference
```

`note` roles:

```text
literature
ai_note
meeting
review_note
historical
scratch
external_context
```

Recommended usage:

- Theorems, lemmas, propositions, corollaries, important estimates: `kind: math`, `role: claim`.
- Complete proofs: `kind: math`, `role: proof`.
- Local proof fragments or failed routes: `kind: math`, `role: proof_fragment`.
- Constant estimates and algebraic reductions: `kind: math`, `role: calculation`.
- Control constructions, time grids, and cutoff functions: `kind: math`, `role: construction`.

## `display_as`

Controls visual presentation in the web UI. It does not change object identity or the core route resolver semantics. `role` says what the object is; `display_as` says how it appears on the page.

Allowed values:

```text
plain
problem
setting
notation
definition
assumption
equation
theorem
lemma
proposition
corollary
conjecture
proof
proof_fragment
estimate
construction
calculation
example
counterexample
remark
issue
gap
question
todo
warning
note
literature_note
ai_note
review_note
meeting_note
```

Default mapping:

| `kind` / `role` | Default `display_as` |
|---|---|
| `math.problem` | `problem` |
| `math.setting` | `setting` |
| `math.notation` | `notation` |
| `math.definition` | `definition` |
| `math.model` | `plain` |
| `math.assumption` | `assumption` |
| `math.claim` | `theorem` |
| `math.proof` | `proof` |
| `math.proof_fragment` | `proof_fragment` |
| `math.construction` | `construction` |
| `math.calculation` | `calculation` |
| `math.example` | `example` |
| `math.counterexample` | `counterexample` |
| `issue.gap` | `gap` |
| `issue.question` | `question` |
| `issue.todo` | `todo` |
| `issue.risk` / `possible_error` / `review_concern` / `missing_reference` | `warning` |
| `note.literature` | `literature_note` |
| `note.ai_note` | `ai_note` |
| `note.meeting` | `meeting_note` |
| `note.review_note` | `review_note` |
| `note.historical` / `scratch` / `external_context` | `note` |

When to override `display_as`:

| Scenario | Recommended value | Reason |
|---|---|---|
| A `role: claim` is the main theorem | `display_as: theorem` | Matches mathematical reader expectations in pages and exports. |
| A `role: claim` is a lemma | `display_as: lemma` | Still a claim, so routes can find proof, but displayed as lemma. |
| A `role: claim` is a key estimate | `display_as: estimate` | Emphasizes formula material; it is not treated as an obligation claim for automatic proof search. |
| A `role: claim` is an equation or identity | `display_as: equation` | Emphasizes citable formula material rather than a proof obligation. |
| A `role: model` is ordinary model prose | omit or `display_as: plain` | Avoids making model text look like a theorem or definition. |
| Literature object | `kind: note`, `role: literature`, `display_as: literature_note` | Lets UI and export treat it as source material. |

Note: `role: claim` with `display_as: theorem/lemma/proposition/corollary/conjecture` is treated as an obligation by the route resolver. `display_as: equation` or `display_as: estimate` is not automatically searched for a proof obligation.

## `importance`

Allowed values:

```text
main
supporting
background
local
```

Meaning:

- `main`: main problem, main result, main proof route, or main blocker.
- `supporting`: important support object needed by the main proof route.
- `background`: settings, definitions, literature background, or standard tools.
- `local`: only used by a local argument or temporary discussion.

## `status`

Allowed values:

```text
draft
partial
needs_check
checked
open
resolved
disproved
obsolete
archived
```

Recommended meanings:

| status | Meaning | Typical objects |
|---|---|---|
| `draft` | Newly written; structure and content may change. | New claims, proofs, notes. |
| `partial` | Substantial but explicitly incomplete. | Unfinished proofs or constructions. |
| `needs_check` | Looks usable but still needs review. | Newly imported theorems, estimates, proofs. |
| `checked` | Reviewed and currently considered reliable. | Verified settings, theorems, proofs, literature entries. |
| `open` | Issue is unresolved. | gaps, risks, possible errors, todos. |
| `resolved` | Issue was solved but remains tracked. | Previously open issues. |
| `disproved` | Known false route, false claim, or failed assumption. | Failed proofs or incorrect derivations. |
| `obsolete` | Replaced by a newer object and no longer part of the current route. | Old statements, old proofs, old notes. |
| `archived` | Historical or dormant material that should normally not enter active routes. | Old meeting notes, old brainstorms. |

Recommended combinations:

- `math`: `draft`, `partial`, `needs_check`, `checked`, `disproved`, `obsolete`, `archived`.
- `issue`: `open`, `resolved`, `obsolete`, `archived`.
- `note`: `draft`, `checked`, `obsolete`, `archived`.

Do not write `status: false`. Use `status: disproved` for wrong routes and `status: obsolete` for replaced routes.

The route resolver uses status for proof selection:

- Proof candidates are ordered by `checked`, `needs_check`, `partial`, `draft`.
- `disproved`, `obsolete`, and `archived` are not default proof candidates.
- If route `proof_choices` explicitly selects a `disproved`, `obsolete`, or `archived` proof, the resolver warns but respects the explicit choice.

Suggested transitions:

```text
draft -> partial -> needs_check -> checked
open -> resolved
needs_check -> disproved
checked -> obsolete
obsolete -> archived
```

Do not mark a mathematical object `open` just to hide it. `open` is an issue status. Unused mathematical objects are usually `obsolete` or `archived`.

## `priority`

Only meaningful for `issue`. It is preserved on non-issues but not recommended there.

```text
blocker
high
normal
low
```

| priority | When to use |
|---|---|
| `blocker` | Without resolving it, the main route cannot be judged. |
| `high` | Affects an important proof or result, though a workaround may exist. |
| `normal` | Ordinary todo or review issue; default issue priority. |
| `low` | Cleanup, wording, or citation work that does not block current mathematical judgment. |

Example:

```yaml
kind: issue
role: possible_error
status: open
priority: blocker
title: Adaptedness of the naive duality control is unclear
edges:
  blocks:
    - target: main.proof.naive_duality
```

## `provenance`

Trust boundary:

```text
internal
external
imported
```

| provenance | Meaning | Route/export significance |
|---|---|---|
| `internal` | Built or maintained inside the current project. | Unproved internal claims make proof routes unresolved. |
| `external` | External literature, theorem libraries, or accepted sources. | External claims without proofs can be used as boundaries. |
| `imported` | Imported from another project or tool; this project does not maintain the full proof. | Similar to external material, but source may be another local atlas. |

Literature results usually use:

```yaml
kind: note
role: literature
display_as: literature_note
provenance: external
status: checked
```

If an external theorem is an accepted premise in the proof spine, model it as `kind: math`, `role: claim`, `provenance: external`, and use `cites` to point to the literature note.

Ordinary paper projects should not create local `source.*` objects. The `source.*` namespace is reserved for Reference Atlases. To cite external literature or results, mount a Reference Atlas and point `cites` or `uses` to its `source.*` objects.

## `citation`

Currently, hand-write only `bibkey`:

```yaml
citation:
  bibkey: Boyer2010
```

`trust`, `bibfile`, `registryId`, and `entryType` are derived from `bib-registry.yml`; do not write them into `object.yml`. If old objects still contain `citation.bibfile`, validation warns because BibTeX file ownership should be maintained by the registry.

Every `source.*` object needs `citation.bibkey`. If the bibkey is not found in the current project or mounted Reference Atlas Bib registry, strict validation fails.

## `source_result`

`source_result` explains how an external mathematical result comes from a literature object:

```yaml
source_result:
  parent: source.boyer_2010a
  location: Theorem 2.1
  statement_fidelity: paraphrased
```

| Field | Meaning |
|---|---|
| `parent` | Literature note object name. |
| `location` | Location in the source, such as theorem, lemma, page, or section. |
| `statement_fidelity` | Statement fidelity, such as `verbatim`, `paraphrased`, or `adapted`. |

If `parent` is present, it must resolve to an object in the current graph.

## `summary`

`summary` is short text, not a replacement for Markdown body. It is used for:

- Object lists and route node summaries.
- Route export `summary` representation.
- Default representation suggestion for soft dependencies: usually `summary` when present, otherwise `reference`.

Write one to three sentences explaining what the object says and why it matters in the graph. Do not put a full proof in `summary`.

## `body`

`body` must list relative `.md` files in the object directory. It must not contain absolute paths or `../`.

Default filenames for new objects:

| Object type | Default body file |
|---|---|
| `math.claim` | `statement.md` |
| `math.proof` / `math.proof_fragment` | `proof.md` |
| `issue.*` | `note.md` |
| `note.*` | `note.md` |
| other math objects | `body.md` |

Body rules:

- Object bodies should not start with H1 (`# ...`); the title comes from `object.yml.title`.
- Object bodies can use normal `[[object.name]]` links.
- Object bodies cannot use `![[object.name]]` embeds; embeds are only for views.
- Do not define TeX macros in object bodies, such as `\newcommand`, `\renewcommand`, or `\def`.

Statement representation extraction depends on body filenames:

- If `statement.md` exists, `statement` representation uses it.
- For `setting`, `notation`, `definition`, `model`, `construction`, and `calculation`, when `statement.md` is absent, the first body file can be used as statement source.
- For `claim`, `problem`, `assumption`, `equation`, `proof`, `proof_fragment`, and `note`, when `statement.md` is absent, statement export is not reliable.

## `edges`

`edges` only store forward edges. v1 EdgeRef entries are objects:

```yaml
edges:
  requires:
    - target: main.setting.spectral_spaces
      strength: hard
      reason: The statement uses the spectral projectors.
  uses:
    - target: main.claim.observability
      strength: hard
  cites:
    - target: source.boyer_2010a
```

Fields:

- `target`: required, object `name` or resolvable alias.
- `strength`: optional, `hard` or `soft`, default `hard`.
- `reason`: optional dependency reason.

`requires` means context needed to read or state the current object. `uses` means mathematical dependencies actually used for proof, derivation, construction, or calculation. Claims usually use `requires`; proofs and proof fragments use `proves` and `uses`.

Strict schema rejects old string-list edges:

```yaml
edges:
  uses:
    - main.claim.old_style
```
