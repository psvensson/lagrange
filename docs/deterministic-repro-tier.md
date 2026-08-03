---
audience: development
---

# Deterministic repro tier

Internal testing-process note: a distributed-defect fix must come with a
cheap, deterministic reproduction test, and this document names which existing
simulator to host that repro in. "CL-###" refers to closure-ledger records
(indexed by
`solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger.md`,
one record per file under its `closure-ledger/` directory);
the deterministic substrate itself (virtual clock, seeded RNG, PCT) is mapped
in
[deterministic-directed-testing-plan.md](deterministic-directed-testing-plan.md).

The docker rolling-restart stat-gate is an expensive, non-deterministic
integration verdict. It cannot prove that a changed branch engaged or that a
design-class defect is absent.

The **sub-second, deterministic tier** supplies that proof. The closure-grammar's
[reproduced-before-fix rung](../solve/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md)
already mandates a deterministic (or recurrence-measured) repro before a record
enters `fix_in_progress`. This document names the substrate so you author that
repro on existing machinery instead of building a third simulator.

## Do not build a new simulator - pick the right existing one

| Invariant shape | Use | Why |
| --- | --- | --- |
| Multi-node protocol / control-plane behavior (real raft election, leadership migration, publication fail-back, cross-node delivery races) | The DT6 stack: `test/distributed/harness/virtual-network.js` + `raft-network-host.js` (`connectRaftCluster`, `driveNetwork`/`driveNetworkFine`) + `pct-search.js` | Hosts REAL liferaft nodes and real control-plane subsystems on a virtual network - fixed-seed replay, PCT schedule search (`exploreWithPct`/`runPctSeed`), depth minimization (`minimizePctDepth`). Granularity matters: `driveNetworkFine` (one event + microtask flush) for mid-churn invariant sampling; coarse `driveNetwork` batches co-due events and is faithful only for converged-outcome assertions. |
| Callback-driven topology failure gates / trace-minimized closure repros (test-provided callbacks, no real state machines) | `test/distributed/harness/deterministic-simulator.js` | Fake-clock, `registerNode`/`partition`/`heal`, `send`/`deliver`, `runUntilIdle`, `replayDeterministicSimulation`, `minimizeDeterministicTrace` - all in one process, no docker. Still the live substrate for `topology-failure-gate-runner.js` (`npm run test:topology-failure-gates`); `minimizeDeterministicTrace` is its documented minimizer but has no live closure-repro consumer today (`scripts/run-closure-repro.js` routes CL ids to tap files). |
| Heartbeat / CDC / stale-read / readiness convergence over time | `test/convergence/deterministic-convergence-harness.js` | Fake-clock event scheduler with `registerInvariant`; attaches machine-readable convergence artifacts on failure. |
| A single service's local decision (a gate predicate, a row-seed, a safety check) | A service-level unit test against real prototype methods + a real `SystemTableCache` | The CL-035 / CL-038 pattern: deterministic, exercises real merge/UPSERT semantics, proves RED-ON-REVERT. |

The HLC monotonicity quest (`test/partition/partition-service-hlc-monotonicity.test.js`,
`test/hlc/hlc.test.js`) is a worked example: cross-leader and restart invariants
proven in-process with `:memory:` and durable-restart SQLite, zero docker.

## One discoverable repro per CL

- Land new repros under **`test/closure/`** using the
  `CL-###.repro.test.js` naming convention.
- Existing deterministic tests are referenced in place via
  **`test/closure/registry.json`** (no churn): e.g. CL-035 → its control-plane
  test, CL-038 → its rebalancer test.
- Record the satisfied branch in the record's `reproducedBy:` field (a test path
  for branch (a), or a measured recurrence rate for branch (b)).

## Run it

```sh
npm run repro -- CL-038     # resolve + run that record's repro via tap (sub-second)
npm run repro -- --list     # mapped repros
npm run repro -- --check    # warn-only: records that should have a repro but don't
```

`--check` is a coverage worklist, not a hard gate - most records predate the
convention. Author a repro when you next touch a record; a green repro that turns
RED on the fix's revert is the cheap proof the fix is load-bearing, captured
before the docker gate is ever paid for.
