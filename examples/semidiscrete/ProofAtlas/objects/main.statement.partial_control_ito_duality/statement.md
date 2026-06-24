Let $y$ solve [[main.model.forward_semidiscrete_system]], let the adjoint pair $(z,Z)$ solve [[main.model.backward_adjoint_system]], and let $\eta$ be the terminal datum for the adjoint equation. Then

$$
\begin{aligned}
\mathbb{E}\int_{\mathcal{M}}y(T)\eta
-\mathbb{E}\int_{\mathcal{M}}y_0 z(0)
&=
\mathbb{E}\int_Q(z\,dy+y\,dz+dy\,dz)\\
&=
\mathbb{E}\int_Q
\left[
z(-A^{\mathcal{M}}y+\chi_{G_0}u)
+y(A^{\mathcal{M}}z-aZ)
+ayZ
\right]dt\\
&=
\mathbb{E}\int_Q\chi_{G_0}uz\,dt.
\end{aligned}
\tag{PCD1}
$$

The identity (PCD1) is paired with [[main.statement.partial_control_representation]] to prove $P_jy(T)=0$ in [[main.proof.partial_null_control]].
