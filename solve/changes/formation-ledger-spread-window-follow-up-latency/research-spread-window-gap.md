# Research: formation-ledger-spread-window-follow-up-latency (c-research-first)

Run-26 forensics. Read-only research; write-as-you-go.

Evidence sources:
- Node logs (gz): solve/changes/formation-ledger-spread-window-follow-up-latency/run26-node-logs/ (node-0 = seed)
- Demo log: solve/changes/provisioning-admission-ledger-hold-transient-wait/run26-demo.log
- Interlock src: src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js (read in full)

## Status
- [x] Q1 planner cadence + re-drive seam for second move
- [x] Q2 probe deferral reason codes :48.7-:57.4
- [x] Q3 per-move cost breakdown op-1
- [x] Q4 total moves needed + window projection
- [x] Q5 machinery inventory (REUSED vs NEW)

## Findings (running)

### Node map (run-26)
- node-0 = 1c29ed85 (seed, ledger source)
- node-1 = e4399969, node-2 = c59db0fb
- node-3 = 7c9c5c6f (op-2 TARGET, and the node that finally dispatched op-2)
- node-4 = 4cd17f0d (op-1 TARGET; became replica_operations-p1 planner/leader; CREATED op-2)

### Q1 HEADLINE: the 8.7s gap is NOT planner cadence — op-2 was PLANNED+CREATED 30ms after op-1 settled
Timeline (log-verified):
- 12:09:48.676 op-1 46f00560 "Priority recovery drain settled operation" (node-0 + node-3 observe)
- 12:09:48.000 node-0 "Operation completed" for op-1 (terminal row write BEFORE the drain settle log)
- 12:09:48.690 node-4 rebalancer "Starting rebalancing" entity replica_operations-p1 trigger=periodic
- 12:09:48.706 node-4 "Creating operation" op-2 8b4aba59 REPLACE replica_operations-p1 -> node-3
- 12:09:48.753 node-4 "Reusing in-flight operation for planned move" workflowStep=PENDING
  rearmAction="skip_live_deferred_retry"  <-- DISPATCH NEVER ARMED on creator
- 12:09:48.802, :51.374, :54.558, :56.576 node-4 "Waiting for transitional cluster membership to
  settle before planning critical system rebalancing" delayMs=5000,
  planningState=topology_operation_target_in_flight — planner passes DEFER, no re-execution of the move
- 12:09:57.447 node-3 "Operation step changed" PENDING->SENDING reason=dispatch_sending
  ingress="priority_claim_cas"  <-- the thing that actually drove op-2 was node-3's priority-claim CAS lane
- 12:09:57.460 node-3 Sending CREATE_REPLICA (to itself, r5)

So: planning was IMMEDIATE (level-triggered, worked); the DEAD GAP is op-2 sitting in PENDING
because (a) creator's rearm decision skipped arming dispatch ("skip_live_deferred_retry"),
(b) follow-up planner cycles on node-4 were gated by topology_settling
(topology_operation_target_in_flight, 5s delay), and (c) rescue came from the priority-claim CAS
ingress on another node ~8.7s later.

Note: op-1 had the SAME create->dispatch lag (created 12:09:25.285 node-0, CREATE_REPLICA
handled ~12:09:37) — ~11.7s. This is a repeating per-move pattern, not a one-off.

### CONFIRMED CLASS: creator never dispatches; a REMOTE priority_claim_cas does, ~9-12s later
- op-1: "Creating operation" node-0 12:09:25.285; PENDING->SENDING on NODE-4 12:09:37.000
  ingress=priority_claim_cas (11.7s in PENDING)
- op-2: "Creating operation" node-4 12:09:48.706; PENDING->SENDING on NODE-3 12:09:57.447
  ingress=priority_claim_cas (8.7s in PENDING)
Both ledger self-moves were ONLY ever driven by the periodic remote priority-claim lane.
The creating coordinator's own dispatch arm was skipped (op-2: rearmAction=skip_live_deferred_retry
at :48.753, 47ms after create) and its planner passes then deferred on
topology_settling/topology_operation_target_in_flight (delayMs=5000, node-4 :48.802-:56.576).

### Q1 MECHANISM MAP (src evidence)
- Operation OWNER for an unsettled system/priority REPLACE = the TARGET node:
  src/rebalancer/replica-operation-repository-row-methods.js:150-169 (resolveOperationOwnerNodeId
  returns targetNodeId for system/priority replace), isOperationLocallyOwned :176.
- So the creating coordinator can NOT drive PENDING->SENDING itself; it must remote-handoff:
  rebalance-coordinator-operation-creation.js:624-627 (emit OPERATION_CREATED +
  armCoordinatorCreatedOperationProgress) -> operation-workflow-owner.js:597
  armCoordinatorCreatedOperation -> on retryable failure
  deferCoordinatorCreatedRemoteHandoffRetry (operation-workflow-coordinator-handoff-retry.js:107,
  logs OPERATION_DISPATCH_RETRY_DEFERRED warn boundary=coordinator_created_remote_handoff).
  Run-26: those warns appear only AFTER the claim (12:10:02.892 node-0, 12:10:03.150/12:10:04.157
  node-4, transportReasonCode=ROUTER_CONNECTION_CLOSED, target node-3 connection 'reconnecting').
  CAUTION: those are DURING SHUTDOWN ('Stopping cluster...' began ~:58.9) — NOT valid evidence that
  the link was down during the gap. During the gap itself (:48.7-:57.4) node-4 logged NO handoff
  attempt, NO deferral warn, and node-3 received NO wake — the creator-side arm went fully silent.
  Open detail (for DT to nail): whether armCoordinatorCreatedOperation ran at all for op-2
  (shouldEmitOperationCreated path) or returned a silent deferred owner-progress result; either way,
  47ms later hasLiveDeferredDispatchRetry claimed a live retry that never produced a dispatch.
- Rearm-on-replan seam: rebalance-coordinator-operation-intent-methods.js:416-471
  maybeRearmReusedPendingOperation / resolveReusedOperationRearmAction; run-26 hit
  SKIP_LIVE_DEFERRED_RETRY (hasLiveDeferredDispatchRetry :482-504 checks
  owner.isOperationDeferredRetryActive + owner.hasActiveCreatedOperationHandoffRetry) at :48.753.
- Planner cadence: REBALANCER_DEFAULT.COORDINATOR.PERIODIC_CHECK_INTERVAL_MS = 60000
  (src/rebalancer/rebalancer-constants.js:82; jitter 10000 :87; CRITICAL_CHECK_DELAY_MS 5000 :88).
  The observed ~1.5-2.5s planning passes are the priority-recovery lane, and on node-4 those
  passes deferred with 'Waiting for transitional cluster membership to settle' delayMs=5000
  planningState=topology_operation_target_in_flight (:48.802..:56.576).
- The rescue that DID fire: replica-dispatch-service ready-node replay —
  src/control-plane/replica-dispatch-replay-readiness.js:40 retryPendingDispatchesForNode
  ('Retrying pending replica operations for ready node', node-3 12:09:57.035 pendingCount=1) ->
  operationDispatchQueue.enqueue -> reconcileOperationDispatch
  (src/control-plane/replica-dispatch-reconcile-callbacks.js:110) -> dispatchOperationRow ->
  claimPendingDispatchOperation (src/rebalancer/operation-workflow-dispatch-execution.js:42) ->
  claimPriorityDispatchTransition (operation-workflow-transition-persistence.js:37, ingress
  priority_claim_cas logged :198).
- Level-triggered row replay EXISTS: replica-dispatch-reconcile-callbacks.js:321-330
  handleCacheNodeChange(REPLICA_OPERATIONS) -> replayReplicaOperationRow — i.e., when the op-2
  row becomes CACHE-visible on the owner it self-dispatches. It did not fire promptly because the
  op row's CDC/cache propagation goes through the very ledger being moved ('No row found for CDC
  update' repeatedly on node-4 :51.4/:57.9/:58.9). Authoritative visibility on node-3 existed by
  :51.637 ('In-flight operation owner query indicates control-plane pressure' rowCount=1,
  queryDurationMs=1217) yet nothing armed the op until the coincidental ready-node trigger :57.035.
- Non-owner nodes forward: replay-readiness.js:61-63 — not-locally-owned rows get
  sendDirectDispatchWakeup to the owner (node-0 fired one at :56.101, likely the proximate cause
  of node-3's :57.035 trigger).

### Q2 ANSWER (probe deferrals :48.7-:57.4): none of (a)/(b)/(c) as framed — op-2 EXISTED the whole window
- op-2's pending row was persisted at 12:09:48.706-48.751. From that instant the async lane
  ensureOperationLedgerSelfMoveSerialized correctly OBSERVES a live disruptive ledger self-move
  and defers everything with operation_ledger_self_move_in_flight. Level-correct.
- Demo-log terminal error (run26-demo.log line 9): "Unable to satisfy minimum routable provisioning
  cohort ... rejected=node-0:operation_ledger_self_move_in_flight; node-4:...; node-3:..." —
  the final reason code at :58.898 is self_move_in_flight on 3 of 5 nodes.
- (b) partially true in the tiny :48.0-:48.7 seam only; (c) quorum_concentrated DID fire but for the
  rebalancer's own moves (node-4 :48.695, deferring control_plane_publications REPLACE, evaluation
  totalVoters=2 maxVotersOnOneNode=2 hottest=node-0) — not the binding reason for the DDL probes.
- CONCLUSION: probes deferred CORRECTLY on a live-but-IDLE op-2. The bug is op-2 idling in PENDING,
  not admission misreading.

### Q3: per-move cost breakdown (op-1 46f00560, node-0 -> node-4)
- create (node-0) 12:09:25.285 -> claim (node-4, priority_claim_cas) 12:09:37.000 = 11.72s PRE-DISPATCH IDLE
  (same class as the inter-move gap; op-1's own dead gap)
- claim :37.000 -> CREATE_REPLICA handled :37.003; status-write 'creating' into the ledger DEFERRED :37.006
  ("Replica create status write deferred after retryable control-plane failure", src/node/replica-handler-constants.js:36,
  localProgressCommitted=true, error empty, retryAfterMs null) — the write target is replica_operations-p1
  ITSELF (formation-vs-steady-state circularity: the ledger being moved carries the move's own status)
- :37.006 -> :40.921 (~3.9s): coordinator step writes stall; 'Operation row missing from authoritative
  partition after zero-row update; re-inserting owner copy' :40.694 (row absent from the mid-move ledger,
  expectedWorkflowStep SENDING); CDC row fetches also miss (:31.17, :40.34, :40.93, :44.70 'No row found').
  Budget angle: persistOperationUpdate uses buildPriorityDispatchTransitionMutationBudget
  (operation-workflow-transition-orchestration.js:780; PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS),
  and resolveOperationMutationQueryTimeoutMs (replica-operation-repository-mutation-gateway-methods.js:469)
  floors at timeoutMs=1 when the budget is exhausted — the recorded transition-mutation-budget-doom-loop P2.
  Run-26 evidence is CONSISTENT with row-absence (zero-row) + retry loop, not conclusively the 1ms floor
  (no per-attempt logs at info level). OPERATION_PERSIST_RETRY_DELAY_MS=250ms,
  OPERATION_PERSIST_RETRY_TIMEOUT_MS=15s (replica-operation-repository.js:196-201).
- empty CREATE phase :37.0 -> :44.73 = 7.7s, decomposed:
  * :37.0 -> :39.267 (2.3s) dispatch -> learner start ('Starting as learner (non-voting)', promotionDelayMs=30000)
  * :39.267 -> :44.271 (5.004s) learner -> voter promotion. EXACTLY the
    LEARNER_PROMOTION_PRIORITY_RECOVERY_DELAY_MS = 5s stability floor
    (src/partition/partition-service-constants.js:26; default LEARNER_PROMOTION_DELAY_MS=30s :25).
    The partition is EMPTY — nothing to catch up; the 5s is pure fixed margin. DOMINANT per-move cost.
  * :44.271 -> :44.730 voter-ready activation + active (0.46s)
- handoff/removal: STEP_DOWN :45.390 (0.66s after ACTIVE step :44.734), REMOVE_REPLICA :45.531 ->
  removal complete :45.549, ACTIVE->STOPPING :45.559
- STOPPING -> terminal: drain settled :47.367 (node-0) / 'Operation completed' :48.000 = ~2.4s
  (priority-recovery drain convergence, operation-workflow-recovery-drain.js:565 log)
- TOTAL exec claim->terminal = 11.0s; create->terminal = 22.7s (11.7s of it idle).
Most compressible WITHOUT touching timeouts/budgets: the PRE-DISPATCH IDLE (pure scheduling, 11.7s+8.7s).
Within exec, the 5s learner-promotion floor dominates but IS a stability delay (changing it = policy
question, borderline TEST-0021); the ~3.9s status-write stall is circularity-bound (row lives in the
moving ledger) and partially unavoidable; drain 2.4s minor.

### Q4: moves needed + window projection
Concentration predicate (operation-ledger-quorum-concentration.js:123-135): concentrated when
voters-outside-hottest < majority. Bootstrap: r1,r2,r3 all on seed (3 voters).
- after move-1 (r1->node-4): 2 on seed, 1 elsewhere; outside=1 < majority=2 -> STILL concentrated
  (log-confirmed: node-4 :48.695 'Operation-ledger quorum concentrated' totalVoters=2 maxOnOneNode=2)
- after move-2 (r3->node-3): 1+1+1; outside=2 >= 2 -> released. NOTE mid-move-2 (r5 active, r3 REMOVING):
  4 voters, hottest 2, outside 2 < majority 3 -> concentrated until source removal completes (REMOVING
  counts as voter by design, see module comment).
=> EXACTLY 2 REPLACE moves; leadership already moves with move-1 (replace_target_leader_election :45.390).
Projection (per-move exec 11.0s, successor create +0.7s after predecessor terminal, CREATE TABLE arrived
~12:09:28.9 = budget-death :58.898 minus 30s):
- Run-26 actual: op-2 would have finished ~13:08.5 -> window ~43s from op-1 create; CREATE died at 30.0s.
- Remove ONLY the inter-move gap (8.7s): op-2 create :48.7, exec 11s -> terminal ~:59.7 + removal-flip
  lag -> admission ~:59.9 = 31.0s after CREATE arrival -> STILL FAILS (marginal). NOT sufficient.
- Remove the CLASS (both pre-dispatch idles, 11.7s + 8.7s): op-1 terminal ~:36.3, op-2 terminal ~:47.6,
  admission ~:48 -> ~19.1s after CREATE arrival -> comfortably inside 30s (~11s headroom), ~under the
  ~20s target. Additional headroom available from the 5s learner floor if policy allows (2x5s more).

### Q5: existing machinery inventory (REUSED vs EXTENDED vs NEW)
REUSED (already exists, is the rescue path that eventually worked):
- ready-node dispatch replay: retryPendingDispatchesForNode (replica-dispatch-replay-readiness.js:40)
  -> operationDispatchQueue -> reconcileOperationDispatch (replica-dispatch-reconcile-callbacks.js:110)
  -> claimPendingDispatchOperation (operation-workflow-dispatch-execution.js:42) -> priority_claim_cas
- authoritative rediscovery when cache lags: getAuthoritativeDispatchRetryRowsForNode
  (replay-readiness.js:492) + mergeAuthoritativePriorityRecoveryDispatchRowsForNode :309
- non-owner -> owner wake: sendDirectDispatchWakeup (replay-readiness.js:62)
- watermark-bypass local trigger: enqueueLocalReadyNodeDispatchRetry
  (replica-dispatch-reconcile-callbacks.js:212) — built exactly for 'publication updates can reveal
  recovery work without a node-row change'
- level-triggered row replay on cache visibility: handleCacheNodeChange(REPLICA_OPERATIONS) ->
  replayReplicaOperationRow (replica-dispatch-reconcile-callbacks.js:321-330) — correct but starved by
  CDC lag through the concentrated/moving ledger
- completion detection seams: completeOperation (operation-workflow-transition-persistence.js:219) and
  priority-recovery drain settle (operation-workflow-recovery-drain.js:565, action
  complete_priority_recovery_drain) — fire on every observing node (node-0 :47.367/:48.0, node-3 :48.676)
- run-21 terminal-transition repair (operation-workflow-terminal-transition-repair.js): repairs TERMINAL
  rows; related family but NOT the home for successor arming (it looks backward, not forward)
EXTENDED (the fix):
- hook the completion/drain-settle seam of a DISRUPTIVE LEDGER SELF-MOVE to trigger the existing
  ready-node/rediscovery lane (enqueueLocalReadyNodeDispatchRetry or a direct
  retryPendingDispatchesForNode pass) so any freshly-created/pending ledger op is armed immediately —
  including remote-owned ones via the existing sendDirectDispatchWakeup branch
- harden resolveReusedOperationRearmAction (rebalance-coordinator-operation-intent-methods.js:460):
  SKIP_LIVE_DEFERRED_RETRY must be backed by a retry that is actually scheduled AND will fire for THIS
  op; in run-26 it suppressed the only creator-side rearm 47ms after create while no retry ever fired
NEW: nothing beyond a small hook + reason-code constant.

### VERDICT
The gap is NOT planner cadence (successor planned+created in 30ms) and NOT admission visibility lag
(probes correctly deferred on the live-but-idle op-2). It is a DISPATCH-ARMING gap for remote-owned
ledger self-moves: owner = target node (replica-operation-repository-row-methods.js:157-162), the
creator's arm/wake left no trace, the rearm check suppressed itself (skip_live_deferred_retry), the
owner's level-triggered replay was starved by CDC-through-the-moving-ledger, and rescue came from a
coincidental ready-node trigger cascade (node-0 :56.101 wake -> node-3 :57.035 -> claim :57.447).
The SAME class cost op-1 11.7s pre-dispatch. Fix target: completion-triggered re-drive of pending
ledger self-move dispatch (both moves benefit), via the REUSED ready-node/rediscovery lane, hooked at
the self-move terminal/drain-settle seam. Removing only the inter-move gap is insufficient (projection
31.0s > 30s); removing the class brings the window to ~19s — comfortably inside budget.
