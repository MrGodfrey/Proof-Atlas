Assume $u\equiv 0$ in [[main.model.forward_semidiscrete_system]].

For all

$$
0\leq j<\frac{1}{2}\log_2\mu_{|\mathcal{M}|}
$$

and

$$
y_0\in L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))
\quad\text{with}\quad
P_j y_0=0,
$$

the solution $y$ of [[main.model.forward_semidiscrete_system]] satisfies

$$
|y(t)|^2_{L^2_{\mathcal{F}_t}(L^2_h(\mathcal{M}))}
\leq
e^{-(2\mu_k-\tau)t}
|y_0|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))},
\qquad
\forall\,t\in[0,T],
$$

where

$$
k=\min\{\ell\mid 2^{2j}<\mu_\ell\}.
$$

The proof is [[main.proof.free_decay]].
