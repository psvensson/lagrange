# Active-Gate Readiness Delay Classification and Triage Separation

## Why

Matrix waits were failing in ways that looked similar at a glance: bounded
admission timeout, admin snapshot timeout, and terminal convergence issues were
mixed in the same failure signal.

## Scope Basis

Roadmap and matrix rows in AGPL scope:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Matrix Stability and Readiness Semantics Sprint](../../sprints/archived/done-2026-q2-matrix-stability-timeout-and-readiness-unification.md)

## In Scope

1. Emit readiness-delay metadata in publication convergence summaries.
2. Add timeout-cause metadata to publication-failure classification signals.
3. Render readiness-delay metadata in scenario markdown and triage summary.
4. Distinguish snapshot timeout, snapshot reachability timeout, and non-timeout
   terminal causes in one stable shape.
5. Add regression coverage for startup-timeout witness payload and CL-004 versus
   CL-006 separation.

## Out Of Scope

1. Altering non-distributed startup protocol behavior.
2. Full operator UI work outside harness artifact output.
3. Production rollout or runbook policy changes.

## Invariants

1. Timeout-shaped evidence stays structured and deterministic.
2. Timeout recoverability and terminal outcomes remain explicitly represented.
3. Existing severity and confidence semantics in `failureClassification` are preserved.

## Hotspots

1. `test/distributed/harness/failure-bundle.js`
2. `test/distributed/harness/__tests__/failure-bundle.test.js`
3. `test/distributed/harness/cluster.js`

## Implementation Tasks

- [x] Normalize readiness-delay output in publication summary and triage output.
- [x] Add timeout and recoverability enrichment into failure-classification signals.
- [x] Update scenario markdown and triage rendering for delay evidence visibility.
- [x] Add playback-derived regression assertions for startup timeout witnesses.

## Outcome

Completed as the active-gate classification pass. Scenario summaries, triage
markdown, report JSON, and failure-bundle summaries now expose
`readinessFailure`, `activeGateReadinessDelay`, `failureAction`, and
`operatorRecommendation` instead of hiding timeout-shaped delay inside broad
publication-failure text.

## Validation

- [x] Playback-derived startup snapshot-timeout coverage
- [x] Playback-derived CL-006 publication-lag coverage
- [x] Artifact assertions proving timeout and terminal labels remain distinguishable

## Done When

1. Timeout metadata is stable in publication convergence output.
2. Failure-class signals include explicit readiness-delay and cause fields.
3. Matrix triage artifacts show timeout delay as a first-class signal.
4. Sprint-specific playback fixtures can diff load and stability behavior by timeout class.
