# Deterministic repro tier

The docker rolling-restart stat-gate is the expensive, last-resort verdict: N≥8
runs × ~400s ≈ 50 minutes, non-deterministic, and convergence fixes have
repeatedly landed **correct but inert** (the precondition did not recur, costing
hours of gate wall to discover the fix never engaged — CL-001 variant A).

Below it sits a **sub-second, deterministic tier**. The closure-grammar's
[reproduced-before-fix rung](../.kiro/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md)
already mandates a deterministic (or recurrence-measured) repro before a record
enters `fix_in_progress`. This document names the substrate so you author that
repro on existing machinery instead of building a third simulator.

## Do not build a new simulator — pick the right existing one

| Invariant shape | Use | Why |
| --- | --- | --- |
| Topology / messaging / partition / leadership (multi-node, message ordering, link partition, replay, trace-minimization) | `test/distributed/harness/deterministic-simulator.js` | Fake-clock, `registerNode`/`partition`/`heal`, `send`/`deliver`, `runUntilIdle`, `replayDeterministicSimulation`, `minimizeDeterministicTrace` — all in one process, no docker. |
| Heartbeat / CDC / stale-read / readiness convergence over time | `test/convergence/deterministic-convergence-harness.js` | Fake-clock event scheduler with `registerInvariant`; attaches machine-readable convergence artifacts on failure. |
| A single service's local decision (a gate predicate, a row-seed, a safety check) | A service-level unit test against real prototype methods + a real `SystemTableCache` | The CL-035 / CL-038 pattern: deterministic, exercises real merge/UPSERT semantics, proves RED-ON-REVERT. |

The HLC monotonicity quest (`test/partition/partition-service-hlc-monotonicity.test.js`,
`test/hlc/hlc.test.js`) is a worked example: cross-leader and restart invariants
proven in-process with `:memory:` and durable-restart SQLite, zero docker.

## One discoverable repro per CL

- Land new repros at the convention path **`test/closure/CL-###.repro.test.js`**.
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

`--check` is a coverage worklist, not a hard gate — most records predate the
convention. Author a repro when you next touch a record; a green repro that turns
RED on the fix's revert is the cheap proof the fix is load-bearing, captured
before the docker gate is ever paid for.
