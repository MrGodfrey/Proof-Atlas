The continuous stochastic parabolic equation [[main.model.continuous_problem]] is known to be null controllable in the setting cited from [[source.lue_2011]].

The paper asks for a semi-discrete analogue in arbitrary spatial dimension $d \geq 2$, with time continuous, space discretized by a finite difference scheme, and only one adapted control acting in the drift of [[main.model.forward_semidiscrete_system]].

The concrete question is:

Can one construct an adapted control $u$ so that the solution $y$ of the semi-discrete stochastic parabolic system satisfies a $\phi$-null controllability conclusion, namely low spectral modes killed exactly and the whole terminal state exponentially small as $h \to 0$?

The answer asserted by [[main.claim.null_controllability]] is not full uniform null controllability of all discrete modes. It is the paper's mesh-sensitive $\phi$-null controllability statement:

1. $P_{j^{\mathcal{M}}}y(T)=0$ almost surely.
2. The control norm is bounded uniformly by the initial norm.
3. The terminal residual satisfies an exponential bound of order $e^{-C/h^2}$.
