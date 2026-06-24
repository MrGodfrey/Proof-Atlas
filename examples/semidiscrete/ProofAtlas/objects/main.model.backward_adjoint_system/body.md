This object fixes the backward adjoint equation used in the observability and duality arguments. The stochastic basis and adapted spaces are those of [[main.setting.probability_and_spaces]], the discrete operator $\mathcal{A}^{\mathcal{M}}$ and cylinder $Q$ are from [[main.setting.grid_operator]], and the terminal datum belongs to the spectral window $E_j$ from [[main.setting.spectral_spaces]].

For $\eta\in L^2_{\mathcal{F}_T}(\Omega;E_j)$, consider

$$
\begin{cases}
d z-\mathcal{A}^{\mathcal{M}}z\,dt
=-a(t)Z\,dt+Z\,dW(t) & \text{in }Q,\\
z(t)=0 & \text{on }(0,T)\times\partial\mathcal{M},\\
z(T)=\eta & \text{in }\mathcal{M}.
\end{cases}
\tag{BAS1}
$$

According to the classical theory of backward stochastic differential equations, cited as Theorem 4.2 of [[source.lue_zhang_2021]], there exists a unique solution

$$
(z,Z)\in
L^2_{\mathbb{F}}\bigl(\Omega;C([0,T];L^2_h(\mathcal{M}))\bigr)
\times
L^2_{\mathbb{F}}\bigl(0,T;L^2_h(\mathcal{M})\bigr)
\tag{BAS2}
$$

to (BAS1).

The observability estimate [[main.claim.observability]] is stated for (BAS1), and [[main.proof.partial_null_control]] uses (BAS1)--(BAS2) to construct the forward control by duality.
