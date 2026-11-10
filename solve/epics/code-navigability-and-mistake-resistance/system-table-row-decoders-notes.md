# system-table-row-decoders: implementer notes (append-only)

Worktree `lagrange-nav-decoders-20261108`, branch
`work/code-navigability-decoders-20261108`, HEAD 79ec4e360 (seal at stream
head 77e672a00). No foreign changes in `git status` at start.

## 2026-11-08 census (step 1) and scope finding

STATUS: census and design only. No src change is staged. The sealed
statement is far larger than one bounded candidate and its probe does not
measure it; both need a lead/owner decision before implementation (see
"Decision needed" below and the design note
`system-table-row-decoders-design.md`).

### How the census was taken (reproducible)
- Detector sites: `detectNavigabilityPatterns(root)` from
  `scripts/checks/code-navigability-detectors.js`, rows
  `row_field_alias_reads` (745) and `state_read_defaults` (413), each site
  printed with its source slice.
- Raw column readers: grep over `src/**/*.js` for dotted/bracket reads of
  the columns UNIQUE to each table, and for `COLUMN.<UNIQUE>`; shared
  columns (`node_id`, `status`, `partition_id`, `created_at`, ...) are
  counted separately because a grep cannot attribute them to a table.
  Table-unique columns used:
  - services: service_type raft_role state_entered_at previous_state
    trigger_reason cleanup_token create_attempt_token
  - nodes: node_address cpu_cores memory_mb disk_gb *_usage_percent
    connection_state last_heartbeat ready_lease_expires_at
    storage_budget_{bytes,source,updated_at} latency_group_id
    last_latency_check_at latency_assignment_state
  - replica_operations: workflow_step steps_history target_claim_key
    source_node_id lease_expires_at membership_publication_epoch
    source_replica_id message_group_membership_{lane_key,phase}
    create_admission_{state,token,attempt_seq}

### Numbers at 79ec4e360
| measure | services | nodes | replica_operations |
| --- | --- | --- | --- |
| files naming the table (`TABLES.X` / `SYSTEM_TABLE_NAME.X`) | 149 | 112 | 77 |
| raw reads of table-unique columns (lines / files) | 211 / 81 | 133 / 32 | 124 / 41 |
| `COLUMN.<table-unique>` uses (lines / files; readers AND writers) | 109 / 50 | 170 / 44 | 8 / 3 |

- Union of files with any table-unique raw or COLUMN read: **199 files**
  (rebalancer 42, node 29, control-plane 29, bootstrap/owners 15, query 11,
  partition 10, admin 9, bootstrap 7, topology 6, message-group 5, cli/views
  5, cdc 5, cache 5, bootstrap/shared 5, runtime 4, wasm-service 3, service 3,
  bootstrap/phases 3, cli/core 2, constants 1).
- Shared columns, table not attributable by grep: `.node_id` 334 lines,
  `.status` 1042, `.partition_id` 229, `COLUMN.NODE_ID` 218, `COLUMN.STATUS`
  112. Each needs per-site producer tracing to know whether the object is a
  row of one of the three tables.
- SQL text naming the tables (FROM/UPDATE/INTO): 27 files.
- Detector sites attributable by a table-unique field (lower bound):
  **95 `row_field_alias_reads`** and **135 `state_read_defaults`** in 100
  files. Upper bound adds the shared-field alias pairs: partition_id 100,
  node_id 65, service_id 28, operation_id 30, created_at 26, updated_at 27,
  replica_id 16, status 10, group_id 4 (all tables mixed).

### Existing decoders of these three tables (one-version-of-logic findings)
Each is a second (or n-th) decoder the quest must fold into the one
decoder module; several accept both spellings, which is where most alias
reads live:
- services: `normalizeServiceRow` (src/control-plane/system-row-normalizers.js,
  reads COLUMN.X || snake || camel, 30 call sites in rebalancer,
  control-plane, bootstrap), `normalizeReplicaRow`
  (src/rebalancer/replica-inventory.js), `normalizeCensusServiceRow`
  (src/control-plane/membership-publication-priority-partition-summary.js),
  `normalizeCurrentVoterServiceRow`
  (src/control-plane/current-priority-placement-observation.js).
- nodes: `normalizeNodeRow` (system-row-normalizers.js; 18 call sites incl.
  join-readiness and membership-publication-candidate-derivation, i.e. the
  join core).
- replica_operations: `ReplicaOperationRepository#rowToOperation`
  (src/rebalancer/replica-operation-repository-row-methods.js; ~40 call
  sites via `this.rowToOperation` / `repository.rowToOperation`; it mixes
  column decoding with enrichment: steps_history metadata, semantic phase,
  witnesses, logger), `normalizeReplicaOperationRecord`
  (replica-operation-liveness.js), `normalizeOperationProgressRecord`
  (operation-lifecycle.js), `readOperationWorkflowRecord`
  (operation-workflow-owner-evidence.js),
  `normalizePublicationOperationWorkflowRecord`
  (control-plane/publication-active-gate-handoff-contract-workflow.js),
  plus the routed display normalisers (priority-recovery-visibility-decision
  toVisibilityString; replica-operation-progress
  normalizeWorkflowStepIdentifier / normalizeReplicaStatusIdentifier;
  owner-ports normalizeOperationWorkflowOwnerPortText).
- The existing normalisers are LENIENT (absent -> '' / null / []), and their
  callers compare against those values. A strict decoder (absent column =
  typed refusal, per the sealed constraint decoder-is-not-authority)
  changes the outcome on every partial projection (`SELECT node_id, status
  FROM nodes ...`) and every hand-built fixture row; each caller has to be
  moved to a full-row read or a named projection decoder. These paths are
  the join/readiness/rebalance core (join-core coupling directive).

### Finding F1: the probe does not measure the statement
`formation_system_tables_without_decoder` (scripts/checks/code-navigability-budget.js
`systemTablesWithoutDecoder`) counts only whether a file named
`<table>-row-decoder.js` under src exports `decode<Table>Row`. Three
decoder modules with zero consumers make the probe 0 while every clause
of the statement after "has one decoder module" stays false. No detector
row measures "only the decoder reads the table's raw columns / COLUMN
constants" (the sealed constraint one-read-of-raw-columns says "a consumer
that still does is a violation the detector reports" — there is no such
detector), nor attributes alias / state-default sites to a table.

### Finding F2: overlap with state-read-named-defaults
That quest (in flight) drives `state_read_defaults` 413 -> 0 across src,
including the >=135 sites on these three tables, via
`readStateField`/`STATE_ABSENT`, and `row_field_alias_reads` 745 -> 707.
After the stream merge the "state-read defaults on these tables reach
zero" clause is already met by measurement; what remains is replacing
those `readStateField` reads with decoded named states, i.e. the same
consumer lines it just edited. The alias cap arithmetic for this quest
must start from the post-merge 707 baseline, not 745.

### Decision needed (stop point)
1. Re-scope: the statement as sealed is a ~200-file migration of the
   join/readiness/rebalance core (rough size: 230 attributable detector
   sites, ~470 unique-column raw reads, plus per-site tracing of ~1800
   shared-column reads). Proposed split in the design note: Q-A decoders +
   fold the existing decoders + a measuring detector row; Q-B..Q-F one
   owner directory each.
2. Probe: add a detector row that measures the statement (raw column reads
   outside the decoder module, per table, as a one-way cap) before any
   consumer slice, so each slice's probe is that row's scoped count.
3. Strictness: confirm absent-column = typed refusal for projections
   (forces full-row reads or per-projection decoders) versus a decoder that
   names a PROJECTED_ABSENT state.

## 2026-11-08 resume after the lead's decision (re-seal 730225bf1 at 95877e60b)

Scope accepted as proposed: three decoders + exhaustive tests, the listed
normalisers folded, and the measuring rows. Projections: absent column
stays a typed refusal; partial SELECTs decode through a named projection
declared beside the query.

### Measuring rows (detector + budget)
- Detector: `scripts/checks/code-navigability-system-table-detectors.js`
  (`systemTableRawColumnReads`, row
  `system_table_raw_column_reads_outside_decoder`), run by and re-exported
  from `code-navigability-detectors.js` (in `ROW_ORDER`, `FILE_VISITORS`;
  `detectSystemTableRawColumnReads`, `SYSTEM_TABLE_COLUMNS`).
  `code-navigability-source.js` now also exports `structuralKey`.
- Attribution rule (also the module's doc block):
  - READ = member read `x.col` / `x['col']` / `x[COLUMN.COL]` (optional
    chain included) or a destructured key, not an assignment / update /
    delete target and not a callee. Object-literal keys, assignment targets
    and SQL text are writes or text: write builders are excluded by
    construction; a builder copying from another row (`{node_id:
    row.node_id}`) reads that row and counts.
  - OWN column (stored by exactly one of the three tables and no other
    system table; `type` excepted as a generic word) -> its table outright.
  - SHARED column (`node_id`, `status`, `partition_id`, `created_at`,
    `type`, ...) -> attributed to table T only when the same object
    (structural key; each destructuring pattern = the declarator's init) in
    the same nearest-function scope also has an own-column read of T. This
    is the static form of "trace the producer": the co-read proves the
    object is a T row. A shared read evidenced for two tables is one site
    with detail `services+nodes:node_id`.
  - A file named `<table>-row-decoder.js` is that table's decoder; its reads
    attributed only to its own table are not sites.
- Known blind spots (by design): a shared-column read on an object whose
  scope has no own-column read of the table (e.g. a helper reading only
  `row.node_id`/`row.status`) is not counted; variable keys (`row[name]`)
  and constants objects other than `COLUMN` are not counted; evidence does
  not cross function scopes (a closure reading `row.status` of an outer
  row read is uncounted); generic helpers that read columns through a
  column list (e.g. `readColumn(source, COLUMN.X)`) are not member reads
  and are uncounted. The per-directory quests must census their directory
  for these shapes too (the census grep above is the cross-check).
- Witnesses: test/scripts/code-navigability-detectors.test.js (counting
  rules incl. writes/keys/SQL/callee/nested scope; decoder-file exclusion;
  column lists == stored schemas, own columns stored by no other table);
  test/scripts/code-navigability-budget.test.js (sealed table rows, met /
  offending fixtures, and "groups partition every read in src": the six
  disjoint group counts sum to the overall row on this checkout).
- Groups (budget rows `system_table_raw_column_reads_outside_decoder_<g>`,
  target 0): rebalancer (src/rebalancer), control_plane (src/control-plane
  + src/bootstrap), node (src/node), admin (src/admin, src/cli, src/cdc,
  src/cache), query (src/query, src/topology, src/message-group,
  src/wasm-service, src/runtime), partition (src/partition). Row names use
  `control_plane` (underscore) to keep row names one identifier. No `other`
  group is needed: every directory with a read is in a group.
- Measured at 730225bf1 + detector only (before any fold): overall 1096
  (services 450, nodes 303, replica_operations 343 by first-attributed
  table); rebalancer 180, control_plane 391 (control-plane 227 + bootstrap
  164), node 322, admin 128 (cli 78, cache 29, cdc 17, admin 4), query 56
  (message-group 19, topology 14, query 14, wasm-service 9, runtime 0),
  partition 19. The cap is re-measured at land (after the folds).
- Test fixture changes: the offending tree has four more source
  directories without INDEX.md (stale_owner_indexes 9 -> 13) and the
  no-src CLI run prints 33 unmet rows (26 + 7 new rows).

### Projection census (distinct SELECT column lists, src/**; script-based)
- services (5): `*` (19 sites); bootstrap-api-constants.js:235 (10 cols, no
  partition_id...); replica-state-machine-lifecycle-observation.js:8;
  rebalance-coordinator-shared.js:169-170 (`status`);
  replica-operation-repository.js:219/223.
- nodes (3): `*` (11); rejoin-hints-durable-evidence.js:21 (`node_id,
  node_address`); `node_id, boot_incarnation` (4: replica-create-admission-
  owner, replica-operation-message-group-learner-observation/-successor, +1).
- replica_operations (3): `*` (24); replica-cleanup-tombstone-owner.js:374
  (`operation_id, status, workflow_step`); unified-rebalancer-shared.js:183
  (`COUNT(*)`, not a row of the table).
All well under the ~8 projections per table threshold. Only projections a
folded call site needs are declared in this quest.

### Closed domains = writer census (read-only census agent, src writers traced)
| column | domain | notable writers |
| --- | --- | --- |
| services.status | active, stopped, pending, creating, syncing, removing, removed, failed, created, starting, cleanup_owned, cleanup_complete | replica state machine (transition.js:666-677); runtime projection RUNTIME_REPLICA_STATUS.CREATED (runtime-replica-state-projection.js:243-250); replica-cleanup-tombstone-owner.js:142/255/325 (cleanup_*); replica-recovery-service.js:518/576 `starting` (class exported, never instantiated in src; kept in the domain); `held` never written |
| services.raft_role | leader, follower, learner, candidate, NULL | `candidate` is live on the wasm-service path (raft-rs-runtime-owner.js:1411 -> replica-leadership-state.js:165-171 -> wasm-service-replica.js writeRoleUpdate); NULL from tombstones and runtime-projection rows |
| nodes.status | joining, active, stopped, suspected, failed, recovering | row builder / heartbeat / lease reaper / failure-detector.js:314/366/424 |
| nodes.connection_state | connected, ready, disconnected, connecting | `connecting` only in admission peer-hint rows a joiner hydrates into its cache (bootstrap-request-owner.js:149) |
| replica_operations.type | ADD, REMOVE, REPLACE, MOVE_ASSIGNMENT | MOVE_ASSIGNMENT = BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE (move-replica-assignment-reservation-persistence.js:21) |
| replica_operations.status | pending, creating, syncing, active, removing, removed, failed | `held` never persisted |
| replica_operations.workflow_step | all eight WORKFLOW_STEP values | |
- Case: no src writer stores a different case; upper-case `ACTIVE`, `LEADER`, `voter`, connection_state `draining`/`joining` are fixture-only. The decoder still matches case-insensitively (mapping to the canonical value), which keeps the old normalisers' lower-casing outcome for fixtures; unknown values refuse.
- Open risks (R17, owners named): register-service HTTP pass-through writes unvalidated `serviceData.status/raft_role` (bootstrap-api-registration-methods.js:115-116; owner: bootstrap API); the coordinator upper-cases any `move.type` without an OperationType membership check (rebalance-coordinator-operation-creation.js:679; owner: rebalancer operation creation); query-executor-partition-routing-snapshot.js:521 compares against `SERVICE_STATUS.INACTIVE`, which does not exist (always undefined; owner: query routing).

### Decoder contract amendment: cache provenance (lead to confirm)
The services/nodes fold agent showed (real SystemTableCache, evidence script
in the scratchpad) that every CDC-delivered cache row carries
`updated_at_hlc` (partition-cdc-generator.js stampOriginHlc; cache stores
deepClone(data)); the cache declares that vocabulary as
SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES (src/cache/cache-constants.js:75-81).
A strict "exactly the columns" decoder would refuse every production cache
row while unit fixtures (no HLC) stay green. Implemented option A: the
decoder ignores exactly those declared cache-local keys (neither refused nor
decoded); all other keys stay strict. Witness: "a cache row is a stored row
plus the cache's declared local provenance".

## 2026-11-09 state of the candidate (STOP: two decisions needed before the services/nodes folds)

### Done (staged)
- Decoders + shared rules + exhaustive tests (21 tests): see the design note.
  Probe `formation_system_tables_without_decoder` = 0; `solve probe` done=true.
- Measuring rows (detector, budget, epic table, witnesses). Overall row
  measured 1096 at the seal and 1056 now (rowToOperation's 40 reads gone);
  cap set to 1056 (re-measure at land after the stream merge). Groups now:
  rebalancer 140, control_plane 391, node 322, admin 128, query 56,
  partition 19.
- rowToOperation: column decoding folded onto decodeReplicaOperationsRow
  (log-and-[] on malformed steps_history removed with its orphan
  STEPS_HISTORY_PARSE_ERROR constant: malformed JSON is now a typed refusal).
- Production producer fix (fold agent): buildReplicaOperationRow
  (replica-operation-repository-mutation-row-methods.js) now emits all 36
  stored columns with nulls; before, steady-state INSERTs left cache rows
  without membership_publication_epoch / message_group_membership_owner_claim
  / _permit (the gateway drops `undefined`) until the row's first UPDATE.
- Display/alias folds: operation-workflow-owner-ports.js (three `_UNDERSCORE`
  second spellings deleted), priority-recovery-visibility-decision.js
  (replica_operations event-data reads stored spelling only; `partition_id ||
  entity_id` two-source fallback and `|| ''` defaults on status/type/step
  removed).
- Shared test store: test/rebalancer/test-helpers.js normalizeReplicaOperationRow
  (14 snake ?? camel pairs) deleted; the fake cache/SQL hold production-shaped
  rows via test/test-helpers/system-table-row-fixture.js. ~25 rebalancer /
  control-plane test fixtures moved to the helper.

### Counts and caps (detector, base 730225bf1 -> now)
- row_field_alias_reads 745 -> 745: **0 detector sites removed** (the owner-
  ports aliases were spelled through identifier constants and the test
  helper is outside src; neither is a detector site). Cap unchanged.
- state_read_defaults 413 -> 409 (4 removed, priority-recovery-visibility-
  decision.js); audit baseline tightened 413 -> 409.
- two_source_fallback_reads 1785 -> 1781 (4 removed, same file); audit
  baseline tightened 1789 -> 1781 (printed hint, one-way; 4 of that slack
  pre-existed at the base).

### Test expectation changes (HEAD justification)
1. replica-operation-repository.test.js:313-320 and
   rebalancer-entity-interaction-contract.test.js:434-438: a row with NULL
   entity_type now refuses `null_in_not_null_column at entity_type` (was
   `Unsupported rebalancer entity type`): entity_type is NOT NULL, so no
   stored row has it; the decoder's typed refusal precedes the identity
   assert. Still a refusal.
2. replica-operation-repository.test.js:324-339 'recovers from malformed
   steps_history' -> 'refuses malformed steps_history': HEAD logged and used
   []; steps_history is NOT NULL JSON written only by buildReplicaOperationRow
   (JSON.stringify), so malformed JSON is corruption and refuses (R07). Lead
   to confirm (behaviour change on an impossible row).
3. replica-operation-repository-deferred-visibility-test-cases.js:522: the
   old assertion compared against `[undefined]` (TERMINAL_STATUSES is an
   array) and fixtures used undefined statuses/steps; fixed to
   ReplicaStatus.FAILED / ACTIVE and WORKFLOW_STEP.ACTIVE (vacuous before).
4. replica-operation-membership-epoch-binding.test.js (E7): stored `'abc'`,
   `''` and cache string `'2'` in membership_publication_epoch now refuse
   `wrong_type` at the row decoder instead of
   INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING; -1 and 1.5 keep the binding
   owner's refusal. Still fail-closed. Lead to confirm the binding owner need
   not be the sole refuser.
Fixture completions (no expectation change): `status: 'in_progress'` (no src
writer) -> CREATING/PENDING by step; a NOT NULL source_node_id null ->
REMOTE_OWNER_NODE_ID; stale-planning fixture timestamps (old helper stored
NULL = "no age"); a FAILED terminal row given its explicit status.

### Not folded, with the reason (decision or consumer-quest work)
- normalizeServiceRow, normalizeNodeRow, normalizeReplicaRow,
  normalizeCensusServiceRow, normalizeCurrentVoterServiceRow: STOPPED before
  any edit. Census ready (normalizeServiceRow 19 call sites / 11 files;
  normalizeNodeRow 15 / 7 files; per-site producers in the fold agent report,
  summarised below). Blockers:
  (a) Partial cache rows produced in production: the joiner's own nodes row
      seeded by node-registration-owner.js:154 seedJoinTimeCacheRow (15 of 23
      columns; lacks latency_assignment_state NOT NULL, storage_budget_*,
      latency_*); the priority-recovery services seed
      replica-handler-create-status-methods.js:537-549
      seedLocalPriorityServiceRow (8 columns, UPSERT merge). Completing them
      means writing schema defaults/NULLs into an UPSERT merge, which would
      clobber an existing row's values: a join-core writer change that needs
      a ruling (insert-only completion vs a cache-owned complete-row merge).
  (b) Synthetic projected replicas (unified-rebalancer-replica-state.js:398-
      407, 420-426): 7-key invented services rows and mixed camel/snake
      re-spreads, flowing through getCurrentReplicas (12 sites / 10 files)
      into replica-inventory and the priority census. They are not stored
      rows (created_at/updated_at NOT NULL have no honest value): needs a
      shape ruling (a named projected-replica record type, decided by the
      rebalancer consumer quest).
  (c) global-projection / table-impact use isDeepStrictEqual on the
      normalised 9-field record for projection reuse: must stay a 9-field
      semantic record built from the decoded row (not the 17-field decoded
      object) or every updated_at bump rebuilds the planning projection.
- normalizeReplicaOperationRecord (18 call sites; raw cache rows,
  operations and learner-promotion `operationStatus` rows from
  partition-service-learner-promotion-methods.js:205-220) and the case/alias
  readers in replica-operation-progress.js (normalizeWorkflowStepIdentifier,
  normalizeReplicaStatusIdentifier, readReplicaOperationRecord*; ~40 entry
  points incl. raw rows from replica-dispatch-reconcile-callbacks.js:70-95,
  storage-capacity-semantic-projection-owner.js:111-124,
  unified-rebalancer-critical-topology-methods.js:575-593): folding requires
  decoding at producers that are the six consumer quests' reads, and the
  partial-cache-row residue (a) would become thrown refusals inside planning
  filter callbacks.
- readOperationWorkflowRecord, normalizeOperationProgressRecord,
  normalizePublicationOperationWorkflowRecord: not replica_operations shapes
  (workflow-evidence, progress-store and publication-handoff records):
  nothing to fold; the lead's list should drop them.
- toVisibilityString, normalizeOperationWorkflowOwnerPortText: kept; they
  map a value to a named unavailable/empty variant over CDC event data that
  has no projection (INSERT event data is the written subset), alias reads
  removed.

### R17 findings (owners)
- SQL.INSERT_OPERATION (rebalance-coordinator-shared.js:139-154,
  replica-operation-repository.js:195) omits message_group_membership_owner
  _claim/_permit: its CDC INSERT data is partial (raw-SQL fallback for
  reduced harnesses) -> rebalancer repository.
- Rolling upgrade: cache rows inserted by a pre-fix process stay partial
  until their first UPDATE and refuse at the cache rowToOperation sites
  (read-methods.js:318/654, entity-read-methods.js:123,
  operation-workflow-observed-state.js:146) -> lead (upgrade is unsupported
  per the rs-raft closeout rulings; confirm).
- operation-workflow-dispatch-execution.js:256-283,347 dispatch input
  `string | operation | stored row` with both id spellings -> rebalancer
  consumer quest.
- replica-operation-repository-row-methods.js resolveOperationOwnerNodeId
  (partitionId || partition_id, workflowStep || workflow_step) -> rebalancer
  consumer quest.
- readNormalizedServiceNodeId (readiness-planning-table-impact-
  classification.js:149-154) is catch-returns-default and would swallow
  decoder refusals -> control-plane consumer quest.
- resolveMeshConnectivityLifecycleTokens (join-readiness-mesh-connectivity-
  methods.js:98-108) reads five spellings -> control-plane consumer quest.
- priority-recovery-visibility-decision.js service/node/endpoint camel
  aliases (lines 16-24, 44-58) -> services/nodes fold.
- Writer-census risks above (register-service pass-through, move.type
  membership, SERVICE_STATUS.INACTIVE).

### Cheap checks (staged tree)
node --check all changed .js: 0 failures; eslint changed files: 0 errors;
LAGRANGE_SOLVER_LANDING=1 pre-commit: exit 0 (scoped complexity prints three
inherited functions in touched files: mergeCoordinatorCreatedBootstrapMetadata
13, buildPriorityRecoveryVisibilityRebalanceDecision 33,
resolveOperationOwnerNodeId 33; informational, the hook passes);
test:duplication exit 0 (no hint); audit:guideline:navigability exit 0 (state
and two-source hints applied); test:metadata:refresh exit 0 (shards staged).
Lab: NOT run: the candidate stops at a decision point and the services/nodes
folds will change it; a lab run now would certify a tree that is not the
landing candidate. Local targeted runs (fold agent): 28 rowToOperation files
1166/0, 12 helper-seeding files 244/0, 21 further helper users 868/0 (+1
pre-existing skip), owner-port/visibility suites 340/340; script + decoder
tests 57/57.

### Verifier's model (what to re-derive)
1. Decoder contract: system-table-row-decoding.js rules vs the 21 decoder
   tests; domains vs the writer census table above; the cache-provenance
   exception is exactly SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES.
2. Detector: attribution rule in the module doc; witnesses; groups sum to
   the overall row; recount 1096 at 730225bf1 and 1056 on the candidate.
3. rowToOperation: every field equals HEAD's for a complete stored row;
   every rowToOperation producer is a complete stored row (SQL SELECT *,
   cache rows incl. CDC INSERT data after the buildReplicaOperationRow fix).
4. Expectation changes 1-4 above against HEAD.

## round 2 (2026-11-08, implementer 2; lead rulings of 22:10 CET)

Start: worktree clean apart from the staged candidate (no foreign changes);
`git diff --cached | sha256sum` at start 48fed851... (the brief's cc40d27d...
predates the staged log entry carrying the rulings).

### Ruling 1: the cache holds complete rows (in progress)
- One default resolver at the DDL owner:
  `resolveSystemTableColumnDefault(column)` in
  src/bootstrap/system-table-schema-sql.js reads the same `defaultValue` the
  DDL generator writes after `DEFAULT` (quoted literal -> text, NULL -> null,
  numeric -> number under the column's type affinity). The schemas already
  carry every default; no schema extension was needed.
- `completeInsertedSystemTableRow(tableName, data)` in the new
  src/cache/system-table-cache-row-completion.js: per-table completion derived
  once from SYSTEM_TABLE_SCHEMAS; omitted column -> declared DEFAULT, else NULL
  if nullable, else `SystemTableCacheRowIncompleteError`
  (code SYSTEM_TABLE_CACHE_ROW_INCOMPLETE, `tableName`, `column`). Keys that are
  not columns (cache-local provenance) pass through.
- Hooked into SystemTableCache.applySystemTableChange at the three places a
  row the cache does not hold is stored: INSERT (also INSERT on a held key,
  which HEAD already treated as a whole-row replacement, i.e. SQL INSERT OR
  REPLACE: the replacement is completed), UPDATE of a missing key, UPSERT of a
  missing key. Merges onto a held row (UPDATE/UPSERT mergeRecords, stale
  backfill, authoritative replacements) are unchanged: they keep held values
  for omitted columns. The INSERT branch now notifies the stored (completed)
  row instead of the raw input, like the UPDATE/UPSERT branches.
- Scope: every cached table (all 46 have a stored schema); the rule is the
  cache's, not per table.
- Witness test/cache/system-table-cache-row-completion.test.js: for EVERY
  system table the completion of a minimal insert deep-equals the row
  better-sqlite3 stores for the same INSERT into the table created by
  generateCreateTableSQL; INSERT/UPSERT/UPDATE of the joiner seed shape yields
  the SQL row and decodes; the services seeder shape without service_type is
  refused (cache unchanged; SQL refuses the same insert); a merge keeps held
  values; provenance passes through.
- Blind spot (by ruling scope): an explicit NULL in a NOT NULL column is not
  refused by the cache (only omission is); the decoder refuses it on read.
- Fixture blast radius (measured, local, 149 non-integration test files that
  call applySystemTableChange): 108 files / 694 tests refused partial fixture
  rows (nodes 63 files, services 28, partitions 16, tables 15, message_groups 6,
  service_endpoints 5, replica_operations 3, node_endpoints 1, indices 1,
  control_plane_publications 1). Fixtures are moved to production shape with
  test/test-helpers/system-table-row-fixture.js, which gained
  `systemTableRow(tableName, overrides)` for every table (override, else the
  DDL default via the same resolver, else NULL, else a declared or typed
  placeholder NOT NULL value). Note: nodesRow()/servicesRow() now give the DDL
  default (not NULL) to nullable columns with a DEFAULT (nodes
  cpu/memory/disk_usage_percent 0, capabilities '[]').

### Seeders (ruling 1)
| seeder | columns it writes | NOT NULL w/o DEFAULT omitted | outcome |
| --- | --- | --- | --- |
| seedJoinTimeCacheRow nodes (node-registration-owner.js:154; buildNodeRegistrationRow + budget + connection_state/last_heartbeat/ready_lease_expires_at) | node_id node_address cpu_cores memory_mb disk_gb cpu/memory/disk_usage_percent status connection_state capabilities last_heartbeat boot_incarnation created_at storage_budget_* ready_lease_expires_at | none | unchanged: completion adds latency_assignment_state = 'unassigned' (its DDL DEFAULT, what the SQL row and prepareInsertData hold) and NULL latency_group_id / last_latency_check_at. The predecessor's "omits NOT NULL latency_assignment_state" holds, but the column has a DEFAULT, so it is not a defect. |
| seedLocalPriorityServiceRow (replica-handler-create-status-methods.js:537) | service_id service_type partition_id node_id status address created_at updated_at | none | unchanged: completion adds NULL group_id, replica_id, raft_role, state_entered_at, previous_state, trigger_reason, error_message, cleanup_token, create_attempt_token (all nullable without DEFAULT; the durable row's CDC round-trip supersedes it). |
| bootstrap admission peer hints (bootstrap-request-owner.js buildBootstrapAdmissionPeerNodeRows / EndpointRows; hydrated into the joiner's cache by query-system-state-phase) | nodes: node_id node_address status connection_state; node_endpoints: endpoint_id node_id transport_type address priority status | nodes: cpu_cores memory_mb disk_gb last_heartbeat created_at; node_endpoints: created_at updated_at | DEFECT FOUND (not in the predecessor's census): HEAD hydrated rows the table could not hold. Fixed at the seeder: the hint records `admittedAt` (admission.startedAt); node row created_at = admittedAt, cpu_cores/memory_mb/disk_gb = 0 (BOOTSTRAP_ADMISSION_PEER_RESOURCES_NOT_REPORTED: the value the nodes INSERT owner applyTableInsertDefaults gives unreported resources), last_heartbeat = 0 (BOOTSTRAP_ADMISSION_PEER_HEARTBEAT_NOT_OBSERVED: what failure-detector.js already reads for an absent heartbeat, `last_heartbeat || 0`); endpoint created_at = updated_at = admittedAt. JOIN CORE: lead to confirm the not-reported values (alternative: hints stop being nodes rows). |

### Fixture migration, bucket A (control-plane, cdc, constants, address): done
23 files green (22 edited + control-plane-readiness-service-test-support.js).
No production producer refused (applyAuthoritativeCacheRepairRow passes the
test's stubbed authoritative row through). Expectation changes (fixture-
derived expected rows grew to the complete stored row; justification: the
cache now stores the row the SQL table holds after that INSERT, and the
fixture is that row): cdc-authoritative-catchup-hydration.test.js:594,733,776
(t.same cache row); control-plane-system-table-gateway.test.js:526,581 (getAll
services) and :596 (the "unchanged" authoritative row is the complete row an
authoritative read returns). Latent fixture bugs surfaced: COLUMN.TABLE_NAME
does not exist (authoritative-node-evidence-reconciler fixture keyed
`undefined`); nodes fixtures carried a non-column `updated_at`;
cdc-event-delivery used COLUMN.ADDRESS for node_address. Lead implementer
applied the agent's two out-of-scope helper changes:
test/test-helpers/endpoint-incarnation-fixture.js registeredNodeRow -> nodesRow
(drops the non-column updated_at); system-table-row-fixture.js declares '[]'
for control_plane_publications' four NOT NULL JSON list columns.

### Fixture migration, bucket B (bootstrap, node): done
21 of 22 files green, no expectation changes, no production producer refused
(src frames node-joining-cdc-subscription-and-backfill.js:541,
bootstrap-cache-hydration-applier.js:15, join-phase-owners.js:66 apply
test-supplied rows). Non-column fixture keys corrected (nodes `updated_at`,
tables `schema` -> schema_definition, partitions start_key/end_key ->
partition_key_start/_end, replica_operations operation_type -> type, stray
`id`). cdc-source-occurrence-delivery.integration.test.js waits on
test/partition/partition-admitted-group-fixture.js and
test/message-group/message-group-native-w7-composition.js (bucket D's scope).
Observation: a complete endpoint row carries boot_incarnation = DDL 0, so a
test needing the node's incarnation states it in the row.

### Fixture migration, bucket E (rebalancer, convergence): done
13 files green; no production producer refused. Expectation changes:
operation-workflow-active-cache-handoff.test.js:944 (expected cached services
row is the complete row: nullable columns NULL as the INSERT stores them);
dt6-authoritative-observation-watermark.test.js:216 (the authoritative
service_endpoints row carries boot_incarnation 0, its DDL DEFAULT, as SELECT *
returns it). Fixture corrections: non-column keys dropped (partitions
partition_number, nodes updated_at), storage_reservations operation_type ->
type. Storage admission/migration fixtures now seed READY members
(connection_state ready, last_heartbeat now, ready_lease_expires_at now+60s):
at HEAD the partial node row was HEALTHY only through the lenient "no status
and no lease field" branch of projectClusterMembership
(node-liveness-semantic-projection.js:361); a complete row with a cleared lease
is INVALID, so the fixture now states the precondition the ALLOW tests
assume (no assertion changed). test/rebalancer/timeout-test-coordinator.js's
fake SQL INSERT stores completeInsertedSystemTableRow('replica_operations',
row) (the row SQL would store); reused by existing-group-add-topology-guard's
cohort engine (its 16-column mapping was stale against the production INSERT).
Finding (R17, rebalancer repository): two copies of the replica_operations
INSERT SQL (replica-operation-repository-constants.js:6 and
rebalance-coordinator-shared.js:139), already listed for its missing
owner_claim/permit columns.

### Fixture migration, bucket C (cache, admin): done
23 files green (admin files re-run after the fold settles: they import
active-node-projection.js). No production producer refused. Expectation
changes (justification: the stored nodes row has node_id / node_address, no
id / address column; NOT NULL columns can never be missing from a held row):
- `.id` -> `.node_id`, `.address` -> `.node_address`:
  system-table-cache.test.js:161-162,282,759,851,915;
  read-only-system-table-cache.test.js:61,62,131,152,178,246;
  system-cache-client.test.js:29,41,70,74;
  admin-websocket-api-live-query-and-observation.test.js:218.
- system-table-cache.test.js:338-341 (stale INSERT backfill): the held row's
  NOT NULL table_name/partition_key are kept; a new assertion shows the
  stale full row backfills the NULL nullable partition_transition_state.
- system-table-cache.test.js:632: stale nodes UPDATE backfill asserted on
  NULL nullable latency_group_id instead of NOT NULL memory_mb (vacuous now).
- system-table-cache.test.js:1108-1120 (getReadyNodes rejects missing
  node_id): the refusal moved to the insert boundary (the cache refuses a
  nodes row without node_id) and getReadyNodes returns []. Lead: judgment
  call, the old rejection site is unreachable.
- system-table-cache.test.js:730 (all tables): rows keyed by each table's
  primary key column.
- admin-websocket-api-diagnostics-and-control-snapshot.test.js:433:
  partitionGroupInFlight.unknown -> ['partition-1']: replica_operations
  partition_id is NOT NULL, the `unknown` bucket is unreachable for a stored
  row; in-flight fixtures carry Date.now() stamps and target node-3 (the
  placeholder updated_at=1 read as pre-restart, target node-2 collided with
  an active replica).
- cache-dump-completeness.property.test.js:207,
  cdc-event-broadcast-completeness.property.test.js:147,299,
  system-table-cache-consistency.property.test.js:383,
  cache-state-filtering.property.test.js:249: generated records are complete
  per-table rows keyed by the primary key; comparisons on non-column fields
  (name/status/value/updated_at on nodes) moved to stored columns or whole-row
  equality.
Non-column `updated_at` deliberately spread onto nodes rows in two cache
tests that exercise the cache's table-agnostic LWW by that field.

### Rulings 2 and 3: status (handover point)
A first fold agent built src/rebalancer/projected-replica.js (+ test) and
deleted the five normalisers across 40 src files (lint clean), then died on a
model rate limit without reporting. Its tree left 22 test files red (projected
replica refused at consumers stubbed with raw rows; decoder missing/unexpected
columns on hand-built rows). A second agent (opus) is finishing: verify every
former call site's HEAD-equivalence, fix fixtures, run all importers, measure.
Brief: scratchpad fold-finish-brief.md. Fixture fixes done by the lead outside
the buckets: partition-admitted-group-fixture.js,
message-group-native-w7-composition.js, message-group-native-custody-fixture.js
(found through cdc-source-occurrence-delivery and custody-handoff tests,
which do not call applySystemTableChange directly: the lab run must catch
the remaining indirect ones).

### Rulings 2 and 3: done (finishing agent's report, lead-reviewed)
Projected replica (ruling 2): src/rebalancer/projected-replica.js, frozen,
fields PROJECTED_REPLICA_FIELDS = replicaId serviceId serviceType partitionId
groupId nodeId status raftRole address createdAt stateEnteredAt
createAttemptToken previousState cleanupToken (camelCase, decoded values;
replicaId = stored replica_id, else service_id when NULL). Builders:
projectReplicaFromServicesRow(decodedFullRow), projectReplicasFromServicesRows
(decode then project), buildTerminalCreateTargetReplica({replicaId,
partitionId, nodeId}) (ACTIVE/FOLLOWER, ROW_ABSENT elsewhere),
projectReplicaAsTerminalCreateTarget, assertProjectedReplica. Witness
test/rebalancer/projected-replica.test.js (8). Producers: getCurrentReplicas /
getCurrentPartitionReplicasByPartitionId (readProjectedReplicas,
projectPriorityTerminalCreateTargets), inventory callers (topology guard,
priority budget admission, surplus-remove fence project their SELECT * rows),
census callers (admin snapshot, observation memo, candidate derivation).
Readers: move planner (state, move calculation, priority spread cure),
getHealthyReplicas, inventory classifyInventoryReplica (now the one owner of
live/active/occupied/voter), census readCensusReplica / selectCurrentVoter,
leader placement cure, node-event and control-plane readiness,
placement-owner-evidence, follow-up move.

Fold table (ruling 3; HEAD site -> producer -> outcome):
| normaliser | sites | outcome |
| --- | --- | --- |
| normalizeNodeRow | bootstrap-topology-snapshot.js:28; join-readiness-mesh-connectivity-methods.js:81,90; join-readiness-snapshot-methods.js:548,566; active-node-projection.js:89,328,394,499; membership-publication-candidate-derivation.js:230,419; unified-rebalancer-critical-topology-methods.js:85,176 | decodeNodesRow (full row: cache / planning / SELECT * / seed snapshot rows); active-node-projection.js:110 read readiness-service records (non-row) -> reads entry.nodeId |
| normalizeServiceRow | active-node-projection.js:148; priority-recovery-scheduling-owner-policy.js:83; readiness-planning-global-projection.js:245,341; readiness-planning-table-impact-classification.js:150,201,265; priority-placement-observation-memo.js:157; unified-rebalancer-follow-up-decision.js:709; unified-rebalancer-replica-state.js:279,296,315,412; user-table-leader-placement-cure.js:288,295,310 | decodeServicesRow full row; planning projection keeps the 9-field record (buildPlanningServiceRecord from the decoded row, isDeepStrictEqual reuse unchanged) and prefilters with the one-column decode decodeServicesRowColumn; replica-state / memo / follow-up / cure:310 read projected replicas; catch-returns-default readNormalizedServiceNodeId deleted |
| normalizeReplicaRow | replica-inventory.js:226 | reads projected replicas |
| normalizeCensusServiceRow | membership-publication-priority-partition-summary.js:439,495 | reads projected replicas |
| normalizeCurrentVoterServiceRow | current-priority-placement-observation.js:236 | reads projected replicas |
Leniency: two/three-spelling aliases served only HEAD's synthetic 7-key and
mixed re-spread rows (now projected replicas) and camelCase test rows; no
writer stores upper-case/padded values (writer census); '' / `|| 'active'`
defaults on service_id, node_id, status were unreachable (NOT NULL); where a
site now reads null instead of '', every comparison is a Set lookup,
truthiness or equality with a non-empty constant. service_type is no longer
lower-cased (writers use the lower-case SERVICE_TYPE constants).
Fold regressions the finishing agent found and fixed in src:
placement-owner-evidence.js normalizeCurrentReplicas read COLUMN.* from
projected replicas (every replica invalid); unified-rebalancer-follow-up-move.js
read snake aliases (replicaId '' -> ADD instead of REPLACE, 3 -> 4 replicas);
readiness-planning-global-projection.js decoded partitions rows as services
rows (refusal swallowed by F2 below; incremental path now SERVICES-only as
HEAD's effective behaviour) and decoded every row on the hot path (now a
one-column prefilter); new decodeSystemTableRowColumn
(system-table-row-decoding.js; exported as decodeServicesRowColumn).
Fixture value changes needing review (status values no writer stores ->
stored values of the same semantics): membership-swim-consume 'draining' ->
'stopped'; readiness-routing-heartbeat-window 'inactive' -> STOPPED;
join-readiness-startup-authority 'starting' -> 'recovering';
dt6-priority-recovery-add-dispatch-cadence 'stopping' -> 'removing';
dt6-operation-ledger-terminal-hold 'sending' -> 'pending';
count-aware-add-gate raft_role 'voter' -> NULL (both unknown to HEAD's
predicates). Expectation changes: cluster-health-diagnostics
transportState.rowState null -> 'connected' (NOT NULL connection_state);
admin-websocket-api:177 nodes[0].id -> .node_id; mg-fresh-identity vacuous
undefined===undefined check now compares node_id;
readiness-planning-semantic-generation probe getters on COLUMN.NODE_ID.
Local run: 307 importer/support-importer files: 301 green; reds
minimal-deployment-call-cell-invocation-live,
minimal-deployment-runtime-access-policy-live-validation,
membership-consistency.integration, failure-scenarios.integration,
durable-provisioning-job-owner-directed (same failure on the predecessor's
staged candidate; durable-provisioning = replica_operations wrong_type at
membership_publication_epoch, i.e. candidate-caused by round 1's decoder:
lead to classify against 95877e60b), and multi-node-cluster.integration (F1).

### Measured rows (round 2) and counts removed
| row | before round 2 | after | removed |
| --- | --- | --- | --- |
| system_table_raw_column_reads_outside_decoder | 1056 | 1008 | 48 (cap 1056 -> 1008) |
| ..._rebalancer | 140 | 116 | 24 |
| ..._control_plane | 391 | 367 | 24 |
| ..._node / _admin / _query / _partition | 322 / 128 / 56 / 19 | same | 0 |
| row_field_alias_reads | 745 | 741 | 4 (audit baseline + budget cap 745 -> 741) |
| state_read_defaults | 409 | 402 | 7 (audit baseline) |
| two_source_fallback_reads | 1781 | 1774 | 7 (audit baseline; budget row 1789 untouched) |
Since the seal (round 1 + 2): raw reads 1096 -> 1008 (88), alias 745 -> 741
(4), state defaults 413 -> 402 (11), two-source 1785 -> 1774 (11).
Group rows stay target-0 rows (not converted to caps): converting them would
make the six consumer quests' probes read "met"; the measured counts are the
table above (lead: deviation from the brief, say if a cap form is wanted).
catch_returns_default now prints 387 -> 386 (readNormalizedServiceNodeId
deleted) and was NOT applied (not one of the three rows named); test
duplication baseline tightened on its hint 648 -> 642 clones, 24259 -> 24011
lines.

### R17 findings added in round 2
- F1 (join core): bootstrap-join-admission-owner.js isNodeDead does
  Number(row.ready_lease_expires_at); Number(null) = 0 reads "lease expired",
  so any stored nodes row with a NULL lease (normal for SQL/CDC rows) admits a
  duplicate-id takeover; buildLeaseWindowRejoinConflict same. The
  multi-node-cluster integration test passed only because its fixture row
  lacked the key; with complete cache rows it is red. Owner decision (NULL =
  "no lease") -> join core. Test left red.
- F2: readiness-planning-semantic-generation.js (~523) catches every
  applyShadowTableChange error (decoder refusals included) and turns it into
  baseline invalidation -> control-plane consumer quest.
- F3: REPLICA_INVENTORY_ANOMALY_CODE.REPLICA_IDENTITY_UNAVAILABLE is
  unreachable now (projected replicas always carry identity) -> rebalancer.
- F4: remaining alias reads outside the fold:
  partition-boundary-representation.js:192 tableInfo.primary_key (not a
  column); follow-up-move readFollowUpText on operation records;
  priority-surplus-remove-placement-fence.js:20-50 raw owner-row aliases.
- F5: active-node-projection isCanonicallyActiveNode decodes serviceRows per
  call on its rare fallback branch.
- F6: two default-literal decoders already exist in src/cdc
  (cdc-integration-service-insert-normalization.js normalizeDefaultValue and
  cdc-sql-builder.js normalizeDefaultValueResult) beside the new
  resolveSystemTableColumnDefault at the DDL owner: fold both onto it -> cdc.
- F7: bootstrap admission peer hints (fixed here) were nodes rows the table
  could not hold; lead to confirm the not-reported values or move hints out of
  the nodes table.
- F8: a complete nodes row with a NULL lease and connection_state connected is
  an INVALID cluster member (projectClusterMembership); several tests passed
  only through the lenient "no status and no lease field" branch
  (node-liveness-semantic-projection.js:361) -> control-plane readiness owner
  should decide whether that branch is reachable for stored rows at all.
- F9: COLUMN.TABLE_NAME, COLUMN.PROTOCOL/HOST/PORT/PATH are referenced by
  tests but do not exist (fixtures keyed `undefined`) -> test owners.

### Lab run 1 (snapshot refs/wip/nav-decoders-0001 = 1921f6520, tree = the
staged tree before two lint-only refactors; --base-sha 95877e60b)
- ordinary (carinas-windows): 1495 files, 1388 pass, 107 fail.
- exclusive (adams-gamla): 80 files, 63 pass, 17 fail.
- bootstrap (carinas-windows): did not run (exit 98: lock held by our own
  ordinary lane); re-launched with external-toolchain after it.
- 126 red files (list scratchpad lab-red.txt). Top causes: decoder
  missing_column on hand-built rows (services group_id 17, nodes
  node_address 16, replica_operations membership_publication_epoch 16, ...),
  projected replica refused 10, cache insert refused 3, assertion/timeout
  remainder. Indirect cache/decoder users the local census could not see.
  Three opus agents classify (fixture / production / base-red on a base
  worktree at 95877e60b / host-timing) and fix; reruns follow.
Note: a mistaken `ln -s` while creating the base worktree briefly created
/mnt/data/peter/projects/lagrange/node_modules/node_modules (a symlink loop);
removed at once. The scratch dir `scratchpad/base` (another session's tree)
had its test metadata refreshed by mistake.

### Lab reds, bucket 01 (43 files, test/rebalancer): all fixture, all green
Each file's pass count now equals its count at base 95877e60b; no src
change; no base-red; no host/timing. Causes: partial/camelCase/impossible
stored rows, raw rows where projected replicas are required, stale
positional INSERT fakes (now buildInsertedReplicaOperationRow), positional
UPDATE fakes that wrote the owner-lease touch's timestamp into `status`
(HEAD unnoticed; guarded to the status-first transition UPDATE). Shared
helper fix test/rebalancer/test-helpers.js syncReplicaOperationRow: checks
the operation id before completion (the round-1 helper minted a phantom
'operation-1' row for id-less writes; HEAD dropped them); 129 importers
green. Expectation change: priority-recovery-snapshot-handoff-timeout-
reentry-test-cases.js:1572 latestOperationStatus 'retry_deferred' ->
'pending' (retry_deferred is outside the stored status domain, no writer
stores it; the row is PENDING). Field-spelling reads of projected replicas
(same values): pending-move-tracking.property:327,424,435,508,581,658,444,
516,594-595; runtime-service-entity:345,346,375,399;
runtime-service-replace-canonical-target-handoff:357. Fixture-domain
corrections: raft_role 'voter' -> 'follower', 'stopping' -> 'removing',
'in_progress' -> 'creating', undefined FAILED status -> ReplicaStatus.FAILED,
ACTIVE partition services rows given raft_role follower. Notable: in
spread-cure-at-target-minting-gap a swallowed "nodes row refused" had made
the "ZERO add-like moves" test pass without planning (fixed fixture).
Findings (test support): reservation-dispatch-gate-test-harness.js
updateOperationRow still unguarded positional (swallowed wrong_type refusal);
replace-real-group-harness.js serviceRow and test-helpers.js
buildSpreadScenarioHelpers still emit partial rows.

### Lab reds, bucket 02 (39 files): 27 fixture (green), 6 base-red, 4 host/timing, 2 runner artifacts
No src change, no production producer refused. Fixtures: mock caches
(unified-rebalancer-test-support.js createMockCache and two local copies)
store builder rows; new projectTestReplicas(rows, partitionId) for planner
calls; message-group-learner-join-fixture.js and
transaction-coordinator-group-fixture.js (shared test-helpers; all importers
green) complete their rows; message-group-operation-routing uses
buildInsertedReplicaOperationRow. Expectation changes (spelling only):
unified-rebalancer-node-readiness-replica-state.test.js:804-805,
unified-rebalancer-replica-state-management-node-state-change.test.js:209,974
`replica_id` -> `replicaId`. Fixture inputs: nodes status 'warming' ->
JOINING (no writer stores 'warming'; HEAD classed it transitional), raft_role
'voter' -> 'follower'.
Base-red at 95877e60b (same failing subtest, same counts):
create-table-partition-provisioning (:186 timeout),
critical-replica-placement-causal-trace (:301 timeout; cand 8/1, base 7/1),
leader-metadata-validation (:621), managed-split-admission-reliability
(:563), node-join-replica-activation (:492/:609), seed-node-bootstrap
(:381/:438).
Host/timing (green locally on both): message-group-fresh-identity-replacement
4.6 s vs 4.2 s, preflight-critical-path-hops 28.1 vs 29.4 s,
single-node-default-replica-count-writes 13.8 vs 14.3 s,
three-node-seed-rebalance cand 5/6 (one teardown hang at 41 s under
concurrent local load, no refusals) vs base 3/3.
Runner artifacts: test-output/tap-timeout-fixtures/run-*/echo-timeout.test.js
(temporary fixtures of test-timeout-declarations.test.js the lab collected).
Finding: hasMultipleReplicasOnSameNode (move-planner-state-methods.js:229),
isCriticalState / isSuboptimalState do not assertProjectedReplica; raw rows
silently read nodeId undefined (some tests passed vacuously before) ->
rebalancer consumer quest.

### Lab reds, bucket 00 (44 files): 41 fixture (green), 3 host/timing, 1 src defect fixed by the lead
No base-red (durable-provisioning-job-owner-directed: fixture, green 32/0 as
at base: its fake gateway stored `undefined` from UPDATE data; SQL stores
NULL). Shared support edits (all importers green): readiness-planning-
formation-rig.js, reservation-dispatch-gate-test-harness.js (now uses
buildInsertedReplicaOperationRow), unknown-outcome-surface-fixture.js,
lease-liveness-decision-grid.js (golden differential byte-identical),
participant-release-query-engine-fixture.js, cdc-cache-delete-resurrection-
scenario.js, membership-publication-coordinator-* and
priority-recovery-snapshot-* case files.
Expectation changes: readiness-planning-deferral-bounded.test.js:76
SEALED_RIG_HEAVY_BUILDS 585 -> 540; readiness-planning-snapshot-identity-
owner.test.js:78 AFTER_HEAVY_BUILDS 585 -> 540, :84 AFTER_GATE_BUILDS 3184 ->
3104. Justification: the rig's fake cache notified listeners with the
partial change row; the real SystemTableCache notifies the stored merged row
on UPDATE (at base too, recordForNotification = table.get(key)); with the
stored row an updated_at-only services update is semantically equal and
reused (fewer builds). Re-run twice, stable. system-cache-query-service
.test.js:119,140,169,285 `.id` -> `.node_id` (stored column).
Host/timing (green locally on both, s cand vs base):
message-group-native-provisional-route 5.7 vs 6.0;
q10-postgres-compatibility-certification-matrix 1.3 vs 1.3;
single-path-partition-cutover 14.4 vs 15.8.
src fix (lead, forced by the honest fixture): SystemCacheQueryService
getPartitions({tableId}) filtered `p.tableId` and getTables({tableName})
`t.name`, names no stored row has (always empty on real cache rows; the
camelCase fixture hid it). Now reads COLUMN.TABLE_ID / 'table_name'
(file-local constant: COLUMN has no TABLE_NAME, see F9). 36/0.
Finding: buildReplicaOperationUpdateData
(replica-operation-repository-mutation-row-methods.js:106) passes undefined
for nullable columns; any path applying that object to a held row directly
would store undefined (decoder refuses) -> rebalancer repository.

### Lab reds, bootstrap lane (12 files): 10 fixture (green), 2 host/timing
No src change, no production producer, no base-red. Expectation change:
bootstrap-api-admission-snapshots.test.js:1016/:1040 the expected snapshot
row is the complete stored nodes row (the snapshot passes what the cache
holds). Generator inputs moved to stored names/domains (nodes/services
'inactive' -> 'stopped', replica_operations operation_type -> type and
statuses pending/active/failed, partitions key_range_* ->
partition_key_*, tables schema -> schema_definition) in
bootstrap-response-completeness.property and cache-hydration-correctness
.property (row-count properties). Host/timing (green on both):
return-value-completeness.property 24.1 s vs base 25.1 s;
seed-release-failure-custody 38.6 s vs 40.5 s.
cdc-source-occurrence-delivery was fixed before this lane's verdict
(fixture helpers), local 2/0 6.3 s vs base 5.7 s.
External-toolchain lane on snapshot 0001 refused before running
(MODULAR PROOF NOT SAFE: observation census drifted from the committed
manifest; the next snapshot carries refreshed metadata).

## round 2 closeout (2026-11-09, closing agent)

Start: worktree HEAD 730225bf1, candidate staged (415 files), working tree
equal to the index, index tree d205aad88 = lab run 2 snapshot fbd7373b4
(refs/wip/nav-decoders-0133). No foreign edits found (git status showed only
staged paths at start and at every later check), so no patch was saved.
Note: scratchpad/closeout/ belongs to another session (nav-partition), not
to this quest.

### Inventory against the lead rulings (1)-(7)
| ruling | state | implementation | witnesses |
| --- | --- | --- | --- |
| (1) cache holds complete rows | done (round 2) | `completeInsertedSystemTableRow` (src/cache/system-table-cache-row-completion.js) at the three stores of a key the cache does not hold (INSERT, UPDATE of a missing key, UPSERT of a missing key; system-table-cache.js:355/366/398); DDL default resolver `resolveSystemTableColumnDefault` (system-table-schema-sql.js); merges onto a held row unchanged | test/cache/system-table-cache-row-completion.test.js (5 tests: every table vs better-sqlite3's stored row; INSERT/UPSERT/UPDATE of a new key; NOT NULL-without-DEFAULT omission refused, cache unchanged; merge keeps held values; provenance passes through) |
| (1) seeders | done | seeder table under "Seeders (ruling 1)" above: joiner nodes seed and priority services seed complete without a defect (the omitted columns have DEFAULTs or are nullable); bootstrap admission peer hints fixed at the seeder (F7, lead to confirm the not-reported values) | same test file; bootstrap-request-owner tests |
| (2) projected replica | done | src/rebalancer/projected-replica.js (14 fields, frozen, one spelling); getCurrentReplicas / readProjectedReplicas (unified-rebalancer-replica-state.js:276-324) return it; 12 call sites read named fields (priority-readiness:384, node-event:209, move-planner-state:746/841, rebalance-loop:244, planning-gate:198, evaluation:34, placement-tail:131, control-plane-readiness:317, leader-placement-cure:302, plus the inventory and census callers listed in "Rulings 2 and 3: done") | test/rebalancer/projected-replica.test.js (8) |
| (3) decoders ignore exactly SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES | done; pin ADDED in this closeout | system-table-row-decoding.js:236 reads the single declaration in cache-constants.js | NEW test 'the decoders ignore exactly SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES' (system-table-row-decoders.test.js): pins the five names, each ignored on all three tables, an undeclared non-column key refused (`unexpected_column`). The round-2 test only covered two of the five names and did not pin the list. 22/22 |
| (4) expectation changes | done (round 1 list 1-4) | see "Test expectation changes (HEAD justification)" | as listed |
| (5) fold list narrowed | done | readOperationWorkflowRecord, normalizeOperationProgressRecord, normalizePublicationOperationWorkflowRecord untouched; normalizeReplicaOperationRecord and replica-operation-progress.js readers untouched (rebalancer consumer quest) | grep: all still present, unchanged |
| (6) partial rows from older processes refuse | accepted, nothing to build | | |
| (7) `control_plane` row spelling | FINISHED in this closeout | budget/detector already used `..._control_plane`; this closeout fixed the consumer quest record solve/quests/system-table-decoded-reads-control-plane/quest.json probe row (`..._control-plane` -> `..._control_plane`; that quest is not sealed) and removed the stream's seven superseded "measured at the land of system-table-row-decoders" planned rows from the epic table (they duplicated the measured rows the candidate added, one spelled `control-plane`) | `--json --rows system_table_raw_column_reads_outside_decoder_control_plane` = 367; no `decoder_control-plane` left in solve/ scripts/ docs/ src/ test/ |
| services/nodes normaliser fold | done (round 2) | normalizeServiceRow, normalizeNodeRow, normalizeReplicaRow, normalizeCensusServiceRow, normalizeCurrentVoterServiceRow: 0 definitions and 0 call sites in src/ (fold table under "Rulings 2 and 3: done"). test/distributed/harness/playback-recorder.js has its own local `normalizeServiceRow` over recorded HTTP responses (unchanged since HEAD, not a stored-row decoder, out of scope) | |
| 9-field planning record | preserved | buildPlanningServiceRecord (readiness-planning-global-projection.js:128) yields exactly HEAD's nine fields (serviceId serviceType nodeId partitionId groupId replicaId raftRole status address) from the decoded row; isDeepStrictEqual reuse unchanged | readiness-planning-semantic-generation / deferral-bounded / snapshot-identity tests |

### Fixture defects fixed in this closeout (lab run 2 and local runs)
All are stored-row shapes the table cannot hold; HEAD tolerated them because
the cache stored whatever it was given and nothing decoded it:
- test/integration/preflight-critical-path-hops.integration.test.js:351: the
  forwarded synthetic nodes UPDATE spread a non-column `updated_at` (nodes has
  none); the stored row then made every whole-table nodes decode refuse
  (lab run 2 not ok 8). Removed. Local 81/0 (30 s).
- test/integration/managed-split-admission-reliability.integration.test.js:835:
  the stubbed authoritative nodes row carried `updated_at`; real SELECT * never
  returns it. Removed. Local cand 43/0 (58 s), base 43/0 (50 s).
- test/integration/failure-scenarios.integration.test.js: its fake
  `createCacheBackedControlPlaneGateway` applied raw mutation data to the cache;
  FailureDetector's UPDATEs carry `failed_at` / `recovered_at` / `updated_at`
  (no nodes columns), so the cache row gained them and the rebalancer /
  heartbeat logged decoder refusals (test still passed). The fake now filters
  through `filterDataForTable` exactly as the production CDC path does before
  the SQL (cdc-integration-service-mutation-operations.js:380). Local 57/0, 0
  refusals.

### Measured rows (closeout) and caps
| row | seal (730225bf1) | now | cap/target | removed since seal |
| --- | --- | --- | --- | --- |
| formation_system_tables_without_decoder (probe) | 3 | 0 | 0 | 3 |
| system_table_raw_column_reads_outside_decoder | 1096 | 1008 | cap 1008 | 88 |
| ..._rebalancer | 180 | 116 | 0 | 64 |
| ..._control_plane | 391 | 367 | 0 | 24 |
| ..._node / _admin / _query / _partition | 322 / 128 / 56 / 19 | same | 0 | 0 |
| row_field_alias_reads | 745 | 741 | cap 741 (budget + audit baseline) | 4 |
| state_read_defaults | 413 | 402 | audit baseline 402 (budget target 0) | 11 |
| two_source_fallback_reads | 1789 (audit) / 1785 measured | 1774 | audit baseline 1774; budget cap 1789 kept | 11 |
| catch_returns_default | 387 | 386 | audit baseline 387 -> 386 TIGHTENED in this closeout (checker hint; the one removed entry is readNormalizedServiceNodeId); budget cap 387 kept | 1 |
two_source_fallback_reads and catch_returns_default budget caps are
fallback-census rows (CENSUS_ROWS in code-navigability-budget.js, bound to
data/fallback-census/census.json, owned by the fallback-census quest), so
they are not re-capped here. The navigability checker also prints tighten
hints for owner_port_feature_detection 2124->2020, inheritance_depth_over_two
65->58, typeof_dual_paths 621->596, alias_exports 40->38: not changed by this
quest (no site of these patterns removed here), left to their owners.

### Local runs (closeout)
- Every staged test file (272: 261 non-integration in 9 batches of 30 at
  concurrency 4, thermal gate between batches; 11 test/integration files one
  at a time): all green, 0 fail (scratchpad r2close/summary.txt).
- Plain `node --test` caps a tap file at 30 s; the first local comparison of
  the exclusive reds was invalid for that reason and was re-run with
  TAP_TIMEOUT=300 on both sides.

### Lab run 2 classification (snapshot fbd7373b4, base 95877e60b)
Base runs were made on the same hosts at an unmodified 95877e60b tree, through
cone commits whose parent lacks the red files (refs/wip/nav-decoders-base-*),
launched from a clean base checkout (the selector reads the invoking checkout,
so a launch from the candidate worktree widens the cone).
Run 2 totals: ordinary (carinas-windows) 1495 files 3 red + 2 runner
artifacts; bootstrap (carinas-windows) 219 files 3 red; external-toolchain
1/1; exclusive (adams-gamla) 80 files 10 red. Re-runs: fresh snapshots
29bd03971 (refs/wip/nav-decoders-0640) and bbc9f23e6
(refs/wip/nav-decoders-0730; final tree minus this notes section).
| file | lane/host | class | evidence |
| --- | --- | --- | --- |
| q10-postgres-compatibility-certification-matrix | ordinary / carinas | base-red | base 95877e60b on carinas: same `not ok 1 - certifies all 12 dimensions`, 11 assertions both |
| message-group-native-provisional-route | ordinary / carinas | base-red | base on carinas: same `not ok 1 - SERVICES scan releases provisional relay`, 1 assertion both |
| raft-rs-backend/single-path-partition-cutover | ordinary / carinas | base-red | base on carinas: same `not ok 1 - seed bootstraps and serves a write`, 5 assertions both |
| test-output/tap-timeout-fixtures/run-*/echo-timeout.test.js (x2) | ordinary / carinas | runner artifact | temporary fixtures of test-timeout-declarations.test.js collected by the lab; not repository files |
| return-value-completeness.property | bootstrap / carinas | base-red | base on carinas: same `timeout!`, 50 assertions, 132139 vs 132151 ms |
| seed-release-failure-custody | bootstrap / carinas | base-red | base on carinas: same `not ok 3 - retained origin reaches the actual startup admission frontier`, 4 assertions |
| cdc-source-occurrence-delivery (W9) | bootstrap / carinas | OPEN: candidate-correlated timing (F12) | W9 counts COMMITTED targets right after the withheld-65th drive returns HELD (expects 64). carinas: candidate red 3/5 (56, 56, 63 !== 64; lab run 2, full-lane re-run, narrow run 1) and green 2/5 at 13.3-13.6 s; base green 4/4 at 12.0 s (6-file cone once, single-file cone three times). Local: candidate green 7/8 plus one 600 s hang with no TAP output; base green 5/5. CPU profile (local, one run each): candidate 851 ms in cache.get deep clones from observedServiceRoute/buildSafeTargets vs base 85 ms; the cause is the fixture's complete (production-shaped) services rows, not a src change on this path. Not fixed: the options are a cdc/message-group change (no per-target clone in buildSafeTargets) or a W9 change (await in-flight targets before counting); both are outside this quest -> lead |
| create-table-partition-provisioning | exclusive / gamla | base-red | base on gamla: same `seed bootstrap should succeed`, 4 assertions |
| critical-replica-placement-causal-trace | exclusive / gamla | base-red | base on gamla: same `seed bootstrap succeeds`, 31 assertions |
| leader-metadata-validation | exclusive / gamla | base-red | base on gamla: same `timeout!`, 23 assertions |
| seed-node-bootstrap | exclusive / gamla | base-red | base on gamla: same `not ok 2 - timeout!`, 109 assertions |
| single-node-default-replica-count-writes | exclusive / gamla | base-red | base on gamla: same `seed bootstrap should succeed`, 3 assertions |
| three-node-seed-rebalance | exclusive / gamla | base-red | base on gamla: same `seed bootstrap should succeed`, 11 assertions |
| managed-split-admission-reliability | exclusive / gamla | candidate fixture (fixed) + base-red | subtest 4 hit the stubbed authoritative nodes row with non-column `updated_at` (decoder refusal after the file summary): fixed. Remaining red is base: `Failed to start partition split replication on source partition` on gamla at base too (33 assertions both in the narrow re-run). Local cand 43/0, base 43/0 |
| preflight-critical-path-hops | exclusive / gamla | candidate fixture (fixed); then host/timing | `nodes row refused: unexpected_column at updated_at`: fixture fixed. Fresh-snapshot full-lane re-run: killed at 132 s in teardown after subtest 7 with no refusal; narrow re-run green (85 assertions, 87 s); base on gamla green 72.8 s; local cand 81/0 30 s |
| managed-split-writes-after-cutover | exclusive / gamla | host/timing | candidate green on the fresh-snapshot re-run on gamla (12 assertions, 90 s); base red on gamla (different failure); local cand 11/0 (53/70/98 s) vs base 11/0 (33/93/165 s) |
| membership-consistency | exclusive / gamla | host/timing | candidate green on gamla 2/2 re-runs (110 assertions, 240/233 s); base green on gamla; local 93/0 both (78 vs 92 s) |
| (re-run only) failure-scenarios | exclusive / gamla | host/timing (180 s cap) | candidate red at 184.7 s once, green at 178.5 s once; base red at 183.3 s on gamla; local 57/0 both (66 vs 65 s) |
| (re-run only) control-plane-rebalance | exclusive / gamla | host/timing | candidate red 2/5 on gamla (`got PENDING` after a 1500 ms window), only in multi-file lanes; single-file cones: candidate 2/2 (32.6, 32.3 s), base 3/3 (32.3, 32.5, 34.2 s); local cand 3/3 (12-14 s) vs base 3/3 (12-19 s) |
Outside lab run 2's cone (found by round 2 locally; compared here cand vs
base at TAP_TIMEOUT=300): failure-scenarios 57/0 both; multi-node-cluster
cand 27/1, base 28/0 (F1, OPEN, lead decision);
minimal-deployment-call-cell-invocation-live and
minimal-deployment-runtime-access-policy-live-validation: base-red (same
subtest red on both sides locally).

### R17 findings added in this closeout
- F10 (cache owner): completion and merges pass through any non-column key,
  not only the declared local provenance; the key is refused only when a
  reader decodes, at which point ONE such row makes every whole-table decode
  of that table refuse (membership reconcile tick, rebalance check, heartbeat).
  All three cases found were test fakes; production write paths filter to the
  schema (filterDataForTable). Refusing undeclared keys at the cache boundary
  would surface a writer defect at the writer -> cache owner / lead.
- F11 (node owner): FailureDetector handleNodeFailure / handleNodeRecovery
  (failure-detector.js:361-372, 418-427) write `failed_at`, `recovered_at`,
  `updated_at`, none of them nodes columns: the SQL path drops them, so the
  readers `node.failed_at` (downtime), `node.recovered_at`
  (failure-detector-control-plane-guards.js:32, node-reintegration-service.js:59,
  321, 478) read undefined on every real row; buildObservedNodeWhereClause's
  recovered_at guard can never engage -> node consumer quest.
- F12 (cdc owner, performance): `observedServiceRoute`
  (cdc-group-propagation-routing.js:67) calls cache.get per target inside
  buildSafeTargets on every progress check, and cache.get deep-clones the row;
  with production-shaped (complete) services rows that clone is 851 ms of a
  6.6 s W9 run locally (HEAD's 7-key fixture rows hid it: 85 ms). This is
  the mechanism behind the W9 timing finding below -> cdc / message-group.
- F1 status: unchanged and still the one red the candidate causes locally
  (multi-node-cluster 'rejects duplicate node ID from cache': cand 27/1,
  base 28/0). Precise mechanism: the joiner's registration INSERT
  (buildNodeRegistrationRow, status JOINING) carries no
  ready_lease_expires_at; at HEAD the cache row lacked the key, so the cache
  fallback in resolveExistingRowTakeoverDecision (used when the authoritative
  read is unavailable) read Number(undefined) = NaN = "live" -> terminal
  "already registered"; the candidate's complete row holds NULL ->
  Number(null) = 0 -> "dead" -> takeover admitted. The authoritative path
  (preferred when available) already read NULL -> admitted at HEAD, contrary
  to the contract comment at bootstrap-join-admission-owner.js:337 ("a row
  live for any OTHER reason (live status, no lease) stays terminal"). So the
  candidate moves the cache fallback onto the authoritative path's
  behaviour. NOT fixed: treating NULL as "no lease" (two lines in isNodeDead /
  buildLeaseWindowRejoinConflict) changes the join-core contract on the
  authoritative path (a node that crashed mid-join and restarts at a new
  address with the same id would then be refused) -> LEAD DECISION
  (join core). The test stays red until then; it is outside lab run 2's
  change cone, so neither the lab run nor the land selector ran it.

### Cheap checks (final staged tree)
On the final staged tree (before this notes append): node --check on all
403 added/modified .js/.mjs/.cjs: 0 failures; eslint on the same files: exit 0
(0 errors; 11 "file ignored" warnings for ignore-pattern test-case files);
`LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit`: exit 0 (scoped
complexity list printed for touched files, informational); `npm run
test:duplication`: exit 0 (src+scripts 42/42 groups 1331/1331 lines, test
639/639 groups 23859/23859 lines, no hint); `npm run
audit:guideline:navigability`: exit 0 (0 new violations; catch_returns_default
tightened on its hint, other hints listed above); `npm run audit:file-size`:
exit 0; `npm run test:metadata:refresh`: exit 0 (impact-graph-seal.json
re-staged twice: new imports in the decoder test and failure-scenarios);
`node scripts/solve.js probe --id system-table-row-decoders`: metric 0 target 0
done=true (exit 0; read-only, log unchanged).

### Verifier's model (round 2 + closeout, what to re-derive)
1. Ruling 1: completion = SQL's stored row for every system table (the
   better-sqlite3 differential test); omission of a NOT NULL-without-DEFAULT
   column refused with the cache unchanged; merges onto held rows keep held
   values; the three hook sites are exactly the stores of an unheld key.
2. Ruling 2: getCurrentReplicas returns only projected replicas; no consumer
   reads a stored spelling from one; replicaId derivation (replica_id else
   service_id) equals HEAD's alias chain for every stored row shape.
3. Ruling 3: the pin test above; the decoder's only exception is
   SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES.
4. Fold: each former call site's HEAD value equals the decoded/projected
   value for a stored row (fold table above); the 9-field planning record is
   byte-equal to HEAD's normaliser output for lower-case stored values.
5. Rows: recount 1096 at 730225bf1 and 1008 now; groups sum to the overall
   row; catch_returns_default baseline entry removed is exactly
   readNormalizedServiceNodeId.
6. Every expectation change: the lists in round 1, buckets A/B/C/E, lab
   buckets 00/01/02/bootstrap and this closeout, each against HEAD with a
   production-shaped fixture.
7. Open items for the lead: F1 (join core), the W9 timing finding (F12),
   F7 values, F10.

### round 2 F1/F12 resolution (2026-11-09, resolving agent)

Scope: the two open reds under the lead rulings of 2026-11-09 (log, last
decision finding). Start: HEAD 730225bf1, candidate staged (420 files). No
solve start/note/land, no commit, no push. Lab snapshot commits (refs only,
never on a branch): refs/wip/nav-decoders-f12-c1 f80eab798e27 (candidate +
F1), -c2 dc6742e7136c (+ W9 harness), -c3 647e46bbb378 (scratch: c2 with W9
registered 10 times at port offsets), -c4 b85f714c0864 (+ shared node read,
dt6 fixture; = the final staged tree), -c5 488154ab78e2 (scratch: c4 with W9
x10). The x10 form is a lab-only scratch file, never staged.

#### F1: isNodeDead cache fallback (join core)

Change (src/bootstrap/owners/bootstrap-join-admission-owner.js):
`isCachedNodeRowDead(row)` reads a cache row whose `ready_lease_expires_at`
is the decoded absent value ROW_ABSENT (SQL NULL, what a schema-complete
cache row now holds where HEAD's partial row had no key) as HEAD read the
missing field, "no lease": live unless the status is terminal. Otherwise it
delegates to the unchanged `isNodeDead`. `isExistingNodeRowDead(row,
authoritative)` chooses: the authoritative row keeps `isNodeDead` (NULL ->
Number(null) = 0 -> expired, unchanged); the cache fallback (authoritative
read unavailable) uses `isCachedNodeRowDead`. The same mapping is applied at
the address-claim sweep (`resolveAddressClaimTakeoverDecision`), the other
cache-only `isNodeDead` read: there HEAD's freshly registered JOINING row
(no lease key) held its address, and without the mapping the candidate
would have let a second node take a live node's address. The lease-window
conflict (`buildLeaseWindowRejoinConflict`) needs no change: Number(null) = 0
gives retryAfterMs <= 0 -> no lease window, which is HEAD's result for the
missing field.

Witnesses (test/bootstrap/bootstrap-api-rejoin.test.js, 3 new tests):
- cache fallback: live JOINING row with an absent lease, changed address ->
  terminal "already registered" (HEAD's decision);
- address-claim sweep: another node's live row with an absent lease at the
  requested address -> "already in use";
- authoritative path unchanged: the same row read authoritatively admits
  (NULL reads as expired) - pins the divergence below.
With the src change reverted to the staged version: 15/17 (the first two
fail); with it: 17/17. test/integration/multi-node-cluster.integration.test.js:
candidate 28/28, base (HEAD worktree) 28/28.

R17 finding for the join-core owner (bootstrap join admission):
1. The authoritative path and the cache fallback decide differently for the
   same stored state (live status, ready lease NULL): authoritative -> dead
   (takeover admitted), cache -> live (terminal conflict). The contract
   comment at bootstrap-join-admission-owner.js:337 ("a row live for any
   OTHER reason (live status, no lease) stays terminal") matches the cache
   decision, not the authoritative one. This predates the decoders (HEAD's
   authoritative SELECT * already returned NULL). Not resolved here (ruling).
2. HEAD's cache itself had two decisions for that state: a row whose writer
   omitted the key (buildNodeRegistrationRow, the joiner's registration
   INSERT) read live; a row whose writer stored NULL explicitly read dead
   (writers storing NULL: buildReentryNormalizedNodeRow in
   node-registration-owner-durable-rejoin-methods.js:76 (status JOINING or
   the reusable persisted status), the joiner's own cache seed at
   node-registration-owner.js:158, the failed-join withdrawal at
   node-registration-owner-publication-methods.js:592 (STOPPED, terminal
   anyway)). With schema-complete rows the two are one state, and the ruling
   maps it to the missing-key decision. Residual behaviour change, cache
   fallback only (authoritative read unavailable): a changed-address rejoin
   against a non-terminal row whose lease was explicitly cleared (a durable
   rejoin reentry row) is now the terminal "already registered" where HEAD
   admitted. Lead / join-core owner to confirm; the owner's single decision
   for "live status, no lease" resolves both 1 and 2.

#### F12: W9 (cdc-source-occurrence-delivery, 64 committed after HELD)

Classification, two parts:
(a) "the drive returns HELD implies all 64 targets committed" is NOT a
production guarantee; target commit is eventual across drives -> harness
observes the settled state (below).
(b) the slower first pass also exposes a real production race (an orphaned
promise rejection when the invocation budget expires at a dispatch
boundary, below): with the harness change alone W9 was 9/10 on carinas, the
10th failing on that unhandled rejection. Per the instruction that branch
writes a fix-quest candidate and removes the per-target clone if that is
provably behaviour-unchanged and restores W9: done, W9 10/10 on carinas.

Trace (src):
- partition-cdc-obligation-delivery.js deliverObligation awaits each
  subscriber's `deliverCDCEventToSubscriber`; an UNCOVERED answer throws
  (throwUncoveredObligationError) and driveOneObligation's catch returns
  handleDeliveryFailure -> DRIVE.HELD_BY_SUBSCRIBER. HELD therefore means
  only "this invocation ended with the obligation owed".
- The subscriber's wave (topology/cdc-group-propagation-durable-delivery.js
  propagateDurableCdcEvent -> deliverToTargetsWithRetry ->
  deliverUncoveredLeaves) visits uncovered leaves serially, one delivery at
  a time, and every step asserts the invocation
  (cdc/cdc-delivery-invocation.js beginCdcDeliveryInvocation: budget
  min(messageGroup.deliveryTimeoutMs = 5000, transport.messageTimeoutMs =
  5000) ms, assertCurrent retires on expiry). The wave stops on budget
  expiry, on attempts exhausted, or on INSUFFICIENT_DURATION before a retry
  wait, whether or not the pass reached every target.
- Coverage is retained: throwUncoveredObligationError clears
  lane.currentObligation only when the cell is no longer current;
  prepareCdcObligationProgress (partition-cdc-obligation-progress.js) reuses
  the cell for the same event binding; observe() keeps a COMMITTED receipt as
  a fact of its group and refreshCdcPropagationRoutes never discharges it;
  nextUncoveredLeaf skips covered leaves. The next drive continues from the
  receipts; the obligation is acknowledged only when every leaf is covered.
- With the 65th withheld the wave always runs until its budget or attempts
  are spent (the 65th never covers), so whether the first drive reaches all
  64 is a race between the first pass and the 5 s budget: carinas (x1.6-1.7)
  lost it 3/5 times (56, 56, 63) once the per-check cost below grew.

Demonstration (scratch copy of the file, never staged:
scratchpad/r2f12/zz-w9-budget-demo.integration.test.js.txt, budget lowered by
config): first HELD at 22, 23 (1000 ms), 33, 34 (1500 ms), 45 (2000 ms),
55 (2500 ms) committed; re-driving with the 65th still withheld reached 64 in
2-4 drives, every drive HELD, undelivered, same cell, no receipt lost.

Harness change (test/bootstrap/cdc-source-occurrence-delivery.integration.test.js,
W9 negative half): drive while each withheld drive adds receipts, asserting
on every drive HELD_BY_SUBSCRIBER, `delivered === false`, the same progress
cell, and strictly more committed receipts; then (unchanged) 65 targets, 64
COMMITTED, the 65th UNCOVERED, and the positive half (DRAINED, window <= 2,
every target holds the row, ACK reclaims). The property is not weakened: the
withheld 65th must keep the wave incomplete with zero ACKs and the other 64
must complete and be retained - now asserted on every drive, plus receipt
retention across drives, which the single-drive form never checked. A
regression that stops adding receipts fails on the strict-progress assert.

Results, harness change only (c2/c3): local W9 file 10/10 (2/2 each,
6.6-6.8 s); carinas-windows c3 (W9 x10 in one file): 9/10, rep 4
failureType unhandledRejection `cdc_committed_acceptance_unknown` (stack
invocationError <- retire <- assertCurrent <- ownChild <- run <-
deliverTarget), file 70.6 s.
Results with the clone removal (c4/c5, the staged tree): carinas-windows c5
W9 x10 11/11 subtests (W1 + 10 W9 reps) green, file 50.9 s; the same lab
run's whole bootstrap lane 217/219, the two reds return-value-completeness
(timeout!, 132 s) and seed-release-failure-custody (subtest 3), both
classified base-red on carinas in the closeout table above. Local W9 file
10/10 on the staged tree (6.3-13.5 s, machine shared).

Per-target clone cost, R17 performance finding for the CDC / message-group
owner: every progress check
(bindCdcPropagationProgress.assertCurrent, called by next / observe /
result / refreshRoutes, i.e. about three times per leaf per pass) runs
cdcPropagationProgressCurrent -> captureDurablePropagationPlan ->
buildSafeTargets -> observedServiceRoute, which calls
systemTableCache.get(NODES, ...) per target: a full deep clone of the nodes
row to read one primitive (boot_incarnation). That is O(targets^2) row
clones per pass. CPU profile of one local W9 run (scratchpad/r2close/
prof-cand, prof-base): fastJsonClone under observedServiceRoute 860 ms of
6.57 s (candidate, production-shaped complete rows) vs 80 ms of 6.36 s
(HEAD, 7-key fixture rows); cdcPropagationProgressCurrent inclusive 1647 ms
vs 724 ms. Production rows are complete, so production pays the candidate's
figure today. Change made (src/topology/cdc-group-propagation-routing.js
observedServiceRoute): the per-target node read is `getShared` (the cache's
existing no-clone frozen view, the same readView filter/getAll already
return for every row) instead of `get` (deep clone). Behaviour-unchanged:
the function copies one primitive (boot_incarnation) into the route and
never retains or writes the row; its callers (buildSafeTargets,
buildGroupedContext) receive only the route object. Freezing the stored row
is not new: filter/getAll already deep-freeze every stored row they return,
nodes rows included (e.g. the address-claim sweep's getAll). Witness
test/topology/cdc-group-propagation-routing-shared-node-read.test.js (real
SystemTableCache, production-shaped rows): shared-read engagements = one
per services row + one per target node (fails 7/8 with the read reverted to
get: only the services reads), targets hold only primitives, the shared row
is frozen, the stored row is unchanged, mutating a returned target cannot
reach the cache, values equal a cloned read. Two hand fakes gained
`getShared` (test/topology/cdc-group-propagation-service-harness.js,
test/test-helpers/cdc-topology-progress-fixture.js). Profile after the
change (one local run, scratchpad/r2f12/prof-fix): fastJsonClone under
observedServiceRoute 0.0 ms, observedServiceRoute 48 ms (was 957),
cdcPropagationProgressCurrent 741 ms (base 724). Remaining for the owner:
the whole plan (services filter + sort per check) is still recaptured on
every progress check, O(targets^2) per pass.

R17 defect finding for the CDC delivery-invocation owner
(src/cdc/cdc-delivery-invocation.js openCdcDeliveryChildScope.run): run()
creates the child promise and then calls ownChild(), whose assertCurrent can
refuse if the parent budget expired in between; the created promise then has
no handler and rejects unhandled. Seen in the budget demonstration
(1500 ms, 1 of 3 runs) and on carinas (c3 rep 4, default budget, once the
first pass ran into the budget): failureType unhandledRejection, stack
run -> ownChild -> assertCurrent -> retire. The clone removal makes the
first pass end well inside the budget again, which hides the race in W9;
it does not fix it (any slow pass, production included, can hit it). node:test fails a file on it; production logs
PROCESS_UNHANDLED_REJECTION. Pre-existing (src/cdc unchanged by this
quest). Fix-quest candidate: statement "a child scope
never orphans the promise it created when the parent refuses"; probe: a unit
test whose clock passes the budget between run()'s and ownChild()'s checks
counts unhandled rejections (target 0); owner: CDC delivery invocation.

#### Other red on the join net: dt6 learner-promotion fixture

test/convergence/dt6-learner-promotion-{proof-channel-wake,progress-proof}
(join-core wide net): candidate red 0/12 and 0/5, base green. Cause: ruling
(1): the fixture inserted partial partitions / services /
control_plane_publications rows and the cache refused the NOT NULL omission
(partitions.table_id). Fixed at the fixture: INSERT payloads built with
systemTableRow (test/convergence/dt6-learner-promotion-fixture.js); the
UPDATE merges are unchanged. Both green (12/12, 24/24).

#### Join/bootstrap net (local, thermal-gated)

324 files (test/bootstrap, test/boot, and the join-core wide-net globs
node-joining|operation-ledger|formation|spread|replica-recovery|
learner-promotion|join|rejoin), one run of run-classified-test-files on
the tree before the clone change: 313 results, 7 reds:
- dt6-learner-promotion x2: candidate fixture red, fixed above (green).
- seed-release-failure-custody: red under load only; alone candidate 4/4
  twice, base 4/4 (base-red on carinas per the closeout table).
- message-group-multi-join-formation (381 s under load): alone candidate
  100/100 (100 s), base 100/100 (98 s).
- concurrent-join-message-group-assignment (timeout! under load): alone
  candidate 23/23, base 23/23.
- node-joining-rebalance: candidate and base both red alone, same
  subtest ('rebalancer dispatches replica operations after node ready',
  timeout!) -> base-red.
- node-join-convergence-slo: candidate 29/36 and base 31/36 alone, the
  same failing tests (over-target voters, SLO window, join success); the two
  extra candidate fails are the timing diagnostics of the same run (leader
  quiet 27.5 s vs 16.2 s, readiness transition) -> base-red, timing noise.
Carinas c2 bootstrap lane (219 files, before the clone change): 216/219;
fresh-join-via-non-seed-node red once ('Message-group service activation
requires endpoint publication' after wait bounds spent; admission had
admitted, so F1's decision was not on the path), green in the c5 lane run.
Impact contract cdc-source-native-delivery (registered pair on
src/topology/cdc-group-propagation-routing.js): its 43 witnesses 43/43 on
the staged tree. bootstrap-join-admission-owner.js is in no registered pair.
Touched-file re-run on the staged tree: 16/16 files (rejoin 30 assertions,
multi-node-cluster 37 assertions 28 tests, dt6 x2, the routing witness, the
11 cdc topology/progress units).

#### Checks (final tree)
On the staged tree: `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit`
exit 0 (scoped complexity list informational; neither touched src file
listed); `npm run test:duplication` exit 0 (src+scripts 42/42 groups
1331/1331 lines, test 639/639 groups 23859/23859 lines, no hint); `npm run
audit:guideline:navigability` exit 0 (0 new violations; tighten hints only
for owner_port_feature_detection, inheritance_depth_over_two,
typeof_dual_paths, alias_exports, none touched here); `npm run
test:metadata:refresh` exit 0 (seal and classes re-staged); eslint on every
touched file exit 0; `node scripts/solve.js probe --id
system-table-row-decoders`: metric 0 target 0 done=true (exit 0, read-only).

#### Verifier's model (F1/F12)
1. F1: for each of the three new rejoin tests, HEAD's decision (missing key)
   equals the candidate's decision (ROW_ABSENT); the authoritative path's
   code is unchanged (`isNodeDead` itself is untouched); the sweep mapping
   is needed because HEAD's sweep row also lacked the key.
2. F1 residual: confirm the explicit-NULL writer list and that the changed
   decision is reachable only with the authoritative read unavailable.
3. F12: re-derive from the trace that HELD can be returned with uncovered,
   unvisited targets (budget expiry inside the first pass) and that the cell
   and its COMMITTED receipts survive into the next drive; then check the
   harness asserts every element of the original property on every drive.
4. Clone removal: observedServiceRoute's only use of the row is
   `node?.[COLUMN.BOOT_INCARNATION] ?? null`; getShared returns the same
   stored values as get; check no caller of buildSafeTargets /
   buildGroupedContext / captureDurablePropagationPlan can reach the row.
5. The clone figures come from the profiles named above (r2close/prof-cand,
   prof-base; r2f12/prof-fix).
6. Model: Opus 5.5 (this resolving agent); the verifier should be a
   different model per the lead's protocol.

## round 3 (seed projections, after REJECT)

Start 2026-11-09: HEAD 730225bf1, staged candidate 427 paths (round 2 +
F1/F12). Implementing the lead decision of 2026-11-09 08:53 (log): the cache
stores exactly what was written; partial seeders declare a named seed
projection; the decoder gives columns outside it NOT_OBSERVED; readers map
NOT_OBSERVED/ABSENT as HEAD mapped missing/NULL.
(work in progress; sections below are appended as they complete)

### Removed (completion and everything that depended on it)
- src/cache/system-table-cache-row-completion.js deleted; the three hook
  sites in SystemTableCache.applySystemTableChange restored to HEAD
  (`table.set(key, this.deepClone(data))`; the INSERT branch notifies `data`
  again, as at HEAD: non-blocking F-c is gone with completion).
- The refusal path into CDC apply (F-a) is gone with it: the cache never
  throws on a partial row.
- `resolveSystemTableColumnDefault` / `SYSTEM_TABLE_COLUMN_DEFAULT_STATE`
  removed from src/bootstrap/system-table-schema-sql.js (file = HEAD); the
  DDL-default reading moved into the test fixture
  (test/test-helpers/system-table-row-fixture.js, the only remaining user),
  which also gained `sqlInsertedSystemTableRow` (the row SQLite stores for an
  INSERT; refuses a NOT NULL omission) for the two test SQL fakes
  (timeout-test-coordinator.js, no-orphaned-replicas property test).
- F7: bootstrap-request-owner.js and bootstrap-api-admission-methods.js = HEAD
  (no admittedAt, no zero resources/heartbeat, no created_at) plus the seed
  projection below.
- F1: bootstrap-join-admission-owner.js = HEAD (isCachedNodeRowDead and
  isExistingNodeRowDead deleted; isNodeDead on both paths). Removes the two
  raw reads of B1.
- test/cache/system-table-cache-row-completion.test.js deleted; replaced by
  test/cache/system-table-cache-seed-projection.test.js (shard keys renamed).

### Mechanism (seed projections)
- Field: `SYSTEM_TABLE_CACHE_SEED_PROJECTION_FIELD = 'seed_projection'` in
  src/cache/cache-constants.js, a member of SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES
  (one declaration). Value `{table, name, columns}`.
- Seeder side: the seeder declares its projection once beside itself with the
  table's existing `define<Table>Projection(name, columns)` and writes
  `seedProjectionRow(projection, row)` (system-table-row-decoding.js), which
  throws if the row lacks a declared column or carries an undeclared one
  (cache-local fields allowed).
- Decoder (system-table-row-decoding.js): the one local field it READS. A
  marked row: every column it carries decodes; a missing column of the seed
  projection is MISSING_COLUMN; any other missing column decodes to
  `ROW_NOT_OBSERVED` (a Symbol, distinct from ROW_ABSENT = null); a malformed
  marker (not this table, bad name, non-column) is
  MALFORMED_SEED_PROJECTION. An unmarked row lacking a column stays
  MISSING_COLUMN. decodeSystemTableRowColumn applies the same rule.
- Drop rule (src/cache/system-table-cache-seed-projection.js,
  `dropSeedProjectionOnceObserved`, called once after every non-DELETE apply in
  applySystemTableChange): the marker is dropped exactly when the held row has
  every stored column of its table's schema; otherwise kept (merges and the
  authoritative replacement keep local fields). Witnessed in
  test/cache/system-table-cache-seed-projection.test.js (one column missing ->
  marker stays and that column is NOT_OBSERVED; last column supplied ->
  marker gone, row == full row; full INSERT and authoritative replacement
  drop it).
- `readNotObservedAsAbsent(value)` (decoding module): the named HEAD mapping
  for readers that never told missing from NULL.

### Seeder census (cache write paths; census agent, report
scratchpad r3-seeder-census.md, lines re-checked)
| path | table | partial? | outcome |
| --- | --- | --- | --- |
| node-registration-owner.js fresh join seed | nodes | yes: latency_group_id, last_latency_check_at, latency_assignment_state | `joiner_registration_seed` (18 columns) |
| node-registration-owner.js resumed join seed; durable-rejoin seed (…-durable-rejoin-methods.js:492) | nodes | no (SELECT * + overrides) | none |
| bootstrap-request-owner.js buildBootstrapAdmissionPeerNodeRows (hydrated by query-system-state-phase.js:479, join backfill :541) | nodes | yes: 17 of 21 columns | `bootstrap_admission_peer_hint` (node_id, node_address, status, connection_state); F7 zeros removed |
| bootstrap admission peer endpoint rows | node_endpoints | yes (created_at/updated_at) | not a decoded table: stored as at HEAD |
| replica-handler-create-status-methods.js seedLocalPriorityServiceRow | services | yes: 9 of 17 | `priority_local_create_seed` |
| replica-handler-create-status-methods.js seedLocalReplicaVoterRaftRole | services | 2 fields, only onto a held row (merge) | none (race: row deleted between get and apply -> unmarked partial, recorded below) |
| create-message-group-phase.js registration seeds (shortcut :461 via seedJoinTimeCacheRow, remote :537) | services | yes: previous_state, trigger_reason, error_message, cleanup_token | `message_group_registration_seed` (13 columns) — NOT in the verifier's list, found by the census |
| CDC apply cdc-handler.js:481 INSERT/UPSERT | all | no (SELECT * read-back; param fallback only when no row found) | none |
| CDC apply UPDATE of a key the cache does not hold | nodes / services / replica_operations | yes when the guarded UPDATE changes a guard column (read-back misses -> SET + WHERE columns: node-lifecycle-publication.js:615, replica_operations UPDATE_OPERATION_EXPECTING_STEP family, message-group activation message-group-service-row-owner.js:232) | NOT a seeder: stored unmarked as at HEAD; a decoder refuses it (decision: an unmarked row lacking a column is a typed refusal). Lead decision needed (R17 finding RD-1 below) |
| authoritative repairs / gateway reconciliation / seed hydration image / applyLocalPriorityOperationProgressRow | various | no (SELECT * / full builder) | none |
| copies of cache rows (bootstrap snapshots, readNodeSnapshot local fallback) | nodes etc. | carry whatever the source cache holds, marker included | none |

### Reader census (key presence vs NULL on nodes/services/replica_operations)
Method: the verifier's list, then `grep -rnE "(hasOwn|hasOwnProperty|hasOwnField|hasOwnReadyLeaseField)\("`,
`=== undefined` / `!== undefined` and `'col' in` on the three tables' columns
(src/**), then every decoded reader (decodeNodesRow / decodeServicesRow(s) /
projectReplicasFromServicesRows call sites) checked for reads of a column
outside some seed projection. Two classes:
- RAW readers read the cache row itself. The cache again stores exactly what
  was written, so a never-written column is a missing key and an explicit
  NULL is null, exactly as at HEAD: HEAD semantics by construction. Generic
  witness: "the cache stores a seeded row exactly as written (no completion)"
  (test/cache/system-table-cache-seed-projection.test.js; also stores an
  unmarked partial row as written). Specific witnesses below pass every row
  through a real SystemTableCache from the real seeder; each fails if the
  cache completed rows again (round-2 reversion).
- DECODED readers see ROW_NOT_OBSERVED for a column outside a seed
  projection. HEAD's folded normalisers (readText/readLowerText) read a
  missing column and NULL alike (''), and round 2 (verified) reads NULL as
  ROW_ABSENT; so NOT_OBSERVED maps to ROW_ABSENT via the named
  `readNotObservedAsAbsent` where the value flows on, and needs no mapping
  where the reader only compares against a non-null domain value (both
  states compare unequal, as missing and NULL did at HEAD).

| reader | class | HEAD: missing / NULL | now: NOT_OBSERVED / ABSENT (or missing / null for raw) | witness (fails on reversion) |
| --- | --- | --- | --- | --- |
| bootstrap-join-admission-owner isNodeDead, cache fallback | raw | live (Number(undefined)=NaN) / dead (Number(null)=0) | same; file = HEAD, isCachedNodeRowDead deleted | bootstrap-api-rejoin.test.js "cache fallback: ... never written is the terminal conflict" + "... explicitly cleared admits" (row through real cache) |
| same, address-claim sweep (resolveAddressClaimTakeoverDecision) | raw | holds address / does not | same | "address-claim sweep: ... never written, not once it was cleared" |
| same, authoritative path | raw | NULL = expired | same | "authoritative path unchanged" |
| node-liveness-semantic-projection projectLease / readNodeLivenessRowFacts.hasReadyLeaseField / projectClusterMembership hasLeaseField | raw | UNKNOWN / CLEARED | same | system-table-seed-projection-readers.test.js "projectLease" (real peer-hint seeder -> UNKNOWN; cleared row -> CLEARED) |
| node-readiness-policy isNodeReadyLeaseExplicitlyCleared (hasExplicitReadyLeaseField) and its callers unified-rebalancer-follow-up-move.js:471, unified-rebalancer-critical-topology-methods.js:81, move-replica-assignment-visibility-policy.js:113 | raw | false / true (active) | same (callers pass the cache row unchanged) | "isNodeReadyLeaseExplicitlyCleared: never written is not cleared" |
| cdc-group-propagation-routing observedServiceRoute nodeBootIncarnation (`?? null`) | raw | null / null; round 2 gave DDL 0 on hints | null for the hint (no key), the value once delivered | "propagation route: a peer hint carries no boot incarnation" (buildSafeTargets over a real cache) |
| replica-state-machine-failed-create-claim.js:65 cleanup_token | raw | same treatment (`!== null && !== undefined`) | same | no distinction to preserve (generic witness) |
| failure-detector `last_heartbeat || 0` (F-b) | raw | 0 for both | same; the hint no longer writes 0 | generic witness |
| projected-replica projectReplicaFromServicesRow (all copied fields + replicaId fallback) -> getCurrentReplicas, inventory, census, move planner, leader cure, readiness | decoded | '' / '' (normalizers), round 2 ROW_ABSENT | ROW_ABSENT / ROW_ABSENT via readNotObservedAsAbsent; replicaId NOT_OBSERVED -> serviceId | "projected replica: unobserved columns of the priority seed read as ROW_ABSENT" (Symbol leaks without the mapping) |
| readiness-planning-global-projection buildPlanningServiceRecord (+ table-impact classification) | decoded | '' / '' | ROW_ABSENT / ROW_ABSENT via readNotObservedAsAbsent | "planning record: the priority seed records as the same row with stored NULLs" |
| unified-rebalancer-replica-state getCurrentReplicas filter `service.groupId === entityId` | decoded, compare | no match / no match | no match / no match | comparison only (entityId is a string) |
| user-table-leader-placement-cure collectEligibleVoterHosts isVoterRaftRole(raftRole); priority-recovery-scheduling-owner-policy `raftRole !== LEADER` | decoded, compare | not voter, not leader | same (isVoterRaftRole takes only strings) | "comparison-only readers" |
| decoded nodes readers (active-node-projection, membership candidate derivation, critical topology, join readiness, bootstrap topology snapshot) | decoded | read nodeId / status / connectionState only | every nodes seed projection observes these three | no NOT_OBSERVED reachable (grep of decoded field reads in the notes' method) |
| decodeServicesRowColumn prefilters (partition_id, service_id, node_id) | decoded | — | observed by every services seed projection | — |

Mutation check of the witnesses (each restored after):

### Non-blocking items (verdict F-a..F-e)
- F-a (completion refusal thrown into CDC apply): gone with completion.
- F-b (F7 peer-hint zeros, created_at in LWW): gone; the hint is the declared
  seed projection `bootstrap_admission_peer_hint` (4 columns), file otherwise
  = HEAD.
- F-c (INSERT replacement completed; listeners got the stored object): gone;
  the INSERT branch is HEAD's (`deepClone(data)` stored, `data` notified).
  The one new write after the switch (marker retirement) only replaces the
  stored row when the marker retires and never changes an INSERT's
  notification (it notifies `data`).
- F-d detector: the latent TypeError (keyColumn returned a lower-cased
  `COLUMN.X` that names no column of the three tables; attributedTables then
  filtered `undefined` when the object had own-column evidence) is fixed in
  keyColumn (scripts/checks/code-navigability-system-table-detectors.js: a
  `COLUMN.X` is a column only if one of the three tables stores it).
  Witness test/scripts/code-navigability-detectors.test.js "a COLUMN
  constant of another table beside an own-column read is not a site" (fails
  18/19 with TypeError on the staged detector, 19/19 fixed). Measured count
  unchanged (the crashing path never produced a site).
  Recall gaps (documented, not fixed; the row is a lower bound): reads through
  a helper taking a column argument (`readColumn(source, COLUMN.X)`, e.g.
  control-plane/node-lifecycle-publication.js); shared-column-only reads with
  no own-column evidence in the same scope (~167 uncounted shared reads per
  the verifier); reads through a variable key or a constants object other than
  COLUMN; evidence does not cross function scopes. Under-cap drift prints no
  tighten hint for this row (the budget's generic hint path only; not changed
  here).
- F-e R17 (owner: system-table schema / distributed-transaction storage):
  sql_transactions declares transaction_mode, participant_set_state,
  commit_mode, frozen_participant_count NOT NULL without DEFAULT
  (src/bootstrap/system-table-workflow-schema-definitions.js:30 and
  neighbours) while the migration ALTERs give them DEFAULTs
  (src/partition/partition-service-constants.js:288-294: 'EXPLICIT', 'OPEN',
  'NOT_SELECTED', 0): a fresh table and a migrated table differ. No reader in
  this quest depends on it now that the cache does not complete rows.

### R17 findings (round 3)
- RD-1 (cache owner + CDC partition read-back owner; lead decision needed):
  an UPDATE whose guard includes a column it SETs makes the partition CDC
  read-back miss (partition-cdc-parameterized-sql.js fetchUpdatedRow), so the
  payload is the SET + WHERE columns (extractParamUpdateData). A cache that
  does not hold that key stores the partial row unmarked (HEAD behaviour; the
  decision keeps it a decoder refusal). Writers: nodes
  node-lifecycle-publication.js:615 (guard: status, connection_state,
  last_heartbeat), replica_operations UPDATE_OPERATION_EXPECTING_STEP family
  and replica-operation-message-group-membership-authorization.js:74,
  services message-group-service-row-owner.js:232. A decoded reader of such a
  row now throws SystemTableRowDecodeError where HEAD's normaliser read ''.
  No production instance observed. Options for the lead: (a) keep (refusal is
  the contract; fix the read-back to re-read by primary key), (b) the cache
  marks a partial store of an unheld key with a cache-declared projection of
  the observed columns. Not implemented (outside the decision).
- RD-2 (replica handler owner): seedLocalReplicaVoterRaftRole reads the held
  row then UPSERTs {service_id, raft_role}; if the row is deleted in between,
  the UPSERT stores an unmarked 2-column row. Same refusal class as RD-1.
(script: scratchpad r3-mutate.py; files bootstrap-api-rejoin / seed-projection-readers / cache seed-projection; baseline 20 / 22 / 86 pass)
| mutation | rejoin | readers | cache seed |
| --- | --- | --- | --- |
| cache completes nodes rows (missing lease -> NULL, incarnation -> 0: the round-2 shape) | 3 fail | 5 fail | 6 fail |
| projected replica without readNotObservedAsAbsent | — | 6 fail | — |
| planning record raftRole without the mapping | — | 1 fail | — |
| marker never dropped | — | — | 3 fail |
| decoder gives ROW_ABSENT instead of ROW_NOT_OBSERVED | — | 1 fail | 9 fail |

### Local runs (round 3)
- All 278 staged test files (classified runner, LAGRANGE_PLACEMENT=local,
  thermal-gated): 6 red files, all fixed and re-run green:
  - priority-services-row-publication-census-contract: fixture partial services
    rows (relied on completion) -> servicesRow (10/10).
  - system-table-cache.test.js "getReadyNodes rejects missing node_id":
    round-2 expectation (refusal at insert) restored to HEAD's (the cache
    stores the row, getReadyNodes throws) (242/242).
  - register-node-in-cluster (2 subtests), node-joining-service-message-group-
    activation, and (by census of `resolveBudgetRow` stubs) node-joining-lease-
    registration, node-identity-separation.property, node-registration-
    creates-endpoint.property: budget-service stubs returned a budget row
    without the three storage_budget_* columns, which production
    NodeStorageBudgetService.buildBudgetRow always writes; the joiner seed's
    projection refuses it -> stubs carry the columns (all green).
  - code-navigability-budget: legacy_term_identifiers 2928 > 2924 from the
    identifier `retire...` (term "retired") -> renamed
    dropSeedProjectionOnceObserved / `settled` (2924/2924; 18/18).
  - failure-scenarios.integration: decoder refusals from the test's fake SQL
    storing INSERT payloads unfilled and partial fixture rows (relied on
    completion) -> fake stores sqlInsertedSystemTableRow (upsert of a held row
    merges), fixtures nodesRow/servicesRow (57/57, 63 s).
- multi-node-cluster.integration: 28/28 (19 s) on the round-3 tree.
- Mutation table above: every witness dies under its reversion.

### Lab run (round 3)
Snapshot refs/wip/nav-decoders-r3-0001 = 5a24c45aa (working tree incl. new
files, metadata refreshed; built through a temporary index, the real index
untouched), --base-sha 95877e60b, holder claude:nav-decoders, launched
2026-11-09 ~09:40 UTC detached (scratchpad r3-lab-carinas.sh: ordinary ->
bootstrap -> external-toolchain on carinas-windows; r3-lab-tv.sh: exclusive
on tv-dator). Logs scratchpad r3-lab-*.log. Local directory run (bootstrap,
rebalancer, *readiness*, *join*; 584 files) in parallel: r3-local-dirs.log.
- Lab attempt 1 (5a24c45aa) refused before running (exit 97: "the commit's
  generated metadata is stale; regenerate test/shards/impact-graph-seal.json",
  edits after the first refresh). Metadata refreshed; snapshot 2 =
  refs/wip/nav-decoders-r3-0002 = 40348134f, relaunched ~10:15 UTC (pids
  2379518 carinas ordinary->bootstrap->external-toolchain, 2379519 tv-dator
  exclusive). Logs scratchpad r3nd-lab-*.log (the `r3-lab-*` names in the
  shared scratchpad belong to another session).

### Local directory run (bootstrap, rebalancer, *readiness*, *join*: 584 files)
- 582 green; 2 red:
  - reservation-fail-closed-dispatch-gate: the fake SQL INSERT now goes through
    the test fixture's sqlInsertedSystemTableRow, which kept a key whose bound
    param was `undefined` (round 2's completion treated undefined as omitted ->
    NULL). Fixture fixed (undefined = omitted, as a driver binds no value);
    64/64 (round-2 tree 64/64).
  - node-join-convergence-slo.integration: candidate 30/36, 31/36 locally;
    round-2 tree (refs/wip/nav-decoders-0730 checkout) 30/36 twice -> not
    introduced by round 3; base 95877e60b run pending below.
  - node-join-convergence-slo: BASE-RED (local, same host). Base 95877e60b
    (scratchpad decoders-base): 34, 31, 30, 29 of 36; candidate: 30, 31, 30,
    30, 30 of 36; round-2 tree 30, 30. The same subtests fail on both sides
    (settle within SLO window / over-target voter duration / final voter
    counts / joining node join + ready in cache, and "readiness transitions
    should reach JOIN_READY" on base too).

### Gates (round 3, staged tree)
- node --check every added/modified .js: clean; eslint on them: 0 errors.
- `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit`: exit 0.
- test:duplication 0; audit:guideline:navigability 0; audit:file-size 0;
  test:metadata:refresh run (shards + impact-graph-seal regenerated).
- Probe `--metric --rows formation_system_tables_without_decoder`: 0, exit 0.
- test/scripts/code-navigability-budget.test.js: 18/18.

### Rows / caps (measured, round 3)
| row | measured | cap |
| --- | --- | --- |
| system_table_raw_column_reads_outside_decoder | 1008 | 1008 (B1: the two isCachedNodeRowDead reads are gone with the HEAD revert) |
| …_rebalancer / control_plane / node / admin / query / partition | 116 / 367 / 322 / 128 / 56 / 19 (sum 1008) | measuring, target 0 |
| formation_system_tables_without_decoder | 0 | 0 |
| row_field_alias_reads | 741 | 741 |
| state_read_defaults | 402 | (round 2 baseline) |
| two_source_fallback_reads | 1774 | 1789 (budget row; unchanged from round 2) |
| catch_returns_default | 386 | 387 |
| identity_keyed_module_state | 87 | 87 (a memo Map in the new cache module removed to stay at cap) |
| legacy_term_identifiers | 2924 | 2924 (`retire*` identifiers renamed) |
No cap raised.

### Lab run (round 3) results, snapshot 40348134f, base 95877e60b
| lane / host | files | red |
| --- | --- | --- |
| ordinary / carinas-windows | 1696 | 4 |
| bootstrap / carinas-windows | 219 | 2 |
| external-toolchain / carinas-windows | 5 | 0 |
| exclusive / tv-dator | 103 | 4 |

| file | lane / host | class | evidence |
| --- | --- | --- | --- |
| q10-postgres-compatibility-certification-matrix | ordinary / carinas | base-red | round-2 base run on carinas: same `certifies all 12 dimensions` red (11 assertions both); unchanged file and path |
| raft-rs-backend/single-path-partition-cutover | ordinary / carinas | base-red | round-2 base run on carinas: same `seed bootstraps and serves a write` (5 assertions both) |
| return-value-completeness.property | bootstrap / carinas | base-red | round-2 base on carinas: same `timeout!` at ~132 s, 50 assertions (now 132284 ms, 50) |
| seed-release-failure-custody | bootstrap / carinas | base-red | round-2 base on carinas: same `not ok 3`, 4 assertions (now 4) |
| simulation/formation-sim-runner, formation-sim-attribution-isolation | ordinary / carinas | candidate FIXTURE (fixed) | `nodes row refused: missing_column at boot_incarnation` in deriveFormationPlacementNodeIds: rows from test/integration/membership-consistency-integration-test-helpers.js createNodeEntry (no boot_incarnation; round 2's completion filled DDL 0). Fixture now returns sqlInsertedSystemTableRow('nodes', …) (the row SQL stores). Local: 12/12, 6/6 |
| membership-consistency.integration | exclusive / tv-dator | candidate FIXTURE (fixed) | same createNodeEntry rows (`not ok 2 - nodes row refused … boot_incarnation`). Local 93/93; the helper's other users green locally (rolling-restart-rebalancer-handoff-witness, core-system-logic-runtime-witness, owner-interaction-model, readiness-handoff-liveness-witness) |
| public-application-database-transaction-facade, public-binding-cell-invocation-seam | exclusive / tv-dator | host/timing (full-lane load) | no decoder refusal (DISTRIBUTED_PARTICIPANT_FAILURE; managed split did not produce two partitions). Same host, narrow cones: base 95877e60b (refs/wip/nav-decoders-r3-base-tv = 5d2300f8d) green 58 / 70 assertions (57 / 121 s); candidate (refs/wip/nav-decoders-r3-cand-tv = a23ec03bf on staged tree 21ab3dbbb) green 58 / 70 assertions (64 / 150 s) |
| lagrange-server-npm-package | exclusive / tv-dator | base-red | base narrow cone on tv-dator: same `packs one commit-bound artifact` 180 s timeout (3 assertions); candidate narrow: same |

### Verifier's model (round 3: what to re-derive)
1. Completion is gone: `git grep -n "completeInsertedSystemTableRow\|resolveSystemTableColumnDefault\|admittedAt" src` is empty;
   src/bootstrap/{system-table-schema-sql.js, owners/bootstrap-join-admission-owner.js,
   bootstrap-api-admission-methods.js} equal HEAD; bootstrap-request-owner.js
   differs from HEAD only by the seed projection; SystemTableCache's three
   store sites equal HEAD (`deepClone(data)`, INSERT notifies `data`).
2. One declaration: `seed_projection` is a member of
   SYSTEM_TABLE_CACHE_LOCAL_FIELD_NAMES, and the decoder READS it
   (seededColumns); a marked row gives ROW_NOT_OBSERVED (Symbol) for an
   unobserved column, ROW_ABSENT (null) for a stored NULL; an unmarked row
   lacking a column is MISSING_COLUMN; a seeded column missing is
   MISSING_COLUMN; a malformed marker is MALFORMED_SEED_PROJECTION.
3. Drop rule: the marker leaves the held row exactly when every schema column
   is an own key (dropSeedProjectionOnceObserved after each non-DELETE apply).
4. Seeders: four declared projections, each beside its seeder
   (joiner_registration_seed, bootstrap_admission_peer_hint,
   priority_local_create_seed, message_group_registration_seed); census table
   above (message-group registration seeds were found beyond the verifier's
   list).
5. Reader census table and the mutation table: each witness dies under its
   reversion (incl. re-adding completion).
6. B1: raw-read row 1008 <= 1008 and the budget test 18/18.
7. Open for the lead: RD-1 (CDC guarded-UPDATE partial payload stored for an
   unheld key is an unmarked partial row -> decoder refusal where HEAD read
   ''), RD-2 (voter-raft-role seed race). Known risk class: test fixtures that
   relied on round-2 completion; the lab and local runs found and fixed 9
   (listed above); a fixture that still hands partial rows to a decoder fails
   loudly (SystemTableRowDecodeError), never silently.

Lab classification complete: every red is base-red, host/timing with
same-host narrow evidence, or a candidate fixture fixed and re-run locally.
Scratch worktrees used: scratchpad decoders-base (restored to 95877e60b),
r3-r2tree (round-2 snapshot 0730), r3nd-cand-cone (removed at hand-back).
No foreign edits appeared in git status during round 3 (no patch saved).
The epic stream moved to 07b4730fc; not merged here (lead merges before land).

### RD-1/RD-2 observed-columns marker
Implements the lead ruling of 2026-11-09 (log, decision after the round-3
attempt) on HEAD 730225bf1 + the staged round-3 candidate.

Mechanism (one marker, one decoder rule):
- The cache's own projection is the existing `seed_projection` marker with
  the same shape `{table, name, columns}`:
  `name = SYSTEM_TABLE_CACHE_OBSERVED_COLUMNS_PROJECTION_NAME
  ('cache_observed_columns')`, `columns` = exactly the stored columns the row
  carries, in schema order (src/cache/cache-constants.js). The decoder is
  unchanged: `seededColumns` reads declared and observed projections alike
  (ROW_NOT_OBSERVED outside, ROW_ABSENT for a stored NULL).
- Where: `settleSeedProjection` (src/cache/system-table-cache-seed-projection.js),
  called once after every non-DELETE apply in
  SystemTableCache.applySystemTableChange. When the key was not held before
  the apply (`keyWasHeld`, captured after the tombstone fence) and the stored
  row is a row of a decoded table that lacks a stored column and carries no
  seed projection, the stored row is replaced by a marked copy
  (`markObservedColumns`). Then the drop rule runs unchanged
  (`dropSeedProjectionOnceObserved`: the marker leaves exactly when every
  column is present). A write onto a held key (merge, stale backfill,
  authoritative replacement, INSERT replacement) is untouched. A declared
  seed projection is never replaced.
- Scope: only the tables a row decoder reads
  (`SYSTEM_TABLE_CACHE_DECODED_TABLES` = nodes, services, replica_operations;
  the decoders are the marker's only reader). Rows of other tables are stored
  exactly as written (e.g. the node_endpoints peer-hint rows stay as at
  HEAD). A witness ties the list to the three decodings.
- Notification: UPDATE/UPSERT notify the stored (marked) row as before; an
  INSERT notifies a marked copy of its data (never the stored object; the
  caller's data is not mutated), so a listener decoding the notification sees
  what the cache holds.
- Diagnostic: `SystemTableCache#getObservedColumnsMarkCount(tableName)`
  (observation methods; also on the read-only cache), a per-instance per-table
  counter (no module state). Each marking is logged at warn
  (`CACHE_LOG_MSG.PARTIAL_ROW_MARKED_OBSERVED_COLUMNS`, with table, key,
  operation, causeId, observedColumns, markCount) at counts 1, 2, 4, 8, ...:
  never silent, bounded on the apply path (system-table-cache.js is a
  hot-path module of the hot-path diagnostics guideline; the emission lives in
  the seed-projection module and is power-of-two throttled, the count is
  exact).
- One src change outside src/cache: `rowToOperation`
  (src/rebalancer/replica-operation-repository-row-methods.js) passes
  entityType/entityId through `readNotObservedAsAbsent` before the identity
  assertion. Without it an observed-columns replica_operations row reaches
  `${entityType}` with a Symbol and throws a TypeError; with it the row is
  refused with UNSUPPORTED_REBALANCER_ENTITY_TYPE, as HEAD refused the
  missing column (HEAD message "undefined", now "null"; same code).

Witnesses (test/cache/system-table-cache-observed-columns.test.js, 45/45; every
row passes through a real SystemTableCache):
1. RD-1 nodes: the guarded lifecycle UPDATE of node-lifecycle-publication.js
   applyPublication (:615; SET node_address, connection_state,
   last_heartbeat, ready_lease_expires_at, boot_incarnation [+ status on the
   READY promotion]; WHERE node_id, boot_incarnation, status,
   connection_state, last_heartbeat, created_at) runs on a real SQLite nodes
   table; the real `extractParamUpdateData` + `fetchUpdatedRow` read-back
   misses; the SET+WHERE payload applied as a CDC UPDATE to a cache without
   the key is marked with exactly its observed columns; decodes with
   ROW_NOT_OBSERVED for latency_group_id, cpu_cores, storage_budget_bytes,
   capabilities. Reader: bootstrap-topology-snapshot `resolveActiveNodeIds`
   (via buildBootstrapTopologySnapshotEnvelope over the cache) keeps HEAD's
   answer: not active on the heartbeat payload (observed status 'joining'),
   active on the READY promotion.
2. RD-1 replica_operations: the real `SQL.UPDATE_OPERATION_EXPECTING_STEP`
   (CAS on workflow_step, which it SETs) on SQLite; the read-back misses; the
   cached row decodes (workflowStep/status CREATING, completedAt ROW_ABSENT,
   entityType/createdAt ROW_NOT_OBSERVED); reader `rowToOperation` (the one
   replica_operations decoder; getAllOperations / incomplete reads from the
   cache) refuses with UNSUPPORTED_REBALANCER_ENTITY_TYPE as at HEAD.
3. RD-2: the real `seedLocalReplicaVoterRaftRole` with the race (get returns
   the held row, the cache no longer holds it): the 2-column row is marked
   `[service_id, raft_role]`; decodeServicesRow gives raftRole 'follower',
   status ROW_NOT_OBSERVED; isVoterRaftRole true; projectReplicaFromServicesRow
   gives replicaId = service id, partitionId/nodeId/groupId ROW_ABSENT (HEAD
   NULL reading).
4. Diagnostic: 3 partial unheld stores (INSERT/UPDATE/UPSERT) count 3
   (readable through createReadOnlyCache); warn events at counts 1 and 2 only;
   a merge onto a held marked row is not counted and leaves the marker as it
   was; a full row and a partitions row are not marked/counted; a declared
   seed is not replaced or counted; the observed marker drops once every
   column arrives (row == full row).
5. Mutations (each restored after):
   | mutation | observed-columns test | seed-projection test |
   | --- | --- | --- |
   | no marking (`observed = stored`) | 11 fail (8 subtests); RD-1 nodes, RD-1 reader, RD-1 replica_operations, RD-2 all refuse `missing_column` (cpu_cores / type / service_type) | 3 fail |
   | rowToOperation without readNotObservedAsAbsent | 1 fail (TypeError instead of the HEAD code) | — |
- Changed expectation: test/cache/system-table-cache-seed-projection.test.js
  "stores a seeded row exactly as written": an unmarked partial row for an
  unheld key now carries the observed-columns marker (86/86).

Runs (local, thermal-gated):
- Cache directory (26 files incl. the new one), seed-projection readers (22/22), decoders
  (22/22), bootstrap-api-rejoin, code-navigability-budget (18/18): all green
  on the final tree.
- Every non-integration test file that calls applySystemTableChange (154
  files; classified runner, LAGRANGE_PLACEMENT=local; ordinary jobs=4,
  bootstrap 21/21): 152 green, 2 red by 30 s TAP timeout under jobs=4 load
  (partition-service-raft-noop-cdc-placement 10/10 alone,
  existing-group-add-topology-guard 11/11 alone). This run was on the
  pre-refactor shape (marking inline in system-table-cache.js); the final
  move into settleSeedProjection was re-witnessed by the cache directory and
  the mutation runs. The 28 integration files that call
  applySystemTableChange were not run (no lab per the brief).

Gates (staged tree): `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit`
exit 0 (first runs failed on file-size 27/26 [system-table-cache.js 829 lines
-> logic moved to the seed-projection module, 790], the hot-path diagnostics
guideline [warn in system-table-cache.js -> throttled emission in the module]
and a decision-boundary false positive [`heldBeforeApply` contains "db" ->
`keyWasHeld`]); test:duplication OK (639/639); audit:guideline:navigability
exit 0 (prints tighten hints for inheritance_depth_over_two 65->58,
typeof_dual_paths 621->596, alias_exports 40->38: not touched by this change,
left for the lead); audit:file-size 0; test:metadata:refresh and
generate:source-owner-index run. Budget rows: raw-read 1008/1008,
identity_keyed_module_state 87/87, legacy_term_identifiers 2924/2924,
formation_system_tables_without_decoder 0, row_field_alias_reads 741/741,
two_source_fallback_reads 1774/1789, catch_returns_default 386/387,
state_read_defaults 402 (unchanged from round 3). No cap raised.

R17 routings (unchanged by this marker; the marker keeps HEAD semantics, it
does not fix the writers):
- CDC owner (partition CDC read-back, partition-cdc-parameterized-sql.js
  fetchUpdatedRow/extractParamUpdateData): a guarded UPDATE that SETs a guard
  column re-reads by the post-update WHERE values and misses, emitting the
  SET+WHERE payload. Writers: node-lifecycle-publication.js:615, the
  replica_operations UPDATE_OPERATION_EXPECTING_STEP family and
  replica-operation-message-group-membership-authorization.js:74,
  message-group activation message-group-service-row-owner.js:232. Fix shape
  for the owner: re-read by primary key. The cache diagnostic
  (getObservedColumnsMarkCount) is the observable for this owner.
- Replica handler owner: seedLocalReplicaVoterRaftRole get-then-UPSERT race
  (src/node/replica-handler-create-status-methods.js:607): a deleted row is
  resurrected as a 2-column row. Fix shape: apply only as a merge onto a
  held row (or a cache merge-only mode).
- Rebalancer owner (new, small): rowToOperation's identity assertion
  formatted a Symbol; now mapped (above). Any other decoded reader that
  string-formats a decoded value without mapping NOT_OBSERVED has the same
  TypeError shape; census for decoded nodes/services readers found none
  (round-3 reader census), replica_operations has only rowToOperation.

## round 4 (decoded-reader mapping, after REJECT)

Start 2026-11-09: HEAD 730225bf1, staged candidate 437 paths (round 3 +
RD-1/RD-2). Implementing the lead rulings of 2026-11-09 (log, decision after
the round-3 verification REJECT: B1 class repair across every decoded reader,
N1-N5). HEAD comparison tree: scratchpad verify-decoders-r3/wt-head (plain
730225bf1). (work in progress; sections appended as they complete)

### Mechanism (one helper, declared tables)
- src/control-plane/system-table-row-decoding.js: `defineNotObservedReading
  (decoding, reader, {field: reading})` (validates every field is a decoded
  field of the table and no reading is a Symbol; arrays frozen) and the ONE
  applier `readDecodedRow(reading, decodedRow)`: a frozen view holding exactly
  the declared fields, ROW_NOT_OBSERVED replaced by the declared reading,
  every other value (ROW_ABSENT included) unchanged; a declared field the row
  lacks is an error. `readDecodedColumn(reading, field, value)` applies the
  same table to one decodeSystemTableRowColumn result (prefilters).
  `readNotObservedAsAbsent` is deleted (every user now reads through a table).
- Per-table binders beside the decoders: defineServicesNotObservedReading,
  defineNodesNotObservedReading, defineReplicaOperationsNotObservedReading.
- Shared tables where the HEAD readers read through ONE normaliser (the table
  is per HEAD reading function; readers that read through the same normaliser
  share its table, derived once from that normaliser):
  - SERVICES_ROW_NORMALIZER_READING (services-row-decoder.js) = HEAD
    normalizeServiceRow's nine fields: NOT NULL serviceId/serviceType/nodeId/
    status -> '' (readText of a missing key = readText of a stored ''), the
    nullable partitionId/groupId/replicaId/raftRole/address -> ROW_ABSENT
    (readText read missing and NULL alike, and round 2 decodes NULL as
    ROW_ABSENT, so a partial row and the same row with a stored NULL stay
    equal, as at HEAD). `readServicesRowView(decoded)`; decodeServicesRows now
    returns these views.
  - NODES_ROW_NORMALIZER_READING (nodes-row-decoder.js) = HEAD
    normalizeNodeRow: nodeId/status/connectionState -> ''.
    `decodeNodesRowView(row)`.

### Decoded-reader census (round 4)
Method: `grep -rn "decodeServicesRow\b|decodeServicesRows|decodeServicesRowColumn|decodeNodesRow\b|decodeReplicaOperationsRow|decodeSystemTableRow" src`
(the decoders' only entry points), every site read against HEAD's code at the
same place (`git show 730225bf1:<file>`).

| reader (site) | HEAD reading of a missing column | table | post-mapping fix |
| --- | --- | --- | --- |
| rowToOperation (replica-operation-repository-row-methods.js) | raw `row.x` -> undefined (type, partitionId, entity*, replicaId, source/targetNodeId, status, workflowStep, created/updated/completedAt, errorMessage, epoch, lease, the 4 integer create-admission columns via nullableSafeInteger), `nullableValue` -> null (targetClaimKey, sourceReplicaId, 10 messageGroup*, 4 create-admission text), steps_history -> [] | OPERATION_ROW_NOT_OBSERVED_READING, all 37 fields | none (B1) |
| projectReplicaFromServicesRow (projected-replica.js) | no HEAD builder: consumers read the raw row (missing key = undefined) | PROJECTED_REPLICA_NOT_OBSERVED_READING: every field ROW_ABSENT; replicaId absent -> serviceId (HEAD `replica_id \|\| service_id`) | consumer census below |
| buildPlanningServiceRecord / buildPriorityServiceRecords / resolveChangedServiceRecords (readiness-planning-global-projection.js) | normalizeServiceRow -> '' | SERVICES_ROW_NORMALIZER_READING (the record IS the view) | N1 |
| readServicePartitionId prefilter, previous serviceId (same module) | readNormalizedServicePartitionId / readNormalizedServiceId -> '' | same table via readDecodedColumn | none (classifySystemPartition('') is not priority, as ROW_ABSENT) |
| hasCanonicalActiveService over decodeServicesRows (active-node-projection.js; callers global projection + table impact) | normalizeServiceRow -> '' | same table (decodeServicesRows returns views) | none |
| readServiceRecordNodeId (table-impact) | `normalizeServiceRow(record).nodeId \|\| ''` -> '' | same table via readDecodedColumn | N2: '' is skipped by appendUniqueNodeId again |
| readServiceRecordPartitionId, localSemanticRecord (table-impact) | normalizeServiceRow -> '' | same table | none |
| resolveLivePriorityRecoverySchedulingOwnerPartitionIds (priority-recovery-scheduling-owner-policy.js) | normalizeServiceRow -> '' | same table | none |
| collectEligibleVoterHosts (user-table-leader-placement-cure.js) | normalizeServiceRow -> '', `service.nodeId &&` guard | same table | HEAD guard `service.nodeId &&` restored (a row without node_id is no host) |
| readProjectedReplicas selectors (unified-rebalancer-replica-state.js; getCurrentReplicas x3, getCurrentPartitionReplicasByPartitionId) | normalizeServiceRow -> '' | same table (selector reads the view) | none |
| getNodesWithoutLocalReplica (move-planner-state-methods.js) | raw `service?.service_type`, `service?.status` -> undefined; node_id typeof-string filter | same table | none (a node-less replica never matches a node id) |
| bootstrap topology resolveActiveNodeIds; mesh connectivity resolveMeshConnectivityNodeId/Status; join readiness getCacheActiveNodeIds/getReadinessActiveNodeIds; active-node-projection hasFreshProjectionLiveness/shouldAllowLivenessFallbackProjection/isCanonicallyActiveNode/resolveProjectedActiveNodeSelection; candidate derivation deriveFormationPlacementNodeIds + publication node ids; critical topology classifyCriticalNode/collectKnownNodeIds | normalizeNodeRow -> '' | NODES_ROW_NORMALIZER_READING (decodeNodesRowView) | classifyCriticalNode: HEAD `\|\| !status` restored (a row that never observed status is no critical node) |
Key columns (node_id, service_id, operation_id) are always observed: the
cache keys the row by them (resolveSystemCacheRowKey) and every declared seed
projection carries them; HEAD's `nodeId.length === 0` guards therefore stay
unreachable and are not restored.

### Projected-replica consumers (census agent, opus, read-only; lead-checked)
The builder maps every unobserved field to ROW_ABSENT. HEAD's consumers read
the raw row's missing key, and they did NOT agree on its meaning (planner,
inventory, budget planning, control-plane readiness: `status || ACTIVE`;
leader cure and terminal-create projection: normaliser ''; node-id readers:
truthiness filters). So a single builder value cannot be HEAD's reading for
every consumer. Two named readings in projected-replica.js restore HEAD
exactly where a consumer read the missing key as something other than
absent: `readPlacementStatus(replica)` (ROW_ABSENT status -> ACTIVE, HEAD
`status || ACTIVE`) and `hasReplicaNode(replica)` (HEAD `replica.node_id`
truthiness; written without `||`/`??` chains, so no state-read-default site).
| # | consumer (file) | HEAD reading of the missing key | fix |
| --- | --- | --- | --- |
| 1 | projectPriorityTerminalCreateTargets (unified-rebalancer-replica-state.js) | normaliser '' was a projectable status | ROW_ABSENT added to TERMINAL_CREATE_TARGET_PROJECTABLE_STATUSES |
| 2,3 | getHealthyReplicas / getReadyNodeOccupiedReplicas (unified-rebalancer-budget-planning.js) | `status \|\| ACTIVE` | readPlacementStatus |
| 4 | getReadyNodeOccupiedReplicas | `replica?.node_id &&` first | hasReplicaNode first (no isNodeProcessAlive(null) call) |
| 5-9 | move-calculation activePlacementReplicas (feeds countDistinctActiveReplicaNodes, replicasByNode, spread-cure counts, hostingNodeIds) | `(status \|\| ACTIVE) === ACTIVE && !!node_id` | readPlacementStatus + hasReplicaNode |
| 10-12 | move-planner-state hasMultipleReplicasOnSameNode, analyzePrioritySpread, getCriticalReason | `.filter(r => r && r.node_id)` | `.filter(hasReplicaNode)` |
| 13 | placement-owner-decision isDataAffinityPlacementSuboptimal | `.filter(Boolean)` | `.filter(hasReplicaNode)` |
| 14 | control-plane readiness hasControlPlanePublicationTrimOverflow | `status \|\| ACTIVE` | readPlacementStatus |
| 15-17 | replica-inventory classifyInventoryReplica | normalizeReplicaRow: status `\|\| ACTIVE`, hasNode gates on active/occupied/accountingOccupied/voter, node and raft role '' | readPlacementStatus, hasReplicaNode gates, nodeId/raftRole '' |
| 19 | leader cure collectOwnVoterFollowers | `service.nodeId &&` | hasReplicaNode |
| 20 | follow-up-move readFollowUpNodeId | `String(node_id \|\| '')` | '' unless hasReplicaNode (no `null.length` TypeError) |
| 22 | move-planner.js analyzePrioritySpread synthetic targets | built `{node_id}` read by getHealthyReplicas | now `{nodeId}` (the projected spelling the reader reads; was a round-2 spelling miss) |
Not changed (recorded): #18 inventory identity-unavailable block and #19
replicaId guard (replicaId is null only if service_id, the cache key, is
missing: unreachable); #21 in-flight-aware-replica-count (no src caller);
#23 move.nodeId null vs undefined on a FAILED-replica REMOVE (only reachable
with an unobserved node; truthiness/`||` equal). Out of the missing-field
question (round-2 decisions, listed for the verifier): service_type no longer
lower-cased; a stored '' replica_id no longer falls back to service_id; an
undecodable row now refuses the whole read.

### Witnesses (round 4)
- test/control-plane/decoded-reader-differential.test.js (+ cases module
  decoded-reader-differential-cases.js, fixture
  test/fixtures/decoded-reader-differential/head-730225bf1.json, 324 asserts):
  15 readers x every non-key column of the table's schema (+ the full row):
  nodes x6 (bootstrap topology, mesh connectivity, join-readiness cache and
  readiness ids, isCanonicallyActiveNode x2 option sets,
  resolveProjectedActiveNodeIds x2, critical-topology settling blocker over a
  stub rebalancer), services x9 (hasCanonicalActiveService, planning global
  projection full build and incremental, classifyShadowTableImpact,
  missing-versus-NULL table impact, priority-recovery scheduling owners,
  rebalancer getCurrentReplicas/getHealthyReplicas/getReadyNodeOccupiedReplicas
  for an ordinary and a system entity with a terminal-ADD projection, replica
  inventory snapshot), replica_operations x1 (rowToOperation). Each answer
  (JSON, Symbol spelled "SYMBOL", errors by code) must equal HEAD's frozen
  answer; a test asserts the dropped columns are exactly the schema's non-key
  columns (a new column enters automatically) and that no answer holds a
  Symbol. Anchor: the production membership branch selection CAS (the test
  asserts the source still contains the statement) on real SQLite, through
  extractParamUpdateData/fetchUpdatedRow, into a real SystemTableCache;
  changes = 1, the change lacks steps_history, rowToOperation returns HEAD's
  operation field by field.
  Fixture regeneration (only to change HEAD's answer, never to make the test
  pass): `git archive 730225bf1 src package.json | tar -x -C <dir>`;
  `ln -s <repo>/node_modules <dir>/node_modules`;
  `node test/control-plane/decoded-reader-differential.test.js --write-head-fixture <dir>`.
  Generated from such an archive (scratchpad r4/head-archive); identical to the
  answers of the plain-HEAD worktree wt-head.
  Discrimination: the same harness on the round-3 candidate (wt-cand) differs
  from HEAD in 9 readers (mesh status, critical topology status,
  canonical-active-service node_id, both planning projections
  service_type/node_id/status, table impact node_id, rebalancer sets status,
  inventory node_id/raft_role/status, rowToOperation 33 columns).
- test/cache/system-table-cache-observed-columns.test.js (68): N3 "an INSERT
  replacing a held row with a partial payload is marked; a merge is not"
  (partial UPDATE and UPSERT onto the held full row stay unmarked and
  uncounted; the INSERT replacement carries exactly its observed columns, is
  counted, decodes cpu_cores ROW_NOT_OBSERVED, and its notification decodes
  the same); N4 "the planning-evidence field count excludes the marker"
  (count = the carried columns; mergePlanningEvidenceRows keeps the full
  authoritative row over a marked row lacking one column, as at HEAD).

### Mutations (round 4; script scratchpad r4/mut.py, every file restored)
Files: differential / observed-columns / seed-projection / seed-projection-readers / projected-replica (baseline 0 failures each). Cells: failing assertions (! = non-zero exit).
| mutation | result |
| --- | --- |
| M1 rowToOperation without its table | 40! / 2! / 0 / 0 / 0 killed |
| M2 readDecodedRow does not map | 70! / 7! / 0 / 10! / 0 killed |
| M3 readDecodedColumn does not map | 4! killed |
| M4 services table: nodeId reads ROW_ABSENT | 2! killed |
| M5 services table: nullable partitionId reads '' | 2! killed (missing-versus-NULL case) |
| M6 rowToOperation steps_history reads ROW_ABSENT | 5! killed |
| M7 rowToOperation nullableValue column reads undefined | 4! killed |
| M8 classifyCriticalNode without `!status` | 2! killed |
| M9 readPlacementStatus without ACTIVE | 2! killed |
| M10 hasReplicaNode always true | 2! killed |
| M11 projectable set without ROW_ABSENT | 2! killed |
| M12 N4 marker counted | 4! killed |
| M13 N3 INSERT replacement not marked (the verifier's surviving "mark a held key" now required and witnessed) | 4! killed |
| M14 mark on every write, merges included | SURVIVED, equivalent: every held row is full or already marked (a partial store is always marked and the marker leaves only when the row is full), and markObservedColumns is the identity on both |
| M15 inventory without the hasNode gate | 2! killed |
| M16 never mark | 288! / 23! / 4! killed |
| M17 builder reads NOT_OBSERVED as '' | 5! / 5! / 8! killed |
| M18 INSERT notifies the stored object (verifier's M11) | SURVIVED, equivalent (the stored row and the marked copy decode alike; listeners receive clones) |

### Behaviour changes at landing (N5)
- SystemCacheQueryService (src/message-group/system-cache-query-service.js):
  `getPartitions({tableId})` and `getTables({tableName})` now filter on the
  stored column names (COLUMN.TABLE_ID, `table_name`); at HEAD they filtered
  on spellings no stored row carries and returned [] for every real row.
  Intended correction (lead src fix, lab bucket 00); visible to the CLI table
  metadata partition counts.
- Cache rows of nodes/services/replica_operations that are partial carry the
  cache-local `seed_projection` marker (like `updated_at_hlc`); whole-row
  dumps (admin/CLI) show it. countPlanningEvidenceRowFields excludes it (N4).

### Delta verifier's model (round 4: what to re-derive)
1. One applier: `git grep -n "ROW_NOT_OBSERVED" src` shows only the decoding
   module (definition, readDecodedRow/readDecodedColumn), comments, and no
   reader comparing against it; `readNotObservedAsAbsent` is gone. Every
   decode entry point in src (`decodeServicesRow|decodeServicesRows|
   decodeServicesRowColumn|decodeNodesRow|decodeReplicaOperationsRow`) is
   followed by readDecodedRow/readDecodedColumn through a declared table
   (decodeNodesRowView, readServicesRowView/decodeServicesRows,
   PROJECTED_REPLICA_NOT_OBSERVED_READING, OPERATION_ROW_NOT_OBSERVED_READING).
2. Tables against HEAD's code: rowToOperation's 37 entries against
   `git show 730225bf1:src/rebalancer/replica-operation-repository-row-methods.js`
   (raw / nullableValue / nullableSafeInteger / steps_history); the two
   normaliser tables against HEAD's system-row-normalizers.js
   normalizeServiceRow / normalizeNodeRow; the projected-replica consumer
   fixes against the census table above (HEAD line refs in the agent report,
   reproduced in the table).
3. Differential: run the test; regenerate the fixture from a fresh HEAD
   archive with the recipe and diff it against the committed fixture (must be
   byte-identical); run the cases module against the round-3 candidate to
   see it fail (scratchpad r4/run-diff.mjs <tree> cur|head).
4. N3 (INSERT replacement marked; merges not) and N4 (field count) witnesses
   in the observed-columns test; mutation table above (M14/M18 equivalent,
   argued).
5. Runs and gates below.

### Runs (round 4, local, thermal-gated, LAGRANGE_PLACEMENT=local)
- The 28 integration files calling applySystemTableChange (batches of 4):
  26 green; 2 red, both BASE-RED: minimal-deployment-runtime-access-policy-
  live-validation and minimal-deployment-call-cell-invocation-live fail with
  "ControlPlaneReadinessService refused construction: messageRouter must be
  an object with on()" on the candidate AND on plain HEAD 730225bf1 (wt-head,
  same subtests, same counts); unrelated to decoding (also red in round 2).
- Directories: test/cache 26/26 files (1158 asserts), test/bootstrap 219/219
  (7074), test/rebalancer 262/262 (11449), test/control-plane 213/213
  (11952). All green.
- After the final readDecodedColumn refactor (column-keyed, literal
  guideline): the 38 files that import the decoders / readiness planning /
  the new witnesses re-run green (2565 asserts); M3/M5 re-killed.

### Gates (round 4, staged tree)
- `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit`: exit 0 (first runs
  failed the literal guideline on field-name string literals; fixed by a
  column-keyed readDecodedColumn and decodeServicesRowColumnView).
- test:duplication 0 (42/42, 639/639); audit:guideline:navigability 0 (prints
  tighten hints owner_port_feature_detection 2124->2020,
  inheritance_depth_over_two 65->58, typeof_dual_paths 621->596,
  alias_exports 40->38: not this change, left for the lead);
  audit:file-size 0; test:metadata:refresh run.
- Probe `--metric --rows formation_system_tables_without_decoder`: 0, exit 0.
- Budget rows unchanged: raw-read 1008/1008, identity_keyed_module_state
  87/87 (no module state added: every table is a module constant),
  legacy_term_identifiers 2924/2924, row_field_alias_reads 741/741,
  state_read_defaults 402 (the HEAD readings are written without `||`/`??`
  chains), two_source_fallback_reads 1774/1789, catch_returns_default
  386/387. No cap raised.
Scratch worktrees wt-cand / wt-head removed at hand-back.

### round 4b (behaviour fixes)
Lead ruling 2026-11-09 on round 4, item 2: the three differences the round-4
census listed are bound to HEAD's behaviour. Staged on top of round 4 (HEAD
730225bf1).

(a) service_type lower-cased where HEAD's normalisers lower-cased it.
HEAD: `normalizeServiceRow` (system-row-normalizers.js, `readLowerText` on
serviceType, raftRole, status) and the census normaliser
`normalizeCensusServiceRow` (membership-publication-priority-partition-
summary.js, `readOwnLowerPrimitiveString`). status and raft_role are closed
domains the decoder already canonicalises case-insensitively; service_type is
free TEXT. One version: `readNormalizedServiceType` (services-row-decoder.js),
applied by `readServicesRowView` (every normaliser reader, the planning
record included), `decodeServicesRowColumnView` (column service_type; no
caller today) and the census's `readCensusReplica`. Not applied where HEAD
compared the stored value raw: `getNodesWithoutLocalReplica`
(move-planner-state-methods.js, HEAD `service?.service_type ===
MESSAGE_GROUP`) now reads the decoded row through its own declared reading
(`LOCAL_ACCESS_SERVICE_READING`: serviceType/status, unobserved ->
ROW_ABSENT, HEAD's missing key undefined) instead of the lower-cased view.

(b) a stored '' replica_id falls back to service_id where HEAD did. HEAD
derived a replica's identity as `replica_id || service_id` (inventory
`firstTextField`, the raw-row consumers now reading projected replicas); the
one owner of that derivation is `projectReplicaFromServicesRow`
(`hasStoredReplicaId`: a non-empty string, else serviceId). The normaliser
view keeps '' (HEAD `readText` gave '' there, no fallback).

(c) per-row refusal on every multi-row read. Mechanism
(system-table-row-decoding.js): `readEachSystemTableRow(decoding, rows,
reader, readRow)` runs the reader's decoding per row; a
SystemTableRowDecodeError of that table excludes the row and is recorded by
the table's named diagnostic `SystemTableRowRefusals` (held by the table's
decoding, created in defineSystemTableDecoding: `excludedRowCount`, warn
`System-table row refused by its decoder; excluded from this read` with
table/reader/projection/column/reason/value/count at counts 1, 2, 4, 8, ...,
the cache's observed-columns cadence; subsystem system-table-row-decoding).
Any other error, and another table's refusal, propagates. Owners read the
count through `readServicesRowRefusalCount` / `readNodesRowRefusalCount` /
`readReplicaOperationsRowRefusalCount`. Per-table entries: readEachServicesRow,
readEachNodesRow, readEachReplicaOperationsRow; derived: decodeServicesRows
(views), projectReplicasFromServicesRows, decodeNodesRowViews,
excludeRefusedNodesRows (stored rows for readers that hand rows on to
per-row predicates), repository `rowsToOperations(rows, reader)`. Every
multi-row reader names itself (a module constant).
Census of multi-row decode paths (grep of the decoder entry points and
rowToOperation over src; each converted):
- services: decodeServicesRows callers (active-node-projection x2, planning
  global projection service-fallback ids, table-impact service-fallback
  membership); projectReplicasFromServicesRows callers (admin control
  snapshot, candidate derivation census, placement observation memo,
  surplus-remove fence, budget admission inventory, topology guard);
  readProjectedReplicas (replica state), getNodesWithoutLocalReplica,
  collectEligibleVoterHosts (leader cure), scheduling-owner policy,
  buildPriorityServiceRecords (prefilter column and whole row).
- nodes: bootstrap topology active ids, join-readiness cache/readiness
  active ids, active-node selection (nodeRowsById), candidate derivation
  formation placement ids and publication node-row ids, critical topology
  (rows excluded at the read, before classification and known-node ids),
  mesh connectivity (cache rows and bootstrap snapshot rows excluded at the
  two sources; the per-row resolvers then read accepted rows only).
- replica_operations: repository entity reads (terminal failed-create
  cleanup, entity in-flight replica ids, getAllOperations cache+SQL,
  getOperationsByEntity cache+SQL, authoritative observation cache+SQL,
  concurrent REMOVE count), incomplete reads (mapAndSortIncompleteOperations,
  cluster-wide incomplete), message-group membership debt census,
  queryExistingInFlightOperation SQL+cache, budget admission
  getCacheVisibleEntityOperations, recovery observation
  findObservedProgressOperationIds (per-row predicate over cache rows).
Single-row reads unchanged (typed refusal): rowToOperation by id
(read-methods matchingRow / rows[0], observed-state cachedRow, workflow
dispatch, membership recovery, replace-owner wake), the planning
incremental current record and table-impact records, active-node per-row
predicates (isCanonicallyActiveNode called by a caller with one row).
Semantics to state at landing: an excluded row is absent from that read; a
nodes row with an unknown status was a TRANSITIONAL critical node at HEAD
and is now absent from the critical-topology read; the membership debt
census answers `available: true` without a refused row (counted, warned).
The diagnostic is process-wide per table (state held by the decoding, not
identity-keyed; budget row identity_keyed_module_state unchanged at 87):
lead to confirm this host versus an owner-instance diagnostic, which would
need a sink threaded through ~40 readers.

Witnesses:
- test/control-plane/decoded-reader-differential.test.js (415 asserts; was
  321) + cases module: behaviour cases answered by HEAD (fixture key
  `behaviour`) and by this tree on fixed full rows: services
  `upper-case-service-type` and `empty-replica-id` over every services reader
  (+ new census reader `services:priority-partition-census`, HEAD raw rows vs
  projected replicas); `unknown-status-row-excluded` for services (4
  multi-row readers + census), nodes (4 multi-row readers) and
  replica_operations (repository getOperationsByEntity, cache-first): this
  tree reads 3 rows, HEAD's frozen answer is its reader on the other 2; each
  reader's diagnostic delta >= 1, and exactly 1 for one read per table
  (inventory snapshot, bootstrap topology, operations-by-entity). Plus: a
  single-row decode keeps the typed refusal; another table's refusal inside
  a per-row read propagates; the one-column view lower-cases service_type;
  the warn fires exactly at power-of-two counts with reason/column/reader.
  Fixture regenerated by the recipe from `git archive 730225bf1 src
  package.json` (scratchpad r4b/head-archive): the `cases` and anchor parts
  are byte-identical to round 4 (diff is a pure addition of `behaviour`);
  re-running the recipe reproduces the file byte-for-byte (sha256
  58d4fd7f4a5c0bc332ef4a0b43f7520a0fb9cfa53e0c24e9d1a326a389d6980a).
- test/rebalancer/projected-replica.test.js: '' replica_id -> service_id;
  projectReplicasFromServicesRows excludes and counts a refused row (was:
  the whole read refused).
- test/rebalancer/unified-rebalancer-node-readiness-replica-state.test.js:
  getNodesWithoutLocalReplica keeps comparing the stored service_type as
  stored (an upper-case MESSAGE_GROUP row does not satisfy local access).

Mutations (script scratchpad r4b/mut.py; cells = failing asserts in
differential / projected-replica, ! = non-zero exit; every file restored):
| mutation | result |
| --- | --- |
| M1 view keeps service_type case | 5! / 0 killed |
| M2 census keeps service_type case | 2! / 0 killed |
| M3 stored '' replica_id kept | 3! / 1! killed |
| M4 refusal fails the whole read | 26! / 1! killed |
| M5 excluded but not counted | 16! / 1! killed |
| M6 warn on every count | 2! / 0 killed |
| M7 decodeServicesRows maps the whole read | 6! / 0 killed |
| M8 projectReplicasFromServicesRows maps the whole read | 6! / 1! killed |
| M9 decodeNodesRowViews maps the whole read | 6! / 0 killed |
| M10 rowsToOperations maps the whole read | 4! / 0 killed |
| M11 readProjectedReplicas decodes the whole read | 3! / 0 killed |
| M12 critical topology without exclusion | 3! / 0 killed |
| M13 active-node selection without exclusion | 3! / 0 killed |
| M14 another table's refusal swallowed | 2! / 0 killed |
| M15 column view keeps service_type case | 2! / 0 killed |
| M16 getNodesWithoutLocalReplica reads lower-cased | node-readiness test 1 subtest killed |

Runs (local, thermal-gated, LAGRANGE_PLACEMENT=local, classified runner):
first run of test/cache + test/control-plane + test/rebalancer (501 files):
1 red, candidate-caused: priority-partition-census-self-diagnosis-adversarial
"captured string normalization" (the census runs under a mutated
String.prototype.toLowerCase; readNormalizedServiceType used the ambient
method). Fixed: services-row-decoder captures toLowerCase at load (the one
version is hardened like the census). Re-run of the three directories plus
the 10 test files importing the changed bootstrap modules (511 files): all
green (28,803 asserts). M1/M2/M15 re-killed after the fix.

Gates (staged tree): `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit` 0
(file-size 26/26: operation-workflow-recovery-observation.js kept at 798
lines; the navigability legacy-term check caught reader constants named
*FALLBACK*, renamed); test:duplication 0 (639/639); audit:guideline:
navigability 0 (same four tighten hints as round 4); audit:file-size 0;
test:metadata:refresh run; probe 0. Budget rows unchanged: raw-read
1008/1008, identity_keyed_module_state 87/87, legacy_term_identifiers
2924/2924, row_field_alias_reads 741/741, state_read_defaults 402,
two_source_fallback_reads 1774/1789, catch_returns_default 386/387. No cap
raised.

### round 4c (refusal readings)
Lead rulings 2026-11-09 on round 4b (quest log, last decision): the counter
is accepted as is; a refused row must not move a decision away from
fail-closed. Implemented: every multi-row read declares its refusal reading
once, beside the reader, like the not-observed tables.

Mechanism (system-table-row-decoding.js):
- `defineRefusalReading(decoding, reader, {exclude: justification} |
  {substitute: name, read})`, per-table binders define<Table>RefusalReading.
- `readEachSystemTableRow(decoding, rows, refusalReading, readRow, owner)`
  requires the reader's declared reading (a missing or foreign one throws);
  a refusal of that table is counted (SystemTableRowRefusals, now
  `refusedRowCount`; the warn names the reader and its refusal reading) and
  read as declared: left out, or `read(row, error, owner)`.
- The HEAD substitute `decodeSystemTableRowAsStored(decoding, row)`
  (STORED_ROW_HEAD_READING): the refused row in the decoded shape as the
  code before the decoders read it. Each column decodes alone; a column the
  decoder refuses carries its stored value (an unknown closed-domain value
  lower-cased as the folded normalisers read it; an unknown value matches no
  state in either case), SQL NULL ROW_ABSENT, an unparseable JSON list and a
  missing column ROW_NOT_OBSERVED (the reader's not-observed table gives its
  reading, as for a partial row). Only a non-row refuses.
- Factories so a reader declares in one line: defineServicesViewRefusalAsStored,
  defineProjectedReplicaRefusalAsStored, defineNodesViewRefusalAsStored,
  defineNodesEntryRefusalAsStored (decodeNodesRowEntries: `{nodeRow, node}`),
  defineOperationRefusalAsStored (repository rowToOperationAsStored, via the
  read's owner; rowToOperation now = operationFromDecodedRow(decode(row))).
- Tests' fixture projections go through `projectFixtureReplicas`
  (test/test-helpers/system-table-row-fixture.js, a HEAD-reading declaration);
  17 test files switched from the bare call.

Audit (every converted multi-row reader; the reachable refusal is an
unknown status/raft_role, which HEAD read as a non-canonical string; HEAD
also read every other refused value raw). Question: can excluding the row
move the decision toward less safe? Every reader below can, so none
declares exclude; each declares a substitute matching HEAD, except the two
ruled ones.
| # | reader (file) | what a dropped row would do | declared |
| --- | --- | --- | --- |
| S1 | isCanonicallyActiveNode services (active-node-projection) | an ACTIVE service row refused on raft_role no longer counts its node active: fewer nodes | HEAD view |
| S2 | resolveProjectedActiveNodeSelection services (same) | same, for readiness-only candidates | HEAD view |
| S3 | planning active-service node ids (readiness-planning-global-projection) | fewer service-fallback nodes in the planning projection | HEAD view |
| S4 | planning active-service membership (table-impact) | a change judged "unchanged": a stale projection reused | HEAD view |
| S5 | admin control-snapshot placement observation | a holder missing from the observation the owner acts on | HEAD projected |
| S6 | derived priority-partition census (candidate derivation) | a holder uncounted: spread/census decisions on fewer holders | HEAD projected |
| S7 | priority placement observation memo | same census, memoised | HEAD projected |
| S8 | priority surplus-remove fence inventory | an occupied replica uncounted: a REMOVE fence decided on fewer replicas | HEAD projected |
| S9 | priority budget admission inventory | occupancy undercounted: a create admitted over the lane budget | HEAD projected |
| S10 | rebalance coordinator topology guard inventory | same, topology guard | HEAD projected |
| S11 | readProjectedReplicas (getCurrentReplicas etc.) | a current replica hidden: an extra ADD, a node counted free | HEAD (decoded as stored, then the selector) |
| S12 | getNodesWithoutLocalReplica (move planner) | an ACTIVE message-group row hidden: a node judged without local access | HEAD (decoded as stored, its own reading) |
| S13 | collectEligibleVoterHosts (leader cure) | a voter host missing: leader placed against stale hosts | HEAD view |
| S14 | priority-recovery scheduling owners | a live leader missing: scheduling owner moved | HEAD view |
| S15 | planning priority service records | a priority service record missing | HEAD view (as stored, then the same partition filter) |
| N1 | bootstrap topology active node ids | fewer active ids in the bootstrap snapshot meta | HEAD view |
| N2 | join readiness cache active node ids | fewer active ids for join readiness | HEAD view |
| N3 | join readiness readiness-service active ids | a node never asked: fewer active ids | HEAD view |
| N4 | active-node selection nodes rows | a node dropped from the projected active set | HEAD view (entries `{nodeRow, node}`; isCanonicallyActiveNodeView / the two liveness helpers take the view; the exported single-row isCanonicallyActiveNode keeps the typed refusal) |
| N5 | candidate derivation formation placement node ids | a joining node missing from formation placement | HEAD view |
| N6 | candidate derivation publication node-row ids | widening judged without node-row evidence | HEAD view |
| N7 | critical topology (getCriticalSystemTopologySettlingBlocker) | the refused node unknown: critical work unblocked | RULED: named substitute "transitional critical node" (row kept; startup authority and cohort check read it; then TRANSITIONAL) |
| N8 | mesh connectivity cache rows | a peer never connected: a ready-connection wait passes without it | HEAD (row kept; the per-row resolvers read the mesh read's rows as stored, meshNodeView) |
| N9 | mesh connectivity bootstrap snapshot rows | same | HEAD (same) |
| O1-O6 | repository entity reads: terminal failed-create cleanup, entity in-flight replica ids, getAllOperations, getOperationsByEntity, authoritative observation, concurrent REMOVE count | an in-flight operation hidden: an admission gate opens, a duplicate operation, a REMOVE budget undercounted | HEAD operation |
| O7-O8 | incomplete reads (owner read, cluster-wide ledger writers) | an incomplete operation never resumed or never parked against | HEAD operation |
| O9 | queryExistingInFlightOperation (SQL and cache) | a duplicate move admitted | HEAD operation |
| O10 | budget admission getCacheVisibleEntityOperations | the create lane judged free | HEAD operation |
| O11 | recovery observation findObservedProgressOperationIds | an observed progress operation missed | HEAD operation |
| O12 | message-group membership debt census | a debt hidden while answering available | RULED: named substitute "membership debt census unavailable" (any refused row -> {available: false}) |
Counts: services 15 readers (17 call sites with the active-node pair and
the planning pair), nodes 9, replica_operations 12 readers (15 call sites).
Exclude: none. Single-row reads unchanged (typed refusal).

Witnesses (test/control-plane/decoded-reader-differential.test.js, 425
asserts): the behaviour cases are now `unknown-status-row-refused` for
services (5 multi-row readers incl. the census), nodes (4, incl. critical
topology) and replica_operations (operations-by-entity and the new
membership-debt-census reader): this tree's answer on the three rows equals
HEAD's frozen answer on the same three rows (critical topology: the blocker
names n-3 unready, HEAD's TRANSITIONAL reading); the debt census is the one
`ruled` reader: it must answer {available: false, operations: []} and the
test asserts HEAD answered otherwise (HEAD listed the refused operation).
Each refused read is counted (exactly 1 for inventory, critical topology,
debt census). New: exclude vs HEAD substitute on one read; a refusal
reading is exactly one of exclude/substitute; a multi-row read without its
declared reading throws. Fixture regenerated by the recipe from the HEAD
archive: `cases` and the anchor are deep-equal to round 4b; `behaviour`
regenerated (renamed cases, no reduced HEAD reads, the debt census added).
test/rebalancer/projected-replica.test.js: HEAD substitute and exclude.

Mutations (round 4c; scratchpad r4b/mut.py with r4b/mutlist.py; cells =
failing asserts in differential / projected-replica, ! = non-zero exit;
every file restored). All 27 killed:
| mutation | result |
| --- | --- |
| M1 view keeps service_type case | 5! / 0 |
| M2 census keeps service_type case | 2! / 0 |
| M3 stored '' replica_id kept | 3! / 1! |
| M4 refusal fails the read | 31! / 1! |
| M5 refused but not counted | 17! / 1! |
| M6 warn on every count | 2! / 0 |
| M7 every refusal excluded (substitutes ignored) | 13! / 1! |
| M8 an exclude reading substitutes | 4! / 1! |
| M9 as-stored state not lower-cased | 8! / 1! |
| M10 as-stored refuses again | 14! / 1! |
| M11-M14 decodeServicesRows / projectReplicasFromServicesRows / decodeNodesRowViews / rowsToOperations bypass the read | 8! / 0; 6! / 1!; 5! / 0; 6! / 0 |
| M15 readProjectedReplicas excludes | 2! / 0 |
| M16 critical topology: refused node excluded (ruled substitute) | 3! / 0 |
| M17 critical topology: refused node is no critical node (its switch case returns null) | 3! / 0 (re-run after the switch refactor; M8, M16, M20 also re-killed) |
| M18 debt census: refused row read as stored (HEAD; ruled substitute) | 2! / 0 |
| M19 debt census: refused row dropped | 2! / 0 |
| M20 active-node selection entries exclude | 2! / 0 |
| M21 operation readers exclude | 2! / 0 |
| M22 another table's refusal swallowed | 2! / 0 |
| M23 column view keeps service_type case | 2! / 0 |
| M24-M26 view / projected / nodes-view HEAD substitutes exclude | 4! / 0; 3! / 1!; 2! / 0 |
| M27 a multi-row read accepted without its declared reading | 2! / 0 |
(M16 node-readiness test from 4b: getNodesWithoutLocalReplica case witness unchanged.)

Gate fixes in this round: the navigability baseline is keyed by function
name, so the active-node judgement keeps its name (isCanonicallyActiveNode
takes the selection's view as an optional third argument; two-argument
callers decode the row, single-row refusal); the critical classification
routes a refused row through its one switch (a module-private Symbol key
CRITICAL_REFUSED_NODE, never a stored status) instead of an independent if
(decision-boundary R07); defineRefusalReading validates `read instanceof
Function` (no owner-port typeof) and its shape message is a named constant.

Runs (local only, per the owner's lab constraint; thermal-gated,
LAGRANGE_PLACEMENT=local, classified runner): test/cache + test/control-plane
+ test/rebalancer + every test file importing the changed bootstrap modules
or the fixture projection (522 files, 25,080 asserts): 521 green; 1 red,
host/timing: partition-service-raft-noop-cdc-placement hit the 30 s TAP
timeout under the parallel lane (as in round 3), 10/10 green alone.
Differential 425/425, projected-replica 8/8, membership-swim-consume 11/11.

Gates (staged tree): pre-commit 0 (file-size 26/26: active-node-projection
798, topology guard 795, recovery observation 799 lines); test:duplication 0
(639/639); audit:guideline:navigability 0 (same four tighten hints);
audit:file-size 0; test:metadata:refresh run; probe 0. Budget rows
unchanged: raw-read 1008/1008, identity_keyed_module_state 87/87,
legacy_term_identifiers 2924/2924, row_field_alias_reads 741/741,
state_read_defaults 402, two_source_fallback_reads 1774/1789,
catch_returns_default 386/387, owner_port_feature_detection 2020. No cap
raised.

## round 5 (HEAD-faithful decoding + stream merge)

Start 2026-11-09: HEAD 730225bf1, staged candidate 447 paths (rounds 1-4c).
Implements the lead's altitude-check decision (quest log, last finding,
after the round-4 delta verification REJECT: B1, N1-N7): the decoders read
like HEAD; strictness moves to a follow-up quest paired with register-service
write validation. Work in progress; sections are appended as they complete
(handover). Round-4c candidate saved as scratchpad r5/r4c-candidate.patch
(throwaway worktree r5/wt-r4c = HEAD + that patch, the discrimination tree).

### Part A mechanism (what exists now)
- Decoder (system-table-row-decoding.js): every stored value is kept as
  stored, case included. A state column decodes to its stored text only when
  that text is exactly a vocabulary value; any other stored value of any
  column (unknown or differently-cased state, wrong type, `undefined`, a
  JSON-array text holding no array) decodes to the named state
  `{state: ROW_UNRECOGNISED, raw}` (frozen; `isRowUnrecognised`). SQL NULL
  is ROW_ABSENT in every column (NULL in a NOT NULL column is no longer
  refused). The only refusals left: a non-row, the projection contract (a
  missing column of an unmarked row, an extra or camelCase column, a
  malformed seed marker; rounds 1-3 rulings, unreachable for cache rows
  whose seeders all declare projections) and the declared refusing JSON
  column replica_operations.steps_history (the earlier ruling;
  `refusingJsonArrays`). nodes.capabilities holding no array is
  unrecognised, not refused (HEAD never parsed it at a reader).
- One applier, readDecodedRow / readDecodedColumn: ROW_NOT_OBSERVED reads as
  the reader's declared reading (unchanged), ROW_UNRECOGNISED as its raw
  value. A folded normaliser's reading (`defineNormalizerReading`, used by
  the two normaliser tables SERVICES_ROW_NORMALIZER_READING and
  NODES_ROW_NORMALIZER_READING) additionally reads as HEAD's readText /
  readLowerText: a stored NULL (and a missing value) as the field's declared
  reading ('' for NOT NULL fields, ROW_ABSENT for the nullable services
  fields, round 2), any other value as its text (String()), lower-cased for
  services serviceType/raftRole/status and nodes status/connectionState.
  `readNormalizedServiceType` and the services-decoder captured toLowerCase
  are gone (the one captured copy lives in the decoding module).
- Raw readers keep the raw value: projected replicas
  (projectReplicaFromServicesRow) and rowToOperation carry the stored text;
  each consumer that lower-cased or defaulted at HEAD does so at the reader
  (consumer table below). rowToOperation reads a NULL steps_history as []
  (HEAD `if (row.steps_history)`).

### Removed (one version, no unused code)
defineRefusalReading, readEachSystemTableRow, decodeSystemTableRowAsStored
(columnAsStored), STORED_ROW_HEAD_READING, SYSTEM_TABLE_ROW_REFUSAL_KIND,
SystemTableRowRefusals (refusal counter + warn, LoggingService import),
readSystemTableRowRefusalCount and the three read<Table>RowRefusalCount,
define<Table>RefusalReading, readEach<Table>Row, defineServicesViewRefusalAsStored,
readServicesRowViewAsStored, decodeServicesRowAsStored,
defineNodesViewRefusalAsStored, defineNodesEntryRefusalAsStored,
decodeNodesRowViewAsStored, decodeNodesRowEntries, decodeNodesRowColumn and
defineNodesNotObservedReading (no caller), decodeReplicaOperationsRowAsStored,
defineProjectedReplicaRefusalAsStored, projectReplicaFromServicesRowAsStored,
defineOperationRefusalAsStored, repository rowsToOperations /
rowToOperationAsStored / operationFromDecodedRow (folded back into
rowToOperation), the critical-topology CRITICAL_REFUSED_NODE substitute,
the membership debt census "unavailable" substitute, the refusal enum values
NULL_IN_NOT_NULL_COLUMN / WRONG_TYPE / UNKNOWN_STATE, the test helper
projectFixtureReplicas (17 test files call projectReplicasFromServicesRows
directly again) and every `*_REFUSAL` reader constant. Reader files whose
only round-4b/4c change was the refusal reading are restored to HEAD
byte-for-byte: replica-operation-repository-{entity-read,incomplete-read,
read,message-group-membership}-methods.js, operation-workflow-recovery-
observation.js; bootstrap-topology-snapshot.js, join-readiness-snapshot-
methods.js, join-readiness-mesh-connectivity-methods.js and
unified-rebalancer-critical-topology-methods.js are HEAD with
normalizeNodeRow(row) -> decodeNodesRowView(row) (plus two doc lines in the
mesh file).

### Consumers that read the raw value (HEAD comparison per consumer)
The projected replica now carries the stored text (it carried the
canonical value since round 2). Every consumer of a projected replica's
status / raftRole / serviceType was re-read against HEAD's code at the same
place; where HEAD lower-cased or defaulted, the reader does so again:
| consumer | HEAD reading | round 5 |
| --- | --- | --- |
| projectPriorityTerminalCreateTargets (unified-rebalancer-replica-state.js) | normalizeServiceRow(row).status (lower, absent '') | readLowerCaseReplicaText(status); '' back in the projectable set (HEAD's set restored, ROW_ABSENT entry removed) |
| getCurrentReplicas / follow-up partition replicas selectors | normalizeServiceRow (lower) | the services view (lower) - unchanged |
| collectOwnVoterFollowers (leader cure) | normaliser: status lower, `serviceId \|\| replicaId` | readLowerCaseReplicaText(status); identity serviceId else replicaId restored (N6) |
| collectEligibleVoterHosts (leader cure) | normaliser | services view - unchanged |
| classifyInventoryReplica (replica-inventory.js) | normalizeReplicaRow: trimmed text, `(status \|\| ACTIVE).toLowerCase()`, raft role lower, identity '' -> REPLICA_IDENTITY_UNAVAILABLE | HEAD's text() reading over the projected fields; the identity-unavailable branch restored (N6) |
| hasControlPlanePublicationTrimOverflow (control-plane readiness) | `String(status \|\| ACTIVE).toLowerCase()`, raft role lower | readLowerCaseReplicaText(readPlacementStatus), raft role lower |
| calculateMoves leader check (move calculation) | `raft_role.trim().toLowerCase()` | restored |
| calculateMoves failed-replica loop | `replica.status \|\| ACTIVE` | readPlacementStatus (round 4c read raw status) |
| getHealthyReplicas / getReadyNodeOccupiedReplicas / activePlacementReplicas | raw `status \|\| ACTIVE` | readPlacementStatus, now also '' -> ACTIVE (HEAD falsy) |
| priority census readCensusReplica | normalizeCensusServiceRow: serviceType, raftRole, status lower | readOwnLowerPrimitiveString on all three (HEAD's helper) |
| current priority placement selectCurrentVoter | readOwnLowerPrimitiveString(raft role) | restored |
| getNodesWithoutLocalReplica | raw service_type/status compare, node_id non-empty string | decoded values raw (LOCAL_ACCESS_SERVICE_READING); node filter hasReplicaNode restored |
| placement-owner-evidence normalizeRaftRole, isVoterRaftRole / isCatchupLearnerRaftRole / isExplicitNonLeaderRaftRole | lower-case internally | unchanged |

### N6 guards restored
bootstrap-topology-snapshot / join-readiness snapshot (HEAD files: empty
nodeId skipped), active-node-projection (empty nodeId in isCanonicallyActiveNode,
hasFreshProjectionLiveness, shouldAllowLivenessFallbackProjection and the
selection loop; serviceId non-empty in hasCanonicalActiveService),
candidate derivation publication node-row ids (nodeId.length > 0 filter),
critical topology collectKnownNodeIds (HEAD file), replica inventory
identity branch, leader cure identity order, planning
resolveChangedServiceRecords (HEAD returned null - a full rebuild - for a
change whose previous or current row has no service id; round 2 had dropped
it).

### N7
The four stale "excluded from this read" comments are gone with the readers'
refusal declarations. The round-4c notes name `isCanonicallyActiveNodeView`;
no such function ever existed: the selection passes the view as
isCanonicallyActiveNode's optional third argument (now: "The selection hands
the view it decoded; another caller's row is decoded here").

### Census of single-row decodes in loops, filter predicates and maps (fresh, round 5)
Method: `grep -rn "rowToOperation\b|rowToOperation?\.|decodeNodesRowView|decodeServicesRows|decodeNodesRowViews|projectReplicaFromServicesRow\b|projectReplicasFromServicesRows|decodeServicesRowColumnView|readServicesRowView|decodeServicesRow\b" src`
(optional calls and filter predicates included), each site read in place.
Every decode below now accepts every value HEAD accepted; the only
refusals reachable from a stored cache/SQL row are the earlier-ruled
malformed steps_history and the projection contract.
| site | shape | witness (differential behaviour reader) |
| --- | --- | --- |
| replica-operation-repository-entity-read-methods.js:42 queryTerminalFailedCreateCleanupOperations | map | replica_operations:terminal-failed-create-cleanup |
| entity-read :70 getEntityInFlightReplicaIds | for loop | :entity-in-flight-replica-ids |
| entity-read :101/:107 getAllOperations (cache, SQL) | map | :all-operations (cache) |
| entity-read :123/:132 getOperationsByEntity (cache, SQL) | map | :operations-by-entity, :operations-by-entity-sql |
| entity-read :157/:199 getOperationsByEntityAuthoritativeObservation | map | shares the map shape; not run (needs the planning snapshot owner) |
| entity-read :264 getConcurrentRemoveCount (SQL) | map + filter | :concurrent-remove-count-sql |
| incomplete-read :92 mapAndSortIncompleteOperations | map | :incomplete-operations |
| incomplete-read :330 queryClusterWideIncompleteOperations | map | :cluster-wide-incomplete |
| read-methods :632/:654 queryExistingInFlightOperation (SQL, cache) | map | :existing-in-flight-operation (SQL) |
| message-group-membership-methods :57 debt census | map | :membership-debt-census |
| rebalance-coordinator-priority-budget-admission :358 getCacheVisibleEntityOperations | map (coordinator rowToOperation) | :budget-admission-cache-visible-operations |
| operation-workflow-recovery-observation :287 findObservedProgressOperationIds | filter predicate | :observed-progress-predicate |
| operation-workflow-replace-owner-wake :285 wakeRemoteReplaceOwners (B1) | for loop in a detached promise | :replace-owner-wake-loop (an abort is recorded from unhandledRejection) |
| operation-workflow-message-group-membership-recovery :275 replicatedRowOwesLearnerTurn (B1; cacheHintCandidateIds, laneOwesLearnerTurn, debtWakeRoute) | filter predicate | :membership-recovery-hint-predicate (sweep, operation-row wake, services-row lane wake) |
| single-row: observed-state :146, read-methods :318/:329/:451/:526/:560, recovery-observation :205/:459, dispatch-execution :347, coordinator wrapper | one row | :row-to-operation-subject |
| nodes: critical topology :85/:176, active-node :393/:495, join-readiness :548/:566, bootstrap topology :28 (loops); mesh :79/:88 (inside filter loops); candidate derivation :230/:418 (map) | loop / map | every NODES_CASES reader on every nodes behaviour case |
| services: decodeServicesRows (active-node x2, planning, table impact, scheduling owners, leader cure), projectReplicasFromServicesRows (admin, derivation, memo, fence, budget admission, topology guard), readProjectedReplicas, getNodesWithoutLocalReplica (map); planning buildPriorityServiceRecords loop with the readServicePartitionId prefilter, priorityServiceChangeAffectsProjection and canReuseOrdinaryTopologyProjection loops (column view) | map / loop | every ALL_SERVICES_READERS reader on every services behaviour case |

### Witnesses (round 5)
- test/control-plane/decoded-reader-differential.test.js (504 asserts) +
  cases module: behaviour cases now run EVERY reader (single-row ones
  included) on: services upper-case-service-type, empty-replica-id,
  unknown-status, upper-case-known-values ('ACTIVE'/'Active', 'LEADER'),
  unknown-raft-role, wrong-type-and-null-status (created_at 'yesterday',
  group_id 7, status NULL), empty-status; nodes unknown-status,
  upper-case-known-values, unknown-connection-state,
  wrong-type-lease-and-null-connection-state; replica_operations
  known-values, unknown-status, upper-case-known-values ('PENDING', type
  'add'), unknown-step-and-wrong-types ('WEIRD_STEP', 'SPLIT', lease 'soon',
  created_at '5'), null-steps-history, each over the 15 rowToOperation
  readers of the census table (loop sites included). Every answer must equal
  HEAD's frozen answer; no ruled readers, no refusal counts.
  Fixture regenerated by the recipe from `git archive 730225bf1 src
  package.json` (scratchpad r5/head-archive): `cases` and the anchor are
  identical to round 4c; `behaviour` regenerated; re-running the recipe is
  byte-identical (sha256 39cd86a1559bb1cd932cb4c187f7b419c6081bf162049525488bb09f51bdb03c).
  Discrimination: the cases module run on the round-4c tree (r5/wt-r4c,
  runner r5/run-behaviour.mjs) differs from HEAD in 51 of 153 answers (before
  the two added services cases), among them B1 exactly: the wake loop
  `{aborted: [SYSTEM_TABLE_ROW_DECODE_REFUSED], woken: [op-1]}` where HEAD
  woke op-1 and op-2, the hint predicate refused, the debt census
  unavailable, N1 upper-case known values, N3 the single-row planning reads
  refused, N5 a NULL steps_history TypeError.
- system-table-row-decoders.test.js: ROW_UNRECOGNISED for every
  differently-cased / unknown / '' state, wrong types, undefined, NaN and
  non-array JSON (capabilities); NULL is ROW_ABSENT in every column;
  steps_history still refuses malformed JSON.
- projected-replica.test.js: values kept as stored, readLowerCaseReplicaText,
  readPlacementStatus ('' and NULL -> ACTIVE), unknown/wrong-typed values
  projected as stored, the multi-row projection reads every row.
- rebalancer-entity-interaction-contract.test.js: the untyped-row replay
  expectation is HEAD's again ("Unsupported rebalancer entity type": a NULL
  entity_type is no longer a decoder refusal; HEAD's identity assertion
  refuses it) - only the production-shaped row construction differs.

### Runs so far (round 5, Part A, local, thermal-gated)
test/cache 26/26; test/control-plane 213/213; test/rebalancer 384 files,
1 red, candidate-caused and fixed (the entity-contract expectation above;
25/25 alone after the fix); test/bootstrap: run interrupted (Claude Code
reaped the background run for low system memory) after one red,
fresh-join-via-non-seed-node.integration (120 s timeout under load,
unclassified); the extra list (85 files importing the fixture/projection
outside the four directories, r5/extra-files.txt) not run.
Pre-commit (LAGRANGE_SOLVER_LANDING=1) exit 0 on the Part A staged tree.

### HANDOVER (round 5 stopped here)
State: Part A implemented and staged (index = round 4c + round 5 Part A).
Not done: bootstrap + extra runs, mutations (script ready: scratchpad
r5/mut.py, 15 mutants M1-M15, run `python3 r5/mut.py`), gates other than
pre-commit, Part B (stream merge) not started (origin stream fetched at
8d792cca5). Throwaway worktree r5/wt-r4c (HEAD + r4c patch) still exists
for discrimination runs; remove with `git worktree remove --force`.
