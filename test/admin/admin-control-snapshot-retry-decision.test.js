import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {
  CONTROL_SNAPSHOT_RETRY_DECISION,
  evaluateControlSnapshotRetryDecision,
} from '../../src/admin/admin-control-snapshot-retry-decision.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TIMEOUT_BUDGET_CLASSIFICATION} from
  '../../src/control-plane/timeout-budget.js';

const INITIAL_ATTEMPT = 0;
const RETRY_LIMIT_ATTEMPT = 3;
const EXPECTED_RETRY_ATTEMPTS = 2;
const REASON_ERROR_PRESSURE_OR_TIMEOUT = 'error_pressure_or_timeout';
const REASON_FORCED_REPAIR_PATH_DISABLED =
  'forced_repair_path_disabled';
const REASON_RETRY_LIMIT_EXHAUSTED = 'retry_limit_exhausted';
const REASON_NON_RETRYABLE_ERROR = 'non_retryable_error';
const REASON_RESULT_PRESSURE_DEFERRED = 'result_pressure_deferred';
const REASON_SNAPSHOT_OBSERVATION_PRESSURE =
  'snapshot_observation_pressure';
const REASON_ADMITTED_SUCCESSFULLY = 'admitted_successfully';
const ERROR_CODE_DISTRIBUTED_PARTICIPANT_FAILURE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const OBSERVATION_STATE_DEFERRED_REFRESH = 'deferred_refresh';
const OBSERVATION_STATE_FAILED = 'failed';
const OBSERVATION_REASON_PRESSURE = 'priority_recovery_pressure';
const OBSERVATION_REASON_TIMEOUT = 'priority_recovery_timeout';
const OBSERVATION_REASON_FAIL = 'priority_recovery_fail';
const CONTROL_SNAPSHOT_ROW = {
  nodeId: 'node-1',
};

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

function createRowsResult(row) {
  return {
    success: true,
    rows: [row],
  };
}

test('control snapshot retry decision retries pressure and timeout errors',
  async (t) => {
    const timeoutError = new Error('control snapshot timed out');
    const timeoutDecision = evaluateControlSnapshotRetryDecision(
      {},
      INITIAL_ATTEMPT,
      timeoutError,
    );

    t.equal(
      timeoutDecision.outcome,
      CONTROL_SNAPSHOT_RETRY_DECISION.RETRY,
      'timeout errors should retry',
    );
    t.equal(
      timeoutDecision.reason,
      REASON_ERROR_PRESSURE_OR_TIMEOUT,
      'timeout errors should keep the pressure-or-timeout reason',
    );

    const participantError = new Error('participant failed');
    participantError.code = ERROR_CODE_DISTRIBUTED_PARTICIPANT_FAILURE;
    const participantDecision = evaluateControlSnapshotRetryDecision(
      {},
      INITIAL_ATTEMPT,
      participantError,
    );

    t.equal(
      participantDecision.outcome,
      CONTROL_SNAPSHOT_RETRY_DECISION.RETRY,
      'participant pressure codes should retry',
    );
    t.equal(
      participantDecision.reason,
      REASON_ERROR_PRESSURE_OR_TIMEOUT,
      'participant pressure codes should keep the pressure-or-timeout reason',
    );
  });

test('control snapshot retry decision stops forced and exhausted retries',
  async (t) => {
    const retryableError = new Error('Connection to node failed');
    const forcedDecision = evaluateControlSnapshotRetryDecision(
      {
        forceAuthoritativeRepair: true,
      },
      INITIAL_ATTEMPT,
      retryableError,
    );

    t.equal(
      forcedDecision.outcome,
      CONTROL_SNAPSHOT_RETRY_DECISION.STOP_FAILURE,
      'forced repair should not retry the disabled repair path',
    );
    t.equal(
      forcedDecision.reason,
      REASON_FORCED_REPAIR_PATH_DISABLED,
      'forced repair should report the disabled repair path reason',
    );

    const exhaustedDecision = evaluateControlSnapshotRetryDecision(
      {},
      RETRY_LIMIT_ATTEMPT,
      retryableError,
    );

    t.equal(
      exhaustedDecision.outcome,
      CONTROL_SNAPSHOT_RETRY_DECISION.STOP_FAILURE,
      'retryable errors should stop when the retry limit is reached',
    );
    t.equal(
      exhaustedDecision.reason,
      REASON_RETRY_LIMIT_EXHAUSTED,
      'retry limit should report exhaustion',
    );
  });

test('control snapshot retry decision stops non-retryable errors',
  async (t) => {
    const decision = evaluateControlSnapshotRetryDecision(
      {},
      INITIAL_ATTEMPT,
      new Error('syntax error'),
    );

    t.equal(
      decision.outcome,
      CONTROL_SNAPSHOT_RETRY_DECISION.STOP_FAILURE,
      'non-retryable errors should stop as failures',
    );
    t.equal(
      decision.reason,
      REASON_NON_RETRYABLE_ERROR,
      'non-retryable errors should keep the non-retryable reason',
    );
  });

test('control snapshot retry decision retries deferred convergence results',
  async (t) => {
    const decision = evaluateControlSnapshotRetryDecision(
      {},
      INITIAL_ATTEMPT,
      {
        criticalConvergenceDeferred: true,
        rows: [CONTROL_SNAPSHOT_ROW],
      },
    );

    t.equal(
      decision.outcome,
      CONTROL_SNAPSHOT_RETRY_DECISION.RETRY,
      'critical deferred convergence should retry',
    );
    t.equal(
      decision.reason,
      REASON_RESULT_PRESSURE_DEFERRED,
      'critical deferred convergence should keep its retry reason',
    );
  });

test('control snapshot retry decision retries only evidenced pressure observations',
  async (t) => {
    const deferredObservationDecision = evaluateControlSnapshotRetryDecision(
      {},
      INITIAL_ATTEMPT,
      createRowsResult({
        ...CONTROL_SNAPSHOT_ROW,
        snapshotObservation: {
          state: OBSERVATION_STATE_DEFERRED_REFRESH,
          reasonCodes: [],
        },
      }),
    );

    t.equal(
      deferredObservationDecision.outcome,
      CONTROL_SNAPSHOT_RETRY_DECISION.STOP_SUCCESS,
      'ordinary deferred owner work should not delay a local observation',
    );
    t.equal(
      deferredObservationDecision.reason,
      REASON_ADMITTED_SUCCESSFULLY,
      'ordinary deferred owner work should remain a successful observation',
    );

    const reasonCodeDecision = evaluateControlSnapshotRetryDecision(
      {},
      INITIAL_ATTEMPT,
      createRowsResult({
        ...CONTROL_SNAPSHOT_ROW,
        snapshotObservation: {
          state: 'fresh',
          reasonCodes: [OBSERVATION_REASON_PRESSURE],
        },
      }),
    );

    t.equal(
      reasonCodeDecision.outcome,
      CONTROL_SNAPSHOT_RETRY_DECISION.RETRY,
      'pressure reason codes should retry',
    );
    t.equal(
      reasonCodeDecision.reason,
      REASON_SNAPSHOT_OBSERVATION_PRESSURE,
      'pressure reason codes should keep the observation retry reason',
    );

    const failedObservationDecision = evaluateControlSnapshotRetryDecision(
      {},
      INITIAL_ATTEMPT,
      createRowsResult({
        ...CONTROL_SNAPSHOT_ROW,
        snapshotObservation: {
          state: OBSERVATION_STATE_FAILED,
          reasonCodes: [],
        },
      }),
    );

    t.equal(
      failedObservationDecision.outcome,
      CONTROL_SNAPSHOT_RETRY_DECISION.RETRY,
      'failed observations should retry',
    );
    t.equal(
      failedObservationDecision.reason,
      REASON_SNAPSHOT_OBSERVATION_PRESSURE,
      'failed observations should keep the observation retry reason',
    );

    for (const reasonCode of [
      OBSERVATION_REASON_TIMEOUT,
      OBSERVATION_REASON_FAIL,
    ]) {
      const substringDecision = evaluateControlSnapshotRetryDecision(
        {},
        INITIAL_ATTEMPT,
        createRowsResult({
          ...CONTROL_SNAPSHOT_ROW,
          snapshotObservation: {
            state: 'fresh',
            reasonCodes: [reasonCode],
          },
        }),
      );

      t.equal(
        substringDecision.outcome,
        CONTROL_SNAPSHOT_RETRY_DECISION.RETRY,
        `${reasonCode} reason codes should retry`,
      );
      t.equal(
        substringDecision.reason,
        REASON_SNAPSHOT_OBSERVATION_PRESSURE,
        `${reasonCode} reason codes should keep the observation retry reason`,
      );
    }
  });

test('control snapshot retry decision admits clean results', async (t) => {
  const decision = evaluateControlSnapshotRetryDecision(
    {},
    INITIAL_ATTEMPT,
    createRowsResult(CONTROL_SNAPSHOT_ROW),
  );

  t.equal(
    decision.outcome,
    CONTROL_SNAPSHOT_RETRY_DECISION.STOP_SUCCESS,
    'clean snapshot results should stop successfully',
  );
  t.equal(
    decision.reason,
    REASON_ADMITTED_SUCCESSFULLY,
    'clean snapshot results should keep the admitted reason',
  );
});

test('admin websocket control snapshot query retries pressure observations',
  async (t) => {
    const api = new AdminWebSocketAPI({
      nodeId: CONTROL_SNAPSHOT_ROW.nodeId,
    });
    const warnings = [];
    let closeCount = 0;
    let buildCount = 0;

    api.logger = {
      warn(message, context) {
        warnings.push({
          message,
          context,
        });
      },
    };
    api.closeStaleSnapshotLaneSockets = () => {
      closeCount += 1;
    };
    api.controlSnapshot.buildControlSnapshotQueryResult = async () => {
      buildCount += 1;
      if (buildCount === INITIAL_ATTEMPT + 1) {
        return createRowsResult({
          ...CONTROL_SNAPSHOT_ROW,
          snapshotObservation: {
            state: OBSERVATION_STATE_DEFERRED_REFRESH,
            reasonCodes: [OBSERVATION_REASON_PRESSURE],
          },
        });
      }
      return createRowsResult(CONTROL_SNAPSHOT_ROW);
    };

    const result = await api.buildControlSnapshotQueryResult({
      activeClientId: 'client-1',
    });

    t.equal(
      buildCount,
      EXPECTED_RETRY_ATTEMPTS,
      'control snapshot query should rebuild after a pressure observation',
    );
    t.equal(
      closeCount,
      1,
      'control snapshot query should close stale snapshot lane sockets before retry',
    );
    t.equal(
      warnings[0]?.context?.reason,
      REASON_SNAPSHOT_OBSERVATION_PRESSURE,
      'control snapshot query should log the pressure observation retry reason',
    );
    t.same(
      result.rows,
      [CONTROL_SNAPSHOT_ROW],
      'control snapshot query should return the admitted clean result',
    );
  });

test('admin websocket control snapshot retries consume one absolute caller budget',
  async (t) => {
    let nowMs = 1000;
    const api = new AdminWebSocketAPI({
      nodeId: CONTROL_SNAPSHOT_ROW.nodeId,
      nowFn: () => nowMs,
    });
    const observedTimeouts = [];

    api.logger = {warn() {}};
    api.closeStaleSnapshotLaneSockets = () => {};
    api.controlSnapshot.buildControlSnapshotQueryResult = async (options) => {
      observedTimeouts.push(options.queryTimeoutMs);
      if (observedTimeouts.length === 1) {
        nowMs += 7000;
        return createRowsResult({
          ...CONTROL_SNAPSHOT_ROW,
          snapshotObservation: {
            state: OBSERVATION_STATE_DEFERRED_REFRESH,
            reasonCodes: [OBSERVATION_REASON_PRESSURE],
          },
        });
      }
      return createRowsResult(CONTROL_SNAPSHOT_ROW);
    };

    const result = await api.buildControlSnapshotQueryResult({
      activeClientId: 'client-deadline',
      queryTimeoutMs: 15000,
    });

    t.same(
      observedTimeouts,
      [15000, 8000],
      'the retry receives only the time remaining on the original request',
    );
    t.same(
      result.rows,
      [CONTROL_SNAPSHOT_ROW],
      'the existing pressure retry still returns the admitted clean result',
    );
  });

test('admin websocket control snapshot reports typed caller deadline exhaustion',
  async (t) => {
    let clockCalls = 0;
    let buildCount = 0;
    const api = new AdminWebSocketAPI({
      nodeId: CONTROL_SNAPSHOT_ROW.nodeId,
      nowFn: () => {
        clockCalls += 1;
        return clockCalls === 1 ? 1000 : 20000;
      },
    });

    api.controlSnapshot.buildControlSnapshotQueryResult = async () => {
      buildCount += 1;
      return createRowsResult(CONTROL_SNAPSHOT_ROW);
    };

    const error = await t.rejects(
      api.buildControlSnapshotQueryResult({
        activeClientId: 'client-immediate-exhaustion',
        queryTimeoutMs: 15000,
      }),
      {message: 'Query timeout after 15000ms'},
    );

    t.equal(
      buildCount,
      0,
      'expired caller budget starts no control snapshot work',
    );
    t.equal(
      error.timeoutClassification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
      'the retry owner reports deadline exhaustion as a typed query timeout',
    );
    t.equal(
      error.timeoutClassification.nestedOperation,
      'admin_control_snapshot_query',
      'the typed timeout identifies the control snapshot query owner',
    );
    t.equal(
      error.timeoutClassification.configuredBudgetMs,
      15000,
      'the typed timeout preserves the original caller budget',
    );
  });

test('admin websocket control snapshot stops retrying before the caller budget expires',
  async (t) => {
    let nowMs = 1000;
    const api = new AdminWebSocketAPI({
      nodeId: CONTROL_SNAPSHOT_ROW.nodeId,
      nowFn: () => nowMs,
    });
    let buildCount = 0;
    const pressureRow = {
      ...CONTROL_SNAPSHOT_ROW,
      snapshotObservation: {
        state: OBSERVATION_STATE_FAILED,
        reasonCodes: [OBSERVATION_REASON_PRESSURE],
      },
    };

    api.logger = {warn() {}};
    api.closeStaleSnapshotLaneSockets = () => {};
    api.controlSnapshot.buildControlSnapshotQueryResult = async () => {
      buildCount += 1;
      nowMs += 14750;
      return createRowsResult(pressureRow);
    };

    const result = await api.buildControlSnapshotQueryResult({
      activeClientId: 'client-near-deadline',
      queryTimeoutMs: 15000,
    });

    t.equal(
      buildCount,
      1,
      'the owner does not start a retry whose delay exceeds the remaining budget',
    );
    t.same(
      result.rows,
      [pressureRow],
      'deadline exhaustion preserves the fail-closed pressure observation',
    );
  });

test('admin websocket control snapshot rechecks the caller budget after retry delay',
  async (t) => {
    let nowMs = 1000;
    const api = new AdminWebSocketAPI({
      nodeId: CONTROL_SNAPSHOT_ROW.nodeId,
      nowFn: () => nowMs,
    });
    const observedTimeouts = [];
    const pressureRow = {
      ...CONTROL_SNAPSHOT_ROW,
      snapshotObservation: {
        state: OBSERVATION_STATE_FAILED,
        reasonCodes: [OBSERVATION_REASON_PRESSURE],
      },
    };

    api.logger = {warn() {}};
    api.closeStaleSnapshotLaneSockets = () => {};
    api.controlSnapshot.buildControlSnapshotQueryResult = async (options) => {
      observedTimeouts.push(options.queryTimeoutMs);
      if (observedTimeouts.length === 1) {
        nowMs += 14499;
        return createRowsResult(pressureRow);
      }
      return createRowsResult(CONTROL_SNAPSHOT_ROW);
    };
    const expiryTimer = setTimeout(() => {
      nowMs += 1501;
    }, 50);
    t.teardown(() => clearTimeout(expiryTimer));

    const result = await api.buildControlSnapshotQueryResult({
      activeClientId: 'client-delay-expiry',
      queryTimeoutMs: 15000,
    });

    t.same(
      observedTimeouts,
      [15000],
      'work is not started when the retry delay consumes the last budget',
    );
    t.same(
      result.rows,
      [pressureRow],
      'post-delay exhaustion preserves the last fail-closed pressure result',
    );
  });

test('closeStaleSnapshotLaneSockets protects active client and open sockets', (t) => {
  const closedIds = [];
  const disconnectedClients = [];

  const api = {
    clients: new Set([
      {
        id: 'client-active',
        lane: 'snapshot',
        socket: {readyState: 1, close() {
          closedIds.push('client-active');
        }},
      },
      {
        id: 'client-stale-open',
        lane: 'snapshot',
        socket: {readyState: 1, close() {
          closedIds.push('client-stale-open');
        }},
      },
      {
        id: 'client-stale-closed',
        lane: 'snapshot',
        socket: {readyState: 3, close() {
          closedIds.push('client-stale-closed');
        }},
      },
      {
        id: 'client-other-lane',
        lane: 'load',
        socket: {readyState: 3, close() {
          closedIds.push('client-other-lane');
        }},
      },
    ]),
    logger: {
      info() {},
    },
    handleDisconnection(client) {
      disconnectedClients.push(client.id);
    },
  };

  const methods = AdminWebSocketAPI.prototype;
  api.closeStaleSnapshotLaneSockets = methods.closeStaleSnapshotLaneSockets.bind(api);

  api.closeStaleSnapshotLaneSockets(null);
  t.equal(closedIds.length, 0, 'should not close any socket when activeClientId is null');

  api.closeStaleSnapshotLaneSockets('client-active');
  t.same(closedIds, ['client-stale-closed'], 'should only close the stale closed socket on the snapshot lane');
  t.same(disconnectedClients, ['client-stale-closed'], 'should handle disconnection only for closed stale socket');

  t.end();
});
