# Static Metrics Tooling Expansion

## Why

The repository already enforces ESLint complexity, unused-code checks, and
dependency-cruiser rules, but it lacks first-class checks for:
1. cognitive complexity
2. circular dependencies
3. copy-paste duplication

Those gaps make it harder to spot maintainability regressions before they turn
into owner-path or decision-boundary cleanup work.

## Roadmap Basis

This package belongs to [roadmap.md](../../roadmap.md) Phase 0.1
`Internal Coherence`.

It extends the existing repo-owned static analysis lane in:
1. [package.json](../../package.json)
2. [scripts/check-complexity.js](../../scripts/check-complexity.js)

## Invariants

1. Reuse the existing `scripts/check-*.js` audit pattern.
2. Keep the initial rollout deterministic and repo-wide.
3. Prefer ratchets/baselines over introducing a guaranteed-red CI gate.
4. Avoid replacing existing checks; add complementary signals only.

## Implementation Tasks

- [x] Add npm tooling for cognitive complexity, circular dependencies, and
      duplication detection.
- [x] Add repo-owned wrapper scripts for each metric.
- [x] Calibrate the first baseline/threshold values from the current repo
      state.
- [x] Wire the new checks into package scripts.
- [x] Run the new commands and record the initial observed results.

## Done When

1. The repo has deterministic commands for the three new metric surfaces.
2. The commands run locally without ad hoc CLI arguments.
3. The initial thresholds or baselines match the current codebase state.
4. A follow-on cleanup batch can tighten the ratchets without redesigning the
   tooling.

## 2026-04-13 execution update

Implemented:
1. Added npm tooling:
   `eslint-plugin-sonarjs`, `madge`, `jscpd`
2. Added repo-owned wrappers:
   [check-cognitive-complexity.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/scripts/check-cognitive-complexity.js),
   [check-circular-dependencies.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/scripts/check-circular-dependencies.js),
   [check-duplication.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/scripts/check-duplication.js)
3. Added shared helper:
   [metric-check-helpers.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/scripts/metric-check-helpers.js)
4. Added npm entries:
   `test:complexity:cognitive`, `test:cycles`, `test:duplication`,
   `test:metrics`

Initial baselines:
1. Cognitive complexity:
   threshold `20`, baseline `150` violations across `src/` and `scripts/`
2. Circular dependencies:
   baseline `0` cycle groups across `src` and `scripts`
3. Duplication:
   baseline `21` clone groups and `648` duplicated lines across `src` and
   `scripts` with `jscpd` `minLines=20`, `minTokens=100`

Saved reports:
1. [cognitive-complexity-src-scripts.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/analysis/cognitive-complexity-src-scripts.json)
2. [madge-circular-src-scripts.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/analysis/madge-circular-src-scripts.json)
3. [jscpd-report.json](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test-output/analysis/jscpd-src-scripts/jscpd-report.json)

Observed hotspots:
1. Cognitive complexity top files:
   `src/admin/admin-control-snapshot.js` (`8`),
   `src/partition/partition-service.js` (`7`),
   `src/admin/admin-service-discovery.js` (`6`),
   `src/query/query-executor.js` (`6`)
2. Duplication top files:
   `scripts/check-guideline-literals.js` (`180` duplicated lines),
   `scripts/check-guideline-decision-boundaries.js` (`180`),
   `src/cache/system-table-cache.js` (`100`),
   `src/partition/partition-sql-parser.js` (`94`),
   `src/partition/partition-cdc-generator.js` (`94`)

Validation:
1. `npm run test:metrics`
2. `eslint` on the new wrapper files
