# Rolling Restart Publication ACK Snapshot Reachability Regression

Closed by migration on May 1, 2026.

## Closure Evidence

Implemented one publication owner snapshot across runtime canonical evidence,
active-gate projection, failure-bundle summaries, triage summaries, and
playback reconstruction:

1. explicit active-gate progress is preserved when canonical publication
   evidence rebuilds an observation from a base owner snapshot
2. current selected missing-published evidence clears stale top-level
   missing-published counts
3. explicit current pending ACK node ids clear stale count-only ACK debt
4. explicit required/acknowledged ACK lists still close stale pending counts
   when the owner proves no ACK debt remains

Representative migration proof:

1. `test-output/reports/rolling-restart-publication-ack-snapshot-reachability-ack-owner-20260501-codex.report.json`
2. result: failed, `0/1` passed after `253.3s`
3. publication epoch `5` is `PUBLISHED`
4. pending ACK count is `0`, pending ACK nodes are empty
5. missing published count is `0`, missing published nodes are empty
6. selected snapshot coverage is `5/5`
7. closure witness is `CL-003` /
   `publication_converged_priority_spread_pending`
8. the remaining owner is priority-spread recovery for
   `sql_write_operations-p1`, `eligible_but_no_operation_created`,
   `needs_operation`
9. handoff package:
   [Rolling Restart Operation Transition Pressure And Over-Target Trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)

## Why

The priority recovery actuation package moved the publication-closed
workflow-progress blocker into a canonical owner contract. The representative
`rolling-restart --fast-local` rerun then migrated back to an earlier startup
publication boundary, but with a sharper contradiction that needs one owner.

Reference report:

`test-output/reports/priority-recovery-actuation-contract-rolling-restart-20260430-codex.report.json`

Reference failure bundle:

`test-output/reports/.playback/priority-recovery-actuation-contract-rolling-restart-20260430-codex/rolling-restart/failure-bundle.json`

Reference triage:

`test-output/reports/.playback/priority-recovery-actuation-contract-rolling-restart-20260430-codex/rolling-restart/triage-summary.md`

Current terminal evidence:

1. result: failed, `0/1` passed after `133.8s`.
2. failure class: `publication_convergence_blocked`.
3. root cause class: `topology`.
4. dominant reason:
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`.
5. terminal publication epoch: `4`.
6. terminal publication status: `ACK_PENDING`.
7. pending ACK count: `1`.
8. pending ACK node:
   `11601fe0-72d6-5853-8590-ec2881853e72`.
9. failure-bundle missing published count: `2`.
10. failure-bundle missing published nodes:
    `11601fe0-72d6-5853-8590-ec2881853e72`,
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
11. active-gate terminal sample reports selected published active nodes `5/5`
    and selected missing published nodes empty.
12. selected snapshot coverage: `4/5`.
13. selected snapshot reachability error:
    `Control snapshot reachability probe timed out for 7493b0ab-a054-5fad-a91b-5e331db29304`.
14. priority recovery witnesses are still present but no longer dominate:
    `sql_transactions-p1` is `transition_deferred` at `workflow_timeout`;
    `sql_write_operations-p1` is `action_required` at
    `operation_scheduling`.

The next package must decide whether the terminal owner is publication ACK
accounting, missing published-active reconstruction, selected snapshot
reachability, or a stale merge between these diagnostics.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Priority Recovery Actuation Contract Under Load](./done-20260430-priority-recovery-actuation-contract-under-load.md)
2. [Rolling Restart Startup Publication Epoch Operation Creation And Snapshot Reachability](./done-20260430-rolling-restart-startup-publication-epoch-operation-creation-and-snapshot-reachability.md)
3. [Rolling Restart Active Publication Missing Node Convergence](./done-20260430-rolling-restart-active-publication-missing-node-convergence.md)

## In Scope

1. Reconcile failure-bundle `missingPublishedCount=2` with the active-gate
   terminal sample that reports selected missing published nodes empty.
2. Identify the owner of the remaining `ACK_PENDING` state and the concrete
   ACK target for epoch `4`.
3. Decide whether the selected snapshot reachability timeout is the terminal
   owner or supporting evidence around publication ACK convergence.
4. Preserve the priority recovery actuation witnesses as supporting evidence
   unless the publication and reachability gates close again.
5. Add focused regression coverage for the selected owner boundary.
6. Rerun `rolling-restart --fast-local` and record whether the blocker passes
   or migrates.

## Out Of Scope

1. Increasing startup, publication, active-gate, or snapshot timeouts.
2. Hiding ACK debt behind empty or conflicting node-id lists.
3. Reclassifying priority recovery as the terminal owner while publication is
   `ACK_PENDING`.
4. Broad matrix execution before the five-node representative path moves.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  publication ACK accounting, missing published-active membership, and selected
  control snapshot reachability.
- Canonical contract:
  one normalized terminal publication owner snapshot must name the current
  publication status, ACK debt, ACK target ids, missing-published evidence
  source, selected snapshot reachability state, and whether priority recovery
  is terminal or supporting evidence.
- Allowed consumers:
  active gate diagnostics, publication convergence summaries, failure bundles,
  triage summaries, and playback reconstruction.
- Prohibited reinterpretations:
  consumers must not merge stale top-level missing-published evidence over a
  cleaner active-gate selected snapshot without naming the owner/source.

## Detection / Analysis Tasks

- [x] Rebuild the terminal publication evidence from the report, failure
      bundle, active-gate progress, and playback samples.
- [x] Identify why `missingPublishedCount=2` survives in the failure bundle
      while active-gate selected missing published nodes are empty.
- [x] Identify the epoch `4` ACK owner and whether
      `11601fe0-72d6-5853-8590-ec2881853e72` is the canonical ACK target.
- [x] Determine whether selected snapshot reachability timeout should dominate
      over ACK/missing-published evidence.
- [x] Name the runtime or presentation source that merges these signals.

## Implementation Tasks

- [x] Add a focused fixture for the current report/failure-bundle
      contradiction.
- [x] Add or adjust the publication owner decision contract so ACK debt,
      missing published evidence, and selected snapshot reachability are one
      normalized snapshot.
- [x] Cut failure-bundle and triage presentation over to that owner snapshot.
- [x] Fence stale reconstruction paths that prefer older missing-published
      evidence over active-gate selected evidence without an owner reason.

## Validation Results

1. `node --test-name-pattern "lets current selected active-gate coverage clear stale missing publication nodes" test/distributed/harness/__tests__/failure-bundle.test.js`
   passed.
2. `node --test-name-pattern "lets current pending ACK ids clear stale active-gate count-only debt" test/distributed/harness/__tests__/failure-bundle.test.js`
   failed before the ACK owner fix and passed after it.
3. `node test/distributed/harness/__tests__/failure-bundle.test.js` passed:
   `60/60`.
4. `node test/control-plane/publication-recovery-evidence.test.js` passed:
   `75/75`.
5. `node test/control-plane/priority-recovery-snapshot.test.js` passed:
   `223/223`.
6. `node test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   passed.
7. `node test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
   passed.
8. Production static guardrails over touched runtime owner files passed with
   `0` literal, decision-boundary, and runtime-grammar findings:
   `src/control-plane/publication-recovery-evidence.js`,
   `src/control-plane/priority-recovery-observation-snapshot.js`,
   `src/control-plane/priority-recovery-snapshot.js`, and
   `src/control-plane/priority-recovery-diagnostics-constants.js`.
9. Touched harness scans still expose inherited backlog outside this package:
   `19` literal findings in `test/distributed/harness/failure-bundle-segment-4.js`
   and `test/distributed/harness/publication-evidence-contract.js`, plus one
   pre-existing decision-boundary finding in
   `resolveStructuredFinalConsistencyFailure`.
10. `npm run audit:runtime-grammar` passed.
11. `git diff --check` passed.
12. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/rolling-restart-publication-ack-snapshot-reachability-ack-owner-20260501-codex.report.json`
    failed after `253.3s`, but migrated to the active operation-transition
    package with publication ACK, missing-published, and snapshot coverage
    closed.

## Validation

1. Focused publication evidence / active-gate fixture test.
2. Focused failure-bundle regression for the current artifact.
3. File-scoped literal, decision-boundary, runtime-grammar guardrails for
   touched files.
4. `npm run audit:runtime-grammar`.
5. `git diff --check`.
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`.

## Done When

1. The current artifact replays into one publication/snapshot owner boundary.
2. ACK debt and missing-published evidence agree on source and node ids, or the
   disagreement is explicitly represented.
3. Selected snapshot reachability timeout is either the terminal owner or
   documented as supporting evidence.
4. The representative rerun passes or migrates to one new named owner package.
