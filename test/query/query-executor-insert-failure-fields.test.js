// Characterization of the typed failure an INSERT throws when its partition
// refuses it: which fields of the partition's failure answer travel on the
// thrown error, and their order of precedence.
import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  createMockMessageRouter,
  createMockSystemCache,
  parseSQL,
} from './query-executor-test-support.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createCommittedServeEligibilityOwner} from '../control-plane/serve-eligibility-test-support.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const PARTITION = 'p1';

function refusingExecutor(failure) {
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([PARTITION]),
  });
  executor.executeOnPartition = async () => failure;
  return executor;
}

async function thrownInsertFailure(failure, sql = 'INSERT INTO users (id) VALUES (1)') {
  try {
    await refusingExecutor(failure).executeInsert(parseSQL(sql), PARTITION);
  } catch (error) {
    return {message: error.message, ...error};
  }
  throw new Error('the INSERT did not fail');
}

test('every reported field of a refused INSERT travels on the thrown error', async (t) => {
  const error = await thrownInsertFailure({
    success: false,
    error: 'refused by the partition',
    errorCode: 'E_REFUSED',
    retryAfterMs: 12.7,
    deferRetry: true,
    failureCode: 'constraint_violation',
    committed: true,
    outcome: 'statement_failed',
    disposition: 'refused',
    logIndex: 7,
    entryId: 'entry-1',
    spentWait: {waitedMs: 3},
    sqlState: '23505',
    routingReasonCode: 'route_denied',
    participantFailures: [{partitionId: 'p1'}, null, 'text', {partitionId: 'p2'}],
    firstFailedParticipant: {partitionId: 'p1'},
    participantNodeId: 'node-a',
    participantAddress: 'ws://node-a',
    reasonCode: 'unique_conflict',
    participationKind: 'primary',
    tableName: 'users_reported',
    failedTable: 'users_failed',
  });
  t.same(error, {
    message: 'refused by the partition',
    code: 'E_REFUSED',
    errorCode: 'E_REFUSED',
    retryAfterMs: 12,
    deferRetry: true,
    failureCode: 'constraint_violation',
    committed: true,
    outcome: 'statement_failed',
    disposition: 'refused',
    logIndex: 7,
    entryId: 'entry-1',
    spentWait: {waitedMs: 3},
    sqlState: '23505',
    routingReasonCode: 'route_denied',
    participantFailures: [{partitionId: 'p1'}, {partitionId: 'p2'}],
    firstFailedParticipant: {partitionId: 'p1'},
    participantNodeId: 'node-a',
    participantAddress: 'ws://node-a',
    reasonCode: 'unique_conflict',
    participationKind: 'primary',
    tableName: 'users_reported',
    failedTable: 'users_failed',
  });
  t.end();
});

test('a refused INSERT without reported detail names its partition and its statement table',
  async (t) => {
    const error = await thrownInsertFailure({
      success: false,
      errorCode: '',
      retryAfterMs: 0,
      participantNodeId: '',
      reasonCode: '',
      tableName: '',
      failedTable: '',
    });
    t.same(error, {
      message: `Insert failed on partition: ${PARTITION}`,
      failureCode: null,
      committed: false,
      outcome: null,
      disposition: null,
      logIndex: null,
      entryId: null,
      spentWait: null,
      tableName: 'users',
    });
    t.end();
  });
