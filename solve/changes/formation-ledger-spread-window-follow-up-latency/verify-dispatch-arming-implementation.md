# Adversarial verification: dispatch-arming implementation (formation-ledger-spread-window-follow-up-latency)

Status: COMPLETE. VERDICT: SHIP (with two non-blocking DT-control gaps noted for follow-up).

## Probe-shard adjudication (resolves the only open E item)
- node-join-convergence-slo: deterministic fail 3/3 runs, same subtest "cluster should settle within convergence
  SLO window" with two ACTIVE-step ops (mg-1 + replica_operations-p1) at deadline — EXECUTING moves, not the
  PENDING-idle class the diff touches.
- user-table-metadata-fanout: 3 subtest fails incl. "create table should succeed on seed" + timeout — this IS the
  quest's open doneWhen target (live CREATE TABLE within budget); live validation is the quest's declared NEXT step.
- BINDING relatedness evidence: full probe logs contain ZERO occurrences of any new lane
  ("re-waking owner from retained snapshot", "retry stopped at its operation budget",
  "Deferred retryable replica operation dispatch failure" from the noHandler route) — the diff's code paths never
  fired in these runs; behavior was byte-identical to head. Failures are pre-existing / open-frontier, NOT
  regressions from this diff. Shard is non-gating (only in test/shards/convergence-probes.txt; excluded from
  npm test lanes, ci.yml, and deliberately from full-gate.yml:14-18).
- GAP 2 mitigation: duplicate-dispatch safety has independent green coverage —
  test/control-plane/replica-dispatch-atomic-claim.integration.test.js + test/rebalancer/replica-operations-
  single-writer.test.js (62/62, exit 0).

## Additional non-blocking observations
- Silent loop-exit corner: if ownerNodeId becomes unresolvable from the snapshot mid-loop, wake returns false
  (owner-handoff-state.js:233-236, pre-existing silent branch) and the loop ends after the FROM_SNAPSHOT warn with
  no re-arm and no STOPPED warn. Pre-existing branch class; not reachable in the run-26 shape (targetNodeId is on
  the snapshot). Same for a canContinue refusal at the post-wake schedule (R2's optional recommendation, not landed).
- Working-tree extras: active-gate-tlc-route.model.report.json (timestamp-only rerun of same model, still green) and
  solve/FRONTIER.generated.md (quest bookkeeping) — benign.
- Shed-cap interplay: the 1s verification timers (scheduled directly, bypassing the cap — pre-existing) now live
  longer; ≥4 stranded ops on one target can hold the cap against OTHER failure-lane deferrals to that target.
  Cap semantics unchanged, exposure window longer. Bounded by design intent; note only.

## Diff inventory (read)
- rearm-evidence.js: +resolveSnapshotHandoffRetryStop (:751), +buildSnapshotHandoffRetryLogFields (:784),
  +retryCoordinatorCreatedRemoteHandoffFromSnapshot (:801), null-currentOperation branch (:865-878),
  R2 warn on visible-row shouldStop (:891-900).
- owner-handoff-state.js: noHandler branch (:286-288), handleDroppedNoHandlerWake (:319-333),
  R4 null-observation return (:369-376).
- rebalancer-constants.js: 2 LOG_MSG entries only (:245-251).
- Shared helpers getDeferredDispatchRetryOperation (:424) / resolveDeferredRetryVisibleOperation (:440) UNTOUCHED — R5 holds (confirmed via diff).

## A. Loop correctness — tracing
- Cycle: timer fires (:855 cb) → getDeferredDispatchRetryOperation → null → retryCoordinatorCreatedRemoteHandoffFromSnapshot
  → stop checks → warn FROM_SNAPSHOT → wakeCoordinatorCreatedRemoteOwner(clone) → DELIVERED non-noHandler
  → resetAttempts + scheduleFollowUp(1s, replaceExisting:true) → repeat.
- (i) budget bound VERIFIED (YES). Per cycle: fire(t) → grace (recorded at t-1s as min(ceiling, t)) is EXPIRED at fire →
  isOperationStepTimedOut evaluates frozen stepEntered/updatedAt (rearm-evidence.js:591-601); after 30s stepTimedOut=true,
  but operationBudgetActive = now < createdAt+300s (:699-708, frozen snapshot createdAt) keeps shouldStop=false → loop.
  Past createdAt+300s: usesOperationBudget grace ceiling caps at createdAt+300s → grace inactive; budget inactive;
  isProtectedCreateDispatchRetryBudgetActive false (:264-278 needs CREATE-rearm phase + live dispatchRetryTimer + within budget)
  → shouldStop=true → resolveSnapshotHandoffRetryStop returns stop (:773-779) → LOUD STOPPED warn (:811-818) + clear. BOUND HOLDS.
  resetAttempts on clean-ACK success defeats only the BACKOFF DELAY (unused in the 1s lane), not the bound — the bound is
  time-based, never attempt-based. R3(a) accepted. BONUS: noHandler cycles do NOT reset attempts → backoff engages there.
- (ii) log noise: worst case 1 FROM_SNAPSHOT warn/s/op × ≤300s (+1 STOPPED warn). RULING: ACCEPTABLE, non-blocking —
  bounded by the budget, and the class being killed was SILENT idle; the warn stream is the evidence trail. Real-world
  window is seconds (owner startup <1s). Optional (not required): throttle to first + every Nth cycle.
- (iii) double-schedule: NO. Single map-keyed timer (:912-915); wake-success replaceExisting clears first (:846-851);
  deferral lane resolves ACTIVE_HANDOFF_RETRY→ACCEPT_EXISTING when a timer is live (handoff-retry.js:65-67). Concurrent
  wake from recovery lanes during the cb's async window is possible but converges to ONE timer (second replaceExisting
  clear+set); duplicate in-flight wakes are the CAS-safe nudge class. PASS.

## B. R4 regression — PASS
- Late honor + invisible row → timer survives → re-wake to a target that already enqueued the dispatch. Harmless via the
  SAME machinery the vet verified for re-wakes generally: REFRESH_ROW_BEFORE_DISPATCH + fresh-row preference + post-claim/
  terminal clear (replica-dispatch-reconcile-callbacks.js:120-151) + claimPriorityDispatchTransition CAS single-flight +
  dispatchInFlight dedup. NOTHING NEW: part 1's re-wake loop already guarantees multi-delivery; R4 adds one more instance
  of the same duplicate class.
- Visible TERMINAL row still clears: owner-handoff-state.js:377-380. No leak. Invisible-forever + terminal op worst case:
  loop runs to budget stop (bounded, loud). Accepted.
## C. Callers of wakeCoordinatorCreatedRemoteOwner (throw tolerance)
KEY STRUCTURAL FACT: wakeCoordinatorCreatedRemoteOwner could ALWAYS throw (pre-existing: non-delivered
outcome + defer reject → throw MESSAGE_NOT_ACKED :278-284; catch :299 rethrows on second reject). The
noHandler throw uses the SAME channel/message — no new failure mode, only a new trigger. Any caller unable
to tolerate a throw was already broken for delivery failures.
Reject (→throw) conditions after noHandler: (a) non-priority/non-critical partition (INELIGIBLE),
(b) per-target shed cap ≥4 (coordinator-handoff-retry.js:135-165). deferRetry:true satisfies
isRetryableControlPlaneError (control-plane-error-classification.js:180-182) — confirmed.
Caller inventory + tolerance:
- arm path: creation.js armCoordinatorCreatedOperationProgress :649-662 try/catch → warn + return false. TOLERATED.
- rearm-evidence timer cb :826/:904 — .catch(:905) → handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure
  → defer (reject) → logger.error. TOLERATED. (Non-priority unreachable: schedule refuses non-priority at :840.)
- executor-outcome :740 — gated shouldRetryCoordinatorCreatedRemoteHandoff===true (:292-299) → PRIORITY ONLY;
  reject only via shed cap. Enclosing catch: TBD.
- reentry.js:579 — .catch → handleObservedProgressFailure. TOLERATED (verify what it does).
- recovery-status-reconcile.js:121 — applyReconciledReplicaStatus; NOT priority-gated? → non-priority reachable? TBD callers.
- ports.js:700 wakeOperationWorkflowRemoteOwner → dispatch-pending :237/:292 (priority recovery lane), stale-progress :713. TBD catches.
- drain :458, observation :389, owner.js:672 — TBD catches/gates.
### A(i) addendum — grace ceiling cap verified in source
transition-retry-grace.js:104-125 resolveTimeoutCeilingMs: priority PENDING → usesOperationBudget true (:137-159)
→ ceiling = createdAt(frozen) + 300s; record() min-caps EVERY deadline write at the ceiling (:70-86, both branches).
Grace can never suppress the loop's stepTimedOut past createdAt+300s. Bound: YES, with line evidence.

## D. noHandler producers — PASS
Single producer in the entire src tree: message-router-inbound-dispatch.js:279-287 — set ONLY when
this.handlers.get(targetAddress) is missing at dispatch time. Healthy handler results are spread into the
response (pending-response-ledger.js:393-407) but no handler anywhere returns noHandler (grep: zero other
producers in src/). classifyTransportDeliveryOutcome only passes through resolvedValue.noHandler===true
(transport-semantic-outcome.js:276). router-message-handler.js (:277-291, top-level error, no noHandler) is
DEAD — not imported anywhere. websocket-transport.js:418-445 no-handler branch sends plain ACK without
noHandler → part-2 branch inert there, part 1 still covers. No false positives.

## DT test-file findings (test/rebalancer/dt6-ledger-spread-follow-up-dispatch-arming.test.js)
- GAP 1 (vet Part-4 control 1, partial): the "bounded-stop control" (:274-323) never exercises the SNAPSHOT LOOP's
  stop — a 400s-old op is stopped by the ARM-path shouldStop gate (owner-handoff-state.js:554-560, pre-existing,
  UNLOGGED) BEFORE any wake: deliveries stays 0, no timer is ever armed, and the loud-stop assert is
  `t.ok(warns.length >= 0)` — VACUOUS (always true). The R2 STOPPED warn (both new warn sites) is asserted by NO test.
  resolveSnapshotHandoffRetryStop's budget branch (:773-779) has no direct coverage (degenerate branch IS covered).
- GAP 2 (vet Part-4 control 2, "not optional"): NO-DUPLICATE-DISPATCH control (owner already claimed/SENDING receives
  a re-wake → no second dispatch) is ABSENT from the file. Vet explicitly: "The re-wake loop guarantees
  multi-delivery, so this control is not optional."
- Controls 3 (R4 preempt-cancel, :357-385), 4 (degenerate snapshot, :325-355), 5 (noHandler lane, :387-422) present
  and genuinely exercise the new branches. Root-cause subtest binding assert is real (deliveries must grow).
## C — VERDICT: PASS (contained)
- Structural: the noHandler throw reuses the pre-existing MESSAGE_NOT_ACKED throw channel (:278-284/:299-303) that
  every caller was already exposed to on delivery failure. No new failure mode.
- Non-priority ops CANNOT reach the noHandler branch through the retry/reconcile lanes: schedule refuses (:838-843),
  executor-outcome gate requires shouldRetryCoordinatorCreatedRemoteHandoff (:292-299), progress-reconcile evidence
  table rejects NON_PRIORITY_RECOVERY_PARTITION (rearm-evidence.js:73-77 state table + ALLOWED={REARM_DISPATCH}).
  Reachable non-priority entry = the arm path only, and creation.js:649-662 catches + warns + returns false.
- Priority ops: defer resolves SCHEDULE (warn lane) → wake returns false; callers all handle false by checking
  hasActiveCreatedOperationHandoffRetry (recovery-timeout :200-206 via drain :458-462; status-reconcile :121-129).
  Reject → throw only on shed cap (≥4/target) — pre-existing channel; timer-cb throws land in .catch →
  handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure → logger.error; executor-outcome redrive has .catch
  (:158, :648); observed-progress lanes .catch → handleObservedProgressFailure (execution-lane.js:58-80).
- Second-defer subtlety: on reject inside handleDroppedNoHandlerWake the :299 catch re-runs the SAME deferral
  (double evidence build, possible double SHED warn) before rethrowing — cosmetic only.

## E. Suites
- dt6 quest test: 14/14 pass, exit 0.
- test/rebalancer full: { total: 5429, pass: 5373, skip: 56 }, exit 0.
- transport-adjacent (transport-semantic-outcome, delivery-semantics.property, routing-correctness.property,
  service-dispatcher): 30/30, exit 0.
- late-dispatch-honored-stops-redrive.test.js: passes; only stubs VISIBLE rows — no conflict with R4.
- test:complexity: ratchet OK 1857/1857, exit 0. eslint on all 4 changed files: exit 0.
- dt:prove artifact (13-20-01): fixRun 0 / revertRun 1 / restore 0 — "red-on-revert-proven" across all 3 src files.
- test/convergence (DT convergence suite): { total: 835, pass: 833, skip: 2 }, exit 0. 5373+833 = 6206 — the
  implementer's "rebalancer+convergence 6206 green" claim reproduces EXACTLY against these two suites.
- test:convergence-probes (3 multi-node integration SLO trend probes): 84 pass / 17 fail, tap exit 0. These files
  exist ONLY in test/shards/convergence-probes.txt — NOT in any integration/bootstrap lane, not in npm test, not in
  ci.yml/full-gate.yml (full-gate.yml:14-18 deliberately excludes the statistical convergence gate; tracked as trend).
  Non-gating. Failing-name relatedness check pending (rerun in flight).

## F. Constraints — PASS
- rebalancer-constants.js diff = 2 LOG_MSG strings only; no timeout/budget numeric touched anywhere in the diff.
- run-20 serialization: creation/interlock files untouched; wakes carry buildCoordinatorCreatedDispatchRow of an
  ALREADY-created op (REPLICA_OPERATION_DISPATCH) — nudge-only, no create path.
- REUSED: wake, defer lane, timeout decision, grace/budget machinery, cloneOperationSnapshot, terminal checks.
  EXTENDED: follow-up timer null branch; wake DELIVERED branch (noHandler routing); late-honor null branch; R2 warns.
  NEW: resolveSnapshotHandoffRetryStop, buildSnapshotHandoffRetryLogFields,
  retryCoordinatorCreatedRemoteHandoffFromSnapshot, handleDroppedNoHandlerWake, 2 LOG_MSG. No new caches/read paths.
- Nit (cosmetic): resolveSnapshotHandoffRetryStop JSDoc params/return stale (says operationId + boolean|Promise;
  actual (owner, operationSnapshot) → stop-decision object). Lint green regardless.
