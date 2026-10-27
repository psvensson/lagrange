import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DistributedTransactionCoordinator} from
  '../../src/query/distributed/distributed-transaction-coordinator.js';
import {decisionBindingRefusalOf} from
  '../../src/partition/partition-participant-transaction-bytes.js';
import {participantFailureOf} from
  '../../src/query/sql-query-engine-participant-wire.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
import {RECOVERY_PREPARE_EVIDENCE as evidence, discoverWithAuthority,
  recoveryDecisionColumns, recoveryRowsOf} from
  '../test-helpers/transaction-recovery-rows-fixture.js';

const logger = {warn() {}, error() {}, debug() {}};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return {promise, resolve};
};
const ticks = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
};

// A COMMITTING row with its recorded decision; the participant projection
// is stale (PREPARING, no retained evidence).
function recoveryRows(transactionId, sessionId, decision = 'COMMIT') {
  return recoveryRowsOf({transactionId, sessionId, participantStatus: 'PREPARING',
    prepared: false, overrides: {status: 'COMMITTING',
      ...recoveryDecisionColumns(transactionId, ['p1'], decision)}});
}

// The discovery projection and actual retained owner row are distinct inputs.
const restoreRecorded = discoverWithAuthority;

test('TX1 Q1: recovery consumes the immutable COMMIT binding when the ' +
  'participant projection is stale', async () => {
  const requests = [];
  const coordinator = new DistributedTransactionCoordinator({logger,
    now: () => 100, participantRetryMaxRetries: 0,
    commitParticipant: async (_session, _partition, request) => {
      requests.push(request);
      const refusal = decisionBindingRefusalOf(request);
      if (refusal) {
        throw participantFailureOf(QUERY_OPERATION.COMMIT,
          {failureCode: refusal});
      }
      return {success: true, outcome: 'COMMITTED'};
    }});
  restoreRecorded(coordinator, recoveryRows('a'.repeat(32), 'stale'));
  const replay = await coordinator.resumeRecoveredTransactions();
  assert.equal(replay.resumed, 1, 'immutable decision releases the obligation');
  assert.equal(requests[0].preparedDigest, evidence.preparedDigest);
  assert.equal(coordinator.getTransaction('stale'), null);
});

test('TX1 Q2: recovery and BEGIN share the live request FIFO under a ' +
  'delayed PREPARE answer', async () => {
  let now = 0;
  let recorded = null;
  const entered = deferred();
  const release = deferred();
  const calls = [];
  const coordinator = new DistributedTransactionCoordinator({logger,
    now: () => now, transactionBudgetMs: 10, participantRetryMaxRetries: 0,
    prepareParticipant: async () => {
      calls.push('prepare'); entered.resolve(); await release.promise;
      return evidence;
    },
    persistTransactionDecision: async (record) => {
      if (recorded) throw new Error('decision already recorded');
      recorded = record;
    },
    readTransactionDecision: async () => recorded,
    rollbackParticipant: async () => {
      calls.push('rollback');
    }});
  await coordinator.begin('shared');
  await coordinator.enlistParticipants('shared', ['p1']);
  const commit = coordinator.commit('shared');
  await entered.promise;
  now = 20;
  const sweep = coordinator.runRecoverySweep();
  await ticks();
  const duringPrepare = [...calls];
  const nextBegin = coordinator.begin('shared');
  release.resolve();
  await Promise.all([commit, sweep]);
  assert.equal((await nextBegin).errorCode, 'NO_TRANSACTION',
    'a BEGIN queued in the old block cannot become a new block');
  const next = await coordinator.begin('shared');
  assert.deepEqual(duringPrepare, ['prepare'], 'sweep waits for request owner');
  assert.equal(next.success, true);
  assert.equal(coordinator.getTransaction('shared').transactionId,
    next.transactionId, 'late old work cannot erase the new session owner');
});

test('TX1 Q3: failed PREPARED persistence stays pending until durable before ' +
  'the decision', async () => {
  const persisted = [];
  let failPrepared = true;
  let retainedAtDecision = false;
  const coordinator = new DistributedTransactionCoordinator({logger,
    prepareParticipant: async () => evidence,
    persistParticipant: async (participant) => {
      if (participant.status === 'PREPARED' && failPrepared) {
        failPrepared = false;
        throw new Error('prepared evidence unavailable');
      }
      persisted.push({...participant});
    },
    persistTransactionDecision: async () => {
      retainedAtDecision = persisted.some((row) => row.status === 'PREPARED');
    }});
  await coordinator.begin('evidence');
  await coordinator.enlistParticipants('evidence', ['p1']);
  await assert.rejects(coordinator.commit('evidence'),
    /prepared evidence unavailable/u);
  assert.equal((await coordinator.commit('evidence')).success, true);
  assert.equal(retainedAtDecision, true, 'positive PREPARE was durable first');
});

test('TX1 Q4: an ended transaction projection never replaces a newer live ' +
  'session owner or resurrects ended work', async () => {
  const rows = [];
  const coordinator = new DistributedTransactionCoordinator({logger,
    persistTransaction: async (row) => {
      rows.push({...row});
    }});
  await coordinator.begin('reused');
  const stale = rows.at(-1);
  await coordinator.rollback('reused');
  const next = await coordinator.begin('reused');
  coordinator.recoverFromSystemTables({transactions: [stale], participants: []});
  assert.equal(coordinator.getTransaction('reused').transactionId,
    next.transactionId);
  assert.equal(coordinator.recoveredTransactionIds.size, 0);
});

test('TX1 Q4: an older unknown durable obligation replays by exact ID without ' +
  'stealing a live session owner', async () => {
  const requests = [];
  const coordinator = new DistributedTransactionCoordinator({logger,
    now: () => 100, commitParticipant: async (_session, _partition, request) => {
      requests.push(request); return {success: true, outcome: 'COMMITTED'};
    }});
  const current = await coordinator.begin('reused');
  const oldId = 'c'.repeat(32);
  restoreRecorded(coordinator, recoveryRows(oldId, 'reused'));
  const replay = await coordinator.resumeRecoveredTransactions();
  assert.equal(replay.resumed, 1);
  assert.deepEqual(requests.map((request) => request.transactionId), [oldId]);
  assert.equal(coordinator.getTransaction('reused').transactionId,
    current.transactionId, 'older obligation never acquires the live binding');
});

test('TX1 Q1: COMMITTING without its recorded decision is in doubt, never ' +
  'reconstructed from a status or participant projection', async () => {
  const writes = [];
  const fanout = [];
  const coordinator = new DistributedTransactionCoordinator({logger,
    now: () => 100, persistTransactionDecision: async (record) => {
      writes.push(record);
    }, readTransactionDecision: async () => null,
    commitParticipant: async () => {
      fanout.push('commit');
    }});
  const rows = recoveryRows('d'.repeat(32), 'missing-decision');
  Object.assign(rows.transactions[0], {decision: null,
    decision_text: null, decision_digest: null});
  coordinator.recoverFromSystemTables(rows);
  const replay = await coordinator.resumeRecoveredTransactions();
  assert.equal(replay.failed, 1);
  assert.deepEqual(writes, []);
  assert.deepEqual(fanout, []);
});

test('TX1 Q4: a detached failed obligation remains retryable by the sweep',
  async () => {
    let available = false;
    const requests = [];
    const coordinator = new DistributedTransactionCoordinator({logger,
      now: () => 100, participantRetryMaxRetries: 0,
      commitParticipant: async (_session, _partition, request) => {
        requests.push(request.transactionId);
        if (!available) throw new Error('participant unavailable');
      }});
    const current = await coordinator.begin('occupied');
    const oldId = 'e'.repeat(32);
    restoreRecorded(coordinator, recoveryRows(oldId, 'occupied'));
    const replay = await coordinator.resumeRecoveredTransactions();
    assert.equal(replay.failed, 1);
    assert.equal(replay.resumed, 0, 'a retained obligation is not a success');
    assert.ok(coordinator.recoveredTransactionIds.has(oldId));
    available = true;
    const sweep = await coordinator.runRecoverySweep();
    assert.equal(sweep.resolved, 1);
    assert.deepEqual(requests, [oldId, oldId]);
    assert.equal(coordinator.getTransaction('occupied').transactionId,
      current.transactionId);
  });

test('TX1 Q1: malformed authoritative decision remains held without replacing a live owner',
  async () => {
    const coordinator = new DistributedTransactionCoordinator({logger});
    const current = await coordinator.begin('occupied');
    const rows = recoveryRows('f'.repeat(32), 'occupied');
    rows.transactions[0].decision_text = '{}';
    restoreRecorded(coordinator, rows);
    const replay = await coordinator.resumeRecoveredTransactions();
    assert.equal(replay.resumed, 0);
    assert.equal(replay.results[0].decisionReadState, 'invalid');
    assert.equal(coordinator.recoveredTransactionIds.has(
      rows.transactions[0].transaction_id), true);
    assert.equal(coordinator.getTransaction('occupied').transactionId,
      current.transactionId);
    assert.equal(coordinator.workflowCoordinator.workflowsById.size, 2);
  });

test('TX1 Q1: inconsistent authoritative set count cannot complete a nonempty decision',
  async () => {
    const coordinator = new DistributedTransactionCoordinator({logger});
    const rows = recoveryRows('a'.repeat(32), 'lost-participants');
    rows.transactions[0].frozen_participant_count = 0;
    rows.participants = [];
    restoreRecorded(coordinator, rows);
    const replay = await coordinator.resumeRecoveredTransactions();
    assert.equal(replay.resumed, 0);
    assert.equal(replay.results[0].decisionReadState, 'invalid');
    assert.equal(coordinator.recoveredTransactionIds.has(
      rows.transactions[0].transaction_id), true);
  });

test('TX1 Q1: a later authoritative decision cannot complete an empty registry',
  async () => {
    const rows = recoveryRows('a'.repeat(32), 'empty-registry');
    const recorded = {...rows.transactions[0]};
    Object.assign(rows.transactions[0], {frozen_participant_count: 0,
      decision: null, decision_text: null, decision_digest: null});
    rows.participants = [];
    const coordinator = new DistributedTransactionCoordinator({logger,
      readTransactionDecision: async () => recorded});
    coordinator.recoverFromSystemTables(rows);
    const replay = await coordinator.resumeRecoveredTransactions();
    assert.equal(replay.failed, 1);
    assert.equal(coordinator.recoveredTransactionIds.has(
      rows.transactions[0].transaction_id), true);
  });

test('TX1 Q3: overlapping COMMIT waits for the durable PREPARED acknowledgement',
  async () => {
    const entered = deferred();
    const release = deferred();
    let writes = 0;
    const coordinator = new DistributedTransactionCoordinator({logger,
      prepareParticipant: async () => evidence,
      persistParticipant: async (participant) => {
        if (participant.status === 'PREPARED') {
          entered.resolve(); await release.promise;
        }
      }, persistTransactionDecision: async () => {
        writes += 1;
      }});
    await coordinator.begin('overlap');
    await coordinator.enlistParticipants('overlap', ['p1']);
    const first = coordinator.commit('overlap');
    await entered.promise;
    const second = coordinator.commit('overlap');
    await ticks();
    assert.equal(writes, 0);
    release.resolve();
    assert.equal((await first).success, true);
    assert.equal((await second).errorCode, 'NO_TRANSACTION');
    assert.equal(writes, 1);
  });

test('TX1 Q2/Q5: a held read delays recovery and a late old statement is refused',
  async () => {
    let now = 0;
    const entered = deferred();
    const release = deferred();
    const calls = [];
    const coordinator = new DistributedTransactionCoordinator({logger,
      now: () => now, transactionBudgetMs: 10,
      rollbackParticipant: async () => {
        calls.push('rollback');
      }});
    const first = await coordinator.begin('read-lane');
    const read = coordinator.executeReadStatement('read-lane',
      first.transactionId, async (owner) => {
        await owner.enlist(['p1']);
        calls.push('read'); entered.resolve(); await release.promise;
        calls.push('read-done'); return {success: true};
      });
    await entered.promise;
    now = 20;
    const sweep = coordinator.runRecoverySweep();
    await ticks();
    assert.deepEqual(calls, ['read']);
    const next = coordinator.begin('read-lane');
    const lateRead = coordinator.executeReadStatement('read-lane',
      first.transactionId, async () => {
        calls.push('late-read');
      });
    const lateWrite = coordinator.executeWriteStatement('read-lane',
      {partitionIds: ['p1']}, async () => {
        calls.push('late-write');
      },
      first.transactionId);
    release.resolve();
    assert.equal((await read).success, true);
    assert.equal((await sweep).resolved, 1);
    assert.equal((await next).errorCode, 'NO_TRANSACTION');
    assert.equal((await lateRead).errorCode, 'NO_TRANSACTION');
    assert.equal((await lateWrite).errorCode, 'NO_TRANSACTION');
    assert.deepEqual(calls, ['read', 'read-done', 'rollback']);
    assert.equal((await coordinator.begin('read-lane')).success, true,
      'a fresh request can start after the old block ends');
  });

test('TX1 Q5: a read naming a recovered obligation cannot answer with a ' +
  'recovery COMMIT result', async () => {
  let commits = 0;
  let reads = 0;
  const coordinator = new DistributedTransactionCoordinator({logger,
    now: () => 100, commitParticipant: async () => {
      commits += 1;
    }});
  const rows = recoveryRows('b'.repeat(32), 'expired-read');
  coordinator.recoverFromSystemTables(rows);
  const result = await coordinator.executeReadStatement('expired-read',
    rows.transactions[0].transaction_id, async () => {
      reads += 1; return {success: true};
    });
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'NO_TRANSACTION',
    'the session does not hold the recovered obligation');
  assert.equal(reads, 0);
  assert.equal(commits, 0, 'the retained decision belongs to recovery');
});

test('review Q2: resumed older debt waits behind the current owner read FIFO',
  async () => {
    const entered = deferred();
    const release = deferred();
    const calls = [];
    const coordinator = new DistributedTransactionCoordinator({logger,
      now: () => 100, commitParticipant: async (_session, _partition, request) => {
        calls.push(request.transactionId);
      }});
    const current = await coordinator.begin('resume-lane');
    const oldId = 'a'.repeat(32);
    restoreRecorded(coordinator, recoveryRows(oldId, 'resume-lane'));
    const read = coordinator.executeReadStatement('resume-lane',
      current.transactionId, async () => {
        entered.resolve(); await release.promise; return {success: true};
      });
    await entered.promise;
    const replay = coordinator.resumeRecoveredTransactions();
    await ticks();
    const duringRead = [...calls];
    release.resolve();
    assert.equal((await read).success, true);
    assert.equal((await replay).resumed, 1);
    assert.deepEqual(duringRead, [], 'restart replay shares the request lane');
    assert.deepEqual(calls, [oldId]);
    assert.equal(coordinator.getTransaction('resume-lane').transactionId,
      current.transactionId);
  });
