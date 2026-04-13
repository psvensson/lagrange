# Constants-Owner and Magic-Literal Guideline Violation Detection

## Why

The system guidelines explicitly forbid free-floating string and number
literals, with limited exceptions for:
1. canonical constants-owner modules
2. private file-local named constants
3. suite-local test constants

That rule currently has no deterministic repo-wide audit. The result is that
violations accumulate silently and only show up opportunistically during other
refactors.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Guideline Basis

From `.kiro/steering/system guidelines.md` §4.1:
1. never use string or number literals directly in code
2. shared scalars belong in constants-owner modules
3. file-local private constants are allowed
4. test suites have scoped exceptions

## Invariants

1. Detection must reuse existing script/tooling paths instead of inventing a
   second guideline framework.
2. The audit must respect documented exceptions, not just grep for literals.
3. The report must make hotspot prioritization obvious.

## Implementation Tasks

- [x] Reuse existing `scripts/` guideline tooling path for a deterministic
      JavaScript literal audit.
- [x] Honor constants-owner modules and private file-local constants as
      allowed states.
- [x] Skip test files by default because the guideline defines separate
      suite-local exceptions.
- [x] Add focused unit coverage for the detector.
- [x] Run the audit and save the first report artifact.

## Done When

1. The repo has a deterministic audit command for raw string/number literals.
2. The first repo-wide report exists with hotspot counts.
3. The active sprint can use that report to drive follow-on cleanup packages.

## 2026-04-12 execution update

Implemented:
1. Added [scripts/check-guideline-literals.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/scripts/check-guideline-literals.js)
2. Added npm entry:
   `npm run audit:guideline:literals`
3. Added focused detector tests:
   [check-guideline-literals.test.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test/scripts/check-guideline-literals.test.js)

Detector scope:
1. JavaScript source/script files (`.js`, `.mjs`, `.cjs`)
2. default scan roots: `src` and `scripts`
3. test files excluded by default because the guideline has explicit test-owner
   exceptions

Detector exceptions honored:
1. canonical constants-owner modules
2. private file-local named `const` initializers
3. import/export module specifiers
4. object property keys
5. `parseInt` radix arguments

Focused validation passed:
1. `node test/scripts/check-guideline-literals.test.js`

Repo audit result:
1. command:
   `node scripts/check-guideline-literals.js src scripts`
2. scanned files: `709`
3. total detected violations: `8321`
4. saved report:
   [guideline-literals-src-scripts.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/analysis/guideline-literals-src-scripts.json)

Top file hotspots:
1. `scripts/check-guidelines-llm.js`: `525`
2. `src/cli/index.js`: `375`
3. `src/query/sql-query-engine.js`: `345`
4. `src/query/query-executor.js`: `196`
5. `src/cli/core/help-overlay.js`: `147`
6. `src/cli/core/dev-tools.js`: `140`
7. `src/cli/core/visual-indicators.js`: `131`
8. `src/cli/views/services-view.js`: `131`
9. `src/cli/core/keyboard-handler.js`: `130`
10. `src/rebalancer/operation-workflow-owner.js`: `124`

Top area buckets:
1. `src/other`: `2766`
2. `src/cli`: `2502`
3. `scripts`: `1092`
4. `src/query`: `913`
5. `src/control-plane`: `543`
6. `src/rebalancer`: `505`

Current limit:
1. this is a deterministic first pass, not the final truth for every language
   in the repository
2. shell scripts and test-suite exception handling still need separate follow-on
   audit logic if you want full repository coverage under the same doctrine
3. the audit is now driving concrete cleanup batches, starting with
   [Query magic-literal cleanup batch 1](../packages/active-20260412-query-magic-literal-cleanup-batch-1.md)
