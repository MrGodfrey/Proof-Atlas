# Semi-discrete Example

The included example is:

```text
examples/semidiscrete/ProofAtlas
```

It models a semi-discrete stochastic controllability proof as a navigable object graph.

## Suggested Route

1. Open `Dashboard` for the main problem, main theorem, proof route, and current audit status.
2. Open `Full Paper Route` to read the objects in paper order.
3. Open `Proof Map` to inspect the dependency chain of the main theorem.
4. Open `Gaps and Audits` to review resolved and open proof risks.
5. Open `Literature and Imported Results` to inspect citation objects.

## Key Objects

```text
main.problem.control_question
main.claim.null_controllability
main.claim.partial_discrete_lr
main.claim.observability
main.proof.observability
main.claim.partial_null_control
main.proof.partial_null_control
main.claim.free_decay
main.proof.free_decay
main.proof.lr_iteration
main.issue.adaptedness
```

## Main Graph

```text
main.proof.lr_iteration proves main.claim.null_controllability
main.proof.lr_iteration uses main.claim.partial_null_control
main.proof.lr_iteration uses main.claim.free_decay
main.proof.lr_iteration uses main.calculation.lr_product_estimate

main.proof.partial_null_control proves main.claim.partial_null_control
main.proof.partial_null_control uses main.claim.observability

main.proof.observability proves main.claim.observability
main.claim.observability uses main.claim.partial_discrete_lr
```

## Splitting Strategy

- Long reusable claims become `math/claim` objects.
- Proofs become `math/proof` objects and point to claims through `proves`.
- Important equations become `display_as: equation` objects when they need durable references.
- Literature entries become `note/literature` objects and are connected through `cites`.
- Gaps, audit notes, and suspected issues become `issue` objects instead of hidden comments.
