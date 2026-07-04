# Adversarial verification: terminal-transition repair fix (working tree, uncommitted)

Date 2026-07-05. Verifier session. Surfaces A-H per task brief.

## Files in scope
- src/rebalancer/operation-workflow-transition-persistence.js (persistFns return result + terminalTransition:true)
- src/rebalancer/operation-workflow-transition-orchestration.js (TX-branch persistResult===false rollback)
- src/rebalancer/replica-operation-repository-mutation-persistence-methods.js (terminalTransition mode)
- src/rebalancer/operation-workflow-owner-execution-lane.js (confirm arms repair)
- src/rebalancer/operation-workflow-terminal-transition-repair.js (new repair loop)
- src/rebalancer/operation-workflow-owner-retry-registry.js (maps + shutdown clear)
- src/partition/partition-service-learner-promotion-methods.js (literal fix)
- test/convergence/dt6-voter-surplus-promotion-drain-livelock.test.js

## Findings log (write-as-you-go)

### Surface D (DEFERRED-witness interplay) — PASS, converges structurally
Trace: repair persists confirmPersistence:false -> records witness (mutation-persistence-methods.js:284)
-> repair calls confirmReplicaOperationPersistence directly (repair.js:182).
confirmReplicaOperationVisibility loop (mutation-persistence-methods.js:429-483) calls
queryAuthoritativeOperationVisibilityObservation with expectedOperation + allowOwnerPersistedTransitionDeferredVisibility.
In read-methods.js:372-410: when the authoritative read RETURNS the row, the witness only masks it if
isOwnerPersistedTransitionVisibilityLagCandidate (observed.updatedAt/completedAt < expected floor) — i.e. only
STALE reads become DEFERRED. A row reflecting the terminal write is NOT masked: falls to :398-406, clears the
witness (read-methods.js:405) and returns the operation -> confirm sees satisfied -> CONFIRMED. So the repair
sees CONFIRMED once the write lands; witness cleared at that moment. Convergence is structural, not fixture luck.
Never-hydrating row: empty read + witness -> DEFERRED (read-methods.js:329-343) -> rearm at capped 30s
(resolveTerminalTransitionRepairDelayMs caps; Math.pow overflow -> Infinity -> min() caps). No hot spin.

### Surface F (zero-change semantics) — DEFECT (repair false-abandon on stale-but-nonterminal readable row)
persistOperationUpdate false paths with terminalTransition:
 (1) conflicting durable terminal (pre-read, :156-163) — abandon justified;
 (2) zero-change + row PRESENT but stale non-terminal (arm :227-281 -> `return visibilitySatisfied` = false at :279) — NOT a conflict;
 (3) expected-step reject — n/a for terminal (no CAS).
Repair (operation-workflow-terminal-transition-repair.js:169-180) treats ANY false as "a different durable
terminal state won" -> logs TERMINAL_TRANSITION_REPAIR_ABANDONED (lying message for case 2) and clears state.
Case-2 reachability: UPDATE matches 0 rows in the applying partition state while the OWNER_LOCAL_ONLY read still
returns the old row — exactly the CL-017 read/apply divergence family the fix targets (run-21: row readable as
SYNCING while 'No row found for CDC update'). In that shape the repair self-cancels on its FIRST attempt and the
immortal ghost returns (in-memory terminal, memo blocks re-drive, no repair). Mitigation present: if the write
actually landed, the zero-change arm's visibility check returns true, so false-positive changes:0 self-heals.
Fix should re-read and abandon ONLY when isAuthoritativeOperationTerminal && !visibilitySatisfied; else rearm.
extractMutationChangeCount (mutation-gateway-methods.js:613-620): `changes ?? affectedRows ?? partitionResult.*`
— pre-existing shape risk (envelope changes:0 with real count nested would be masked) but self-heals per above.

### Surface A (double-effect) — PASS
- releaseReservationForOperation (rebalance-coordinator-reservation-lifecycle-methods.js:244+) re-reads ACTIVE
  reservations; second call finds none -> no-op. Idempotent.
- On !transitionCommitted (transition-persistence.js:315-320, 481-486): stats NOT bumped, OPERATION_FAILED/COMPLETED
  NOT emitted, operation.stepsHistory NOT mutated (projectedOperation rebuilt fresh each call from a spread).
  Re-drive appends the FAILED entry exactly once on the committing call.
- Memo (markTransitionCommitted) skipped on false -> re-drive not blocked. Cache not poisoned (zero-change false
  path returns before syncIncompleteOperationObservation).

### Surface B (TX-branch false path) — PASS with note
All persistOperationUpdate false paths write nothing durable: pre-reads return before mutation; zero-change arm
means 0 rows matched; the CL-017(b) re-insert returns TRUE when it lands (so the false path never follows a
durable insert); reinsert-throw wrote nothing. Rolling back an empty session is safe; failed rollback only warned
(orchestration.js:322-335) — acceptable (session recovery lane handles stragglers). clearTransitionExecutionAttempt
mirrors the commit path. NOTE: the TX-branch false path is NOT exercised by the DT test (its partition is
priority -> bypass branch only).

### Surface H (regressions) — PASS
- confirmCommittedTransitionPersistence callers: only orchestration.js:542 (updateStep, no options -> early return
  `if (!repairOnUnconfirmed) return;` — behavior unchanged) + the two terminal sites.
- persistOperationUpdate callers: sql-query-engine-initial-partition-provisioning.js:558 (no options),
  orchestration.js:525 (updateStep), transition-persistence.js:139 (priority claim CAS), owner-facade passthrough,
  repair. terminalTransition is opt-in; no accidental adopters.
- updateStep can now return false on TX-path zero-change (previously lied true): same false contract the bypass
  branch already had, callers already tolerate false (CAS-miss path pre-existing).
- Promotion literal fix: WOULD_EXCEED_TARGET_REPLICA_COUNT / WOULD_CAUSE_EVEN_VOTER_COUNT defined at
  partition-service-shared.js:188-189; old names never existed (reason was undefined). Correct.

### Surface C (repair vs concurrent re-drive) — PASS with caveat (no-CAS window, narrow)
- Repair runs under owner single-flight key (repair.js:153-155); executeAtomicTransition uses the repo
  transition-exclusive lane — different locks, BUT on one node the two writers are mutually exclusive by
  construction: repair arms only when the transition COMMITTED (in-memory terminal + memo set -> no local re-drive);
  honest-false path never arms repair.
- Cross-node writer needs owner-unavailable (stale-FAIL settle) or ownership flip; settle writes the SAME terminal
  step (FAILED, later updatedAt -> visibilitySatisfied -> repair confirms & clears). Benign.
- Residual theoretical window: no expected-step CAS means a repair whose pre-read saw a non-terminal row can
  overwrite a CONCURRENT adopter's live progress (e.g. ACTIVE -> FAILED), stranding an active replica with a FAILED
  op row. Requires owner flap + adoption + re-drive racing the pre-read->UPDATE window. Not reachable while the
  repair holder is the durable row's owner (target node) and alive. Accept with note.
- Shutdown: registry shutdown() clears timers+state (operation-workflow-owner-retry-registry.js:167-171);
  arm/rearm/attempt all early-return on isShuttingDown. Backoff capped 30s — a permanently-DEFERRED confirm retries
  every 30s holding the op single-flight key for <=100ms..visibilityTimeout per attempt; bounded, acceptable.
- Adoption by a new coordinator: old node's repair state is NOT cleared on ownership loss — same lifetime as every
  other retry registry (dispatch/executorOutcome/etc.); terminal-only writes + conflicting-terminal pre-read bound
  the damage (see caveat above).

### Surface G (test honesty) — PASS with coverage gaps
- Real chain: real RebalanceCoordinator (test/rebalancer/timeout-test-coordinator.js), real repository/persist/
  confirm/execution-lane/repair; loss injected at gateway.executeQuery seam (the layer below the code under test).
  Mocked: storage engine (Map), workflow tick driver, promotion coupling — all BELOW or BESIDE the fix.
- Non-vacuous: `lostWrites > 0` assert guards that the injection engaged (if the fixture stopped using the raw-SQL
  lane, interception would miss and the test FAILS, not silently passes). pinnedOps==0 + voters==3 are the sealed
  observables. Control run (LOSS none) proves the composition converges on head without the fix — the red is the
  loss handling, not the harness.
- SILENT mode exercises ONLY the repair loop (changes:null skips the zero-change arm; persist returns true);
  ZERO_ROW exercises ONLY the honesty path (persist false -> no commit -> repair never arms). Complementary, both
  RED on revert — but dt:prove reverted all 9 files as a bundle (solve/changes/dt-prove/...-23-08-09-881Z.json:
  verdict red-on-revert-proven, srcChanged bundle), not per-mechanism.
- GAPS: (a) TX-branch (non-priority partition) persistResult===false rollback path never executed (test partition
  is priority -> bypass); (b) repair ABANDON branch never executed; (c) repair-vs-concurrent-writer interleavings
  untested. Verified 30/30 green live.

### Surface E (sessionless repair write) — PASS
disableSystemWriteSession merely skips resolveOperationMutationSessionId (mutation-gateway-methods.js:509-522);
it is the exact write mode every priority/bypass persist already uses (buildOperationTransitionPersistOptions,
execution-lane.js:709-719). The repair re-asserts a TERMINAL row by operation_id — no transaction to cohere with
(the transition already committed in-memory; the TX session is long gone), no legal successor write to order
against. Direct write is the correct mode; sessionful would be wrong (no open session).

### Live runs
- New DT test: 30/30 pass (2.6s).
- Neighbors: rebalance-coordinator-atomic-transitions + replica-operation-repository + replace-replica-workflow
  = 706/706; learner-promotion + timeout-triggers-failure + cl-043 + operation-record-completeness = 93/93;
  add/remove step-progression + operation-log-persistence = 73/73.
- No test asserts the old warn-and-drop confirm behavior (grep clean).
- Literals FAILED_TO_ROLL_BACK_TRANSITION_TRANSACTION / EMPTY_STRING exist (operation-workflow-owner-shared.js:150).
- No import cycle (repository imports nothing from owner lane); owner.shutdown() wired (rebalance-coordinator.js:208).

## VERDICTS
A PASS · B PASS (TX false path untested; production change counts proven real by run-21 evidence)
C PASS w/ caveat (no-CAS pre-read->UPDATE window vs a hypothetical concurrent adopter re-drive; gated by
  owner-aliveness rules, realistic writers converge to same terminal) · D PASS (structural convergence)
E PASS · G PASS w/ gaps · H PASS
F DEFECT (medium): repair false-abandon. operation-workflow-terminal-transition-repair.js:169-180 treats EVERY
persist false as "a different durable terminal state won"; but persistOperationUpdate ALSO returns false for
zero-change + readable-but-STALE-NONTERMINAL row (mutation-persistence-methods.js:279). In that case the row is
still non-terminal (budget held), yet the repair logs ABANDONED (a lying message) and clears — recreating the
immortal ghost the fix exists to kill. Reachable when a silent-acked terminal write arms the repair and a later
attempt gets an honest changes:0 while the OWNER_LOCAL_ONLY read still returns the old row (the CL-017 read/apply
divergence family run-21 exhibited). Fix: on persisted===false re-read authoritative; abandon ONLY if
isAuthoritativeOperationTerminal(row) (any terminal row frees the budget — safe); otherwise REARM.

OVERALL: FIX-FIRST (surface F only; ~10-line change in the repair attempt). Everything else verified sound.
