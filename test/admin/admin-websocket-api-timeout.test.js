import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
} from '../../src/control-plane/timeout-budget.js';
import {createSqlRequest} from '../../src/query/sql-request.js';

test('AdminWebSocketAPI classifies timed out queries with structured ' +
  'deadline metadata', async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let nowMs = 1000;
  let scheduledTimeoutMs = null;

  globalThis.setTimeout = (callback, timeoutMs) => {
    scheduledTimeoutMs = timeoutMs;
    nowMs += timeoutMs;
    globalThis.queueMicrotask(callback);
    return 1;
  };
  globalThis.clearTimeout = () => {};

  const api = new AdminWebSocketAPI({
    sqlQueryEngine: {
      async executeRequest() {
        return new Promise(() => {});
      },
    },
    nowFn: () => nowMs,
  });

  try {
    const error = await t.rejects(
      api.executeSqlRequestWithTimeout({statement: 'SELECT 1'}, 30000),
    );
    t.equal(scheduledTimeoutMs, 30000);
    t.equal(
      error.timeoutClassification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
    );
    t.equal(
      error.timeoutClassification.originalClassification,
      null,
    );
    t.equal(error.timeoutClassification.boundaryHit, false);
    t.ok(
      error.timeoutClassification.configuredBudgetMs < 30000,
      'inner SQL timeout budget should leave completion margin before the outer timeout fires',
    );
    t.equal(
      error.timeoutClassification.nestedOperation,
      'admin_sql_query',
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('AdminWebSocketAPI forwards query-level timeout override through ' +
  'executeLocalQueryEnvelope', async (t) => {
  const api = new AdminWebSocketAPI({
    sqlQueryEngine: {
      async executeRequest() {
        return {rows: [{ok: true}]};
      },
    },
  });

  const observedTimeouts = [];
  api.executeSqlRequestWithTimeout = async (_sqlRequest, timeoutMs) => {
    observedTimeouts.push(timeoutMs);
    return {
      rows: [{ok: true}],
      timeoutMs,
    };
  };

  const result = await api.executeLocalQueryEnvelope({
    queryId: 'q-timeout-override',
    sql: 'SELECT 1',
    params: [],
    timeoutMs: 1234,
  });

  t.same(
    observedTimeouts,
    [1234],
    'executeLocalQueryEnvelope should pass per-query timeout override to SQL',
  );
  t.equal(
    result?.timeoutMs,
    1234,
    'query result should come from the timeout-overridden execution path',
  );
});

test('AdminWebSocketAPI returns one canonical deferred result when a ' +
  'timed-out CREATE TABLE request is still blocked on control-plane authority',
async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let nowMs = 3000;

  globalThis.setTimeout = (callback, timeoutMs) => {
    nowMs += timeoutMs;
    globalThis.queueMicrotask(callback);
    return 1;
  };
  globalThis.clearTimeout = () => {};

  const api = new AdminWebSocketAPI({
    sqlQueryEngine: {
      async executeRequest() {
        return new Promise(() => {});
      },
      buildTimedOutSqlRequestFailure(sqlRequest, error) {
        return {
          success: false,
          error: 'query_admission_deferred',
          errorCode: 'QUERY_TIMEOUT',
          deferRetry: true,
          retryAfterMs: 225,
          outcome: 'deferred',
          visibilityState: 'deferred_by_pressure',
          contractState: 'deferred',
          nextAction: 'retry',
          reasonCode: 'control_plane_write_unhealthy',
          reasonCodes: ['control_plane_write_unhealthy'],
          failedDimensions: ['controlPlaneWritable'],
          runtimeAuthority: {
            state: 'establishing',
          },
          details: {
            statement: sqlRequest.statement,
            cause: error.message,
          },
        };
      },
    },
    nowFn: () => nowMs,
  });

  try {
    const result = await api.executeSqlRequestWithTimeout(
      createSqlRequest({
        statement: 'CREATE TABLE users (id TEXT PRIMARY KEY)',
      }),
      6000,
    );
    t.equal(result.success, false);
    t.equal(result.error, 'query_admission_deferred');
    t.equal(result.visibilityState, 'deferred_by_pressure');
    t.equal(result.contractState, 'deferred');
    t.equal(result.nextAction, 'retry');
    t.equal(result.retryAfterMs, 225);
    t.equal(result.reasonCode, 'control_plane_write_unhealthy');
    t.equal(result.runtimeAuthority?.state, 'establishing');
    t.equal(
      result.details?.statement,
      'CREATE TABLE users (id TEXT PRIMARY KEY)',
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('AdminWebSocketAPI cancels in-flight SQL request when timeout fires',
  async (t) => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    let nowMs = 2000;
    let observedToken = null;
    let observedCancelReason = null;

    globalThis.setTimeout = (callback, timeoutMs) => {
      nowMs += timeoutMs;
      globalThis.queueMicrotask(callback);
      return 1;
    };
    globalThis.clearTimeout = () => {};

    const api = new AdminWebSocketAPI({
      sqlQueryEngine: {
        async executeRequest(sqlRequest) {
          observedToken = sqlRequest?.cancellationToken || null;
          observedToken?.onCancel((reason) => {
            observedCancelReason = reason;
          });
          return new Promise(() => {});
        },
      },
      nowFn: () => nowMs,
    });

    try {
      await t.rejects(
        api.executeSqlRequestWithTimeout(
          createSqlRequest({statement: 'SELECT 1'}),
          4000,
        ),
      );
      t.ok(observedToken, 'timeout path should pass cancellation token');
      t.equal(
        observedToken.isCancelled(),
        true,
        'token should be cancelled when timeout triggers',
      );
      t.match(
        observedCancelReason,
        /Query timeout after 4000ms/,
        'cancellation reason should include timeout details',
      );
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });


test('executeSqlRequestWithTimeout uses QUERY_TIMEOUT classification ' +
  'instead of generic REMOTE_CALL_TIMEOUT (§1.11)', async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let nowMs = 5000;

  globalThis.setTimeout = (callback, timeoutMs) => {
    nowMs += timeoutMs;
    globalThis.queueMicrotask(callback);
    return 1;
  };
  globalThis.clearTimeout = () => {};

  const api = new AdminWebSocketAPI({
    sqlQueryEngine: {
      async executeRequest() {
        return new Promise(() => {});
      },
    },
    nowFn: () => nowMs,
  });

  try {
    const error = await t.rejects(
      api.executeSqlRequestWithTimeout(
        {statement: 'SELECT 1'}, 10000,
      ),
    );
    t.equal(
      error.timeoutClassification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
      'query timeout should use QUERY_TIMEOUT, not REMOTE_CALL_TIMEOUT',
    );
    t.equal(
      error.timeoutClassification.originalClassification,
      null,
      'trimmed inner timeout budget should classify directly as QUERY_TIMEOUT',
    );
    t.equal(
      error.timeoutClassification.nestedOperation,
      'admin_sql_query',
      'nested operation should identify the query path',
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
