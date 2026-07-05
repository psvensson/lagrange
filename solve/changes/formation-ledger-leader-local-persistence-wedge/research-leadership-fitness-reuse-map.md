# Reuse map: leader-local persistence health -> leadership fitness (quest formation-ledger-leader-local-persistence-wedge)

Repo root: /media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something

## Task 1: Raft step-down / health machinery

### The sole deliberate step-down seam (WIRED)
- `src/node/replica-handler-leader-handoff-methods.js:62` `requestTrackedPartitionLeaderHandoff(replicaId, reason)`
  - cancels leader-owned activation (`service.cancelLeaderOwnedActivation()` line 95)
  - `raft.deferCandidacy()` (line 102-104, candidacy-reluctance)
  - `raft.change({state: FOLLOWER, leader: ''})` (line 105-108) then `raftProvider.startElectionTimer(raft)` (line 109)
  - SOLE caller: `src/node/replica-handler-remove-request-methods.js:279` (rebalancer drain path only)
- `deferCandidacy` in `src/raft/liferaft.js:472` — inflates election timeout 4x for 10s window (lines 73-74, 437-445). Bounded. NOT a health mechanism, purely anti-flap.
- LifeRaft = thin subclass of `@markwylde/liferaft`; NO self-health check, NO applied-index observation anywhere in `src/raft/liferaft.js`. Leader steps down ONLY on higher-term packets (base lib behavior).

### Election triggers
- `requestElectionNow` / `startElectionTimer` on the raftProvider (raft-provider-control) — used by drain handoff + REPLACE target election (`replica-handler-remove-request-methods.js:279` area).
- No lease/heartbeat SELF-check: LifeRaft leader only steps down on higher-term inbound packets (base @markwylde/liferaft). timeout()/heartbeat() overrides in liferaft.js are teardown/DT guards, not health checks.
- NO code in src/raft/ observes the leader's own applied index or log persistence progress as a fitness input.

## Task 2: Readiness dimensions

- Enum: `src/control-plane/control-plane-readiness-constants.js:6-19` CONTROL_PLANE_READINESS_DIMENSION = {PROCESS_ALIVE, CLUSTER_MEMBER_HEALTHY, ROUTING_READY, LOAD_READY, PLACEMENT_ELIGIBLE, PROVISIONING_ELIGIBLE, CONTROL_PLANE_WRITABLE, CONTROL_PLANE_PUBLISHED, CONTROL_PLANE_RECOVERY_ELIGIBLE, METADATA_PUBLICATION_HEALTHY, REPAIR_ELIGIBLE, SERVE_ELIGIBLE}
- Owners enum lines 21-28: NodeLifecycleStateMachine, SystemTableCache, StorageCapacityAccountingService (capacity only!), CDCGroupPropagationService, MessageRouter, MembershipPublicationCoordinator.
- Computed in `buildDimensions` `src/control-plane/control-plane-readiness-diagnostics-eligibility.js:360-425` from runtimeAuthority snapshot + loadReady(nodeRow) + capacity. NO persistence-health / apply-progress dimension exists. StorageCapacityAccountingService = disk capacity for PLACEMENT_ELIGIBLE, not persistence liveness.
- `getNodeReadinessSync(nodeId, options)` at `src/control-plane/control-plane-readiness-service-node-methods.js:331`.

## Task 3: Write-path dependence on leader-local store (VERDICT: fully coupled, three leader-local persistence dependencies)

Chain for a routed SQL write to a multi-replica raft partition:
1. `handleRemoteQuery` (`src/partition/partition-service-entry-apply-base.js:291`) → non-leader redirects (line 307-331) → leader `executeQuery` → `proposeWrite`.
2. `proposeWrite` (`src/partition/partition-replication-handler.js:176`) → leader → `applyWrite` (line 272).
3. `applyWrite` line 283: `this.storage.appendEntry(entry)` — LEADER-LOCAL persistence dependency #1, SYNCHRONOUS sqlite INSERT (`src/partition/partition-raft-storage.js:140-151`, UPSERT_RAFT_LOG) BEFORE any raft proposal.
4. Multi-replica: `proposeAndWaitForCommit` (line 386): enqueues entryId in proposalQueue with timeout RAFT_COMMIT_TIMEOUT_MS (= TIME_MS.DEFAULT_RPC_TIMEOUT, `partition-replication-handler-constants.js:59`); then `this.raft.command(entry)` (line 416).
5. Base liferaft `command()` (`node_modules/@markwylde/liferaft/index.js:919-936`): `await raft.log.saveCommand(command, raft.term)` — LEADER-LOCAL dependency #2 (SQLiteLogAdapter `src/raft/sqlite-log-adapter.js:274`) — if this hangs, the append packet is NEVER SENT: replication itself is gated on leader-local log persist (raft-correct, but a silent hang = total write wedge with no step-down).
6. Quorum acks → leader `commitEntries` (base index.js:943-947) → emits 'commit' per entry → wired to `applyCommittedEntry` at `src/partition/partition-service-raft-init-base.js:462-464`.
7. `applyCommittedEntry` (`partition-service-entry-apply-base.js:578`): EVERY replica (leader and follower) executes the SQL on ITS OWN sqlite (line 625-626 `this.db.prepare(command.sql).run(...)`). Followers apply independently via base 'append' commit catch-up (base index.js:333-336).
8. THE COUPLING: the client response resolves ONLY via the LEADER's local apply: leader's applyCommittedEntry → `resolveCommittedWrite(command.entryId, result)` (line 628-633; def `partition-service-cdc-stream-base.js:286`) → `resolveCommit` (`partition-replication-handler.js:437`) → proposalQueue.resolve. LEADER-LOCAL dependency #3.

So: replicas DO apply committed entries independently, but a frozen LEADER local store blocks the whole path at step 3 or 5 (before replication even starts) or step 7 (response). "Decouple transition writes from leader-local apply" is NOT possible without changing step 5 (base raft protocol semantics: leader must persist to own log before counting itself toward quorum) — but steps 3 (duplicate pre-log append) and 7 (response derived from local apply) are app-level couplings. There IS a 30s-class proposal timeout (RAFT_COMMIT_TIMEOUT logged as error) — but only for proposals that reach proposeAndWaitForCommit; a hang inside storage.appendEntry (sync, blocking) or before enqueue produces NO timeout, NO log.
- Single-replica path (line 312-319): applyCommittedEntry called directly, no timeout at all around it.

### Reads (OWNER_LOCAL_ONLY)
- `src/control-plane/control-plane-system-table-gateway-read-contracts.js:175-185`: OWNER_LOCAL_ONLY is the DEFAULT authoritative read mode — owner (partition leader) local store, no owner-RPC fallback, no SQL fallback. So reads of control-plane system tables are served from the leader's LOCAL sqlite — a frozen-persistence leader serves progressively stale reads and nothing detects it.

## Task 1 addendum: commitIndex-vs-appliedIndex divergence — DOES NOT EXIST as an observable
- Internal state only: `src/partition/partition-raft-storage.js:55,112-113` (commitIndex/lastApplied set at LOAD time only, never updated at runtime); `src/raft/sqlite-log-adapter.js` committedIndex in _raft_state.
- HALF-BUILT surface: CLI views RENDER `raft_applied_index` (`src/cli/views/partitions-view.js:372`, `src/cli/views/services-view.js:656`) but NO producer anywhere in src/ or scripts/ ever emits that field — always renders 0/N/A. A divergence display was sketched and never wired.
- Partition status exposes only `logLength` (`src/partition/partition-service-split-accessor-base.js:627`).
- No metric, no readiness dimension, no admin snapshot carries applied-vs-committed lag.

## Task 2 addendum: readiness → partition-leader decisions
- Routing: query-executor routing snapshots consume readiness per service row (`src/query/query-executor-partition-routing-snapshot.js:218-260`, failedDimensions/reasonCodes) — gates which nodes serve ROUTED READS + mutation admission (control-plane-mutation-readiness.js). It does NOT choose or depose the raft leader; a write always chases the raft leader via redirect (`partition-service-entry-apply-base.js:307-331`).
- Consumers registry: `src/control-plane/invariant-engine-progress-checks.js:26-38` — internal topology consumers (MovePlanner, RebalanceCoordinator, UnifiedRebalancer, ReplicaDispatchService, StorageAdmissionService, ManagedSplitWorkflow) vs external serve consumers (RoutingService, PgWireStartupSafetyGate...). ALL placement/routing; NONE feed raft leadership fitness.
- The ONLY readiness→step-down bridge is indirect: rebalancer decides a move/remove → STEP_DOWN_REPLICA remote operation (`handleStepDownReplica`, `src/node/replica-handler-remove-request-methods.js:251-282`) → requestTrackedPartitionLeaderHandoff. Driven by placement ops, never by health.
- Run-23 explanation: PROCESS_ALIVE/CLUSTER_MEMBER_HEALTHY come from heartbeat watermarks + SWIM FD (process-level); LOAD_READY from nodeRow load fields; nothing samples per-partition apply progress → the frozen node correctly passes every dimension.

## Task 4: Existing watchdogs (and why none fired in run-23)
- `src/diagnostics/event-loop-gap-watchdog.js` — wired at `src/index.js:799`. Detects SYNCHRONOUS loop blockage (>1s gap) + heap telemetry. A frozen-but-responsive apply (promise that never resolves / silently-skipped persist) produces NO loop gap → silent. Deliberately emits nothing while loop healthy.
- Proposal timeout: `proposeAndWaitForCommit` RAFT_COMMIT_TIMEOUT (`partition-replication-handler.js:394-406`) — logs error 'RAFT_COMMIT_TIMEOUT' per proposal after DEFAULT_RPC_TIMEOUT (30s per test-helpers note). Fires only for proposals that reach the queue; does NOT step the leader down, only rejects that write. If no new proposals target the partition (or the wedge is before enqueue), zero logs.
- `PendingRequestTracker` (`src/partition/pending-request-tracker.js:166-177,386-413`) — per-request timeout + stale cleanup, warn-level logs. Again request-scoped, no leadership consequence.
- `ProposalQueue` (`src/partition/proposal-queue.js`) — bounded backpressure only; getStats() exists but nothing samples it for stall detection.
- Leader activation: `LeaderActivationGate` (`src/raft/leader-activation-gate.js`, 250ms holdoff, `shouldActivate` predicate seam) used by `scheduleLeaderOwnedActivation` (`src/partition/partition-service-core-base.js:513-553`). One-shot at election; no continuous fitness re-check.
- **SILENT-OPEN FAILURE MODE (prime suspect class)**: `src/raft/sqlite-log-adapter.js` — EVERY method no-ops on `!isOpen()` (24 guard sites): `saveCommand` (line 274-297) returns a fabricated entry WITHOUT persisting ("Store in SQLite (only if database is open)"), `getLastInfo` (line 157-185) returns index 0, `get` returns null. A leader whose db handle closes (or closed flag set) freezes persistence with ZERO throws and ZERO logs — matches run-23's silence exactly. `partition-raft-storage.appendEntry` (line 140-151) has NO such guard (would throw on closed db) — so the wedge signature discriminates between the two stores.
- No apply-queue heartbeat, no per-partition progress watchdog, no divergence tripwire exists.

## Task 5: Prior art / ledger lessons
- theory-ledger (`solve/theory-ledger.md`): no leader-persistence-health entries; nearest = stall entries about priority-recovery dispatch (lines 300-312, 563, 815) — different subsystem.
- Closure ledger (`solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger.md`):
  - CL-033/CL-034 (guarded): freeze↔leadership-churn spiral — the INVERSE failure: event-loop gaps shedding leadership caused churn. Lesson: an aggressive self-demotion trigger re-creates this spiral; any staleness-based step-down needs bounded, hysteretic triggers.
  - CL-038: STEP_DOWN re-dispatch forever when source already removed — step-down workflow steps must terminalize.
  - CL-039 (open, not-reproduced): leadership shed onto weak node with NO fail-back — step-down without a viable successor check strands leadership.
  - CL-040/041/042 (closed): raft safety fixes in liferaft.js — the pattern for how leader-behavior extensions are safely layered (patched listener, inert-on-normal-path, dt repro + red-on-revert).
- Flap census lesson (memory + `scripts/analyze-leadership-flap.js` + liferaft.js:61-74 comments): 68% of drained-node leadership re-gains were undirected timer wins; candidacy-reluctance (deferCandidacy 4x/10s) is THE shipped anti-flap lever; requestElectionNow bypasses it (deliberate successor elections unaffected). Any new self-step-down MUST call deferCandidacy before change() (exactly like requestTrackedPartitionLeaderHandoff:102-109) or the wedged node re-wins with its longest log. Do NOT gate-validate flap levers (census proved drain-gain rates identical PASS/FAIL).
- REFUTED in adjacent space: predicate strict-floor fix for projectQuorumAfterRemoval (dt-drain-safety-overremoval-hunt) — don't ship fitness predicates that break intended optimism.

## SHORTEST HONEST EXTENSION PATH (reuse verdict)
Everything needed exists as seams; nothing exists as the mechanism itself:
1. OBSERVE: no reuse candidate observes apply progress — must ADD a leader-side staleness probe. Cheapest honest signal: leader-local `raft.log.committedIndex` (sqlite-log-adapter, already tracked) vs last locally APPLIED index (applyCommittedEntry already the single apply seam — track lastAppliedIndex there) + a persist-failure signal (make sqlite-log-adapter's silent `!isOpen()` no-ops LOUD: they are teardown guards reachable in non-teardown states).
2. DECIDE: bounded staleness window (avoid CL-033/34 spiral: require sustained divergence, e.g. two strikes on an existing timer — no new cache/loop; the partition service already owns timers).
3. ACT: REUSE `requestTrackedPartitionLeaderHandoff(replicaId, reason)` verbatim (it already: cancels leader-owned activation, defers candidacy, changes to FOLLOWER, re-arms election). Add a new ReplicaOperationReason. The remote STEP_DOWN_REPLICA op (`handleStepDownReplica`) exists if the decision is made control-plane-side instead of node-local.
4. SURFACE: wire the never-produced `raft_applied_index` field the CLI views already render; optionally a readiness dimension later (but readiness feeds routing/placement, not raft leadership — a dimension ALONE will not depose a leader).
5. The response-coupling half ('decouple transition writes from leader-local apply') is NOT reusable-away: base liferaft command() persists to the leader's own log before replicating (protocol-required), and the client response resolves only from the leader's local applyCommittedEntry → resolveCommittedWrite. Deriving the response from quorum-commit WITHOUT local apply would need a new response path in applyCommittedEntry/resolveCommit — possible app-level (commit event carries the command; SQL result fields changes/lastInsertRowid come from local execution, so a non-locally-applied response could only confirm commit, not row counts). Protocol change NOT required for step-down; it IS effectively required (response-semantics change) for full decoupling.
