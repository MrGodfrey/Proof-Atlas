Let $d \geq 2$ and

$$
G=[0,1]^d \subset \mathbb{R}^d,
$$

with boundary denoted by $\partial G$. Let $G_0$ be a nonempty open subset of $G$.

The symbol $\chi_{G_0}$ denotes the characteristic function of $G_0$.

For a generic point $x=(x_1,\ldots,x_d)\in \mathbb{R}^d$, the paper uses

$$
y_{x_i}\equiv y_{x_i}(x)=\frac{\partial y(x)}{\partial x_i},
$$

where $x_i$ is the $i$-th coordinate.

The diagonal diffusion tensor is

$$
\gamma=(\gamma^1,\cdots,\gamma^d),
$$

with $\gamma^i(x)>0$. It satisfies

$$
\operatorname{reg}(\gamma)\triangleq
\operatorname*{ess\,sup}_{\substack{x\in G\\ i=1,\cdots,d}}
\left(
\gamma^i+\frac{1}{\gamma^i}+\sum_{j=1}^n |\gamma^i_{x_j}|^2
\right)<+\infty.
$$

The stochastic coefficient in the multiplicative noise is

$$
a(t)\in L^\infty_{\mathbb{F}}(0,T;\mathbb{R}).
$$

These assumptions feed both [[main.model.continuous_problem]] and [[main.model.forward_semidiscrete_system]].
