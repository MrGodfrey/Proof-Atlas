Let $h_1,C_1,C_4,j^{\mathcal{M}}$ and $\tau$ be as in [[main.claim.observability]].

There exist $h_2<h_1$ and $C_5>0$ such that for all $0<h\leq h_2$, $j\leq j^{\mathcal{M}}$, and

$$
y_0\in L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M})),
$$

there exists a control

$$
u\in L^\infty_{\mathbb{F}}(0,T;L^2(\Omega;E_j))
$$

such that the solution $y$ of [[main.model.forward_semidiscrete_system]] satisfies

$$
P_j y(T)=0,\qquad \mathbb{P}\text{-a.s.}
$$

Furthermore,

$$
|u|^2_{L^\infty_{\mathbb{F}}(0,T;L^2(\Omega;L^2_h(\mathcal{M}\cap G_0)))}
\leq
\frac{C_4 e^{C_4 2^j+\tau T}}{T^2}
|y_0|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}.
$$

The final state also obeys

$$
|y(T)|^2_{L^2_{\mathcal{F}_T}(L^2_h(\mathcal{M}))}
\leq
\frac{C_5 e^{C_4 2^j+2\tau T}}{T^2}
|y_0|^2_{L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))}.
$$
