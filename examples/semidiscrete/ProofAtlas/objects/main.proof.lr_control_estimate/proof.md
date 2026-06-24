Apply [[main.claim.partial_null_control]] on $(a_j,a_j+T_j)$, using the time length $T_j$ from [[main.construction.lr_time_grid]] and the spectral space $E_j$ from [[main.setting.spectral_spaces]].

The cost estimate in the partial null-control statement gives the same bound with $T$ replaced by $T_j$ and the initial datum replaced by $y(a_j)$. Therefore the selected control $u_j$ satisfies

$$
\begin{aligned}
&|u_j|^2_{L^\infty_{\mathbb{F}}(a_j,a_j+T_j;L^2(\Omega;L^2_h(\mathcal{M}\cap G_0)))}\\
&\leq
\frac{C_4e^{C_4 2^j+\tau T_j}}{T_j^2}
|y(a_j)|^2_{L^2_{\mathcal{F}_{a_j}}(\Omega;L^2_h(\mathcal{M}))}.
\end{aligned}
$$

This proves [[main.estimate.lr_control_estimate]].
