# Reuse map — solved-sibling patterns for the ledger-concentration blocker (s14)

User directive: "take inspiration from similar problems already solved." The
[2/4] blocker is the residual tail of FIVE already-solved/exhausted sibling
quests, all committed in `src`. Not a regression, not new — a **coverage gap**:
the cold-bootstrap spread machinery all fires, but the 3-on-seed → ≤1/node spread
(two serialized REPLACEs, ~25–40s) does not complete inside the ~20s effective
provisioning budget. (Correction to earlier scoping: the `provisionable=0`
zero-case IS covered by the transient re-wait for defaulted-minimum CREATEs; the
residual is budget length, not an unhandled zero.)

## Solved-fix inventory (mechanism · site · covers/not)

1. **`formation-ledger-quorum-spread-first`** (SOLVED) — builds the hold.
   Predicate `operation-ledger-quorum-concentration.js:130`; engaged-when
   `:154` (`spreadActionable`); hold at
   `rebalance-coordinator-ledger-interlock-admission.js:201-213,315-338`. Covers
   cold bootstrap detection; does NOT make the spread complete or rescue
   fail-fast.
2. **`provisioning-admission-ledger-hold-transient-wait`** (SOLVED) — provisioning
   waits out the hold. `sql-query-engine-initial-partition-provisioning.js:157-169`
   → `:691-728` (`waitOutWholeClusterTransientProvisioningHold`, `maxWaitMs =
   tablePartitionProvisioningTimeoutMs` 30s, clamped by caller `timeoutBudget` to
   ~20s). `operation_ledger_quorum_concentrated` ∈ transient reasons
   (`sql-query-engine-provisioning-admission-methods.js:23`). Covers the zero-case
   for defaulted-minimum CREATEs; does NOT cover a spread that outlasts the ~20s.
3. **`formation-ledger-spread-completion-self-move-interlock-deadlock`**
   (`c7a3bf19`+`c78833f0`) — owner-RPC re-verify of a ghost self-move
   (`rebalance-coordinator-ledger-interlock-admission.js:290`) + drain-phase
   replacement credit (`in-flight-aware-replica-count.js:217-276`). Covers the
   ghost-blocked 2nd REPLACE + over-target; not the pure-slow spread.
4. **`formation-ledger-spread-window-follow-up-latency`** (`4abd0bce`) —
   completion/handoff re-drive of a pending remote-owned self-move dispatch
   (`operation-workflow-dispatch-rearm-evidence.js`,
   `operation-workflow-owner-handoff-state.js`), killing the 8–11s pre-dispatch
   idle (~43s→~19s window). Applies to the slow-spread case; can't remove the
   ~11s×2 exec floor.
5. **`formation-ledger-post-spread-voter-visibility-latency`** (EXHAUSTED) — sealed
   thesis refuted (spread never physically completed). Kept a durable role-write
   confirm.

## Ranked reuse (decided by the budget diagnostic → Rank 1 confirmed)

- **Rank 1 (top pick, budget-bound — CONFIRMED live):** extend fix #2's re-wait to
  the CREATE's full provisioning budget, **gated on concentration improving
  between probes** (reuse `evaluateOperationLedgerQuorumConcentration`,
  `operation-ledger-quorum-concentration.js:170`). Wait while progressing; fail
  fast if static (wedge). Smallest reuse; mechanism already points at the reason
  code. Site: `sql-query-engine-initial-partition-provisioning.js:691-728`.
- **Rank 2 (if dispatch-bound):** extend fix #4's completion-triggered re-drive to
  re-PLAN move-2 at move-1's terminal seam (planner emits one REPLACE/tick,
  `move-planner-move-calculation-methods.js:535-540`); reuse
  `enqueueLocalReadyNodeDispatchRetry`. NOT the confirmed path (diagnostic shows
  progressing spread), keep as fallback.
- **Rank 3:** fixes #3A/#3C — already committed; relevant only to the s13
  over-target 4-voter wedge (`overTarget:false` decouples s14).
- **Rank 4 (vetted-dead):** unconditional longer wait, no progress gate — masking
  per `alt4:84-89,134-143`.

## Prevention lead (D)

Concentration is minted at formation: `seed-registration-phase.js:382` registers
all 3 `replica_operations` replicas on the single seed; no formation-time spread
(deliberately deferred, `design-fix.md:100`). Smaller-than-redesign reuse:
fast-track the first count-neutral spread REPLACE via the existing emergency-ADD
interlock exemption
(`rebalance-coordinator-ledger-interlock-admission.js:136-141`) when a fresh join
creates a `feasibleTargetNodeId`. A lead, not the immediate fix.

Commits cited: `c7a3bf19`, `c78833f0`, `4abd0bce`, `60bbd154`, `ba247ec8`.
