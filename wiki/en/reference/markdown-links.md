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

- If the target has `display_as: equation`, the web UI renders the link in a parenthesized style, such as `(energy identity)`.
- If the target has `role: literature` or `display_as: literature_note`, the UI renders it in a bracketed style, such as `[Boyer 2010]`.
- Other objects keep the normal link style.

This convention only affects web rendering. It does not change Markdown source files or object identity.

## Equation References

If an equation needs long-term references, promote it to an object:

```yaml
kind: math
role: claim
display_as: equation
name: main.eq.energy_identity
```

Refer to it with normal object links:

```markdown
Combining [[main.eq.energy_identity]] and [[main.claim.observability]], ...
```

Do not keep TeX labels as internal Atlas references.
