# Control Snapshot Authority Certificate

Status: done on April 24, 2026.

## Why

Final consistency should eventually compare owner-backed leadership facts, not
only observer leader maps. Similar distributed systems attach a term, epoch, or
commit index to leadership observations so readers can distinguish a stale
view from true authority disagreement.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Define the partition leadership authority certificate shape.
2. Include partition id, leader node id, leadership term or topology epoch,
   membership/config epoch, and commit or snapshot revision in control
   snapshots.
3. Update final consistency to consume the certificate as authority evidence.
4. Add focused tests for stale observer versus authority-diverged cases.

## Out Of Scope

1. Harness-only timeout increases.
2. Treating local cache equality as authority proof when certificate evidence
   is unavailable.

## Priority

Priority 2 after the active barrier/decision-table package. This is the
durable production-side closure for final leader consistency.

## Shared Boundary Contract

- Semantic owner:
  partition leader authority as exposed by the control snapshot.
- Canonical contract shape:
  `partitionLeaderAuthority` keyed by partition id, with one certificate per
  partition carrying leader identity, topology epoch, membership epoch where
  known, and snapshot revision where known.
- Operational authority:
  control snapshot certificate fields; plain leader maps are observer
  projections.
- Diagnostics-only observation:
  raw SQL fallback leader maps and replica-role diagnostics.
- Prohibited reinterpretations:
  equal observer leader maps without a certificate must not be treated as
  authority proof.

## Residual Closure Inventory

- [x] Emit partition leader authority certificates from admin control
      snapshots.
- [x] Preserve snapshot revision metadata on certificates when the shared owner
      attaches a revisioned snapshot contract.
- [x] Extract and normalize certificates through distributed harness snapshots.
- [x] Let final consistency classify certificate-backed observer lag and
      authority divergence.
- [x] Add focused production and harness tests.
- [x] Update sprint and rolling-restart package validation notes.

## Validation

Executed on April 24, 2026:

1. `node --check src/admin/admin-control-snapshot-class-part-1.js`
2. `node --check src/admin/admin-control-snapshot-class-part-7.js`
3. `node --check src/admin/admin-control-snapshot.js`
4. `node --check test/admin/admin-control-snapshot-response-contract.test.js`
5. `node --check test/distributed/harness/assertions-segment-1.js`
6. `node --check test/distributed/harness/assertions-segment-2.js`
7. `node --check test/distributed/harness/assertions-segment-3.js`
8. `node --check test/distributed/harness/failure-bundle-segment-4.js`
9. `node --check test/distributed/harness/__tests__/assert-consistency.test.js`
10. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
11. `node test/admin/admin-control-snapshot-response-contract.test.js`
12. Result: passed, `6/6`.
13. `node test/distributed/harness/__tests__/assert-consistency.test.js`
14. Result: passed, `37/37`.
15. `node test/distributed/harness/__tests__/failure-bundle.test.js`
16. Result: passed, `37/37`.
17. `git diff --check` on touched package, sprint, admin, and harness files.
18. Result: passed.
