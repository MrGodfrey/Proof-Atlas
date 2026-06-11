# Object Model

Every object lives in its own directory:

```text
objects/main.claim.null_controllability/
  object.yml
  statement.md
```

The YAML file stores identity, metadata, and graph edges. Markdown files store the mathematical body.

## Minimal Object

```yaml
uid: obj_20260611_a7f3
name: main.claim.null_controllability
kind: math
role: claim
title: "Main theorem: null controllability"
body:
  - statement.md
```

## Recommended Object

```yaml
uid: obj_20260611_a7f3
name: main.claim.null_controllability
kind: math
role: claim
display_as: theorem
importance: main
status: needs_check
title: "Main theorem: null controllability"
summary: Main theorem asserting low-mode control and a small final residual.
body:
  - statement.md
edges:
  uses:
    - main.claim.partial_null_control
    - main.claim.free_decay
```

## Identity

- `uid` is permanent and machine-oriented.
- `name` is readable and used in Markdown links.
- Use `atlas rename` to change a name so links, edges, folders, and aliases stay consistent.

## Kinds and Roles

Kinds:

```text
math
issue
note
```

Common math roles:

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

Issue roles:

```text
gap
question
todo
risk
possible_error
review_concern
missing_reference
```

Note roles:

```text
literature
ai_note
meeting
review_note
historical
scratch
external_context
```

## Edges

Forward edges are stored in `object.yml`:

| Edge | Direction | Meaning |
|---|---|---|
| `uses` | A -> B | A depends on B |
| `proves` | proof -> claim | A proves B |
| `blocks` | issue -> object | A blocks B |
| `refines` | A -> B | A is a sharper version of B |
| `replaces` | A -> B | A replaces B |
| `cites` | A -> source | A cites B |
| `related_to` | A <-> B | weak relationship |

Do not write reverse edges such as `proved_by`, `blocked_by`, or `used_by`; Proof Atlas derives them.

## Validation

Run:

```bash
npm run atlas -- check --strict <path-to-ProofAtlas>
```

Strict validation fails on duplicate IDs, missing body files, invalid schema values, broken edges, broken Markdown links, invalid view embeds, object-body embeds, and TeX macro definitions in normal body text.
