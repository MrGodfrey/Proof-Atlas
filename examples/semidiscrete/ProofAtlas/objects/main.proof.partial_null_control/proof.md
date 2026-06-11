We prove [[main.claim.partial_null_control]] using the duality construction [[main.construction.partial_control_duality]].

Let $u$ be the control represented by the extended functional in [[main.construction.partial_control_duality]]. We claim that this $u$ is the desired control.

Ito's formula gives the forward-adjoint identity [[main.eq.partial_control_ito_duality]].

Combining [[main.eq.partial_control_representation]] with [[main.eq.partial_control_ito_duality]], for any

$$
\eta\in L^2_{\mathcal{F}_T}(\Omega;E_j),
$$

we obtain

$$
\mathbb{E}\int_{\mathcal{M}}y(T)\eta=0.
$$

This implies

$$
P_jy(T)=0,\qquad \mathbb{P}\text{-a.s.}
$$

It remains to estimate the final norm. From Ito's formula and the Cauchy-Schwarz inequality,

$$
\begin{aligned}
\mathbb{E}\int_{\mathcal{M}}e^{-\tau T}|y(T)|^2
&\leq
\mathbb{E}\int_{\mathcal{M}}|y_0|^2
-2\mathbb{E}\int_Q e^{-\tau t}yA^{\mathcal{M}}y\,dt
+2\mathbb{E}\int_Q e^{-\tau t}y\chi_{G_0}u\,dt\\
&\quad
+\mathbb{E}\int_Q e^{-\tau t}|a(t)y|^2\,dt
-\tau\mathbb{E}\int_Q e^{-\tau t}|y|^2\,dt\\
&\leq
\mathbb{E}\int_{\mathcal{M}}|y_0|^2
-2\mu_1\mathbb{E}\int_Qe^{-\tau t}|y|^2\,dt
+2\mathbb{E}\int_Qe^{-\tau t}y\chi_{G_0}u\,dt\\
&\leq
\mathbb{E}\int_{\mathcal{M}}|y_0|^2
+\frac{1}{2\mu_1}
\mathbb{E}\int_Qe^{-\tau t}\chi_{G_0}|u|^2\,dt\\
&\leq
\frac{C_5 e^{C_4 2^j+\tau T}}{T^2}
|y_0|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}.
\end{aligned}
$$

This completes the proof of [[main.claim.partial_null_control]].
