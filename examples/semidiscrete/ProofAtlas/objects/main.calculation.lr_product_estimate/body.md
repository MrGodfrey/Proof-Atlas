Let $a_j,T_j$ be [[main.construction.lr_time_grid]], let $y$ solve [[main.model.forward_semidiscrete_system]], and let $j^{\mathcal{M}}$ be the spectral cutoff from [[main.setting.spectral_spaces]]. After the controlled/free Lebeau-Robbiano steps in [[main.proof.lr_iteration]], the induction product estimate and exponent identities imply the following residual bound.

Recalling

$$
j^{\mathcal{M}}=\max\{j\mid 2^{2j}\leq C_1/h^2\},
\tag{LPE2}
$$

there exist $h_0\leq h_2$ and $C_6>0$ such that for $0<h\leq h_0$,

$$
|y(a_{j^{\mathcal{M}}+1})|^2_{L^2_{\mathcal{F}_{a_{j^{\mathcal{M}}+1}}}(L^2_h(\mathcal{M}))}
\leq
e^{-C_6 2^{(2-\rho)j^{\mathcal{M}}}}
|y(0)|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}.
\tag{LPE3}
$$

Thus (LPE3) is the terminal residual estimate produced by this local calculation.
