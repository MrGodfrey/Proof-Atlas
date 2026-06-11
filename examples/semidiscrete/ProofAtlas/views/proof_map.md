# Proof Map

This view records the proof route rather than reprinting the proof text. The main theorem is reached by a Lebeau-Robbiano iteration: kill low modes on short controlled intervals, let high modes decay on the following free intervals, and sum the resulting estimates.

## Target

![[main.claim.null_controllability]]{expanded}

The route proving this theorem is [[main.proof.lr_iteration|the Lebeau-Robbiano iteration]]. It depends on two reusable moves, [[main.claim.partial_null_control|partial null control]] and [[main.claim.free_decay|free decay]], rather than one monolithic proof.

## Main Route

The iteration is organized by the [[main.construction.lr_time_grid|time grid]]. On each controlled subinterval, partial null controllability gives [[main.eq.lr_low_mode_cancellation|low-mode cancellation]] and [[main.eq.lr_control_estimate|one-step control cost]]. On the following free subinterval, free decay suppresses the uncontrolled high modes. Repeating this controlled/free pair gives [[main.eq.lr_induction_product|the induction product]], and the final arithmetic is isolated in [[main.calculation.lr_product_estimate|the product estimate]].

![[main.construction.lr_time_grid]]{expanded}

![[main.claim.partial_null_control]]{expanded}

![[main.claim.free_decay]]{expanded}

## Estimate Bookkeeping

The product calculation packages the induction product and the exponent identities needed at the end of [[main.proof.lr_iteration|the main proof]]. Its role is bookkeeping: it explains why the repeated local estimates become the final exponential residual bound.

![[main.calculation.lr_product_estimate]]{expanded}

## Partial Control Branch

The proof of partial null controllability is [[main.proof.partial_null_control|a duality argument]]. Observability bounds the adjoint traces; Hahn-Banach and Riesz produce an adapted control; [[main.eq.partial_control_representation|the representation identity]] and [[main.eq.partial_control_ito_duality|Ito duality]] then force the finite-dimensional projection to vanish.

![[main.claim.observability]]{expanded}

## Observability Branch

Observability is the analytic input underneath partial control. The proof [[main.proof.observability|expands the adjoint in low modes]], applies the imported [[main.claim.partial_discrete_lr|partial discrete Lebeau-Robbiano inequality]], and converts [[main.eq.observability_spectral_bound|the pointwise spectral bound]] into an integral observation estimate.

![[main.claim.partial_discrete_lr]]{expanded}

## Why This Route

The older [[main.proof.naive_duality|naive duality route]] is blocked by [[main.issue.adaptedness|adaptedness]]. The current route avoids that problem by working on finite spectral windows first, then assembling interval controls through [[main.proof.lr_iteration|the iteration proof]].
