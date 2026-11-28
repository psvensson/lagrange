# Proposal for the TX1 owner: remove `status = PREPARED` from the commit path

Deferred from quest `transaction-redundant-progress-writes` by the lead's ruling of
2026-11-28 (`/mnt/data/peter/projects/lagrange-oltp-perf-20261128/reports/td-design-review.md`,
"Lead's ruling", item 2). This file is the self-contained record of the proposal:
analysis, required change B1, the design reviewer's measurements S1-S4, conditions
C2-C4, the precondition the lead ruled, and the witnesses written for it (kept here
as text; they are not collected as tests). Code is at `ab347e962`; **[V]** verified,
**[I]** inferred.

## Proposal

Delete the progress write `setTransactionStatus(tx, PREPARED)`
(`src/query/distributed/distributed-transaction-decision-protocol.js:228-230`), which
sits between the participants' PREPARED rows and the decision on every write
transaction: one consensus round on `sql_transactions-p1`, one proposal and one CDC
obligation per write transaction (new_order 19 -> 18 rounds on top of removal (a)).
Owner: the TX1 owner (quests `replicated-transaction-decision-and-apply`,
`tx1-single-path-alpha`), because the change moves a failure edge of the decision
protocol (S2) and needs a decision-write retry it does not have today (S3).

## Precondition ruled by the lead

**A refused decision write is retried idempotently or resolved by the same node.**
Until then the removal is wrong on a network that is flaky by decision: today the
PREPARED write absorbs every `sql_transactions-p1` fault between the freeze and its
own answer with a prompt, definite rollback; after the removal the same fault lands
on the decision write (S2), which is an unknown outcome for the client, holds the
PREPARED reservations until the persisted deadline, and is resolved only by another
coordinator, as COMMIT. S3 shows that the decision write already has this edge on
the unchanged tree: the pre-existing defect is that a decision that is readably
absent is never retried or resolved by the same node.

## Analysis (stage 0 census, still valid)

- **No durable reader needs the status.** Recovery restores a FROZEN undecided row as
  PREPARING (`distributed-transaction-recovery-authority.js:159-161`) and decides from
  participant evidence (`:211-213`); discovery treats PREPARED like PREPARING
  (`distributed-transaction-recovery.js:79-98`); measured: a crash at the decision
  write with the row at PREPARED is not recovered before the deadline
  (`totalRecovered: 0`) and commits after it. The release census accepts PREPARING
  undecided rows and needs every COMMIT decision write to set COMMITTING in the same
  UPDATE, which all three decision writers do
  (`sql-query-engine-transaction-persistence-methods.js:463-470`;
  `distributed-transaction-settlement.js:177-178,215-220`;
  `distributed-transaction-release-settlement.js:258-271`). Settlement and decision
  reads never read the status. [V]
- **One in-memory reader changes behaviour:** the live sweep routes an undecided live
  transaction by `RECOVERY_COMMIT_TRANSACTION_STATUS = {PREPARED, COMMITTING}`
  (`distributed-transaction-recovery.js:134-155`). Without the write, a live
  transaction whose COMMIT decision is in doubt after PREPARE is re-driven through the
  rollback protocol; the durable outcome stays COMMIT but the sweep reports
  `{path: ROLLBACK, success: false}` (measured with a scratch simulation:
  `lab/td-stage0/transaction-redundant-progress-writes-recovery-simulated-removals.tap`). [V]
- **Visible side effects:** the PG-wire 08007 detail `engine_stage` on an in-doubt
  COMMIT after PREPARE reads PREPARING instead of PREPARED
  (`src/runtime/pgwire-transaction-outcome.js:184`); telemetry purpose `preparing`
  falls from P + 1 to P; the telemetry export catalogues a COMMIT sub-phase
  `PREPARED_STATUS` that would lose its producer. [V]
- **Dead after the change:** PREPARED in `RECOVERY_COMMIT_TRANSACTION_STATUS` and
  `PREPARE_SENT_TRANSACTION_STATUS` (`distributed-transaction-decision-protocol.js:72-75`)
  and in `resolveTransactionRowPersistPurpose`. Durable-row readers should keep
  accepting PREPARED rows that earlier builds wrote (the release census set is part of
  `tx1-query-set-v1`). [V]

## Required change B1, corrected by the review (C3)

The live sweep must choose the commit protocol for an undecided live transaction
from the commit-point fact or COMMITTING, never from the PREPARED label:
`tx[COMMIT_POINT_REACHED_FIELD] || status === COMMITTING` -> `runCommitProtocol`,
else `runRollbackProtocol`. Correction from the review: the commit-point field is
also set by an in-doubt **ROLLBACK** decision (`distributed-transaction-decision.js:170,201`),
so B1 sends an in-doubt ROLLBACK through the commit protocol. The durable outcome is
right (the commit protocol adopts the recorded ROLLBACK) but the sweep then reports
an error text (S1 below). A **label-routed** variant (adding PREPARING to the
commit set) is wrong: it commits a transaction whose client was told it was not
committed (S4).

## The design reviewer's measurements (in process, single files)

Scratch scripts and outputs: `/mnt/data/peter/projects/lagrange-oltp-perf-20261128/lab/td-design-review/`
(`scratch-in-doubt.test.mjs`, `scratch-decision-refused.test.mjs`,
`scratch-sweep-negative.test.mjs`; `preload-sim.mjs` with `SIM_B=1` simulates the
removal, `SIM_B1=1` the label-routed variant).

| Case | Unchanged tree | After removal (simulated) | Output |
| --- | --- | --- | --- |
| **S1** client ROLLBACK whose decision write applies but whose answer is lost and unreadable; sweep after the budget | live tx ACTIVE/FROZEN, commit point reached; sweep `ROLLBACK, success true, error null`; both participants ROLLED_BACK once | same; with commit-point routing emulated: same path and outcome but `error: "Distributed operation failed due to participant failures"` | `in-doubt-today.tap`, `in-doubt-today-b1.tap`, `in-doubt-sim.tap` |
| **S2** the first `sql_transactions` write after the freeze is refused without applying | that write is `status:PREPARED`: COMMIT answers `RETRYABLE_REFUSAL`, `commitPointReached: false`; the client ROLLBACK succeeds at once; both participants ROLLED_BACK | that write is the decision: COMMIT answers `TRANSACTION_DECISION_IN_DOUBT`, `commitPointReached: true`; client ROLLBACK refused (in doubt); the same-node sweep cannot resolve it; a second coordinator after the deadline records **COMMIT** and both participants commit | `in-doubt-today.tap`, `in-doubt-sim.tap` |
| **S3** the decision write itself refused, unchanged tree | COMMIT and ROLLBACK both in doubt; the same-node sweep fails ("decision could not be established"); a second coordinator after the deadline commits | (the edge S2 moves the PREPARED-write faults onto) | `decision-refused-today.tap` |
| **S4** one PREPARED evidence row refused; client told `commitPointReached: false`; left past budget | sweep rolls back | with a label-routed B1 the sweep **commits** (the second participant is prepared again) | `sweep-neg-today.tap`, `sweep-neg-wrongb1.tap` |

Also measured by the reviewer: `test/query/distributed-transaction-coordinator.test.js`
109/109 on the baseline, 1 failure under the simulated removal ("emits persistence
callbacks", line 335 asserts the PREPARED write): a test this proposal must supersede.

## Conditions that travel with the proposal

- **C2** negative control: a live undecided transaction past its budget with no
  commit point is rolled back by the sweep (S4 as a witness).
- **C3** B1 as commit-point routing, described as above, with the in-doubt ROLLBACK
  sweep witness (S1).
- **C4** the failure edge stated with S2/S3 and its witness; the lead's explicit
  acceptance; the pre-existing defect (a readably absent decision is never retried or
  resolved by the same node) routed to the TX1 owner. The lead has ruled the
  precondition above instead of accepting the edge.
- **Supersessions it needs** (from stage 0, completed by the review):
  `test/query/distributed-transaction-coordinator.test.js:335`;
  `test/query/tx-metadata-pgwire-and-result-representation.test.js:323-333` (6 -> 5
  `sql_transactions` mutations, decision index 4 -> 3) and `:389` (`preparing` 2 -> 1);
  the TX1 hold points `test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js`
  A2 and A5 `afterPrepare` (`statusWriteOf(PREPARED)` -> `isDecisionWrite`), which
  hold at this very write; the telemetry export's `PREPARED_STATUS` sub-phase and its
  pinned mutation sequence.

## Witnesses written for it in stage 0 (text only, not collected)

Recoverable byte for byte from commit `d974dfb9a7d0d6114d95a3dabb57e12077b54a84`
(`git show d974dfb9a:<path>`); they used the world of
`test/query/transaction-progress-write-witness-support.js` at that commit.

From `test/query/transaction-progress-write-witness-support.js` (the in-doubt world):

```js
/**
 * A live coordinator's decision write applies but its answer is lost and
 * the decision cannot be read back: the COMMIT is answered in doubt and the
 * transaction stays with its live session. After the budget, the periodic
 * sweep must adopt the recorded decision and complete it.
 * @param {Object} options - {tables}.
 * @return {Promise<Object>} {answer, sweep, final}.
 */
async function runLiveInDoubtSweepScenario(options) {
  const world = createProgressWriteWorld({tables: options.tables});
  try {
    const {engine, gateway} = world.createEngine();
    const submit = gateway.submitMutation.bind(gateway);
    const read = gateway.readAuthoritativeRows.bind(gateway);
    let decisionAnswerLost = false;
    let decisionUnreadable = false;
    gateway.submitMutation = async (mutation, mutationOptions) => {
      const applied = await submit(mutation, mutationOptions);
      if (!decisionAnswerLost && isDecisionWrite(mutation)) {
        decisionAnswerLost = true;
        decisionUnreadable = true;
        return {success: false, error: 'decision answer lost'};
      }
      return applied;
    };
    gateway.readAuthoritativeRows = async (tableName, ...rest) =>
      (decisionUnreadable && tableName === TABLES.SQL_TRANSACTIONS ?
        {success: false} : read(tableName, ...rest));
    const run = await startWriteTransaction(engine, 'in-doubt',
      options.tables, 'COMMIT');
    const answer = await run.finished;
    decisionUnreadable = false;
    world.advancePastDeadline();
    const sweep = await engine.transactionCoordinator.runRecoverySweep();
    const row = world.transactionRow(run.begun.transactionId);
    const ledger = world.ledger.entries();
    return {
      answer: {success: answer.success === true, errorCode: answer.errorCode,
        commitPointReached: answer.commitPointReached},
      sweep: sweep.results.map((entry) => ({path: entry.sweepPath,
        success: entry.success, statusAfter: entry.statusAfter})),
      final: {decision: row?.decision ?? null, status: row?.status ?? null,
        participantDecisions: ledger.map((entry) =>
          entry.decisions.map((applied) => applied.decision)),
        orphanedSessions: ledger.filter((entry) =>
          LEDGER_OPEN_STATES.has(entry.state)).length,
        violations: [...world.ledger.violations]},
    };
  } finally {
    await world.close();
  }
}
```

From `test/query/transaction-redundant-progress-writes-recovery.test.js` (green on the
unchanged tree, red under the removal without B1):

```js
test('live in-doubt decision: the sweep adopts the recorded COMMIT through ' +
  'the commit path and reports it completed', async () => {
  const facts = await runLiveInDoubtSweepScenario({tables: TWO_TABLES});
  assert.deepEqual(facts, {
    answer: {success: false, errorCode: 'TRANSACTION_DECISION_IN_DOUBT',
      commitPointReached: true},
    sweep: [{path: 'COMMIT', success: true, statusAfter: 'COMMITTED'}],
    final: {decision: 'COMMIT', status: 'COMMITTED',
      participantDecisions: [['COMMIT'], ['COMMIT']], orphanedSessions: 0,
      violations: []},
  });
});
```

From `test/query/transaction-redundant-progress-writes.test.js` (red while the write
exists; it also asserted `countOf(facts.labels, 'status:PREPARED') === 0` in the
one- and two-table COMMIT counts):

```js
test('red: the decision is the next sql_transactions write after the ' +
  'manifest freeze (no PREPARED status between them)', async () => {
  const facts = await measureWriteTransaction({tables: TWO_TABLES,
    finish: 'COMMIT'});
  const rowWrites = transactionRowLabels(facts.labels);
  const freezeAt = rowWrites.indexOf('manifestFreeze');
  assert.ok(freezeAt >= 0, 'the manifest is frozen');
  assert.equal(rowWrites[freezeAt + 1], 'decision',
    `sql_transactions writes: ${rowWrites.join(', ')}`);
});
```

From `scripts/checks/transaction-redundant-progress-writes-guard.js` (properties
`prepared-status-write-absent` and `live-in-doubt-sweep-commit-path`):

```js
function checkPreparedStatusAbsent(cases) {
  assertAllSucceeded(cases);
  assert.equal(countOf(cases.oneCommit.labels, LABEL_PREPARED_STATUS), ZERO);
  assert.equal(countOf(cases.twoCommit.labels, LABEL_PREPARED_STATUS), ZERO);
}

function checkParticipantRowsStartAtPrepare(cases) {

async function checkLiveInDoubtSweep() {
  const facts = await runLiveInDoubtSweepScenario({tables: TWO_TABLES});
  assert.equal(facts.answer.errorCode, ERROR_IN_DOUBT);
  assert.equal(facts.answer.commitPointReached, true);
  assert.deepEqual(arrayMap(facts.sweep, (entry) =>
    [entry.path, entry.success, entry.statusAfter]),
  [[DECISION_COMMIT, true, STATUS_COMMITTED]]);
  assert.equal(facts.final.status, STATUS_COMMITTED);
  assert.deepEqual(facts.final.violations, []);
}
```

Stage-0 measurement of that guard (both removals simulated): metric 1, only
`live-in-doubt-sweep-commit-path` (`lab/td-stage0/guard-simulated-removals.json`).
