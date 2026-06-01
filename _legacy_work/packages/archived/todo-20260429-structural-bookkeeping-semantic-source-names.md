# Structural Bookkeeping Semantic Source Names

## Why

Several source, test, and harness files are named after decomposition mechanics
instead of the domain responsibility they own. Names such as `segment-7`,
`class-4`, `class-part-2`, `test-part-5`, and `tail-more-test-cases` make the
codebase harder to navigate because readers must inspect imports or grep call
sites before they can infer ownership.

The April 29 inventory found `240` source/test/script files with structural
bookkeeping patterns under `src`, `test`, and `scripts`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Production guarantees`
3. `Failure simulations`

Related package:

1. [Test and harness file decomposition](./todo-20260419-test-and-harness-file-decomposition.md)

## In Scope

1. Build an inventory of structural bookkeeping filenames and import specifiers
   under `src`, `test`, and `scripts`.
2. Define a semantic target name for each file based on the owner boundary it
   implements, not on its historical split order.
3. Rename files in small module-owned batches and rewrite all imports, exports,
   test references, scripts, and package documentation links.
4. Preserve runtime behavior and test coverage while names change.
5. Remove temporary compatibility barrels or aliases before closing this
   package unless a documented public import path requires them.

## Out Of Scope

1. Changing runtime behavior while renaming files.
2. Re-splitting oversized files by line count. That remains owned by the test
   and harness decomposition package.
3. Reorganizing package directories beyond what is needed for semantic names.
4. Pro or Enterprise features.

## Priority Targets

1. Distributed harness shards:
   `test/distributed/harness/cluster-segment-*`,
   `test/distributed/harness/cluster-segment-7-class-*`,
   `test/distributed/harness/assertions-segment-*`, and
   `test/distributed/harness/failure-bundle-segment-*`.
2. Runtime owner shards:
   `src/control-plane/*-segment-*`, `src/rebalancer/*-segment-*`,
   `src/bootstrap/*-segment-*`, `src/partition/*-segment-*`,
   `src/query/*-segment-*`, and `src/transport/*-segment-*`.
3. Class-part files:
   `src/admin/admin-control-snapshot-class-part-*`,
   `src/message-group/message-group-service-class-part-*`,
   `src/node/replica-handler-class-part-*`, and
   similarly named owner files.
4. Test shards:
   `test/**/*test-part-*`, `test/**/*tail-test-cases*`,
   `test/**/*tail-more-test-cases*`, and
   `test/**/*tail-final-test-cases*`.
5. Scenario helper shards:
   `test/distributed/scenarios/*-segment-*` and related harness discovery
   test shards.

## Naming Contract

1. File names describe the semantic owner, such as active-wait diagnostics,
   control-snapshot coverage, publication-convergence evidence,
   post-rebalance closure, replica-dispatch ack retry, or SQL executor
   planning.
2. File names do not encode split order, class inheritance order, or tail
   placement.
3. Import specifiers use the semantic file name directly unless a stable public
   entrypoint already owns the export.
4. Package and sprint documents link to the semantic path after the rewrite.

## Residual Closure Inventory

- [ ] Inventory command output is captured in this package with counts by
      directory and pattern.
- [ ] Every structural filename has a proposed semantic replacement.
- [ ] Distributed harness structural shard names are rewritten or explicitly
      deferred with an owner reason.
- [ ] Runtime owner structural shard names are rewritten or explicitly deferred
      with an owner reason.
- [ ] Test structural shard names are rewritten or explicitly deferred with an
      owner reason.
- [ ] Import/export specifiers, scripts, test references, and work-package links
      no longer point at removed structural paths.
- [ ] No `src`, `test`, or `scripts` path still matches the structural
      bookkeeping patterns unless listed in a reviewed deferral table.

## Validation

1. `rg --files src test scripts | rg '(segment-[0-9]|class-part-[0-9]|test-part-[0-9]|tail-(more-)?test-cases|tail-final-test-cases|part-[0-9])'`
2. `rg "segment-[0-9]|class-part-[0-9]|test-part-[0-9]|tail-(more-)?test-cases|tail-final-test-cases|part-[0-9]" src test scripts work/packages work/sprints`
3. Module-specific focused tests for each renamed batch.
4. `npm run audit:guideline:literals`
5. `npm run audit:guideline:decision-boundaries`
6. `npm run audit:runtime-grammar`
7. `git diff --check`

## Done When

1. Structural bookkeeping names are removed from source-controlled paths and
   import specifiers, or each remaining instance has a package-local deferral
   with a semantic owner and reason.
2. The renamed batches pass focused tests and static guardrails.
3. The cleanup does not change runtime behavior.
