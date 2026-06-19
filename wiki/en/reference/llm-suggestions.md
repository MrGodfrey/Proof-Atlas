# LLM And Local AI Suggestions

Proof Atlas treats LLM output as pending suggestions, not object-graph facts.

The browser does not write objects, edges, summaries, or route files. It can copy local AI requests. Write-back happens through the CLI, local AI file edits, or manual file edits.

## Pending Suggestion Set

Generate a pending suggestion file:

```bash
npm run atlas -- suggest examples/semidiscrete/ProofAtlas \
  --route views/null_controllability.route.yml \
  --output .atlas/suggestions/null_controllability.suggestions.yml
```

File structure:

```yaml
schema_version: "0.1"
type: suggestion_set
status: pending_confirmation
created_at: "2026-06-18T00:00:00.000Z"
project: semi-discrete-stochastic-control
route: views/null_controllability.route.yml
generator: proof_atlas_heuristic_prefill
instructions: These are pending suggestions for local AI or human review...
suggestions:
  - id: sug_edge_main_claim_a_requires_main_setting_b
    kind: missing_edge
    status: pending
    object: main.claim.a
    edge_type: requires
    target: main.setting.b
    strength: hard
    reason: Referenced from statement.md; confirm whether this is a real requires dependency.
    rationale: main.claim.a links to main.setting.b in statement.md...
```

The current generator is a conservative local prefill tool. It only lists candidates for local AI or human review:

- infer missing `requires` / `uses` edges from object body links
- draft summaries for objects without `summary`
- suggest route-level `render.order_hints` from current dependency-preserving linearization

Without `--route`, no `route_order_hints` suggestions are generated. Without `--output`, the suggestion set is written to stdout.

Suggestions deliberately remain pending. They can be wrong, incomplete, or too broad; review before write-back.

## Confirm And Apply

Apply only explicitly accepted suggestions:

```bash
npm run atlas -- apply-suggestions .atlas/suggestions/null_controllability.suggestions.yml \
  examples/semidiscrete/ProofAtlas \
  --accept sug_edge_main_claim_a_requires_main_setting_b
```

Apply all non-rejected suggestions only when you truly mean to confirm the whole set:

```bash
npm run atlas -- apply-suggestions .atlas/suggestions/null_controllability.suggestions.yml \
  examples/semidiscrete/ProofAtlas \
  --accept all
```

`apply-suggestions` refuses to write unless at least one `--accept` argument is present. This keeps LLM or local AI output reviewable until a human or local AI agent explicitly confirms which suggestion IDs should be materialized.

## Browser Boundary

Generated View graph search, zoom, and witness-path highlight are read-only. They help inspect an already resolved route, but they do not create edges, summaries, boundaries, proof choices, or route order hints.
