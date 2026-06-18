We prove [[main.claim.observability]].

Since $\eta\in L^2_{\mathcal{F}_T}(\Omega;E_j)$, write

$$
\eta=\sum_{\mu_k\leq 2^{2j}}\eta_k\phi_k,
$$

where $\{\eta_k\}_{\mu_k\leq 2^{2j}}$ are $\mathcal{F}_T$-measurable random variables.

The solution $(z,Z)$ to [[main.model.backward_adjoint_system]] can be written as

$$
z=\sum_{\mu_k\leq 2^{2j}}z_k\phi_k,
\qquad
Z=\sum_{\mu_k\leq 2^{2j}}Z_k\phi_k,
$$

where $(z_k,Z_k)$ satisfies

$$
\begin{cases}
d z_k-\mu_k z_k\,dt=-a(t)Z_k\,dt+Z_k\,dW(t)
& \text{in }(0,T)\times\mathcal{M},\\
z_k(T)=\eta_k & \text{in }\mathcal{M}.
\end{cases}
$$

Thanks to [[source.boyer_2010a.claim.partial_discrete_lr]], the adjoint expansion satisfies the pointwise observed low-frequency bound [[main.eq.observability_spectral_bound]].

From Ito's formula again, for all $t\in[0,T]$,

$$
\begin{aligned}
&\mathbb{E}\int_{\mathcal{M}}e^{\tau t}|z(t)|^2
-\mathbb{E}\int_{\mathcal{M}}|z(0)|^2 \\
&=
\mathbb{E}\int_0^t\int_{\mathcal{M}}
\left[
-2e^{\tau s}z(aZ-A^{\mathcal{M}}z)
+\tau e^{\tau s}|z|^2
+e^{\tau s}|Z(s)|^2
\right]ds \\
&=
\mathbb{E}\int_0^t
\sum\limits_{\mu_k\leq 2^{2j}}
(2\mu_k+\tau)e^{\tau s}|z_k(s)|^2\,ds
-2\mathbb{E}\int_0^t\int_{\mathcal{M}}e^{\tau s}azZ\,ds
+\mathbb{E}\int_0^t\int_{\mathcal{M}}e^{\tau s}|Z|^2\,ds \\
&\geq
2\mathbb{E}\int_0^t
\sum\limits_{\mu_k\leq 2^{2j}}
(2\mu_k+\tau)e^{\tau s}|z_k(s)|^2\,ds
-\mathbb{E}\int_0^t\int_{\mathcal{M}}e^{\tau s}|az|^2\,ds \\
&\geq 0.
\end{aligned}
$$

Combining this monotonicity inequality with [[main.eq.observability_spectral_bound]],

$$
\left[
\mathbb{E}\int_{\mathcal{M}}|z(0)|^2
\right]^{1/2}
\leq
\frac{1}{T}
\int_0^T
\left[
C_4 e^{C_4 2^j+\tau t}
\mathbb{E}\int_{\mathcal{M}\cap G_0}|z(t)|^2
\right]^{1/2}dt.
$$

This gives the stated observability estimate [[main.claim.observability]].
