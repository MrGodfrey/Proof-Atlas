For the forward state $y$ and adjoint state $z$, Ito's formula gives

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
$$

This identity is paired with [[main.eq.partial_control_representation]] to prove $P_jy(T)=0$ in [[main.proof.partial_null_control]].
