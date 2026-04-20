# Boundary Scenario Matrix And Seven-Node Acceptance

## Why

The repo already has strong distributed coverage, but the current verification
loop is still too expensive for this stability class:

1. unit tests are too small to reproduce the owner-boundary failure
2. seven-node reruns are expensive enough to slow diagnosis
3. the real bug family lives in the missing middle

FoundationDB's simulation posture and the repo's own boundary-transition work
point in the same direction: the critical recovery lane needs a first-class
deterministic scenario matrix before full checkpoint reruns.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`
2. `test/distributed/README.local.md`
3. `work/sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md`

## Sprint Umbrella

[Distributed Stability And Recovery Completion Sprint](../sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md)

## In Scope

1. Expand the boundary scenario layer around critical partition recovery under
   load, join, rolling restart, and seed restart pressure.
2. Make each package in this sprint prove itself first in targeted boundary
   scenarios before full seven-node reruns.
3. Define one final seven-node acceptance set for the stability workstream.
4. Keep artifact-first triage as the default debugging path.

## Out Of Scope

1. A new generic chaos framework.
2. Replacing the existing seven-node harness with simulation-only testing.
3. Non-stability scenario expansion unrelated to this sprint.

## Invariants

1. The smallest scenario that reproduces a failure family should become the
   default regression owner.
2. Seven-node reruns are checkpoint truth, not the normal debugging loop.
3. Package closure must include the affected-area deep dive after the required
   scenario bars are met.

## Hotspots

1. `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`
2. `test/distributed/harness/failure-bundle.js`
3. `test/distributed/harness/report-writer.js`
4. `test/distributed/scenarios/node-join-under-load.js`
5. `test/distributed/scenarios/seed-restart-under-load.js`
6. `test/distributed/scenarios/rolling-restart.js`
7. `test/distributed/README.local.md`

## Detection / Analysis Tasks

- [x] Inventory the critical recovery transitions not yet covered by the
      boundary layer.
- [x] Detect which current seven-node failures can be reproduced in smaller
      deterministic scenarios.
- [x] Define the acceptance ladder from unit to boundary to seven-node.
- [x] Detect missing artifacts or summaries needed for fast triage.
- [x] Map each sprint package to at least one owned boundary scenario.

## Implementation Tasks

- [x] Add the missing boundary scenarios for critical recovery, restart, and
      load interactions.
- [x] Record the acceptance ladder and final seven-node checkpoint set in the
      local harness docs.
- [x] Add regression coverage ensuring packages cannot close without their
      owned scenario bars.
- [x] Keep artifact-first triage summaries aligned with the new matrix.
- [x] Perform the required closure deep dive across all affected code and doc
      areas; fix spotted mistakes, irregularities, and doctrine violations or
      split follow-up packages before closure.

## Validation

1. New or expanded boundary-transition scenario tests.
2. Scenario-to-package ownership audit.
3. Local README and report validation.
4. Final seven-node acceptance reruns for the sprint exit set.

## Done When

1. Every package in this sprint maps to deterministic boundary coverage.
2. The verification ladder is explicit: targeted owner tests, boundary
   scenarios, then seven-node acceptance.
3. The final seven-node acceptance set is defined and used as the sprint exit
   gate.
4. The required closure deep dive is complete and any discovered issues are
   fixed or split forward.
