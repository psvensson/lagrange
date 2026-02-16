/**
 * PG wire observability instrumentation tests.
 *
 * Verifies metrics structure, log tags, required dimensions,
 * duration field naming, and log level for each pgwire metric type.
 *
 * Requirements: 12.1, 12.2, 12.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {METRICS_LOG_TAG} from '../../src/constants/metrics-constants.js';
import {
  emitHandshakeMetric,
  emitQueryMetric,
  emitSessionMetric,
  emitProtocolErrorMetric,
} from '../../src/runtime/pgwire-metrics.js';

// --- Spy logger factory ---

function createSpyLogger() {
  const infoCalls = [];
  const debugCalls = [];
  return {
    infoCalls,
    debugCalls,
    info(tag, data) {
      infoCalls.push({tag, data});
    },
    debug(tag, data) {
      debugCalls.push({tag, data});
    },
    error() {},
  };
}

const BASE_DIMS = Object.freeze({
  serviceId: 'sys-postgres-wire',
  replicaId: 'pgwire-r1',
  nodeId: 'node-1',
});

// =============================================================
// Handshake metric
// =============================================================

test('emitHandshakeMetric emits correct log tag', (t) => {
  const logger = createSpyLogger();
  emitHandshakeMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-1',
    success: true,
    durationMs: 5,
  });

  t.equal(logger.infoCalls.length, 1);
  t.equal(
    logger.infoCalls[0].tag,
    METRICS_LOG_TAG.PGWIRE_HANDSHAKE,
  );
  t.end();
});

test('emitHandshakeMetric includes required dimensions', (t) => {
  const logger = createSpyLogger();
  emitHandshakeMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-2',
    success: false,
    durationMs: 12,
  });

  const data = logger.infoCalls[0].data;
  t.equal(data.serviceId, 'sys-postgres-wire');
  t.equal(data.replicaId, 'pgwire-r1');
  t.equal(data.nodeId, 'node-1');
  t.equal(data.sessionId, 'sess-2');
  t.equal(data.success, false);
  t.end();
});

test('emitHandshakeMetric uses Ms suffix for duration', (t) => {
  const logger = createSpyLogger();
  emitHandshakeMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-3',
    success: true,
    durationMs: 7,
  });

  const data = logger.infoCalls[0].data;
  t.ok('durationMs' in data, 'durationMs field present');
  t.equal(data.durationMs, 7);
  t.equal(data.duration, undefined, 'no bare duration field');
  t.end();
});

test('emitHandshakeMetric uses info level not debug', (t) => {
  const logger = createSpyLogger();
  emitHandshakeMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-4',
    success: true,
    durationMs: 1,
  });

  t.equal(logger.infoCalls.length, 1, 'emitted at info level');
  t.equal(logger.debugCalls.length, 0, 'not emitted at debug');
  t.end();
});

// =============================================================
// Query metric
// =============================================================

test('emitQueryMetric emits correct log tag', (t) => {
  const logger = createSpyLogger();
  emitQueryMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-q1',
    statementType: 'SELECT',
    durationMs: 15,
    success: true,
    rowCount: 42,
  });

  t.equal(logger.infoCalls.length, 1);
  t.equal(logger.infoCalls[0].tag, METRICS_LOG_TAG.PGWIRE_QUERY);
  t.end();
});

test('emitQueryMetric includes required dimensions', (t) => {
  const logger = createSpyLogger();
  emitQueryMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-q2',
    statementType: 'INSERT',
    durationMs: 3,
    success: true,
    rowCount: 1,
  });

  const data = logger.infoCalls[0].data;
  t.equal(data.serviceId, 'sys-postgres-wire');
  t.equal(data.replicaId, 'pgwire-r1');
  t.equal(data.nodeId, 'node-1');
  t.equal(data.sessionId, 'sess-q2');
  t.equal(data.statementType, 'INSERT');
  t.equal(data.success, true);
  t.equal(data.rowCount, 1);
  t.end();
});

test('emitQueryMetric uses Ms suffix for duration', (t) => {
  const logger = createSpyLogger();
  emitQueryMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-q3',
    statementType: 'UPDATE',
    durationMs: 22,
    success: true,
  });

  const data = logger.infoCalls[0].data;
  t.ok('durationMs' in data, 'durationMs field present');
  t.equal(data.durationMs, 22);
  t.end();
});

test('emitQueryMetric defaults rowCount to 0', (t) => {
  const logger = createSpyLogger();
  emitQueryMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-q4',
    statementType: 'DELETE',
    durationMs: 4,
    success: false,
  });

  t.equal(logger.infoCalls[0].data.rowCount, 0);
  t.end();
});

test('emitQueryMetric uses info level not debug', (t) => {
  const logger = createSpyLogger();
  emitQueryMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-q5',
    statementType: 'SELECT',
    durationMs: 1,
    success: true,
  });

  t.equal(logger.infoCalls.length, 1);
  t.equal(logger.debugCalls.length, 0);
  t.end();
});

// =============================================================
// Session metric
// =============================================================

test('emitSessionMetric emits correct log tag', (t) => {
  const logger = createSpyLogger();
  emitSessionMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-s1',
    event: 'open',
  });

  t.equal(logger.infoCalls.length, 1);
  t.equal(
    logger.infoCalls[0].tag,
    METRICS_LOG_TAG.PGWIRE_SESSION,
  );
  t.end();
});

test('emitSessionMetric includes required dimensions', (t) => {
  const logger = createSpyLogger();
  emitSessionMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-s2',
    event: 'close',
    durationMs: 5000,
    queryCount: 10,
  });

  const data = logger.infoCalls[0].data;
  t.equal(data.serviceId, 'sys-postgres-wire');
  t.equal(data.replicaId, 'pgwire-r1');
  t.equal(data.nodeId, 'node-1');
  t.equal(data.sessionId, 'sess-s2');
  t.equal(data.event, 'close');
  t.end();
});

test('emitSessionMetric includes durationMs on close', (t) => {
  const logger = createSpyLogger();
  emitSessionMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-s3',
    event: 'close',
    durationMs: 3200,
    queryCount: 5,
  });

  const data = logger.infoCalls[0].data;
  t.ok('durationMs' in data, 'durationMs present on close');
  t.equal(data.durationMs, 3200);
  t.equal(data.queryCount, 5);
  t.end();
});

test('emitSessionMetric omits optional fields on open', (t) => {
  const logger = createSpyLogger();
  emitSessionMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-s4',
    event: 'open',
  });

  const data = logger.infoCalls[0].data;
  t.equal(data.durationMs, undefined, 'no durationMs on open');
  t.equal(data.queryCount, undefined, 'no queryCount on open');
  t.end();
});

test('emitSessionMetric uses info level not debug', (t) => {
  const logger = createSpyLogger();
  emitSessionMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-s5',
    event: 'open',
  });

  t.equal(logger.infoCalls.length, 1);
  t.equal(logger.debugCalls.length, 0);
  t.end();
});

// =============================================================
// Protocol error metric
// =============================================================

test('emitProtocolErrorMetric emits correct log tag', (t) => {
  const logger = createSpyLogger();
  emitProtocolErrorMetric(logger, {
    ...BASE_DIMS,
    sessionId: 'sess-e1',
    errorCode: '08P01',
    errorMessage: 'protocol violation',
  });

  t.equal(logger.infoCalls.length, 1);
  t.equal(
    logger.infoCalls[0].tag,
    METRICS_LOG_TAG.PGWIRE_PROTOCOL_ERROR,
  );
  t.end();
});

test('emitProtocolErrorMetric includes required dimensions',
  (t) => {
    const logger = createSpyLogger();
    emitProtocolErrorMetric(logger, {
      ...BASE_DIMS,
      sessionId: 'sess-e2',
      errorCode: 'XX000',
      errorMessage: 'internal error',
    });

    const data = logger.infoCalls[0].data;
    t.equal(data.serviceId, 'sys-postgres-wire');
    t.equal(data.replicaId, 'pgwire-r1');
    t.equal(data.nodeId, 'node-1');
    t.equal(data.sessionId, 'sess-e2');
    t.equal(data.errorCode, 'XX000');
    t.equal(data.errorMessage, 'internal error');
    t.end();
  });

test('emitProtocolErrorMetric defaults sessionId to null',
  (t) => {
    const logger = createSpyLogger();
    emitProtocolErrorMetric(logger, {
      ...BASE_DIMS,
      errorCode: '08P01',
      errorMessage: 'bad startup',
    });

    t.equal(logger.infoCalls[0].data.sessionId, null);
    t.end();
  });

test('emitProtocolErrorMetric uses info level not debug', (t) => {
  const logger = createSpyLogger();
  emitProtocolErrorMetric(logger, {
    ...BASE_DIMS,
    errorCode: '0A000',
    errorMessage: 'unsupported',
  });

  t.equal(logger.infoCalls.length, 1);
  t.equal(logger.debugCalls.length, 0);
  t.end();
});

// =============================================================
// Resilience — logger failure does not throw
// =============================================================

test('metric emission swallows logger errors', (t) => {
  const throwingLogger = {
    info() {
      throw new Error('logger broken');
    },
    debug() {},
    error() {},
  };

  // None of these should throw
  emitHandshakeMetric(throwingLogger, {
    ...BASE_DIMS,
    sessionId: 's',
    success: true,
    durationMs: 0,
  });
  emitQueryMetric(throwingLogger, {
    ...BASE_DIMS,
    sessionId: 's',
    statementType: 'SELECT',
    durationMs: 0,
    success: true,
  });
  emitSessionMetric(throwingLogger, {
    ...BASE_DIMS,
    sessionId: 's',
    event: 'open',
  });
  emitProtocolErrorMetric(throwingLogger, {
    ...BASE_DIMS,
    errorCode: 'XX000',
    errorMessage: 'test',
  });

  t.ok(true, 'no exceptions thrown');
  t.end();
});
