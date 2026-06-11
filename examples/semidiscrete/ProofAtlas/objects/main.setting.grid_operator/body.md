For a grid set $\mathcal{W}$, let $\mathcal{L}(\mathcal{W})$ be the set of all functions defined on $\mathcal{W}$.

Define the average operator $A_i$ and difference operator $D_i$ from $\mathcal{L}(\overline{\mathcal{W}})$ to $\mathcal{L}(\mathcal{W}^*_i)$ by

$$
A_i(v)(x)\triangleq
\frac{1}{2}\bigl(\tau_{+i}v(x)+\tau_{-i}v(x)\bigr),
\qquad
D_i(v)(x)\triangleq
\frac{1}{h}\bigl(\tau_{+i}v(x)-\tau_{-i}v(x)\bigr),
$$

where

$$
\tau_{\pm i}v(x)\triangleq v\left(x\pm \frac{h}{2}e_i\right).
$$

The weighted grid Hilbert space is $L^2_h(\mathcal{W})$ with inner product

$$
\langle u,v\rangle_{L^2_h(\mathcal{W})}
\triangleq h^d\sum_{x\in\mathcal{W}}u(x)v(x).
$$

With these notations, set

$$
Q\triangleq (0,T)\times\mathcal{M}.
$$

The discrete elliptic operator is

$$
\mathcal{A}^{\mathcal{M}}y
\triangleq
-\sum\limits_{i=1}^{d}D_i(\gamma^i D_i y).
$$

This operator is the spatial part of [[main.model.forward_semidiscrete_system]] and [[main.model.backward_adjoint_system]].
