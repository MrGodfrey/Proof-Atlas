In [[main.construction.partial_control_duality]], the observed-trace functional is extended by Hahn-Banach to a bounded functional on

$$
L^1_{\mathbb{F}}(0,T;L^2(\Omega;E_j)).
$$

By the Riesz representation theorem cited there from [[source.lue_zhang_2021]], this functional is represented by some

$$
u\in L^\infty_{\mathbb{F}}(0,T;L^2(\Omega;E_j)).
$$

Evaluating the representing functional on observed traces $\chi_{G_0}z$ of solutions to [[main.model.backward_adjoint_system]] gives

$$
\mathcal{L}(\chi_{G_0}z)
=
-\mathbb{E}\int_{\mathcal{M}}y_0z(0)
=
\mathbb{E}\int_0^T\int_{\mathcal{M}}u\chi_{G_0}z\,dt.
$$

This is exactly [[main.statement.partial_control_representation]].
