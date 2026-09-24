# Verdict r3: reroute-carries-the-entry-id (attempt A3, head 0888eb9a4)

Head verified: 0888eb9a44961a27aef5d1050127dab97b3bd583 (worktree
/mnt/data/peter/projects/lagrange/.claude/worktrees/q-reroute). `git status --short` at start and end, unchanged by me:
` M solve/quests/reroute-carries-the-entry-id/log.ndjson` (the lead's A3 attempt entry, one appended line;
`check-quest-log-append-only` clean). I edited no repository file and ran no git write command (`git archive` into
scratch only). Scratch: scratchpad/verify-reroute/r3/ (paths below are relative to it). Every run was under `timeout`.
The thermal gate ran before each batch: static "ok cpu 52C"; chain "hold 84C" then "ok 68C", and "ok 72C" before the
suites. The load came from another session's tap run on the main checkout, not mine. Suites ran at
`--test-concurrency=2`. After every runner, no process or temp directory of mine remained: the eight
/tmp/write-attempt-* directories dated 22:57 are r2's pre-existing ones, and the count stayed 8 after every harness
run. The A2 comparison tree is r2/head-archive, checked file-by-file against `git show 037c650c0:` over 1924 src/test
paths with 0 differences.

## Verdict: REJECT (two blocking items)

The round-2 blocker is closed. F14, F16 and F18 hold for what they claim, and F17's listed owners are all live. But
the statement binding that F14 extends (and that F16 names on every replay) binds the statement by its TEXT. The
quest wires two paths to ONE entryId for one logical mutation (C1: the CDC local lane derives the coordinator's
entryId), and those two paths send different texts for the same UPDATE/DELETE. As a result an applied mutation is
reported failed (blocking 1). The registry also leaves three owners this change touched without selecting the
witnesses that assert on them, and A3's own regeneration removed the only path by which one of them did (blocking 2,
mechanical).

### Blocking

1. **One logical mutation, one entryId, two texts: the engine's re-send of a lane attempt that committed is refused as
   "another statement", and the routed mutation reports failure for a write that applied (R14, R11; quest C1/C3;
   epic item 9 "a second transport path").**
   - The CDC local lane (cdc-local-system-table-write-lane.js, `sendLocalSystemTableWrite`) sends the CALLER's SQL
     text under `deriveParticipantEntryId(key, partitionId)`. The routed engine path sends the ENGINE-RENDERED text
     under the same entryId. The engine re-renders UPDATE and DELETE (r3-render.out: `UPDATE identity_rows SET value =
     ? WHERE id = ?` is delivered as `... WHERE (id = ?)`; DELETE likewise; INSERT is unchanged).
   - `statementDigestOf` digests `encodeProposal([sql, params])`, so the two texts get different digests.
   - Measured through production owners over the A2 harness: CDCIntegrationService, the lane,
     ControlPlaneSystemTableGateway, ReplicaOperationRepository, SQLQueryEngine, and the controllable port, whose
     first proposal is released `partition_write_outcome_unknown` by the replica's own commit deadline and then
     commits (r3-crosspath.mjs / r3-crosspath.out).
   - **V1 (the S3 shape, lane offered on every attempt):** the lane's raw attempt is answered unknown and committed.
     The engine's rendered re-send under the same entryId is answered `partition_write_entry_id_statement_mismatch`.
     The loop recovers only because its next attempt goes through the lane again (raw text: `same_statement` replay).
   - **V2 (lane offered only on the first attempt):** this is what happens when the local replica stops being a local
     leader after the unknown outcome, which is the usual cause of one. The CDC routed mutation makes 6 engine
     attempts; every one is refused as a mismatch, and the call throws "Distributed operation failed due to
     participant failures". The mutation DID apply: `applications 1`, value `moved`.
   - **V3 (the rebalancer's row mutation through the gateway ingress and the CDC row mutation, lane offered once):**
     61 engine attempts, all mismatch; the repository returns a failure after its budget, while `applications 1`,
     value `moved`.
   - **V4 (the rebalancer's SQL mutation, which does not use the lane):** replays correctly. The defect is specific
     to the lane plus engine composition.
   - The same result on the A2 archive (r3-crosspath-A2.out) shows A2's text digest introduced this. r2 did not catch
     it because the witnesses compare statements "by verb and parameters (the engine re-renders the text from its
     parse)" (write-identity-attempt-harness.js `carries`). S3 passes only because routing churn re-offers the lane,
     and nothing asserts how the engine's re-send was answered.
   - **What A3 adds:** F14 carries the same text binding into the pending join. On a 3-replica group, the same UPDATE
     sent by a follower's own `executeQuery` (the caller's text) and concurrently by the engine (rendered text) under
     one entryId: the engine's copy is refused as a mismatch, and the write applies once from the follower's copy
     (r3-f14.out `H_group_sameTwin`; before A3 it joined).
   - **Consequence:**
     - A committed control-plane mutation is reported failed. The caller then acts on "not persisted", for example
       with a later retry under a new key, which is the double-application class the quest exists to close.
     - The mismatch refusal also burns the whole retry budget, because the summary's text is retryable (finding
       F22).
   - **Owner:** the committed-statement outcome owner (what "the same statement" means) together with the lane (which
     text it sends). One logical statement needs one binding identity on every path that carries its entryId: for
     example, the lane sends the engine's rendering, or the digest binds a canonical form owned in one place.
   - **Witness requirement:** a lane-then-engine witness in which the lane is not re-offered, asserting that the
     engine's re-send is answered as a replay and that the loop answers success.

2. **The registry does not select the quest's witnesses for three owners this change touched, and A3's metadata
   regeneration removed the only path by which one of them did (epic item 8; brief item 11 "names every owner
   touched"; the brief's subsystem-classes note).**
   - The subsystem census's observation producer is working as written. It counts every repository-path literal that
     is not on an import line (test-subsystem-classification.js:506, `OBSERVATION_IMPORT_LINE_PATTERN`).
   - A2's `import {…} from\n  '…/partition-committed-statement-outcome-constants.js'` put the literal on its own line,
     so the literal counted as an "observation". A3 reformatted the import to `} from '…'`, so it no longer counts.
     The drop is formatting-caused, and the producer is right about direct imports.
   - It does change selection (r3-selection-head.out vs r3-selection-A2.out). A change to
     partition-committed-statement-outcome-constants.js selected write-identity-replay-answers.test.js on A2 (reason
     `observer: files`) and selects it NOT on the head.
   - For every src file A3 changed (r3-selection2.out), three select none of write-identity-end-to-end,
     -replay-answers or -loops:
     - the outcome constants (the binding states F16 names, the mismatch message, the widening columns, the digest
       recipe; 62 lines changed by this quest);
     - partition-service-raft-write-commit.js (registers the pending write with its command: F14's other half);
     - partition-service-write-metrics-base.js (applyWrite: the join call, its order before admission, the settled
       answer).
   - These files are owners of other contracts, but not of `partition-write-answer-retry-classification`, whose tests
     are the F3/F4/F14/F16 witnesses.
   - **Fix (mechanical):** name the three files in that contract's owners (or the pair's owner endpoint), then run
     `audit:impact-contracts`.

## Round-3 items

1. **Round-2 blocker: closed.**
   - In the worktree, `--verify-import-graph` exits 0 (static-verify-import-graph-worktree.out).
   - In a clean `git archive HEAD` export (7712 files, node_modules symlinked), the first verify exits 1 with ENOENT
     on the UNTRACKED report `test-output/analysis/global-owner-debt-import-graph.json`. The verify reads that report
     by design (generate-global-owner-debt-inventory.js:876-891); this is a tool property, not a seal mismatch.
   - `npm run -s test:metadata:refresh` exits 0 and rewrites no tracked file (1 NEW untracked report).
   - `--refresh` exits 0 and rewrites no tracked file (6 NEW untracked reports).
   - The verify then exits 0, with snapshot 7a0feb4d… equal to the committed seal (static-rewrites-after-*.out).
   - `audit:shards` passes in both the worktree and the export.
2. **F14: holds for one text; fails across paths (blocking 1).** Lone rs-raft leader through the real engine
   (r3-f14.out). Every later arrival was observed `pending: true` at applyWrite.
   - Two different statements: the first applied; the second was refused with `partition_write_entry_id_statement_mismatch`
     (entryId named, 1 delivery: not rerouted). Nothing else applied.
   - The same-statement twin joins: same logIndex, applied once.
   - (same, other, same): 1 / refused / joined; only `same` applied.
   - (X, Y, Z): X applied; Y and Z both refused.
   - (other, same, same): `other` applied; both `same` refused.
   - INSERTs of two different rows under one key: one row.
   - After settling, A replays `same_statement` and B is refused.
   - BigInt (the implementer's question): see F19.
3. **F16: holds** (r3-f16.out).
   - A replay carries `statementBinding` at the partition directly, on the wire (handleRemoteQuery by address), at
     the engine participant and in the admin envelope's participant receipt: `same_statement`. It is absent on a
     non-replay at every layer.
   - A STATEMENT_FAILED row's replay carries it with `replayOfLogIndex`.
   - A legacy NULL-digest APPLIED row re-issued with another statement answers `unrecorded`, applies nothing, and
     leaves the value unchanged.
   - A legacy FAILED row re-issued with another INSERT answers the original failure `unrecorded`; the new row is not
     written.
   - After a restart the bound row answers `same_statement`. An older donor (digest column dropped, re-added at init)
     answers `unrecorded` for the same and for another statement, with nothing applied.
   - 3-replica group: leader wire, follower forward, engine replay and new-leader wire after the proposer's shutdown
     all answer `same_statement` with the proposer's witness; applications [1,1,1].
4. **F18: holds.**
   - `pickSingleAnswerFields` in the kernel is the one owner; `renderSinglePartitionFailure` is gone from src and test
     (grep 0).
   - Real engine, single participant: the mismatch and the constraint failure carry the participant's `failureCode`
     and (for the mismatch) `entryId` at the top level (r3-f14.out `A_twoDifferent`, r3-f16.out `failedRow_*`).
   - Coordinator: one participant carries its fields; several carry none (r3-f18-head.out `multiOneFailed` /
     `multiBothFailed` top `{}` except the pre-existing summed `retryAfterMs`).
   - Consequence measured: finding F21.
5. **F17: holds for what is listed.**
   - All 25 owners, 9 tests and 15 consumer-endpoint files exist, and every src one is imported (f17-live.out).
   - `test:unused` (knip) exits 0.
   - `audit:impact-contracts` PASS (40/17).
   - Residual: blocking 2.
6. **Receipts, suites, static.**
   - Receipts: 5/5 on the head (6 s). The witness file's last commit is 2ee6e0c4e; its sha256 ac727c13… equals the
     committed receipt's `testFileDigests`.
   - A2/A3 witnesses: 127/127 (loops, replay-answers, lane, kernel, coordinator failure log).
   - Suites: 773 files (query, partition, cdc, admin, control-plane, rebalancer): 26343 tests, 26259 pass, 0 fail,
     0 cancelled, 84 skipped, 212 s, exit 0.
   - Ratchets, all at baseline: complexity 1812/1812, cognitive 159/159, unused exports 1433/1433, file-size 27/27 +
     21/21, src duplication 55/1775 OK.
   - Test duplication: 794/30542 FAILED against 793/30519. This is identical to the branch base; no clone group of
     the 794 touches any changed test file (jscpd-test report scanned), so A3 adds none.
   - Other checks: `check-fast-static` ok; `audit:guidelines` 0 new; eslint on the 50 changed .js files clean;
     boundary audit exit 0; legacy naming clean; quest-log append-only clean.

## Findings (non-blocking; record per R17)

- **F19 (BigInt, the implementer's question).** With a write pending under an entryId, a BigInt statement under the
  same entryId makes `joinPendingStatement` → `statementDigestOf` → `encodeProposal` throw `proposal_unencodable`
  inside applyWrite. The join runs before admission (partition-service-write-metrics-base.js:675 vs :679).
  - A direct `executeQuery` rejects (r3-bigint.out `pending_direct`, stack through
    partition-committed-statement-outcome.js:148).
  - Through the wire or the engine it is NOT a throw: handleRemoteQuery turns it into an untyped failure answer (no
    failureCode), which has the same shape as the no-pending admission refusal (also untyped: r3-bigint
    `noPending_*`).
  - Reachable as a throw only by an in-process caller (the CDC lane is the production one) with a BigInt param. Not
    applied, and not a false success (before A3, the join told it the first write's success).
  - In-bar under R07 as a naming gap: the unencodable outcome is a named state on neither path. Fix: admission
    before the join, and a typed unencodable refusal.
- **F20.** A same-statement twin that joins a pending write gets the first submission's answer unmarked (no
  `idempotentReplay`). Its admin receipt is `complete false, witnessed 0`, because the witness names the first
  submission's operationId (r3-twin-receipt.out). A later re-issue is a marked replay and complete. The receipt fails
  closed, so this is honest, but the join answer should be marked as a joined, replayed answer.
- **F21 (F18's consequence).** The coordinator's summary text "Distributed operation failed due to participant
  failures" is a RETRYABLE fragment (control-plane-error-classification.js:19).
  - With the top-level code, a single-participant host failure is now decided by code: `isRetryableControlPlaneError`
    is false on A3, true on A2 (r3-f18-head.out vs r3-f18-A2.out). This conforms to the contract ("retries every
    answer but a host failure").
  - A multi-participant host failure is still retried by the summary text, so the decision now depends on how many
    participants the write had.
  - The CDC transient test still retries the host failure in both shapes.
- **F22.** The mismatch refusal is not a kernel write code, so the summary text path makes it retryable. The CDC
  routed loop retries it 6 times and the rebalancer 61 times (V2/V3). The same key and statement can never succeed,
  so the budget is wasted; it rescues V1 only by accident.
- **Minor:** `renderSinglePartitionIdentity` (query-executor-sql-command-rendering.js:31) keeps its own
  `results.length === 1` alongside the kernel's `pickSingleAnswerFields`.
- F7 (test duplication at the branch base, fixed on main by 89525e7a9), F15 (out of bar), and F1/F8/F9/F10/F11 are
  unchanged.

## Templates (condensed)

- **admission-gating:** the mismatch refusal is typed before proposal, at apply and at the pending join, for one text.
  "Same statement" is decided by text, not by the logical statement (blocking 1). Unencodable params are untyped
  (F19).
- **recovery-replay:** no replay re-executes on any role, across restart or with an older donor. A replay across the
  two paths is refused (blocking 1).
- **owner-interaction:**
  - One owner each for the summary fields (kernel) and the binding (the outcome owner).
  - The lane and the engine render one statement two ways under one identity (blocking 1).
  - Registry gap (blocking 2).
  - Classification depends on participant count (F21).
- **harness-fidelity:**
  - The harness's `carries` deliberately ignores text; that is exactly what hides blocking 1.
  - My probes use the production owners, the replica's own clock, the engine and the envelope. The follower copy in
    `H` uses the caller's text, as the lane does.

## Commands (counts, exit codes)

- static-r3.sh → static-r3.out: every check exit 0 except test duplication (exit 1, the branch base) and the first
  export verify (ENOENT, a tool property); export refreshes rewrite 0 tracked files.
- chain-r3.sh → chain-r3.out: receipts 5/5, witnesses 127/127, suites 26343/0 fail, exit 0.
- Probes (each exit 0): r3-f14, r3-render, r3-crosspath (head and A2), r3-f16, r3-f18 (head and A2), r3-bigint,
  r3-selection (head and A2), r3-selection2, r3-twin-receipt; `npm run -s test:unused` exit 0.

## Not verified

- The whole corpus and GCP.
- A live multi-node formation exercising the lane (blocking 1 is measured on the production owners over the
  controllable port and a real 3-replica rs-raft group).
- `solve probe` and `solve land` themselves.
