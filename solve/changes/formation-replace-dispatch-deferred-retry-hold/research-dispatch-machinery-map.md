# Dispatch + deferred-retry machinery map (run-22 pinned PENDING/SENDING investigation)

All paths relative to repo root /media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something

## 1. rearmAction decision (planner reuse path)

- Log constant 'Reusing in-flight operation for planned move' = `REUSED_IN_FLIGHT_OPERATION`
  at src/rebalancer/rebalancer-constants.js:276.
- Logged in `maybeRearmReusedPendingOperation` at
  src/rebalancer/rebalance-coordinator-operation-intent-methods.js:416-446.
- rearmAction computed by `resolveReusedOperationRearmAction`
  (rebalance-coordinator-operation-intent-methods.js:460-471):
  - `skip_not_pending`: op terminal OR workflowStep !== PENDING (so a SENDING op gets skip_not_pending
    and is NEVER rearm-dispatched by the planner reuse path!). Line 461-465.
  - `skip_live_deferred_retry`: `hasLiveDeferredDispatchRetry(operation)` true (line 467-469).
  - `rearm_dispatch`: otherwise → `await this.armCoordinatorCreatedOperationProgress(operation)` (line 444).
- `hasLiveDeferredDispatchRetry` (same file :482-504) = owner.isOperationDeferredRetryActive(operationId)
  OR owner.hasActiveCreatedOperationHandoffRetry(operationId).
- `isOperationDeferredRetryActive` (src/rebalancer/operation-workflow-dispatch-rearm-evidence.js:118-127) =
  dispatchRetryTimerByOperationId.has || transitionRetryTimerByOperationId.has ||
  hasActiveTransitionRetryGrace(operationId).
  NOTE: **transitionRetryGrace is a passive deadline record, NOT a timer** — grace active ⇒ planner
  says "live deferred retry" ⇒ SKIPS rearm, even though grace never fires anything.
- `hasActiveCreatedOperationHandoffRetry` (src/rebalancer/operation-workflow-owner-retry-registry.js:394-414):
  requires the TIMER map entry AND a future deadline; lazily self-clears — this one IS backed by a timer.

## 2. Deferred-retry state maps (operation-workflow-owner-retry-registry.js)

Constructed at src/rebalancer/operation-workflow-owner-retry-registry.js:69-103.

- `dispatchRetryTimerByOperationId` — real setTimeout timers armed by `deferDispatchRetry`
  (dispatch-rearm-evidence.js:342-423). Timer callback re-reads op and runs
  `runOperationOwnerAction(OPERATION_OWNER_ACTION.DISPATCH, ...)` (line 404-415). Guards: shutdown,
  uninitialized (re-arms), terminal, not-locally-owned, not-dispatch-retryable → **silent return
  with NO log** (lines 396-403).
- `safetyDeferredRetryTimerByOperationId` — `scheduleDeferredSafetyRetry`
  (dispatch-rearm-evidence.js:478-575), fires EXECUTE action; same silent-return guards (:528-535).
- `createdOperationHandoffRetry{Timer,DeadlineMs,Attempt,TargetNode}ByOperationId` — armed by
  `scheduleCoordinatorCreatedRemoteHandoffFollowUp` (dispatch-rearm-evidence.js:740-814). Timer fires
  → getDeferredDispatchRetryOperation → guards (terminal / !shouldRetryCoordinatorCreatedRemoteHandoff /
  timeout decision shouldStop → clear + stop, **no log**) → `wakeCoordinatorCreatedRemoteOwner(currentOperation)`
  (line 790).
- `operationDispatchDeferredRetry{DeadlineMs,Snapshot}ByOperationId` — **DEADLINE-ONLY, NO TIMER**.
  `recordOperationDispatchDeferredRetry` (retry-registry.js:440-467) just sets map entries;
  `hasActiveOperationDispatchDeferredRetry` (:489-503) lazily clears past deadlines. NOTHING is scheduled
  to fire at the deadline. Who records it / who reads it: TBD below.
- `transitionRetryGraceDeadlineByOperationId` via OperationWorkflowTransitionRetryGrace
  (operation-workflow-transition-retry-grace.js) — passive deadline; recorded by
  `canContinueCoordinatorCreatedRemoteHandoff` (dispatch-rearm-evidence.js:717-739) BEFORE the handoff
  timer is armed, and by transition-retry paths. Grace makes isOperationStepTimedOut return false
  (dispatch-rearm-evidence.js:580-582) AND makes planner skip rearm.

### Prime suspect loop shape (matches run-22 alternation)
rearm_dispatch → armCoordinatorCreatedOperationProgress → schedules handoff follow-up
(grace recorded + timer armed) → next planner tick: skip_live_deferred_retry → timer fires →
wake no-ops/fails silently (all failure exits above are log-free) → maps cleared → grace expires →
planner: rearm_dispatch again → repeat forever, no dispatch RPC ever logged.

## 3. Initial dispatch path (createOperation → first dispatch)

- `createOperation` in src/rebalancer/rebalance-coordinator-operation-creation.js: persists row (:528),
  emits `OPERATION_CREATED` + `await this.armCoordinatorCreatedOperationProgress(operation)` (:558-561)
  ONLY when `shouldEmitOperationCreated`. armCoordinatorCreatedOperationProgress (:576-597) →
  workflowOwner.armCoordinatorCreatedOperation; failures logged as warn 'Failed to prime coordinator-created oper...'.
- `armCoordinatorCreatedOperation` (src/rebalancer/operation-workflow-owner-handoff-state.js:413-533):
  state machine (:52-95):
  - LOCALLY_OWNED_PENDING → CLAIM_AND_APPLY_LOCAL_PRIME → `claimPendingDispatchOperation` then
    prime action (:612-635): DISPATCH_AFTER_CLAIM only for critical-system or priority-control-plane
    partitions (:540-551); DEFAULT partitions → CLAIM_ONLY → **claim without dispatch**; returns true.
    Ordinary partitions then depend on "canonical event/read-model paths" for actual dispatch.
  - LOCALLY_OWNED_DISPATCHABLE (locally owned + isDispatchRetryableWorkflowStep, step != PENDING)
    → `dispatchOperationInternal` (:484-485).
  - REMOTE_OWNED_DISPATCHABLE → handoff timeout decision; if shouldStop → clear retry + return false
    (silent); else `wakeCoordinatorCreatedRemoteOwner` (:513-522).
- `wakeCoordinatorCreatedRemoteOwner` (same file :205-301):
  - self-owned (ownerNodeId === this.nodeId) → `dispatchSelfOwnedCoordinatorCreatedHandoff` (:222-224)
    → clearCreatedOperationHandoffRetry + `dispatchOperation(operation, {skipWhenOwnerLaneHeld: true})`
    (:372-399). NOTE skipWhenOwnerLaneHeld: if owner lane busy the dispatch is SKIPPED — return value
    counts DEFERRED_RETRY_PENDING as success; other skip reasons return false with no retry armed here.
  - remote → messageRouter.deliver to `${ownerNodeId}/service/replica-dispatch` with
    REPLICA_OPERATION_DISPATCH msg (:254-266); non-delivered → deferCoordinatorCreatedRemoteHandoffRetry;
    delivered → schedule verification follow-up (COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS,
    replaceExisting) (:286-293).
- `deferCoordinatorCreatedRemoteHandoffRetry` (src/rebalancer/operation-workflow-coordinator-handoff-retry.js:107-202):
  state table :44-73. KEY EXITS:
  - INELIGIBLE (not priority partition / non-retryable error) → REJECT → false → caller usually throws or
    logs OPERATION_DISPATCH_RETRY_FAILED.
  - LOCAL_TRANSITION_RETRY_ACTIVE (locallyOwned && transitionRetryGraceActive) → **ACCEPT_EXISTING → true
    with NOTHING armed** — the passive grace is treated as if it were a driver. Deadline-without-driver
    candidate #1: locally-owned op fails handoff/dispatch, grace is active → defer "accepted", no timer.
  - LOCAL_OWNER (locallyOwned, no grace) → no action in table → REJECT.
  - ACTIVE_HANDOFF_RETRY → ACCEPT_EXISTING (timer exists, fine).
  - SCHEDULE_REMOTE_HANDOFF → per-target cap check (shed w/ warn) → scheduleCoordinatorCreatedRemoteHandoffFollowUp.
- ALSO: `scheduleCoordinatorCreatedRemoteHandoffFollowUp` override in owner-handoff-state.js:141-154
  returns false for locally-owned ops — remote follow-up machinery never applies to self-owned ops.
- `scheduleCoordinatorCreatedRemoteHandoffFollowUp` (dispatch-rearm-evidence.js:740-814):
  calls `canContinueCoordinatorCreatedRemoteHandoff` (:717-739) which RECORDS transitionRetryGrace for
  delayMs BEFORE the timer is armed. Timer fires → re-read op → guards (terminal / not retryable /
  timeoutDecision.shouldStop → clearCreatedOperationHandoffRetry, silent return false) → wakeCoordinatorCreatedRemoteOwner.

## 4. replica-dispatch-service deferral ('Deferred replica operation dispatch while control-plane path recovers')

- Log constant at src/control-plane/replica-dispatch-service-constants.js:29
  (DISPATCH_LOG_MSG.OPERATION_DISPATCH_DEFERRED).
- Emitted from `deferOperationDispatchRetry` (src/control-plane/replica-dispatch-retry-scheduling.js:193-261).
  This DOES arm a real timer: `armDeferredOperationDispatchRetry` (:269-323) → on fire, deletes entry,
  clears the owner-side deadline map, and RE-ENQUEUES into `this.operationDispatchQueue.enqueue(operationId,
  RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH, ...)` (:312-316). So the dispatch-service deferral is
  self-driving (within the dispatch service process).
- It also PUBLISHES the deadline to the workflow owner:
  `recordWorkflowOwnerOperationDispatchDeferredRetry` (:124-154) →
  owner.recordOperationDispatchDeferredRetry → the deadline-only maps in (2). Cleared on timer fire (:295)
  and clearDeferredOperationDispatchRetry (:490-501).
- Consumers of the owner-side deadline (hasActiveOperationDispatchDeferredRetry):
  operation-workflow-owner-ports.js:419-421, operation-workflow-owner-priority-recovery-reentry.js:353-355,
  operation-workflow-recovery-reconcile-dispatch-pending.js:547-549, operation-workflow-owner.js:280-282 —
  all gates that SKIP driving the op while the dispatch service claims the next attempt. If the dispatch
  service's timer dies (service shutdown/restart) without clearing the owner map, the stale deadline
  self-expires on read (retry-registry.js:498-501), so suppression is bounded by retryAfterMs.
- RUN-22 significance: this log appearing only at teardown means the dispatch service never received a
  dispatch attempt mid-run — the stall is UPSTREAM of replica-dispatch-service.

## 3b. Ordinary (event/read-model) dispatch drivers — the "canonical paths"

- OPERATION_CREATED event consumer: replica-dispatch-service-lifecycle.js:255-270 registers
  `handleCoordinatorOperationCreated` (:597-616): PENDING only; locally-owned → enqueue into
  `operationDispatchQueue` (RECONCILE_REASON.COORDINATOR_OPERATION_CREATED); remote-owned →
  `sendDirectDispatchWakeup`.
- CDC/cache replay: `handleCdcApplied` (:558-588) and `handleCacheNodeChange`
  (replica-dispatch-reconcile-callbacks.js:281-331) → replayReplicaOperationRow for
  replica_operations rows; restart replay `enqueueCachedReplicaOperationRetriesOnInitialize`
  (replica-dispatch-service-lifecycle.js:322+).
- Queue consumer: `reconcileOperationDispatch` (src/control-plane/replica-dispatch-reconcile-callbacks.js:110-181):
  resolves row; PENDING/SENDING rows → `dispatchOperationRow` (readiness-gated) or (replay-execute class) →
  `rebalanceCoordinator.dispatchOperation` → workflowOwner.dispatchOperation
  (rebalance-coordinator-owner-delegation-methods.js:101-102). On retryable error →
  deferOperationDispatchRetry (the 250ms deferral in section 4).
- The transport ingress for remote wakes: `directDispatchServiceHandler`
  (replica-dispatch-service-lifecycle.js:230-247), msg type REPLICA_OPERATION_DISPATCH →
  handleReplicaOperationDispatch.

## 5. SENDING vs PENDING

- SENDING is written by `claimPendingDispatchOperation`
  (src/rebalancer/operation-workflow-dispatch-execution.js:42-73): PENDING + coordinator-owned +
  locally-owned → either priority narrow path `claimPriorityDispatchTransition`
  (operation-workflow-transition-persistence.js:37-150+, CAS-guarded persisted SENDING transition) or
  plain `updateStep(operation, SENDING, DISPATCH_SENDING)` (:66-71). On priority-claim failure with no
  live retry: builds a retryable claim error and arms deferDispatchRetry (:58-63) — driver exists.
- SENDING → actual RPC: dispatchOperationInternal (dispatch-execution.js:243-329) claims (PENDING) or
  passes (SENDING) → `executeOperationInternal`
  (src/rebalancer/operation-workflow-dispatch-response-reconcile.js:162-430+):
  remove-safety eval, builds request, target `${dispatchNodeId}/service/<handler>`, logs
  REBALANCE_COORDINATOR_LOG_MSG.SEND_OPERATION ('Sending replica operation') at **logger.debug**
  (:396-403 — NOTE: at info log level, real dispatch attempts are INVISIBLE in run logs; absence of
  dispatch logs in run-22 does not by itself prove no RPC, though absence of any retry-deferral WARNs
  plus stuck PENDING step does).
  Delivery failure → deferDispatchRetry → skipped DEFERRED_RETRY_PENDING, else failOperation (:414-429).
- Yes, an op can sit SENDING with a half-started dispatch: SENDING persists before delivery; if the
  process's in-memory timers die (restart) the durable row stays SENDING. isDispatchRetryableWorkflowStep
  includes SENDING (dispatch-rearm-evidence.js:154-157), and reconcileOperationDispatch accepts
  workflow_step SENDING (reconcile-callbacks.js:145-151), so recovery paths CAN re-drive SENDING — but the
  PLANNER reuse path cannot (skip_not_pending, intent-methods.js:461-465).

## 5b. Transition-retry + grace mechanics (the alternation engine)

- `deferTransitionRetry` (src/rebalancer/operation-workflow-transition-retry.js:144-211): non-retryable
  error → REJECT (silent false). Otherwise records op snapshot AND **records transitionRetryGrace on
  EVERY accept, incl. REUSE_TIMER** (:162-168). New timer logs warn OPERATION_TRANSITION_RETRY_DEFERRED
  (:174-184); REUSE_TIMER is silent. Timer fire (:185-209): shutdown → drop; uninitialized →
  rearmTransitionRetryWhileUninitialized (:77-96 — if shouldRetain fails, **silent drop, no log**);
  else resumeDeferredTransitionOperation (:98-142): outcome CLEAR_RETRY / DISPATCH
  (runOperationOwnerAction) / else reconcileTimeoutOperation.
- Grace record (src/rebalancer/operation-workflow-transition-retry-grace.js:38-87): deadline =
  max-merged min(ceiling, now+delayMs). Ceiling for critical/priority partitions at PENDING/SENDING/
  ACTIVE/STOPPING = createdAt + TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS (:111-124,
  usesOperationBudget :135-159).
- **REBALANCE_OPERATION_BUDGET_MS = 300000 (5 min)** — src/control-plane/timeout-budget.js:17.
  So a critical-partition PENDING op with recurring grace records is shielded from the step-timeout
  reaper (isOperationStepTimedOut returns false while grace active, dispatch-rearm-evidence.js:580-582)
  for up to 5 minutes from createdAt. A 3-minute run-22 pin fits ENTIRELY inside this shield —
  explains checkTimeouts never failing the op.
- Delay constants (src/rebalancer/operation-workflow-owner-shared.js:363-374):
  DISPATCH_RETRY_DELAY_MS=250, DISPATCH_RETRY_MAX_DELAY_MS=8000, TRANSITION_RETRY_DELAY_MS=250,
  SAFETY_DEFERRED_RETRY_DELAY_MS=1000, COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS=1000.
  Dispatch-service OPERATION_DISPATCH_RETRY_AFTER_MS=250 (replica-dispatch-service-constants.js:88).

## 5c. Priority claim deferred-local path
- claimPriorityDispatchTransition (operation-workflow-transition-persistence.js:37-212): CAS persist of
  SENDING with expectedWorkflowStep PENDING. On retryable persist error +
  shouldUsePriorityDispatchDeferredLocalClaim → sets priorityDeferredClaimExpectedStep=PENDING, applies a
  LOCAL-ONLY progress row, and returns the op as claimed with in-memory step SENDING while the DURABLE
  row is still PENDING (:145-159). Dispatch then proceeds; later reads of the durable row still say
  PENDING (matches run-22 durable PENDING with occasional in-memory SENDING views).
- transitionCommitted=false + authoritative still PENDING → return null → caller arms deferDispatchRetry
  (dispatch-execution.js:58-63) — driver exists, but logs only on first arm.

## 5d. Operation OWNERSHIP rule (critical for which node must dispatch)

- `resolveOperationOwnerNodeId` (src/rebalancer/replica-operation-repository-row-methods.js:135-170):
  **for an UNSETTLED REPLACE on a system-table or priority control-plane partition, the owner is the
  TARGET node** (:146-162, "Keep canonical ownership on the target from initial dispatch through source
  removal"). Otherwise owner = sourceNodeId, else targetNodeId.
- Consequence: a replica_operations-p1 REPLACE created by coordinator C with target T != C is
  REMOTE-owned from C's perspective → C's arm path is WAKE_REMOTE_OWNER (transport to
  T/service/replica-dispatch); C itself NEVER runs claim/dispatch. All local drivers on C reduce to
  wake+verify cycles. If T's side gates the wake away (drain-snapshot gate, readiness, initialization),
  NOTHING dispatches, while C's planner alternates rearm_dispatch (wake) / skip_live_deferred_retry
  (handoff verify timer+grace live) — exactly the run-22 signature.
- Target-side ingress: handleReplicaOperationDispatch
  (src/control-plane/replica-dispatch-operation-execution.js:56-80) → operationDispatchQueue
  (MESSAGE_DISPATCH_REQUEST, refresh row) → reconcileOperationDispatch → dispatchOperationRow (:167+):
  guards: not coordinator-owned type → silent return; dispatchInFlight → silent return; not locally
  owned → sendDirectDispatchWakeup (forwards to resolved owner — potential wake ping-pong if ownership
  views differ between nodes); readiness capture error/not-ready → deferOperationDispatchRetry
  (self-driving, logs).

## 5e. Handoff budget expiry = silent de-drivering (no terminalization)

- buildCoordinatorCreatedRemoteHandoffTimeoutDecision (dispatch-rearm-evidence.js:671-716):
  shouldStop = stepTimedOut && !operationBudgetActive (:710). While grace is active stepTimedOut is
  false (isOperationStepTimedOut :580-582), and every follow-up re-records grace
  (canContinueCoordinatorCreatedRemoteHandoff :726-738) with ceiling createdAt+300s — so the wake/verify
  loop self-sustains ~5min, then grace ceiling passes → canContinue false → follow-up scheduling fails →
  shouldStop flips true.
- ALL three shouldStop exits clear the retry and return false with NO log and NO failOperation:
  operation-workflow-owner-ports.js:696-699 (wake port), owner-handoff-state.js:517-519 (arm),
  dispatch-rearm-evidence.js:786-789 (follow-up timer callback). Post-budget, the op is permanently
  pre-dispatch with no driver and no evidence, relying solely on the timeout reaper.

## 6. checkTimeouts — full detail in research-sub-checktimeouts-recovery.md
Key points: 1s reaper interval (rebalance-coordinator-lifecycle.js:603-627), PENDING/SENDING step
timeout = pendingTimeoutMs default 30000 (rebalancer-constants.js:74-84;
operation-workflow-recovery-status-reconcile.js:362-388); reaper's only action = failOperation
(status-reconcile.js:577-589); grace early-return :495-508 shields it for up to createdAt+300s.
Orphan scan reconcileOrphanedOperations (operation-workflow-recovery-timeout.js:325-433) ignores
grace but uses an UN-supplemented visibility read (:343-348) — ops visible only via owner-RPC
supplement are invisible to it. Drain gate ALLOWS locally-owned ops
(operation-workflow-recovery-drain.js:359-405; reconcile-shared.js:615-634); the route-away/no-op
class applies to remote-owned only.

## 7. Ledger interlock — full detail in research-sub-ledger-interlock.md
Key points: heldSelfMoveOperationId has NO autonomous release driver (admission.js:281-283, release
only via tryClearHeldOperationLedgerSelfMove :393-416 called from create attempts :259/:305); while
held, ALL non-emergency creates rejected (:294-329); reuse path bypasses the interlock entirely
(operation-creation.js:88-93 before :114); budget lane coalescing (concurrent-add-budget.js:26-27 +
durable-workflow-coordinator.js:504-505) can hand a creator the WRONG op and set the hold to a
foreign operationId.

## FINAL: ranked candidate holes (op sits pre-dispatch forever, no driver)

RANK 1 — Deadline-without-driver: passive grace + scan invisibility + no timer.
  transitionRetryGrace.deadlineByOperationId is a pure map entry (no timer), pinned to
  createdAt+300000 for priority partitions (transition-retry-grace.js:120-123,135-159). While live it
  (a) early-returns the reaper (status-reconcile.js:495-508; rearm-evidence.js:580-582),
  (c) makes the planner log skip_live_deferred_retry (intent-methods.js:467-469 →
  isOperationDeferredRetryActive → hasActiveTransitionRetryGrace, rearm-evidence.js:118-127).
  If additionally the op is invisible to the orphan scan's un-supplemented read (timeout.js:343-348)
  and the transition-retry TIMER is gone (deferTransitionRetry returned false on a non-retryable error,
  transition-retry.js:159-161, leaving stale grace), ALL drivers are off for up to 5 minutes. Matches
  run-22: 3-min pin, zero dispatch logs, reaper silent.

RANK 2 — Remote-owned wake loop with silent target (run-22 alternation signature).
  Ownership of unsettled system/priority REPLACE = TARGET node (row-methods.js:146-162). Coordinator
  can only wake T (owner-handoff-state.js:413-533 → wakeCoordinatorCreatedRemoteOwner :205-301);
  delivered wake arms verify follow-up (1s) + grace → skip_live_deferred_retry; follow-up timer fire
  window (map deleted :765-768 before async re-arm) → planner sees rearm_dispatch → wake again.
  If T's dispatch service gates the wake (dispatchInFlight :179-181, readiness defer, remote drain
  no-op drain.js:423-451), the cycle produces zero dispatches while alternating actions forever.
  After the 5-min budget all three shouldStop exits stop the loop SILENTLY with no failOperation
  (owner-ports.js:696-699; owner-handoff-state.js:517-519; rearm-evidence.js:786-789).

RANK 3 — Interlock hold with no autonomous release + reuse bypass (new circular formation shape).
  heldSelfMoveOperationId released only by later create attempts (admission.js:281-283, :393-416);
  while held, EVERY non-emergency create rejected (:294-329) — siblings dammed. Reused self-move never
  re-enters the interlock (operation-creation.js:88-93) and its progress writes route through the very
  partition being moved (structural self-write circularity). Persist(:528)+cache(:550) precede the
  error-swallowed arm (:576-597) → durable PENDING with arm skipped.

RANK 4 — Budget-lane coalescing returns wrong op (concurrent-add-budget.js:26-27 scope-only key;
  durable-workflow-coordinator.js:504-505 coalesce): second creator's factory never runs; planner can
  endlessly reuse an op that no creator armed; interlock hold can be set to a foreign opId.

RANK 5 — CLAIM_ONLY prime for DEFAULT (non-priority) partitions (owner-handoff-state.js:34-36,
  :612-635): claim writes SENDING (dispatch-execution.js:66-71) then returns true WITHOUT dispatch;
  planner thereafter answers skip_not_pending (SENDING, intent-methods.js:461-465). Only the
  dispatch-service queue / orphan scan can re-drive; if the row is scan-invisible, permanent SENDING.

RANK 6 — Silent timer-callback exits drop the retry chain: deferDispatchRetry fire guards
  (rearm-evidence.js:396-403), safety retry (:528-535), handoff follow-up (:775-789) all return
  silently on !locallyOwned/terminal/not-retryable-step; nothing rearms, no log. Ownership flips
  (REPLACE settling changes owner target↔source, row-methods.js:146-168) can make a previously-armed
  local timer permanently no-op.

RANK 7 — Grace treated as driver in handoff-retry admission:
  deferCoordinatorCreatedRemoteHandoffRetry LOCAL_TRANSITION_RETRY_ACTIVE → ACCEPT_EXISTING (returns
  true, nothing armed) on the basis of a passive grace record (coordinator-handoff-retry.js:52-59,
  :124-129). Callers believe a retry exists.

Observability note: real dispatch attempts log only at DEBUG (SEND_OPERATION,
  dispatch-response-reconcile.js:396-403; rebalancer-constants.js:237) — absence of dispatch logs at
  info level is weak evidence; absence of OPERATION_DISPATCH_RETRY_DEFERRED / TRANSITION_RETRY_DEFERRED
  warns is the stronger signal.
