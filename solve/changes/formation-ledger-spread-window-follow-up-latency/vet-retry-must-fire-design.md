# Adversarial vet: retry-must-fire design (formation-ledger-spread-window-follow-up-latency)

Status: COMPLETE. Verdict: AMEND -> GO (part 1 with amendments R1-R5; part 2 INCLUDE minimal
rebalancer-side variant; part 3 SUFFICIENT with part 1 alone; part 4 controls listed).

Inputs: quest JSON (c-class verified: no timeout raises, no run-20/run-22 weakening, no demo
waits), research-spread-window-gap.md, bisect-silent-arm-skip.md, and direct source verification
of every file:line cited below.

---

## PART 1 — retry-must-fire. VERDICT: GO WITH AMENDMENTS

Firing path confirmed exactly as designed: operation-workflow-dispatch-rearm-evidence.js:764-796.
Timer fires -> getDeferredDispatchRetryOperation(operationId, operationSnapshot) (:772) ->
resolveDeferredRetryVisibleOperation (:440-452): visible row -> row; deferredOutcome+fallback ->
snapshot clone; else NULL -> clearCreatedOperationHandoffRetry + return false (:774-780) SILENT.
Snapshot retained at :761 (with a dangerous `|| {operationId}` fallback — see R1).

### (a) Bound — VERIFIED, it binds on snapshot-only evidence, but the stop is SILENT
- buildCoordinatorCreatedRemoteHandoffTimeoutDecision (rearm-evidence.js:671-716):
  shouldStop = stepTimedOut && !operationBudgetActive.
- stepTimedOut via isOperationStepTimedOut (:576-602) uses step-entry/updatedAt from the FROZEN
  snapshot (row invisible => never refreshed => ages monotonically). pendingTimeoutMs = 30000
  (rebalancer-constants.js:76). Suppressed while transitionRetryGrace is active — but grace is
  CAPPED: transition-retry-grace.js:64-86 stores min(ceiling, now+delayMs); for a
  priority-partition PENDING op usesOperationBudget=true (:135-159) so ceiling = createdAt +
  REBALANCE_OPERATION_BUDGET_MS = 300000 (timeout-budget.js:17). Grace expires at timer-fire
  time; cannot outlive the budget.
- operationBudgetActive (:699-708) = now < createdAt + 300s, from snapshot createdAt. FROZEN =>
  binds.
- DOUBLE bound: past createdAt+300s, canContinueCoordinatorCreatedRemoteHandoff (:717-739)
  returns false (grace record capped at expired ceiling -> isActive false) so
  scheduleCoordinatorCreatedRemoteHandoffFollowUp refuses to re-schedule (:746-752).
- Worst case (perma-invisible row): ~1 wake/s for up to 300s (see (a-bis)), then stop.
- WHAT HAPPENS AT STOP: `clearCreatedOperationHandoffRetry(operationId); return false` — NO LOG
  (:786-788). The canContinue refusal (:747-752) and the arm-path shouldStop clear
  (owner-handoff-state.js:513-520) are equally silent.

AMENDMENT R2 (required): the bound-stop in the new branch MUST warn (loud-at-stop), otherwise a
never-visible op re-enters exactly the silent-idle class this quest exists to kill. Recommend
also logging the canContinue refusal for this lane (at least once).

AMENDMENT R1 (required): the snapshot fallback `cloneOperationSnapshot(operation) || {operationId}`
(rearm-evidence.js:761-763) can retain a timestamp-less snapshot. With no finite
createdAt/updatedAt: resolveTimeoutCeilingMs returns null (grace uncapped,
transition-retry-grace.js:108-110), isOperationStepTimedOut returns false (:595-597), and
operationBudgetDeadlineMs is null -> shouldStop can NEVER become true -> the re-wake loop is
UNBOUNDED. The new branch must require a snapshot with finite createdAt (else keep today's
clear, plus WARN). In practice arm-time snapshots carry full rows
(owner-handoff-state.js:435-444), so this is a guard, not a behavior change.

### (a-bis) Backoff — the design's "EXISTING delay resolver" will not actually back off
wakeCoordinatorCreatedRemoteOwner on DELIVERED (owner-handoff-state.js:286-294) calls
resetCreatedOperationHandoffRetryAttempts + re-schedules the FIXED 1s verification
(COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS = 1000, owner-shared.js:373) with
replaceExisting:true. So if the null-observation branch re-wakes via
wakeCoordinatorCreatedRemoteOwner(snapshot) and the wake false-ACKs again, the attempt counter
resets and the cadence pins at 1s; resolveCreatedOperationHandoffRetryDelayMs
(owner-retry-registry.js:325-360; base 250ms, x2, cap 8s, jitter 20%) never engages.
AMENDMENT R3 (decide explicitly, either is acceptable):
  (a) accept the 1s verification cadence as the loop (bounded by R1/R2 at 300s; ~300 wakes/op
      worst case; per-target shed cap 4 exists only on the failure path,
      coordinator-handoff-retry.js:135-165, and does not gate this) — then do not claim backoff
      in the design; or
  (b) after the re-wake returns, re-schedule with resolveCreatedOperationHandoffRetryDelayMs and
      replaceExisting:true, and skip the attempts-reset when the observation was null (needs a
      way to distinguish bare-ACK success from verified-visible success).
(a) is simpler and honest; in the real scenario one re-wake suffices (owner startup completes
<1s after the swallowed wake).

### (b) Duplicate dispatch — SAFE (verified)
- Owner-side wake ingress handler: replica-dispatch-service-lifecycle.js:230-247 -> 
  handleReplicaOperationDispatch (replica-dispatch-operation-execution.js:56-80) -> enqueue with
  REFRESH_ROW_BEFORE_DISPATCH:true.
- reconcileOperationDispatch (replica-dispatch-reconcile-callbacks.js:91-101, 110-181): prefers
  a FRESH authoritative row; a post-claim row (workflow_step not PENDING/SENDING) -> clear +
  return no-op (:145-151); terminal -> same; absent row + no context row -> clear + return
  (:120-123).
- Caveat: on refresh-miss it FALLS BACK to the stale wake row (:100) — but then
  claimPriorityDispatchTransition (operation-workflow-transition-persistence.js:37-46) is
  single-flight (runReplicaOperationTransitionExclusive) and CAS-guarded on the durable PENDING
  row, plus dispatchInFlight dedup (replica-dispatch-operation-execution.js:179). A re-wake to
  an owner that already claimed is a harmless no-op. The wake row is only a hint; the owner
  re-reads. ATTACK FAILS.

### (c) Snapshot staleness — SAFE (same evidence as (b))
The wake is a nudge: owner refreshes before dispatch; terminal/absent/claimed rows are dropped
without action (reconcile-callbacks.js:120-151). Even the worst case (stale PENDING context row
used because authoritative read misses) dead-ends at the CAS. ATTACK FAILS.

### (d) Livelock / suppression honesty — SAFE, one benign race
- hasLiveDeferredDispatchRetry (rebalance-coordinator-operation-intent-methods.js:482-504) =
  isOperationDeferredRetryActive (dispatch timer | transition timer | transition grace,
  rearm-evidence.js:118-127) || hasActiveCreatedOperationHandoffRetry. While the follow-up is
  live the planner skips (SKIP_LIVE_DEFERRED_RETRY, :467-468) — with a retry that now actually
  FIRES, this suppression is honest ("the dispatch layer already owns the next attempt",
  comment :448-454 becomes true).
- No mutual deferral: the retry lane never waits on the planner; at bound-stop
  clearCreatedOperationHandoffRetry drops the timer AND the grace ceiling has expired with it,
  so the next planner reuse tick resolves REARM_DISPATCH (:470) -> armCoordinatorCreatedOperationProgress.
- Benign race: hasActiveCreatedOperationHandoffRetry clears a past-deadline-but-unfired timer
  (owner-retry-registry.js:404-411) — a planner tick in that window cancels the pending re-wake
  but simultaneously returns false, flipping the planner to REARM_DISPATCH. Work handed off,
  not lost. NO AMENDMENT.

### (e) Blast radius — one REQUIRED amendment (preempt-cancel), one scoping rule
- The timer callback (:764-796) is shared by all three schedulers of
  scheduleCoordinatorCreatedRemoteHandoffFollowUp: wake-success verification
  (owner-handoff-state.js:287), failure backoff (coordinator-handoff-retry.js:198), late-honor
  re-verification (owner-handoff-state.js:342). All are the same coordinator-created remote
  handoff lane; "invisible row + retained non-terminal snapshot -> re-wake" is uniformly correct
  for all three. OK to change inside the timer callback.
- AMENDMENT R5 (scoping): do NOT modify getDeferredDispatchRetryOperation (:424-439) or
  resolveDeferredRetryVisibleOperation (:440-452) — they are shared with deferDispatchRetry's
  timer (:392) and scheduleDeferredSafetyRetry (:516-527), which act on LOCALLY-owned rows where
  a snapshot fallback could drive stale local actions. The new behavior must live only in the
  follow-up timer callback's null branch (the implementation will need the raw visibility
  observation or a scoped helper to distinguish "null observation" from "terminal").
- AMENDMENT R4 (REQUIRED — preempt-cancel hole): onLateDispatchDeliveryHonored
  (owner-handoff-state.js:316-356) clears the retry when the observation is null (:337-339,
  called with NO fallback snapshot at :333). LATE_RESPONSE_HONORED is emitted for absorbed
  responses with `!error` at TOP level (message-router-inbound-dispatch.js:345-359) — a late
  noHandler SERVICE_RESPONSE carries its error INSIDE `result` (:279-287), so top-level error is
  undefined and the event FIRES. Sequence: wake ACKs -> 1s follow-up armed -> waiter retired
  (e.g. response timeout under load, pending-response-ledger.js:283-291) -> late noHandler
  arrives -> onLateDispatchDeliveryHonored -> row invisible -> clearCreatedOperationHandoffRetry
  CANCELS THE TIMER (owner-retry-registry.js:285-298) BEFORE the retry-must-fire branch ever
  runs. Part 1 implemented only in the timer callback can be preempt-cancelled. Fix: in
  onLateDispatchDeliveryHonored, when the observation is null, LEAVE the live retry alone
  (return without clearing); clear only on visibly-terminal.

---

## PART 2 — RULING: INCLUDE, as a REBALANCER-SIDE branch only (no transport change needed)

The design's premise understates what the transport already delivers. Verified chain:
1. ACK-before-handler confirmed: message-router-inbound-dispatch.js:265-270 (ACK sent, then
   handler lookup).
2. noHandler DOES go back as SERVICE_RESPONSE `result: {noHandler:true, error:...}` (:279-287).
3. The deliver path AWAITS that response after ACK (message-router-delivery-behaviors.js:264-267,
   407-421) and returns `{acknowledged:true, noHandler:true, error:...}`.
4. classifyTransportDeliveryOutcome lets acknowledged:true DOMINATE:
   deliveryState=DELIVERED even when noHandler:true (transport-semantic-outcome.js:158-175),
   though reasonCode='no_handler' and the noHandler flag are preserved (:184-190).
5. wakeCoordinatorCreatedRemoteOwner checks only isDeliveredTransportDeliveryOutcome
   (owner-handoff-state.js:268) -> treats the unhandled wake as SUCCESS. This — not a purely
   "late" response — is the run-26 silent path (node-3's router was up: it ACKed in <47ms and
   would have sent noHandler in the same RTT).

So "route the late noHandler into the warning retry path" is achievable with ZERO ACK-semantics
change: in the DELIVERED branch of wakeCoordinatorCreatedRemoteOwner, if `response.noHandler ===
true`, call deferCoordinatorCreatedRemoteHandoffRetry instead of scheduling the verification.
MANDATORY DETAIL: the raw noHandler outcome FAILS isRetryableControlPlaneError
(control-plane-error-classification.js:175-198 — no deferRetry, no retryAfterMs, no matching
message fragment) so deferCoordinatorCreatedRemoteHandoffRetry would resolve INELIGIBLE ->
reject (coordinator-handoff-retry.js:44-51) -> the wake THROWS MESSAGE_NOT_ACKED
(owner-handoff-state.js:278-283) INSIDE the awaited creation path. Wrap it in a synthetic
retryable error (deferRetry:true + the noHandler message, or retryAfterMs =
REPLICA_OPERATION_DISPATCH_TIMEOUT_RETRY_AFTER_MS) before deferring.
Do NOT touch buildTransportDeliveryOutcome/classifyTransportDeliveryOutcome — other deliver()
consumers may rely on ack-dominant DELIVERED; the interpretation change stays in the handoff
lane. Detection improves from 1s (part 1) to ~RTT, and converts a real misclassification
(DELIVERED for a message nobody handled) into the existing WARNed backoff path
(coordinator-handoff-retry.js:179-201). Cheap, in-class, complementary. If scope pressure
appears mid-implementation, deferring to a follow-up quest is acceptable because part 1 alone
covers the class at +1s latency — but note part 1 alone does NOT cover the DT stub shape where
the response never arrives (deliver then returns {acknowledged:true, error:'pending response
timeout'} at +5s — also DELIVERED); part 1 catches that too via the follow-up, part 2 does not.
They overlap, neither subsumes the other. INCLUDE BOTH.

## PART 3 — RULING: part 1 alone is SUFFICIENT for doneWhen (op-1 is the same class)

Fresh log evidence (run26-node-logs/node-4.log.gz, node-0.log.gz):
- node-4 (op-1 target/owner) "Startup runtime handoff completed" startupPhase=complete at
  12:09:27.118 — 1.8s after op-1's creation (:25.285 node-0). op-1 idled until :37.000 — TEN
  seconds after its owner was fully up. A firing 1s re-wake loop lands by ~:27.3.
- node-0 (creator, seed) has ZERO handoff logs for 46f00560 between :25.322 and :45.5 — the
  same fully-silent arm; and the op row was NOT visible on the creator at +1s (first CDC row
  fetch for it at :31.172 returns "No row found" — the row lives in the concentrated bootstrap
  ledger with deferred visibility). Same precondition: ACK-swallowed wake (node-4 mid-startup at
  :25.3) + row invisible to the creator's verification read -> silent self-cancel -> planner
  suppressed/gated -> priority_claim_cas rescue at :37.000.
- Therefore the retry-must-fire branch fires for op-1 exactly as for op-2; both pre-dispatch
  idles (11.7s + 8.7s) collapse to ~1-2s. Research Q4 projection: removing the class yields
  ~19.1s from CREATE arrival vs the 30s budget (~11s headroom) — vs 31.0s (FAIL) if only the
  inter-move gap were removed. doneWhen (live CREATE TABLE within budget + scenario-harness x3)
  is achievable with part 1 alone; part 2 adds margin, not necessity.
- Residual risk to the live run: per-move exec cost (~11s each, dominated by the 5s learner
  floor) is untouched (in-class per quest: "per-move costs if binding" — projection says not
  binding once idles are gone).

## PART 4 — DT shape: required additional controls

Existing red subtest (test/rebalancer/dt6-ledger-spread-follow-up-dispatch-arming.test.js,
"run-26 root cause...") flips green on deliveries>=2. Add:
1. BOUNDED-STOP control: row never visible; virtual-clock past createdAt+300s
   (REBALANCE_OPERATION_BUDGET_MS) -> retries STOP, timer map empty, AND the new loud-stop WARN
   observed (asserts R2). Also assert stop via the canContinue refusal seam (schedule after
   budget -> returns false).
2. NO-DUPLICATE-DISPATCH control: owner already claimed (row SENDING) receives a re-wake ->
   assert no second dispatch (claim CAS no-op / reconcile clear at
   replica-dispatch-reconcile-callbacks.js:145-151). The re-wake loop guarantees multi-delivery,
   so this control is not optional.
3. PREEMPT-CANCEL control (R4): with the follow-up live and row invisible, fire
   onLateDispatchDeliveryHonored (LATE_RESPONSE_HONORED shape, responseContext=opId) -> assert
   the retry timer SURVIVES and subsequently re-wakes.
4. DEGENERATE-SNAPSHOT guard control (R1): timestamp-less snapshot -> assert clear+WARN, no loop.
5. Part-2 control: deliver stub returns {acknowledged:true, noHandler:true, error:'No handler...'}
   -> assert deferCoordinatorCreatedRemoteHandoffRetry path (OPERATION_DISPATCH_RETRY_DEFERRED
   warn) and a re-wake within backoff delay; plus the timeout shape {acknowledged:true,
   error:'pending response timeout'} stays covered by part 1.
Per c-dt-first: dt:prove red-on-revert for the primary subtest; scenario-harness consecutive 3.

## CONSTRAINT CHECK (c-class / c-vet)
- No timeout/budget raises: design uses existing 30s step timeout + 300s budget. PASS.
- run-20 serialization untouched (wake targets the op's owner; admission gate unchanged);
  run-22 spread-first untouched; no demo-side waits. PASS.
- No new caches/read paths: reuses snapshot already retained at :761, existing wake, existing
  follow-up scheduling, existing bound. REUSED/EXTENDED, NEW = only the WARN + branch. PASS.
- Formation-vs-steady-state circularity: the fix does NOT bypass the ledger; it re-drives the
  transport nudge while treating ledger-invisibility as the expected mid-move state. PASS.

## FINAL: AMEND -> GO
Required amendments before implementation:
- R1 snapshot must carry finite createdAt or fall back to clear+WARN (unbounded-loop guard).
- R2 loud bound-stop (WARN at shouldStop clear; log canContinue refusal for this lane).
- R3 explicit backoff decision (1s verification cadence is acceptable; do not claim backoff
  unless attempts-reset is also gated).
- R4 onLateDispatchDeliveryHonored must not clear on null observation (preempt-cancel hole).
- R5 keep the change inside the follow-up timer callback; do not alter shared helpers
  getDeferredDispatchRetryOperation / resolveDeferredRetryVisibleOperation.
Part 2: INCLUDE (rebalancer-side noHandler branch + synthetic retryable error; no transport
change). Part 3: part 1 sufficient for doneWhen. Part 4: land controls 1-4 (5 with part 2).
