For all $t\in[0,T]$, the adjoint expansion in [[main.proof.observability]] and [[source.boyer_2010a.claim.partial_discrete_lr]] give

$$
\begin{aligned}
\mathbb{E}\int_{\mathcal{M}}|z(t)|^2
=
\sum_{\mu_k\leq 2^{2j}}\mathbb{E}|z_k(t)|^2
&\leq
C_4 e^{C_4 2^j}
\mathbb{E}\int_{\mathcal{M}\cap G_0}
\left|
\sum_{\mu_k\leq 2^{2j}}z_k(t)\phi_k
\right|^2 \\
&=
C_4 e^{C_4 2^j}
\mathbb{E}\int_{\mathcal{M}\cap G_0}|z(t)|^2.
\end{aligned}
$$

This is the pointwise estimate combined with the weighted Ito monotonicity inequality in [[main.proof.observability]].
