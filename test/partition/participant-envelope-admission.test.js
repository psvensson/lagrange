// TX1 admission boundary: required envelope shape is not build equality.
// Controlled committed delivery exercises the real SQLite apply owner; it is
// not a native-quorum or deployment-compatibility witness.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {admitCommittedCommand, PARTITION_COMMITTED_COMMAND_ORIGIN} from
  '../../src/partition/partition-committed-command-admission.js';
import {PARTICIPANT_TRANSACTION_ADMISSION_CODE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {
  COMMITTED, ENVELOPE, REPLICAS, ROW, applyCommitted, clearFixtureSingletons,
  commitDecision, envelopeDiagnosticsOf, generationOf, identityOf, operationOf,
  originCommandOf, outcomeOf, prepareCommandOf, resetFixtureSingletons, rowCount,
  shutdownAll, startReplica,
} from '../test-helpers/participant-transaction-fixture.js';

const OWNER = Object.freeze({origin: PARTITION_COMMITTED_COMMAND_ORIGIN.TRANSACTION_OWNER});
const FIELDS = Object.freeze(['sqliteVersion', 'sqliteSourceId',
  'compileOptionsDigest', 'classifierListVersion']);
beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

test('TX1 envelope owner rejects malformed PREPARE/DECISION envelopes before proposal, ' +
  'while complete foreign envelopes and generation origin remain admissible', () => {
  const identity = identityOf('envelope-shape');
  const prepare = prepareCommandOf(identity, [operationOf(ROW)], 0);
  const commands = [prepare, commitDecision(identity, prepare)];
  const malformed = [undefined, null, '', [], ...FIELDS.flatMap((field) =>
    ['', null, 7, undefined].map((value) => ({...ENVELOPE, [field]: value})))];
  const observations = commands.flatMap((command) => malformed.map((executionEnvelope) =>
    admitCommittedCommand({...command, executionEnvelope}, OWNER)));
  assert.equal(observations.length, commands.length * malformed.length);
  assert.deepEqual(observations.map(({admitted, code}) => ({admitted, code})),
    observations.map(() => ({admitted: false,
      code: PARTICIPANT_TRANSACTION_ADMISSION_CODE.BYTES_INVALID})));
  for (const command of commands) {
    assert.equal(admitCommittedCommand(command, OWNER).admitted, true);
    assert.equal(admitCommittedCommand({...command, executionEnvelope:
      {...ENVELOPE, classifierListVersion: 'different-complete-build'}}, OWNER).admitted, true,
    'shape validation is not a second build-compatibility decision');
  }
  assert.equal(admitCommittedCommand(originCommandOf(), OWNER).admitted, true,
    'generation-origin commands do not acquire transaction envelope requirements');
});

test('TX1 committed apply consumes already-ordered malformed envelopes diagnostically ' +
  'without stalling PREPARE/COMMIT or duplicating data on replay', async () => {
  const replica = await startReplica(REPLICAS[1]);
  try {
    const identity = identityOf('committed-envelope');
    const prepare = {...prepareCommandOf(identity, [operationOf(ROW)], generationOf(replica)),
      executionEnvelope: null};
    const decision = {...commitDecision(identity, prepare), executionEnvelope: {}};
    assert.equal(applyCommitted(replica, prepare), null);
    assert.equal(applyCommitted(replica, decision), null);
    assert.deepEqual(await outcomeOf(replica, identity), COMMITTED);
    assert.equal(rowCount(replica, ROW.id), 1);
    const committedGeneration = generationOf(replica);
    assert.equal(envelopeDiagnosticsOf(replica).mismatchCount, 2);
    assert.equal(applyCommitted(replica, prepare), null);
    assert.equal(applyCommitted(replica, decision), null);
    assert.deepEqual(await outcomeOf(replica, identity), COMMITTED);
    assert.equal(rowCount(replica, ROW.id), 1);
    assert.equal(generationOf(replica), committedGeneration);
  } finally {
    await shutdownAll(replica);
  }
});
