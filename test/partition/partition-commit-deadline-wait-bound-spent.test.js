/**
 * A partition write still pending at its commit deadline is one
 * wait_bound_spent ERROR that names the write by identifiers, type and size
 * only: whatever the proposal queue held for the write, no row value (write
 * payload, BLOB) reaches the ERROR line or the logs table behind it.
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionServiceCdcStreamBase} from
  '../../src/partition/partition-service-cdc-stream-base.js';
import {ProposalQueue} from '../../src/partition/proposal-queue.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const COMMIT_DEADLINE_WAIT =
  'PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS';
const COMMIT_TIMEOUT_MS = 100;
const ROW_VALUE_MARKER = 'row-value-must-not-be-logged-';
const LARGE_ROW_REPEATS = 400;

/** A clock whose timers the test fires by hand. */
function manualClock() {
  const timers = new Map();
  let nextId = 1;
  let nowMs = 1_000;
  return {
    now: () => nowMs,
    setTimeout(callback, delayMs) {
      const id = nextId++;
      timers.set(id, {callback, delayMs});
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    fireAll() {
      for (const [id, timer] of [...timers]) {
        timers.delete(id);
        nowMs += timer.delayMs;
        timer.callback();
      }
    },
  };
}

function pendingWriteReplica(logger, clock) {
  const service = Object.create(PartitionServiceCdcStreamBase.prototype);
  return Object.assign(service, {
    logger,
    partitionId: 'p-commit-deadline',
    role: 'leader',
    timeSource: clock,
    proposalQueue: new ProposalQueue({timeSource: clock}),
  });
}

test('a spent commit deadline reports the write by type, key and size, ' +
  'never by its row value', async (t) => {
  const capture = captureLogger();
  const clock = manualClock();
  const service = pendingWriteReplica(capture.logger, clock);
  const written = service.waitForCommittedWrite('entry-1',
    {timeoutMs: COMMIT_TIMEOUT_MS});
  const released = written.then(() => null, (error) => error);
  t.equal(service.markCommittedWriteProposal('entry-1', {
    type: 'INSERT',
    key: 'pk-42',
    row: {id: 'pk-42', blob: ROW_VALUE_MARKER.repeat(LARGE_ROW_REPEATS)},
  }), true, 'the queue holds a payload-shaped proposal for the write');

  clock.fireAll();
  const error = await released;
  t.ok(error instanceof Error, 'the write is released, as before');

  const spent = capture.spent()
    .filter((line) => line.context.wait === COMMIT_DEADLINE_WAIT);
  t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
  const context = spent[0]?.context ?? {};
  t.match(context.scope, {partitionId: 'p-commit-deadline',
    entryId: 'entry-1'}, 'the write is named by its entry key');
  t.equal(context.lastObserved?.proposal?.type, 'INSERT',
    'the proposal type is reported');
  t.ok(context.lastObserved?.proposal?.serializedChars >
    ROW_VALUE_MARKER.length * LARGE_ROW_REPEATS,
  'the proposal size is reported');
  t.notOk(JSON.stringify(spent[0] ?? {}).includes(ROW_VALUE_MARKER),
    'no row value is in the ERROR line');
});

test('a write pending in a known proposal state reports that state name',
  async (t) => {
    const capture = captureLogger();
    const clock = manualClock();
    const service = pendingWriteReplica(capture.logger, clock);
    const written = service.waitForCommittedWrite('entry-2',
      {timeoutMs: COMMIT_TIMEOUT_MS});
    const released = written.then(() => null, (error) => error);
    clock.fireAll();
    await released;
    const spent = capture.spent()
      .filter((line) => line.context.wait === COMMIT_DEADLINE_WAIT);
    t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
    t.equal(spent[0]?.context.lastObserved.proposal, 'queued',
      'the queue state name is reported as is');
    t.equal(spent[0]?.context.lastObserved.pendingCommitCount, 1,
      'observed before the queue releases the write');
  });
