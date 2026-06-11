# Markdown Links and Views

Proof Atlas uses two link forms.

## Object Links

Use object links in object bodies and views:

```markdown
The proof uses [[main.claim.observability]].
```

Custom link text:

```markdown
The proof uses [[main.claim.observability|the observability estimate]].
```

Object links point to `name`, not `uid`, because they are meant to be readable. Use `atlas rename` when changing names.

## View Embeds

Use embeds only in `views/`:

```markdown
![[main.claim.null_controllability]]
![[main.proof.lr_iteration]]{expanded}
```

`{expanded}` opens the object body by default in the web UI. Without it, the view shows a compact object card first.

Do not put `![[...]]` embeds inside object body files.

## Display Rules

- Objects with `display_as: equation` render as equation-style references.
- Literature notes render as citation-style references.
- Other objects render as regular object links.

The display rule affects the web UI only. The source files remain plain Markdown plus YAML.
