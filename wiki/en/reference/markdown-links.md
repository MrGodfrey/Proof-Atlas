# Markdown Links

## Normal Links

```markdown
We use [[main.claim.observability]].
```

## Custom Display Text

```markdown
We use [[main.claim.observability|the observability estimate]].
```

## View Embeds

```markdown
![[main.claim.null_controllability]]
![[main.claim.null_controllability]]{expanded}
```

Embeds are only allowed in `views/`. Object bodies must not contain `![[...]]`.

## Rules

- `[[...]]` can appear in object bodies and views.
- `![[...]]` can only appear in views.
- `![[name|text]]` is invalid; embeds do not support display text.
- `![[name]] {expanded}` is invalid; there must be no space before `{expanded}`.
- `[[...]]` inside math formulas, code blocks, and inline code is not parsed as an object link.

## Display Conventions

- If the target has `role: literature` or `display_as: literature_note`, the UI renders it in a bracketed style, such as `[Boyer 2010]`.
- Other objects keep the normal link style.

This convention only affects web rendering. It does not change Markdown source files or object identity.

## Formula References

If the reference points to an equation inside the same Markdown object, do not write an Atlas link to the current object. Prefer natural prose:

```markdown
Combining the previous two estimates, ...
```

If several displayed equations inside the same object need local references, use local equation numbers. Local numbers are only valid inside that object and are preserved as ordinary Markdown / LaTeX content during export:

```markdown
We first use the one-step estimate (LPE1).

$$
\begin{aligned}
...
\end{aligned}
\tag{LPE1}
$$

Combining (LPE1) with the cutoff identity (LPE2), ...
```

Local numbering rules:

- The number should be unique within the object.
- Use short semantic prefixes, such as `LPE1`, `BAS1`, or `OSB1`.
- Do not rely on project-level TeX `\label` / `\ref` mechanics.
- Other objects should not directly cite a local number inside this object.

If an equation needs cross-object references, repeated reuse, or separate checking, do not mechanically promote it to an `equation` object. First identify its mathematical role, then promote it to the corresponding object:

- Forward/backward systems, weights, cutoffs, time grids, and control constructions: usually `role: definition`; use `role: setting` when the object is only an ambient context container.
- Reusable key inequalities, spectral bounds, named identities, or formula-like facts: `role: claim`, with `display_as` such as `lemma`, `proposition`, or `plain`; content words like “estimate” belong in the title or summary.
- Exponent bookkeeping, longer algebra, or construction steps internal to a proof: `role: proof`; use `status` to express partial, draft, obsolete, or checked state.

For example, a reusable identity can be written as:

```yaml
kind: math
role: claim
display_as: lemma
name: main.statement.energy_identity
```

Refer to it with normal object links:

```markdown
Combining [[main.statement.energy_identity]] and [[main.claim.observability]], ...
```

Promoted objects are not mechanical replacements for TeX labels. Their bodies should start with a complete sentence, state where symbols and assumptions come from, and explain how the claim or proof-support object is used in the proof. Cross-object references should point to the object itself, not to a local number inside that object.
