# Ledger self-move re-mint — abstract protocol ↔ real system

Model: `LedgerSelfMoveRemint.tla` (property `EventuallySettled`).
Quest: `formation-ledger-self-move-blocks-cluster-ops`.
Live evidence: `solve/changes/formation-ledger-self-move-blocks-cluster-ops/diagnose-run6-demo-stall.md`.

## Why a model (DT7)
This is a design-class LIVENESS bug: the docker/local demo can only *fail to
disprove* it (it stalls), never prove it fixed. TLC exhaustively exhibits the
livelock as a counterexample (bug cfg) and proves the fix removes it (fixed cfg).
It was authored AFTER a DT-proven-but-wrong-leg patch (E-cheap, reverted
`96a0917f`) failed the live demo — per `operational-ground-truth.md`'s
coupled-invariant guidance: model the seam before the next patch.

## Abstraction ↔ real system

| Model | Real system |
| --- | --- |
| `progress \in 0..MaxSteps` | the in-flight spread REPLACE self-move's workflow progress (SENDING → CATCHUP → … → REMOVED) on `replica_operations-p1` |
| `selfMove = "terminal"` | the self-move reached a terminal step → ledger de-concentrates → interlock (`self_move_in_flight` / `waiting_for_idle_ledger`) releases |
| `phase = "settled"` | control plane settles → siblings admit → demo passes [2/4] |
| `Advance` (SF) | the workflow owner's per-tick reconcile advancing the operation |
| `Flap` (NO fairness) | a durability-fitness demotion / raft re-election (run-6: term 2→22, ~21 elections) |
| `Flap` resets `progress` to 0 (fix off) | a fresh leader RE-PLANS and RE-MINTS the self-move, abandoning the in-flight op (run-6: same replica REPLACE'd to the same target 6×/11×, never terminal) |
| `IdempotentReplan` (fix) | the fresh leader RECOGNISES the in-flight self-move authoritatively and carries it over instead of minting a duplicate |

## What the model proves
- **Bug (`IdempotentReplan = FALSE`)**: `EventuallySettled` FAILS. Counterexample
  lasso: `Advance` (progress 0→1), `Flap` (re-mint, 1→0), repeat — `Advance` fires
  infinitely often (strong fairness satisfied) yet `progress` never reaches
  `MaxSteps`, so `Terminalize` is never enabled and the cluster never settles.
  This IS the run-6 count-neutral REPLACE self-move re-mint limit cycle.
- **Fix (`IdempotentReplan = TRUE`)**: `EventuallySettled` HOLDS. Progress survives
  the flap, reaches `MaxSteps` under strong fairness on `Advance`, terminalizes,
  and the cluster settles — regardless of how often the flap fires.

## The lever this points to (NOT yet implemented)
Make a fresh leader's re-plan **idempotent w.r.t. an in-flight self-move**: on
leadership change, recognise a genuinely in-flight ledger self-move
(authoritatively — the interlock's owner-RPC re-verify, `c7a3bf19`) and do NOT
admit/mint a duplicate; let the existing operation terminalize. This extends the
existing self-move serialization/interlock to the RE-MINT-across-flap path rather
than adding a new read path.

## Faithfulness caveats (what the model deliberately abstracts)
- The model assumes progress CAN be made between flaps (SF on `Advance`); it models
  "flap resets progress", matching the diagnosis (the self-move advanced, then was
  re-minted), NOT "flaps so frequent no progress is ever made". If implementation
  evidence shows the flap frequency itself starves `Advance`, a second cut —
  bounding the flap (leadership stability) — would need its own config; the
  durability-fitness demotion is a shipped safety mechanism (`9234e904`), so
  bounding it is higher-risk and is deliberately NOT the modelled lever here.
- `MaxSteps = 2` is the minimal bound that exhibits both the reset lasso and the
  fixed convergence; the result is insensitive to larger bounds.

## Next step (do NOT skip live validation this time)
Implement the idempotent-replan lever DT-first AND validate on the live demo
BEFORE committing — the E-cheap revert is the standing lesson that a green DT on an
injected-fresh mock is not proof the lever moves the binding observable.
