This object fixes the continuous comparison problem cited in [[main.problem.control_question]]. The probability space, adaptedness conventions, domain $G$, control region $G_0$, diffusion coefficients $\gamma^i$, and stochastic coefficient $a(t)$ are those specified in [[main.setting.probability_and_spaces]] and [[main.setting.domain_and_coefficients]].

The continuous controlled stochastic parabolic problem is

$$
\begin{cases}
d y-\sum\limits_{i=1}^{d}(\gamma^i y_{x_i})_{x_i}\,dt
=\chi_{G_0}u\,dt+a(t)y\,dW(t) & \text{in }(0,T)\times G,\\
y(t)=0 & \text{on }(0,T)\times\partial G,\\
y(0)=y_0 & \text{in }G.
\end{cases}
\tag{CP1}
$$

Here the initial datum and control belong to

$$
y_0\in L^2_{\mathcal{F}_0}(\Omega;L^2(G))\quad\text{and}\quad
u\in L^\infty_{\mathbb{F}}\bigl(0,T;L^2(\Omega;L^2(G))\bigr).
\tag{CP2}
$$

The null controllability problem for (CP1) consists in finding a control $u$ such that the solution $y$ satisfies

$$
y(T)=0\quad \text{in }G,\qquad \mathbb{P}\text{-a.s.}
\tag{CP3}
$$

This continuous problem was solved by [[source.lue_2011]] for a general bounded domain, diffusion tensor, and boundary conditions. The semi-discrete paper asks how much of the controllability target (CP3) survives after replacing (CP1) by [[main.model.forward_semidiscrete_system]].
