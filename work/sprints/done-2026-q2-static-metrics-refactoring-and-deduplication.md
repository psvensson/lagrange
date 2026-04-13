# Static Metrics Refactoring and Deduplication Sprint (AGPL)

## Goal

Reduce the repo-wide maintainability debt now surfaced by the static metrics
lane without turning the work into cosmetic lint churn.

This sprint is about structural simplification:

1. high cognitive-complexity hotspots become smaller explicit owner paths
2. duplicated runtime/script logic collapses to shared owners or helpers
3. the zero-cycle result remains preserved while refactors land
4. each baseline ratchet tightens as packages complete

## Why This Sprint Exists

The new static metrics tooling shows that the repository now has deterministic
maintainability signals beyond the existing complexity and dependency checks.

Current repo-owned metrics for `src/` and `scripts/`:

1. cognitive complexity threshold `20`: `147` violations
2. circular dependencies: `0` cycle groups
3. duplication: `15` clone groups and `417` duplicated lines

Top cognitive-complexity hotspots:

1. `src/admin/admin-control-snapshot.js` (`8`)
2. `src/partition/partition-service.js` (`7`)
3. `src/admin/admin-service-discovery.js` (`6`)
4. `src/query/query-executor.js` (`6`)
5. `src/control-plane/control-plane-readiness-service.js` (`5`)
6. `src/query/sql-query-engine.js` (`4`)
7. `src/transport/message-router.js` (`4`)

Top duplication hotspots:

1. `src/cache/system-table-cache.js` (`100` duplicated lines)
2. `src/partition/partition-sql-parser.js` (`94`)
3. `src/partition/partition-cdc-generator.js` (`94`)
4. `src/bootstrap/shared/node-storage-budget-setup.js` (`64`)
5. `src/service/adapters/partition-service-adapter.js` (`59`)

That is enough signal to drive a sprint. Another broad detection pass would
mostly restate the same hotspots.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Phase 0.1 — Internal Coherence`
2. `Operational Visibility`

This sprint is maintenance/refactoring work inside approved AGPL scope. It does
not add product surface.

## Relationship to Prior Work

Tooling and baseline setup came from:

1. [Static metrics tooling expansion](../packages/done-20260413-static-metrics-tooling-expansion.md)

This sprint consumes those reports and converts them into bounded refactor
packages.

Related active doctrine-cleanup work that these packages must respect:

1. [Runtime Contract Hardening and Explicit State Elimination Sprint](active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)
2. [Runtime Completion Contracts and Owner Simplification Sprint](active-2026-q2-runtime-completion-contracts-and-owner-simplification.md)

## Sprint Umbrella

1. [Admin discovery and preflight cognitive-complexity reduction](../packages/done-20260413-admin-discovery-and-preflight-cognitive-complexity-reduction.md)
2. [Guideline script deduplication and metrics-ratchet tightening](../packages/done-20260413-guideline-script-deduplication-and-metrics-ratchet-tightening.md)
3. [Node address resolution complexity reduction](../packages/done-20260413-node-address-resolution-complexity-reduction.md)

## Simplification Rules

1. Do not chase metric scores with helper sprawl. Complexity must drop by
   clarifying owner paths and state models.
2. When duplication exists because two modules answer the same semantic
   question, collapse to one owner rather than extracting a neutral utility.
3. Preserve the `0` circular-dependency result throughout the sprint.
4. Tighten baselines only after package validation passes.
5. Favor smaller packages around one hotspot family rather than one repo-wide
   mega-refactor.
6. New shared helpers are allowed only when ownership stays explicit.

## Completed-When Architecture

At sprint exit, the codebase should have:

1. materially fewer high-cognitive-complexity functions in the top runtime
   owners
2. shared duplicated logic collapsed in `scripts`, `cache`, `partition`, and
   adapter hotspots
3. unchanged `0` cycle groups
4. tightened cognitive-complexity and duplication baselines in the repo-owned
   metric scripts

## Result

This sprint achieved its exit criteria with bounded slices instead of a
repo-wide churn pass.

Delivered outcomes:

1. admin discovery and preflight hotspot reductions landed first
2. guideline script duplication collapsed into one shared checker runtime
3. `node-address-resolution` was simplified into explicit parse and selection
   stages
4. the repo ratchets tightened to validated counts: `147` cognitive-complexity
   violations and `15` clone groups / `417` duplicated lines
5. circular dependencies remained at `0`

## Follow-On

Remaining hotspot families were moved to the successor planning sprint:

1. [Static hotspot follow-on sprint](todo-2026-q2-static-hotspot-follow-on.md)

## Out-of-Scope for This Sprint

1. Pro or Enterprise work outside AGPL ownership
2. broad product feature work
3. test-only duplication cleanup not covered by the current `src/` and
   `scripts/` baselines
4. style-only rewrites that do not reduce structural complexity or duplication
5. full-repo mutation-testing expansion

## Rollout Order

1. Reduce the highest-count cognitive hotspots first.
2. Collapse the known duplication clusters in runtime/scripts.
3. Re-run `npm run test:metrics` after each package.
4. Tighten the baselines when a package actually reduces counts.

## Exit Check

1. The sprint packages land as bounded concern slices rather than one broad
   churn pass.
2. `npm run test:metrics` stays green across the sprint.
3. Cognitive-complexity baseline drops below `149`.
4. Duplication baseline drops below `20` clone groups and `622` duplicated
   lines.
5. Circular dependencies remain at `0`.
