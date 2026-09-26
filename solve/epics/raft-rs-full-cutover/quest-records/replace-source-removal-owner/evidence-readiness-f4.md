# Evidence record: fix F4 (readiness planning publication), rounds 1-2

- Owner: readiness planning publication (control plane): the planning
  snapshot owner's deferred-snapshot contract, the shared node-liveness
  projection, the readiness row readers.
- Classification that named the owner: `slo-classification-instrumented-ab7669fd0.md`
  (Fact 1 owner-read currency, Fact 2 deferred denial inheriting
  `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`).
- Round 1 production: `b8f1ad0d0` + `2fe363ffe` (merged as `d46777ecf`);
  witnesses `8f754239b`, `5ff0fd7b1`, `7036ff218`. Acceptance:
  `slo-classification-instrumented-d46777ecf.md` (10/10 episodes under
  target, 0 floor deferrals). Verification: `verification-readiness-f4-round-1.md`
  (APPROVE WITH RECORDED DEFECTS F-1..F-7).
- Round 2 (branch `fixes/fix-f6-readiness-2026-09-27`, base `6c225f3f9` =
  production `d46777ecf`): red witnesses `3bf79f5dc` (F-1, F-6) and
  `3c0e6181e` (F-4); production `24edb4e41` (F-1, F-4); evidence
  `f3317ba68` (F-2, F-3) and the commit carrying this record (F-4 contract
  anchor, F-5).

## 1. Frozen claim

1. A current publication is never contradicted by a stale deferred answer
   served to any read kind afterwards with an unchanged token. Read kinds:
   the three `CONTROL_PLANE_PARTICIPATION_KIND` values times the decision
   dimension the read names; every kind reaches the one path
   `getControlPlaneParticipationSync` -> `getNodeReadinessSync` -> `readSync`
   (`readiness-planning-snapshot-owner.js`).
2. A deferral over an ELIGIBLE completed verdict on the read's dimension is
   evidence-absent: its reasons are `[planning_snapshot_refresh_pending]`
   only (`collectDeferredReasonCodeSet`, `readiness-planning-publication-contract.js`).
3. A deferral over a DENIAL on the read's dimension keeps that denial's
   reasons: a stale denial never becomes "no verdict".
4. (Mechanism of 1.) The shared node-liveness projection, the planning
   identity's liveness input, has one current view per node: caller-held
   evidence is recorded only when its row is strictly newer by heartbeat
   watermark, or the same view at the same watermark; everything else
   answers its caller only. An authoritative row read that is not an
   explicit success is unavailability, never "no rows".

## 2. Coverage model

Decisions: (D1) serve a completed snapshot or a deferral (`readSync`);
(D2) the deferral's reason set (`buildDeferredSnapshot`); (D3) whether the
shared liveness projection records caller-held evidence
(`isEvidenceRowCurrent`, `node-liveness-semantic-projection-owner.js`);
(D4) whether an authoritative row read is an answer
(`isAuthoritativeControlPlaneRowReadSuccessful`, `control-plane-system-table-gateway.js`).

State inputs and their cells:

| input | cells | witness |
| --- | --- | --- |
| read kind | routed_read, replica_operation_owner_read, control_plane_recovery (enumerated) | single-source tests 1, 3, 7 (every kind vs routed) |
| last completed verdict on the read's dimension | eligible (any informational reason) / denial (any reason) / none | deferred-denial tests 1-4 (all `LIFECYCLE_REASON` x `CONTROL_PLANE_READINESS_REASON` x 12 dimensions) |
| two dimensions of one verdict disagree, reads alternate on one owner key | eligible-then-denied / denied-then-eligible | deferred-denial test 5 (F-2) |
| caller-held row vs projected row (NEW dimension, F-1) | newer / equal watermark same content / equal watermark different status / equal watermark different connection state / no watermark over watermark / older / absent / watermark over watermark-less | single-source test 12 (projection owner anchor, all eight cells); service level tests 1-10 (publication-planning list read and single-row read for unavailable / older / equal-status / equal-connection / watermark-less) |
| authoritative row-read result shape | explicit success with rows / without rows / explicit failure / rows without outcome / error without outcome / none | row-read contract test (differential against the coordinator plus the contract's rows) |
| single-row owner read unavailability | typed throw of `NodesOwner.getNode` reaches the caller | single-source tests 2, 4, 6, 8, 10 (production `NodesOwner` over a fake gateway, F-6) |

Events and temporal relations: planning builds (cache row) interleaved with
publication-planning evaluations (authoritative rows) for three cycles;
a node's own liveness loss rotating the identity, then queue drains until
its rebuilt denial (single-source test 13, F-3).

## 3. Global planning-identity inputs (from the round-1 verification, section 1)

Every input that rotates the GLOBAL planning identity (every variant of
every owner key deferred until rebuilt):

- G1 revisioned table changes that change the direct global projection
  (endpoint node ids, latest membership publication, node ids, priority
  operations including `workflowStep`, priority partitions/services,
  service-fallback node ids); INVALID revision or classifier failure
  (fail-closed); re-baseline completion. The REPLACE's own
  `replica_operations-p1` step writes rotate here: real changes.
- G2 any node's shared liveness component change (readyNow, cluster
  membership freshness, repair freshness, derivation grace,
  clusterMembershipSemantics healthy/state). The Fact-1 channel; F-1 closed
  its equal-watermark and watermark-less residual.
- G3 capacity change without a node id; G4 cache / membership /
  owner-dependency replacement; G7 recovery epoch change without an owner
  key; G8 transport-topology fingerprint change.
- G5/G6 readiness feedback: a non-planning evaluation storing a snapshot
  whose recovery-epoch signature differs, and a planning build whose own
  signature changes.
- Live-veto terms outside the tracker: evidence age past
  `clusterMemberStaleHeartbeatMaxAgeMs`, the node's liveness identity,
  local transport drift, the publication guard.

## 4. Mutation table (round 2, head `f3317ba68` plus the F-4 contract anchor)

Scratch copy of the tree, one mutation at a time, the three F4 witness
files run (`scratchpad/f6-mutate.py`, output `scratchpad/f6-mutations.txt`):

| id | mutation | result |
| --- | --- | --- |
| M1 | deferral copies the completed reasons regardless of the verdict | RED: deferred-denial tests 1, 2, 4, 5 (33 assertions); single-source test 13 |
| M2 | projection records an absent caller-held row | RED: single-source tests 11, 12 |
| M3 | readNodeRows collapses an unavailable read to `[]` | RED: single-source test 1 (25); row-read contract (9) |
| M4 | deferral classification ignores the read's dimension | RED: deferred-denial tests 3, 4, 5 (29) |
| M5 | older caller-held row recorded | RED: single-source tests 3, 4, 11, 12 (39) |
| M6 | equal watermark, different content recorded (F-1) | RED: single-source tests 5-8, 12 (45) |
| M7 | deferred memo ignores the dimension (F-2) | RED: deferred-denial test 5 (5); was SILENT in round 1 |
| M8 | availability predicate `success !== false` (F-4) | RED: row-read contract (4); was SILENT in round 1 (then: the unreachable single-row guard) |
| M9 | watermark-less candidate current over a watermarked row (F-1) | RED: single-source tests 9, 10, 12 (10) |

The F-4 differential alone was silent under M8 (both readers consume the
one predicate); the contract anchor (each shape's rows written from the
contract statement) closes it.

## 5. Timing bound of the carve-out counting window (F-3)

The evidence-absent carve-outs (critical voter floor, formation placement,
system-table routing fail-open) count a node deferred over its last
ELIGIBLE verdict. For a node that loses liveness the window is
[liveness change detected -> that node's variant rebuild lands]. Detection
itself rotates the identity (G2), so the first read after it is an
evidence-absent deferral; the rebuild is queued with every other variant
the rotation invalidated and the queue drains one build per macrotask
(`maxItemsPerDrain: 1`). Bound: at most the builds queued at the first
deferred read, in drains; in steady state milliseconds, under event-loop
gaps 0.25-5 s (liveness slice-1 measurement), and unbounded in a rotation
storm where no rebuild lands current (the P1 currency class). Anchor
(single-source test 13): after the loss, the rebuilt denial of
`clusterMemberHealthy` landed in 4 drains of 5 queued builds, with
substantive reasons, and no second deferral followed. F4 extends this
pre-existing window (reason-less eligible snapshots) to eligible snapshots
carrying informational reasons, as ruling R-a intends.

Observed while writing the anchor: a node whose heartbeat and lease lapsed
stays `controlPlaneRecoveryEligible: true` in its rebuilt snapshot, so the
floor (which reads that dimension) counts it through the strict path, not
the carve-out. Pre-existing (memory: readiness lapsed-member flap, two
recovery-eligibility authorities); recorded below for its owner.

## 6. Residual

- Post-fix Fact 1: owner reads still deferred 10-150 ms after a current
  publication, 2-4 token rotations per 0.4-1.2 s episode
  (`slo-classification-instrumented-d46777ecf.md`). These follow real
  rotations (G1 step writes, G5/G6 feedback); the claim's "unchanged token"
  clause holds. Class: P1 currency (one rebuild per macrotask drain after
  each real rotation), not this owner. With Fact 2 closed, a `[rp]`
  deferral is counted by the carve-out like an eligible read, so it changes
  no verdict.
- The readiness-gated query-transport preflight feedback loop (readiness ->
  authoritative read unavailable (`deniedByReadiness`) -> missing row ->
  unhealthy self -> global rotation -> deferred reads) is broken at the
  reader: an unavailable list read answers from the row source. The gate
  itself remains.
- F-8 (new, round 2): the readiness feedback channel (G5/G6) has the same
  two-writer shape as F-1. A publication-planning evaluation over an
  authoritative row at the cache's watermark with another status, or a
  watermark-less row, stores a snapshot whose feedback signature differs
  from the planning build's; the two alternate `recordReadinessSnapshotChange`
  / `classifyPlanningBuildFeedback` and rotate the global identity every
  cycle (single-source tests 5 and 9 assert only the liveness half for
  these two rows). Reachable only while the cache lags a status write
  without a heartbeat bump, or with a watermark-less row. Owner decision:
  apply the forward-only rule to the feedback signature (record a
  non-planning evaluation's signature only when its row is current by the
  same rule), or accept it as bounded by the cache's deferred listener.
- Deferred memo thrash (F-2 hygiene): the memo holds one entry per owner
  key, so reads alternating dimensions (floor `controlPlaneRecoveryEligible`,
  routing `serveEligible`, placement's dimension) rebuild the deferral each
  time; the entry was introduced against a 9x per-build cost. Correct, not
  cached across dimensions.

## 7. Pre-existing items for their owners (F-7, R17)

- `DEFAULT_ROUTED_DIMENSION = 'serveEligible'` duplicates
  `CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE`
  (`readiness-planning-completion-admission-methods.js`, R06).
- The routing fail-open keeps its own copy of the evidence-absent reason
  set (`query-executor-partition-routing-snapshot.js`, R03; should consume
  `readiness-denial-classification.js`).
- `unwrapRowReadResult` returns a failure object without `rows` as a row
  (`system-metadata-owner-base.js`, `readByPrimaryKey` callers).
- A lapsed member stays `controlPlaneRecoveryEligible` (two
  recovery-eligibility authorities; section 5).
- `getAllNodeReadiness` labels the node rows "authoritative" whenever the
  authoritative read was requested, including after its fallback to the
  row source (`bulkNodeRowsAreAuthoritative`); harmless (the rows are
  consumed as preloaded rows) but the name no longer states the source.
