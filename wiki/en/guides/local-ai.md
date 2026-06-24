# Local AI References

`Copy local AI reference` gives local AI stable locating information for the current object.

Typical copied text:

```text
ProofAtlas local reference
project: semi-discrete-stochastic-control
atlas_root: /path/to/Proof-Atlas/examples/semidiscrete/ProofAtlas
workspace_root: /path/to/Proof-Atlas/examples/semidiscrete
uid: obj_20260611_a7f3
name: main.claim.null_controllability
path: objects/main.claim.null_controllability/object.yml
body:
  - statement.md
```

If the project has a paper entry configured, it can also include:

```text
tex_main: main.tex
```

If the object comes from a mounted Reference Atlas, it also includes origin and citation metadata:

```text
origin: global_reference
origin_atlas: shared-reference-atlas
origin_atlas_root: /path/to/Proof-Atlas/examples/reference-atlas/ProofAtlas
citation_bibkey: Boyer2010
citation_trust: trusted
```

Local AI should treat `origin: global_reference` as an external reference object. It should not edit a read-only mount unless the user explicitly asks to edit that Reference Atlas.

## Locating Rules

`uid` is permanent identity. Paths and `name` can change after renames.

After receiving a reference, local AI should locate by `uid` first:

```bash
npm run atlas -- locate obj_20260611_a7f3 examples/semidiscrete
```

After locating, trust the current filesystem:

1. Read the located `object.yml`.
2. Read the Markdown files listed in `body`.
3. To understand fields and values, read [Object protocol](../reference/object-protocol.md).
4. To generate or modify Generated Views / routes, read [Routes and export](../reference/routes-and-export.md).
5. To modify dependencies, read [Edge semantics](../reference/edges.md).

## Selection Rules

If the reference includes `selection`:

```text
selection:
  file: statement.md
  block: b003
  kind: paragraph
  excerpt: "For every h small enough..."
```

Local AI should use `file + excerpt` to find the source text. `block` is an internal browser anchor and may drift after edits.

## Why Not Copy Full Text

Local AI can read local files directly. Copying short references is more stable and better for later automatic edits to objects, dependencies, and status.

## Local AI Checklist

After receiving `ProofAtlas local reference`, automation should follow these rules:

1. Do not trust `path` alone. Locate the current object by `uid`, because objects may have been renamed.
2. Do not change `uid`. Use `npm run atlas -- rename old.name new.name <project>` to change semantic names.
3. When editing `object.yml`, only use enum values listed in the wiki.
4. New mathematical conclusions usually start with `status: needs_check`; change to `checked` only after human review.
5. Failed routes use `status: disproved`; obsolete routes use `status: obsolete`; do not write `status: false`.
6. For a new proof, write `edges.proves -> claim` on the proof object, and write proof dependencies in the proof's `edges.uses`.
7. A claim's statement context belongs in `edges.requires`; do not put proof dependencies directly in the claim's `uses`.
8. Route `representation` can only be `full`, `statement`, `summary`, `reference`, or `omit`.
9. Route hard dependencies must not be `omit`; in `proof` routes, hard dependencies usually need at least `statement`.
10. After edits, run `npm run atlas -- check --strict <paper-root-or-ProofAtlas-root>`.
