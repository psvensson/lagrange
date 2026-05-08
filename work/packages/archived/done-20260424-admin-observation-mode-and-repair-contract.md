# Admin Observation Mode And Repair Contract

## Why

The harness currently uses forced control snapshot repair as an escape hatch
for stale final observations. That is useful for diagnosis, but the admin
surface should expose explicit observation modes so readers know whether they
received a local cache view, fresh owner view, scheduled repair, forced repair,
deferred response, or failure.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Define explicit admin control-snapshot observation modes.
2. Move repair semantics behind the control-snapshot owner contract instead of
   hiding repair behind a generic read.
3. Preserve strict admission for critical convergence traffic under pressure.
4. Update diagnostics so every final consistency read names its observation
   mode.

## Out Of Scope

1. Changing final consistency semantics before the barrier package lands.
2. Adding broad background repair loops without ownership, bounds, and
   diagnostics.

## Priority

Priority 3 after authority certificate design, unless the next rolling-restart
rerun proves the forced repair path itself is the dominant blocker.

## Shared Boundary Contract

- Semantic owner:
  admin control-snapshot observation mode and repair execution.
- Canonical contract shape:
  every control snapshot returned through the admin query path carries an
  explicit observation mode naming whether the response came from local cache,
  fresh owner resolution, scheduled repair, forced repair, deferred repair, or
  failed repair.
- Operational authority:
  the control snapshot owner and authoritative repair policy decide read and
  repair mode; final consistency consumers only consume the named outcome.
- Diagnostics-only observation:
  SQL fallback snapshots may report `sql_fallback`, but must not imply owner
  repair or freshness.
- Prohibited reinterpretations:
  a forced repair flag or successful snapshot read must not be inferred as a
  fresh owner observation unless the observation mode says so.

## Residual Closure Inventory

- [x] Define named observation mode constants for admin control snapshots.
- [x] Attach observation mode diagnostics to local, shared-owner, scheduled
      repair, forced repair, deferred repair, and failed repair reads.
- [x] Carry the observation mode through distributed harness snapshot reads.
- [x] Include final consistency observation modes in diagnostics.
- [x] Add focused admin and harness tests.
- [x] Update sprint and rolling-restart package validation notes.

## Validation

Executed on April 24, 2026:

1. `node --check src/admin/admin-constants.js`
2. `node --check src/admin/admin-control-snapshot-class-part-1.js`
3. `node --check src/admin/admin-control-snapshot-class-part-2.js`
4. `node --check src/admin/admin-control-snapshot-class-part-7.js`
5. `node --check src/admin/admin-control-snapshot.js`
6. `node --check test/admin/admin-control-snapshot-response-contract.test.js`
7. `node --check test/distributed/harness/assertions-segment-1.js`
8. `node --check test/distributed/harness/assertions-segment-2.js`
9. `node --check test/distributed/harness/assertions-segment-3.js`
10. `node --check test/distributed/harness/__tests__/assert-consistency.test.js`
11. `node test/admin/admin-control-snapshot-response-contract.test.js`
12. Result: passed, `10/10`.
13. `node test/distributed/harness/__tests__/assert-consistency.test.js`
14. Result: passed, `37/37`.
15. `node test/distributed/harness/__tests__/failure-bundle.test.js`
16. Result: passed, `37/37`.
17. `node test/admin/admin-websocket-api.test.js`
18. Result: passed, `51/51`.
19. `node test/admin/admin-websocket-api.test-part-4.js`
20. Result: not a valid standalone entry point in this worktree; it failed
    before assertions because split-local helpers such as
    `createPopulatedCache` are only present in the aggregate test file.
21. `git diff --check` on touched package, sprint, admin, and harness files.
22. Result: passed.
