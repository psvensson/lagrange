---
audience: development
---

# Deterministic and Directed Testing Substrate

This document maps the deterministic testing machinery that exists in the
repository and states the boundary of the evidence it produces. Use it to pick
the smallest real substrate that can falsify a distributed-system claim.

The deterministic tier exists to make message-ordering, timer-ordering, and
interleaving defects reproducible and minimizable. It does not reproduce the
pass rate of a Docker scenario whose variable is CPU contention or real
transport latency. Those claims remain statistical integration claims governed
by [the convergence done-when metric](convergence-donewhen-metric.md).

## Core Determinism Seams

| Concern | Current owner | Contract |
| --- | --- | --- |
| Clock and timers | [`src/time/time-source.js`](../src/time/time-source.js) | `RealTimeSource` preserves platform behavior; `VirtualTimeSource` advances explicitly and orders equal-time work deterministically. |
| Randomness | [`src/random/random-source.js`](../src/random/random-source.js) | `RealRandomSource` preserves `Math.random`; `SeededRandomSource` provides reproducible streams. |
| Schedule exploration | [`src/time/pct-scheduler.js`](../src/time/pct-scheduler.js) | `PctScheduler` reorders only work due at the same logical instant and exposes depth-bounded witnesses. |
| Multi-node event transport | [`test/distributed/harness/virtual-network.js`](../test/distributed/harness/virtual-network.js) | One virtual timeline hosts per-node timers and cross-node messages with partition, heal, stop, and start controls. |
| Real Raft on the virtual network | [`test/distributed/harness/raft-network-host.js`](../test/distributed/harness/raft-network-host.js) | Real liferaft vote, append, leadership migration, and quorum behavior use the deterministic transport. |

The seams are opt-in. Production code uses real time and randomness unless a
test injects the deterministic implementations. Any subsystem exercised under
virtual time must thread the time source across the whole tested path; an
unseamed wall-clock read weakens the verdict.

## Available Harnesses

Choose by invariant shape:

| Invariant shape | Use |
| --- | --- |
| Real multi-node Raft or control-plane ordering | `virtual-network.js`, `raft-network-host.js`, and `test/distributed/harness/pct-search.js` |
| Callback-driven topology gates and trace replay | [`test/distributed/harness/deterministic-simulator.js`](../test/distributed/harness/deterministic-simulator.js) |
| Heartbeat, CDC, stale-read, or readiness convergence over time | [`test/convergence/deterministic-convergence-harness.js`](../test/convergence/deterministic-convergence-harness.js) |
| A local decision kernel | A unit or property test against the real owner method and real state representation |
| A state-triggered live fault | [`test/distributed/harness/wait-for-state.js`](../test/distributed/harness/wait-for-state.js) plus the existing live chaos surface |
| In-run invariant sampling | [`test/distributed/harness/in-run-invariant-monitor.js`](../test/distributed/harness/in-run-invariant-monitor.js) |

The topology failure gate uses
[`topology-failure-gate-runner.js`](../test/distributed/harness/topology-failure-gate-runner.js)
on the deterministic simulator. Operation lifecycle interleavings use
[`operation-lifecycle-fold.property.test.js`](../test/rebalancer/operation-lifecycle-fold.property.test.js).
The leadership fail-back design class also has a TLA+ model at
[`models/leadership-failback/LeadershipFailback.tla`](../models/leadership-failback/LeadershipFailback.tla).

## Driving and Observing the Virtual Network

Use the coarse network driver for converged-outcome assertions. It drains
co-due work before flushing microtasks. Use the fine driver when an invariant
must be observed during churn; it delivers one event and flushes to quiescence
before observation. The two drivers explore different observable schedules and
must not be treated as interchangeable.

PCT results are bounded evidence. A failure supplies a reproducible seed,
depth, and ordering witness. A non-finding means only that the configured seed,
depth, and driver bounds did not expose a failure. It is not proof of
impossibility. Increase the bound or supply a structural argument when the
negative claim matters.

## Fidelity Boundary

The deterministic substrate currently proves only behavior represented by its
hosted machines and seams:

- It determinizes logical timers and message delivery, not CPU-contention or
  latency-tail behavior.
- It does not model TCP resets, dead-address dial behavior, Docker pause
  semantics, or other real-container effects.
- A virtual network run covers only the real subsystems explicitly hosted on
  that network.
- Persistence behavior is real only when the selected test uses a durable
  adapter; an in-memory adapter cannot establish crash-durability.
- A virtual-time verdict is valid only across source paths that use the
  injected time source.

Use targeted transport tests or the Docker harness for claims beyond this
boundary. Use the statistical gate only after deterministic falsifiers and
owner-level tests pass.

## Reproduction Contract

Every distributed-defect fix should have the cheapest deterministic
reproduction that reaches the defect mechanism:

1. Reproduce the failure or violated invariant on a fixed seed or fixture.
2. Show that the fix makes the same witness pass.
3. Confirm red-on-revert when practical.
4. Retain the seed, minimized depth or trace, and invariant in the test.
5. Use a live or statistical gate only for integration properties the
   deterministic substrate cannot represent.

Closure-ledger repros are registered in
[`test/closure/registry.json`](../test/closure/registry.json) and run through
[`scripts/run-closure-repro.js`](../scripts/run-closure-repro.js). The operator
commands and placement conventions are in
[`deterministic-repro-tier.md`](deterministic-repro-tier.md).

## Verification Entry Points

```sh
npm run repro -- --list
npm run repro -- --check
npm run test:topology-failure-gates
npm run model:check
```

Run the focused unit tests for the selected substrate before a scenario. For
distributed convergence work, follow
[`operational-ground-truth.md`](../test/distributed/operational-ground-truth.md): analyze
existing artifacts first, prove one invariant at a time, and reserve expensive
gates for claims their environment can actually establish.
