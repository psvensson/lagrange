import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_FAILURE_REASON,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../src/control-plane/control-plane-error-classification.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';

const PENDING_RESPONSE_TIMEOUT_RETRYABLE_TEST_NAME =
  'isRetryableControlPlaneError treats pending response timeouts as retryable';
const RAFT_WRITE_COMMIT_TIMEOUT_RETRYABLE_TEST_NAME =
  'isRetryableControlPlaneError treats raft write commit timeouts as retryable';
const RAFT_WRITE_COMMIT_TIMEOUT_ERROR_MESSAGE =
  'Raft write commit timed out after 30000ms';

test('isRetryableControlPlaneError detects typed pressure deferrals', async (t) => {
  const result = {
    success: false,
    error: 'Distributed operation failed due to participant failures',
    errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
    retryAfterMs: 250,
  };

  t.equal(getControlPlaneErrorMessage(result),
    'Distributed operation failed due to participant failures');
  t.equal(getControlPlaneErrorCode(result),
    'CONTROL_PLANE_PRESSURE_DEGRADED');
  t.equal(getControlPlaneRetryAfterMs(result), 250);
  t.equal(isRetryableControlPlaneError(result), true);
});

test('isRetryableControlPlaneError detects deferred connection failures', async (t) => {
  const error = new Error('No connection to node seed-1');

  t.equal(isRetryableControlPlaneError(error), true);
});

test('isRetryableControlPlaneError treats stale no-handler ingress targets as retryable',
  async (t) => {
    const error = new Error(
      'No handler registered for address seed-node-1/message-group/mg-1-r2',
    );

    t.equal(isRetryableControlPlaneError(error), true);
  });

test('isRetryableControlPlaneError detects explicit deferRetry marker', async (t) => {
  const error = new Error('validation deferred');
  error.deferRetry = true;

  t.equal(isRetryableControlPlaneError(error), true);
});

test(PENDING_RESPONSE_TIMEOUT_RETRYABLE_TEST_NAME, async (t) => {
  const error = new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT);

  t.equal(isRetryableControlPlaneError(error), true);
});

test(RAFT_WRITE_COMMIT_TIMEOUT_RETRYABLE_TEST_NAME, async (t) => {
  const error = new Error(RAFT_WRITE_COMMIT_TIMEOUT_ERROR_MESSAGE);

  t.equal(isRetryableControlPlaneError(error), true);
});

test('isRetryableControlPlaneError detects transaction lane contention', async (t) => {
  const error = new Error('Transaction already active on this partition');

  t.equal(isRetryableControlPlaneError(error), true);
});

test('isRetryableControlPlaneError detects transaction commit visibility ' +
  'gaps', async (t) => {
  const error = new Error('No active transaction to commit');

  t.equal(isRetryableControlPlaneError(error), true);
});

test('isRetryableControlPlaneError treats cache visibility lag as retryable',
  async (t) => {
    const error = new Error(
      'Cache update not observed for sql_transactions:tx-1 within 1000ms',
    );

    t.equal(isRetryableControlPlaneError(error), true);
  },
);

test('isRetryableControlPlaneError excludes hard validation failures', async (t) => {
  const error = new Error('Replica owner conflict');
  error.code = 'REPLICA_OWNER_CONFLICT';

  t.equal(isRetryableControlPlaneError(error), false);
});

test('isRetryableControlPlaneError follows nested participant pressure ' +
  'signals', async (t) => {
  const result = {
    success: false,
    error: 'Query execution failed',
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    firstFailedParticipant: {
      error: 'control_plane_pressure_degraded',
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
      retryAfterMs: 250,
      deferRetry: true,
    },
    participantFailures: [{
      error: 'control_plane_pressure_degraded',
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
      retryAfterMs: 250,
      deferRetry: true,
    }],
  };

  t.equal(getControlPlaneErrorMessage(result), 'Query execution failed');
  t.equal(getControlPlaneErrorCode(result), 'DISTRIBUTED_PARTICIPANT_FAILURE');
  t.equal(
    getControlPlaneRetryAfterMs(result),
    250,
    'nested retry-after hints should surface through the shared classifier',
  );
  t.equal(
    isRetryableControlPlaneError(result),
    true,
    'nested participant pressure should classify the top-level failure as retryable',
  );
});

test('getControlPlaneFailureSummary prioritizes authoritative source gaps over ' +
  'broader participant failures', async (t) => {
  const result = {
    success: false,
    error: 'Distributed operation failed due to participant failures',
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    participantFailures: [{
      error: 'authoritative_row_source_unavailable',
    }, {
      error: 'Connection to node node-2 closed',
    }],
  };

  const summary = getControlPlaneFailureSummary(result);

  t.equal(
    summary.primaryReason,
    CONTROL_PLANE_FAILURE_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
    'the most specific authoritative source blocker should win',
  );
  t.equal(summary.authoritativeRowSourceUnavailableCount, 1);
  t.equal(summary.distributedParticipantFailureCount, 1);
  t.equal(summary.reconnectDeliveryFailureCount, 1);
  t.equal(summary.retryable, true);
});
