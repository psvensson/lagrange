# Matrix Stability and Readiness Semantics Sprint (AGPL)

## Goal

Reduce distributed matrix false negatives by separating timeout-based delay from
explicit non-recoverable failure conditions, while unifying boot, join,
rejoin, and rebalance admission evidence behind one readiness contract.

## Status

Closed after the readiness-classification and triage-unification batch plus a
focused distributed rerun pass.

## Completed Packages

1. [Timeout cause taxonomy and recovery-classification split](../../packages/archived/done-20260411-timeout-vs-fault-cause-taxonomy.md)
2. [Active-gate readiness delay classification and triage separation](../../packages/archived/done-20260411-active-gate-readiness-delay-classification.md)
3. [Progress-aware timeout policy with hard progress gates](../../packages/archived/done-20260411-progress-aware-timeout-policy.md)
4. [Boot, join, rejoin, rebalance readiness policy unification](../../packages/archived/done-20260411-lifecycle-readiness-policy-unification.md)
5. [Distributed triage visibility and operator feedback alignment](../../packages/archived/done-20260411-timeout-cause-feedback-and-actions.md)
6. [Matrix regression pack for timeout and failure separation](../../packages/archived/done-20260411-matrix-readiness-regression-pack.md)
7. [Readiness semantics simplification and one-owner unification pass](../../packages/archived/done-20260411-readiness-semantics-unification-pass.md)

## Outcome

1. Harness failures now emit one structured `readinessFailure` envelope with
   explicit `classCode`, `recoverability`, `mode`, and evidence instead of
   collapsing into broad timeout wording.
2. Failure-bundle, triage JSON, scenario markdown, and report JSON now surface
   readiness delay, failure action, and operator recommendation as first-class
   fields.
3. Startup witness regressions now lock the CL-004, CL-006, snapshot-timeout,
   and no-progress distinctions against structured reason objects.
4. The rerun set still fails, but the failures are now separable into three main
   system signatures instead of one ambiguous timeout bucket.

## Focused Harness Result

1. The dominant rerun signature is startup active-gate timeout with selected-seed
   snapshot reachability or snapshot coverage collapsing to `0/N` while
   publication convergence remains superficially `ready`.
2. A second signature reaches startup and load, then fails on post-load publication
   divergence with disagreeing published active-node sets.
3. A third signature reaches later scenario phases but times out on table-visibility
   and admin-control queries after owner-RPC and transport pressure collapse the
   control snapshot lanes.
4. The remaining unstable scenarios now point at runtime convergence ownership
   problems rather than missing timeout classification or missing operator
   context.

## Residual Systemic Problems

1. Selected-seed admin and snapshot readiness can stall indefinitely while other
   nodes continue publishing enough state to look partially converged.
2. Publication and readiness are still not owned by one recovery invariant once
   the cluster is under sustained load or partition pressure.
3. Recovery pressure still amplifies transport and discovery-repair failures,
   which then feed back into publication disagreement and delayed stabilization.

## Exit Check

Closed. The classification and unification batch landed, and the remaining
failures are now explicitly attributable to runtime convergence behavior instead
of ambiguous timeout handling.
