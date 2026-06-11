# Local AI Workflow

Proof Atlas is designed for local editor agents as well as human readers. The web UI copies short local references instead of full object bodies.

## Reference Format

A copied reference looks like:

```text
ProofAtlas local reference
project: semi-discrete-stochastic-control
root: /path/to/ProofAtlas
uid: obj_20260611_a7f3
name: main.claim.null_controllability
path: objects/main.claim.null_controllability/object.yml
body:
  - statement.md
```

The important field is `uid`. Names and paths can change after rename operations.

## Agent Rule

When an agent receives a reference, it should locate the object first:

```bash
npm run atlas -- locate obj_20260611_a7f3 examples/semidiscrete/ProofAtlas
```

Then it can read the listed Markdown body files, inspect edges, edit the object, and run:

```bash
npm run atlas -- check --strict examples/semidiscrete/ProofAtlas
```

## Selection References

If the copied reference includes a selection, use the file and excerpt to find the current text:

```text
selection:
  file: statement.md
  block: b003
  kind: paragraph
  excerpt: "For every h small enough..."
```

The `block` value is a browser anchor and may drift after edits. Treat the excerpt as the stronger locator.
