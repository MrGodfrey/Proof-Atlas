# Validation And Common Errors

Normal validation:

```bash
npm run atlas -- check examples/semidiscrete
```

Strict validation:

```bash
npm run atlas -- check --strict examples/semidiscrete
```

## Errors That Fail Strict Mode

- duplicate `uid`
- duplicate `name`
- invalid `kind`
- invalid `role`
- invalid `display_as`
- invalid `display_as` / `kind` / `role` combination, such as `role: assumption` displayed as `lemma`
- invalid `importance`
- invalid `status`
- invalid `priority`
- invalid `provenance`
- invalid `atlas_type`
- invalid `references.mounts`
- invalid `citation` or `source_result`
- invalid edge type or edge ref schema
- `body` points to a missing Markdown file
- `edges` point to missing objects
- cycle in hard `requires` / hard `uses` projection
- route missing `uid`, `title`, or `target`
- route `type` is not `route`
- route `profile` is not `proof`
- route target is not a proof-obligation claim
- route `target`, `proof_choices`, `boundaries`, `representation`, or `render.order_hints` references missing objects
- invalid route `claim -> proof` choice
- route `representation` value is not `full`, `statement`, `summary`, `reference`, or `omit`
- hard dependency in proof route is `omit` or below representation floor
- hard dependency in proof route requires `statement` but cannot be extracted by v1 rules
- Markdown link points to a missing object
- view embed points to a missing object
- object body contains `![[...]]`
- in strict mode, object body contains Markdown render blockers such as indented code blocks, indented `$$` delimiters, unclosed `$$`, standalone `\[` / `\]` or `[` / `]` display-math delimiters, or TeX math environments outside `$$`
- object body contains TeX macro definitions `\newcommand`, `\renewcommand`, or `\def`
- ordinary project defines local `source.*` objects
- `source.*` object is missing `citation.bibkey`
- `citation.bibkey` is not in the current project or mounted Reference Atlas Bib registry
- Reference Atlas mount id is duplicated or local path is missing
- `bib-registry.yml` points to a missing BibTeX file
- same BibTeX key appears in conflicting trust groups
- use of `rejected` citation source

## Common Warnings

Warnings do not necessarily make ordinary graph build fail, but they appear in top build state and `npm run atlas -- check` output:

- `alias_reference`: old alias is still used; prefer the current object name.
- `folder_name_mismatch`: object directory name differs from `object.yml` `name`; usually fix with `npm run atlas -- rename`.
- `object_body_h1`: object body starts with H1; object title already comes from `object.yml`.
- `markdown_indented_code_block`: ordinary object body content is parsed as an indented code block, usually because a line starts with a tab or four spaces; math and object links will not render there.
- `markdown_indented_math_delimiter`: a `$$` delimiter starts with a tab or four spaces, so Markdown will not recognize it as display math.
- `markdown_unsupported_display_delimiter`: object body uses standalone `\[` / `\]` or `[` / `]` as display-math delimiters; use `$$...$$`.
- `markdown_unclosed_display_math`: a `$$` display-math block is not closed.
- `markdown_tex_environment_outside_math`: a TeX math environment appears outside a recognized `$$` block.
- `embed_option_spacing`: `![[name]] {expanded}` has a space before `{expanded}`; write `![[name]]{expanded}`.
- `status_kind_combo`: `kind` and `status` combination is not recommended.
- `blocks_from_non_issue`: non-issue object has `blocks`.
- `proves_shape`: a non-proof object has `proves`, or `proves` does not point to a math claim.
- `uses_points_to_proof`: `uses` points to a proof object; usually model through the proof's `proves` and `uses`.
- `claim_uses_own_proof`: claim `uses` points to the proof of itself.
- `claim_uses_dependency`: claim has proof-dependency-style `uses`; usually move it to the corresponding proof's `uses`.
- `needs_confirmation`: route has multiple reasonable proof candidates; resolver used deterministic default but human confirmation is recommended.
- `unsupported_proof_tree_target`: Generated View target is not a proof-obligation claim. The target must be `kind: math`, `role: claim`.
- `citation_bibfile_deprecated`: object hand-wrote `citation.bibfile`; BibTeX file should be derived from `bib-registry.yml`.
- `unverified_external_dependency`: proof hard-uses an unverified external result and needs source trust review.

## Reference Atlas Checks

Ordinary projects can declare:

```yaml
references:
  mounts:
    - id: shared-reference-atlas
      mode: readonly
```

If the local mount path is not configured, strict validation reports `missing_reference_atlas_mount`. The system then avoids reporting the same `source.*` edges and Markdown links as ordinary broken links, which would create noisy duplicate errors.

After a mount succeeds, the system loads Reference Atlas objects and `bib-registry.yml`. `source.*` objects need `citation.bibkey`; trust is derived from the Bib registry. `rejected` sources cannot be used. `unverified` external results can be displayed, but hard-use by a proof emits a warning.

## TeX Macro Checks

TeX macros inside code blocks are not errors, because they are just code text.

Macro definitions in ordinary prose or math environments are errors. Object bodies should contain renderable mathematical content, not preamble configuration.

## Markdown Render Checks

Proof Atlas object bodies render inline math with `$...$` and display math with standalone `$$...$$` blocks. Ordinary paragraphs and `$$` delimiters should not start with a tab or four spaces; Markdown treats that as an indented code block, so math, object links, and emphasis syntax do not render.

Use fenced code blocks for intentional code:

````markdown
```text
code here
```
````

After an AI edits object bodies, run:

```bash
npm run atlas -- check --strict <paper-root-or-ProofAtlas>
```

The strict check fails on these Markdown render blockers.

## Maintenance Checklist

When editing objects, check:

1. `object.yml` `uid` did not change.
2. `name` changes use `npm run atlas -- rename`.
3. New body files are listed in `body`.
4. Normal links in body text point to existing objects.
5. Embeds in views point to existing objects.
6. `edges` only contain forward edges.
7. Hard `requires` and `uses` projection has no cycles.
8. `target`, proof choices, boundaries, and representation in `views/*.route.yml` still reference valid objects.
9. `status` and `kind` combination is sensible.
10. Object bodies do not contain `![[...]]`.
11. Ordinary paragraphs and `$$` delimiters do not start with tabs or four-space indentation.
12. Object body math does not define TeX macros.
13. If using `source.*` objects, confirm the Reference Atlas is mounted and related `citation.bibkey` is in the Bib registry.
14. Before committing, run `npm run atlas -- check --strict <paper-root>` or `npm run atlas -- check --strict <ProofAtlas path>`.
