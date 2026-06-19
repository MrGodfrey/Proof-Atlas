# Generated View UI Tradeoffs

Proof Atlas v1 treats local files as the source of truth. Objects, edges, route files, and export artifacts are created and modified through the CLI, local AI, or a file editor. The web UI is a read-only browsing layer for views, objects, resolver output, diagnostics, and stable local references.

## Current Choice

Generated View opens from existing `views/*.route.yml` files:

```text
.route.yml
    -> Resolver
    -> Resolved dependency slice
       -> Graph projection
       -> Linear projection
```

The graph is the output of the route resolver. It is not browser input for creating or saving a route.

The web UI should not provide these write features:

- choosing proof branches
- toggling whether dependencies are included
- editing `boundary`
- dragging nodes and saving order
- writing `.route.yml`
- exporting and writing files

It can provide read-only copy actions:

- `Copy command to create route`
- `Copy local AI request`
- `Copy local AI reference`
- `Copy export command`

## Reason

This keeps the product boundary simple:

- files remain the source of truth
- changes are auditable in git
- local AI and CLI can perform structured edits with clear diffs
- the browser stays focused on reading, jumping, progressive disclosure, diagnostics, and copying references

It also matches the current context goal. Cloud AI can often accept longer contexts, so v1 prioritizes sufficient and traceable content over aggressive token compression.

## Deferred Direction

Interactive organization is still valuable. Later versions may allow temporary browser-side overrides of representation mode, boundary choice, or proof choice while showing live token estimates.

Even then, future UI should avoid directly writing files. It should generate commands or requests with temporary overrides.

The current CLI already supports saving representation and boundary through `npm run atlas -- route`, for example:

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof \
  --representation main.setting.discrete_mesh=statement \
  --boundary source.boyer_2010a.claim.partial_discrete_lr \
  --save views/null_controllability.route.yml
```

The user, CLI, or local AI then decides whether to materialize those changes into a route file.
