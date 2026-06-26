# Readiness-Guard & Reconcile-State-Table Simplification Inventory (levers #2 + #3)

Rev 2 (2026-06-21). Reframed after the membership cutover's "delete the projection"
premise was refuted (see `single-owner-cutover-completion-plan.md` §1, §7):
membership is consensus-hard and requires a failure detector, so the readiness
guards are not deletable race-papering — **they ARE an ad-hoc, unnamed failure
detector.** The lever-#2 win is therefore **CONSOLIDATION into one named detector
(SWIM/Lifeguard/φ-accrual semantics), not deletion.** Lever #3 (rebalancer reconcile
tables) is independent of this and remains a genuine deletion/consolidation target —
now the highest-confidence simplification of the three.

Line numbers are approximate (verify at edit time); the structure is the deliverable.

---

## LEVER #2 — Readiness guards = an ad-hoc failure detector (control-plane)

> **Scoping update (2026-06-21) — see `failure-detector-consolidation-scope.md`.** The
> "scattered, no named owner" premise was checked against the source + adversarially
> verified and **largely refuted**: the control-plane FD is ALREADY one function with one
> owner (`resolveProjectedActiveNodeSelection`, `active-node-projection.js:457`); the ~15
> guards below are its **in-pipeline helpers** (class A), and `control-plane-readiness-*`
> is **upstream evidence feeding it**. The genuinely-scattered residual is ~9–10
> independent transport-liveness probes (rebalancer ×5 + lease-service/node-readiness/
> replica-transition/query-routing/bootstrap) — but those are mostly **local real-time
> operational gates**, NOT a clean fold (routing them through the slower installed view
> could regress correctness). Lever #2 reduces to: (a) naming/doc of the already-
> consolidated FD (low value), or (b) a SWIM/Lifeguard/φ-accrual **protocol replacement**
> (a behavior-change upgrade, operator-gated per plan §6) — not the cleanup the table below
> implies. The table is retained as the FD-evidence map.

### 12 readiness dimensions
`control-plane-readiness-constants.js:7–18`
PROCESS_ALIVE, CLUSTER_MEMBER_HEALTHY, ROUTING_READY, LOAD_READY,
PLACEMENT_ELIGIBLE, PROVISIONING_ELIGIBLE, CONTROL_PLANE_WRITABLE,
CONTROL_PLANE_PUBLISHED, CONTROL_PLANE_RECOVERY_ELIGIBLE,
METADATA_PUBLICATION_HEALTHY, REPAIR_ELIGIBLE, SERVE_ELIGIBLE.

### Guards / graces / overlays / fast-paths — mapped to failure-detector roles

The "Disposition" column replaces rev-1's "removable if single-owner" — these are
detector inputs/rules to **fold into one named FD module**, not to delete.

| # | Guard | File:line | FD role it plays | Disposition (consolidate into named FD) |
|---|-------|-----------|------------------|-----------------------------------------|
| 1 | Heartbeat grace (60s) | active-node-projection.js:41 | liveness suspicion window | → FD suspect-timeout (φ-accrual / SWIM probe timeout) |
| 2 | Ready-lease grace | active-node-projection.js:85 | lease-based liveness | → FD liveness evidence input |
| 3 | Transport-retention grace (CL-001 C) | active-node-projection.js:316 | anti-false-positive on transient stall | → **Lifeguard local-health / "refute suspicion"** |
| 4 | Liveness-fallback projection | active-node-projection.js:329 | live-transport overrides stale readiness | → FD direct-probe (SWIM ping-req analog) |
| 5 | Runtime-authority CONFIRMED overlay | active-node-projection.js:202 | positive liveness evidence | → FD alive evidence |
| 6 | Runtime-authority ESTABLISHING overlay | active-node-projection.js:205 | joining/not-yet-confirmed | → FD join-state (suspect-until-confirmed) |
| 7 | Recovery-eligible overlay | active-node-projection.js:226 | re-admit after recovery | → FD/agreement join path |
| 8 | **Membership-freeze gate (broad_suspicion)** | active-node-projection.js:675 | **quorum-safety: don't remove on mass suspicion** | → **FD suspicion-quorum rule (SWIM/Akka split-brain). Keep the property; re-home it.** |
| 9 | CDC transport grace (15s) | control-plane-readiness-evidence-reasons.js:60 | transient-pending suppression | → FD suspect window (health, partial) |
| 10 | Self-node fast path | control-plane-readiness-evidence-reasons.js:410 | self is trivially alive | → FD self-knowledge input |
| 11 | Publication-gate filter | control-plane-readiness-publication-aware.js:19 | placement spread, not liveness | out of scope (placement) |
| 12 | Provisioning convergence grace | control-plane-readiness-diagnostics-eligibility.js:603 | provisioning, not membership | out of scope |
| 13 | Lease transport guard | control-plane-readiness-node-service-rows.js:248 | service-status during recovery | → FD evidence (partial) |
| 14 | Self-node cluster-member fast path | (overview §1.4.12; isClusterMemberHealthy) | self is trivially alive | → FD self-knowledge input |
| 15 | Lease-sweep transport guard | LeaseService (overview §1.4.12) | anti-false-positive on CDC lag | → **Lifeguard refute-suspicion** |

**Tally:** 12 dimensions, ~15 guards. **~10 are failure-detector evidence/rules**
(#1–8, #10, #14, #15) that **consolidate into ONE named detector module** — that is
the lever-#2 win: fewer, named, specified suspicion logic with known correctness,
replacing scattered ad-hoc graces. #8 (freeze) is the **suspicion-quorum safety
property** — keep it, re-home it as the detector's quorum rule. #11–#13 are
placement/provisioning, out of scope. **NOT a deletion exercise** (the refuted rev-1
framing); a replace-with-protocol exercise.

---

## LEVER #3 — Rebalancer reconcile/dispatch state-tables (the genuine deletion target)

Independent of the membership/FD finding — this is real, redundant state-machine
sprawl and is now the **highest-confidence** simplification.

### Core lifecycle (single source — keep)
`operation-lifecycle.js`: 8 core states + 3 orthogonal sub-machines (RETRY,
RETENTION, VISIBILITY) + ~36 transitions. **Coherent; stays.** The sprawl is the
surrounding tables.

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
primary state-enum tables (omits 3 in `recovery-reconcile-shared.js`:
RECONCILED_REPLICA_STATUS_RESOLUTION_STATE :533,
PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE :602, …_RELEASE_DECISION_STATE :636).
Across the `operation-workflow-*` family it is **14 files**; across all of
`src/rebalancer/` there are **~96 primary state tables in ~35 files**.

### Duplication: the absence-sentinel + freshness triad (the consolidation lever)
**8 tables** are a true 3-value triad {healthy, degraded, …_UNAVAILABLE}:
HISTORY_FRESHNESS, LEASE_FRESHNESS, TRANSITION, WAKE, TIMEOUT, RETRY_DEADLINE,
RETRY_BUDGET, COMMAND. Four more carry the same `…_UNAVAILABLE` absence-sentinel:
PUBLICATION_FENCE (+INCOMPLETE), DISPATCH (+IN_FLIGHT), TERMINAL (4-way),
DURABLE_OPERATION (2-way). **One parametric `freshness/availability` evaluator**
replaces the 8 exact triads and normalizes the 4 near-variants. This is genuine
redundancy — the same shape re-declared, NOT essential evidence integration (unlike
the membership guards).

### Caveat — partial coupling to membership (now reframed)
Rev 1 claimed layers 1–2 (authority/lease/owner) + the recovery-drain tables exist
to re-derive "is this node a valid owner/target" because membership has no owner,
and would collapse once lever #1 landed. **Reframed:** lever #1 is now "name the
membership layers + collapse the READERS," not "delete the projection." Once
operation owners READ the installed membership view (consumer-collapse step) instead
of re-deriving owner validity, the authority/lease tables shrink — but the TRIAD
consolidation (the parametric evaluator) is independent and can proceed now. The
self-dispatch fork (`operation-workflow-owner-handoff-state.js:223`,
`ownerNodeId===this.nodeId`, inside `wakeCoordinatorCreatedRemoteOwner` @:206) still
lives in this seam.

---

## Suggested order (revised twice — see cutover plan §8, 2026-06-21)

**Implementation-contact update (2026-06-21): the original order's first two items
were checked against the source and both shrank. See cutover plan §8 for the audit.**

- ~~**Lever #3 triad consolidation FIRST**~~ — **DROPPED.** The availability half is
  already one parametric function (`selectOperationWorkflowVariant`,
  `operation-workflow-owner-evidence.js:69`); the classification half is 8 idiosyncratic
  one-line ternaries over different inputs; 6 enum values are 1:1 reason codes that must
  be preserved. No genuine redundancy to consolidate — a parametric evaluator would be a
  forced, lossy wrapper. Not a real lever.
- ~~**Lever #1 consumer-collapse (~11 consumers)**~~ — **ESSENTIALLY ALREADY DONE.**
  21-file audit found **0** genuine ad-hoc membership-truth re-derivers; reads already
  route through the published-view API or the legitimate projection (~5 callers). The
  "re-derivers" are transport-liveness FD gates (→ Lever #2), not membership reads.

**Actual order now:**
1. **§5 step 1 — name the layers + structural guard (NEXT, safe, additive).** Codify the
   FD/agreement/dissemination boundary; add a structural test pinning the ~5 legitimate
   `resolveActiveNodeViews` callers (allowlist), so new code must read the published view
   instead of re-deriving. Audit confirmed **0 current violators** → lands GREEN, locks in
   the already-correct architecture, prevents regression.
2. **Lever #2 FD consolidation** — fold the ~10 membership-derived guards + the
   transport-liveness gates (critical-topology, priority-readiness connected-nodes,
   remove-safety `pingNode`) into one named failure detector (SWIM/Lifeguard/φ-accrual),
   re-home the freeze gate as its suspicion-quorum rule (cutover plan §5 step 3). This is
   the larger, genuine REPLACE-with-named-protocol payoff, not delete.

## Verification status
Inventory file:lines + counts subagent-verified against HEAD (2026-06-20),
ACCURATE-WITH-CORRECTIONS applied (DISPATCH_WAKE = 7 states; PROGRESS = 11 keys;
self-dispatch fork :223; counts are a floor). Rev-2 reframe (2026-06-21): lever #2 is
consolidation-into-a-named-FD, not deletion (membership is consensus-hard — see
cutover plan §1). The #8 freeze SAFETY classification was independently confirmed
against `membership-publication-target-selection.js:113` (`canPublishSteadyTrim`
requires `membershipFreezeActive !== true`).
