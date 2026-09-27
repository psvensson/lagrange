# Verification REPLACE source-removal owner round 2 (2026-09-27)

Subject: integrated candidate
`b54f78ac2498e65453e6b876d4ce8555167c4ffb` against frozen production
`659b7db9511920931d87029c34e46ed9e02e2de6`.  The production diff was empty
and verification was read-only.

## Verdict

**REJECT.**  The exact-head lab cone passed on the lab fleet: controller
194/194 files plus `tv-dator` 3/3 files, **197/197 files and 5,213
assertions**, all bound to the integrated SHA.  Focused real-group,
node-removal and recovery suites were also green.  Adversarial verification
nevertheless found three closure-blocking owner defects and a malformed
distributed-answer authority defect.

## Blocking findings

1. **Terminal membership check-to-write race.**  A real-group reproducer
   committed `AddPeer(source)` at the repository terminal-persist seam after
   `decideReplaceCompletion` returned but before `REMOVED` was persisted.
   The final row was `REMOVED` while the source was a committed voter.
   `operation-workflow-transition-persistence.js` must maintain or revalidate
   the authority at the actual terminal write boundary.
2. **`FAILED` bypasses durable `REMOVING`.**  The REMOVE executor explicitly
   treats durable or late `FAILED` as permission to skip the `REMOVING` row,
   consensus-exit wait and retirement prerequisite.  This contradicts the
   absolute V2 ruling: removal never proceeds without durable `REMOVING`.
3. **T5-prime loses both fast wakes.**  The resend branch records a wait and
   executes the removal effect without installing the canonical waiter or
   its fallback.  Row and membership events are then lost and the operation
   stays `STOPPING` until K1 sweep.  It must install the same no-lost-edge
   waiter/fallback used by normal owner waits.
4. **Malformed membership answers authorize completion.**  A completed
   answer with string `"Infinity"` term/index values and an otherwise forged
   shape produced `source_retired`.  The distributed consumer must accept an
   exact bounded ordinary shape with primitive canonical fields, finite safe
   indices and canonical voter arrays, and fail closed otherwise.

## Recorded residuals and evidence repairs

- The deferred K2 safety retry expires after the 300-second operation budget
  during an uninitialized window; K1 still recovers it.  This remains a
  disclosed liveness/design residual.
- The impact registry omits the surviving-membership owner and critical
  currentness/scheduling/retire-route witnesses; its description is stale.
- Bootstrap-to-registry wake wiring lacks an exact-head direct witness.
- Seventeen of twenty-one P3 recovery cells remain honestly double-only.
- Applied-behind-commit is fail-closed in production and witnessed in the
  double, but lacks a composed real-group construction.

V1's revised currentness calculation itself passed, as did normal P2, S9,
RF=1 handoff, recovery, timer, idempotence and diagnostics paths.  Approval
is withheld until the four blocking mechanisms have red-on-old regressions,
the registry/comment defects are repaired, and a fresh independent closure
run approves the exact new SHA.
