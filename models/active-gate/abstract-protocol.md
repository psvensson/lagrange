# Active-Gate / Snapshot-Coverage Convergence — Abstract Protocol Model

This document is **Phase 0** of the formal-modeling effort: the single abstract
state machine that both checkers render.

- **Phase A** — `test/model/active-gate/` renders it as an executable
  [fast-check](https://github.com/dubzzz/fast-check) model-based test (empirical,
  runs in CI on every push, hunts metric-stall cycles).
- **Phase B** — `models/active-gate/ActiveGate.tla` renders it as a TLA+
  specification (exhaustive, design-time, proves liveness / refutes the stall).

The two renderings are kept in lockstep by the shared
[`action-manifest.json`](./action-manifest.json) and the **Phase D** drift lint
(`test/model/active-gate/manifest-drift.test.js`). A divergence between the
renderings is itself a bug signal.

The abstraction is *faithful to the real reducers*: the executable model asserts,
on every reachable state, that its convergence predicate equals the production
catch-up fence `buildPublicationActiveGateCatchupFence(...).promotionAllowed`
(`src/control-plane/publication-active-gate-handoff-contract-fence.js`). This is
the model↔code binding that keeps the abstraction honest.

## Why this protocol

It is the one that keeps **oscillating** in the theory loop: the active-gate
owner handoff / snapshot-coverage convergence on `startup_active_gate_owner /
snapshot_coverage` and `release_gate_owner / rolling_restart_fully_green_gate`.
R12–R14 can only *gate* the oscillation after the fact; a liveness proof shows,
before implementation, whether a chosen architecture route can actually reach the
green gate — or whether it will stall forever.

## State variables

For a fixed finite set of target nodes `Nodes` (the active-gate cohort):

| Variable    | Type            | Meaning                                                            |
| ----------- | --------------- | ----------------------------------------------------------------- |
| `pending`   | subset of Nodes | nodes whose owner handoff is **not yet reconciled**               |
| `covered`   | subset of Nodes | nodes with fresh **snapshot coverage**                            |
| `published` | subset of Nodes | nodes with **durable publication** (the active-gate prerequisite) |
| `fresh`     | boolean         | whether snapshot coverage is **fresh** (not stale)                |

`Quorum == (|Nodes| \div 2) + 1` — a strict majority, matching
`resolvePublicationActiveGateHandoffQuorumCount`.

### Initial state

```
pending   = Nodes      (every node starts awaiting owner reconcile)
covered   = {}
published = {}
fresh     = TRUE
```

## Convergence (the green gate)

```
Converged ==
  /\ |Nodes| > 0
  /\ published = Nodes
  /\ Cardinality(covered) >= Quorum
  /\ fresh
```

Because `published ⊆ covered` is an invariant (you cannot publish a node before
it is covered), `published = Nodes` forces `covered = Nodes ⊇ Quorum`. So the
green gate reduces to **all nodes published, snapshot fresh** — which is exactly
the condition under which the production catch-up fence returns
`promotionAllowed = true` (durable publication covers all targets, snapshot
coverage meets quorum and is fresh, target presence meets quorum).

## Actions

| Action                    | Class      | Guard → effect                                                                    |
| ------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `ReconcileOwner(n)`       | progress   | `n ∈ pending` → remove `n` from `pending`                                          |
| `AdvanceSnapshotCoverage(n)` | progress | `n ∉ pending ∧ n ∉ covered` → add `n` to `covered`                                 |
| `PublishNode(n)`          | progress   | `n ∉ pending ∧ n ∈ covered ∧ n ∉ published` → add `n` to `published`              |
| `RefreshSnapshot`         | progress   | `¬fresh` → `fresh := TRUE`                                                         |
| `DeferReentry(n)`         | regression | `n ∉ pending ∧ n ∉ published` → put `n` **back** into `pending` (the stall source) |
| `StaleEvent`              | regression | `fresh` → `fresh := FALSE`                                                         |

`DeferReentry` is the abstract shape of the real **deferred owner re-entry**: a
reconciled-but-not-yet-published node is bounced back to pending. Repeated
unboundedly, it is the *higher-level oscillation* R14 forbids empirically. The
TLA+ spec switches it (and `StaleEvent`) on/off via the constant
`AllowUnboundedReentry`:

- `AllowUnboundedReentry = TRUE` → the **current** protocol. Liveness is expected
  to **fail**; TLC returns a concrete cyclic counterexample — the oscillation.
- `AllowUnboundedReentry = FALSE` → the **architecture route** (bound the
  re-entry). Liveness is expected to **hold** under weak fairness of the progress
  actions.

## Safety invariants

- `PublishedSubsetCovered`: `published ⊆ covered` — never publish an uncovered node.
- `CoveredDisjointPending`: `covered ∩ pending = {}` — a covered node is reconciled.

## Liveness

```
EventuallyConverged == <>Converged
```

Holds in the route configuration (bounded re-entry + weak fairness of progress
actions); fails in the stall configuration. This is the formal statement of "the
gate eventually goes green", and the exact property the empirical stall detector
in Phase A approximates by execution.

## How to run

```sh
# Phase A — executable model + stall detector (no extra toolchain)
npm run model:active-gate

# Phase B — TLA+ model check (auto-fetches tools/tla2tools.jar on first run; needs Java 11+)
npm run model:tlc
```

Both write a `*.model.report.json` evidence artifact into `test-output/reports/`,
which the representative-evidence summarizer (Phase C) recognizes and folds into
the same residual/route pipeline the theory loop consumes.
