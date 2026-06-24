This object isolates the low-mode cancellation used in the Lebeau-Robbiano iteration [[main.proof.lr_iteration]]. On the controlled subinterval $(a_j,a_j+T_j)$ from [[main.construction.lr_time_grid]], [[main.claim.partial_null_control]] gives a control $u_j$ such that

$$
P_j y(a_j+T_j)=0,
\qquad
\mathbb{P}\text{-a.s.}
\tag{LMC1}
$$

The local identity (LMC1) is the hypothesis needed to apply [[main.claim.free_decay]] on the following uncontrolled subinterval $(a_j+T_j,a_{j+1})$.
