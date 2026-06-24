Let $a_j,T_j$ be [[main.construction.lr_time_grid]], let $j^{\mathcal{M}}$ be the cutoff from [[main.setting.spectral_spaces]], and let $y$ be the controlled state of [[main.model.forward_semidiscrete_system]]. For all $j_0\leq j^{\mathcal{M}}$ and $h\leq h_2$,

$$
\begin{aligned}
&|y(a_{j_0+1})|^2_{L^2_{\mathcal{F}_{a_{j_0+1}}}(L^2_h(\mathcal{M}))}\\
&\leq
C_5^{j_0+2}
\prod_{j=0}^{j_0+1}
\left[
T_j^{-2}
e^{C_4 2^j-(2^{2j+1}-3\tau)T_j}
\right]
|y(0)|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}.
\end{aligned}
\tag{LIP1}
$$

The product in (LIP1) is simplified by [[main.calculation.lr_exponent_identities]] to obtain the residual estimate used in [[main.claim.null_controllability]].
