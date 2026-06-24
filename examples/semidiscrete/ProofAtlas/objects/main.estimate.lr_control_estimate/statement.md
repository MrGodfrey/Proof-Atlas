This object isolates the control-size estimate used in the Lebeau-Robbiano iteration. The time interval $(a_j,a_j+T_j)$ and the parameters $T_j$ are from [[main.construction.lr_time_grid]], the forward state is the solution of [[main.model.forward_semidiscrete_system]], and $u_j$ is the partial control supplied by [[main.claim.partial_null_control]] on the low-frequency space $E_j$ from [[main.setting.spectral_spaces]].

On $(a_j,a_j+T_j)$, the control $u_j$ satisfies

$$
\begin{aligned}
&|u_j|^2_{L^\infty_{\mathbb{F}}(a_j,a_j+T_j;L^2(\Omega;L^2_h(\mathcal{M}\cap G_0)))}\\
&\leq
\frac{C_4e^{C_4 2^j+\tau T_j}}{T_j^2}
|y(a_j)|^2_{L^2_{\mathcal{F}_{a_j}}(\Omega;L^2_h(\mathcal{M}))}.
\end{aligned}
\tag{LCE1}
$$

The bound (LCE1) is summed over $j$ in the last part of [[main.proof.lr_iteration]] to obtain the global control estimate in [[main.claim.null_controllability]].
