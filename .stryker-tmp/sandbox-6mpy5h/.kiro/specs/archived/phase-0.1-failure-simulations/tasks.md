# Implementation Plan: Phase 0.1 Failure Simulations

## Overview

Close remaining Phase 0.1 roadmap items:

1. Disk full simulation
2. Slow follower simulation
3. In-cluster chaos injection

Implementation proceeds from harness hardening to scenario delivery and closure
gate verification.

## Tasks

- [x] 1. Harden chaos primitives and playback typing
  - [x] 1.1 Add reversible network slowdown API in `ChaosPrimitives`
    - Implement `clearNetworkSlowdown(nodeId)` as idempotent qdisc cleanup.
  - [x] 1.2 Add disk-pressure apply/release primitives in `ChaosPrimitives`
    - Implement `fillDisk(nodeId, options)`.
    - Implement `releaseDiskPressure(nodeId, options)`.
  - [x] 1.3 Expose new primitives through `Cluster` wrappers
    - Add `clearNetworkSlowdown(nodeId)`.
    - Add `fillDisk(nodeId, options)`.
    - Add `releaseDiskPressure(nodeId, options)`.
  - [x] 1.4 Emit typed chaos fault playback events
    - Add `chaos.fault.injected`, `chaos.fault.recovered`,
      `chaos.fault.failed`.
    - Emit from `_runChaosAction(...)` based on action classification.
  - [x] 1.5 Add unit coverage for new primitive/wrapper behavior
    - Extend `chaos.test.js` and `cluster.test.js`.

- [x] 2. Implement disk full simulation scenario
  - [x] 2.1 Add `test/distributed/scenarios/disk-full-under-load.js`
  - [x] 2.2 Add scenario config resolver defaults in `scenario-config.js`
  - [x] 2.3 Add focused scenario unit tests under `harness/__tests__`
  - [x] 2.4 Verify convergence + consistency + success-rate thresholds

- [x] 3. Implement slow follower simulation scenario
  - [x] 3.1 Add `test/distributed/scenarios/slow-follower-under-load.js`
  - [x] 3.2 Add scenario config resolver defaults in `scenario-config.js`
  - [x] 3.3 Add focused scenario unit tests under `harness/__tests__`
  - [x] 3.4 Verify slowdown window behavior and post-heal catch-up

- [x] 4. Implement in-cluster chaos injection scenario
  - [x] 4.1 Add `test/distributed/scenarios/in-cluster-chaos-injection.js`
  - [x] 4.2 Add seeded deterministic action scheduling
  - [x] 4.3 Add explicit recovery windows and safety rails
  - [x] 4.4 Add focused scenario unit tests under `harness/__tests__`

- [x] 5. Closure gate and roadmap update
  - [x] 5.1 Run targeted harness suite for all three new scenarios
  - [x] 5.2 Confirm no invariant regressions in failure artifacts
  - [x] 5.3 Mark Phase 0.1 failure-simulation roadmap items as `✅`
    in `roadmap.md` and `product-roadmap.md`
