There exist $h_0>0$ and $C_1,C_2,C_3>0$ such that for all $0<h\leq h_0$ and all initial data $y_0$, there exists a control $u$ such that the solution $y$ of [[main.model.forward_semidiscrete_system]] satisfies the following three conclusions.

1. Low-mode exact extinction:

$$
P_{j^{\mathcal{M}}}y(T)=0,
\qquad
\mathbb{P}\text{-a.s.},
$$

where

$$
j^{\mathcal{M}}
=
\max\{j\mid 2^{2j}\leq C_1/h^2\}.
$$

2. Uniform control bound:

$$
|u|_{L^\infty_{\mathbb{F}}(0,T;L^2(\Omega;L^2_h(\mathcal{M}\cap G_0)))}
\leq
C_2
|y_0|_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}.
$$

3. Exponentially small terminal residual:

$$
|y(T)|_{L^2_{\mathcal{F}_T}(L^2_h(\mathcal{M}))}
\leq
e^{-C_3/h^2}
|y_0|_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}.
$$

The proof route is [[main.proof.lr_iteration]], which uses [[main.claim.partial_null_control]] and [[main.claim.free_decay]].
