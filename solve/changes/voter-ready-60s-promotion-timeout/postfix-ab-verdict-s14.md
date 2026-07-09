# Post-fix live A/B verdict — KEEP (progress-gated re-wait clears the [2/4] blocker)

Session s14. Live 2-post validation of the progress-gated provisioning re-wait
(commit `99ff7780`) against the established pre-baseline (all three s14
30s-budget runs aborted at [2/4] on `operation_ledger_quorum_concentrated`).

## Result

| | pre (3 runs) | post run 1 | post run 2 |
|---|---|---|---|
| [2/4] provisioning gate | aborted 3/3 | **cleared** | **cleared** |
| furthest stage | [2/4] | past [2/4] | **[4/4]** (furthest this session) |
| transient-hold re-wait | n/a | fired 1×, cleared | fired 0× (cleared in base window) |
| replica_operations-p1 spread | stuck 3-on-seed | maxVotersOnOneNode →1 (19), 2 (2) | →1 (27), 2 (1) |

## Verdict: KEEP

- **Target effect achieved live**: 2/2 post runs cleared the demo-binding [2/4]
  `provisionable=0 / operation_ledger_quorum_concentrated` abort that killed 0/3
  pre runs. Run 2 reached [4/4], the furthest any run got this session.
- **No masking**: the re-wait fired once (run 1) then not at all (run 2) — it
  never hung to the ceiling; concentration measurably spread to ≤1/node in both.
  The wedge → fail-fast path is intact (DT control + red-on-revert).
- **No churn/amplification regression** (the vet's load-amplification watch item):
  both runs progressed FURTHER than pre, not less; no thrash storm or new failure
  mode in these two runs.

## Necessary-not-sufficient (honest)

The demo is not fully green (both runs exited non-zero): reaching [4/4] without a
[2/4] abort exposes the known LAYERED next gate — `operation_ledger_self_move_in_flight`
at load / control-plane settle STALL at [3/4]. This fix does exactly what it was
scoped to (unblock the [2/4] quorum-concentration provisioning gate) and is the
necessary first layer; full demo-green requires the next-gate fix (separate
follow-on, same self-move / settle family).

Caveat: 2 post runs bound the load-amplification risk only weakly (the s9
`692c9dbb` regression needed careful A/B to surface). If the next-gate work
re-runs the demo repeatedly, watch re-wait fire-rate and per-partition churn for
the amplification shape.

Evidence: `postfix-ab-evidence-s14/`. Fix kept (committed `99ff7780`).
