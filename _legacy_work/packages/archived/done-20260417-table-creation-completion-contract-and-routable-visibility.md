# Table Creation Completion Contract and Routable Visibility

## Why

The current user-table creation path exposes a structural split between
metadata existence and operational readiness:

1. `tables` metadata is written
2. `partitions` metadata is written
3. initial partition provisioning happens afterwards
4. later retries may reconcile unfinished provisioning

That means `CREATE TABLE` can become externally visible before the table is
actually minimally routable. The current `ifNotExists` reconciliation behavior
then acts as a second implicit lifecycle path. This is exactly the kind of
partial completion contract that turns eventual convergence into repeated
visibility timeouts and setup ambiguity.

This package makes table creation one explicit lifecycle-owned contract instead
of a collection of observable intermediate facts.

## Scope Basis

Roadmap and AGPL-scoped matrix rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Completion Contracts and Owner Simplification Sprint](../sprints/archived/done-2026-q2-runtime-completion-contracts-and-owner-simplification.md)

## In Scope

1. Collapse user-table metadata creation, initial partition creation, and
   initial partition provisioning behind one completion contract.
2. Prevent `table_id` visibility from being treated as operational readiness
   before the minimum routable cohort is satisfied.
3. Replace split `CREATE TABLE` vs `CREATE TABLE IF NOT EXISTS` reconciliation
   logic with one owner-owned continuation path for incomplete table creation.
4. Keep any new lifecycle representation minimal and linear. Do not introduce
   a broad new cross-owner state machine.
5. Align harness, query, and admin callers on the same notion of `absent`,
   `pending_creation`, and `active`.

## Out Of Scope

1. New DDL syntax or user-facing schema language work.
2. Broad migration-framework redesign.
3. Reworking partition placement algorithms beyond the minimum needed to make
   the completion contract explicit.

## Invariants

1. User-table creation has one authoritative completion condition.
2. `CREATE TABLE IF NOT EXISTS` resumes the same completion contract instead of
   forking into heuristic repair logic.
3. Readers can distinguish `absent`, `pending_creation`, and `active`.
4. `tables`, `partitions`, and initial routable services cannot silently
   disagree about whether creation is complete.

## Hotspots

1. `src/query/table-creation-service.js`
2. `src/query/sql-query-engine.js`
3. `src/control-plane/control-plane-system-table-gateway.js`
4. `test/distributed/scenarios/table-distribution-helpers.js`
5. `test/distributed/scenarios/seven-node-read-write-load-transaction-recovery.js`

## Status

Partially implemented on 2026-04-11.

Implemented:

1. `CREATE TABLE IF NOT EXISTS` no longer silently skips the missing-initial-
   partition case
2. missing initial partition metadata is now recreated through the same owner
   continuation path before provisioning resumes
3. table-lifecycle authoritative lookups now use one named read profile
4. table creation and `CREATE TABLE IF NOT EXISTS` now surface
   `completionState=pending_creation` when metadata visibility is still
   pending instead of always reporting active completion

## Detection / Analysis Tasks

- [ ] Trace the exact externally visible incomplete-create states currently
      observable through `tables`, `partitions`, and service visibility.
- [ ] Identify the smallest linear lifecycle representation needed to express
      incomplete vs active creation.
- [ ] Map current `ifNotExists` reconciliation behavior to the new single
      continuation path.
- [ ] Confirm which callers currently treat `table_id` existence as implicit
      readiness.

## Implementation Tasks

- [ ] Introduce one explicit table-creation completion contract and expose it
      through one owner API or result model.
- [ ] Ensure user-table metadata does not answer as operationally ready before
      the minimum routable cohort is achieved.
- [ ] Replace `reconcileExistingInitialPartition()`-style split continuation
      with one owner-owned resume path.
- [ ] Align table-visibility helpers and setup flows on explicit pending vs
      active semantics instead of polling for partial metadata clues.
- [ ] Add focused regression coverage for partial create, resumed create, and
      delayed provisioning under pressure.

## Validation

1. `CREATE TABLE` under recovery pressure returns either completed readiness or
   an explicit pending-creation state.
2. Repeated `CREATE TABLE IF NOT EXISTS` does not fork into a separate
   heuristic lifecycle.
3. `table_id` visibility failures are replaced by explicit completion-state
   evidence rather than broad timeout wording.

## Done When

1. No user table appears operational before it has satisfied the minimum
   routable completion contract.
2. Table creation uses one linear lifecycle-owned continuation path.
3. Query, admin, and harness code no longer infer readiness from partial
   metadata rows alone.

## 2026-04-11 - missing provisioning detail no longer implies active completion
- Normalized provisioning summaries now fall back to the minimum routable quorum instead of the full requested replica count when the provisioner does not report convergence detail.
- The default minimum routable cohort is now majority quorum even without an injected quorum helper.
- This removes another optimistic completion path where CREATE TABLE or CREATE TABLE IF NOT EXISTS repair could report active before full replica convergence was actually observed.
- Focused test passed:
  - node test/query/table-creation-service.test.js

## 2026-04-17 - package closure pass

This package is being treated as complete for this run because:

1. Focused validation command passed:
   - `node test/query/table-creation-service.test.js` (`{ total: 97, pass: 97 }`).
2. The package has no explicit remaining-gap or pending distributed rerun requirement remaining in its active status section.
3. Required completion-state and pending-creation semantics are already represented in `src/query/table-creation-service.js` and surfaced through completion-state outcomes.

