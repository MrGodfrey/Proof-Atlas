This proof establishes [[main.claim.null_controllability]].

The time grid is [[main.construction.lr_time_grid]]. Choose $\rho\in(0,1)$, set $T_j=K2^{-j\rho}$, choose $K$ so that $4\sum_{j=0}^{\infty}T_j=T$, and set $a_0=0$, $a_{j+1}=a_j+2T_j$.

For any $0\leq j\leq j^{|\mathcal{M}|}$, consider the controlled system on $(a_j,a_j+T_j)$:

$$
\begin{cases}
d y+\mathcal{A}^{\mathcal{M}}y\,dt
=\chi_{G_0}u\,dt+a(t)y\,dW(t)
& \text{in }(a_j,a_j+T_j)\times\mathcal{M},\\
y(t)=0
& \text{on }(a_j,a_j+T_j)\times\partial\mathcal{M}.
\end{cases}
$$

By [[main.claim.partial_null_control]], for $0<h\leq h_2$, there exists

$$
u_j\in L^\infty_{\mathbb{F}}
\bigl(a_j,a_j+T_j;L^2(\Omega;E_j)\bigr)
$$

such that the solution $y$ to the system above with $u=u_j$ satisfies [[main.eq.lr_low_mode_cancellation]].

The same partial control step gives the subinterval control cost [[main.eq.lr_control_estimate]].

Also,

$$
\begin{aligned}
&|y(a_j+T_j)|^2_{L^2_{\mathcal{F}_{a_j+T_j}}(L^2_h(\mathcal{M}))}\\
&\leq
\frac{C_5e^{C_4 2^j+2\tau T_j}}{T_j^2}
|y(a_j)|^2_{L^2_{\mathcal{F}_{a_j}}(\Omega;L^2_h(\mathcal{M}))}.
\end{aligned}
$$

Next, introduce the system without control on $(a_j+T_j,a_{j+1})$:

$$
\begin{cases}
d y+\mathcal{A}^{\mathcal{M}}y\,dt
=a(t)y\,dW(t)
& \text{in }(a_j+T_j,a_{j+1})\times\mathcal{M},\\
y(t)=0
& \text{on }(a_j+T_j,a_{j+1})\times\partial\mathcal{M}.
\end{cases}
$$

By [[main.eq.lr_low_mode_cancellation]] and [[main.claim.free_decay]], noting that $\mu_k>2^{2j}$, we get

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

The induction and product computation are isolated as [[main.calculation.lr_product_estimate]]. They imply that for $0<h\leq h_0$,

$$
|y(a_{j^{\mathcal{M}}+1})|^2_{L^2_{\mathcal{F}_{a_{j^{\mathcal{M}}+1}}}(L^2_h(\mathcal{M}))}
\leq
e^{-C_6 2^{(2-\rho)j^{\mathcal{M}}}}
|y(0)|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))},
$$

and

$$
P_{j^{\mathcal{M}}}y(a_{j^{\mathcal{M}}+T_{j^{\mathcal{M}}}})=0,
\qquad
\mathbb{P}\text{-a.s.}
$$

Finally, consider the system on $(a_{j^{\mathcal{M}}+1},T)$ without control. Using

$$
j^{\mathcal{M}}=\max\{j\mid 2^{2j}\leq C_1/h^2\},
$$

and applying [[main.claim.free_decay]], there exists $C_7>0$ such that

$$
\begin{aligned}
|y(T)|^2_{L^2_{\mathcal{F}_T}(L^2_h(\mathcal{M}))}
&\leq
e^{-(2^{2j^{\mathcal{M}}+1}-\tau)T/2
-C_6 2^{(2-\rho)j^{\mathcal{M}}}}
|y(0)|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}\\
&\leq
e^{-C_7 2^{2j^{\mathcal{M}}}}
|y(0)|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}\\
&\leq
e^{-C_7 C_1/(4h^2)}
|y(0)|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}.
\end{aligned}
$$

Also,

$$
P_{j^{\mathcal{M}}}y(T)=0,
\qquad
\mathbb{P}\text{-a.s.}
$$

Choosing

$$
C_3=C_7C_1/2
$$

completes conclusions (i) and (ii) in [[main.claim.null_controllability]].

It remains to prove conclusion (iii), the control bound. From [[main.eq.lr_control_estimate]], [[main.eq.lr_induction_product]], and [[main.eq.lr_exponent_identities]], there exists $C_2>0$ such that

$$
\begin{aligned}
&|u|^2_{L^\infty_{\mathbb{F}}(0,T;L^2(\Omega;L^2_h(\mathcal{M}\cap G_0)))}\\
&\leq
\sum_{j=0}^{j^{\mathcal{M}}}
|u_j|^2_{L^\infty_{\mathbb{F}}(a_j,a_j+T_j;L^2(\Omega;L^2_h(\mathcal{M}\cap G_0)))}\\
&\leq
\sum_{j=0}^{j^{\mathcal{M}}}
\frac{C_4e^{C_4 2^j+\tau T_j}}{T_j^2}
|y(a_j)|^2_{L^2_{\mathcal{F}_{a_j}}(\Omega;L^2_h(\mathcal{M}))}\\
&\leq
C_2^2
|y(0)|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}.
\end{aligned}
$$

This completes the proof of [[main.claim.null_controllability]].
