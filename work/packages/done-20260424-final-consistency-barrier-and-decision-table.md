# Final Consistency Barrier And Decision Table

Status: done on April 24, 2026.

## Why

The rolling-restart final consistency blocker now has better mismatch
diagnostics, but the harness still compares observer leader maps before it has
modeled whether those observations are comparable. A stale observer, CDC lag,
and true leader-owner divergence can still collapse into the same
`leader_identities_disagree` shape.

This package executes the first recommendation from the April 24 review:
separate final leader consistency into a freshness barrier and one canonical
decision table before failure bundles classify the outcome.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Topology workflow stabilization`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Use snapshot revision metadata as a comparability barrier for final leader
   checks when that metadata is present.
2. Normalize final leader evidence across all observer nodes instead of only
   reporting the first mismatching pair.
3. Classify stale observer revision evidence separately from true topology
   mismatch evidence.
4. Query reachable final-consistency observers concurrently within each poll
   to reduce self-inflicted observation skew.
5. Preserve strict final ACTIVE readiness before final consistency.

## Out Of Scope

1. Adding a durable production Raft authority certificate to every control
   snapshot. That is split to
   [Control snapshot authority certificate](todo-20260424-control-snapshot-authority-certificate.md).
2. Reworking the admin read/repair owner path. That is split to
   [Admin observation mode and repair contract](todo-20260424-admin-observation-mode-and-repair-contract.md).
3. Deleting legacy message-string classification fallbacks. That is split to
   [Final consistency failure classifier cutover](todo-20260424-final-consistency-failure-classifier-cutover.md).
4. Weakening final leader-map consistency assertions.

## Shared Boundary Contract

- Semantic owner:
  final consistency adjudication after all restart and ACTIVE gates have
  closed.
- Operational authority:
  revision-bearing control snapshot observations until the production authority
  certificate package lands.
- Diagnostics-only observation:
  raw SQL fallback and stale local cache observations.
- Canonical contract:
  final consistency must first decide whether observations are comparable, then
  decide whether leaders agree, then emit one outcome and evidence set.
- Allowed consumers:
  `rolling-restart`, final consistency assertions, failure bundles, and matrix
  re-entry reporting.
- Prohibited reinterpretations:
  stale observer revision evidence must not be reported as proven topology
  divergence.

## Progress Grammar

1. `observer_revision_lag` means at least one observer has explicit snapshot
   revision evidence below the required or peer-visible revision.
2. `leader_map_mismatch` means comparable final observers report incompatible
   leader identities.
3. `final_consistency_ready` means final observers are comparable and leader
   evidence agrees.

## Residual Closure Inventory

- [x] Add final consistency revision-barrier classification.
- [x] Expand leader evidence to all observer nodes by partition.
- [x] Query final consistency observer states concurrently per poll.
- [x] Map stale observer revision diagnostics away from topology divergence.
- [x] Add focused harness tests.
- [x] Update sprint and rolling-restart package validation notes.

## Implementation Notes

`assertConsistency` now collects queryable observer states concurrently within
each poll. When a leader-map mismatch is observed and revision metadata proves
one observer is behind either the expected minimum revision or a peer-visible
revision, the mismatch is classified as `observer_snapshot_revision_lag` with
state `observer_revision_lag`.

Final consistency diagnostics now include all observer evidence for each
differing partition, including leader id, observation source, publication
epoch, snapshot revision, expected minimum revision, revision gap, revision
state, and resume token. Comparable leader mismatches still classify as
topology instability.

Failure bundles now map structured `observer_revision_lag` final consistency
diagnostics to cache-stale classification instead of topology instability.

## Validation

Executed on April 24, 2026:

1. `node --check test/distributed/harness/assertions-segment-3.js`
2. Result: passed.
3. `node --check test/distributed/harness/failure-bundle-segment-4.js`
4. Result: passed.
5. `node --check test/distributed/harness/__tests__/assert-consistency.test.js`
6. Result: passed.
7. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
8. Result: passed.
9. `node test/distributed/harness/__tests__/assert-consistency.test.js`
10. Result: passed, `35/35`.
11. `node test/distributed/harness/__tests__/failure-bundle.test.js`
12. Result: passed, `36/36`.
13. `git diff --check` on touched package, sprint, and harness files.
14. Result: passed.

## Done When

1. Focused final consistency tests pass.
2. Failure bundles classify revision-lag final consistency as cache/visibility
   lag while leaving comparable leader mismatches as topology instability.
3. The active rolling-restart package points to this split as the executed
   first-priority closure.
