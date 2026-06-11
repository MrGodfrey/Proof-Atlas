With the grid and operator in [[main.setting.grid_operator]], the controlled semi-discrete problem reads

$$
\begin{cases}
d y+\mathcal{A}^{\mathcal{M}}y\,dt
=\chi_{G_0}u\,dt+a(t)y\,dW(t) & \text{in }Q,\\
y(t)=0 & \text{on }(0,T)\times\partial\mathcal{M},\\
y(0)=y_0 & \text{in }\mathcal{M}.
\end{cases}
$$

Here

$$
y_0\in L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))
$$

and

$$
u\in
L^\infty_{\mathbb{F}}
\bigl(0,T;L^2(\Omega;L^2_h(\mathcal{M}))\bigr).
$$

The control in the theorem is measured on $\mathcal{M}\cap G_0$ and acts only in the drift term through $\chi_{G_0}u\,dt$.

By the classical theory of stochastic differential equations, cited as Theorem 3.2 of [[source.lue_zhang_2021]], there exists a unique solution

$$
y\in
L^2_{\mathbb{F}}
\bigl(\Omega;C([0,T];L^2_h(\mathcal{M}))\bigr)
$$

to this equation.
