# Verdict r4: reroute-carries-the-entry-id (attempt A4, head c34b7b801)

Head verified: c34b7b801194bd170124c22e0fa335b51cd500e9, in the worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/q-reroute.

- **Worktree state.** `git status --short` was the same at start and end:
  ` M solve/quests/reroute-carries-the-entry-id/log.ndjson`. That is the lead's uncommitted A4 attempt entry, one
  appended line, and `check-quest-log-append-only` is clean.
- **Read-only.** I edited no repository file and ran no git write command. `git archive` wrote only into scratch.
- **Scratch.** Everything is under scratchpad/verify-reroute/r4/, and the paths below are relative to it. forkA/ and
  forkB/ hold two read-only census sub-investigations that I directed; I re-measured their load-bearing claims myself.
- **Resource discipline.**
  - Every run was under `timeout`.
  - The thermal gate ran before each batch: static "ok 58C", receipts "ok 61C", suites "ok 55C", mutants "ok 64C".
  - Suites and mutants ran at `--test-concurrency=2`.
  - After every runner, `/tmp/write-attempt-*` stayed at the 8 pre-existing directories (r2's) and no /tmp/r3-group-*
    directory remained.
  - `pgrep` found no surviving process of mine.

## Verdict: REJECT (one blocking item)

The round-3 blockers are closed:

- **B4:** there is one rendering, and the lane re-send after an unknown outcome is answered as a replay.
- **B5:** the registry selects the witnesses.

F22/F21, F19 and the metadata binding hold as claimed. The receipts are 5/5 on the head and 0/5 on the sealed head. The
773-file batch ran 26401 tests with 0 failures.

The blocking item comes from N2, which the implementer recorded as out-of-scope routing. It is worse than recorded, and
it is this quest's class. Since A2, the CDC local lane forwards an **outcome-unknown** write to the next local partition
under a **different** entryId, so one logical INSERT is applied twice and the caller is told success. The sealed head
did not do this: its lane answered the unknown honestly.

### Blocking

1. **The CDC local lane sends an outcome-unknown write on to another partition under a different entryId. The write is
   applied twice and answered success. This is a regression introduced by the quest (quest C5: "an unknown outcome
   only when it re-proposes under the write's own entryId"; R14; brief attack surfaces 2 and 3, round-4 item 1 N2).**
   - **Mechanism.**
     - `sendLocalSystemTableWrite` (src/cdc/cdc-local-system-table-write-lane.js:66-86) walks every local leader
       replica of the table's partitions (`resolvePartitionServicesForTable`,
       src/cdc/cdc-integration-service-local-system-table-routing.js:150-183, which covers every partition row of the
       table).
     - Each partition is sent the write under `routedMutationLocalWriteOptions(key, partitionService.partitionId)`,
       that is `deriveParticipantEntryId(key, <that partition>)`, so each partition gets a different entryId.
     - A failed answer is "routed on" by `isLocalSystemTableWriteFailureRoutedOn(cdc, result,
       idempotencyKey !== null)` (:74-83 → :44-50). With a key, `carriesEntryId` is `true`, so
       `isReroutableWriteFailureCode(outcome_unknown, {carriesEntryId: true})` answers "send it on".
     - The next send, however, carries the next partition's entryId, not the one the unknown answer was given for. The
       kernel's predicate is correct; the lane gives it a false input.
   - **Measured through the production entry.** `executeSQLViaQueryEngine` → `tryExecuteLocalSystemTableWrite` →
     lane, with two locally-led partitions A and B (the resolver's own input). A's proposal is released
     `partition_write_outcome_unknown` by its own commit deadline and then commits (r4-n2.mjs):
     - **Head** (r4-n2-head.out): A answers unknown under `dwrite-participant-9110…` and B is sent the INSERT under
       `dwrite-participant-5963…` and applies it. The caller hears `success, changes 1`, and the row exists in both A
       and B: one logical INSERT, two applications, no engine involved.
     - **A3** (r4-n2-A3.out): identical.
     - **Sealed head 2ee6e0c4e** (r4-n2-sealed.out; the harness file was copied into a scratch archive and removed
       after): one send to A. The caller hears `partition_write_outcome_unknown`, and B is untouched.
     - The same mechanism by direct call is in forkA/n2-two-partitions.out.
   - **Reachability: reachable through production code; not observed live.** A node leads two partitions of one
     system table once a non-priority system table splits (or during a split's source-to-child window, not verified):
     - `evaluateSplitCriteria` excludes only priority control-plane partitions
       (partition-split-merge-manager-core-methods.js:466-474).
     - Its production partition list is `listManagedSplitPartitions` (entrypoint-runtime-admin-composition.js:398,
       sql-query-engine-partition-routing-readiness.js:26-72). That list includes every locally-led partition row that
       has a `table_id`, and system partition rows carry `table_id: tableName` (seed-registration-phase.js:399-412).
     - System tables are registered with a single-column `partition_key` and a declared `replica_count`
       (seed-registration-phase.js:370-412), which satisfies the managed split's two refusals
       (managed-split-workflow.js:185-196).
     - Auto-execute is on by default (partition-split-merge-manager.js:100). The thresholds are 10 GiB or 1000 qpm
       (partition-constants.js:625-626).
     - The priority tables never split, which protects the rebalancer's replica_operations writes. CDC routed
       mutations of services, nodes, partitions, tables, config, storage_reservations and the like are exposed.
   - **What is not in-bar.** The lane's routing ignores key ranges, which is pre-existing:
     - A write can land in a partition that does not own the key.
     - An UPDATE sent to the wrong local leader answers `success, changes 0` and leaves the owner unwritten
       (forkA/n2-two-partitions.out `UPDATE_rowOnlyInB`).
     - The implementer's N2 names this, and it stays out of bar as a recorded finding. The in-bar defect is the
       re-send of an unknown outcome under another entryId, which A2 introduced.
   - **Owner.** The lane's routed-on decision. `carriesEntryId` must mean "the next send carries the entryId this
     answer was given for", so an unknown or environment-failed answer never moves to another partition. The owner
     decides how: for example, the lane's walk ends at that partition's answer, or it hands the write to the routed
     engine path under the same key (the coordinator derives the same entryId for the owning partition).
   - **Witness requirement.** Two locally-led partitions; the first answers unknown and later commits. Assert one
     application in total, no send under a second entryId, and a truthful answer. The existing S3/V2/V3 witnesses use
     one local partition and cannot see this.

## Round-4 items

1. **B4, one rendering owner: holds.**
   - **Crosspath V1-V4.** The r3-crosspath.mjs harness, re-run unchanged on the head (r4-crosspath.out): every case
     sent one entryId, applied once (`applications 1`, value `moved`), and the loop answered success.
     - The engine's re-send after the lane's unknown attempt is answered `idempotentReplay: true,
       statementBinding: same_statement` in V1, V2 and V3.
     - In V4 the engine's own re-send is answered the same way.
     - On r3 these were 6 and 61 mismatch refusals.
   - **3-replica twin** (r4-twin.mjs / .out): real rs-raft group, engine by address through handleRemoteQuery, the
     production lane on the follower (forwarding) or on the leader.
     - 5 statement shapes × 4 orders = 20 cases: UPDATE, DELETE, INSERT, lower-case UPDATE, and an `AND … IS NOT NULL`
       UPDATE; orders concurrent, lane-first, engine-first, and lane on the leader concurrently.
     - Every case: one proposal under E on each replica ([1,1,1]); the proposed text equals the engine's delivered
       text; both carriers answered success; the sequential second carrier was answered
       `replay true, same_statement`; state applied once on all replicas.
   - **Production lane corpus** (forkA/render-corpus.out, lane-vs-engine.out/.summary): 13 shapes in both orders,
     including `INSERT OR IGNORE`, `INSERT OR REPLACE`, CAS WHERE, JSON and null params, and multi-row.
     - The lane's rendered sql and params equal the engine's delivery in all 26 cases, each second carrier answered
       as a replay.
     - The CDC engine call passes no dialect, and neither does the lane.
   - **UNPARSEABLE / NOT_A_WRITE.** No lane-reachable production statement is in either state (forkA/src-write-corpus.out;
     the lane only receives the CDC row-mutation builders' shapes).
     - An UNPARSEABLE statement returns `handled: false` before any send, and the engine then fails the same parse
       before planning, so nothing is sent under the entryId: no collision.
     - Keys are per call and in memory, so there is no cross-restart collision.
   - **Census (forkB/carriers.txt):** no other src path shares an entryId while sending a different text.
     - Relays (request builder, redirect, widening, handleRemoteQuery, FORWARD_WRITE, split and merge mirror) carry
       the text and entryId they received.
     - The data APIs, migrations, the bootstrap direct lane and index writes mint private ids.
     - Admin goes through the engine.
     - Session staging receives the coordinator's rendered text.
     - N2 (blocking 1) is the one collision class.
   - **N2 multi-row INSERT:** no lane caller builds one (unreachable).
2. **F22/F21: holds as claimed** (r4-loops.out, r4-classify.out).
   - The mismatch (real and injected), `proposal_unencodable` and the host failure are each attempted exactly once
     through the CDC routed loop, the rebalancer SQL loop, the rebalancer gateway-row loop and the lane (the lane
     returns the refusal handled).
   - not_leader and unknown are still retried: re-delivered and then success.
   - Classifier, CDC `isTransientCdcError` and rebalancer `isRetryableOperationPersistError` on production
     coordinator summaries:
     - mismatch, unencodable and host failure are not retried in 1/1, 1/2 and 2/2 shapes, and when thrown (via
       `cause` or `participantFailures`);
     - not_leader, unknown and environment-failed are retried.
   - Mutants (mutants-r4.out): reverting the classifier's code-first rule (M2), the failed-for-good codes (M3) or the
     CDC short-circuit (M5) turns the F22/F21 witnesses red. The rebalancer short-circuit (M6) is an equivalent mutant
     (finding F27).
   - **N1: out of bar** (a recorded finding; quest constraint 2 permits a recorded remaining text consumer).
     - A duplicate-key INSERT answers `failureCode: SQLITE_CONSTRAINT_PRIMARYKEY`, which is not a kernel code, so the
       coordinator's summary text decides.
     - The CDC loop makes 6 attempts; the rebalancer makes 61 attempts over 15 s (r4-loops.out `*:N1duplicateInsert`).
     - Every attempt is answered from the outcome row with nothing applied, and the answer stays a failure.
     - The same summary fragment is present at 2ee6e0c4e (control-plane-error-classification.js:18,
       cdc-routed-mutation-readiness.js:708), so this is pre-existing budget waste, not an exactly-once or truth
       break.
3. **F19: holds** (r4-f19.out vs r4-f19-A3.out).
   - The head refuses `proposal_unencodable`, typed, in each case:
     - direct, with and without an entryId;
     - over the wire;
     - joined to a pending write under its entryId (the pending write still applies alone);
     - through the engine (top-level code);
     - at session staging, where nothing is staged and the commit applies nothing.
   - On A3, the pending join threw and staging staged the BigInt. The commit then applied it locally (value "10")
     and threw `proposal_unencodable` on the marker: a local and replicated divergence that A4 closes.
   - M4 (no admission encode) turns the F19 witness red.
4. **B5, registry and selection: holds.**
   - For every src file the quest changed and every owner of `partition-write-answer-retry-classification`, 39 files
     in all (r4-selection.out), the three files r3 flagged now select e2e, replay, loops, kernel, lane, classifier and
     consumers:
     - partition-committed-statement-outcome-constants.js;
     - partition-service-raft-write-commit.js;
     - partition-service-write-metrics-base.js.
   - So do the new rendering owner, admission, and sql-query-engine-statement-execution.js.
   - Every quest-touched file selects at least the lane witness.
   - `audit:impact-contracts` PASS (40 contracts, 17 pairs).
5. **Metadata binding: holds.**
   - `--verify-import-graph` exits 0 in the worktree (snapshot 729a6769… = the committed seal).
   - In a clean `git archive HEAD` export (7714 files), the first verify exits 1 with ENOENT on the untracked report,
     the same tool property as in r3.
   - `test:metadata:refresh` exits 0 and rewrites 0 tracked files (1 NEW). `--refresh` exits 0 and rewrites 0 tracked
     files (6 NEW untracked reports).
   - The verify then exits 0 with snapshot 729a6769….
   - `audit:shards` passes in the worktree and in the export.
6. **Receipts, witnesses, suites and static.**
   - **Receipts** (chain-r4.out):
     - 5/5 on the head.
     - 0/5 on a fresh archive of 2ee6e0c4e; all five fail as `testCodeFailure` / `ERR_ASSERTION`.
     - The witness file's last commit is 2ee6e0c4e, and its sha256 ac727c13… equals the receipt's `testFileDigests`.
   - **Witness files:** 10 files, 275/275 pass: write-identity-loops and -replay-answers, the lane, kernel, classifier,
     answer-consumers, the coordinator failure log, committed-statement-outcome, port-refusal-outcomes and the admin
     envelope.
   - **Suites:** 773 files (query, partition, cdc, admin, control-plane, rebalancer): 26401 tests, 26317 pass, 0 fail,
     0 cancelled, 84 skipped, 218 s, exit 0.
   - **Ratchets:**
     - complexity 1812/1812;
     - cognitive 158/158;
     - unused exports 1433/1433;
     - file-size 27/27 and 21/21;
     - src duplication 55/1775 OK.
     - Test duplication is 794/30542 against a baseline of 793/30519. That equals the branch base; the jscpd-test
       report has 0 clone groups touching any test file changed since 2ee6e0c4e (r4-test-dup-scan.out), so this change
       adds none.
   - **Other checks:**
     - `check-fast-static` ok;
     - `audit:guidelines` 0 new;
     - eslint on the 54 changed .js files: clean;
     - boundary audit exit 0;
     - legacy naming clean;
     - knip exit 0;
     - quest-log append-only clean.
   - **closed-quest-shape** exits 1 on the R1 quest's round files. Those files are present at 2ee6e0c4e, this quest
     touches none of them, and main moved them in c91b39cf0. This is branch-base state, not this change.
   - **Budgets unchanged:** 30 s `PENDING_REQUEST_TIMEOUT_MS`, CDC `RETRY_MAX_ATTEMPTS` 6, no diff to any retry bound.
     The UNIQUE-collision patch (replica-operation-repository-mutation-persistence-methods.js:120-160) is unchanged
     since 2ee6e0c4e.
   - **Mutant control:** green. M1 (the lane sends the caller's text) turns 5 witnesses red: the B4 census, the
     consumers twin, S3, V2 and V3.

## Findings (non-blocking; record per R17)

- **F23 (in-bar code, not reachable today): `decidePartitionWriteRetry` decides from a truncated view.**
  - `collectLinkedControlPlaneFailures` stops at 8 candidates (control-plane-error-classification.js:130). A
    failed-for-good participant beyond the window is not seen, and the failure is then decided RETRYABLE by the
    visible not_leader answers.
  - Measured: n=9, positions 7-8; n=12, 5 of 12 positions (r4-classify.out "mixed").
  - It needs 7 or more failed participants in one system-table write, which needs a many-times-split system table.
    The consequence is budget waste, not a double application.
  - Before A4 the cap bounded a `some()` (any retryable candidate); A4's "every code retryable" semantics make a
    partial view unsafe in the other direction. Suggested: decide over all participant answers (the bound as a cycle
    guard), or name a truncated state that fails closed.
- **F24 (out of bar, pre-existing, high severity): the one write renderer rewrites SET-clause expressions to NULL.**
  - `SET n = n + 1`, `SET v = v || 'x'` and `SET v = COALESCE(?, v)` all render as `SET … = NULL`, through the engine
    it answers success, and the column is nulled (forkA/set-expr.out; the sealed-archive `buildUpdateSQL` gives the
    same; A3 is identical).
  - This is a client-reachable engine data-corruption bug predating the quest. Since A4 the lane shares the renderer,
    but no lane caller in src uses a SET expression (forkA/src-write-corpus.out), so the lane is not affected today.
  - Needs its own owner quest (the renderer, or UNPARSEABLE for what it cannot render faithfully).
- **F25 (witness completeness): the B4 static census has blind spots** (forkB/witness-coverage.out).
  - It keys on the constants `QUERY_(MESSAGE|PAYLOAD)_FIELD_ENTRY_ID` and on calls to two functions, per file.
  - A literal `{entryId: …}` carrier is invisible: the live relay at partition-service-write-metrics-base.js:110 is
    in none of its lists, and a new `executeQuery(callerSql, p, {entryId})` would pass.
  - So are a second derivation inside an already-listed file and an aliased import.
  - The claim "a new carrier fails the census" is stronger than the test.
- **F26 (out of bar, pre-existing): the bootstrap direct lane double-applies after an unknown outcome**
  (cdc-routed-mutation-readiness.js:241-275, forkB).
  - It falls back to an out-of-raft `executeLocalQuery` fan-out on any `success === false`, `outcome_unknown`
    included, so a committed-but-unknown write is applied again directly on local replicas.
  - Seed bootstrap mode only; identical at 2ee6e0c4e; not one of the loops the statement names. Recorded, not
    measured.
- **F27: the rebalancer's `linksPartitionWriteAnswer` short-circuit is unwitnessed** (mutant M6 stays green). Its own
  retry texts (replica-operation-repository.js:391-397) cannot match a failed-for-good answer, so it is currently
  inert. That is harmless, but the log's "rebalancer defers to the classifier" has no red-on-revert witness.
- **F28: session staging runs a same-entryId re-send again inside the transaction**
  (partition-service-write-metrics-base.js:195-240; forkB, unmeasured). It does not consult the outcome row or the
  pending join. Staged writes never answer unknown, so this is adjacent and out of bar; recorded.
- **F29: the lane now parses every system-table write without the parse cache**, about 100 µs for a 16-column INSERT
  (r4-render-cost.out); the admission encode is about 1 µs. Minor, but noted given the seed event-loop history.
- **F30: the A4 log entry says "Recorded: … N3, N4"**, but no durable record (log, design, epic) gives their content.
  R17 wants the discovery recorded, not just named.
- F20 (a joined twin's answer is unmarked; its receipt fails closed) is unchanged (r4-twin.out: concurrent twins answer
  `replay null`). F7 and F15 are unchanged.

## Templates (condensed)

- **admission-gating:** the mismatch and unencodable refusals are typed before the proposal and before the pending
  join, including at session staging. They are failed for good in every loop, decided by code before summary text.
  The one leak is a code-bearing unknown answer that the lane re-admits under another identity (blocking 1).
- **recovery-replay:** no replay re-executes across the two carriers, on any role or order (twin, V1-V4). A lane
  unknown on one partition is re-executed on another (blocking 1).
- **owner-interaction:**
  - One renderer and one parse for every entryId carrier.
  - The classifier is the one retry owner, and the loops defer to it.
  - The lane's local "carries the entryId" contradicts the kernel predicate's contract (blocking 1).
  - The renderer's fidelity is now a shared dependency (F24).
- **harness-fidelity:**
  - The new witnesses use production owners (engine → coordinator → executor → router → handleRemoteQuery by address,
    the production lane, the replica's own commit deadline).
  - V2/V3 withdraw the lane after one offer, which is realistic.
  - All lane witnesses offer one local partition, so N2's second partition is outside every witness.
  - Census gaps: F25.

## Commands (counts, exit codes)

- static-r4.sh → static-r4.out: every check exits 0 except:
  - test duplication (1, the branch base);
  - closed-quest-shape (1, the R1 quest's files at the branch base);
  - the first export verify (1, ENOENT, a tool property).
  Export refreshes rewrite 0 tracked files.
- chain-r4.sh → chain-r4.out: receipts head 5/5 (exit 0), sealed 0/5 (exit 1, assertions); witnesses 275/275; suites
  26401 tests / 0 fail (exit 0).
- mutants-r4.sh → mutants-r4.out: control green; M1-M5 red on the claimed witnesses; M6 green (F27).
- Probes (each exit 0):
  - r4-loops (22 scenarios);
  - r4-classify;
  - r3-crosspath → r4-crosspath (V1-V4);
  - r4-twin (20 cases);
  - r4-f19 (head and A3);
  - r4-n2 (head, A3 and sealed);
  - r4-selection (39 files);
  - r4-render-cost;
  - forkA: render-corpus, lane-vs-engine, set-expr (head and A3), n2-two-partitions, src-write-corpus;
  - forkB: witness-coverage.

## Not verified

- A live formation in which a system table splits, and whether the source-to-child window leaves two locally-led
  partition rows. Blocking 1's reachability is established from production code, not observed live.
- The whole corpus and GCP; the integration, raft-rs-backend, DT-movielens and DT6 suites (round 4 is narrow).
- `solve probe` and `solve land` themselves.
