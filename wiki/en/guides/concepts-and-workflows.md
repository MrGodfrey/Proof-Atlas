# Concepts And Workflows

This page answers three questions:

- Which concepts matter most in Proof Atlas?
- Why does the web UI look read-only?
- What should you do in concrete workflows?

## The Five Most Important Ideas

### Files Are The Source Of Truth

YAML and Markdown files inside `ProofAtlas/` are the source of truth. The web UI reads those files and displays the object graph.

This means:

- Use an editor, CLI, or local AI to modify objects, edges, routes, or body text.
- After edits, run `npm run atlas -- check --strict <project>`.
- The web UI watches file changes and rebuilds the view.
- The git diff is the audit trail.

### Objects Matter More Than Sections

Proof Atlas does not first ask "which chapter does this paragraph belong to?" It first asks "what kind of object is this?"

- `claim`: a conclusion that needs proof.
- `proof` / `proof_fragment`: proof objects.
- `setting` / `definition` / `notation`: background needed to read statements.
- `model` / `construction` / `calculation`: models, constructions, and computations.
- `issue`: blockers, risks, todos, or gaps.
- `literature` / `source`: citations and external sources.

Sections and reading order are organized by `views/*.md` or `views/*.route.yml`; objects stay stable.

### Edges Express Mathematical Relationships

Edges between objects determine whether routes, exports, and validation work:

- `requires`: context required to state, read, or explain the current object.
- `uses`: dependencies actually used to prove, derive, construct, or compute the current object.
- `proves`: which claim a proof proves.
- `blocks`: which object an issue blocks.
- `cites`: literature or external sources.

General rule: claims mostly use `requires`; proofs mostly use `proves` and `uses`.

### Manual View And Generated View Are Different

`views/*.md` files are Manual Views: hand-written reading entries, useful for paper-like reading.

`views/*.route.yml` files are Generated Views: saved recipes containing a target, proof choices, boundaries, and representation modes. The resolver computes a dependency slice.

Generated View graphs and linear lists are outputs, not editors. Clicking, searching, and zooming in the browser do not modify files.

### Local AI And Cloud AI Need Different Inputs

Local AI can read local files, so the UI usually copies stable references:

```text
uid
name
path
body files
selection excerpt
```

Cloud AI cannot read local files, so use `npm run atlas -- export ...` to materialize a complete Markdown context.

## Common Scenarios

### Scenario 1: Read A Proof Atlas Project

Goal: read it like a paper first, then jump into the object graph as needed.

1. Start the web UI:

```bash
npm run atlas -- dev examples/semidiscrete --port 3217
```

2. Open a Manual View such as `Dashboard` or `Paper` in the left column.
3. Read object cards in order in the center column.
4. Single-click cards or body links to inspect metadata, dependencies, and reverse dependencies in the right column.
5. Double-click a center card or click the open icon to enter the full object page. A single click in the left object tree opens the full page.
6. Use browser Back to return to the previous reading position.

Useful controls:

- `Filter`: temporarily hide drafts, archived objects, or object kinds.
- Object-card copy icon: pass an object reference to local AI.
- Right-column full-page icon: read one object in depth.

### Scenario 2: Check Which Proof Route A Claim Currently Uses

Goal: see which proofs, claims, settings, and calculations support a conclusion.

1. Open the relevant Generated View, for example `Why null controllability holds`.
2. Read `Linear` first: definitions, models, supporting claims, proofs, and target in dependency order.
3. Switch to `Graph` to inspect dependency structure and boundaries.
4. Single-click a node and inspect `Route inclusion` in the right column.
5. Check these fields:

| Field | What to check |
|---|---|
| `decision` | Whether any node is `unresolved`. |
| `witness path` | Why this node was included. |
| `representation` | Whether hard dependencies have at least statement-level content. |
| `diagnostics` | Proof-choice, statement, or profile issues. |
| `marginal cost` | Where context can be downgraded if you need to reduce size. |

6. Click `Route` to copy the CLI command and reproduce resolution in the terminal:

```bash
npm run atlas -- route views/null_controllability.route.yml examples/semidiscrete/ProofAtlas
```

This workflow only inspects a route; it does not write project files.

### Scenario 3: Prepare Context For Cloud AI

Goal: export one proof route into Markdown that can be read outside the local project.

1. Open the Generated View and confirm there are no obvious diagnostics.
2. Click `Export` to copy the export command.
3. Run it in the terminal with an output file:

```bash
npm run atlas -- export views/null_controllability.route.yml \
  examples/semidiscrete/ProofAtlas \
  --format markdown \
  --output /tmp/null-control-context.md \
  --snapshot /tmp/null-control.snapshot.yml
```

4. Send `/tmp/null-control-context.md` to cloud AI.
5. Save the snapshot if you need a record of the exact material sent to cloud AI.

The `Export` button only copies a command. The browser does not write `/tmp/...` files.

### Scenario 4: Ask Local AI To Modify An Object

Goal: let local AI locate an object precisely and edit local files.

1. Select the object in the web UI.
2. Click the copy icon or `Copy local AI reference`.
3. Give the copied reference to local AI with a task, for example:

```text
Use this Proof Atlas local reference to open the corresponding object.yml and statement.md.
Goal: add a summary and check whether requires covers the objects linked from the statement.
Do not edit unrelated files.
```

4. After local AI edits files, run:

```bash
npm run atlas -- check --strict <project>
```

5. Return to the web UI and confirm `Build OK`.

Do not copy the entire proof body for this workflow. Stable references plus direct file reads are more reliable.

### Scenario 5: Add A Mathematical Object

Goal: put a new lemma, proof, construction, or issue into the object graph.

1. Decide the object role:

```text
claim / proof / setting / definition / model / construction / calculation / issue
```

2. Create it with the CLI:

```bash
npm run atlas -- new math claim main.claim.some_result "Some result" <project>
```

3. Edit `object.yml`:

- Put claim context in `requires`.
- Put proof relationships in `proves` and `uses`.
- Put issue blockers in `blocks`.
- Put literature references in `cites`.

4. Write `statement.md` or another body file.
5. Embed the object in an appropriate `views/*.md`, or include it in the dependency chain of a `views/*.route.yml`.
6. Run strict check.

### Scenario 6: Create Or Adjust A Generated View

Goal: save a reproducible proof route.

1. Resolve the target object with the CLI:

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof
```

2. If the default proof choice is not intended, specify it:

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof \
  --proof-choice main.claim.observability=main.proof.observability
```

3. If an external input or deep background object should not be expanded, set a boundary:

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof \
  --boundary source.boyer_2010a.claim.partial_discrete_lr
```

4. Save a route file:

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof \
  --save views/null_controllability.route.yml
```

5. Return to the UI; the Generated View appears in the left column.

The browser `Graph` helps read the route. To change proof choices, boundaries, or representation modes, edit the route file or use the CLI.

### Scenario 7: Handle LLM Suggestions

Goal: let tooling or local AI propose candidate edits while keeping human confirmation.

1. Generate a pending suggestion set:

```bash
npm run atlas -- suggest examples/semidiscrete/ProofAtlas \
  --route views/null_controllability.route.yml \
  --output .atlas/suggestions/null_control.yml
```

2. Open the suggestion file and review each item.
3. Accept only explicitly confirmed IDs:

```bash
npm run atlas -- apply-suggestions .atlas/suggestions/null_control.yml \
  examples/semidiscrete/ProofAtlas \
  --accept sug_edge_main_claim_a_requires_main_setting_b
```

4. Run strict check and inspect the git diff.

Do not treat LLM suggestions as object-graph facts. Without `--accept`, `apply-suggestions` refuses to write.

### Scenario 8: Debug `Build error` Or Strict Check Failure

Goal: restore the object graph to a buildable and traceable state.

1. Click the top `Build error` or `problem(s)` button.
2. Inspect the problem list and click related problems to jump to objects.
3. Common repair directions:

| Problem | Repair direction |
|---|---|
| Edge target does not exist | Fix the object name, or create the target object first. |
| Route target does not exist | Fix `target` in `views/*.route.yml`. |
| Proof choice is invalid | Confirm the proof has `proves` pointing to the claim. |
| Hard dependency is `omit` | Change it to `statement`, `summary`, or `full`. |
| Missing statement | Add `statement.md`, or adjust role / representation. |
| Cycle in `G_dep` | Inspect hard `requires` / `uses`; change to soft or remodel if needed. |

4. After fixes, run:

```bash
npm run atlas -- check --strict <project>
```

## Operating Principles

- Model facts first; organize reading order second.
- Put proof dependencies on a proof's `uses`, not directly on the claim's `uses`.
- A route answers "which route is current?"; it does not replace the object graph.
- Boundaries are deliberate cut points and must be visible in export.
- Hard dependencies in proof / meaning context cannot be reference-only.
- The web UI is read-only; writes must be auditable in git diff.
- Cloud AI needs materialized context; local AI needs stable references.
