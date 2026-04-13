# Bootstrap Join And Readiness Cluster

## Classified Fallback IDs

1. `FB-BS-001`
2. `FB-BS-002`
3. `FB-BS-003`
4. `FB-BS-004`
5. `FB-BS-005`
6. `FB-BS-006`
7. `FB-BS-007`
8. `FB-MG-001`

## Current Assessment

1. The highest-confidence violations are the runtime-surface bridge in
   [bootstrap-api.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/bootstrap/bootstrap-api.js#L557),
   the local recovery-snapshot reconstruction in
   [bootstrap-readiness-owner.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/bootstrap/owners/bootstrap-readiness-owner.js#L609),
   and the topology snapshot bridge in
   [join-readiness-evaluator.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/bootstrap/join-readiness-evaluator.js#L966).
2. The peer-mesh, local-ingress, and bootstrap-hint fallbacks are more likely
   real transitional bridges, but they still need one bounded owner and a
   burn-down plan.
3. The probe timeout fallback in
   [bootstrap-readiness-owner.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/bootstrap/owners/bootstrap-readiness-owner.js#L761)
   is the clearest irreducible boundary in this cluster today.
