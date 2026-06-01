# Matrix Readiness Core Grammar Hardening Sprint (AGPL)

## Goal

Make the core runtime grammar and its matrix-facing evidence surfaces
trustworthy enough for a full harness matrix run.

The sprint target is:

1. make harness artifacts tell the truth after both failures and later passes
2. stop presentation consumers from inventing fresh priority-recovery meaning
3. move seed startup checkpoint progression onto one explicit checkpoint view
4. tighten the join-readiness boundary so snapshot, repair, and waiter roles
   are more explicit
5. reduce planner/coordinator seam ambiguity in the rebalancer before the
   matrix exercises it at breadth

## Why This Sprint Exists

The current runtime-grammar pilot is strong enough to pass the repaired
`node-join-under-load` scenario, but the code still has several high-value
matrix risks:

1. stale failure artifacts can survive a later passing rerun
2. presentation consumers still contain semantic fallback logic
3. seed startup checkpoint rerun decisions still rely partly on local object
   existence and post-phase side effects
4. join readiness still mixes snapshot assembly, repair, waiting, and timeout
   shaping in one boundary
5. the rebalancer still blends gating, admission, and planning/execution seam
   logic in ways that broaden matrix-only failure surfaces

The point of this sprint is not another strategy pass.
The point is to harden the heart of the system before the full matrix spends
hours discovering avoidable grammar and evidence drift.

## Relationship To Current Work

This sprint follows:

1. [System grammar whole and confirmation entry sprint](./done-2026-q2-system-grammar-whole-and-confirmation-entry.md)
2. [Runtime grammar hierarchy and actuation closure sprint](./done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)

This sprint executes before:

1. [Startup and rebalancer middle-layer closure sprint](./todo-2026-q2-startup-and-rebalancer-middle-layer-closure.md)

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Harness artifact truth and priority-recovery presentation hardening.
2. Seed startup checkpoint snapshot hardening.
3. Join-readiness boundary tightening on the snapshot/repair/wait seam.
4. Rebalancer blocker/admission seam hardening needed for matrix trust.
5. The focused proof ladder and representative harness scenarios needed to
   validate those changes.

## Out Of Scope

1. New product capability or scope expansion.
2. Full repo-wide runtime grammar rewriting outside the touched core seams.
3. Starting the full matrix before the sprint closes or splits its remaining
   blockers explicitly.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`
4. `seven-node-load-during-partitioning`
5. `seven-node-postgres-baseline-partition-split`

## Sprint Packages

1. [Harness artifact truth and priority-recovery presentation closure](../../packages/done-20260423-harness-artifact-truth-and-priority-recovery-presentation-closure.md)
2. [Seed checkpoint snapshot and join-readiness boundary closure](../../packages/done-20260423-seed-checkpoint-snapshot-and-join-readiness-boundary-closure.md)
3. [Rebalancer admission and planner-coordinator seam closure](../../packages/done-20260423-rebalancer-admission-and-planner-coordinator-seam-closure.md)

## Execution Outcome

This sprint completed the planned matrix-readiness hardening work:

1. harness failure artifacts now clear stale scenario/run bundles on later pass
2. priority-recovery observation/report readers now consume the explicit
   decision-layer semantic-state contract and only allow bounded legacy
   inference for pre-contract retained artifacts
3. seed rerun/finalization guards now read one explicit startup checkpoint
   snapshot
4. join-readiness waiting now flows through one grouped
   snapshot/evaluation/action attempt contract
5. the touched rebalancer seam now emits one explicit planning-gate decision
6. same-node dispatch trusts canonical local handler capability before a lagging
   `services` row reaches `ACTIVE`

## Proof Run

Focused proof completed:

1. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`
2. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
3. `npx tap test/bootstrap/bootstrap-sequence.test.js test/bootstrap/join-readiness-evaluator.test.js`
4. `npx tap test/control-plane/replica-dispatch-node-state-update.test-part-2.js test/control-plane/replica-dispatch-node-state-update.test-part-4.js test/rebalancer/unified-rebalancer.test.js`
5. `npm run test:metrics`

Representative harness confirmation started with:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

That rerun did not reproduce the grammar blockers this sprint targeted.
Instead it exposed a new blocker:

1. final scenario failure:
   `Leader identities disagree between 7493b0ab-a054-5fad-a91b-5e331db29304 and 11601fe0-72d6-5853-8590-ec2881853e72`
2. active gate remained on publication/member convergence with one missing
   published node and open publication status on some observers
3. the new blocker is split into
   [Publication-scoped consistency and node-join closure](../../packages/done-20260423-publication-scoped-consistency-and-node-join-closure.md)
   instead of being widened silently into this sprint

## Follow-On Split

The checkpoint subset stops here.
Per the blocker-migration rule, the remaining representative scenarios move
behind the new named blocker:

1. `rolling-restart`
2. `seed-restart-under-load`
3. `seven-node-load-during-partitioning`
4. `seven-node-postgres-baseline-partition-split`

## Entry Gate

This sprint stays active until all of the following are true:

1. harness/report artifacts no longer preserve stale failure meaning across a
   later pass
2. touched presentation consumers stop inventing fresh priority-recovery
   semantic meaning locally
3. seed startup checkpoint rerun decisions come from one explicit checkpoint
   snapshot instead of raw object-existence checks
4. join readiness uses a clearer snapshot/repair/wait split on the touched path
5. the rebalancer seam is narrow enough that the matrix is exercising runtime
   behavior rather than mixed gating grammar

## Simplification Rules

1. Fresh authoritative report output outranks retained failure-only playback
   summaries.
2. Presentation may summarize decision snapshots but may not invent new
   semantic state locally.
3. Startup checkpoint truth must be read from one snapshot instead of inferred
   from local object existence.
4. Join-readiness snapshot, repair, and waiter roles must move toward one
   explicit contract instead of one mixed boundary.
5. Planner logic stays in `UnifiedRebalancer`; admission/execution meaning
   stays with the coordinator path.

## Validation

1. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`
2. Focused control-plane, bootstrap, and rebalancer suites for touched paths
3. Representative harness scenarios from the target list above
4. `npm run test:metrics`

## Exit Check

1. The matrix-facing artifact surfaces now match current truth after both pass
   and fail outcomes on the touched writer paths.
2. The touched runtime boundaries each have one clearer owner path than they
   had at sprint entry.
3. The remaining matrix blocker is explicit and split into
   [Publication-scoped consistency and node-join closure](../../packages/done-20260423-publication-scoped-consistency-and-node-join-closure.md)
   rather than left as hidden drift.
