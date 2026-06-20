# Readiness-Guard & Reconcile-State-Table Simplification Inventory (levers #2 + #3)

Worklist for the deletion/consolidation that the single-owner cutover
(`single-owner-cutover-completion-plan.md`) unlocks. Line numbers are
approximate (verify at edit time); the structure is the deliverable.

---

## LEVER #2 — Readiness dimensions & guards (control-plane)

### 12 readiness dimensions
`control-plane-readiness-constants.js:7–18`
PROCESS_ALIVE, CLUSTER_MEMBER_HEALTHY, ROUTING_READY, LOAD_READY,
PLACEMENT_ELIGIBLE, PROVISIONING_ELIGIBLE, CONTROL_PLANE_WRITABLE,
CONTROL_PLANE_PUBLISHED, CONTROL_PLANE_RECOVERY_ELIGIBLE,
METADATA_PUBLICATION_HEALTHY, REPAIR_ELIGIBLE, SERVE_ELIGIBLE.

### Guards / graces / overlays / fast-paths

| # | Guard | File:line | Triggers on | Papers over | Removable if single-owner |
|---|-------|-----------|-------------|-------------|---------------------------|
| 1 | Heartbeat grace (60s) | active-node-projection.js:41 | lastHeartbeat > now−60s | stale-heartbeat false trim | **yes** (machine owns liveness) |
| 2 | Ready-lease grace | active-node-projection.js:85 | readyLeaseExpiresAt > now | lapsed lease, node still up | **yes** |
| 3 | Transport-retention grace (CL-001 C) | active-node-projection.js:316 | transport + fresh lease/hb | post-restart hb-stall trough | **yes** (port to machine) |
| 4 | Liveness-fallback projection | active-node-projection.js:329 | allowLivenessFallback + fresh | recovery-ineligible w/ live transport | **yes** (port to machine) |
| 5 | Runtime-authority CONFIRMED overlay | active-node-projection.js:202 | runtimeAuthority=confirmed | missing cluster-member-healthy dim | **yes** |
| 6 | Runtime-authority ESTABLISHING overlay | active-node-projection.js:205 | runtimeAuthority=establishing | delayed publication | **yes** |
| 7 | Recovery-eligible overlay | active-node-projection.js:226 | allowRecoveryEligible + eligible | self-denial during CDC lag | **yes** |
| 8 | **Membership-freeze gate (broad_suspicion)** | active-node-projection.js:675 | ≥N missing, ≥ratio suspected | **SAFETY: quorum loss under suspicion storm** | **NO — port as a real machine transition guard, do not delete** |
| 9 | CDC transport grace (15s) | control-plane-readiness-evidence-reasons.js:60 | age≤15s + transport-backed | recovery just entered, transport pending | partial (health, not membership) |
| 10 | Self-node fast path | control-plane-readiness-evidence-reasons.js:410 | localNodeId===nodeId + local svc | missing row while bootstrapping | no (local self-knowledge) |
| 11 | Publication-gate filter | control-plane-readiness-publication-aware.js:19 | prioritySpreadPending!==true | suppress PRIORITY_PARTITIONS_NOT_SPREAD | no (placement, lever-separate) |
| 12 | Provisioning convergence grace | control-plane-readiness-diagnostics-eligibility.js:603 | state=CONVERGENCE_GRACE | new-node provisioning delay | no |
| 13 | Lease transport guard | control-plane-readiness-node-service-rows.js:248 | RECOVERY_GRACE_MG_SERVICE_STATUSES | service status during lease recovery | partial |
| 14 | Self-node cluster-member fast path | (overview §1.4.12; isClusterMemberHealthy) | nodeId===this.nodeId + active | self-denial during CDC lag | no (local self-knowledge) |
| 15 | Lease-sweep transport guard | LeaseService (overview §1.4.12) | router connected during expired-lease sweep | CDC propagation delay poisoning connection_state | **yes** (membership-derived) |

**Tally:** 12 dimensions, ~15 guards. **8 are membership-derived and collapse
with the single owner** (#1–7, #15); **#8 is safety and must be re-homed, not
removed**; the rest (#9–14) are health/placement/local-self and are out of scope
for lever #2 (some fold into lever #3 / placement narrowing).

---

## LEVER #3 — Rebalancer reconcile/dispatch state-tables

### Core lifecycle (single source — keep)
`operation-lifecycle.js`: 8 core states + 3 orthogonal sub-machines (RETRY,
RETENTION, VISIBILITY) + ~36 transitions. **This is coherent and stays.** The
sprawl is the surrounding tables, below.

### Independent state-tables (the consolidation target)

| Table | File:line | States | Purpose |
|-------|-----------|--------|---------|
| OPERATION_WORKFLOW_PROGRESS_STATE_VALUES | operation-workflow-owner-constants.js:73 | 11 | progress kernel |
| EVIDENCE_CONTRACT_STATE | …owner-constants.js:173 | 2 | input contract gate |
| FORBIDDEN_INPUT_STATE | …owner-constants.js:178 | 2 | forbidden-evidence |
| DURABLE_OPERATION_STATE | …owner-constants.js:183 | 2 | record presence |
| TERMINAL_STATE | …owner-constants.js:189 | 4 | terminal outcome |
| HISTORY_FRESHNESS_STATE | …owner-constants.js:196 | 3 | history age |
| TRANSITION_STATE | …owner-constants.js:202 | 3 | transition gate |
| OWNER_AUTHORITY_STATE | …owner-constants.js:208 | 3 | local/remote owner |
| LEASE_FRESHNESS_STATE | …owner-constants.js:215 | 3 | owner-lease staleness |
| SERIAL_DEPENDENCY_STATE | …owner-constants.js:222 | 2 | serial ordering |
| RETRY_BUDGET_STATE | …owner-constants.js:228 | 3 | attempts remaining |
| RETRY_DEADLINE_STATE | …owner-constants.js:234 | 3 | deadline |
| TIMEOUT_STATE | …owner-constants.js:240 | 3 | timeout |
| STALE_PROGRESS_STATE | …owner-constants.js:246 | 3 | stale progress |
| PUBLICATION_FENCE_STATE | …owner-constants.js:252 | 4 | visibility fence |
| DISPATCH_STATE | …owner-constants.js:259 | 4 | dispatch ack |
| WAKE_STATE | …owner-constants.js:266 | 3 | remote wake |
| COMMAND_STATE | …owner-constants.js:272 | 3 | command exec |
| EXECUTOR_FAILURE_RECONCILE_STATE | operation-workflow-executor-outcome-reconcile-methods.js:22 | 2 | executor failure decision |
| EXECUTOR_OUTCOME_OPERATION_VISIBILITY_STATE | …executor-outcome-reconcile-methods.js:41 | 3 | executor outcome visibility |
| DISPATCH_REARM_RECONCILE_STATE | operation-workflow-dispatch-rearm-evidence.js:39 | 8 | rearm eligibility |
| DISPATCH_WAKE_PROGRESS_PREEMPT_STATE | operation-workflow-dispatch-wake-progress-decision.js:5 | 7 | wake preemption |
| DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE | …dispatch-wake-progress-decision.js:55 | 7 | wake pending target |
| PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_STATE | operation-workflow-recovery-reconcile-dispatch-pending.js:36 | 8 | recovery dispatch reentry |
| STOPPING_REPLICA_OBSERVATION_STATE | operation-workflow-recovery-reconcile-shared.js:59 | 3 | source-stop observation |
| OBSERVED_PROGRESS_TABLE_STATE | …recovery-reconcile-shared.js:69 | 3 | progress table context |
| OBSERVED_PROGRESS_OPERATION_ROUTE_STATE | …recovery-reconcile-shared.js:88 | 3 | op ownership routing |
| TIMEOUT_RECONCILE_OPERATION_SELECTION_STATE | …recovery-reconcile-shared.js:180 | 8 | timeout reconcile selection |
| PRIORITY_RECOVERY_OPERATION_DRAIN_STATE | …recovery-reconcile-shared.js:273 | 6+ | replica drain |
| PRIORITY_RECOVERY_OPERATION_DRAIN_SOURCE_STATE | …recovery-reconcile-shared.js:375 | 5+ | source drain |

**The 30 tables above are a FLOOR.** The 6 enumerated files alone hold **33**
primary state-enum tables (this list omits 3 in `recovery-reconcile-shared.js`:
RECONCILED_REPLICA_STATUS_RESOLUTION_STATE :533,
PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE :602, …_RELEASE_DECISION_STATE
:636). Across the full `operation-workflow-*` family it is **14 files**; across
all of `src/rebalancer/` there are **~96 primary state tables in ~35 files**.
This is a larger consolidation surface than the table above shows.

### 6 reconcile/dispatch layers
1. Contract & evidence — EVIDENCE_CONTRACT, FORBIDDEN_INPUT, DURABLE_OPERATION
2. Authority & lease — OWNER_AUTHORITY, LEASE_FRESHNESS, TRANSITION
3. Progress gate — HISTORY_FRESHNESS, SERIAL_DEPENDENCY, STALE_PROGRESS, TERMINAL
4. Budget & timeout — RETRY_BUDGET, RETRY_DEADLINE, TIMEOUT
5. Execution/visibility — DISPATCH, WAKE, PUBLICATION_FENCE, COMMAND
6. Outcome/reconcile — EXECUTOR_FAILURE, EXECUTOR_OUTCOME, DISPATCH_REARM, DRAIN, TIMEOUT_SELECTION

### Duplication: the absence-sentinel + freshness triad
**8 tables** are a true 3-value triad {healthy, degraded, …_UNAVAILABLE}:
HISTORY_FRESHNESS, LEASE_FRESHNESS, TRANSITION, WAKE, TIMEOUT, RETRY_DEADLINE,
RETRY_BUDGET, COMMAND. Four more deviate but still carry the same
`…_UNAVAILABLE` absence-sentinel: PUBLICATION_FENCE (+INCOMPLETE), DISPATCH
(+IN_FLIGHT), TERMINAL (4-way outcome), DURABLE_OPERATION (2-way). The shared
absence-sentinel across all ~12 is the real consolidation lever:
**one parametric `freshness/availability` evaluator** replaces the 8 exact
triads outright and normalizes the 4 near-variants.

### Why this is lever-#1-dependent
Layers 1–2 (authority/lease/owner) and the recovery-drain tables exist largely
to re-derive "is this node still a valid owner/target of the operation" because
there is no authoritative membership/owner answer to read — the same gap lever #1
closes. The self-dispatch paradox (`operation-workflow-owner-handoff-state.js:223`,
`ownerNodeId===this.nodeId` forking in-process vs transport dispatch — inside
`wakeCoordinatorCreatedRemoteOwner` opening at :206) lives in this seam.
**Do lever #1 first; then ~half these tables lose their reason to exist and the
remaining triad-tables consolidate into one evaluator.**

---

## Suggested order
1. Lever #1 (single-owner cutover) — makes #2 guards #1–7,#15 deletable and
   collapses rebalancer layers 1–2 + recovery-drain.
2. Lever #2 — delete the 8 membership-derived guards (re-home #8 freeze as a
   machine transition); each behind the gate.
3. Lever #3 — consolidate the ~12 triad-tables into one parametric evaluator;
   fold the now-redundant authority/owner tables.

## Verification status
Subagent-verified against HEAD (2026-06-20): **ACCURATE-WITH-CORRECTIONS**
(now applied). Every Lever-#3 owner-constants file:line and the #1–8 readiness
guard lines landed exactly; the load-bearing #8 freeze-gate SAFETY
classification was independently confirmed against the downstream trim gate
(`membership-publication-target-selection.js:113`, `canPublishSteadyTrim`
requires `membershipFreezeActive !== true`). Corrections folded in: DISPATCH_WAKE
tables have 7 states (not 3); PROGRESS_STATE_VALUES has 11 keys; self-dispatch
fork is :223; the table-count/file-spread figures were undercounts (now stated
as a floor). The thesis stands: the readiness guards and reconcile state-tables
are sprawling and largely membership-derived.
