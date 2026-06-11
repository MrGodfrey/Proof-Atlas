The simplified example kept this as an open blocker: a control produced by a one-shot final-time duality argument can depend on terminal information and therefore fail to be adapted.

In the full paper decomposition, the actual partial-control construction [[main.construction.partial_control_duality]] works in the adapted spaces

$$
L^1_{\mathbb{F}}(0,T;L^2(\Omega;E_j))
\quad\text{and}\quad
L^\infty_{\mathbb{F}}(0,T;L^2(\Omega;E_j)).
$$

The Riesz representative is explicitly stated as

$$
u\in L^\infty_{\mathbb{F}}(0,T;L^2(\Omega;E_j)).
$$

For that reason this issue is marked `resolved` rather than `open`. It still blocks the historical route [[main.proof.naive_duality]], and remains useful as a regression check when modifying [[main.proof.partial_null_control]] or [[main.proof.lr_iteration]].
