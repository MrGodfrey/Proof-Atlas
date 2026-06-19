# Reference Atlas And Citation Sources

A Reference Atlas is a reusable library of literature and external results. Ordinary paper projects store their own mathematical objects; `source.*` literature objects and external results extracted from papers live in a Reference Atlas and are mounted by paper projects.

## Two Atlas Types

An ordinary paper project is:

```yaml
schema_version: "0.1"
project: semi-discrete-stochastic-control
title: Semi-discrete stochastic controllability
default_view: views/dashboard.md
math_renderer: katex
atlas_type: project
```

A Reference Atlas is:

```yaml
schema_version: "0.1"
project: shared-reference-atlas
title: Shared Reference Atlas
default_view: views/references.md
math_renderer: katex
atlas_type: reference
```

When omitted, `atlas_type` defaults to `project`. Ordinary projects cannot define local `source.*` objects. The `source.*` namespace is reserved for Reference Atlases. A Reference Atlas can define objects such as `source.paper_key` and `source.paper_key.claim.result`.

## Mounting A Reference Library

A paper project only declares structural dependencies in commit-safe `atlas.yml`:

```yaml
references:
  mounts:
    - id: shared-reference-atlas
      mode: readonly
```

`mode` can be `readonly` or `readwrite`; default usage is read-only. Shared config should not contain local absolute paths.

Project-local paths can go in `ProofAtlas/.atlas/local.yml`:

```yaml
reference_atlases:
  shared-reference-atlas:
    root: ../reference-atlas/ProofAtlas
```

They can also go in the user-level registry:

```text
~/.proof-atlas/reference-atlases.yml
```

```yaml
reference_atlases:
  shared-reference-atlas:
    root: /path/to/reference-atlas/ProofAtlas
```

If no registry is available, the resolver also searches upward from the current project for a nearby `reference-atlas/ProofAtlas` and requires that its `atlas.yml` `project` matches the mount id.

## Bib Registry

A Reference Atlas uses `bib-registry.yml` to group BibTeX files by trust:

```yaml
schema_version: "0.1"
trusted:
  - id: main
    path: references.bib
unverified:
  - path: unverified.bib
rejected:
  - path: rejected.bib
```

Each entry can be a string path or `{ id, path }`. Paths resolve relative to the atlas root containing `bib-registry.yml`. In public repositories, use relative paths and do not commit local PDF paths or private directories.

The resolver reads BibTeX keys and expands `citation.bibkey` into:

```text
bibkey
trust
bibfile
registryId
entryType
```

These expanded fields are graph results and should not be hand-written into objects.

## source Objects

Literature entries are usually notes:

```yaml
uid: obj_20260618_ref001
name: source.boyer_2010a
kind: note
role: literature
display_as: literature_note
title: Boyer 2010
provenance: external
citation:
  bibkey: Boyer2010
body:
  - note.md
```

External mathematical results extracted from literature can be `source.<paper>.claim.<name>`:

```yaml
uid: obj_20260618_ref101
name: source.boyer_2010a.claim.partial_discrete_lr
kind: math
role: claim
display_as: theorem
title: Partial discrete Lebeau-Robbiano estimate
provenance: external
citation:
  bibkey: Boyer2010
source_result:
  parent: source.boyer_2010a
  location: Theorem 2.1
  statement_fidelity: paraphrased
body:
  - statement.md
```

`source_result` is optional explanatory metadata:

| Field | Meaning |
|---|---|
| `parent` | The corresponding literature note object name. |
| `location` | Location in the source, such as theorem, lemma, page, or section. |
| `statement_fidelity` | Statement fidelity, such as `verbatim`, `paraphrased`, or `adapted`. |

## Validation Rules

Strict validation checks:

- duplicate mount ids or missing mount paths
- `atlas_type` is only `project` or `reference`
- local `source.*` objects in ordinary projects
- `source.*` objects missing `citation.bibkey`
- `citation.bibkey` not found in mounted Bib registries
- the same BibTeX key appearing in conflicting trust groups
- use of `rejected` citation sources
- warning when a proof hard-uses an `unverified` external result
- external claims hard-used by proofs should be exportable as `statement`

When a Reference Atlas mount is missing, the system reports `missing_reference_atlas_mount` and avoids reporting the same batch of `source.*` edges and Markdown links as ordinary broken links.

## UI And Export

Mounted objects include origin metadata:

```text
global_reference
origin_atlas: shared-reference-atlas
```

The web UI displays origin, bibkey, trust, and `source_result` fidelity on object cards and in the right column. `Copy local AI reference` and route export also include origin/citation metadata so local AI can distinguish "current paper objects" from "external reference objects".
