# Agent handoff — 2026-08-04 (FIRST LIVE PASS recorded 13:20)

**Run 2026-08-04T13-20-18: the MovieLens live lane PASSED end-to-end for the
first time** — schema admission, ratings load/split, distributed SQL, service
placement, and learned-affinity convergence (31s, all nine assessment
dimensions true). Terminals recorded SOLVED for
`movielens-nodes-priority-recovery-escape`,
`spread-fence-proven-local-leadership-read`, and
`raft-churn-sync-section-attribution`. Still open:
`publication-recovery-snapshot-starvation-relief` (host-scheduling budget
still exceeded: node-0 blocked 25.4%/20, total 124.8s/60, maxGap 11.0s/10 —
do NOT land it on the scenario probe; its statement needs the budget to
hold) and `replica-projection-stale-leader-route-resync` (latent wedge,
this run didn't hit it). Fan-out collapse is measurably live
(gate:projection build ratio 2.7→2.0).

This file is the durable takeover brief for the MovieLens 0.2-release critical
path. It captures what changed, what is measured, and the exact next moves, so
another agent can resume without re-deriving. Quest logs
(`solve/log/*.ndjson`) hold the full finding trail; this is the summary.

## Release goal
Drive to 0.2 per `docs/steering/agpl-feature-map.md` Phase 0.2. Blocker: the
MovieLens live lane (`npm run demo:movielens` →
`test-output/reports/movielens-lagrange-service-affinity-live-*.report.json`)
must reach PASS.

## Thermal policy (hard constraint)
Before any heavy/long run check `sensors`. Hold off if CPU Package ≥75°C
(high 80, crit 100) OR NVMe Sensor 2 ≥78°C. NVMe is the sensitive part. Serial
heavy runs only.

## Commits this session (2026-08-04, in order)
- `748c3032a` — research triangulation + DT phantom repro + synthesis epic.
- `dabf54f5d` — **Cut 2 step 1**: spread fence reads proven-local leadership.
- `8a2bd2b44` — **Step A**: raft-churn sync-section attribution instrumentation.
- `704b5e5c3` — reconcile/heal churn sites tagged (`storage_reservation_reconcile`,
  `stuck_transaction_heal`).
- `eaaa5e963` — snapshot builders tagged (`publication_recovery_gate_snapshot_build`,
  `priority_recovery_planning_projection_build`); new quest
  `publication-recovery-snapshot-starvation-relief` authored.
- `64949fa31` — **affinity root-cause fix**: demo scaffolds the
  `runtime.access.service.svc-movielens-topn` policy row.

## What is SOLVED / REFUTED (do not re-derive)
1. **Phantom spread-fence wedge: SOLVED, live-validated** (`dabf54f5d`). The
   service places `replicas=2` reliably; the old "not initially placed after
   600s" failure has not recurred since.
2. **Reconcile/heal-sweep dominance hypothesis: REFUTED by measurement**
   (run `2026-08-04T11-16-34`, rulesOut recorded on quest
   `raft-churn-sync-section-attribution`): with both sites tagged,
   `storage_reservation_reconcile` = 1333ms/381 runs and
   `stuck_transaction_heal` = 19ms/71611 runs of 231.5s total gap time
   (99.4% unexplained). Their log chatter correlated with gaps only because
   they run at 1s cadence. Do NOT defer/batch them as the starvation fix.
3. **The real starvation source: PROFILED** (run `2026-08-04T11-25-03` with
   `LAGRANGE_LOOP_GAP_PROFILE=1`, finding recorded): control-plane
   readiness/publication-recovery snapshot construction — synchronous
   better-sqlite3 statements (~20s self-time), GC (9.5s, allocation
   pressure), and the normalization cluster (~11s):
   `normalizeDistinctStringArray` (180 call sites),
   `normalizePriorityRecoveryStringList`,
   `buildPublicationRecoveryGateSnapshot`. Formation-phase gaps are
   better-sqlite3 pragma/exec from the ~91-replica synchronous create burst.
   NOTE: CL-033/CL-034 already memoize the planning projection/merge per
   publisher node — the open question (now measurable) is whether those memos
   miss continuously during churn.
4. **Learned-affinity stall (attributionRows=0): ROOT-CAUSED and fixed in the
   demo** (`64949fa31`, ground-truth diagnosis recorded on quest
   `movielens-nodes-priority-recovery-escape`): the runtime access policy
   gate (fail-closed since `1ea2eab98`, 2026-07-23) silently denied every
   attributed statement from `svc-movielens-topn` because the demo scaffolds
   `service_definitions` directly and never wrote the policy row. The
   coordination SQL survived via `executeInternal` (no issuingServiceId).
   Raft-log proof: 6 claims + 214 renews + 0 partial publishes,
   `computed_at=0` frozen, `service_partition_access` empty everywhere.
   The attribution unit test is misleading — it stubs authorizeStatement
   always-allow.
5. Previously refuted levers still stand: incumbent-stickiness flag,
   "delete the projection" cutover, scheduler-cadence theory, new-voter
   deferCandidacy, WebSocket-reconnect-storm-as-cause.

## Latent secondary issues (diagnosed, not yet fixed)
- **1000ms default parallel-query timeout** — the query-loop executor threads
  no `timeoutMs` (`parallel-query-coordinator.js:503`); a ~50k-row
  multi-partition scatter may not fit 1s. Expect intermittent `queryErrors`
  after the policy fix; measure before changing.
- **CDC WHERE-extraction failures on the coordination table**
  ("Could not extract WHERE clause from UPDATE SQL", 123x) — cache-fed views
  of the coordination table can go stale; did not cause the stall but can
  corrupt freshness checks later.
- The `2026-08-04T11-25-03` run rotated to a schema-admission timeout on
  `cache_stale_watermark` — blocker mix rotates run-to-run; treat one-run
  absence as weak evidence (operational-ground-truth).

## Quest state
- `publication-recovery-snapshot-starvation-relief` — NEW, owns the
  starvation fix (step B). Measurement rung landed (`eaaa5e963`): the two
  snapshot builders are sync-section-tagged; the next live run's siteDeltas
  give rebuild count/totalMs/maxMs (= CL-033/CL-034 memo miss rate). Next
  rung: pick the lever (memo-window widening / churn-tolerant reuse /
  cadence damping / allocation reduction) from that measurement; constraints
  require byte-identical readiness decisions and deterministic proof first.
- `raft-churn-sync-section-attribution` — purpose fulfilled (attribution
  honest via sections + profiler); doneWhen (live PASS) not met, blocker
  chain continues in the new quest. Findings + rulesOut recorded.
- `movielens-nodes-priority-recovery-escape` — parent; root-cause finding
  for the affinity stall recorded 2026-08-04T11:36.
- `spread-fence-proven-local-leadership-read` — step 1 landed + validated.

## Validation run 2026-08-04T11-59-24 (post access-policy fix) — RESULTS
- **Affinity fix VALIDATED**: attributionRows=4, weightedLocality=1.000,
  mergeCandidates=20, top10Correct=true (all previously 0/false).
- **New downstream frontier**: "learned-affinity did not converge within
  600000ms" — svc-movielens-topn stuck at 3 placed replicas vs pinned 2 for
  500+s (completion needs placements==2, distinct nodes==2, slot identities
  current). Suspected stuck move/remove tail; diagnosis in flight.
- **Snapshot rebuild cadence MEASURED** (finding on the starvation quest):
  `publication_recovery_gate_snapshot_build` ~2.12M executions / 30.2s
  (max 9ms), `priority_recovery_planning_projection_build` ~783k / 14.5s —
  ~1600/s sustained. Build rate ≈ call rate ⇒ the CL-033/CL-034 memos miss
  every call OR most callers bypass them (gate:projection = 2.7:1 says the
  gate has large non-projection callers). Memo-bypass census in flight.
- node-0 blocked% **11.3** (budget 20 — PASSED); still exceeded: total gaps
  151.7s (budget 60s) and maxGap 11.2s (budget 10s).
- Archived logs: scratchpad `run-11-59-24-logs/node-{0..4}.log`.

## Census + root-cause updates (13:00-14:30, findings recorded)
- **Call-path census (empirical)**: the memos work (~85% hit); the storm is
  FIXED STRUCTURAL FAN-OUT — one full readiness build = 11 projection +
  31 gate builds even with all memos hitting (~50 builds/s × ~42 calls).
  Callers re-project frozen outputs, build full gates to read `.active`
  (10×/build) or for observation equality (6×/build).
- **Latent bug found and FIXED** (`ed8286ad3`, lever 1): the epoch probe
  compared a node-inclusion-scoped read (null for excluded nodes) against
  the cached CLUSTER winner epoch → permanently stale → memos silently
  disabled for joining/recovering nodes during churn. Probe now takes
  `requireNodeInclusion` (memo guard passes false). dt-proven, verifier
  approved, guard tests green.
- **3-replica convergence ROOT-CAUSED** (finding on parent quest): NO third
  replica — the affinity move fully worked; the surplus is a PHANTOM
  `services` row for stopped r2@node-1 whose projection DELETE fails
  forever because node-1's canonical leader metadata for services-p1 went
  stale mid-churn and never heals ("No leader service found" ×666).
  Node-4 same blindness. Third instance of the epic's stale-funneled-read
  class. Open: why raft_role visibility never repairs; the projection
  owner retries the same doomed route with no escalation/re-sync.

## Lever-1 validation run 2026-08-04T12-42-16 — RESULTS
- Blocker mix rotated to a catastrophic churn window: node-0 blocked 47.6%,
  maxGap 23.5s; died at the schema-job operation-confirmation failure
  (the class from 10-36-40, absent in the two intervening runs).
- Build cadence still ~1400/s (757k gate / 266k projection) — as the census
  predicted: lever 1 removed only the excluded-node miss class; the
  structural 31×/build fan-out (lever 2) dominates.
- Run-to-run blocked% variance today: 39.2/26.4/37.8/11.3/47.6 — judge
  levers by build-cadence counts, not single-run budgets.
- Archived logs: scratchpad `run-12-42-16-logs/`.

## Next moves (in order)
1. **Lever 2** on `publication-recovery-snapshot-starvation-relief`:
   collapse the 11×/31× intra-build fan-out. READ THE 12:46 DESIGN-
   CONSTRAINTS FINDING FIRST — two semantic traps already discovered:
   (a) universal re-projection short-circuit is unsafe (admissionState is
   re-derived from the LIVE incarnation fence; a brand serves as-built
   admission unboundedly), (b) isPriorityControlPlaneRecoveryActive's
   merge is not provably equal to the builder's assembly on all inputs —
   property-matrix test BEFORE wiring any short-circuit. Non-enumerable
   Symbol brand (spread drops it — hand-merges correctly lose it);
   short-circuit before trackSyncSection so counts keep measuring true
   builds; merge-internal 5×/build needs CL-034b re-keying (own rung).
2. **Author the phantom-row / stale-leader-cache quest** (epic Cut-2-step-2
   shape): staleness detection + re-sync/escalation for the projection
   owner's delete route and the canonical leader metadata repair on
   non-seed nodes. Evidence: subagent diagnosis finding 2026-08-04T12:09
   on the parent quest. The 12-42-16 run's operation-confirm failure is
   plausibly the same stale-leader-metadata class on the write path —
   check node logs for 'No leader service found' correlation.
3. Latent: 1s parallel-query timeout; CDC WHERE-extraction on the
   coordination table.
4. Gap budget + affinity + convergence green → lane PASS → record quest
   terminals (`solve run` dry ingests doneWhen; memory "Solver terminal
   recording paths").
5. Commits are LOCAL (not pushed): 704b5e5c3, eaaa5e963, 64949fa31,
   ed8286ad3. Push only on Peter's go (pre-push runs the full gate).

## Guardrails
- Quest workflow canon: `node scripts/solve.js <verb>`. Source change →
  subagent verifier + Solver finding. Deterministic red-on-revert before live.
- Never raise ratchet baselines — shrink code instead.
- Commits need `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`,
  always with explicit pathspecs (shared checkout; a concurrent session may
  hold staged files).
- Live logs land in `data/examples/service-data-affinity-demo/node-*.log`
  and are WIPED each run — archive node-0.log to the session scratchpad
  before relaunching. Watchdog profiler env: `LAGRANGE_LOOP_GAP_PROFILE=1`.

## Key files
- Watchdog/sections: `src/diagnostics/event-loop-gap-watchdog.js`,
  `src/diagnostics/raft-churn-sync-sections.js`.
- Snapshot builders (tagged): `src/control-plane/publication-recovery-gate.js`,
  `src/control-plane/control-plane-readiness-priority-recovery-planning.js`;
  memo layers: `control-plane-readiness-publication-planning-snapshot.js`
  (CL-033), `control-plane-readiness-publication-planning-resolution.js`
  (CL-034).
- Access policy gate: `src/control-plane/owners/runtime-access-policy-owner.js`,
  `src/query/sql-query-engine-statement-execution.js:397`.
- Demo: `examples/service-data-affinity/run-affinity-demo.js`
  (policy scaffold in `deployQueryLoopService`).
- Reports: `test-output/reports/movielens-lagrange-service-affinity-live-*.report.json`.
