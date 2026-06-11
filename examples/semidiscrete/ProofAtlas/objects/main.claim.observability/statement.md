For all $0<h\leq h_1$ and

$$
0<j\leq j^{\mathcal{M}}
=
\max\{j\mid 2^{2j}\leq C_1/h^2\},
$$

the solution $z$ of [[main.model.backward_adjoint_system]] satisfies

$$
|z(0)|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}
\leq
\frac{C_4 e^{C_4 2^j+\tau T}}{T^2}
|z|^2_{L^1_{\mathbb{F}}(0,T;L^2(\Omega;L^2_h(\mathcal{M}\cap G_0)))},
$$

where

$$
\tau
=
|a|^2_{L^\infty_{\mathbb{F}}(0,T;\mathbb{R})}.
$$

This statement uses the imported spectral inequality [[main.claim.partial_discrete_lr]] and is proved in [[main.proof.observability]].
