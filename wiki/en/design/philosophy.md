# Design Philosophy

## Object Graph, Not Linear Outline

Mathematical papers are linear in final form, but mathematical research is not linear.

A proof is often not:

```text
Step 1 -> Step 2 -> Step 3
```

It is more often:

```text
Object A uses objects B and C
Object D proves object A
Object E blocks object D
Object F is a failed route for D
Object G replaces F
```

The core of Proof Atlas is not an outline. It is an object graph.

## Files Are The Source Of Truth

Proof Atlas does not lock data inside a database. The `ProofAtlas/` directory is the source of truth. Git records history, local AI can read and write files directly, and users can maintain objects with ordinary editors.

Benefits:

- Auditable: every object is a local file.
- Portable: no server-side database binding.
- Collaborative: existing git workflows still work.
- Precise local AI edits: AI does not need a huge browser-exported context; it only needs `uid` and paths.

This defines the web UI boundary: the UI handles browsing, jumps, diagnostics, and copying references. Real file writes go through the CLI, local AI, or an editor. Every change can then be audited in git diff.

## Minimal Object Model

The base `kind` values are only:

```text
math
issue
note
```

Theorem, lemma, proposition, estimate, proof, and construction are not separate low-level types. They are expressed with `role` and `display_as`. This avoids repeated debates over whether a block is "really" a lemma or an estimate, and it allows an object to change display style as writing evolves.

## Progressive Disclosure

Proof Atlas should not open by dumping a long proof onto the page. It should show structure first and let readers expand as needed:

1. Read the dashboard for the main problem, main result, and current risks.
2. Read the paper view in paper order.
3. Open a proof card to inspect the proof.
4. Follow links from proof to lemmas.
5. Use the lemma right column to inspect dependencies, proof objects, blocking issues, and literature.

This is the "clickable paper": it preserves linear reading while allowing graph navigation at any time.

## Routes Are Explainable Dependency Slices

Generated View does not ask an LLM to generate a new article on every load. It saves a reproducible route recipe:

```text
target
profile
proof choices
boundaries
representation
```

The resolver computes a dependency slice and explains why each object is included. It answers questions such as:

- Which proof route is currently used for this claim?
- Is the route closed?
- Which objects are hard dependencies and which are soft/background context?
- Which objects are manual boundaries?
- When exporting to cloud AI, do hard dependencies have enough statement-level content?
- If context must be trimmed, which objects can be downgraded and at what cost?

Therefore `Linear` and `Graph` in Generated View are read-only projections of the same resolved route. The graph helps understanding, but it is not an editor.

## Sufficient Context First

The goal of cloud export is not to minimize tokens at all costs. The first goal is sufficient context, traceable sources, and readable internal links.

In proof / meaning context, hard dependencies cannot be only `reference`. They need at least readable `statement` content, otherwise cloud AI sees object names rather than checkable mathematical material.

Token estimates and marginal costs are trimming hints, not the default optimization target.

## Local AI Loop

The UI does not copy full context to AI. It copies stable references:

```text
uid
name
path
body files
optional selection excerpt
```

Local AI reads the referenced object, dependencies, and issues, then edits files. The web UI rebuilds after file watching detects changes. This loop is more reliable than pasting large bodies into the clipboard.

Cloud AI is different: it cannot read local files, so it needs `npm run atlas -- export ...` to generate full Markdown context. Local AI reference and cloud export are different tools and should not be mixed.
