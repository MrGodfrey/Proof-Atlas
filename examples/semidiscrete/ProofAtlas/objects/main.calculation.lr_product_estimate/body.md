This calculation is extracted from [[main.proof.lr_iteration]].

After applying [[main.claim.partial_null_control]] on $(a_j,a_j+T_j)$ and [[main.claim.free_decay]] on $(a_j+T_j,a_{j+1})$, one obtains

$$
\begin{aligned}
|y(a_{j+1})|^2_{L^2_{\mathcal{F}_{a_{j+1}}}(L^2_h(\mathcal{M}))}
&\leq
e^{-(2\mu_k-\tau)T_j}
|y(a_j+T_j)|^2_{L^2_{\mathcal{F}_{a_j+T_j}}(\Omega;L^2_h(\mathcal{M}))}\\
&\leq
C_5T_j^{-2}
e^{C_4 2^j-(2^{2j+1}-3\tau)T_j}
|y(a_j)|^2_{L^2_{\mathcal{F}_{a_j}}(\Omega;L^2_h(\mathcal{M}))}.
\end{aligned}
$$

By induction, for all $j_0\leq j^{\mathcal{M}}$ and $h\leq h_2$, one obtains [[main.eq.lr_induction_product]].

The elementary product computations used to simplify the exponent are [[main.eq.lr_exponent_identities]].

Recalling

$$
j^{\mathcal{M}}=\max\{j\mid 2^{2j}\leq C_1/h^2\},
$$

and using $\rho\in(0,1)$, one can choose $h_0\leq h_2$ and $C_6>0$ such that for $0<h\leq h_0$,

$$
|y(a_{j^{\mathcal{M}}+1})|^2_{L^2_{\mathcal{F}_{a_{j^{\mathcal{M}}+1}}}(L^2_h(\mathcal{M}))}
\leq
e^{-C_6 2^{(2-\rho)j^{\mathcal{M}}}}
|y(0)|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}.
$$
