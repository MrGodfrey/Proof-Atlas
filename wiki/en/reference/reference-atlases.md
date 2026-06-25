# Reference Atlas And Citation Sources

A Reference Atlas is a reusable library of literature and external results. Ordinary paper projects store their own mathematical objects; `source.*` literature objects and external results extracted from papers live in a Reference Atlas and are mounted by paper projects.

## Two Atlas Types

An ordinary paper project is:

```yaml
schema_version: "0.2"
project: semi-discrete-stochastic-control
title: Semi-discrete stochastic controllability
default_view: views/dashboard.md
math_renderer: katex
atlas_type: project
```

A Reference Atlas is:

```yaml
schema_version: "0.2"
project: proof-atlas-example-reference-atlas
title: Proof Atlas Example Reference Atlas
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
    - id: proof-atlas-example-reference-atlas
```

Mount entries only accept `id`. All Reference Atlas mounts are read-only; do not write `mode`, `expected_atlas_uid`, or local absolute paths.

Paths come from the unified project registry. Register the Reference Atlas first:

```bash
npm run atlas -- register examples/reference-atlas/ProofAtlas
```

The registry file is:

```text
~/.proof-atlas/projects.yml
```

If no registry is available, the public example can still resolve through the nearby `examples/reference-atlas/ProofAtlas` fallback. The resolver still requires exact `atlas.yml.project` equality and `atlas_type: reference`.

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

- mount entries containing old `mode` or `expected_atlas_uid` fields
- duplicate mount ids, more than one mount, or unresolved registry entries
- `atlas_type` is only `project` or `reference`
- local `source.*` objects in ordinary projects
- non-`source.*` objects in a Reference Atlas
- `source.<work>` objects missing `citation.bibkey`
- source claims repeating `citation` instead of deriving it from the parent
- duplicate BibKey / DOI / arXiv inside one owner registry
- use of `rejected` citation sources
- hard `uses` / `requires` of external source claims must satisfy the accepted-input policy and include `reason`

When a Reference Atlas mount is missing, the system reports `reference_atlas_mount_unresolved` and avoids reporting the same batch of `source.*` edges and Markdown links as ordinary broken links.

## UI And Export

Mounted objects include origin metadata:

```text
global_reference
origin_atlas: proof-atlas-example-reference-atlas
```

The web UI displays origin, bibkey, trust, and `source_result` fidelity on object cards and in the right column. `Copy local AI reference` and route export also include origin/citation metadata so local AI can distinguish "current paper objects" from "external reference objects".
