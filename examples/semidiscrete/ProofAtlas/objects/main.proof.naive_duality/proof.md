This object records the simplified example's failed route. It is not part of the paper proof.

The naive idea is to define the minimizer or control through final-time duality for the full target at time $T$ in a single step. Such a route risks producing a control that depends on $\mathcal{F}_T$-measurable terminal data rather than being progressively measurable on each interval.

The paper avoids this by using [[main.construction.partial_control_duality]] on finite spectral windows and then assembling controls interval by interval in [[main.proof.lr_iteration]].

The adaptedness audit is [[main.issue.adaptedness]].
