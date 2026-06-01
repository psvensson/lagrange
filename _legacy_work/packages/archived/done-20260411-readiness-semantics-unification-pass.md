# Readiness Semantics Unification and Logic Simplification Pass

## Why

Future bootstrap, join, rejoin, and rebalance regressions can be reduced by
collapsing active-readiness and admission policy into one shared execution path.
Timeout and witness decision logic had still been split across too many callsites.

## Scope Basis

Roadmap and AGPL-in-scope rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Matrix Stability and Readiness Semantics Sprint](../../sprints/archived/done-2026-q2-matrix-stability-timeout-and-readiness-unification.md)

## In Scope

1. Define a single readiness-policy owner vocabulary for lifecycle convergence waits.
2. Consolidate timeout, retry, soft-fail, and hard-stop transitions behind one decision contract.
3. Remove or guard fallback-only branches so they cannot bypass shared policy semantics.
4. Carry one readiness-failure envelope with explicit mode, class, recoverability,
   progress, and terminal evidence fields.
5. Keep non-negotiable hard caps while forcing lifecycle exits through one normalized verdict shape.

## Out Of Scope

1. Production scheduler policy outside the distributed harness.
2. Transport-layer or membership-algorithm replacement.
3. New scenario DSL unrelated to readiness convergence.

## Invariants

1. One canonical owner vocabulary decides whether a wait loop may continue,
   soft-wait, or fail terminally.
2. No lifecycle path may emit terminal active success without the shared policy surface.
3. Timeout and non-timeout outcomes remain deterministic and explicitly tagged.
4. Any behavior differences are bounded to policy defaults and logged as evidence.

## Hotspots

1. `test/distributed/harness/cluster.js`
2. `test/distributed/harness/active-gate-closure-classification.js`
3. `test/distributed/harness/startup-readiness-evidence.js`
4. `test/distributed/harness/failure-bundle.js`

## Implementation Tasks

- [x] Introduce a shared readiness-failure envelope consumed by active wait paths.
- [x] Replace duplicated decision branches in cluster and failure-bundle code with helper calls.
- [x] Route witness and triage inputs through the shared classification model.
- [x] Remove direct substring-based terminal checks where structured evidence already exists.
- [x] Keep narrow compatibility helpers only where shared policy is intentionally retained.

## Outcome

Completed as the readiness-semantics unification pass. Failure classification,
triage serialization, scenario markdown, and timeout diagnostics now all speak in
one structured readiness vocabulary, which means the remaining matrix failures
are exposed as real runtime convergence bugs instead of report-shape disagreement.

## Validation

- [x] Policy-envelope regression coverage via startup witness tests
- [x] Failure-bundle regressions for readiness summary and markdown output
- [x] Focused lifecycle scenario reruns under local matrix configs

## Done When

1. Lifecycle readiness mode selection and admission outcome are produced from one owner vocabulary.
2. Timeout handling is bounded by explicit policy and no longer branch-diverges by report surface.
3. Witnesses carry enough evidence detail for delayed versus terminal outcomes.
4. Future timeout and failure tuning can be applied in one place with one set of defaults.
