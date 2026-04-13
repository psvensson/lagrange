# Rebalancer Read-Models Cluster

## Classified Fallback IDs

1. `FB-RB-001`
2. `FB-RB-002`
3. `FB-RB-003`
4. `FB-RB-004`
5. `FB-RB-005`
6. `FB-RB-006`
7. `FB-RB-007`

## Current Assessment

1. The most likely guideline violations are the caller-tunable fallback knobs
   exposed by
   [replica-operation-repository.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/rebalancer/replica-operation-repository.js#L956)
   and consumed by
   [rebalance-coordinator.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/rebalancer/rebalance-coordinator.js#L756).
2. Reservation cleanup SQL fallback is an explicit recovery sweep and should
   stay isolated instead of being generalized.
3. The operation-owner legacy bridges are narrower and should be removed by
   row-shape convergence, not by another local shim.
