Apply Ito's formula to the product of the controlled forward solution $y$ from [[main.model.forward_semidiscrete_system]] and the backward adjoint solution $(z,Z)$ from [[main.model.backward_adjoint_system]].

The drift terms containing $A^{\mathcal{M}}$ cancel by duality, and the stochastic coefficient terms $-ayZ$ and $ayZ$ cancel. After taking expectations, the martingale contribution vanishes, leaving

$$
\begin{aligned}
\mathbb{E}\int_{\mathcal{M}}y(T)\eta
-\mathbb{E}\int_{\mathcal{M}}y_0 z(0)
&=
\mathbb{E}\int_Q(z\,dy+y\,dz+dy\,dz)\\
&=
\mathbb{E}\int_Q\chi_{G_0}uz\,dt.
\end{aligned}
$$

This proves [[main.statement.partial_control_ito_duality]].
