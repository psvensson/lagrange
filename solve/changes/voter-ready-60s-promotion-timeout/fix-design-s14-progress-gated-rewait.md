# Fix design s14 — progress-gated provisioning re-wait (Rank 1 reuse)

> **VET OUTCOME: KILL-as-written, diagnosis+direction SOUND → CORRECTED below.**
> The adversarial vet confirmed the budget-bound diagnosis and the "grant time
> while the cure progresses" direction, but killed the mechanism as written on
> three source-verified points, all now corrected:
> - **Budget cannot extend under the shared cap.** `timeoutBudget` (from
>   `tablePartitionProvisioningTimeoutMs`=30s, `:89-93`) is the single top-level
>   cap passed to every wait, and `waitForProvisionTargetNodeIds` self-caps each
>   call at 30s (`provision-target-methods.js:126-129`). The 180s that greened the
>   diagnostic came from raising that budget. **Correction:** the re-wait loops
>   FRESH per-window budgets (`createControlPlaneTimeoutBudget(baseMs)` each
>   window, NOT the depleted shared one), up to a 3× ceiling — each window ≤ the
>   30s per-call cap, so the cap is never violated and the extension is real.
> - **The snapshot never reaches the query layer.** The `null` at
>   `admission-interlock.js:336` is `conflictingOperationId`, not details; and
>   `createProvisioningTargetRejection` whitelists fields, dropping any snapshot.
>   **Correction:** drop all error-plumbing — read concentration DIRECTLY via a
>   new coordinator method `resolveOperationLedgerConcentrationProgressSnapshot()`
>   wrapping the already-exported `evaluateOperationLedgerQuorumConcentration`
>   (query engine already holds `this.rebalanceCoordinator`; owner boundary
>   respected). `this.systemCache` confirmed present.
> - **"Strict improvement each window" bails in the legitimate inter-REPLACE gap**
>   (two serialized REPLACEs; a static window between them, plus the 4-voter
>   REMOVING intermediate → non-monotonic). **Correction:** sliding-window
>   discriminator — track best-seen (lowest) worst-concentration; extend while a
>   new best occurred within the last `PROGRESS_STALL_WINDOWS` (=2) windows; fail
>   fast only after 2 consecutive no-progress windows. The DT encodes an
>   inter-move-gap case that MUST still succeed.
> - **Residual live risk (A/B watch, not a design kill):** extending the re-wait
>   + polling admission across all concurrently-created partitions in the
>   overloaded bootstrap window is the same load-amplification shape as the s9
>   `692c9dbb` regression. Mandatory live-A/B watch item; scoped to
>   quorum-concentrated holds to limit it.
>
> _Corrected mechanism is authoritative; original text below kept for the record._

---


Confirmed by the budget diagnostic (`budget-diagnostic-verdict-s14.md`): the [2/4]
ledger-concentration blocker is BUDGET-BOUND — the cold-bootstrap
3-voters-on-seed → ≤1/node spread (two serialized REPLACEs, ~25-40s) outlasts the
provisioning re-wait's effective ~20-30s window. This designs the Rank-1 reuse:
extend the ALREADY-SHIPPED transient re-wait to continue past its base window
WHILE the ledger concentration is measurably improving, and fail fast the instant
it goes static (a wedge). Not built yet — to be adversarially vetted first (the
mint-cap fix died on an unreachability a vet caught).

## Reuse target (existing, proven)

`waitOutWholeClusterTransientProvisioningHold`
(`sql-query-engine-initial-partition-provisioning.js:707-728`) → one
`waitForProvisionTargetNodeIds` call with `maxWaitMs =
tablePartitionProvisioningTimeoutMs` (30s), clamped by the caller's remaining
`timeoutBudget` (~20s observed). It already fires on exactly our state
(`isWholeClusterTransientProvisioningHold`: `maximumProvisionableReplicaCount===0`
+ all-transient + defaulted minimum, `:691-705`). The gap is only that its window
is a FIXED cap, blind to whether the spread is progressing.

## The problem the current re-wait can't see

The rejection carried to the query layer has the reason code but NO concentration
measure: the interlock error is thrown with `null` details
(`rebalance-coordinator-ledger-interlock-admission.js:330-337`). So the re-wait
cannot tell a *progressing* spread (`maxVotersOnOneNode` 3→2→1) from a *wedge*
(stuck at 3). It just waits the fixed window then throws.

## Change (two sites, small, reuses the concentration evaluator)

**Site A — plumb the concentration snapshot into the rejection.**
`ensureOperationLedgerQuorumSpreadFirst` already computes `evaluation`
(`operation-ledger-quorum-concentration.js` via `:316`). Pass a compact snapshot
of the actionable concentrated partition — `{partitionId, totalVoters,
maxVotersOnOneNode, votersOutsideHottest = totalVoters - maxVotersOnOneNode}` —
as the interlock error `details` (replacing the `null` at
`admission-interlock.js:336`). This flows through the existing rejection plumbing
into `rejectedTargetNodePlans` at the query layer (already surfaced there,
`sql-query-engine-provisioning-admission-methods.js:143-160`).

**Site B — progress-gated extension loop in the re-wait.**
Replace the single fixed-window `waitForProvisionTargetNodeIds` call in
`waitOutWholeClusterTransientProvisioningHold` with a bounded loop:
1. Wait one base window (the existing `maxWaitMs`), re-probe admission.
2. If `maximumProvisionableReplicaCount > 0` → return success (spread completed).
3. Else read the current `votersOutsideHottest` from the fresh
   `rejectedTargetNodePlans` snapshot. If it STRICTLY IMPROVED vs the previous
   window (or `maxVotersOnOneNode` strictly decreased) AND the caller's
   `timeoutBudget` has headroom AND a total-extension ceiling is not hit → grant
   another window.
4. If it did NOT improve this window (static → wedge) OR the ceiling/budget is
   exhausted → stop and return null (→ existing fail-fast throw at `:500-516`).

Ceiling: cap total re-wait at a safety multiple of the base window (proposal:
`PROGRESS_REWAIT_MAX = 3 × tablePartitionProvisioningTimeoutMs`, ~90s) so even a
slowly-oscillating concentration cannot wait unbounded. The caller `timeoutBudget`
remains an independent hard cap (honest attribution, per the existing `:680-685`
comment — but the base budget must itself be allowed to extend, since 30s < the
~25-40s spread; the ceiling + progress gate is what keeps that honest rather than
masking).

## Why this is Rank 1, not Rank 4 (masking)

The vetted-dead option is an UNCONDITIONAL longer wait (`alt4:84-89,134-143`).
This is conditional on STRICT concentration improvement each window: it waits out
a *progressing* transient (legitimate — the spread is actively curing) and fails
fast on a *static* wedge (the masking case alt4 rejected). The distinguishing
signal is the same one the hold itself uses
(`evaluateOperationLedgerQuorumConcentration`), so the wait and the hold can never
disagree about "is this still curing."

## Reachability (the mint-cap lesson)

The re-wait is reached exactly when `isWholeClusterTransientProvisioningHold` is
true (`:708`), which the diagnostic proved is the live state of all three aborts
(`maximumProvisionableReplicaCount===0`, all-transient
`operation_ledger_quorum_concentrated`, defaulted minimum). The new loop replaces
code on that live path — not a new branch gated by a condition Part-1-style
earlier code has already falsified. Confirmed reachable by the diagnostic itself.

## Validation

1. **DT red-on-revert**: a provisioning re-wait test with a mock admission whose
   concentration IMPROVES across probes (`maxVotersOnOneNode` 3→2→1) → assert the
   re-wait extends past the base window and returns success; and a STATIC mock
   (stuck at 3) → assert it fails fast at the base window (no extension). Revert
   the progress gate → the improving case throws at the base window before the
   spread completes = red. Plus a unit that the snapshot is threaded from the
   interlock error into `rejectedTargetNodePlans`.
2. **Anti-regression**: query-engine provisioning suite + the transient-hold-wait
   quest's tests must stay green (the fail-fast-on-static path is unchanged for
   genuine wedges; hard/explicit-minimum rejections still never take this path).
3. **Live 2-pre/2-post A/B** on the affinity demo: KEEP if [2/4] clears (matching
   the diagnostic's run-2 behaviour) WITHOUT masking — i.e. a genuinely wedged
   run must still fail fast, not hang to the ceiling. Watch the folded-in
   concentration timeline to confirm the extension only happens while
   `maxVotersOnOneNode` is dropping.

## Layered next-blocker (carried, not solved here)

Clearing [2/4] exposes the next gate (`operation_ledger_self_move_in_flight` at
load / control-plane settle STALL at [3/4], per the diagnostic). This fix is
necessary and unblocks the demo-binding provisioning gate; the next gate is a
separate follow-on in the same self-move / settle family. Do NOT scope-creep it
into this change.
