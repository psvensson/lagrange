# Operation dispatch completion owner cutover: live A/B

## Method

- Scenario: unchanged five-node
  `examples/service-data-affinity/run-affinity-demo.js`.
- Fixed source fingerprint: `bb6d8988260ac9ac`.
- Exact-cutover-reverted fingerprint: `92361311ca67c2c4`.
- The reverted tree differed by restoring
  `src/rebalancer/operation-workflow-dispatch-response-reconcile.js` from
  `HEAD`, which removes the canonical
  `retainDeliveredCreateProgress(...)` call while retaining the rest of the
  candidate tree.
- `npm run analyze:latent-blockers -- --markdown` and the statistical-run
  `npm run gate:preflight -- ...` completed before these launches. The
  preflight classified the retry/recovery cutover as a permitted hot-path A/B.
- A launch counted only after at least one runtime-service CREATE was emitted.
  Formation, schema, ratings-split, or auxiliary-schema failures before that
  seam are preserved below but excluded from N.

## Measuring samples

| Side | Report | Durable runtime operation result | Source CREATE sends / repeated target handlers | Stranded rows / held reservations | Aggregate harness outcome |
| --- | --- | --- | ---: | ---: | --- |
| fixed 1 | `fixed-evidence-run-1-owner-pass-downstream-stall.report.json` | ADD `7ca4530c` ACTIVE; ADD `3c8e7c2d` ACTIVE; REPLACE `replace-op-89b975` REMOVED; ADD `517db299` ACTIVE | 4 / 6 | 0 / 0 | FAIL after lifecycle closure: learned-affinity placement stalled for 300s at three replicas; locality 0.667 and correct top-10 |
| fixed 2 | `fixed-evidence-run-2-pass.report.json` | ADD `0ec46aa4` ACTIVE; ADD `aa4e6eec` ACTIVE | 2 / 0 | 0 / 0 | PASS; two replicas, correct top-10, and optimal locality |
| reverted 1 | `reverted-final-run-1-owner-pass-downstream-stall.report.json` | ADD `05ae9ce4` ACTIVE; REPLACE `replace-op-fe5ef1` REMOVED; ADD `322cee12` ACTIVE; ADD `45d30a49` ACTIVE | 4 / 2 | 0 / 0 | FAIL after lifecycle closure: learned-affinity placement stalled for 300s; two replicas, locality 1.0, correct top-10 |
| reverted 2 | `reverted-final-run-2-owner-pass-downstream-stall.report.json` | ADD `08951e96` ACTIVE; REPLACE `replace-op-8e2552` REMOVED; ADD `5b512bd3` ACTIVE; ADD `7f3f6abe` ACTIVE | 4 / 1 | 0 / 0 | FAIL after lifecycle closure: learned-affinity placement stalled for 300s; two replicas, locality 1.0, correct top-10 |

Every listed operation has exactly one canonical source CREATE send, advances
through CREATING, emits an owner completion, and is terminal in the durable
`replica_operations` SQLite snapshot. Repeated target handler invocations are
counted separately: fixed run 1 contains six idempotent repeats and still closes
all four operations and reservations. No measuring sample leaves a non-terminal
runtime operation or an unreleased runtime reservation. The fixed aggregate
error count is 1/2 and the reverted count is 2/2, but all three aggregate
failures occur in the downstream learned-affinity watch after operation closure.
This small A/B therefore provides engagement and non-regression evidence, not a
statistical claim that the conditional lost-handoff ordering occurred live.

`live/lifecycle-evidence.json` is the immutable evidence index. For every run it
binds the report SHA-256 and raw-archive SHA-256 to five boot fingerprint records,
the exact owner create/dispatch/transition/completion log records, target CREATE
handler counts, terminal SQLite operation rows, and released reservation rows.
The hash-bound raw archives remain at the retained paths recorded in that file.

The exact lost-handoff distinction is supplied by the deterministic production
seam proof: the candidate is green, exact source revert is red, and restoration
is green (`solve/changes/dt-prove/replica-dispatch-add-creating-owner-rearm.test.js-2026-07-22T01-38-42-139Z.json`).

## Excluded precondition launches

- Fixed: `fixed-final-precondition-ratings-split-gap.report.json` never split
  the ratings table and created no runtime-service operation.
- Fixed: `fixed-final-precondition-schema-pressure-gap.report.json` timed out in
  schema admission and created no runtime-service operation.
- Reverted: `reverted-final-precondition-priority-spread-gap.report.json` timed
  out in schema admission and created no runtime-service operation.
- Reverted: `reverted-final-precondition-deploy-admin-confirmation-gap.report.json`
  failed auxiliary-table deployment before runtime CREATE.
- Reverted: `reverted-final-precondition-ratings-schema-confirmation-gap.report.json`
  failed ratings-schema confirmation before runtime CREATE.

## Live-driven corrections before the final A/B

Earlier preserved candidate reports exposed three separate implementation
mistakes and were not counted as final samples:

1. `fixed-cadence-edge-run-2-fail.report.json` showed a retained wake scheduled
   at the operation-budget edge; retention now reuses the existing 250ms
   observed-progress cadence inside the unchanged budget.
2. `fixed-generic-cleanup-race-run-1-fail.report.json` showed a generic SERVICES
   observation clearing stronger delivered evidence; delivered evidence now
   dominates generic evidence and requires explicit terminal cleanup.
3. `fixed-cache-aligned-handoff-gap-run-1-fail.report.json` showed exact ACTIVE
   runtime service rows while durable operations stayed CREATING; the runtime
   owner now accepts only exact replica-id plus target-node ACTIVE cache proof.
   System operations retain the pre-existing authoritative-refresh contract.

## Interpretation

The final fixed and reverted live samples did not happen to reproduce the lost
executor-outcome handoff. That race is ordering-dependent, so a neutral live
A/B is expected to be possible. The fixed side nevertheless demonstrates that
the canonical owner path engages and closes durable work even with repeated
target CREATE handling, without lifecycle residue, budget leakage, timeout
widening, or aggregate correctness regression. The deterministic exact-ordering
proof establishes necessity.
