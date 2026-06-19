# Semi-discrete Paper Example

The complete example is:

```text
examples/semidiscrete/ProofAtlas
```

The shared reference library it mounts is:

```text
examples/reference-atlas/ProofAtlas
```

This example decomposes a semi-discrete stochastic parabolic equation paper into an object graph: paper overview, introduction, continuous model, discrete mesh, main theorem, preliminary propositions, proofs, main proof iteration, adaptedness audit, and literature references. Literature notes and external results live in `shared-reference-atlas`; the paper project mounts them read-only through `references.mounts`.

## Recommended Reading Order

1. Open `Dashboard`: main problem, main theorem, current proof route, and audit items.
2. Open `Full Paper Route`: read all content in paper order.
3. Open `Proof Map`: inspect only the dependency chain for the main theorem proof.
4. Open `Gaps and Audits`: inspect the adaptedness issue and historical failed routes.
5. Open `Literature and Imported Results`: inspect all citation sources.
6. Open `Why null controllability holds`: inspect the Generated View resolved from `views/null_controllability.route.yml`, including `Linear` and `Graph`.

## Key Objects

```text
paper.note.frontmatter
main.note.introduction
main.problem.control_question
main.setting.probability_and_spaces
main.setting.domain_and_coefficients
main.model.continuous_problem
main.setting.discrete_mesh
main.setting.grid_operator
main.model.forward_semidiscrete_system
main.setting.spectral_spaces
main.claim.null_controllability
source.boyer_2010a.claim.partial_discrete_lr
main.model.backward_adjoint_system
main.claim.observability
main.proof.observability
main.claim.partial_null_control
main.construction.partial_control_duality
main.proof.partial_null_control
main.claim.free_decay
main.proof.free_decay
main.construction.lr_time_grid
main.calculation.lr_product_estimate
main.proof.lr_iteration
main.issue.adaptedness
main.proof.naive_duality
```

## Main Spine

```text
main.proof.lr_iteration proves main.claim.null_controllability
main.proof.lr_iteration uses main.claim.partial_null_control
main.proof.lr_iteration uses main.claim.free_decay
main.proof.lr_iteration uses main.calculation.lr_product_estimate

main.proof.partial_null_control proves main.claim.partial_null_control
main.proof.partial_null_control uses main.claim.observability

main.proof.observability proves main.claim.observability
main.proof.observability uses source.boyer_2010a.claim.partial_discrete_lr
```

In the current v1 model, statement context for claims is stored in `requires`; mathematical results actually used in proofs are stored in the corresponding proof's `uses`. Thus `main.claim.observability` only declares the model and spectral spaces needed to read the statement, while `main.proof.observability` records that it uses the external result `source.boyer_2010a.claim.partial_discrete_lr` from the Reference Atlas.

## Equation Objects

Important equations are not kept as TeX labels. They are promoted to `display_as: equation` objects, for example:

```text
main.eq.observability_spectral_bound
main.eq.partial_control_representation
main.eq.partial_control_ito_duality
main.eq.lr_low_mode_cancellation
main.eq.lr_control_estimate
main.eq.lr_induction_product
main.eq.lr_exponent_identities
```

Body text refers to these formulas with normal object links. The web UI renders equation links in a parenthesized style.

## Literature Relationships

```text
source.boyer_2010a.claim.partial_discrete_lr cites source.boyer_2010a
main.model.forward_semidiscrete_system cites source.lue_zhang_2021
main.model.backward_adjoint_system cites source.lue_zhang_2021
main.model.continuous_problem cites source.lue_2011
main.note.introduction cites all introduction references
```

The web UI renders literature links in a bracketed style. `source.*` objects come from `examples/reference-atlas/ProofAtlas`, so the right column shows `origin: global_reference`, `origin_atlas: shared-reference-atlas`, bibkey, and trust. Ordinary paper projects no longer maintain these `source.*` objects locally.
