# Splitting Guidelines

Objects that are too coarse lose jumpability. Objects that are too fine create maintenance burden.

## Recommended Rules

- Main problem, main theorem, and main proof must be objects.
- Every reusable theorem, lemma, proposition, or estimate should be an object.
- Constructions or long calculations with independent meaning in a proof can be promoted to `construction` or `calculation`.
- Literature inputs should be `note/literature` objects connected through `cites`.
- Review comments, check points, and failed routes should be `issue` or `proof_fragment`, not hidden in body comments.
- Not every equation needs to become an object. Promote only equations that need repeated references, separate checking, or multiple proof dependencies.

## Splitting Strategy For The Semi-discrete Paper

- Paragraph-level paper background goes into `note`.
- Probability space, domain assumptions, mesh, operators, and spectral spaces go into `setting/model`.
- Main theorem and three preliminary propositions go into `claim`.
- Each proof goes into `proof`.
- The time grid and product estimate inside the main proof are split into `construction` and `calculation`.
- The adaptedness problem remains an `issue` and is marked as a resolved audit item.
- Important formulas are promoted to `main.eq.*` equation objects.
- Literature citation keys become `source.*` literature objects.

## Content That Should Not Go Into Object Bodies

- TeX preamble.
- TeX authoring notes.
- Raw TeX labels.
- Author contact information.
- Layout-only commands or comments.

Proof Atlas object bodies should serve mathematical reading, proof navigation, dependency explanation, and research state management.
