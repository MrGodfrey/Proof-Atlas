This is the time decomposition used in [[main.proof.lr_iteration]].

Choose

$$
\rho\in(0,1).
$$

Let

$$
T_j=K2^{-j\rho},
\qquad j\in\mathbb{N}^+,
$$

where $K$ is chosen so that

$$
4\sum_{j=0}^{\infty}T_j=T.
$$

Let

$$
a_0=0,
\qquad
a_{j+1}=a_j+2T_j,
\qquad j\in\mathbb{N}^+.
$$

Then

$$
\bigcup_{j=0}^{\infty}[a_j,a_{j+1}]=[0,T/2].
$$

Each interval $[a_j,a_{j+1}]$ is split into:

1. a controlled part $(a_j,a_j+T_j)$, where [[main.claim.partial_null_control]] kills the low modes;
2. a free part $(a_j+T_j,a_{j+1})$, where [[main.claim.free_decay]] damps the remaining high modes.

The final segment $(a_{j^{\mathcal{M}}+1},T)$ is left uncontrolled and is handled by another application of [[main.claim.free_decay]].
