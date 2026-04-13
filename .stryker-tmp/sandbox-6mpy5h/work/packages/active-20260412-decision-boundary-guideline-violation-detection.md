# Decision-Boundary Guideline Violation Detection

## Why

The steering contract now explicitly forbids bags of independent `if`
statements for one semantic outcome, but that rule had no deterministic audit.

Without an audit, the doctrine stays aspirational and regressions keep being
introduced by both humans and LLMs.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Guideline Basis

From `.kiro/steering/system guidelines.md` §4.1.1:
1. semantic decision boundaries must not be implemented as bags of independent
   `if` statements
2. one snapshot, one explicit state model or decision table, one canonical outcome

## Invariants

1. Reuse the existing `scripts/` audit path.
2. Make the detector deterministic and repo-wide for JavaScript source/scripts.
3. Favor useful candidate hotspots over overfitted perfect detection.
4. Exclude test files by default, matching the other guideline audits.

## Implementation Tasks

- [x] Add a deterministic JavaScript detector for independent-if decision-boundary
      candidates.
- [x] Detect repeated semantic outcome assignments and repeated semantic outcome
      object returns inside one function.
- [x] Add focused detector tests.
- [x] Add an npm command.
- [x] Run the first repo-wide audit and save the report.

## Done When

1. The repo has a deterministic first-pass audit for branch-pile semantic
   decision boundaries.
2. The audit output identifies concrete hotspot files.
3. Future cleanup batches can use that report instead of anecdotal hunting.

## 2026-04-12 execution update

Implemented:
1. [check-guideline-decision-boundaries.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/scripts/check-guideline-decision-boundaries.js)
2. [check-guideline-decision-boundaries.test.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test/scripts/check-guideline-decision-boundaries.test.js)
3. npm entry:
   `npm run audit:guideline:decision-boundaries`

Detector scope:
1. JavaScript source/script files (`.js`, `.mjs`, `.cjs`)
2. default scan roots: `src` and `scripts`
3. test files excluded by default

Detector heuristics:
1. repeated semantic outcome assignments to the same target across multiple
   independent `if` statements
2. repeated semantic outcome object returns across multiple independent `if`
   statements
3. else-if chains deliberately ignored to reduce noise

Focused validation passed:
1. `node test/scripts/check-guideline-decision-boundaries.test.js`

Repo audit result:
1. command:
   `node scripts/check-guideline-decision-boundaries.js src scripts`
2. scanned files: `710`
3. total detected violations: `110`
4. saved report:
   [guideline-decision-boundaries-src-scripts.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/analysis/guideline-decision-boundaries-src-scripts.json)

Top file hotspots:
1. `src/control-plane/replica-dispatch-service.js`: `5`
2. `src/rebalancer/operation-workflow-owner.js`: `5`
3. `src/rebalancer/unified-rebalancer.js`: `5`
4. `src/bootstrap/shared/message-group-selection.js`: `4`
5. `src/control-plane/control-plane-system-table-gateway.js`: `4`
6. `src/message-group/message-group-forwarding-owner.js`: `4`
7. `src/transport/message-router.js`: `4`
8. `src/query/query-executor.js`: `3`
9. `src/runtime/oci-registry-policy.js`: `3`
10. `src/runtime/pgwire-runtime-module.js`: `3`

Interpretation:
1. the first-pass detector is finding real architectural hotspots rather than
   random local validation code
2. the top candidates overlap strongly with the runtime areas that have already
   produced structural bugs
