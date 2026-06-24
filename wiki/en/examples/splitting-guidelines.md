# Splitting Guidelines

Objects that are too coarse lose jumpability. Objects that are too fine create maintenance burden.

## Recommended Rules

- Main problem, main theorem, and main proof must be objects.
- Every reusable theorem, lemma, proposition, or estimate should be an object.
- Construction processes, derivations, or long calculations with independent meaning in a proof can be promoted to proof-support objects with `role: proof`.
- Literature inputs should be `note/literature` objects connected through `cites`.
- Review comments and check points should be `issue`; failed routes or draft proofs should be `role: proof` with `status: obsolete/draft/partial`, not hidden in body comments.
- Not every equation needs to become an object. Promote only formula-like material that needs repeated references, separate checking, or multiple proof dependencies and has independent mathematical meaning.
- If an equation is only referenced inside the same proof or definition object, keep it inside that object and use prose or local equation numbers, such as `(LPE1)`.
- Do not use `equation` as an object type or `display_as` value. Forward/backward systems, time grids, operators, and constructed objects are usually `definition` or `setting`; proof-internal algebra and construction steps are `proof`; reusable assertions are `claim`, with titles or summaries saying whether they are estimates, identities, or formulas.
- Promoted claims or proof-support objects must be self-contained: the body should start with a complete sentence, state where symbols and assumptions come from, give the formula, and explain its role in the proof.

## Splitting Strategy For The Semi-discrete Paper

- Paragraph-level paper background goes into `note`.
- Probability space, domain assumptions, mesh, operators, and spectral spaces go into `setting` or `definition`.
- Main theorem and three preliminary propositions go into `claim`.
- Each proof goes into `proof`.
- The time grid inside the main proof is split as `definition`; the product estimate and exponent bookkeeping are split as proof-support objects.
- The adaptedness problem remains an `issue` and is marked as a resolved audit item.
- Important formula-like material is promoted by meaning to `claim` or proof-support objects. Object names may preserve source semantics, but `role` no longer uses `statement`, `estimate`, or `calculation`.
- Promoted objects keep complete context; multiple formulas inside one object use local numbers instead of being split into many contextless tiny objects.
- Literature citation keys become `source.*` literature objects.

## Content That Should Not Go Into Object Bodies

- TeX preamble.
- TeX authoring notes.
- Raw TeX labels.
- Author contact information.
- Layout-only commands or comments.

Proof Atlas object bodies should serve mathematical reading, proof navigation, dependency explanation, and research state management.
