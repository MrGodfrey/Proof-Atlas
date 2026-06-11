We prove [[main.claim.free_decay]].

Since $P_jy_0=0$, write

$$
y_0=\sum\limits_{i=k}^{|\mathcal{M}|}y_0^i\phi_i,
$$

where $y_0^i\in L^2_{\mathcal{F}_0}(\Omega)$ and

$$
k=\min\{\ell\mid 2^{2j}<\mu_\ell\}.
$$

The solution $y$ of [[main.model.forward_semidiscrete_system]] can be written as

$$
y(t)=\sum\limits_{i=k}^{|\mathcal{M}|}y^i(t)\phi_i,
$$

where $y^i$ satisfies

$$
\begin{cases}
d y^i+\mu_i y^i\,dt=a(t)y^i\,dW(t)
& \text{in }(0,T)\times\mathcal{M},\\
y^i(0)=y_0^i & \text{in }\mathcal{M}.
\end{cases}
$$

By Ito's formula,

$$
\begin{aligned}
&\mathbb{E}\int_{\mathcal{M}}e^{(2\mu_k-\tau)t}|y(t)|^2
-\mathbb{E}\int_{\mathcal{M}}|y_0|^2\\
&=
2\mathbb{E}\int_0^t
e^{(2\mu_k-\tau)s}
\sum_{i=k}^{|\mathcal{M}|}(-\mu_i)|y^i|^2\,ds\\
&\quad
+\mathbb{E}\int_0^t
(2\mu_k-\tau)e^{(2\mu_k-\tau)s}
\sum_{i=k}^{|\mathcal{M}|}|y^i|^2\,ds\\
&\quad
+\mathbb{E}\int_0^t
|a(s)|^2e^{(2\mu_k-\tau)s}
\sum_{i=k}^{|\mathcal{M}|}|y^i|^2\,ds\\
&\leq 0.
\end{aligned}
$$

Therefore,

$$
|y(t)|^2_{L^2_{\mathcal{F}_t}(L^2_h(\mathcal{M}))}
\leq
e^{-(2\mu_k-\tau)t}
|y_0|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))},
$$

which completes the proof.
