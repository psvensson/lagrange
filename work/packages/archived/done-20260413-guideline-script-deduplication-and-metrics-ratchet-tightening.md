# Guideline Script Deduplication and Metrics-Ratchet Tightening

## Why

The duplication report shows the two guideline-audit scripts as the single
largest duplication cluster, and the cognitive-complexity report shows the
guideline pack script as a major script hotspot.

This package cleans up the script/tooling side after the runtime hotspots so
the repo-owned metrics lane becomes easier to maintain and ratchet.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Duplicate logic across `scripts/check-guideline-literals.js` and
   `scripts/check-guideline-decision-boundaries.js`
2. Script-side complexity hotspots such as
   `scripts/check-guidelines-llm.js`
3. Tightening the relevant metric baselines after the cleanup lands

## Out Of Scope

1. New guideline-policy features
2. Runtime owner refactors outside direct script collaborators
3. Broad test-only duplication work

## Invariants

1. The guideline audits must remain deterministic and repo-owned.
2. Shared script helpers must not weaken detector behavior or report quality.
3. `npm run test:metrics` and focused script tests must pass.

## Hotspots

1. `scripts/check-guideline-literals.js`
2. `scripts/check-guideline-decision-boundaries.js`
3. `scripts/check-guidelines-llm.js`

## Detection / Analysis Tasks

- [x] Map the duplicated detector/reporting blocks into one shared helper plan.
- [x] Identify safe script-side cognitive-complexity reductions.
- [x] Record which baselines can tighten after the refactor.

## Implementation Tasks

- [x] Consolidate shared detector/reporting logic.
- [x] Reduce script cognitive complexity where the reports show clear hotspots.
- [x] Tighten baselines in the repo-owned metric scripts when counts drop.

## Validation

1. Focused script tests
2. `npm run test:metrics`

## Done When

1. The guideline scripts no longer dominate the duplication report.
2. Script-side complexity is reduced without weaker checks.
3. The affected metric baselines are tightened.

## Result

1. Collapsed the duplicated file-walk, AST parsing, reporting, and CLI plumbing
   from `scripts/check-guideline-literals.js` and
   `scripts/check-guideline-decision-boundaries.js` into
   `scripts/guideline-check-shared.js`.
2. Preserved detector-specific logic in the individual scripts and validated it
   with the focused script suites.
3. Removed the guideline scripts from the top duplication cluster and helped
   lower the repo metrics to `147` cognitive-complexity violations and `15`
   clone groups / `417` duplicated lines.
4. Tightened the ratchets to those validated counts.
5. Left the remaining `scripts/check-guidelines-llm.js` hotspot as follow-on
   work in `active-20260413-guideline-llm-cognitive-complexity-follow-on.md`.
