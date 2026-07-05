# Adversarial verification: formation-ledger-quorum-spread-first implementation
Date 2026-07-05. Write-as-you-go. Verdicts at bottom.

## Files under review (uncommitted)
- NEW src/rebalancer/operation-ledger-quorum-concentration.js (predicate)
- src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js (+124: hold + emergency evidence + WARN)
- src/rebalancer/rebalance-coordinator-concurrent-add-budget.js (+12: EMERGENCY_PRIORITY_ADD classification)
- src/query/sql-query-engine-provisioning-admission-methods.js (+3 transient reasons)
- src/rebalancer/operation-workflow-dispatch-response-reconcile.js (SEND_OPERATION first-attempt info)
- src/rebalancer/unified-rebalancer-follow-up-move.js (movePartitionId)
- src/rebalancer/rebalancer-constants.js (new LOG_MSG)
- NEW test/convergence/dt6-formation-ledger-quorum-spread-first.test.js

## Findings log

### D. Budget lane trace (done myself — CRITICAL)
- resolveConcurrentCreateBudgetScope's return value is consumed ONLY as the single-flight
  mutex key: runConcurrentCreateBudgetGate (concurrent-add-budget.js:21-35) passes scope to
  getCreateBudgetSingleFlightKey → buildOperationSingleFlightKey (operation-workflow-owner-
  execution-lane.js:223-228). The actual limit check ensureConcurrentOperationBudgetAllowed
  (rebalance-coordinator-concurrent-budget-gate.js:11-66) NEVER sees the scope — it re-derives
  the lane via shouldUsePriorityConcurrentAddLane and calls canStartPriorityAddOperation.
- canStartPriorityAddOperation (priority-budget-helper.js:521-597) admits via
  evaluatePriorityAddAdmission(partitionId, counts) — classification is by PARTITION CLASS
  (priority-recovery-snapshot-workflow.js:105-186). replica_operations is EMERGENCY_PRIORITY
  class ALWAYS (emergency table set), so the ledger self-move already got the emergency-limit
  evaluation path BEFORE this change. emergencyPriorityAddBudgetLimit = maxConcurrentAdds +
  overflow, where overflow > 0 ONLY when emergencyRecoveryActive (publication-blockage
  evidence, :56-65). The new classifier branch does NOT touch that evidence.
- ⇒ ZERO-SLOT STARVATION FEAR REFUTED (scope is not a slot lane; classification cannot starve
  the cure). BUT the change is a near NO-OP for the run-22 budget starvation it claims to fix:
  with zero publication evidence the cure still competes for the same maxConcurrentAdds slots
  against in-flight priority ops (EMERGENCY_PRIORITY_LANE_EXHAUSTED at :142-149). Its only
  real effect = different mutex key (cure no longer queues behind PRIORITY_ADD-scope creates
  in the create-budget critical section) — marginal, not the vetted amendment ("feed
  quorum-concentration evidence into the priority-recovery admission plan" so overflow slots
  exist). Wedged in-flight dependents free slots only via the CL-043 staleness exclusion
  (~step-timeout, 60-70s) — exactly the starvation window the amendment was meant to close.
  VERDICT: DEFECT-CLASS GAP (unfulfilled amendment / misleading comment), not an inversion.
- Severity calibration from run-22 forensics: the 43x budget_exceeded lane-starvation was
  caused by ALREADY-ADMITTED wedged dependents filling priorityCount. Under the new hold those
  dependents are typed-rejected at interlock step 4 and never fill the lane — so the primary
  fix (the hold) removes the lane-fillers, and the inert classification matters only in the
  mixed window (ops admitted before concentration became visible), bounded by the CL-043
  staleness exclusion (~step-timeout). Downgrades from critical inversion to bounded residual
  PLUS an honesty problem: the sealed statement's emergency-classification clause is
  implemented in name (scope label + mutex key) but with no effect on admitted budget.

### D-addendum: REMOVE-type cure never reaches the classifier
- resolveConcurrentCreateBudgetScope returns REMOVE scope at :43-44 BEFORE the new branch, and
  shouldUsePriorityConcurrentAddLane excludes REMOVE — so a concentrated ledger surplus REMOVE
  (the over-target cure arm!) can never be classified EMERGENCY_PRIORITY_ADD even though
  isConcentratedDisruptiveOperationLedgerSelfMove includes REMOVE in its disruptive set. The
  REMOVE budget lane (maxConcurrentRemoves) is separate and unlikely saturated by the wedge
  shape, so low practical impact — but the code shape implies coverage it doesn't have.

### Change #4 DDL pacing trace (done myself)
- TRANSIENT_PROVISIONING_SHORTFALL_REASONS consumed ONLY by
  hasOnlyTransientProvisioningShortfall → resolveProvisioningShortfallFallbackMinimum
  (provisioning-admission-methods.js:197-267), which lowers the fallback MINIMUM to 1.
- The hold is GLOBAL (thrown in createOperationInternal for every non-exempt create), so while
  engaged ALL targets get rejected → plannedOperations=0 → maximumProvisionableReplicaCount =
  routable + 0. Fresh CREATE TABLE: routable=0 → `maximumProvisionableReplicaCount > 0` fails
  (initial-partition-provisioning.js:436-441) → throwProvisioningInsufficientTargets → CLIENT
  CREATE TABLE STILL FAILS FAST. No upstream retry consumer of that error exists; the
  convergence wait (waitForProvisionTargetNodeIds) probes via checkProvisioningAdmission =
  provisioningAdmissionPolicy path which has NO ledger awareness (grep: 0 hits) — the probe
  can't see the hold, so the wait loop never waits on it.
- Real-but-narrow effect: partially-routable re-provisioning (routable ≥ 1) now falls back to
  reduced target instead of failing (transient-only classification enables min=1).
- VERDICT: DEFECT — the diff comment claims "DDL provisioning must pace and retry through
  them instead of failing the client's CREATE TABLE fast" but the wiring does not reach the
  all-targets-held fail-fast path (the design vet's amendment 3 asked for bounded
  wait-and-retry; not delivered for the primary fresh-CREATE case).

### A. Predicate math + livelock trace (mine + subagent)
- 1-voter ledger: concentrated by definition (0 < 1); hold engages when a 2nd ready node
  exists; cure = deficit ADD (replica_count=3 from seed-registration-phase.js:375-393, odd
  policy ≥3 move-planner-state-methods.js:33-58) — ADDs planned promptly, EMERGENCY class,
  exempt from the hold (both async early-return :136-141 and sync gate :413-415). Transient.
- 2 voters split 1/1 with only 2 nodes: concentrated TRUE (1 < 2 — mathematically correct, a
  2-voter quorum always needs both) but feasibility: no zero-replica ready node, overTarget
  2>3 false → NOT actionable → hold releases. No livelock.
- 2 voters + 3rd ready node: hold engages; cure = 3rd ADD (deficit vs target 3, exempt,
  emergency) → 3 voters spread → releases. Bounded by ADD completion. No livelock.
- Permanent 2-at-target unreachable (odd-count policy forces ≥3; "2" only as transient
  topology-limited actionable target).
- 3@target concentrated 2/1 + spare node: cure = count-neutral spread REPLACE, planned even at
  target (fusion :485-553, suppression only for standalone ADDs), exempt via disruptive branch.
- 4-voter mid-REPLACE {2@N0,1@N1,1@N2}: 4-2=2 < 3 → concentrated — correct (quorum 3 needs an
  N0 ack); REMOVING source counted as voter = correct raft actual.
⇒ SURFACE A: PASS. Hold windows are exactly the formation spread windows; every cure is
  exempt; every non-actionable shape releases.

### B. Production row shapes (subagent, verified pointers)
- Learners NEVER counted: normalizePublishedRaftRole preserves 'learner'
  (published-raft-role.js:14-15); ADD/REPLACE targets first write raft_role='learner' or null,
  never 'follower' (partition-service-raft-init-base.js:423-432, :526). For the LEDGER
  (critical partition) status='active' is voter-ready-GATED (replica-handler-create-methods.js
  :790-843, transition-policy.js:27-29) → active ⟹ real voter. Non-critical partitions can be
  active+learner but role='learner' keeps them out. No overcount path found.
- Voter-miss lag: durable raft_role write defers through the recovering control plane (CL-035,
  create-methods.js:460-477) → active row w/ raft_role learner/null = missed voter →
  concentration OVERestimated → hold longer. Conservative. Ledger self-heals on the promoting
  node via seedLocalPriorityReplicaRaftRole (:483-523); other nodes lag CDC. Acceptable.
- REMOVING window: status→removing first (remove-execution-methods.js:190-196), row DELETED
  (:227-233) BEFORE local raft shutdown → brief window where a still-voting source's row is
  gone → voters UNDERcounted → possible slightly-early release. Seconds-bounded, observation
  lag class. Note only.
- nodes.connection_state: dead nodes LINGER 'ready' until lease sweep (lease-service.js:180-
  244); active-node-projection deliberately does NOT trust this column (:302-323). The
  predicate's readyNodeIds = raw connection_state==='ready', NO lease check ⇒ recently-dead or
  DRAINING nodes count as feasible spread targets → hold can persist with no
  planner-realizable target. This is design-vet amendment 1's D(2) (planner-aligned node
  source) NOT IMPLEMENTED — only the over-target arm (D(1)) was folded in. Bounded for dead
  nodes (lease sweep flips to disconnected); potentially LONG for draining/cordoned nodes
  (heartbeat keeps ready). Narrow shape (needs concentrated ledger + only spare = unusable
  node); WARN gives observability. DEFECT-note (vetted amendment half-implemented), not a
  blocker.
- Seed bootstrap: ledger = 3 rows on seed, active, 1 leader + 2 followers → predicate sees the
  exact run-22 concentration. ✓
⇒ SURFACE B: PASS with lag-class notes + the D(2) feasibility-source deviation carried to the
  verdict.

### C. Hold placement (done myself)
- Only 2 external createOperation callers (initial-partition-provisioning.js:382,
  unified-rebalancer-move-execution.js:94); createOperationInternal has exactly one call site,
  wrapped by runOperationLedgerInterlockAccountedCreate (operation-creation.js:114-118). No
  bypass path creates a new operation without passing the interlock chain.
- Dedupe early-returns (both in createOperation :62-112 and createOperationInternal :183-223,
  BEFORE the interlock at :225) return EXISTING operations without hitting the hold — correct
  (hold gates new admissions only).
- Disruptive branch (ledger REPLACE/REMOVE) returns at :186 before the sibling branch — the
  cure never self-blocks ✓. Emergency ADDs early-return at :139-141 before everything ✓.
  Non-ledger REMOVEs fall into the sibling branch → held — consistent with the run-20 hold
  (REMOVE also writes ledger progress) ✓.
- Note: a control_plane_publications REPLACE (emergency-class partition, non-ledger) IS held —
  deliberate "ledger spread first" ordering; feeds the planning-gate wedge question (surface 6).
- REBALANCE_COORDINATOR_LOG_MSG properly exported via shared (verified by import).
⇒ SURFACE C: PASS.

### E. Blast radius (subagent grep + suites run by me)
- No test calls resolveConcurrentCreateBudgetScope directly; the one budget-scope assertion
  suite (operation-ownership-priority-admission-test-cases.js:763-820) uses a non-ledger
  partition + empty cache → unaffected. Optional chaining safe on mocks lacking the method.
- Every existing test that builds concentrated replica_operations services rows never calls
  createOperation (they drive planner/triggers); every createOperation-calling test either has
  no ledger voter rows (no raft_role → 0 voters), spread voters, or exempt ledger ADDs.
- No SEND_OPERATION / firstAttemptForStep / payload-strict EXECUTE_MOVE/MOVE_SKIPPED
  assertions anywhere; replay harness matches message+entityId only (additive-safe).
- TRANSIENT_PROVISIONING_SHORTFALL_REASONS not referenced in test/.
- Suites RUN green: dt6-formation-ledger-quorum-spread-first (17/17), dt6-rebalancer-formation-
  self-move-interlock, dt6-voter-surplus-promotion-drain-livelock, replace-replica-workflow,
  rebalance-budget-enforcement.property, provisioning-admission-policy (311/311 batch 1);
  operation-ownership, create-table-quorum, 3x unified-rebalancer, failure-bundle
  (323 pass / 4 pre-existing skip, batch 2). ZERO failures.
⇒ SURFACE E: PASS.

### F/G. DT honesty + constraints (done myself)
- Fixture = REAL RebalanceCoordinator (timeout-test-coordinator.js) with in-memory SQL engine;
  createOperation traverses the real admission chain incl. the sync interlock, budget gates,
  and the new hold reading coordinator.systemTableCache (test swaps in its placement cache =
  the exact read seam). Not a mock of the hold. ✓
- Test 17/17 green; dt:prove artifact (solve/changes/dt-prove/...2026-07-05T07-24-16) verdict
  red-on-revert-proven (fix GREEN / revert RED / restore GREEN) over all 6 src files.
- Fault-model predicate duplication: test's ledgerQuorumConcentrated filters status=active
  only (no raft_role, no removing) — INDEPENDENT definition for the fault model is the honest
  choice (importing the fix's predicate would be circular). All fixture rows are active with
  voter roles, so the two definitions coincide on every state the test reaches. Residual: the
  finalConcentrated assertions would not catch a src regression in removing/learner filtering
  — acceptable, noted.
- Determinism: nodeRows fixed order, cache.filter preserves order, readyNodeIds.find
  deterministic; dedicated determinism subtest passes.
- Honesty residual vs design-vet V8(3): driver applies completion placement as an instant jump
  (source row deleted + target active-follower in one step), NOT the production
  learner→active / active→removing→delete sequence — the removing-window (4-voter) semantics
  are unexercised by the DT. Core run-22 gap (concentration persisting past a completed
  self-move, dependents typed-rejected in that window) IS pinned. Acceptable with note.
- TEST-0021: no timeouts or budget limits raised (test passes only timeSource+nodeId to the
  fixture; virtual clock; MAX_CYCLES loop) ✓. Actuals-only (services/nodes rows) ✓; partitions
  cache get() returns null → overTarget arm inert in DT (feasibility exercised via
  zero-replica arm + single-node control) — over-target feasibility arm has NO test coverage.
- c-class observability delivered: SEND_OPERATION first-attempt info (capped Set, retries stay
  debug), movePartitionId in EXECUTE_MOVE/MOVE_SKIPPED, periodic WARN (30s throttle). Nit:
  warn throttle initial state 0 suppresses the first WARN when now() < 30000 (only affects
  virtual clocks starting near 0; production and this DT unaffected).
- DT does NOT exercise the budget-saturated path (EMERGENCY_PRIORITY_LANE_EXHAUSTED) — the
  surface-D near-no-op is invisible to this test.

### Item 6: deferred planner-side bypass (subagent trace, verdict PERMANENT-WEDGE-REACHABLE)
- Gate chain first-closed-wins (planning-gate-methods.js:638-658, 742-749). LOCAL_SERVE defers
  ALL ledger planning when PRIORITY_CONTROL_PLANE_RECOVERY_PENDING + ANY second reason
  (local-serve-readiness.js:66-94) and the node isn't serve-eligible.
- Bypass fires only on isPriorityRecoveryFollowUpOperationRequired; the run-22-gap ledger
  (2 nodes distinct = quorum target 2) is NOT quorum-spread-blocked → count-neutral spread
  REPLACE is invisible to the priority-recovery lane → bypass does NOT fire
  (priority-recovery-planning-gate-methods.js:289-319; priority-readiness.js:307-352).
  The hold's concentration measure is STRICTER than the recovery lane's quorum-distinct
  measure — that mismatch is the hole.
- Cycle: hold blocks non-exempt priority cures (e.g. sql_transactions REPLACE/ADD — priority
  but NOT emergency set) → global priority recovery stays ACTIVE → RECOVERY_PENDING persists;
  if a second persistent reason is co-located on the ledger-planner node AND sustained by the
  same concentration (LOAD_NOT_READY / STORAGE_PRESSURE on the hot seed whose drains are held;
  CONTROL_PLANE_WRITE_UNHEALTHY through the concentrated ledger) → ledger cure NEVER planned →
  concentration permanent → closed loop. Run-22's own readiness fence
  (snapshot_coverage_unavailable, ALL 5 nodes) shows the co-location condition occurs in
  practice; its 75s boundedness was contingent (independent fence resolution), not guaranteed.
- The implementer's deferral rationale ("bounded transient, gate re-evaluates, dependents held
  make the combination less likely") is REFUTED as a guarantee: holding dependents is itself
  what sustains RECOVERY_PENDING, and the second reason can be concentration-sustained.
- ⇒ DEFECT for the sealed statement's "PLANNED ... first" half: admitted-first is guaranteed;
  planned-first is not. Failure mode is typed + WARN-observable (better than run-22's silent
  wedge) but still a reachable permanent wedge. This is the vet's amendment 2(ii), marked
  REQUIRED, not delivered.

---

## VERDICTS (per attack surface)

A. PREDICATE MATH / LIVELOCK — PASS. 1-voter and 2-voter shapes: concentrated by definition
   (mathematically correct), holds only while actionable, and every cure is exempt + prompt
   (ledger ADDs emergency-class, replica_count=3 + odd policy, count-neutral REPLACE planned
   at target). 2-voter-at-target permanent shape unreachable. No livelock traced.
B. FALSE-POSITIVE HOLDS — PASS with notes. Learners never counted (raft_role 'learner'
   preserved by every writer; ledger active⟹voter-ready-gated). REMOVING = real voter ✓.
   Lag residuals are conservative (longer hold) except the row-delete-before-raft-shutdown
   window (seconds, release-early). Stale-'ready' dead/draining nodes inflate feasibility —
   vet amendment 1's D(2) planner-aligned node source NOT implemented (D(1) over-target arm
   WAS). Narrow, WARN-observable → note, not blocker.
C. HOLD PLACEMENT — PASS. Single interlock-wrapped createOperationInternal path; only 2
   external creators; disruptive branch + emergency-ADD early-return bypass the hold by
   construction; dedupe returns existing ops only; non-ledger REMOVEs held (run-20-consistent).
D. EMERGENCY BUDGET SCOPE — DEFECT (functional no-op, not an inversion).
   resolveConcurrentCreateBudgetScope's result is ONLY the single-flight mutex key
   (concurrent-add-budget.js:21-35 → getCreateBudgetSingleFlightKey); the admitted limit is
   computed by PARTITION CLASS in evaluatePriorityAddAdmission (priority-recovery-snapshot-
   workflow.js:105-186) — replica_operations was ALREADY emergency-class. Zero-slot starvation
   impossible (scope ≠ slot lane) BUT no overflow slots are added on concentration evidence
   (overflow requires publication-blockage evidence, :56-65) — the cure still competes for
   maxConcurrentAdds against in-flight priority ops (run-22: 43x budget_exceeded). Mitigation:
   the hold itself prevents lane-filling; residual = pre-hold-admitted wedged ops, bounded by
   CL-043 staleness (~60-70s). Also: REMOVE-type cures can never reach the classifier (REMOVE
   returns at :43). Comment/claim overstates what the code does.
E. BLAST RADIUS — PASS. Zero failures across all at-risk suites (638 asserts run over 11
   files); no strict payload/log/reason-set assertions exist anywhere in test/.
F. DT HONESTY — PASS with residuals. Real coordinator + real admission chain; fault-model
   predicate independence is the honest choice; red-on-revert proven (dt:prove artifact).
   Residuals: production row-transition sequence not replayed (removing-window unexercised);
   over-target feasibility arm untested (partitions get() → null); budget-saturated path
   untested.
G. TEST-0021 / CONSTRAINTS — PASS. No timeout/budget raised; actuals-only; c-class
   observability delivered (WARN 30s throttle, SEND_OPERATION first-attempt info, capped Set,
   movePartitionId). Nit: first WARN suppressed when now()<30s (epoch-start virtual clocks).
ITEM 6 (deferred planner-side bypass) — DEFECT / correctness hole for the sealed statement.
   PERMANENT-WEDGE-REACHABLE (see trace above): concentration measure ≠ recovery-lane
   quorum-distinct measure, so the count-neutral cure is bypass-invisible while the hold
   itself sustains RECOVERY_PENDING; a concentration-sustained second readiness reason on the
   ledger-planner node closes the loop permanently.

## OVERALL: FIX-FIRST
The core hold (predicate + admission placement + exemptions + DT) is sound, verified, and
regression-clean. But the design vet's REQUIRED amendment 2 is effectively unimplemented in
BOTH halves: (i) the emergency budget classification is functionally inert for admitted
limits, and (ii) the planning-gate bypass extension was deferred on a refuted boundedness
argument, leaving a reachable permanent planner-side wedge that breaks the sealed statement's
"planned first" clause. Also (iii) the DDL-pacing change does not reach the fail-fast path it
claims to fix (fresh CREATE TABLE with all targets held still throws
provisioning-insufficient-targets — no retry consumer, probe path hold-blind).
Minimum to SHIP: implement 2(ii) (feed concentration evidence into
isPriorityRecoveryFollowUpOperationRequired / the planning-gate bypass), make (i) real or
delete the inert branch + fix its comment, and either wire DDL wait-and-retry or excise the
"pace and retry" claim and own the widened fail-fast window explicitly in the quest.
