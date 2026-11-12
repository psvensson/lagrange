/**
 * The node-side CREATE admission owner answers a recoverable refusal with its
 * own code, CREATE_ADMISSION_ERROR_CODE.DEFERRED. The dispatch retry owner
 * reads that constant from its owner: a dispatch answered with it is retried
 * for every target class (a user-table ADD is not failed for a refusal the
 * target said to retry), while the admission owner's terminal refusals and
 * ordinary retryable failures keep their existing classification.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  CREATE_ADMISSION_ERROR_CODE,
} from '../../src/node/replica-create-admission-owner.js';
import {
  shouldDeferRetryableDispatchFailure,
} from '../../src/rebalancer/operation-workflow-dispatch-rearm-evidence.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const TEST_OWNER = Object.freeze({});
const TEST_USER_TABLE_ADD = Object.freeze({
  operationId: 'op-user-table-add',
  type: OperationType.ADD,
  entityType: 'partition',
  partitionId: 'orders-p3',
});
const TEST_SYSTEM_TABLE_ADD = Object.freeze({
  ...TEST_USER_TABLE_ADD,
  operationId: 'op-system-table-add',
  partitionId: 'sql_write_operations-p1',
});

function buildAdmissionAnswer(code, deferRetry) {
  return {success: false, code, errorCode: code, deferRetry};
}

test('a user-table dispatch answered REPLICA_CREATE_ADMISSION_DEFERRED is ' +
  'retried', (t) => {
  t.equal(
    shouldDeferRetryableDispatchFailure(
      TEST_OWNER,
      TEST_USER_TABLE_ADD,
      buildAdmissionAnswer(CREATE_ADMISSION_ERROR_CODE.DEFERRED, true),
    ),
    true,
    'the admission owner\'s recoverable refusal defers the dispatch for a ' +
      'target that is not a system table',
  );
  t.end();
});

test('the admission owner\'s terminal refusals are not retried', (t) => {
  for (const code of [
    CREATE_ADMISSION_ERROR_CODE.REFUSED_TERMINAL,
    CREATE_ADMISSION_ERROR_CODE.STALE,
    CREATE_ADMISSION_ERROR_CODE.INVALID,
  ]) {
    t.equal(
      shouldDeferRetryableDispatchFailure(
        TEST_OWNER,
        TEST_USER_TABLE_ADD,
        buildAdmissionAnswer(code, false),
      ),
      false,
      `${code} carries no retry and is not deferred`,
    );
  }
  t.end();
});

test('other retryable dispatch failures keep their target-class rule', (t) => {
  const retryable = {
    success: false,
    code: 'ROUTER_MESSAGE_TIMEOUT',
    deferRetry: true,
  };
  t.equal(
    shouldDeferRetryableDispatchFailure(
      TEST_OWNER,
      TEST_USER_TABLE_ADD,
      retryable,
    ),
    false,
    'a user-table dispatch is not deferred for a non-admission failure',
  );
  t.equal(
    shouldDeferRetryableDispatchFailure(
      TEST_OWNER,
      TEST_SYSTEM_TABLE_ADD,
      retryable,
    ),
    true,
    'a system-table dispatch still is',
  );
  t.end();
});
