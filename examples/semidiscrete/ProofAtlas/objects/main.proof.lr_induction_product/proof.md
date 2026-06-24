On each controlled subinterval, [[main.claim.partial_null_control]] gives the low-mode cancellation [[main.statement.lr_low_mode_cancellation]] and the local control estimate [[main.estimate.lr_control_estimate]]. On the following free subinterval, [[main.claim.free_decay]] damps the remaining high-frequency part.

Combining these two steps gives the one-step factor

$$
C_5T_j^{-2}
e^{C_4 2^j-(2^{2j+1}-3\tau)T_j}.
$$

Starting at $a_0=0$ and multiplying these factors along [[main.construction.lr_time_grid]], induction over $j=0,\dots,j_0+1$ gives

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
$$

This proves [[main.estimate.lr_induction_product]].
