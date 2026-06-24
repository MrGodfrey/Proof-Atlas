This object records the pointwise spectral observation estimate used in [[main.proof.observability]]. The adjoint state $z$ solves [[main.model.backward_adjoint_system]] with terminal datum in $E_j$, and $z(t)=\sum_{\mu_k\leq 2^{2j}}z_k(t)\phi_k$ is the low-frequency expansion from [[main.setting.spectral_spaces]].

For every $t\in[0,T]$, the adjoint expansion and the partial discrete Lebeau-Robbiano input [[source.boyer_2010a.claim.partial_discrete_lr]] give

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
\tag{OSB1}
$$

The local estimate (OSB1) is combined with the weighted Ito monotonicity inequality in [[main.proof.observability]] to obtain the integrated observability estimate.
