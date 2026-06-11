Let $N\in\mathbb{N}$ and write the spatial discretization parameter as

$$
h\triangleq \frac{1}{N+1}.
$$

For $i=1,\cdots,d$, consider grid points

$$
x_{i,j}=jh,\qquad j=1,\cdots,N.
$$

The multi-index set is

$$
\mathfrak{N}\triangleq
\left\{
k=(k_1,\cdots,k_d)\mid
k_i=1,\cdots,N,\quad i=1,\cdots,d
\right\}.
$$

For $k\in\mathfrak{N}$, define the grid point

$$
x_k\triangleq (x_{1,k_1},\cdots,x_{d,k_d})\in G.
$$

The Cartesian grid of $G$ is

$$
\mathcal{M}=\{x_k\mid k\in\mathfrak{N}\},
$$

and $|\mathcal{M}|=N^d$.

For any set of points $\mathcal{W}\subset\mathcal{M}$, the paper denotes the dual meshes by

$$
\mathcal{W}^*_i\triangleq \tau_{+i}(\mathcal{W})\cup \tau_{-i}(\mathcal{W}),
\qquad
\overline{\mathcal{W}}_{ij}\triangleq
(\mathcal{W}^*_i)^*_j=\mathcal{W}^*_{ij},
$$

where the translation operators are

$$
\tau_{\pm i}(\mathcal{W})
\triangleq
\left\{x\pm \frac{h}{2}e_i\mid x\in\mathcal{W}\right\},
$$

and $e_i$ is the $i$-th canonical vector of $\mathbb{R}^d$.

The discrete boundary is

$$
\partial_i\mathcal{W}\triangleq \overline{\mathcal{W}}_{ii}\backslash \mathcal{W},
\qquad
\partial\mathcal{W}\triangleq \bigcup_{i=1}^{d}\partial_i\mathcal{W}.
$$

Finally,

$$
\overline{\mathcal{W}}\triangleq \mathcal{W}\cup \partial\mathcal{W}.
$$
