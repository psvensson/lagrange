---
id: release-0-3-queryable-core
status: open
proof: certification
roadmapRow: null
doneWhen:
  probe: oracle
  args:
    file: solve/oracle/release-0-3-queryable-core.json
quests:
  - partition-key-ordering-owner-completion-v6
authorizes:
  - architecture
  - docs/development/agpl-feature-map.md
  - scripts/checks
  - scripts/quest-evidence
  - solve/epics/release-0-3-queryable-core.md
  - solve/oracle/release-0-3-queryable-core.json
  - solve/specs/release-0-3-queryable-core
  - src/bootstrap
  - src/index-management
  - src/live-query
  - src/partition
  - src/query
  - src/runtime
  - src/entrypoint-runtime-admin-composition.js
  - test/index-management
  - test/integration
  - test/live-query
  - test/partition
  - test/query
  - test/shards
---

# Release 0.3 — Queryable Core

## Intent

Turn Phase 0.3 from a roadmap list into one dependency-ordered, falsifiable
release program without disturbing the rs-raft closeout that is already on the
critical path.

0.3 means ordinary SQL can reach the right data efficiently without callers
knowing physical partitions. The release therefore owns the roadmap rows for
typed key ordering, declared/compound primary-key narrowing, distributed
locking reads, local ordered indexes, compound-index planner semantics and
non-unique global secondary indexes. Root `roadmap.md` also places the
generic push-backed live-query data plane in 0.3; the AGPL feature map does not
currently give that capability its own roadmap row. That discrepancy is an
authority gap to repair explicitly, not permission to invent a Quest link.

This epic is intentionally the **single new open 0.3 epic**. On 2026-10-02 the
repository already carries substantial open-epic pressure. The locking-read,
global-index and generic-live-query programs have coherent future epic
boundaries, but they remain staged sections/specifications here until opening
another epic is justified by predecessor evidence and current epic capacity.

## Verified starting point — 2026-10-02

Measured against shared main
`edf20e39b0014d5d2a63a2ecea990712f0349153`.

### Consensus integration fence

PR #73 (`finalize/zero-liferaft-2026-10-02`) is still draft. Its current
contract says active legacy-consensus references are zero, the Liferaft
dependency/provider selection is absent, and partitions/message-groups/WASM use
raft-rs semantic operation ports. It is still awaiting exact-SHA release proof
and five-node lab smoke.

0.3 work may be developed on isolated branches while that proof finishes, but
no source-changing 0.3 branch is merged to shared `main` ahead of the
`raft-rs-full-cutover` closeout. After the cutover lands, each in-flight 0.3
branch rebases once onto the exact new main and re-proves its own scope. This is
an integration fence, not a semantic dependency for the safe query-only work.

### The old access-path epic is provenance, not authority

`solve/epics/query-access-path-ladder.md` is `superseded` and `legacy:
true`. Its investigation remains useful evidence, but it is not reopened.

The old investigation also predates important current code:

- solved Quest `numeric-key-routing` already introduced
  `compareRoutingKeys` in `src/partition/split-key-comparator.js`;
- `KeyRange`, `PartitionResolver` and `QueryGroup` already delegate
  routing comparisons to that owner;
- numeric values versus text-encoded numeric partition boundaries are already
  compared numerically and unrelated mixed key spaces fail closed.

So 0.3 must not repeat that work.

### Current typed-ordering gaps

The remaining row `RM-0.3-qs-typed-key-ordering` is still real:

1. `compareRoutingKeys` uses JavaScript `localeCompare` for string keys,
   while split median selection is SQLite-ordered. Locale-sensitive ordering
   is not the same contract as SQLite's ordinary BINARY text ordering.
2. `PartitionSplitMergeManager.comparePartitionKeys` still uses raw
   JavaScript relational comparison when sorting merge-adjacency candidates,
   creating a second partition-key ordering owner.
3. The solved numeric-routing verifier recorded a separate durability exposure:
   numeric split boundaries pass through TEXT columns after a
   better-sqlite3 REAL binding, including a precision risk for large integers.
   That is **not** silently absorbed into the comparator Quest; it is the next
   boundary-representation Quest.
4. Runtime-value inspection is not yet a complete schema-declared tuple-order
   contract for persisted partition and future index tuples.

### Current PK narrowing gaps

`PartitionResolver.resolvePrimaryKeyColumns()` consumes explicit
`options.keyColumns`, then `tableInfo.primaryKey/primary_key`, then falls
back to `id`. The current `tables.partition_key` persisted owner is not
consumed there. Composite equality machinery exists, so the first task is to
make the resolver consume the declared metadata owner and then prove the
compound representation rather than building a second resolver.

### Current local-index and planner gaps

`src/index-management/IndexService` and `QueryOptimizer` exist. IndexService
already contains metadata, SQLite create/drop and new-partition CDC material,
but no production composition outside `src/index-management` currently
constructs it.

`QueryOptimizer.checkIndexMatch()` contains the exact heuristic Phase 0.3
must remove: after trying a prefix match it accepts an arbitrary matching
non-leading index column as usable. A compound-index contract cannot ship while
that fallback remains claimable.

### Generic live-query planning mismatch

`roadmap.md` makes generic push-backed live queries part of 0.3 and
`architecture/live-query-data-plane.md` defines the approved owner map.
`docs/development/agpl-feature-map.md` has no corresponding 0.3 roadmap row.
The historical `generic-live-query-data-plane` epic is superseded and its
six-rung task document is provenance. Before new live-query Quest authority is
created, roadmap ownership is reconciled through the roadmap-policy owner.

## Release axes

The epic oracle starts with eight outstanding axes. Zero is written only by an
exact-head certification Quest after each axis carries current evidence.

1. typed partition-key / indexed-tuple ordering;
2. declared and compound primary-key narrowing;
3. distributed PostgreSQL locking reads;
4. local ordered index DDL and lifecycle;
5. ordered/compound index planner semantics;
6. non-unique global secondary/compound indexes;
7. generic push-backed live-query data plane with an explicit roadmap owner;
8. exact-head 0.3 candidate/release exit under `RELEASE.md`.

The oracle is a progress authority only for this epic. It never substitutes for
a Quest's own sealed probe, and it is never decremented because code merely
looks complete.

## Integration rules

1. **Safe parallel work stays away from consensus ownership.** Before the
   rs-raft cutover closes, a 0.3 Quest may touch query/planner/index/range
   semantics but not Raft runtime, consensus transport, replica lifecycle,
   formation or membership.
2. **One ordering owner before more routing features.** PK narrowing, compound
   keys and ordered indexes consume the key/tuple order. They do not grow local
   comparison helpers.
3. **Persisted representation is a separate decision from comparison.** A1
   closes current comparison-owner divergence. A2 decides how type and exact
   boundary values survive persistence/upgrade. Do not hide a storage-format
   migration inside A1.
4. **Indexes are access paths in 0.3.** Rejecting or losing an index may make a
   query slower, never wrong. Global uniqueness remains outside 0.3.
5. **Locking reads use transaction owners.** PG wire cannot own locks; a parser
   accepting `FOR UPDATE` is not completion.
6. **Live queries reuse ordinary SQL and partition CDC.** No second planner,
   no cluster-wide user-table cache broadcast, and no polling for change.
7. **Versioning is last.** Do not bump to 0.3.0, create
   `release-publishability/0.3.0`, record a release proof, or tag while
   feature work is moving. `RELEASE.md` owns the immutable final sequence.
8. **Every source Quest is adversarially verified.** Red-on-revert or an
   equivalent controlled negative is required for each load-bearing semantic
   change. Existing green tests are regression protection, not proof of a new
   claim.

## Ordered work program

Executable detail is in
`solve/specs/release-0-3-queryable-core/tasks.md`.

The first source Quest was initially sealed as
`partition-key-ordering-owner-completion`; Copilot's pre-seal review found
that its doneWhen checker could admit incomplete UTF-8/BINARY semantics. That
sealed Quest is superseded rather than mutating its predicate in place.
A1-v2 was subsequently rejected by category-complete independent review:
its closure probe could be satisfied by unrelated owner tokens, unsupported
same-type values still reached String coercion, its behavioral mismatch witness
was too broad, and the comparator still resolved mutable intrinsics at call
time. Its adjacency controlled negative was repaired and preserved before the
Quest was superseded.

A1-v3 then closed those reviewed gaps and reached its sealed metric, focused
proofs and guardrails, but category-complete review found two remaining
adversarial holes outside its immutable predicate: unsupported identical values
could bypass validation through the early equality shortcut, and split-target
destructuring still consumed mutable Array iteration while its Array.isArray
witness was vacuous.

A1-v4 then consolidated the v3 review findings and reached a sealed 34 → 0
attempt with focused proofs and guardrails. Final category-complete Copilot
review on PR #86 still found two production gaps (raw numeric subtraction could
return noncanonical/non-finite comparator results for finite inputs, and falsey
non-string table IDs could be normalized to absence) plus two verification
gaps (no explicit enumerable prototype-pollution fixture and combined rather
than isolated Object intrinsic controls).

A1-v5 closed all four PR #86 findings and reached a sealed 18 → 0 candidate
with green focused tests and guardrails. Its newer category-complete PR #87
review found one remaining production hole outside the immutable predicate:
absent-bound ordering ran before validation of the non-absent peer, so invalid
or non-finite values paired with null/undefined could bypass typed refusal.

The active A1 Quest is now
`partition-key-ordering-owner-completion-v6`. It preserves the whole v5
candidate and closes only that invalid-versus-absent ordering gap.

After that, the safe-before-cutover access foundation proceeds through persisted
boundary representation, declared PK consumption, compound-PK narrowing, local
index DDL wiring and compound-index planner semantics.

Locking-read participant reservation, global replicated index datasets and
distributed live-query CDC/transport integration remain behind the consensus
integration fence even though their contracts/design probes may be prepared
earlier.

## Final release exit

The product epic does not invent a second release process. On the final
candidate:

- every 0.3 roadmap/architecture axis above has current terminal proof;
- current capability docs and examples claim no unsupported path;
- `[Unreleased]` is cut to a dated 0.3.0 section and all version literals are
  changed in one release commit;
- the exact candidate SHA passes the ordinary publish gate;
- `release-publishability/0.3.0` is green for that exact SHA;
- the durable `release-full-v1` authority proves that exact SHA;
- `npm run release:preflight` is green.

Tag creation/publication remains the release owner's outward action under
`RELEASE.md`; a Quest never treats an untagged or differently proven SHA as
equivalent.
