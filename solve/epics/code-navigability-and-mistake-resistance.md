---
id: code-navigability-and-mistake-resistance
status: open
proof: deterministic
roadmapRow: null
graduatesTo: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/code-navigability-budget.js --metric
quests:
  - code-navigability-budget-check
  - navigability-guideline-audit
  - state-read-named-defaults
  - always-promise-port-answers
  - readiness-service-constructor-injection
  - partition-service-constructor-injection
  - system-table-row-decoders
  - system-table-decoded-reads-rebalancer
  - system-table-decoded-reads-control-plane
  - system-table-decoded-reads-node
  - system-table-decoded-reads-admin
  - system-table-decoded-reads-query
  - system-table-decoded-reads-partition
  - source-directory-owner-index
  - source-directory-file-cap
  - failure-bundle-evidence-completeness
  - fallback-branch-coverage-census
  - dead-fallback-retirement
  - live-dual-path-classification
authorizes:
  - eslint.config.js
  - package.json
  - scripts
  - test
  - docs/development
  - docs/steering/router.md
  - docs/steering/generated
  - docs/steering/tool-descriptions.json
  - .githooks
  - .gitattributes
  - src
  - data/fallback-census
---

# Code navigability and mistake resistance

Eight recurring shapes in `src/` make an agent re-derive what an owner is and
what a value means before it can change anything: feature detection on owner
ports, process-local identity-keyed stores, prototype-copy method bags and deep
inheritance chains, alias reads on row fields, defaults on state reads,
value-or-promise returns, flat directories of two hundred files, and failure
bundles whose evidence window does not cover the failure. The 2026-11-07
verification of the formation ADD admission gap found all eight on one path
(`solve/quests/fresh-formation-user-table-routability`, memory entry
`formation-add-admission-continuation-gap-2026-11-07`). The owner's 2026-11-08 concern,
that legacy and fallback logic complicates the most sensitive development,
adds a second family: the shapes a fallback takes (two sources for one fact,
typeof dual paths, catch-and-default, alias and re-export shims, legacy
vocabulary) and, as the arbiter no syntax rule can be, which fallback
branches ever execute under the corpus and a formation. This epic makes each
shape measurable once, stops its growth with a one-way ratchet, promotes the
near-zero shapes to ESLint, retires the backlog in two pilot owners whose
cost was measured in that session, and retires every fallback branch the
coverage census proves dead. It is done when the budget below reports no
unmet row; the ratchets outlive the epic as ordinary static gates.

## Budget

Baselines were measured at `e29e295a6` (origin/main, 2026-11-08) by an espree
walk over the 2034 files under `src/`. A cap row is met when the count is at or
below its cap and the cap only moves down (R23); a zero row is the epic's work.
Change a number here and in the budget script together, never in one place.

| Row | What it counts | Baseline | Target |
| --- | --- | --- | --- |
| `navigability_patterns_without_ratchet` | the twelve audited patterns below (seven navigability, five fallback) with neither a baseline file in the shared audit shape nor an ESLint `no-restricted-syntax` entry whose message carries `navigability-rule:<row>` | 12 | 0 |
| `owner_port_feature_detection` | `typeof <member>` compared with `===`/`!==` to `'function'` or to a constant or member whose name contains the word FUNCTION, the member optionally chained, on any object (no scope analysis), excluding `.then` and `.catch` | 2130 | cap 2130 |
| `owner_port_feature_detection_pilot_owners` | the same, in `control-plane-readiness-*.js`, `partition-service*.js` and the two rebalancer consumers of the planning-answer chain | 172 | 0 |
| `identity_keyed_module_state` | module-scope `new WeakMap()`, `Map()`, `Set()`, `WeakSet()` with no arguments | 87 | cap 87 |
| `identity_keyed_module_state_admission_path` | the same, in `partition-service-raft-membership-administration.js`, `raft-rs-group-membership-admission.js` and `partition-service-raft-peer-cache-reconciliation.js` (branch `work/composed-05-comparison-readiness-20261103` adds a fourth store in `partition-replica-admission.js`) | 3 | 0 |
| `prototype_copy_bags` | `Object.getOwnPropertyNames(X.prototype)` copy loops, the prototype member optionally chained (`X?.prototype`) | 59 | cap 59 |
| `prototype_copy_bags_partition_service` | the same, in `partition-service*.js` | 12 | 0 |
| `inheritance_depth_over_two` | classes whose `extends` chain is deeper than two | 65 | cap 65 |
| `inheritance_depth_over_two_readiness` | the same, among the control-plane readiness classes (nine `extends` today) | 7 | 0 |
| `row_field_alias_reads` | in a flattened `\|\|` or `??` chain, an adjacent pair reading the same object (structural identity, optionally chained) under two spellings of one field name that differ but normalise equal (plain, string-literal key, or any constants object's member such as `COLUMN.NODE_ID`); one count per such pair | 745 | cap 745 |
| `formation_system_tables_without_decoder` | of `services`, `nodes`, `replica_operations`, tables with no module `<table>-row-decoder.js` exporting `decode<Table>Row` | 3 | 0 |
| `system_table_raw_column_reads_outside_decoder` | reads of a `services`, `nodes` or `replica_operations` own column (raw name or `COLUMN` constant) outside that table's decoder module and its write builders, every src directory group counted once | measured at the land of `system-table-row-decoders` (one-way cap) | at cap |
| `system_table_raw_column_reads_outside_decoder_rebalancer` | the same, in src/rebalancer | measured at the land of `system-table-row-decoders` | 0 |
| `system_table_raw_column_reads_outside_decoder_control-plane` | the same, in src/control-plane and src/bootstrap | measured at the land of `system-table-row-decoders` | 0 |
| `system_table_raw_column_reads_outside_decoder_node` | the same, in src/node | measured at the land of `system-table-row-decoders` | 0 |
| `system_table_raw_column_reads_outside_decoder_admin` | the same, in src/admin, src/cli, src/cdc and src/cache | measured at the land of `system-table-row-decoders` | 0 |
| `system_table_raw_column_reads_outside_decoder_query` | the same, in src/query, src/topology, src/message-group, src/wasm-service and src/runtime | measured at the land of `system-table-row-decoders` | 0 |
| `system_table_raw_column_reads_outside_decoder_partition` | the same, in src/partition | measured at the land of `system-table-row-decoders` | 0 |
| `state_read_defaults` | in a flattened `\|\|` or `??` chain, a read of `status`, `role`, `raft_role`/`raftRole`, `workflow_step`/`workflowStep`, `phase` or `step` (plain, string-literal key, or any constants object's member named STATUS, ROLE, RAFT_ROLE, WORKFLOW_STEP, PHASE or STEP, optionally chained) that has a term after it; one count per such read | 413 | 0 |
| `value_or_promise_then_checks` | a promise-shape probe at a call site: `typeof x.then` or `x.catch` (optionally chained) compared with `===`/`!==`, a truthiness test on `.then`/`.catch` as the test of a conditional or if, or `instanceof Promise`; excluded are only the sites inside a function named `turnFromForeignAnswer` in the file `src/raft/raft-rs-turn-answer.js` (the designated foreign-answer adapter; path and function both, never a basename) | 45 | 0 |
| `source_directories_over_cap` | `src` directories with more than 120 `.js` files directly inside | 4 | 0 |
| `stale_owner_indexes` | `src` directories whose `INDEX.md` is missing or disagrees with its generator (the generator's exit must be zero; otherwise the row is outstanding) | 57 | 0 |
| `failure_bundle_log_windows_without_coverage` | bundle writers that truncate node logs (`LOG_TAIL_LINE_COUNT`) without recording coverage (`LOG_WINDOW_COVERAGE`): 1 when the foundation module exports `LOG_TAIL_LINE_COUNT` and not `LOG_WINDOW_COVERAGE`, 0 when it exports `LOG_WINDOW_COVERAGE`; outstanding when the foundation module is absent, unparsable, or exports neither name | 1 | 0 |
| `two_source_fallback_reads` | `\|\|` or `??` whose member terms (optionally chained) read at least two different objects: different roots or different object paths under one root (`a.x \|\| b.y`, `o.x \|\| o.d?.x`), never two properties of one object | 1789 | cap 1789 |
| `typeof_dual_paths` | an if or conditional with a real else branch whose test contains the typeof-function comparison FORM (as defined for `owner_port_feature_detection`) on ANY operand - member, bare identifier, or `.then`/`.catch` included | 627 | cap 627 |
| `catch_returns_default` | catch whose last statement returns a primitive literal, an object or array literal (members may be computed), null, undefined, or nothing | 387 | cap 387 |
| `reexport_only_modules` | modules whose body is only imports and re-exports | 35 | cap 35 |
| `alias_exports` | `export {x as y}` | 40 | 0 |
| `legacy_term_identifiers` | identifier tokens (a shorthand specifier counts once) containing legacy, compat, fallback, deprecat, shim, interim, transitional, backward, retired, obsolete, polyfill, workaround, temporar, or the whole word old or v1 among the identifier's words; a property accessed on another object is that object's vocabulary and is excluded | 2924 | cap 2924 |
| `fallback_sites_uncensused` | two-source, typeof-dual-path and catch-default sites with no census record of an executed class (`never`, `primary-only`, `fallback-only`, `both`) matching (row, file, hash, occurrence); an `unloaded`, unknown or duplicated record leaves the site uncensused | 2803 | 0 |
| `fallback_branches_never_taken` | census class `never`: the file was loaded, neither side executed | census | 0 |
| `fallback_branches_only_fallback_taken` | census class `fallback-only`: only the fallback side executed | census | 0 |
| `fallback_sites_unclassified` | census class `both` with no recorded classification | census | 0 |

A row whose input does not exist yet (the census) is unmet, never met: a
budget that cannot measure a row reports it as outstanding.

Deepest chains today: `OperationWorkflowOwner` (15), `SQLQueryEngine` (11).
They are recorded, not in scope (R17); the readiness chain is the pilot.

## Mechanism

- **One detector per pattern.** `scripts/checks/code-navigability-detectors.js`
  owns the AST detection; the budget script and the guideline audit both read
  it. When a pattern reaches zero it is promoted to an ESLint
  `no-restricted-syntax` selector in `eslint.config.js`, the audit drops that
  pattern, and the budget row reads the ESLint report count for the rule id.
  Detection never has two owners (R01, R05).
- **Audit first, ESLint second.** `scripts/check-guideline-navigability.js`
  follows `check-guideline-silent-catch.js`: per-violation baseline JSON,
  `--update-baseline`, the tighten hint, chained into `npm run audit:guidelines`.
  ESLint is single-file and binary, so it only gets a pattern at zero.
- **Pilot owners retire backlog.** The readiness chain (24 files) and the
  partition service (41 files, 13 `create*Methods` bags) become one class each
  with named constructor collaborators validated once; duck-typing at their
  call sites is deleted in the same change. Behaviour is unchanged; the
  formation ADD continuation owner remains the formation work's repair.
- **Coverage decides what is dead.** `NODE_V8_COVERAGE` on the corpus and one
  formation scenario, merged and joined to the detector sites by file and
  range, yields `data/fallback-census/census.json`: one record per site with
  its content hash, its class (`never`, `primary-only`, `fallback-only`,
  `both`, `unloaded`) and the runs that produced it. `never` and
  `fallback-only` are deletions under the no-legacy rule; only `both` needs
  judgment, recorded per site with a reason and voided when the hash changes.
  A file no run loaded is `unloaded`, never `never`: an incomplete census
  fails the site, it does not acquit it, so an `unloaded`, unknown or
  duplicated record leaves the site uncensused. Site identity is (row, file,
  hash, occurrence) with occurrence numbered within the row.
- **Rows read the tree.** Every row is computable from a checkout, the census
  included because it is committed with the hashes that bind it; no row reads
  a live run, so the probe measures and never acts (R27).

## Order

1. `code-navigability-budget-check` seals the baselines above as a script with
   a fixture-tree witness; every other quest's probe reads its rows.
2. `navigability-guideline-audit` stops growth of every pattern.
3. `state-read-named-defaults`, `always-promise-port-answers`: zero and
   promote to ESLint.
4. `readiness-service-constructor-injection`, then
   `partition-service-constructor-injection`.
5. `system-table-row-decoders` (the three decoders, the folded normalisers and
   the measuring rows), `source-directory-owner-index`,
   `failure-bundle-evidence-completeness` in any order; then the six
   `system-table-decoded-reads-*` quests in parallel, one directory group
   each, `-partition` after `partition-service-constructor-injection`.
6. `fallback-branch-coverage-census` after step 2, then
   `dead-fallback-retirement` and `live-dual-path-classification` in parallel,
   owner by owner (readiness, partition, raft first).
7. `source-directory-file-cap` last: moving files conflicts with every
   concurrent source edit, so it waits for the other source quests.

## Decision log

- 2026-11-08: created from the code-quality review that followed the
  formation ADD admission verification. The apparatus budget row `open epics`
  was already over (18 of 12); this epic makes it 19 and should close or
  graduate its ratchets into `audit:guidelines` rather than stay open as a
  home for backlog burn-down.
- 2026-11-08: owner asked for legacy and fallback logic to be detected and
  retired; folded in as the fallback rows, the coverage census and the two
  quests it feeds. `authorizes` widened from six `src` directories to `src`
  because census-driven retirement reaches every owner; the quest statements
  bound each attempt to one owner. Executed on branch
  `work/code-navigability-fallback-census-20261108`.
- 2026-11-08: owner asked for maximal parallelism. Quests run in one worktree
  each on `work/nav-<quest>-20261108` branches off the stream branch and merge
  back as they land; `source-directory-owner-index` was split so its
  generator half runs now and the file moves (`source-directory-file-cap`)
  run last.
- 2026-11-08: `legacy_term_identifiers` corrected from 4284 to 3288 at the
  budget script's sealing measurement: the scratch regex matched `old`
  inside placeholders, thresholds and holders (996 false positives); the
  detector now splits identifiers into words. Recorded with the
  `code-navigability-budget-check` attempt (constraint baseline-is-the-oracle).
  Every other cap row reproduced exactly.
- 2026-11-08: the first independent verification of the budget script
  rejected (optional-chained members uncounted by five detectors, shorthand
  legacy tokens double-counted, a dot inside a computed member corrupting the
  two-source object path, cross-object alias reads, and an unloaded census
  class acquitting sites). Row definitions above are restated exactly as
  the second attempt measures them; the baselines move with that attempt.
- 2026-11-08: the second verification of the budget script rejected on one
  new mechanism (state-default and alias detectors inspected only the head of
  a `||`/`??` chain) and restated the two rows to count every chain position;
  baselines move with attempt 3. Recorded gaps the definitions exclude, for
  a later decision: optional-call feature detection `m?.()` (765 sites, the
  same mistake class as `typeof m === 'function'`), private-field legacy names
  (3), destructuring and parameter defaults on `status` (7). Attempt 3
  measured the flattened chains: `row_field_alias_reads` 643 -> 745 (102
  pairs at a non-head position in 98 chains; the 643 head pairs reproduce
  exactly) and `state_read_defaults` 341 -> 413 (72 reads at a non-head
  position in 64 chains; the 341 head reads reproduce exactly); every other
  row equals attempt 2, the structural object key moving none. A chain that
  is a two-source read and holds a defaulted state read is one site of
  each row with different hashes, because each site spans what its row
  counts (the chain, the term); identity carries the row, so they never
  collide. A census or classification record is an object with string
  row, file and hash and an integer occurrence (never coerced); anything
  else censuses or classifies nothing, and a census file that fails the
  schema is absent. An unparsable bundle writer leaves its row
  outstanding. Promotion needs the whole `navigability-rule:<row>` token
  in an error-severity `no-restricted-syntax` entry; `warn` promotes
  nothing.
- 2026-11-08: the third verification of the budget script approved with
  known-shape findings, corrected in attempt 4 without moving any baseline
  (every row reproduces attempt 3): an absent `src` root leaves every row
  that reads detector sites or the source tree outstanding, as a parse
  failure does; the bundle-writer row is outstanding when the foundation
  module exports neither name; `prototype_copy_bags` counts an optionally
  chained prototype argument (0 in src); the then-checks exclusion is one
  function in one file; census and classification fields are read as own
  fields only and a whitespace-only classification classifies nothing; an
  unrecognised budget argument (`--rows=name` included) is a usage refusal.
  `typeof_dual_paths` is restated to what its one definition counts: of 627,
  574 test a member, 47 a bare identifier, 6 `.then`. Recorded gap added for
  a later decision: logical assignment `||=`/`??=` (34 in src, none on a
  state field or alias pair) is not a `||`/`??` chain and is not counted.
- 2026-11-08: `authorizes` widened (R16, recorded) with `.githooks`,
  `.gitattributes`, `docs/steering/generated` and
  `docs/steering/tool-descriptions.json`: a script that joins the static audit
  chain is wired into the pre-commit hook, registered in the generated tools
  index and its curated sidecar, and a generated artifact declares its merge
  driver; `source-directory-owner-index` and `navigability-guideline-audit`
  touch all four. No source directory was added. The R17 fix quest
  `priority-recovery-owner-read-snapshot-await`, recorded by the readiness
  quest, lives outside this epic and lands as its own record. The shared proof
  chain was repaired first at c0c2a8ad6 (import-graph producer: a module
  resolving outside the repository root is never a node); the budget-check
  quest landed on it as 86ee709c8.
- 2026-11-08: always-promise ruling. Two probes by the implementer showed that
  an always-asynchronous raft turn changes raft timing (status reads see
  delivered inbound later; the synchronous evidence harnesses break). The
  pattern is feature detection on the answer, so the replacement is a named
  settled-or-pending answer produced once at the producer (R07) for
  synchronous-when-possible turns, always-promise for I/O producers, and a
  registration-time apply-mode declaration instead of per-entry sniffing.
  The row definition widens to the variant shapes (`?.then`, `.catch`,
  truthiness on `.then`, `instanceof Promise`) in a budget-check correction.
- 2026-11-08: readiness injection rulings. Four owners (RebalanceCoordinator,
  UnifiedRebalancer, ReplicaDispatchService, StorageAdmissionService) built a
  private readiness service when none was injected: a hidden second authority
  (R01, R03) that the quest removes by injecting the node's service and
  sweeping the test construction sites through one fixture helper. Late-bound
  collaborators are wired at one validated point; a read before wiring is a
  named unavailable state. Routed finding (R17): the unawaited best-effort
  planning read consumed as a snapshot, quest
  `priority-recovery-owner-read-snapshot-await` (class fix).
- 2026-11-08 (lead decision, supersedes one clause of the readiness injection
  ruling above, R09 recorded): re-wiring a late-bound collaborator through
  `syncOwnerDependencies` IS a production path (control-plane-setup, the
  heartbeat service, the coordinator lifecycle and the SQL-runtime handoff each
  wire different fields at different times, and the storage-accounting
  replacement already has a named semantic-owner replacement step). A second
  wiring is therefore not refused: every wiring validates the collaborator's
  interface once at that point (a malformed one is a typed refusal), a
  replacement is the named transition that clears the owner's derived memos,
  and a read before wiring answers a named unavailable state. The sealed
  constraint behaviour-unchanged outranks the earlier wording.
- 2026-11-08 (lead decision, 21:40 CET): `system-table-row-decoders` split.
  The implementer's census found the sealed quest to be a migration of about
  200 files through the join, readiness and rebalance core, and that its probe
  `formation_system_tables_without_decoder` measures only the presence of a
  `<table>-row-decoder.js` module: three decoders with no consumer would read
  0 (probe defect F1, owner: this epic and the budget script). The quest is
  re-sealed as the decoders quest: the three decoder modules with exhaustive
  tests, the existing per-table normalisers (`normalizeServiceRow`,
  `normalizeReplicaRow`, `normalizeCensusServiceRow`,
  `normalizeCurrentVoterServiceRow`, `normalizeNodeRow`, the column decoding
  of `ReplicaOperationRepository#rowToOperation`,
  `normalizeReplicaOperationRecord`, `normalizeOperationProgressRecord`,
  `readOperationWorkflowRecord`, `normalizePublicationOperationWorkflowRecord`
  and the routed display normalisers) folded into them so one version of each
  decoding exists, and the measuring rows above (overall row capped one-way at
  the measured count; one row per directory group with target 0). Six
  `system-table-decoded-reads-*` quests then drive each group row to 0.
  Projections: an absent column stays a typed refusal; a partial `SELECT`
  decodes through a named projection declared once beside the query, which
  yields a frozen object with exactly the projection's named fields and a
  projection marker; a consumer that needs a field outside the projection
  widens the projection at the query and never reads a raw column. Overlap
  with `state-read-named-defaults` (F2): that quest zeroes
  `state_read_defaults` on these tables by measurement; the consumer quests
  replace its `readStateField` reads on these tables with decoded named
  states, and the `row_field_alias_reads` cap arithmetic starts from the
  post-merge value, not 745.
