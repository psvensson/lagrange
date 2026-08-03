# Handoff: native call-cell invocation (minimal-deployment-call-cell-invocation)

Date: 2026-08-02. Repo HEAD: `6e361c1a6`. Base commit for all diffs below: `6e361c1a6d74a4dafde51c2ffbc3a116d7b38962`.

## Where the work actually lives (read this first)

The implementation is **complete and verified in the working tree**, but the
Solver quest log is in a sealed-integrity knot. **A new session should NOT try
to fight the solver log byte-by-byte.** The fastest honest path is:
**park the current parent quest, open a successor with `--from`, and use
`inherit-candidate` to carry the already-verified bytes into the child cleanly.**
See "Recommended next move" at the bottom.

## Verified-good state (do not lose this)

- File-size ratchet: **28/28 source** (green), 21/21 test. Keep it green.
- Scenario harness `node scripts/checks/run-minimal-deployment-call-cell-invocation-scenarios.js`
  → **PASS 8/8 guard files** (113 assertions). Latest report:
  `test-output/reports/minimal-deployment-call-cell-invocation-2026-08-02T17-45-22-045Z.report.json`.
- Runtime guard tests green: call-cell-worker 46/46(+reduce-coordinator+batch = 55/55),
  request-path regression 15/15, driver contract 82/82.
- eslint clean on all candidate src files.
- Fresh independent verifier **APPROVED the current (post-extraction) bytes**:
  session `ses_03c740282ffeP9X5wwy2SVhxLj`, aggregate fingerprint
  `sha256:771e6a9ebd4b1644e99630e6eb78f8df2ed48cf7b6f178c332e3afb3802f80d7`
  (recomputed byte-for-byte over the 19-path candidate, behavior-preserving
  extraction confirmed). An earlier verifier `ses_03c82081fffeakkbP014XMkb1e`
  approved the pre-extraction bytes with the SAME aggregate fingerprint
  (fingerprint is over file contents, and the extraction is content-neutral).

## The two quests

1. **`minimal-deployment-call-cell-invocation`** (parent, runtime+ingress) —
   status SOLVED but landing is blocked. 4 frontiers: call-invocation-ingress,
   -routing, -runtime, -reduce. Attempts recorded: attempt-1.diff (runtime, on
   frontier call-invocation-reduce, event idx 9), attempt-2.diff (ingress,
   idx 13/17).
2. **`minimal-deployment-call-cell-invocation-orchestration`** (child,
   wiring/invoker layer) — status open. Was rejected once (dead-code wiring +
   wire-contract contradictions: adapter returned bare string vs invoker needing
   `{componentResult, partials, replicaId}`; receiver hardcoded exportName 'run'
   and dropped payload.batch). Wire-contract fixes landed as its attempt-2
   (8/8 green). The **production-wiring rejection ground is still UNFIXED and
   deliberately deferred** (see below).

## The knot (why landing is blocked) — the key lesson

`attempt-1.diff` was recorded (sealed) with identity
`sha256:00e94d59…` (size 101040) = the **pre-extraction** bytes, where the
driver's call-cell logic was INLINE in `wasm-component-driver.js`. After that
recording, the driver call-cell logic was **extracted** into
`src/runtime/call-cell-driver-invoke.js` to satisfy the 800-line file-size
ratchet. That changed `attempt-1.diff` on disk to `sha256:22b6a9ab…`
(size ~102704, includes the new module). The terminal audit
(`acceptedChangeArtifactViolations` in `scripts/solve/integrity.js`) recomputes
the diff-artifact file hash and flags
`accepted changeRef artifact identity changed: …/attempt-1.diff`.

This is a **content-hash mismatch on the .diff file itself**, NOT a formal
violation event — so `replacesViolationIds` cannot clear it, and
`correct-attempt-base` refuses it ("sealed change artifact has drifted" /
"an exact verifier receipt already covers the attempt"). Re-recording a fresh
accepted attempt (`solve attempt` / `step`) is currently **blocked by
scope-pressure** ("changed-file count exceeds the limit; land or split first").

### Lesson: never edit a sealed .diff artifact after recording
The extraction should have been done as a **new attempt** (or the file-size
refactor done before the first recording), not by mutating the already-sealed
`attempt-1.diff`. Once a changeRef is recorded with `integrityAccepted`, its
bytes are sealed.

## Critical recovery note (a git mistake to avoid repeating)

While attempting to "restore the pre-extraction bytes" I ran
`git checkout -- src/runtime/wasm-component-driver.js src/runtime/call-cell-driver-invoke.js`.
Because `call-cell-driver-invoke.js` is **untracked-by-HEAD but staged-added**,
`git checkout --` EMPTIED it (no HEAD version) and reverted the driver to
committed state — destroying both. Recovery was done by:
`rm -f src/runtime/call-cell-driver-invoke.js` then
`git apply --include='…wasm-component-driver.js' --include='…call-cell-driver-invoke.js' solve/changes/minimal-deployment-call-cell-invocation/attempt-1.diff`.
The sealed diff is the source of truth and restored the verified state.
**Lesson: `git checkout --` / `git restore` on staged-new files is destructive;
recover from the sealed .diff via `git apply --include=`, not from git.**

## Production-wiring gap (the deferred verifier-rejection ground)

Nothing in the production bootstrap assembles the call-cell path:
- `CallCellInvoker` / `createCallCellRoutingSurface` are not wired in
  `src/bootstrap/bootstrap-api.js`.
- `callBindingRouteResolver` is not injected into `RuntimeServiceHandler`
  (`src/bootstrap/shared/runtime-service-handler-setup.js`).
- coordination-store DDL for the reduce lease/snapshot is not created.

This is a **separate, larger concern** (bootstrap composition + invoker
assembly + multi-node reduce evidence) and was deliberately deferred. It needs
its **own quest**, not a bolt-on.

## Recommended next move (new session)

1. Verify the working tree is still the verified state:
   `npm run audit:file-size` (want 28/28), run the scenario harness (want 8/8),
   `git rev-parse HEAD` (want 6e361c1a6).
2. `node scripts/solve.js park --id minimal-deployment-call-cell-invocation`
   (EXHAUSTED, scope/amend budget) with a reason referencing the sealed-artifact
   drift.
3. `node scripts/solve.js new … --from minimal-deployment-call-cell-invocation`
   to open a successor that re-seals the SAME post-extraction work cleanly.
4. `node scripts/solve.js inherit-candidate --id <child> --from minimal-deployment-call-cell-invocation`
   — it re-records the parent's approved candidate into the child and REBUILDS
   the approval against the child's own candidate projection; if the fingerprint
   matches (`sha256:771e6a9e…`), it carries the approval without re-running
   verification. (Read `scripts/solve/inherit-candidate.js` header first —
   it copies artifacts as `inherited-<parent>-attempt-N.diff` and does NOT
   support commit: changeRefs.)
5. Land the child with verifier `ses_03c740282ffeP9X5wwy2SVhxLj`,
   fingerprint `sha256:771e6a9ebd4b1644e99630e6eb78f8df2ed48cf7b6f178c332e3afb3802f80d7`.
6. Open a THIRD quest for the production wiring (bootstrap + RuntimeServiceHandler
   injection + multi-node reduce evidence) — the remaining rejection ground.
7. The orchestration child quest still needs its own verify+land once the parent
   chain is resolved.

## Repo gate reminders (cost time every session)

- Scope pressure: 25 files / 6 owner areas / 262144 bytes per attempt.
- File-size: `npm run audit:file-size`, src cap 800 lines (ratchet), test 1500.
- Literal guideline: `node scripts/check-guideline-literals.js` — no raw strings
  outside named frozen consts.
- tap helper misparses `assert.rejects` validation fns as SKIP → use `t.rejects`
  or `.then(ok, err)`.
- amend limit is 2 per quest (then park + successor via `--from`).
- Contract quests touching `architecture/` are `class: product`; product-quest
  diffs may not contain `solve/` workflow paths (except own-quest bookkeeping).

---

## UPDATE 2026-08-02 (evening session): parent chain RESOLVED, orchestration REJECTED

- **Successor `minimal-deployment-call-cell-invocation-v2` LANDED** as commit
  `5c374e6c8` (fingerprint `sha256:771e6a9e…`, verifier ses_03c740282ffeP9X5wwy2SVhxLj).
  Route taken: candidate-scope approval re-record on the parent (inherit-candidate
  requires `candidateApproval`, and only scope `candidate|both` counts — the recorded
  `aggregate`-scope approvals did not) → `new --from` (fix the retargeted scenario
  args back to the parent scenario before first execution!) → `run --max 1` declares
  + records the terminal → `inherit-candidate` → scope precommit (owners=7>6) cleared
  via `solve override --guard scope` + one override-admitted re-admission attempt
  (same diff, byte-identical union → identical gate message) → re-record candidate
  approval → `land` (committed with pathspecs).
- Also: `src/runtime/call-cell-driver-invoke.js` had lost its `git add -N` after the
  recovery; without it the candidate cannot fingerprint ("cannot fingerprint
  untracked paths").
- **Parent quest retired**: altitude reflection + parked routing/runtime frontiers
  (exhausted, operator) citing the sealed-artifact drift and the v2 supersession.
- **Third quest drafted** (not yet sealed): `minimal-deployment-call-cell-production-wiring`
  (bootstrap assembly + RuntimeServiceHandler injection + coordination DDL +
  multi-node reduce evidence).
- **Orchestration quest: fresh independent verification REJECTED the 9-path candidate**
  (`sha256:e7811ba4…`, verifier subagent:a16a6517f825e7f7f, recorded on the log).
  Key grounds: (1) response-side wire contract contradictory — receiver returns
  `componentResult`, adapter reads `delivery.componentResponse`, so the sanctioned
  path always throws on success; (2) CallCellStatementAdapter/routing-surface have
  zero executable evidence — the live test uses a bespoke in-test adapter;
  (3) guest partial-shape translations exist only in the test shim; (4) reduce lease
  never acquired by the candidate (test-only coordinator wrapper with fabricated
  replica ids); (5) `Date.now()` invocationId collides under concurrency (UUID
  contract helper unused); (6) live-evidence engine has partition execution stubbed.
  The fix round is real implementation work and partially overlaps the deferred
  production-wiring scope — decide fix-here vs re-decompose before attempting.

## FINAL 2026-08-02 (late evening): orchestration REPAIRED and LANDED

- The rejected orchestration candidate was repaired in place and landed as
  **`minimal-deployment-call-cell-invocation-orchestration-v2` → commit `e723e30f5`**
  (17 paths, fingerprint `sha256:36e6a27d…`, verifier subagent:a16a6517f825e7f7f
  re-verified all seven rejection grounds dead and APPROVED).
- Key repairs: adapter reads `componentResult` (new fail-closed guard test);
  invoker seeds coordination rows (`seedInvocation`, new coordinator INSERT
  surface) + acquires each slot lease + publishes the EMITTED partials
  (numeric aggValue JSON, `normalizeEmittedPartialEntries` fail-closed) + UUID
  invocation identity + maps gate-merged tuples for reduce; guest emits numeric
  partials; live test drives the fully real path (routing-surface factory,
  real dispatcher, real RuntimeServiceHandler via registerWithRouter, real
  driver invokeCallCell over the WASI worker, real per-partition SQLite behind
  the real query executor). Driving the real path exposed + fixed a latent
  receiver bug (raw `call` instead of `admittedCall` broke the pre-invoke
  route re-assert).
- The OLD orchestration quest hit a **mixed-base knot** (v2's landing moved
  HEAD under its attempts 1-2; "landing candidate requires one recorded common
  Git base"; correct-attempt-base rightly refuses since repaired paths no
  longer reproduce the sealed old deltas). Retired solved + altitude
  reflection; superseded by the -v2 successor. **Lesson: land or park
  dependent in-flight quests BEFORE landing a sibling that moves their base.**
- Verifier's non-blocking follow-ups for the production-wiring quest:
  call-cell-world-abi.test.js runs ~25s against a 30s tap timeout (flake risk
  under load); seedInvocation leaves orphaned coordination rows for failed
  invocations (ops cleanup); full ServiceRuntimeLifecycle envelope composition
  remains the wiring quest's scope.
- Remaining open scope: `minimal-deployment-call-cell-production-wiring`
  (drafted, unsealed).

## EPIC CONTINUATION 2026-08-02 (night): production wiring LANDED

- **`minimal-deployment-call-cell-production-wiring` LANDED as commit `c9fe4c4ad`**
  (17 paths, fingerprint `sha256:e3a3a322…`, verifier subagent:a16a6517f825e7f7f
  APPROVED after adversarial re-check of all design seams).
- What landed: `attachCallCellInvoker` composes resolver + routing surface +
  batch executor + reduce coordinator (over new `call_cell_reduce_slots` /
  `call_cell_reduce_results` system tables, five-point registration per the
  wasm_operations precedent, unique index instead of composite PK because the
  per-replica DDL path drops composite PKs) and assigns the invoker to the
  ServiceLifecycleCommandOwner inside `attachSqlRuntimeToStartupOwner` (seed +
  join). RuntimeServiceHandler self-defaults its CallBindingRouteResolver.
  **Fence-replay fix**: every shard run / reduce dispatch carries a slot-scoped
  wire identity (`#slot-N` / `#reduce`) — the durable fence keyed on
  tenant+invocationId would otherwise replay shard 1 into shard 2 and into
  reduce on any production node. The resolver parses the identity for
  deterministic slot spread across replicas. Reduce acquires a dedicated
  reduce-lease slot (shard slots + 1) and the snapshot is refused typed if the
  executing replica is not the holder. Two-node integration evidence via the
  REAL handler-setup factory + REAL bootstrap attachment, coordination SQL
  through the real engine into SQLite created from the registered schemas.
- ABI spike timeout budget widened separately as commit `3061b8d21`.
- Verifier follow-ups (non-blocking, for future ops/hardening quests):
  publish is not lease-expiry-guarded (safe today: single orchestrator +
  UUID-keyed result row); receiver does not echo its replica id (wrong-replica
  execution is prevented by its own assertSelectedRoute, the invoker check
  detects resolution drift); parseCallInvocationIdentity would mis-split a
  caller-supplied idempotency key ending in `#slot-N`/`#reduce` (unreachable —
  orchestrator mints UUIDs; add a grammar guard if keys are ever exposed);
  orphaned seed rows for failed invocations still accumulate (ops cleanup).
- **Epic state**: the "non-request invocation" follow-on for call/pushdown is
  now landed end-to-end (runtime foundation 5c374e6c8, orchestration
  e723e30f5, production wiring c9fe4c4ad). The next epic follow-on,
  data-local call activation, is owned by
  `solve/quests/data-local-call-partition-activation.json` — authored by a
  CONCURRENT session (with the matching epic-memo edit); not touched here.

## DATA-LOCAL QUEST IN FLIGHT 2026-08-03 (quest: data-local-call-partition-activation)

**Frontier 1 (partition-local-run) IMPLEMENTED + recorded as attempt-1**
(6/6 harness `run-data-local-call-partition-run-scenarios.js` green, scope
override consumed at admission). Working tree = the candidate; NOT committed.
What landed in bytes: `call-partition-topology.js` (canonical host+fence
resolution via routing snapshot; TARGET_STALE/ROUTE_UNAVAILABLE typed),
resolver `hostNodeId` restriction + `HOST_CELL_UNAVAILABLE` (the activation
trigger) + route carries hostNodeId (re-assert covers it, null-normalized
compare), invoker planShards (no row fetch) + per-shard host dispatch +
batchRowBound rides callCell, adapter carries partitionId/hostNodeId,
receiver `buildLocalShardBatch` (bounded partitionService.executeQuery +
toCellBatch; typed refusals, invoked=false) + `partitionServicesProvider`
(self-default via CDC), two-node evidence: run-per-partition-host + ZERO
shard-table router deliveries.

**Frontier 2 design (missing-cell-activation) — decided, not built:**
- New CDC-PROPAGATED system table `call_activation_leases`
  (service_id, node_id leading for co-location? key = service_id+node_id via
  unique index; lease_expires_at, requested_at). UNLIKE the reduce tables it
  must propagate (planner runs on the service_definitions-p1 leader).
- Invoker: on HOST_CELL_UNAVAILABLE → publish/refresh lease row (engine
  internal SQL) → wait bounded: cdcIntegrationService.waitForCacheUpdate
  (TABLES.SERVICES, replica, {timeoutMs}) + isReadyRuntimeActual + node match
  → retry dispatch; deadline → typed RETRYABLE refusal.
- Planner consumption (NO new entry point — the lease row IS the demand
  signal; RuntimeServiceRebalancerOwner.refresh() is cache-change-triggered):
  attach `activationPins` in getRuntimeServicePolicy
  (unified-rebalancer-policy-scheduler-methods.js:74-101, dataAffinity attach
  is the precedent seam), lift target count by live unsatisfied pins, force
  pinned nodes into targetNodes at the move-planner.js:715 seam
  (calculateTargetState → placementOwnerDecision.intent.targetNodeIds).
  Pins are DETERMINISTIC (epic forbids satisfying locality via soft
  dataAffinity scores). Reclaim needs NOTHING: lease lapse → surplus cure
  NODE_NOT_IN_TARGET (move-planner-move-calculation-methods.js:432-460,
  ~60s periodic + cache-change refresh) removes the replica = "bounded and
  reclaimable". replica ids: let the coordinator mint (allocateCanonicalReplicaId).
- Two-node evidence: partition on node B, cell replica only on node A →
  CALL publishes lease → drive refresh() → CREATE_REPLICA on B (real
  handleCreateReplica already proven in handler) → ready row → local run.

**Frontier 3 (identity-and-topology-fencing):** the topology module ALREADY
resolves the fence tokens {partitionVersion, activePartitionVersion,
partitionLeaderNodeId=hostNodeId, partitionReplicaId, partitionState} but
they are NOT yet on the wire. Put them in the envelope payload, receiver
re-asserts against ITS OWN cache rows: leader match (predicate shape of
hasKnownRemoteLeaderWitness, partition-service-write-metrics-base.js:580-600)
+ epoch/state via buildPartitionDescriptorEpochDecision
(partition-descriptor-epoch-contract.js:195; REJECT → TARGET_STALE RETRYABLE
preserveReplicaState). NEVER use leader_claim_* (local-only, CDC-stripped).

**Frontier 4 (owner-boundary-preservation):** negative/boundary guards — no
parallel topology cache (topology module is pass-through), no scheduler
(invoker only publishes lease rows), activation capacity is planner output,
artifact identity pinned (bindingDigest already in route + re-assert).

**Known gaps recorded by recon (follow-ups, not this quest):**
owner.partitionServices misses rebalancer-created replicas
(ReplicaHandler.localServices; merged provider needed someday); production
QUERY path serializes even same-node (message-group transport) — data-local
bypasses it entirely; follower-read authority witness not reconstructed in
the local path (leader-only read via isLocalPartitionServiceLeader if wanted).

**Remaining quest flow:** frontiers 2→3→4 as attempts 2..N with their own
scenario harnesses (data-local-call-missing-cell-activation,
data-local-call-identity-topology-fencing, data-local-call-owner-boundaries),
then a doneWhen aggregate harness script
`run-data-local-call-partition-activation-scenarios.js` (consecutive 3),
verify (subagent per constraint), land. Scope override per attempt as needed.

## DATA-LOCAL QUEST: ALL FOUR FRONTIERS IMPLEMENTED 2026-08-03 (morning)

Attempts 1-4 recorded (partition-local run; missing-cell activation via
call_activation_leases + planner pins; wire fencing with receiver
re-assert; owner-boundary guards). Aggregate doneWhen harness green 3x.
Candidate: 32 paths, base f9332b73a, fingerprint sha256:932969b2… —
verifier round in flight.

**TRAP HIT — declaration-time poison:** the first `solve run --max 1`
(declaration) let the dry executor no-op an evidence-less frontier
(owner-boundary-preservation had no report yet) → attempt-integrity
violation with resolutionPolicy **new-quest-only** (undischargeable).
Exit: the proven successor route (reflect → approval → park ×4 →
`new --from` data-local-call-partition-activation-v2 → inherit-candidate
→ land). **Lesson: ingest one green report per frontier scenario BEFORE
the declaring run on any multi-frontier quest.**

## DATA-LOCAL QUEST LANDED 2026-08-03: commit 9c60dc142

Successor `data-local-call-partition-activation-v2` inherited the
APPROVED 32-path candidate (sha256:932969b2, verifier
subagent:a16a6517f825e7f7f with byte-chain supersession verification)
and landed after the proven scope-override re-admission flow. The
poisoned parent is parked exhausted ×4 with the supersession recorded.

Verifier non-blocking follow-ups (future hardening/ops quests):
- call-partition-topology `|| candidates[0]` fallback is dead code (a
  non-leader host always fails the receiver fence) — refuse at
  resolution instead.
- publishActivationLease refresh→read→insert can race concurrent
  publishers into a duplicate-PK INSERT (self-heals on retry).
- A short caller deadline can be consumed inside the activation wait
  window (activationWaitMs vs deadlineMs interplay).
- Sustained caller demand keeps re-extending the lease (pin lives while
  demand lasts, by design) — ops note for reclaim under continuous load.
- Live RuntimeServiceRebalancerOwner.refresh() pin consumption in a
  running cluster is unit-guarded, not yet cluster-exercised.

## HARDENING BATCH LANDED 2026-08-03: commits bf9bf34c1 + f594d5d14

All single-sitting verifier follow-ups are closed: topology dead-fallback
now refuses at resolution; lease INSERT race self-heals; activation wait
capped by the caller deadline; receiver echoes the executing replica id;
idempotency keys carrying the reserved #slot-N/#reduce grammar refused
typed; driver error identity hoisted (literal checker now reports ZERO
new violations repo-wide). All seven scenario harnesses green.

**Remaining recorded follow-ups are quest-scale, not single-sitting:**
1. Orphaned reduce seed-row cleanup — needs a DELETE/expiry grammar
   added to the sealed coordinator (owner-contract change → own quest).
2. Live-cluster exercise of RuntimeServiceRebalancerOwner.refresh()
   consuming activation pins end-to-end (ops evidence; mind the
   deterministic-first rule — design the DT harness variant first).
3. Ops note stands: sustained caller demand keeps re-extending the
   activation lease (pin lives while demand lasts, by design).

## EPIC CLOSE-OUT 2026-08-03: expiry quest landed, all follow-ups resolved

- Pin-loop engagement witness: test-only commit (real UnifiedRebalancer
  policy pass attaches pins from live lease rows) — the deterministic
  answer to the "live loop not exercised" note.
- `call-cell-reduce-coordination-expiry` LANDED (attempt-2 approved,
  fingerprint sha256:48f6d374): bounded reclaim grammar; the
  concurrent-seed race (attempt-1) was caught while authoring the
  verifier charter and fixed before landing — seed rows carry seed time
  as lease_expires_at (claimable AND reclaim-protected).
- Verifier ops notes for the future: a live invocation whose
  seed-to-first-acquire span exceeds retention (default 600s, tunable)
  is treated as abandoned by design (typed retryable, never a wrong
  result); reclaim failures are swallowed silently (a debug log would
  keep hygiene observable); releaseReduceLease zeroes the lease, making
  released rows immediately sweepable if release is ever wired in.
- The call/pushdown invocation scope of the minimal-deployment epic is
  COMPLETE: foundation, orchestration, production wiring, data-local
  activation, hardening, and coordination hygiene — all landed verified.
