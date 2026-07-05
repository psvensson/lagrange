# Bisect: silent arm skip for remote-owned priority ledger self-move

## Goal
Find precondition where creating a REMOTE-owned priority ledger self-move leaves it idle in
PENDING: no wake, no OPERATION_DISPATCH_RETRY_DEFERRED warn, and hasLiveDeferredDispatchRetry
true (a registered deferred retry that never fires). Make DT test red-on-head.

## Code map (verified)
Adapter arm path (owner.js:597 armCoordinatorCreatedOperation):
1. readDurableOperation (ports.js:559): mode=COORDINATOR_CREATED → selectCoordinatorCreatedRemoteHandoffSnapshot
   first. For a remote-owned PENDING priority-partition op the snapshot is READY → NO authoritative
   read at all; falls back to queryAuthoritativeOperationById only when snapshot ineligible.
2. Evidence built (adapter.js:41): serialDependency port = constant CLEAR (ports.js:390);
   publicationFence port = constant CURRENT (ports.js:448). So candidates 2 (publication fence)
   and 5 (serial dependency) CANNOT fire from this path unless context injects them — context in
   the arm path is {mode, fallbackOperation} only. => cand 2/5 likely dead for the arm seam.
3. Event resolution ORDER (operation-lifecycle-event-resolution.js):
   ... PUBLICATION_ACCEPTED(85) ... SERIAL_DEPENDENCY_PENDING(116) ...
   RETRY_REQUESTED(140): REMOTE_AUTHORITATIVE && retryBudget.deadlineState===ACTIVE &&
     dispatchObservation idle && wakeState REQUIRED  → outcome WAIT_FOR_REBALANCER_HANDOFF_RETRY,
     effect NO_OPERATION_EFFECT → ports.waitForOwnerProgress() → returns false (ports.js:823).
     *** SILENT NO-WAKE, applied=false, arm returns false, no warn. ***
   REMOTE_OWNER_WAKE_REQUIRED(155) only when no active retry.
4. retryBudget (ports.js:425): hasActiveOperationWorkflowOwnerPortRetry(owner, opId) =
   hasActiveCreatedOperationHandoffRetry(opId) || hasActiveOperationDispatchDeferredRetry(opId).
5. wakeRemoteOwner port (ports.js:673): if hasActiveOperationWorkflowOwnerPortRetry → return true
   WITHOUT waking (suspect #2 — but result.applied=true then; still silent no-wake).
6. wakeCoordinatorCreatedRemoteOwner (handoff-state.js:205):
   - ownerNodeId unresolvable → buildCoordinatorCreatedDispatchIngress(null) → null → return false
     SILENTLY (no warn, no retry). Silent but does NOT register retry.
   - success → scheduleCoordinatorCreatedRemoteHandoffFollowUp(VERIFICATION_DELAY) → registers
     createdOperationHandoffRetryTimer + transitionRetryGrace (benign; would satisfy
     hasLiveDeferredDispatchRetry).
7. hasLiveDeferredDispatchRetry (intent-methods.js:482): isOperationDeferredRetryActive
   (dispatchRetryTimer | transitionRetryTimer | transitionRetryGrace) || hasActiveCreatedOperationHandoffRetry.
8. Silent registrars found so far (no OPERATION_DISPATCH_RETRY_DEFERRED warn):
   - replica-dispatch-retry-scheduling.js:336 scheduleRemoteDispatchWakeupVerification —
     dispatch SERVICE registers workflowOwner.recordOperationDispatchDeferredRetry with NO log.
   - deferOperationDispatchRetry (same file:193) — logs INFO DISPATCH_LOG_MSG.OPERATION_DISPATCH_DEFERRED
     (different message), registers recordWorkflowOwnerOperationDispatchDeferredRetry.
     NOTE: hasActiveOperationDispatchDeferredRetry feeds retryBudget → RETRY_REQUESTED, but is NOT
     checked by hasLiveDeferredDispatchRetry (intent-methods)! So dispatch-deferred-retry alone
     silences the ARM but does NOT explain SKIP_LIVE_DEFERRED_RETRY... unless
     isOperationDeferredRetryActive picks something else up.
   - canContinueCoordinatorCreatedRemoteHandoff records transitionRetryGrace (rearm-evidence.js:717)
     — called from scheduleCoordinatorCreatedRemoteHandoffFollowUp.

## Leading hypothesis (to verify in logs + test)
A live deferred dispatch retry / handoff retry keyed to the NEW op id existed at arm time →
lifecycle resolves RETRY_REQUESTED instead of REMOTE_OWNER_WAKE_REQUIRED → waitForOwnerProgress
(no-op, returns false) → arm returns false silently; the same registered retry then suppresses the
planner rearm (SKIP_LIVE_DEFERRED_RETRY); if that retry's timer belongs to a lane that self-cancels
(e.g. dispatch-service retry whose fire-path drops when row not visible/not locally owned), it
never actually wakes anyone.

Open question: WHAT registered the retry for a freshly minted op id within 47ms — need logs.

## Log corroboration (run-26, node-4 = 4cd17f0d, node-3 = 7c9c5c6f)
- :48.690 planner pass (trigger periodic, moveCount=3). Move 2 creates op-2 8b4aba59 at :48.706
  ("Creating operation"), reservation :48.751; the ARM runs (awaited) and produces ZERO log lines;
  move 3 executes :48.752 and its create dedupes onto op-2 → :48.753 "Reusing in-flight operation"
  rearmAction=skip_live_deferred_retry. So the arm COMPLETED (creation awaits it) and by :48.753 a
  LIVE created-operation handoff retry existed for the fresh op id — registered silently INSIDE the
  arm. The only fully-silent registrar reachable from the arm is
  scheduleCoordinatorCreatedRemoteHandoffFollowUp — the WAKE-SUCCESS verification follow-up
  (handoff-state.js:287, delay = COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS = 1s).
  => the wake deliver() RESOLVED AS DELIVERED (acknowledged:true).
- node-3 has NO op-2 activity until :57.447 (claim via priority_claim_cas replay cascade); node-3
  startupPhase complete only at :49.293 — mid-startup at :48.75.
- FALSE-ACK MECHANISM (architectural): message-router-inbound-dispatch.js:256-269
  handleServiceMessage "Sends ACK immediately to release sender-side queue pressure" — the target
  router ACKs acknowledged:true BEFORE checking this.handlers.has(targetAddress). With the
  dispatch-service ingress handler NOT yet registered (restart re-init: coordinator init precedes
  dispatch-service init — documented in handoff-state.js:216-221), the message is dropped
  (noHandler goes back only as a LATE async SERVICE_RESPONSE; receive side logs only at debug).
  classifyTransportDeliveryOutcome({acknowledged:true}) → DELIVERED (transport-semantic-outcome.js:168-175).
- Dead-retry mechanism: the 1s verification timer fires →
  getDeferredDispatchRetryOperation (dispatch-rearm-evidence.js:424) →
  repository.getOperationByIdVisibilityObservation → the op row lives in the ledger partition BEING
  MOVED and is CDC/read-starved ("No row found for CDC update" :51.439/:57.884) → observation has
  no operation and no deferredOutcome → resolveDeferredRetryVisibleOperation → null →
  clearCreatedOperationHandoffRetry, return false (rearm-evidence.js:774-780) — SILENT self-cancel,
  no wake, no warn. (The late noHandler SERVICE_RESPONSE path onLateDispatchDeliveryHonored
  (handoff-state.js:316) clears the retry the same way when the row is invisible.)
- Why no later rescue by the planner: after creation the priority planning gate blocks on
  topology_operations_in_flight (":48.802/:51.374 Waiting for transitional cluster membership to
  settle", inFlightReplicaOperations:1) — the :48.753 dedupe rearm was the ONLY rearm opportunity,
  and it was suppressed by the (about-to-die) verification retry.
- op-2's next creator-side touch: :10:03.150 warn OPERATION_DISPATCH_RETRY_DEFERRED (SYNCING,
  ROUTER_CONNECTION_CLOSED) — proving the wake path DOES warn when deliver fails; its silence at
  :48.75 means deliver "succeeded" (ACK).

## Candidate disposition
1. Full create path/interlock/affectedRows → not the trigger (create+arm completed normally).
2. Publication/visibility-deferred insert → publicationFence port is CONSTANT CURRENT in the arm
   path (ports.js:448) — cannot fire from this seam. DEAD.
3. Pre-registered port retry at wake time → impossible for a fresh UUID; but the INVERSE happens:
   the arm itself registers the (dead) retry via the false-ACK success path. ROOT CAUSE VARIANT.
4. systemTableCache shape → not needed; owner resolution (resolveOperationOwnerNodeId,
   replica-operation-repository-row-methods.js:135-169) uses the op row itself (unsettled priority
   REPLACE ⇒ owner = targetNodeId). DEAD.
5. Serial dependency → serialDependency port is CONSTANT CLEAR (ports.js:390). DEAD.

## WINNING PRECONDITION
Remote-owned priority ledger self-move + wake deliver() resolves acknowledged:true while the
target never processes it (ACK-before-handler; target mid-startup) + the op row is not visible to
getOperationByIdVisibilityObservation (row lives in the moving ledger). Then:
armCoordinatorCreatedOperation returns true silently, the only follow-up is a 1s verification
retry that self-cancels on the invisible row (never fires a wake), and its 1s live window
suppresses the planner's only rearm (SKIP_LIVE_DEFERRED_RETRY).

## Test variant (RED on head) — DONE, verified twice + lint clean
New subtest in test/rebalancer/dt6-ledger-spread-follow-up-dispatch-arming.test.js:
"run-26 root cause: ACK-swallowed wake + read-starved op row — the silent 1s verification retry
self-cancels without ever re-waking the remote owner while its live window suppresses the only
planner rearm (RED on the unfixed head)"

Shape: deliver stub returns {acknowledged:true} (transport ACK; message dropped by the
mid-startup target — ACK-before-handler), queryAuthoritativeOperationById → null AND
getOperationByIdVisibilityObservation → null (moving-ledger invisibility). After arm:
rearmAction sampled === 'skip_live_deferred_retry' (mirrors node-4 12:09:48.753); wait 2.5s
(> 1s verification window); binding assert: deliveries >= 2 (retry actually re-fired a wake)
OR rearmAction === 'rearm_dispatch'.

RESULT on head (2 runs, deterministic):
  ok  - the arm produced exactly one (ACK-swallowed) wake delivery (armed=true)
  not ok - ... (deliveries=1, rearmAction=skip_live_deferred_retry, retryStillLive=false)
retryStillLive=false at t+2.5s with zero new deliveries proves the retry was live at t0 (it
suppressed the rearm) and then died without firing — the exact run-26 idle mechanism.
Both pre-existing subtests remain green. eslint clean.

## Fix seams indicated (in preference order)
1. retry-must-fire: getDeferredDispatchRetryOperation / onLateDispatchDeliveryHonored must treat
   a NULL visibility observation (no row, no deferredOutcome) for a coordinator-created priority
   op as "retry with the retained operationSnapshot" instead of clearCreatedOperationHandoffRetry
   (operation-workflow-dispatch-rearm-evidence.js:772-780; the snapshot is already captured at
   :761). The row being unreadable IS the expected state — it lives in the partition being moved.
2. wake-despite-deferral variant: don't classify a bare transport ACK as owner-woken for
   coordinator_created_remote_handoff — require the SERVICE_RESPONSE (handler outcome); noHandler
   must route into deferCoordinatorCreatedRemoteHandoffRetry (which warns + schedules a firing
   retry).
3. rearm-not-suppressed variant: hasLiveDeferredDispatchRetry could ignore the 1s verification
   follow-up, but that only reopens ONE rearm chance and the planner gate is blocked afterwards —
   weakest fix alone.
