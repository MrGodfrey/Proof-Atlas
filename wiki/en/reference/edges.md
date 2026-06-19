# Edge Semantics

`edges` are directed relationships between objects. v0.1 supports:

```text
requires
uses
proves
blocks
refines
replaces
cites
related_to
```

| Edge | Direction | Meaning |
|---|---|---|
| `requires` | A -> B | B is required to state, read, or explain A. |
| `uses` | A -> B | A actually uses B to prove, derive, construct, or compute. |
| `proves` | proof -> claim | A is a proof object proving B. |
| `blocks` | issue -> object | A blocks B. |
| `refines` | A -> B | A is a more precise version of B. |
| `replaces` | A -> B | A replaces B. |
| `cites` | A -> source | A cites literature, a literature note, or external result B. |
| `related_to` | A <-> B | Weak relation; not a dependency. |

## Do Not Write Reverse Edges

Do not manually write:

```yaml
proved_by:
blocked_by:
used_by:
required_by:
```

The system derives those from forward edges.

## Example

```yaml
name: main.proof.lr_iteration
kind: math
role: proof
edges:
  proves:
    - target: main.claim.null_controllability
  uses:
    - target: main.claim.partial_null_control
      strength: hard
      reason: Supplies the one-window control.
    - target: main.claim.free_decay
      strength: hard
```

The main theorem's right column will automatically show:

```text
proved_by main.proof.lr_iteration
```

## Recommendations

- Claims usually put statement context in `requires`; do not put proof dependencies directly on a claim's `uses`.
- The proof-to-claim relation is `proof -> proves -> claim`.
- Issue blockers use `issue -> blocks -> object`.
- Literature sources use `cites`; do not model a literature note as an ordinary `uses` dependency.
- If a proof actually uses an external mathematical result from a Reference Atlas, use `uses -> source.<paper>.claim.<result>`; that source claim should have exportable `statement.md`.
- `source.*` objects come from mounted Reference Atlases. Ordinary paper projects should not define them locally.

## EdgeRef Schema

Each edge entry is an object:

```yaml
- target: main.setting.discrete_mesh
  strength: hard
  reason: The formula uses the mesh norm.
```

`target` is required. `strength` defaults to `hard` and can be `hard` or `soft`. `reason` is optional.

Strict validation rejects the old string-list shape:

```yaml
uses:
  - main.claim.some_result
```

## Hard Dependency Projection

Strict cycle checking only uses hard `requires` and hard `uses`:

```text
G_dep = hard requires + hard uses
```

`proves`, `cites`, `blocks`, `refines`, `replaces`, and `related_to` do not participate in hard dependency cycle checks.

## Citation Sources And Trust

`cites` often connects the current object to a literature note:

```yaml
edges:
  cites:
    - target: source.boyer_2010a
```

When a proof directly uses an external theorem, point `uses` to the external result object:

```yaml
edges:
  uses:
    - target: source.boyer_2010a.claim.partial_discrete_lr
      strength: hard
```

Strict validation combines external references with Bib registry trust:

- Using a `rejected` source is an error.
- A proof that hard-uses an `unverified` external result produces a warning.
- A proof that hard-uses an external claim should have `statement.md` on that claim so statement context can be exported reliably.
