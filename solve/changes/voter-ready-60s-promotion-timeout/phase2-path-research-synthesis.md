# Phase 2 path research — synthesis + recommendation

Four parallel read-only research agents evaluated the distinct Phase-2 approaches
to drain the durable surplus voter (the necessary-not-sufficient gap Part 1 /
`bf535665` left). Each returned cited seams and a VIABLE/RISKY/DEAD-END verdict.
Plus a decisive disk-confirm on the captured A/B node logs.

## The four paths

| path | verdict | why |
|---|---|---|
| **Alt-3a: re-drive the REPLACE's own remove-leg** | ✅ **VIABLE** | Dodges BOTH kills (interlock is creation-only; hasPendingMove is planner-only). Re-drive machinery already exists; the leg is persistently SAFETY-DEFERRED, not un-driven. Fix = targeted loosening of the remove-safety deferral. Never touches the interlock/runs-20/22 seam. |
| Alt-3b: invert ordering (learner-until-drained) | ❌ DEAD-END | Structurally blocked for exactly the binding partitions by min-replica-floor=3 (`remove-safety-evaluator.js:551-564`) + source-leader-handoff (`REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS`). Promote-first is WHY the group over-counts (keeps ≥3 voter-ready without joint consensus). "Couple on voter-ready" already exists (`:522`). |
| Alt-1: interlock owned-drain allowance + hasPendingMove exemption | ⚠️ RISKY | Mechanically clears both kills (with a planner-emit branch) but re-permits TWO concurrent membership changes on `replica_operations-p1` — the run-20 storm hazard, in the hottest formation window. Its two halves are never jointly load-bearing; where hasPendingMove blocks, Alt-3a is strictly cleaner. Reserve only as a narrow fallback for a genuinely-orphaned surplus. |
| Deepest: joint consensus / ConfChangeV2 in raft | ❌ DEAD-END (for this quest) | Our `liferaft` has NO log-replicated membership at all — no learner/voter concept, no ConfChange, membership is a local peer-array. Adding joint consensus = fork the vendored consensus core (multi-week/month), reopening the append/commit/quorum surface this project spent many sessions stabilizing, + a new stuck-in-joint failure class. File as a long-horizon epic only. |

## Decisive disk-confirm (settles the Alt-3a vs Alt-3b tension)

Alt-3b claimed the surplus is "usually orphaned" (REPLACE terminalized). Alt-3a
claimed it IS a live-REPLACE source. The captured A/B logs settle it — across all
three failing runs the dominant remove-safety deferral is:

| run | `replace_remove_safety_blocked` defers | `replace_source_removal` | leader-handoff completed |
|---|---|---|---|
| POST3 | 326 | 84 | 8 |
| PRE2 | 32 | 30 | 6 |
| PRE3 | 83 | 650 | 13 |

The surplus voter IS the source of a **live, non-terminal REPLACE** whose remove-leg
is re-driven but persistently **safety-blocked** — NOT orphaned. Leader handoff
COMPLETES, so the block is not handoff; it is the **CL-043 concurrent-partition-
operation serialization** (`remove-safety-evaluator.js:384-414`): the source
removal defers while ANY concurrent non-terminal op exists on the partition.

## Root of the deadlock (now fully mechanized)

Self-reinforcing loop on `replica_operations-p1`:
1. Surplus 4th voter (live-REPLACE source) → learner-promotion guard defers the
   paired learner (would exceed target) → 60s voter-ready timeout.
2. The timeout's retry churn keeps a concurrent op alive on the partition.
3. CL-043 sees that concurrent op → defers the REPLACE's source removal
   (`replace_remove_safety_blocked`).
4. Source stays → surplus persists → back to (1).

The quorum FLOOR (`projectQuorumAfterRemoval >= minReplicaCount`, :551-564) is
SATISFIED (4→3 with min=3) — so draining the surplus is safe; only the
serialization is holding it.

## Recommendation

**Pursue Alt-3a as Phase 2.** It is the only VIABLE path, it is where the industry
direction-check pointed (couple removal to the existing operation, app-tier), and
the disk-confirm proves its precondition holds live. Concretely:

**Fix = a narrowly-scoped relaxation of the CL-043 concurrent-op serialization in
`evaluateRemoveSafety` for the over-count surplus-drain case**: when the removing
op is a REPLACE source-removal AND the partition's authoritative raft-role voter
count > target AND the quorum floor still holds after removal, allow the source
removal to proceed despite a concurrent op — because draining the surplus is
exactly what unblocks the concurrent (deferred-promotion) op. This breaks the
deadlock without touching the interlock/runs-20/22 seam.

Risk: MEDIUM — it is a quorum-safety-path edit. It must (a) preserve the
independent floor checks (they remain the real quorum guard), and (b) carry a
run-20-style regression proof that completing the remove-leg alongside a concurrent
op does not amplify progress-write failures. Strictly safer and lower-blast than
Alt-1 (which modifies the interlock directly) and vastly cheaper than joint
consensus.

Proof plan: DT red-on-revert (stack a critical partition at 4 voters via a
leader-source REPLACE + a concurrent ledger op; assert the source removal completes
→ voters 3) + mandatory 2-pre/2-post live A/B (voter-ready-60s → 0, over-count
duration collapses, NO interlock/progress-write amplification).

Fallback: if a genuinely-orphaned surplus is ever observed (it was NOT in these 3
runs), add the narrow interlock owned-drain allowance (Alt-1) in isolation behind
a run-20 regression DT.
