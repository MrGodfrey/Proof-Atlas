This object fixes the forward equation used in the main theorem and in the interval-by-interval Lebeau-Robbiano construction. The stochastic basis and adapted spaces are those of [[main.setting.probability_and_spaces]], the domain and control set are those of [[main.setting.domain_and_coefficients]], and the grid operator is $\mathcal{A}^{\mathcal{M}}$ from [[main.setting.grid_operator]].

The controlled semi-discrete problem is

$$
\begin{cases}
d y+\mathcal{A}^{\mathcal{M}}y\,dt
=\chi_{G_0}u\,dt+a(t)y\,dW(t) & \text{in }Q,\\
y(t)=0 & \text{on }(0,T)\times\partial\mathcal{M},\\
y(0)=y_0 & \text{in }\mathcal{M}.
\end{cases}
\tag{FSS1}
$$

Here the initial datum and drift control satisfy

$$
\begin{gathered}
y_0\in L^2_{\mathcal{F}_0}(\Omega;L^2_h(\mathcal{M}))
\quad\text{and}\quad
u\in
L^\infty_{\mathbb{F}}
\bigl(0,T;L^2(\Omega;L^2_h(\mathcal{M}))\bigr).
\end{gathered}
\tag{FSS2}
$$

The control in (FSS1) is measured on $\mathcal{M}\cap G_0$ and acts only in the drift term through $\chi_{G_0}u\,dt$.

By the classical theory of stochastic differential equations, cited as Theorem 3.2 of [[source.lue_zhang_2021]], there exists a unique solution

$$
y\in
L^2_{\mathbb{F}}
\bigl(\Omega;C([0,T];L^2_h(\mathcal{M}))\bigr)
\tag{FSS3}
$$

to (FSS1). This is the state space used by [[main.claim.null_controllability]], [[main.claim.partial_null_control]], and [[main.proof.lr_iteration]].
