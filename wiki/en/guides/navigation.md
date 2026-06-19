# Navigation And UI Controls

The web UI has three columns:

- Left: view list and object tree.
- Center: the current view reading area.
- Right: details and relationships for the selected object.

The web UI is a read-only browsing layer. It reads local `ProofAtlas/` files and displays the object graph, but it does not directly write `object.yml`, body Markdown, `views/*.route.yml`, or export files. Use the CLI, local AI, or an editor for file writes.

## Top Toolbar

The top toolbar controls the current project, filters, and build state:

| Button | Purpose | Writes files |
|---|---|---|
| Menu icon | Show or hide the left column. | No |
| `Open` | Enter a project path, paper root, or recent project ID to switch the active Proof Atlas project. | No |
| `Filter` | Filter object status and object kind in the left column and views. | No |
| `Build OK` / `problem(s)` / `Build error` | Open validation results for the current object graph. Clicking a problem can jump to the related object. | No |

`Build OK` means the currently loaded object graph has no blocking build errors. It does not prove the mathematics; it means the file protocol, links, and graph build did not find blocking issues.

## Left Column

The top of the left column lists Markdown views in `views/`, for example:

- `dashboard.md`
- `paper.md`
- `proof_map.md`
- `gaps.md`
- `sources.md`

Clicking a view changes the center reading entry.

If `views/` contains `*.route.yml`, the left column also lists Generated Views with a `Generated` label. Markdown views are manually organized reading entries. Generated Views are dependency slices resolved from route recipes.

The lower part is the object tree. Objects are grouped by the dotted structure of `name`:

```text
main
  claim
    null_controllability
    observability
  proof
    lr_iteration
source
  boyer_2010a
```

Clicking an object in the left object tree opens the full object page directly. The object tree is more like table-of-contents navigation than a preview list.

The `Filter objects...` search box only filters currently visible objects. It does not modify files. `Show archived & obsolete` reveals archived or obsolete objects, which is useful when tracing older proof routes.

## Center Column: Manual View

Manual Views are hand-written reading entries in `views/*.md`; they are not objects.

```markdown
# Full paper route

## Notation and model

![[main.setting.probability_and_spaces]]{expanded}

![[main.model.forward_semidiscrete_system]]{expanded}
```

`![[...]]` embeds an object in the current view.

`{expanded}` means the body starts open. Without `{expanded}`, the card first shows title, summary, status, and metadata.

Common object-card controls:

| Control | Purpose | Typical use |
|---|---|---|
| Copy icon | Copy `Copy local AI reference`. | Give the object to local AI for precise file access. |
| Expand/collapse arrow | Expand or collapse the object body. | Read structure first, then expand as needed. |
| `Show proof` | Expand proof body and dependencies on a proof card. | Avoid filling the page with a long proof immediately. |
| `Open full page` icon | Open the full object page. | Read one object and its relationships in depth. |

Center object cards, Generated View nodes, and right-column relation rows follow the same interaction rule: a single click usually updates the right column, and a double click opens the full object page.

If an object comes from a mounted Reference Atlas, cards show `global references: <id>`, `bibkey`, a `trusted` / `unverified` / `rejected` trust chip, and source-result fidelity. These are derived from object origin, `citation`, and `source_result`; they are not separate editing controls.

## Center Column: Generated View

Generated Views come from `views/*.route.yml`. They are not hand-written articles. The route resolver computes a dependency slice from the target object, proof choices, boundaries, and representation modes.

Below the page title, the UI shows:

```text
target object · profile · object count · estimated tokens
```

This reports the target, route profile, included object count, and estimated token count for the current representation. Token estimates help reason about context cost; they do not measure mathematical complexity.

Generated View has three copy buttons:

| Button | Copies | When to use | Writes files |
|---|---|---|---|
| `Route` | A `npm run atlas -- route ...` command. | Reproduce route resolution in the terminal and inspect closure, proof choices, token estimates, and inclusion reasons. | No |
| `Local AI` | A prompt for local AI containing the route file path and task goal. | Ask local AI to read project files and review the route, missing edges, summaries, or narrative order. | No |
| `Export` | A `npm run atlas -- export ... --format markdown` command. | Generate a full Markdown context for cloud AI. | Copying does not write. Running the command may write output or stdout. |

These buttons only copy text to the clipboard. The browser does not create routes, apply LLM suggestions, or export files directly.

Generated View has two read-only projections:

| Tab | Purpose |
|---|---|
| `Linear` | Linearizes the same dependency slice into a reading order. Use it to read and inspect the proof route. |
| `Graph` | Draws the same dependency slice as a graph. Use it to inspect dependencies, witness paths, and boundaries. |

Graph controls:

| Control | Purpose |
|---|---|
| Search box | Highlight nodes by object name, title, role, decision, or representation. |
| `-` / `+` | Zoom out or in. |
| Scroll canvas | Move the graph. Browser Back restores tab, search, zoom, and position. |
| Single-click node | Update the right column and show why the route included that object. |
| Double-click node | Open the full object page. |
| Click edge list | Select the target object of the edge and show details in the right column. |

The graph is not an editor. Search, zoom, highlight, and click actions do not change the route file.

## Body Links

Object bodies can use normal object links:

```markdown
This proof uses [[main.claim.observability]].
```

They can also specify display text:

```markdown
This proof uses [[main.claim.observability|the observability estimate]].
```

Clicking a body link jumps to the object or opens its details in the right column. This lets readers move from a main theorem to a proof, from the proof to lemmas, and then to literature objects or issues.

When a body link points to a `source.*` object and the corresponding Reference Atlas is mounted, the UI opens it like any other object. If the mount is missing, graph diagnostics report the missing Reference Atlas rather than reporting every `source.*` link as an independent broken link.

## Right Column Details

The right column is a read-only detail panel for the selected object. Ordinary objects show:

- `title`
- `uid`
- `name`
- `kind`
- `role`
- `display_as`
- `status`
- `importance`
- `priority`
- `origin`
- `citation`
- `source_result`
- `edges`
- derived reverse edges
- body file list
- `Copy local AI reference`

Right-column top buttons:

| Button | Purpose |
|---|---|
| Back / forward arrows | Move through selected objects and pages in browser history. |
| Copy icon | Copy the current object's local AI reference. |
| Full-page icon | Open the current object as the center full object page. |
| Close icon | Close the right column. |

`Copy local AI reference` copies a short reference, not the full body. Local AI can read the files directly, so the short reference is more stable.

When a node is selected in Generated View, the right column also shows `Route inclusion`:

| Field | Meaning |
|---|---|
| `role` | The role assigned by the route resolver in this slice, such as obligation, support, or source. |
| `decision` | Whether the object is expanded, a boundary, or unresolved. |
| `representation` | Whether export uses `full`, `statement`, `summary`, `reference`, or `omit`. |
| `hardness` | Whether this is a hard dependency or soft/background context. |
| `depth` | Dependency depth from the route target. |
| `tokens` | Token estimate for the current representation. |
| `witness path` | A dependency path explaining why this object was included. |
| `marginal cost` | Extra or saved tokens when changing representation. |
| `diagnostics` | Route diagnostics related to the object. |

These fields explain the route. They are not editing controls.

## Full Object Page

Double-clicking an object, clicking `Open full page`, or using the left object tree opens the full object page in the center column.

The full object page is for reading one object in depth: body, metadata, used objects, reverse dependencies, proof relationships, and blocking issues.

The `Paper view` button at the top returns to the current manual view. Browser Back returns to the previous actual history location.

## Interaction Rule Summary

If you remember one rule: in the center and right columns, single-click usually inspects details and double-click opens a full page. In the left object tree, a single click opens the full page. All file writes go through the CLI, local AI, or an editor.
