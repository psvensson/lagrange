# Formation-schedule feasibility — abstract protocol ↔ runtime

Model: `FormationScheduleFeasibility.tla`.
Quest: `formation-priority-spread-without-exclusive-self-move-cost`
(parent `formation-ledger-self-move-blocks-cluster-ops`).

A FEASIBILITY model, not a protocol model: the scheduler is nondeterministic,
so TLC explores every admissible schedule of formation cure work against the
schema-admission gate. Checking `NeverAdmitted` as an invariant makes TLC the
oracle for the schedule-arithmetic question:

- invariant **holds** → no schedule satisfies the gate (profile infeasible,
  proven exhaustively);
- invariant **violated** → the counterexample trace is a concrete feasibility
  witness schedule.

One tick ≈ 10 seconds of the measured 2026-07-16T21:52 live run.

| Model | Runtime |
| --- | --- |
| `SelfMoves`, `MayStart` self-move branch (idle-only, blocks all starts) | the exclusive operation-ledger self-move interlock (`rebalance-coordinator-ledger-interlock-admission.js`): `DISRUPTIVE_LEDGER_SELF_MOVE` admits `IDLE_ONLY`, every `DEPENDENT` creation defers while a self-move is live (182 measured refusals) |
| `SpreadJobs` with `SpreadConcurrency` | the parallel priority-partition spread wave (five REPLACEs admitted together at 21:54:58) plus its tail |
| `PreGateHeadroomTicks` | ticks of cure work permitted before the schema-admission window opens (mechanism (b)) |
| `Admit` (`AllDone` + `quietTicks >= StableWindowTicks` + `GateClock <= BudgetTicks`) | the demo admission gate: 180000ms budget, 60000ms stable window with confirmations (`affinity-demo-preload-gate.js`), quiescence from `control-plane-quiescence-snapshot.js` |

## Checked configurations (2026-07-17)

| Config | Mechanism | SelfMoves × ticks | Headroom | Result |
| --- | --- | --- | --- | --- |
| `_current` | measured profile (durations rounded **down**, favourable) | 2 × 5 | 0 | `NeverAdmitted` HOLDS — **infeasible, exhaustive** (~12.5M distinct states) |
| `_join_time_spread` | (a) place priority replicas at join; no self-moves | 0 | 0 | witness found — feasible |
| `_single_self_move` | (c) halve the self-move count | 1 × 5 | 0 | witness found — feasible (tight) |
| `_pre_gate_headroom` | (b) ~40s of pre-gate cure headroom | 2 × 5 | 4 | witness found — feasible (boundary) |
| `_short_self_moves` | (c1+c2) terminalization + replacement-leader latency collapsed (~20s/move) | 2 × 2 | 0 | witness found — feasible |

This is deliberately narrow: durations are constants from one measured run; the
model represents only the schedule arithmetic the interlock and gate impose —
not raft, remove safety, or interlock correctness (those live in
`operation-ledger-terminal-hold`, `incremental-replace-spread`,
`exact-election-evidence-same-turn`, and `priority-spread-coverage`).
