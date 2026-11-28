# Seal and contract check (removal (a)), supersession list (C5)

Quest `transaction-redundant-progress-writes`, stage 0b, at `ab347e962`. **[V]** verified
(read, or measured with the output named), **[I]** inferred. Outputs are in
`/mnt/data/peter/projects/lagrange-oltp-perf-20261128/lab/` (`td-stage0/`,
`td-stage0b/`, `td-design-review/`). Scope: removal (a), the ACTIVE participant row,
only; what stage 0 found for the deferred removal (b) is in
`deferred-prepared-status-removal.md`.

Verdicts: **untouched** (the change cannot contradict it), **consistent** (the record
already describes the target state), **supersession** (an assertion or record is
explicitly superseded in this quest, naming the original; closed records stay
untouched, R09/R21), **coordination** (no assertion changes, but the record makes
another owner a party to the change).

## 1. Closed quests

### `scenario-a-transaction-coordination-fast-path` (sealed `4dc6db6b9`, terminal)

| Item | Verdict | Why |
| --- | --- | --- |
| Constraints `preserve-participant-set-cas-authority`, `preserve-two-phase-decision-protocol`, `preserve-generic-workflow-sequential-default` | untouched | The manifest CAS, the PREPARED evidence before the decision and the sequential generic stage are all unchanged. [V] |
| Statement priority (1) "eliminate duplicated participant persistence, redundant ACTIVE progress writes" | consistent in intent | It removed the duplicate participant write and the ACTIVE *status* rewrites on `sql_transactions`, and kept one ACTIVE participant row; (a) removes that row, going further in the same direction. [V] |
| Probe `scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js:333-338` (`checkPriority1BookkeepingReduction`: "newly enlisted participant must be persisted once", `participantMutationsOnEnlist.length === ONE`) | **supersession** | Becomes 0. Precedent ruling 3: a supersession finding names the closed quest, the assertion and why. [V] |
| Same probe `:385-406` (`checkPriority2ConcurrentParticipantPhases` seeds a generic workflow with `wfCoordinator.upsertParticipant`) | **supersession of the setup only** | C6 deletes `DurableWorkflowCoordinator.upsertParticipant`; the check seeds through `registerWorkflow({participants: Map})` and its assertion (sequential generic stage order) is unchanged. [V] |
| Witness `test/query/scenario-a-transaction-coordination-fast-path.test.js:95-99` (one participant mutation on first write) | **supersession** | Same assertion. [V] |
| Witness same file `:215-216` (generic upsert seeding) | **supersession of the setup only** | As for the probe. [V] |
| Witness same file `:1441-1484` (Finding 1B with failing and delayed ACTIVE writes) | **supersession** | It waits for an ACTIVE write that no longer exists; the hazard it witnesses disappears with the write. The begin-gate witnesses of this quest take over its safety claim. [V] |
| Epic `doneWhen` (this guard at 0) | **pre-existing red** | Measures 2 on clean `ab347e962` (`priority-1` on the write-operation assertion after `49e9a4b75`, `priority-5` missing index). (a) adds one more failing assertion inside `priority-1`, so the count stays 2. Landing condition L2: its owner repairs it first. [V `td-stage0/scenario-a-transaction-coordination-fast-path-guard-{ab347e962,simulated}.json`] |

### `scenario-a-deep-stack-throughput-and-latency` (sealed `b41d4ccec`, terminal)

| Item | Verdict | Why |
| --- | --- | --- |
| Constraints `preserve-cas-and-prepared-evidence-authority`, `preserve-raft-ready-persistence-ordering`, `preserve-row-key-conflict-and-read-your-own-writes` | untouched | CAS on every set change, PREPARED rows before COMMIT, Raft ordering, row-key semantics unchanged (the hold only shortens). [V] |
| Probe and witness (`...-deep-stack-...-guard.js`, `...-deep-stack-...test.js:244-288`) | untouched | Count only after the first enlist and only transient statuses; metric 0 today and under the stage-0 simulation. [V] |

## 2. Open quests and epics

| Record | Verdict | Why |
| --- | --- | --- |
| `replicated-transaction-decision-and-apply`, `tx1-single-path-alpha`: constraints, recovery-set design ("Participant rows supply PREPARE evidence/progress; they never establish the set", `design-query-recovery-set-2026-10-11.md:73-81`), "a missing progress row remains a legitimate unknown member" (`design-query-begin-uncertain-insert-resolution-2026-10-11.md:2132-2137`) | consistent | (a) is what these designs say the rows already are. [V] |
| TX1 receipt witnesses `test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js`, `test/integration/transaction-coordinator-restart.integration.test.js` | untouched by (a); **pre-existing red** | Their holds are on PREPARED and COMMITTING status writes and on PREPARED and COMMITTED participant rows, never on ACTIVE rows, so (a) changes no hold point. Both are red on clean `ab347e962` (A5; the restart milestone), and their repair lands first (L1). Correction from the review: leg-a is named in the TX1 receipt's commands, not digest-bound; only the restart witness is digest-bound, and that receipt already fails its digest check on main. [V `td-stage0/lab-*-ab347e962.log`] |
| `locking-read-authoritative-reservations` constraint `shared-transaction-owners` ("Coordinate existing open replicated-transaction-decision-and-apply, tx1-single-path-alpha and participant-release-permanent-refusal owners before changing participant admission, apply or release. One writer owns that interaction.") | **coordination** | (a) keeps the participant admission authority (manifest CAS, BEGIN, refusals), apply and release unchanged, but it changes the coordinator-side bookkeeping of admission and removes the statement-time overlap the locking read's AUTHORITATIVE enlistment shares (`sql-query-engine-select-execution.js:72-87`). Read as the constraint intends, the TX1 owners are the one writer of that interaction: the change is coordinated with them (L1 already makes them a landing dependency); no assertion of the locking-read quest changes. Under the simulated removal `test/query/locking-read-authoritative-reservations.test.js` (13/13) and `test/transaction/queryable-core-j4-locking-read-journey.test.js` (8/8) pass. `test/query/locking-read-execution-lifecycle.test.js` fails one test identically with and without the simulation, and is red on main in the corpus (section 6). [V] |
| Epic `es6-owner-safety` (open, deterministic): its receipt binds `test/query/scenario-a-transaction-coordination-fast-path.test.js` by digest (`solve/epics/es6-owner-safety/evidence/receipt.json:6`, `b8a01137...`) | **supersession, already diverged** | The file at `ab347e962` hashes to `2b487031...`: the receipt is already stale on main. (a) changes the file again (section 1). The supersession finding names the epic, and the epic owner re-measures its receipt. [V sha256] |
| Quest `transaction-path-telemetry-export` (draft on its own branch; its constraint `production-unchanged`: "the gateway mutation sequence and purposes ... are identical to ab347e962", test `test/bootstrap/transaction-telemetry-production-defaults.test.js`, pinned sequence in one fixture file per the lead) | **supersession, after it lands** (L3) | (a) removes P ACTIVE rows from that pinned sequence and changes the purpose counts (`participantAdmission` falls from 2P to P). That is a one-file supersession of the fixture after the export has landed, and this quest's red is re-measured on that base. Its catalogued COMMIT sub-phase `PREPARED_STATUS` is untouched by (a). [V `git show work/oltp-telemetry-export-20261128:solve/quests/transaction-path-telemetry-export/quest.json`] |

## 3. Unsealed tests and probes that pin the ACTIVE write or its counts

| Witness | Verdict | Change |
| --- | --- | --- |
| `test/query/tx-metadata-pgwire-and-result-representation.test.js:385-392` (`participantAdmission` 2, 10 mutations) | **supersession** | `participantAdmission` 1, 9 mutations. `:323-333` (6 `sql_transactions` mutations incl. PREPARED) and `:389` (`preparing` 2) are **untouched** by (a). If the telemetry export moves these counts into its fixture first, the supersession happens there. [V; cone result in section 6] |
| `test/query/transaction-participant-set-authority.test.js:622-707` (ACTIVE upsert overlaps `executeWrite`) | **supersession** | The overlap goes. The witness's other claims (write-operation rows wait for the statement; COMMITTED overlaps the read-only release) are kept in a rewritten witness that does not wait on an ACTIVE write. [V; it hangs under the simulation, section 6] |
| same file `:709-881` (Finding 1B) | **supersession** | Parts 1-2 witness a hazard that disappears; part 3 (a failed COMMITTED status write with an overlapped read-only release) is kept. [V] |
| `test/query/schema-provisioning-job-owner.test.js:625` (workflow_record keys include `enlistedParticipantCount`) | **supersession** (C6) | The field is deleted with its unreachable producer. [V] |
| `test/query/distributed-transaction-coordinator.test.js:335` | untouched by (a) | It asserts the PREPARED status write, which belongs to (b) (review correction). [V] |
| Recovery inputs seeding ACTIVE or PREPARED participant rows (`reader-census.md` section 5) | untouched | Readers keep accepting rows of earlier builds. [V] |

## 4. Architecture, contracts, guidelines, models

`architecture/postgres-wire.md:320-323` ("participant progress rows are recovery
hints") is **consistent**; an optional sentence that participant rows begin with the
PREPARE evidence. The following are **untouched**, since none names the ACTIVE row
(searched):

- `architecture/contracts/` and `invariants.json`
- `architecture/runtime-contracts.md`
- `test/guidelines/`
- `models/`

`docs/benchmarks/tx1-service-time-decomposition.md:270` (manifest and PREPARED evidence
before the decision CAS) is **consistent**. [V]

## 5. Supersession list (summary)

1. Closed fast-path quest:
   - probe `checkPriority1BookkeepingReduction` assertion (`guard.js:333-338`);
   - probe `checkPriority2` setup (`:385-406`);
   - witnesses `scenario-a-transaction-coordination-fast-path.test.js:95-99`, `:215-216` (setup) and `:1441-1484`.
2. `es6-owner-safety` receipt binding of that test file (already diverged on main).
3. Telemetry export's pinned mutation sequence fixture and purpose counts (after L3).
4. `tx-metadata-pgwire-and-result-representation.test.js:385-392`.
5. `transaction-participant-set-authority.test.js:622-707,709-881`.
6. `schema-provisioning-job-owner.test.js:625` (C6).
7. Coordination, not supersession: `locking-read-authoritative-reservations`
   `shared-transaction-owners` (TX1 owners), and the TX1 witnesses' repair first (L1).

## 6. C5 confirmation: the transaction cone under the retained preload

**Why not on the lab.** The lab runner forwards only `retry`, `tapTimeout` and
`checkBase` to the remote host (`scripts/lab/probe.js` `forwardedPolicy`, reached through
`tools/focused.mjs`). It cannot carry `--import` or `NODE_OPTIONS`, so the preload
cannot be injected there without changing a repository file. As the lead allowed, the
cone's light files were run locally, one at a time through the shared lock.

**Cone.** The repository's proof-cone selector does not narrow the selection for these
files (`scripts/select-proof-cone.js --changed ...` answers `tier=unknown
fullSuite=true`, all 2850 files). The cone was therefore defined as every `*.test.js`
whose own source references the changed producers or their test harnesses:
`DistributedTransactionCoordinator`, `transactionCoordinator`, `executeWriteStatement`,
`enlistParticipants`, `upsertParticipant`, `DurableWorkflowCoordinator`, the participant
table, `managed-workflow-record-coordinator`,
`persistDistributedTransactionParticipantRow`, `transaction-persistence-gateway`,
`participant-protocol-double`, `transaction-coordinator-group-fixture`. That gives
**154 files**, of which **139** are `ordinary/unit` (light). Lists:
`td-stage0b/cone-simulated-a/cone-all-files.txt`, `cone-files.txt`.

**Runs.** The candidate snapshot was `c3414281c67d16a46a2af7f12e815d1975d9e2b1`. Each
light file ran once with `node --import evidence/simulate-removal-a.mjs --test`
(`results.tsv`, `taps/`). Every file that failed was rerun without the preload
(`results-unchanged.tsv`, `taps-unchanged/`), and the failing test names were compared
(`comparison.json`). Each failure was also looked up in main's corpus log
(`lab/main-corpus-ab347e962/lab-test-all.log`, read while that run was still in progress
with 2786 file results; every file of interest had its entry; `failed-vs-corpus.txt`).
Tests hidden behind a hang or a runner failure were run in isolation with
`--test-name-pattern`, both ways (`isolated/`).

**Result.** 139 files: 100 pass under the preload; 39 fail.

- **35 of the 39 fail identically** without the preload (same failing tests, same
  counts), and all 35 are `not ok` on main in the corpus: pre-existing reds, none
  changed by (a). They include `test/workflow/durable-workflow-coordinator.test.js`,
  `test/query/locking-read-execution-lifecycle.test.js`,
  `test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js` and 17 rebalancer,
  control-plane, convergence or node files (`failed-vs-corpus.txt`, `comparison.json`).
- `test/query/distributed-transaction-coordinator.property.test.js`: the same
  pre-existing failure both ways ("TableCreationService systemCache must implement
  find()"); only fast-check's random counterexample differs. Not changed.
- `test/query/scenario-a-transaction-coordination-fast-path.test.js` (corpus `not ok`):
  - changed by (a), test 1 ("payment transaction breakdown tracer and Priority 1
    bookkeeping reduction"): `newly enlisted participant persisted once, 0 !== 1`
    (`:95-99`, supersession 1);
  - changed by (a), test 12 (Finding 1B): it waits for an ACTIVE write that never comes
    (`:1441-1484`, supersession 1). Tests 13-16 were then cancelled by their parent; in
    isolation they pass both ways;
  - unchanged: test 9 (the depcruise boundary witness) fails both ways on a
    pre-existing rule violation
    (`partition-decision-and-store-no-indirect-nondeterministic-capabilities`, from
    `partition-participant-transaction-store.js`). On the unchanged tree it also crashes
    the test runner's IPC (`Unable to deserialize cloned data`), reproducibly; tests 10-11
    pass both ways.
- `test/query/transaction-participant-set-authority.test.js` (corpus `ok`):
  - changed by (a): "Optimization 5C: executeWriteStatement overlaps participant ACTIVE
    upsert ..." (`:622-707`) and "Finding 1B ..." (`:709-881`), which wait for the ACTIVE
    write (supersession 5);
  - the two "P2:" tests after them were cancelled by the hang; in isolation under the
    preload they pass (2/2).
- `test/query/tx-metadata-pgwire-and-result-representation.test.js` (corpus `ok`): changed
  by (a), the "§1 & §2" witness fails at `:386` (`participantAdmission` 1 !== 2; `:392`
  would follow: 9 !== 10) (supersession 4).

**Every test that changes result under the removal is on the supersession list (section
5). No other test in the light cone changes result.** [V]

**Not run under the preload**, either too heavy for the workstation or (the last three)
this quest's own tests, run separately:

- `test/bootstrap/node-joining-service-join-lifecycle-resume.test.js`
- `test/bootstrap/node-joining-service.test.js`
- `test/bootstrap/shared/control-plane-setup.test.js`
- `test/integration/node-join-replica-activation.integration.test.js`
- `test/integration/pgwire-command-tag-real-engine.integration.test.js`
- `test/integration/priority-spread-one-authority-rebalance.integration.test.js`
- `test/integration/seed-migration-cutover-persisted.integration.test.js`
- `test/integration/transaction-coordinator-restart.integration.test.js` (red on main)
- `test/migration/migration-workflow.integration.test.js`
- `test/query/internal-sql-adapter.integration.test.js`
- `test/query/postgres-wire-adapter.integration.test.js`
- `test/rebalancer/message-group-operation-routing.integration.test.js`
- this quest's: `test/query/transaction-redundant-progress-writes.test.js`,
  `test/query/transaction-redundant-progress-writes-recovery.test.js`,
  `test/scripts/transaction-redundant-progress-writes-guard.test.js`

The three-replica TX1 witnesses (leg-a, restart) wait for L1 on the lab, from an
implementation candidate.

**Preload revision.** After the cone run, the preload's inner function was changed to use
the captured coordinator instead of `this` (eslint `no-invalid-this`). The function is
installed as that same instance's method, so the receiver is identical in every call made
through it. This quest's witnesses and the decisive cone files were rerun with the final
preload (`td-stage0b/final-preload/`).

## 7. Stage 1: the implemented removal, compared with the unchanged tree

Outputs are in the coordination directory under `lab/td-stage1/` (`T` below). The
candidate is uncommitted; its lab snapshot is `622c0a7094ed66223d75f243d3ded9c29a0c0bd1`
(source identical to the experiment snapshot `863a93ea8c53a638392c45376a0fe4d8eada9d34`).

**Answers, base against candidate** (`T/cmp/`: `observe.mjs`, copied from the
verifier's `tb-verification-1/cmp/` with S11-S14 added; `diff.txt`, `mutation-delta.txt`,
`deep-diff.mjs`). S1-S13 (COMMIT, ROLLBACK, refused PREPARE, empty COMMIT/ROLLBACK,
read-write-read, COMMIT after a failed rollback fanout, COMMIT fanout failure then COMMIT,
two writes to one partition, recovery adoption of a recorded COMMIT, recovery rollback of
an OPEN row, sweep adoption of a live in-doubt COMMIT): every answer field, delivery,
log line, timer and async resource is identical; the only gateway difference is one
`sql_transaction_participants|upsert|ACTIVE` per write scenario, order otherwise preserved.
**S14 is the exception:** a transaction discovered from rows whose authoritative read is
unavailable is held in doubt with the participants loaded from rows, so
`getRecoveryObligation(id).participants`/`participantDetails` and the `participants` of the
in-doubt answer to a client COMMIT or ROLLBACK naming it are `["p1"]` (the ACTIVE row) on
the unchanged tree and `[]` here (`T/cmp/s14-field-diff.txt`). Success, error code,
`decisionReadState`, deferral, deliveries and the resolution once the read is available
are identical. pgwire does not carry the field; `getRecoveryObligation` has no `src` caller.

**Real participant, base against candidate** (`T/cmp/real-participant-*.json`,
`real-participant-diff.txt`; the same support code run on both trees): a committed
transaction, a participant whose BEGIN never arrived, and a participant-leader change
(sessions discarded) before COMMIT and before ROLLBACK: identical answers, participant
records, decisions and applied rows; the only difference is the ACTIVE row.

**Recovery entry points** (`T/cmp/recovery-entry-*.json`, `release-*.json`,
`recovery-release-diff.txt`): startup replay, the sweep's discovery and the release
settlement reach the same outcome on both trees, with rows as written and with the
unchanged tree's ACTIVE rows planted. Witnessed in
`test/query/transaction-redundant-progress-writes-recovery.test.js` (18 tests, green on
both trees).

**Cone** (161 files: section 6's 154 and 7 that reference the newly touched owners; plus
17 managed-workflow files reaching the managed coordinator through test supports):
`T/cone/` and `T/cone-managed/`, compared per failing assertion (name, source line,
expected/actual) with main's corpus (`T/cmp-assertions.mjs`, `T/cone-assertions-vs-main.json`).
Result: 161 files: 115 pass on both; 41 fail on both with identical failing assertions
(including the superseded `scenario-a-transaction-coordination-fast-path.test.js`, the
three-replica `transaction-leg-a-three-replica.test.js` and
`transaction-coordinator-restart.integration.test.js`); 1 differs only in text
(`distributed-transaction-coordinator.property.test.js`: the same failure, its message
carries the placement worktree's absolute path); 4 have no main record (this quest's own
files, all pass). The superseded `tx-metadata-pgwire-and-result-representation.test.js`,
`transaction-participant-set-authority.test.js` and `schema-provisioning-job-owner.test.js`
pass, as on main. The 17 managed-workflow files: 12 pass on both, 5 fail identically.
**No subtest changes result.**

**The six changed `src` files:**
- `src/query/distributed/distributed-transaction-participant-set.js`: `enlistParticipantsOwned`
  no longer persists an ACTIVE row; the participants begun in this enlistment are marked ACTIVE
  in memory by `markParticipantsBegun` (the begin gate); the `options`/`deferActivePersistence`
  parameter and `persistActiveParticipants` are gone.
- `src/query/distributed/distributed-transaction-statement.js`: `executeWriteStatement` no longer
  overlaps the ACTIVE write with the partition write; the earlier write-operation flushes still
  settle concurrently with it.
- `src/query/sql-query-engine-transaction-persistence-methods.js`: the ACTIVE branch of
  `resolveParticipantRowPersistPurpose` (`participantAdmission`) is deleted.
- `src/workflow/durable-workflow-coordinator.js`: `upsertParticipant` (its one production caller
  was the ACTIVE write) and the unreachable `enlistedParticipantCount` empty-registry branch of
  `executeParticipantStage` are deleted; the missing-key branch stays.
- `src/partition/managed-workflow-record-coordinator.js`: the refusal override of the deleted
  `upsertParticipant`, its `REFUSED_ENTRY` member and its header mention are deleted.
- `src/query/schema-provisioning-job-repository.js`: the never-incremented
  `enlistedParticipantCount` key leaves the serialized `workflow_record` and its reader.

**Reproducing the comparisons.** `C=/mnt/data/peter/projects/lagrange-oltp-perf-20261128/lab/td-stage1/cmp`;
`W` = this worktree; the base is the read-only reference checkout
`B=/mnt/data/peter/projects/.worktrees/oltp-perf-20261128` at `ab347e962`. Each command runs
through `tools/heavy.sh`.
- S1-S14 (answers, deliveries, mutations): `node $C/observe.mjs $B $C/base.json` and
  `node $C/observe.mjs $W $C/cand.json`; then `node $C/diff.mjs` (per scenario and channel),
  `node $C/mutation-delta.mjs` (gateway mutations only in one tree, order check) and
  `node $C/deep-diff.mjs "S14 "` (field-level result differences; generated ids and epochs
  differ in every scenario and are ignored by `diff.mjs`).
- Base mirror for the support-module scenarios (the support module and the quest's tests run
  against the base's `src` and test helpers): `M=$C/base-mirror`;
  `mkdir -p $M/test/query && cp $W/test/query/transaction-progress-write-witness-support.js $M/test/query/`;
  `ln -s $B/src $M/src; ln -s $B/test/test-helpers $M/test/test-helpers;
  ln -s $B/test/control-plane $M/test/control-plane;
  ln -s $B/test/query/sql-query-engine-test-support.js $M/test/query/;
  ln -s $B/node_modules $M/node_modules; ln -s $B/package.json $M/package.json`.
- Real participant: `node $C/real-participant-probe.mjs $W $C/real-participant-cand.json` and
  `node $C/real-participant-probe.mjs $M $C/real-participant-base.json`
  (`real-participant-diff.txt`).
- Recovery entry points and release settlement: `node $C/recovery-entry-probe.mjs <root> <out>`
  and `node $C/release-probe.mjs <root> <out>` with `<root>` = `$W` or `$M`
  (`recovery-release-diff.txt`).
- Held obligation (ruling 1): `node $C/held-obligation-probe.mjs <root> <out>`
  (`held-cand.json`, `held-base.json`).
- The quest's tests on the base: copy the two quest test files into `$M/test/query/` and run
  `node --test $M/test/query/<file>`.

**Held obligation (lead ruling 1, the accepted answer change; `held-base.json`,
`held-cand.json`).** Setup: two tables; the coordinator stops after the manifest append;
past the deadline a new coordinator restores the transaction from rows with its
authoritative read unavailable. Before the refresh, `getRecoveryObligation` and the
in-doubt answer to a client COMMIT list `["p1","p2"]` with status ACTIVE on the unchanged
tree, and `[]` here. After the refresh (read available, freeze write still failing, so
the obligation stays held) both trees list the manifest's `["p1","p2"]` with status
FAILED, `decisionReadState` absent. Once the freeze goes through, both record one
ROLLBACK applied by each participant, with no orphaned session. With the unchanged
tree's ACTIVE rows planted, the candidate's facts equal the unchanged tree's in every
phase. Tests in `test/query/transaction-redundant-progress-writes.test.js`:
- the "red: ... held before its authoritative refresh lists no participant ..." test
  fails on the unchanged tree, by design: its pre-refresh list shows the two ACTIVE-row
  participants;
- the "kept: ... ACTIVE rows planted (upgrade) ..." test passes on both trees.
