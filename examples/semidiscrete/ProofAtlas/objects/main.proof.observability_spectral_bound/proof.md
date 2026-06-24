For a fixed $t\in[0,T]$, expand the adjoint solution from [[main.model.backward_adjoint_system]] in the low-frequency basis from [[main.setting.spectral_spaces]]:

$$
z(t)=\sum_{\mu_k\leq 2^{2j}}z_k(t)\phi_k.
$$

Apply the partial discrete Lebeau-Robbiano inequality [[source.boyer_2010a.claim.partial_discrete_lr]] to this finite combination. Taking expectation preserves the inequality and gives

$$
\begin{aligned}
\mathbb{E}\int_{\mathcal{M}}|z(t)|^2
&=
\sum_{\mu_k\leq 2^{2j}}\mathbb{E}|z_k(t)|^2\\
&\leq
C_4 e^{C_4 2^j}
\mathbb{E}\int_{\mathcal{M}\cap G_0}
\left|
\sum_{\mu_k\leq 2^{2j}}z_k(t)\phi_k
\right|^2\\
&=
C_4 e^{C_4 2^j}
\mathbb{E}\int_{\mathcal{M}\cap G_0}|z(t)|^2.
\end{aligned}
$$

This proves [[main.estimate.observability_spectral_bound]].
