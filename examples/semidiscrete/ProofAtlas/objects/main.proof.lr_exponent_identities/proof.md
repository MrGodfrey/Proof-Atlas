The identities follow by substituting $T_j=K2^{-j\rho}$ from [[main.construction.lr_time_grid]].

The constant product is rewritten exponentially:

$$
C_5^{j_0+2}=e^{(j_0+2)\ln C_5}.
$$

The time-step product is

$$
\prod_{j=0}^{j_0+1}T_j^{-2}
=
\prod_{j=0}^{j_0+1}K^{-2}2^{2j\rho}
=
e^{-2(j_0+2)\ln K+\rho\ln 2\,(j_0+1)(j_0+2)}.
$$

The remaining exponential contribution is the sum of a finite geometric series and the finite sum of $2^{(2-\rho)j}$:

$$
\begin{aligned}
&\sum_{j=0}^{j_0+1}
C_4 2^j-(2^{2j+1}-3\tau)T_j\\
&=
C_4(2^{j_0+2}-1)
 +3\tau\sum_{j=0}^{j_0+1}T_j
 -2K\sum_{j=0}^{j_0+1}2^{(2-\rho)j}.
\end{aligned}
$$

Using the grid normalization $\sum_j T_j=T/4$ gives the stated identities, proving [[main.calculation.lr_exponent_identities]].
