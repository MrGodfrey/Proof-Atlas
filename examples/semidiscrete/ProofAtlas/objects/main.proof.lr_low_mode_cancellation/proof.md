Apply [[main.claim.partial_null_control]] on the time-shifted interval $(a_j,a_j+T_j)$ from [[main.construction.lr_time_grid]], with the spectral window $E_j$ from [[main.setting.spectral_spaces]].

The conclusion of partial null controllability gives a control $u_j$ on this subinterval whose terminal state has zero projection onto $E_j$. Since $P_j$ is the projector onto that spectral window, this gives

$$
P_jy(a_j+T_j)=0,
\qquad
\mathbb{P}\text{-a.s.}
$$

This proves [[main.statement.lr_low_mode_cancellation]].
