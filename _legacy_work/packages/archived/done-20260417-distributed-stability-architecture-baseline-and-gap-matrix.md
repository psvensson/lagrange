# Distributed Stability Architecture Baseline And Gap Matrix

## Why

The repo now has enough evidence to stop treating the remaining instability as
"more recovery polish."

The latest seven-node failure is narrow and architectural:

1. a priority operation is created
2. it does not advance through explicit steps
3. routing and visibility disagree about whether the target path is usable
4. retries continue without one restart-safe owner model

Before implementation expands again, the repo needs one explicit gap matrix
that compares the current owner boundaries with the stable patterns already
used by systems like etcd, TiKV, CockroachDB, and FoundationDB.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
4. `Failover SLO definition` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `architecture/current-owner-maps.md`
2. `work/sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md`

## Sprint Umbrella

[Distributed Stability And Recovery Completion Sprint](../sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md)

## In Scope

1. Build one current-state inventory for the critical recovery lane from plan
   creation through restart resume.
2. Record where current owners already exist and where gaps still cross owner
   boundaries.
3. Compare those gaps against the stable patterns captured in the sprint
   reference set.
4. Define one target owner map, state vocabulary, and acceptance matrix for
   the remaining sprint packages.
5. Record the concrete affected subsystems and the required package sequence.

## Out Of Scope

1. Implementing the recovery changes themselves.
2. Broad user-data placement redesign outside the critical-partition lane.
3. Pro or Enterprise scope expansion.

## Invariants

1. The baseline must preserve the repo's single-writer contracts rather than
   reopening them.
2. Comparative analysis must adapt ideas to current repo owners instead of
   copying foreign architectures verbatim.
3. Every target state in the matrix must map to one concrete local owner or
   package owner.

## Hotspots

1. `architecture/current-owner-maps.md`
2. `src/rebalancer/rebalance-coordinator.js`
3. `src/control-plane/replica-dispatch-service.js`
4. `src/bootstrap/join-readiness-evaluator.js`
5. `src/query/canonical-leader-routing.js`
6. `src/control-plane/priority-recovery-completion.js`
7. `test/distributed/harness/failure-bundle.js`

## Detection / Analysis Tasks

- [x] Build the end-to-end critical recovery concern inventory.
- [x] Map the current owner boundaries from plan, dispatch, visibility,
      promotion, restart, and diagnostics.
- [x] Compare the current flow against learner-based reconfiguration,
      operator-controller, critical-range policy, and ratekeeping patterns.
- [x] Detect remaining cross-owner ambiguity, duplicated decisions, and
      timeout-only semantics.
- [x] Record one explicit gap matrix and target-state architecture note.

## Implementation Tasks

- [x] Add or update the architecture note that captures the gap matrix and
      target owner model.
- [x] Make the sprint exit bars and package interfaces consistent with that
      architecture note.
- [x] Add any missing diagnostics hooks needed by later packages to prove the
      owner boundaries.
- [x] Perform the required closure deep dive across all affected code and doc
      areas; fix spotted mistakes, irregularities, and doctrine violations or
      split follow-up packages before closure.

## Validation

1. Architecture note review against `architecture/current-owner-maps.md`.
2. Focused owner-path checks in touched unit suites.
3. Sprint/package cross-reference audit.
4. One artifact review against the latest seven-node failure bundle.

## Done When

1. One explicit current-state versus target-state gap matrix exists.
2. Every later sprint package has one concrete owner boundary and acceptance
   bar.
3. The target vocabulary avoids timeout-only and ambiguity-driven outcomes.
4. The required closure deep dive is complete and any discovered issues are
   fixed or split forward.
