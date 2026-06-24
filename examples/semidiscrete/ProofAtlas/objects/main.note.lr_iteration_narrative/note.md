The route proves [[main.claim.null_controllability]] through the selected proof [[main.proof.lr_iteration]]. The iteration alternates controlled intervals and free intervals: [[main.claim.partial_null_control]] kills the low spectral window, and [[main.claim.free_decay]] controls the high-frequency remainder.

The controlled part rests on [[main.claim.partial_null_control]]. Its selected proof [[main.proof.partial_null_control]] uses the duality construction [[main.construction.partial_control_duality]], the representation identity [[main.statement.partial_control_representation]], and Ito duality [[main.statement.partial_control_ito_duality]]. The key mathematical input inside this branch is [[main.claim.observability]].

The observability branch is where the route reaches its external boundary. The selected proof [[main.proof.observability]] uses [[source.boyer_2010a.claim.partial_discrete_lr]] as an accepted input, together with [[main.estimate.observability_spectral_bound]].

The bookkeeping is separated into [[main.calculation.lr_product_estimate]]. That calculation combines the one-step control estimate [[main.estimate.lr_control_estimate]], low-mode cancellation [[main.statement.lr_low_mode_cancellation]], and free decay over [[main.construction.lr_time_grid]] to obtain the terminal residual bound in [[main.claim.null_controllability]].
