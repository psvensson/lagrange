# Timeout vs Non-Timeout Fault Taxonomy for Startup and Load Readiness

## Why

Recent matrix failures were clustered under broad admin timeout signals, which
masked recoverable delay versus non-recoverable failure and blocked accurate
repair policy.

## Scope Basis

Roadmap and matrix entries in AGPL scope:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Matrix Stability and Readiness Semantics Sprint](../sprints/done-2026-q2-matrix-stability-timeout-and-readiness-unification.md)

## In Scope

1. Define a shared readiness error taxonomy for startup and active-gate wait paths.
2. Distinguish `TIMEOUT`, `ADMIN_CONNECT_REFUSED`, `ADMIN_QUERY_TIMEOUT`,
   `SNAPSHOT_TIMEOUT`, `SNAPSHOT_COVERAGE_EMPTY`, `REACHABILITY_FLAP`, and
   `NO_PROGRESS` families.
3. Introduce explicit structured readiness output with recoverable and terminal tags.
4. Replace ad-hoc string matching in startup and admin projection code with the
   shared classifier.
5. Keep message-level context as payload only instead of the semantic gate.

## Out Of Scope

1. Changing core cluster membership algorithm behavior.
2. Adding new transport or protocol implementations.
3. Production config policy changes unrelated to startup and readiness classification.

## Invariants

1. Failure classification is deterministic for the same probe sequence.
2. No startup or admission decision depends on raw error substrings alone.
3. Recoverable and terminal classes remain mutually distinct and explicit.

## Hotspots

1. `test/distributed/harness/cluster.js`
2. `test/distributed/harness/active-gate-closure-classification.js`
3. `test/distributed/harness/failure-bundle.js`

## Implementation Tasks

- [x] Create shared readiness cause types and classification helpers in the harness.
- [x] Wire `cluster.js` and closure classification through the shared reason shape.
- [x] Emit normalized `readinessFailure` objects with explicit class, mode,
      recoverability, and evidence fields.
- [x] Update timeout and witness tests to assert structured reason codes.
- [x] Remove remaining fallback cases that collapsed everything into a generic timeout.

## Outcome

Completed as the readiness-taxonomy pass. Startup, snapshot, reachability, and
no-progress failures now flow through one structured `readinessFailure` model,
and final timeout exits no longer lose their terminal versus recoverable meaning.

## Validation

- [x] Startup witness regression coverage for CL-004 and CL-006 differentiation
- [x] Failure-bundle playback coverage for snapshot timeout versus terminal no-progress
- [x] Focused distributed reruns captured structured report output under
      `test-output/reports/rerun-*.report.json`

## Done When

1. Startup, admin, and snapshot readiness reasons are structured and share one classifier.
2. No startup active transition still relies on raw substring heuristics.
3. Triage output can distinguish timeout-shaped delay from explicit failure cause.
