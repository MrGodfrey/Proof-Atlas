Let $\{\phi_j\}_{j=1}^{|\mathcal{M}|}$ be the discrete orthonormal eigenfunctions of $\mathcal{A}^{\mathcal{M}}$:

$$
\mathcal{A}^{\mathcal{M}}\phi_j=\mu_j\phi_j,
\qquad
0<\mu_1\leq \mu_2\leq \cdots\leq \mu_{|\mathcal{M}|},
\qquad
|\phi_j|_{L^2_h(\mathcal{M})}=1.
$$

For $j=1,\cdots,|\mathcal{M}|$, define the low-frequency spaces

$$
E_j=\operatorname{span}\{\phi_k\mid \mu_k\leq 2^{2j}\},
\qquad j\in\mathbb{N}.
$$

The corresponding $L^2$-orthogonal projector onto $E_j$ is denoted by $P_j$.

The mesh cutoff used in the main theorem is

$$
j^{\mathcal{M}}
=
\max\{j\mid 2^{2j}\leq C_1/h^2\}.
$$

This cutoff is imported into [[main.claim.null_controllability]], [[main.claim.observability]], [[main.claim.partial_null_control]], and the final iteration [[main.proof.lr_iteration]].
