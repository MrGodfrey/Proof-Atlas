This object records the representation identity produced in [[main.construction.partial_control_duality]]. The adjoint state $z$ solves [[main.model.backward_adjoint_system]], the initial datum is $y_0$, and $\mathcal{U}$ denotes the observed-trace space generated in the duality construction.

The Hahn-Banach extension and Riesz representation step produce the identity

$$
\mathcal{L}(\chi_{G_0}z)
=
-\mathbb{E}\int_{\mathcal{M}}y_0z(0)
=
\mathbb{E}\int_0^T\int_{\mathcal{M}}u\chi_{G_0}z\,dt,
\qquad
\forall\,z\in\mathcal{U}.
\tag{PCR1}
$$

The representing control in (PCR1) lies in the low-frequency adapted control space

$$
u\in L^\infty_{\mathbb{F}}(0,T;L^2(\Omega;E_j)).
\tag{PCR2}
$$

The identity (PCR1), together with [[main.statement.partial_control_ito_duality]], is used in [[main.proof.partial_null_control]] to force the terminal projection $P_jy(T)$ to vanish.
