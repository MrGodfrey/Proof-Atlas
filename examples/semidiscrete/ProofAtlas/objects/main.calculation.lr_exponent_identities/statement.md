For the time lengths $T_j=K2^{-j\rho}$ from [[main.construction.lr_time_grid]], the following identities hold. First, the constant factor in the product is rewritten as

$$
C_5^{j_0+2}=e^{(j_0+2)\ln C_5},
\tag{LEI1}
$$

where $C_5$ is the one-step constant appearing in [[main.calculation.lr_product_estimate]]. Second, the product of time-step factors is

$$
\prod_{j=0}^{j_0+1}T_j^{-2}
=
e^{-2(j_0+2)\ln K+\rho\ln 2\,(j_0+1)(j_0+2)},
\tag{LEI2}
$$

because $T_j=K2^{-j\rho}$. Finally, the exponential contribution from the one-step estimates is

$$
\begin{aligned}
&\sum_{j=0}^{j_0+1}
C_4 2^j-(2^{2j+1}-3\tau)T_j\\
&=
C_4(2^{j_0+2}-1)
+3\tau T/4
-\frac{2K(2^{(2-\rho)(j_0+2)}-1)}{2^{2-\rho}-1}.
\end{aligned}
\tag{LEI3}
$$

Together (LEI1)--(LEI3) reduce the product in [[main.estimate.lr_induction_product]] to the negative exponential bound used at the end of [[main.calculation.lr_product_estimate]].
