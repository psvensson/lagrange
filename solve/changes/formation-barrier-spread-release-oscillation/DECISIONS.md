# Design decisions: formation-barrier-spread-release-oscillation

Status: working notes during implementation (2026-08-09, HEAD 788682214).

## D1 — The barrier itself is not the bug

Code trace of `getOperationLedgerFormationBarrierSnapshot`
(src/bootstrap/node-joining-operation-ledger-formation-readiness.js:209-300):
within ONE iteration every release leg is computed from one cache pass plus at
most one owner-RPC read — the snapshot is coherent. The field oscillation
(`waiting_for_ledger_spread` <-> `waiting_for_ledger_observation`,
`spreadProofComplete` flapping) is CROSS-iteration evidence-source switching:
when the owner-RPC lane fails under pressure, `spreadProofComplete` falls back
to the cache COUNT-completeness (true, concentrated -> WAITING_SPREAD); when
the RPC succeeds against an unspread placement, `spreadProofComplete` becomes
authoritative spread-completeness (false -> WAITING_OBSERVATION). That is log
noise over a fail-closed wait, not a release-blocking defect: once the cache
truly shows target-count voters unconcentrated, the barrier proceeds to the
drain leg without needing the RPC lane. No barrier change; its fail-closed
timeout semantics stay untouched. The deterministic repro asserts this flap
signature explicitly.

## D2 — Which links actually bind (repro-driven)

Write-shape inventory at HEAD:
- ALL workflow step-transition persists already bypass the system write
  session (`buildOperationTransitionPersistOptions`,
  operation-workflow-owner-execution-lane.js:563-568 — unconditional
  `disableSystemWriteSession: true`; also terminal-transition repair).
- The operation-row INSERT (`persistNewOperationUnlocked`,
  replica-operation-repository-mutation-persistence-methods.js) does NOT — it
  carries a `coordinator:<opId>` system write session whose bookkeeping rides
  the seed-led, unspread `sql_transactions`/`sql_transaction_participants`/
  `sql_write_operations` tables. During the concentrated formation window this
  is Link A: the spread op's own admission write depends on the tables it
  exists to spread, surfacing as retryable-forever
  DISTRIBUTED_PARTICIPANT_FAILURE.
- Link B: `reconcileStoppingOperationProgress`
  (operation-workflow-recovery-observation.js) loops
  `control_plane_pressure_degraded` deferRetry forever on an UNAVAILABLE
  stopping-replica observation. Under formation pressure (which persists
  exactly while the ledger is concentrated), an op that reached STOPPING can
  never terminalize, so the barrier's zero-in-flight drain leg is starved and
  a REMOVING source row keeps the quorum concentrated.

The repro (see D3) shows the circle: A blocks the NEXT cure's admission, B
pins the CURRENT cure at STOPPING; either alone keeps the ledger concentrated,
which keeps the pressure on, which keeps both failing. Both must be cut.
Ablation runs (A-only / B-only) recorded in the final report.

## D3 — Deterministic repro shape

Sibling DT `test/convergence/dt-formation-barrier-spread-release-oscillation.test.js`
per RESEARCH.md: real barrier loop + real MovePlanner + real
RebalanceCoordinator (timeout-test-coordinator fixture) + SystemTableCache on
a virtual clock. Shared fixture helpers extracted to
`test/convergence/formation-barrier-test-fixture.js` (consumed by the existing
dt-formation-priority-placement-before-active.test.js unchanged in behavior)
to stay inside the test file-size cap and the duplication ratchet.

Fault model (production-shaped, run-22 lineage like dt6-formation-ledger-*):
- "Formation storm" is active exactly while the ledger quorum is concentrated
  (and after the first move admitted alone, matching run-22's clean first
  self-move).
- Ledger mutations that CARRY a system write session fail
  DISTRIBUTED_PARTICIPANT_FAILURE (deferRetry) while the storm is active;
  session-less single-statement writes into the live seed-led ledger succeed.
  The discriminator is the REAL `queryOptions` the repository emits.
- Authoritative services reads (owner-RPC placement lane AND the repository's
  stopping-replica status probes) fail alternately under the storm, so the
  cache-lane release-evidence path is exercised (RESEARCH.md delta 3) and the
  field's state flap is reproduced.

RED (HEAD): barrier throws OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT with
2/3 distinct voter nodes and the first spread REPLACE stuck at STOPPING.
GREEN (relief): same fixture releases SATISFIED within budget.

## D4 — Relief A: session-less admission write for ledger self-coupled ops

`persistNewOperationUnlocked` passes
`disableSystemWriteSession: isOperationLedgerPartition(...)` for operations
whose OWN partition is an operation-ledger partition. Routed through the
existing owner (mutation gateway -> control-plane gateway); no parallel write
path; the insert remains OR-IGNORE idempotent with authoritative-read outcome
confirmation, so no consistency machinery is bypassed
(formation-circularity template item 5: the op row still lives in the ledger;
only the cross-table session bookkeeping — the self-dependency — is dropped,
exactly as every transition write already does). Scoped by partition identity
(typed predicate), not by concentration state, so the write shape is
deterministic and cannot flap.

The fail-soft owner-lease touch keeps its session (a lease-touch failure never
fails the transition; not load-bearing for the starvation).

## D5 — Relief B: bounded, loud STOPPING-observation escalation

`reconcileStoppingOperationProgress` escalates after
`STOPPING_OBSERVATION_STARVATION_DEFERRAL_LIMIT` consecutive UNAVAILABLE
deferrals for the same operation: it fails the operation visibly
(typed reason via the existing `failOperation` terminal transition write —
session-less, so it can land during the window) instead of deferring again.
- Bound is DEFERRAL-COUNT based (clock-free, deterministic; the sealed
  statement allows "after N deferrals or T elapsed"). 40 deferrals at the
  250ms TRANSITION_RETRY_DELAY_MS cadence ~= 10s of continuous observation
  unavailability before escalation — far above transient blips, far below the
  120s barrier budget.
- Every exit is loud and typed (retry-loops template item 3); the counter
  clears on any non-UNAVAILABLE observation (item 7: only REAL evidence
  resets it, not a transport ack).
- Fail-closed is preserved: the escalation never fabricates completion
  evidence — it turns silent starvation into a visible terminal FAILED whose
  aftermath is owned by the existing actuals-driven planner re-mint and
  failed-removal cleanup machinery. The engaged barrier still times out
  fail-closed if spread genuinely cannot be achieved.

## D5b — Fault-model refinement forced by the fence (repro iteration 2)

With ALL authoritative services reads shed while concentrated, the canonical
cure tail (the planner's REPLACE -> ADD -> surplus REMOVE sequence) wedged on
the priority-surplus-REMOVE placement fence
(rebalance-coordinator-topology-guard-methods.js
ensurePrioritySurplusRemovePlacementFenceAllowed -> authority_unavailable):
the destructive drain that finishes the cure needs one successful
partition-scoped owner-RPC placement read. The fence is a recorded
fail-closed destructive-commit revalidation (run4 invariant;
dt6-priority-surplus-remove-authoritative-placement-fence) and was NOT
weakened. Instead the DT fault model was refined to what the field actually
shows: red-run barrier logs contain owner_rpc_lane placement observations
DURING the storm (authoritativePlacementSource:"owner_rpc_lane",
observedVoterCount:3), i.e. partition-scoped placement reads yield
intermittently under pressure, while the service_id-scoped STATUS probes
(the STOPPING observation) stayed control_plane_pressure_degraded across the
whole window. The DT therefore sheds status probes fully and placement reads
alternately. Under that model the fence admits the drain within a retry or
two (its level-triggered planner re-attempt already existed) and the cure
completes without touching the fence. If a future field trace shows the
placement lane fully starved for 120s, the fence's pressure behavior becomes
its own quest (same class as C, D6).

## D7 — Repro driver shape (what is real vs modeled)

The green-path case's driver folds steps optimistically; the repro driver
instead advances ONE workflow action per barrier poll through the REAL
owners: coordinator.createOperation (real admission + INSERT write shape),
workflowOwner.updateStep (real transition persists),
workflowOwner.reconcileStoppingOperationProgress (real observation +
defer/escalate/complete). The driver owns only the PHYSICAL placement
effects a remote node would produce (target row on promotion, source-row
deletion once STOPPING is accepted), mirroring dt6's "modeled at the layer
where the invariant is produced". Two fixture traps found and fixed on the
way: REBALANCER_MOVE_TYPE values are lowercase while OperationType is
uppercase (a silent physical-effect no-op), and
SELECT_PARTITION_SERVICES_BY_ENTITY params are [service_type, partition_id]
(the fence read must be emulated with that order).

## D8 — Static-gate accounting

- operation-workflow-recovery-observation.js would have crossed the 800-line
  source cap; the escalation moved to
  src/rebalancer/operation-workflow-stopping-starvation.js (single-owner
  module, all exports consumed).
- Complexity: this change adds ZERO new violations (verified per-file vs
  HEAD blobs). The repo-wide ratchet currently fails 1846/1842 on CLEAN
  HEAD (measured in a throwaway worktree) — pre-existing main debt outside
  this quest's scope, plus +1 from the concurrent session's in-flight tree.
  reconcileStoppingOperationProgress stays a pre-existing violation
  (HEAD 15 -> 16 with the clear branch; count unchanged).
- Source oversized-file ratchet now reports headroom (27/28): tighten
  SOURCE_BASELINE_COUNT at commit time if the tree still shows headroom.

## D9 — Independent verifier pass (subagent aeb311ca267684315) and hardenings

Adversarial verification against the formation-circularity and retry-loops
templates returned NO must-fix; three SHOULD-FIX hardenings were all
implemented:
1. (A2) The awaited owner-lease touch on the create path still carried a
   system write session for ledger self-ops (the "last session-coupled
   self-write" claim was inaccurate). touchOperationOwnerLease now passes
   `disableSystemWriteSession: isOperationLedgerPartition(...)`
   (replica-operation-repository-mutation-update-methods.js); non-ledger
   lease touches keep a byte-identical write shape (the downstream option
   key already always existed as false). The DT keeps its lease-SQL
   carve-out ONLY so the reverted baseline's fail-soft 15s lease-retry
   stalls cannot dominate the red run's wall clock.
2. (A3) The 40-deferral bound was call-rate coupled (level-triggered
   re-drives could burn it fast). The escalation now requires BOTH the
   count AND >= 10s elapsed since the first deferral, anchored on the
   owner's timeout-check clock (timeSource-aware — the DT drives it on
   virtual time at the production 250ms cadence with the real 120s barrier
   budget).
3. (B7) A cache-fallback OBSERVED (authoritative lane failed, stale cached
   row) used to reset the count, silently re-starving the wedge shape where
   the stop is NOT executing. observeStoppingReplicaProgress now carries
   the observation `source`, and only genuinely fresh evidence clears the
   record; cache-fallback freezes it (never increments).
Verifier-classified ACCEPTABLE-RISK items (not implemented, recorded):
unevicted map entries for ops terminalized by other lanes (tiny, restart
resets); bounded visible re-mint churn (~6 ops/min/partition, typed logs)
under a >10s persistent status-lane outage with a healthy dispatch lane.

## D6 — Candidate C (feasibility-scan owner reconciliation) not taken

The admission-hold feasibility scan counts only `connection_state='ready'`
targets (operation-ledger-quorum-concentration.js:80-107) while placement
eligibility accepts JOINING — the two-owners-disagree finding stands, but in
the minimal repro the hold's engagement state is irrelevant (no dependent ops
exist during the pure formation window, and the hold never blocks the
ledger's own spread moves). Cutting it is not required to release the barrier
and would widen the blast radius (dependent-op admission policy) beyond the
sealed statement. Recorded here for a follow-up quest.
