# Codebase Fallback Inventory And Owner-Path Unification

## Why

The codebase still contains a large number of explicit fallback paths,
fallback-related policy knobs, and caller-local fallback orchestration.

Some of those are real semantic boundaries, but many are likely artifacts of
incremental repair work that now duplicate owner policy, reconstruct truth
outside the canonical owner, or silently widen the number of ways a
correctness-critical action can proceed.

That is directly in tension with the doctrine that one concern should have one
semantic owner, one adjudicator, and one progression path.

## Scope Basis

Phase 0.1 roadmap scope: control-plane correctness, owner-path unification,
cache-observation boundary enforcement, and failure-simulation robustness.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

Related roadmap status already claims:

1. Owner-dependency fallback removal.
2. Optional fallback semantics removed on atomic cut points.
3. Workflow advance requires owner commit and acknowledgement, not cache
   timing.

This package exists to verify where the current code still diverges from that
intended end state, classify every remaining fallback precisely, and split the
real implementation work into disciplined follow-on packages.

## In Scope

1. Build a complete codebase inventory of fallback situations that matter to
   runtime behavior, correctness, or owner-path semantics.
2. Classify each fallback as one of:
   - irreducible semantic boundary
   - reducible duplicated caller policy
   - stale-read repair path
   - degrade-mode transport or discovery path
   - legacy compatibility bridge
   - non-architectural default/helper fallback
3. Identify which fallbacks violate current system guidelines versus which are
   legitimate boundary adapters.
4. Map each reducible fallback to its missing owner, snapshot, or explicit
   state model.
5. Produce a rollout sequence of follow-on packages ordered by correctness
   risk and expected simplification payoff.

## Out Of Scope

1. Removing every fallback in one batch.
2. Refactoring unrelated low-level default-value helpers that do not affect
   semantic behavior.
3. Conflating transport degrade behavior, compatibility bridges, and default
   parsing helpers into one generic “fallback” bucket.
4. Closing the package only when all implementation follow-ons are complete.

## Invariants

1. A correctness-critical question must not have several caller-local fallback
   policies.
2. If a fallback changes the semantic answer rather than only the data source,
   it requires an explicit owner and classification.
3. Sync/async dual-surface APIs are not automatically a design bug, but the
   ownership and degradation policy must still be single-sourced.
4. Default-value helpers and parsing fallbacks must be separated from
   correctness fallbacks in the inventory.
5. No fallback should survive classification as “necessary” without a clear
   statement of why one unified owner path is not currently possible.

## Initial Scan

The initial codebase scan already shows the work is broad enough to require a
dedicated package.

1. A coarse `rg` scan returned more than one thousand fallback-related
   matches across `src/` and `test/`.
2. Dense clusters already appear in:
   - `src/topology/cdc-group-propagation-service.js`
   - `src/rebalancer/replica-operation-repository.js`
   - `src/query/sql-query-engine.js`
   - `src/cdc/cdc-integration-service.js`
   - `src/bootstrap/bootstrap-api.js`
   - `src/rebalancer/rebalance-coordinator.js`
   - `src/rebalancer/operation-workflow-owner.js`
   - `src/control-plane/control-plane-system-table-gateway.js`
   - `src/transport/message-router.js`
3. Early inspection already shows at least three materially different classes:
   - real sync/async semantic boundaries
   - duplicated caller-level fallback orchestration
   - metadata/default helper fallbacks that should not drive architecture work

## Hotspots

1. `src/control-plane/`
2. `src/rebalancer/`
3. `src/bootstrap/`
4. `src/cdc/`
5. `src/query/`
6. `src/transport/`
7. `src/topology/`

## Required Artifacts

1. A codebase fallback inventory.
2. A fallback classification matrix.
3. A canonical-owner gap list.
4. A "cannot be one path" justification list.
5. A follow-on package sequence with one concern cluster per batch.

## Output Files

This package must produce and maintain the following files under
`work/fallback-inventory/`:

1. `README.md` - scope, categories, statuses, and artifact conventions.
2. `fallback-register.csv` - canonical ledger with one row per semantic
   fallback situation.
3. `violation-queue.md` - only fallback IDs currently judged to violate
   system guidelines.
4. `accepted-boundaries.md` - fallbacks retained for now with explicit
   justification.
5. `rollout-packages.md` - follow-on package split by concern cluster.
6. `cluster-notes/*.md` - short notes for dense subsystem clusters.
7. `file-coverage.csv` - file-level proof that every fallback-matching
   `src/` file was assessed and either mapped to register IDs or explicitly
   classified as helper/default-only, degradation-term-only, guard-only, or
   doc/comment-only.

## Detection / Analysis Tasks

- [x] Build the complete fallback inventory from `src/`, excluding tests except
      as evidence.
- [x] Produce file-level coverage for every `src/` file with fallback-related
      matches so the package can prove what was reviewed and how it was
      classified.
- [x] Normalize the inventory into one row per semantic fallback situation, not
      one row per string match.
- [x] Separate semantic/runtime fallbacks from value-default helpers and
      parsing conveniences.
- [x] Identify every correctness-critical fallback whose policy is duplicated
      across callers.
- [x] Identify every sync/async pair and determine whether it is a real
      boundary or accidental dual-path logic.
- [x] Identify every fallback that reconstructs owner truth from raw rows
      outside the canonical owner.
- [x] Identify every fallback that widens progression authority under load or
      partial failure.
- [x] Produce a “necessary for now” list with explicit justification for every
      retained fallback.

## Implementation Tasks

- [x] Create `work/fallback-inventory/README.md` with categories, statuses,
      field definitions, and fallback ID conventions.
- [x] Create and maintain `work/fallback-inventory/fallback-register.csv` as
      the canonical ledger with category, owner, consumers, and risk.
- [x] Create `work/fallback-inventory/violation-queue.md` from the register.
- [x] Create `work/fallback-inventory/accepted-boundaries.md` from the
      register.
- [x] Create `work/fallback-inventory/rollout-packages.md` with follow-on
      implementation packages and write scopes.
- [x] Create `work/fallback-inventory/file-coverage.csv` with one row per
      fallback-matching `src/` file and an explicit assessment result.
- [x] Seed `work/fallback-inventory/cluster-notes/` with the highest-signal
      subsystem findings first, starting from active control-plane/recovery
      work.
- [x] Tighten package/workstream references so future fallback work is driven
      by the produced register rather than ad hoc discovery.

## Validation

1. Every fallback cluster in the inventory is assigned one category.
2. Every reducible fallback has one proposed canonical owner path.
3. Every irreducible fallback has one explicit boundary justification.
4. Every active recovery/control-plane package can point to the inventory
   instead of restating local fallback analysis.
5. Follow-on packages exist for the top-priority reducible clusters.
6. The required files exist under `work/fallback-inventory/` and contain
   stable fallback IDs that future packages can reference directly.
7. The file-coverage artifact makes it possible to distinguish semantic
   fallback owners from files that only contain default helpers, degradation
   terminology, or guardrail comments.

## Done When

1. The codebase has one complete mapped inventory of fallback situations that
   matter architecturally.
2. Each fallback is classified as reducible, irreducible, compatibility-only,
   or non-architectural helper/default behavior.
3. The owner-path violations are visible and prioritized.
4. The remaining implementation work is split into explicit follow-on packages
   instead of implicit continuation inside unrelated active packages.
5. The package can show which `src/` files were reviewed and whether they
   contributed a semantic register row at all.
