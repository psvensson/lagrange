/**
 * Tests for ServicesP1DiagnosticLogger.
 * Requirements: 1.4, 1.5
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  ServicesP1DiagnosticLogger,
  LOG_MSG,
} from '../../src/node/services-p1-diagnostic-logger.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests
beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Create a mock logger for testing.
 * @return {Object} Mock logger with captured calls.
 */
function createMockLogger() {
  const calls = {
    debug: [],
    error: [],
    info: [],
    warn: [],
  };

  return {
    calls,
    debug(message, data) {
      calls.debug.push({message, data});
    },
    error(message, data) {
      calls.error.push({message, data});
    },
    info(message, data) {
      calls.info.push({message, data});
    },
    warn(message, data) {
      calls.warn.push({message, data});
    },
  };
}

test('ServicesP1DiagnosticLogger - constructor', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  t.ok(diagnosticLogger, 'should create instance');
  t.equal(diagnosticLogger.logger, mockLogger, 'should set logger');
  t.ok(diagnosticLogger.operationTimings instanceof Map,
    'should initialize operationTimings as Map');
  t.equal(diagnosticLogger.operationTimings.size, 0,
    'should start with empty operationTimings');
  t.end();
});

test('ServicesP1DiagnosticLogger - constructor with default logger', async (t) => {
  const diagnosticLogger = new ServicesP1DiagnosticLogger();

  t.ok(diagnosticLogger, 'should create instance');
  t.ok(diagnosticLogger.logger, 'should have a logger');
  t.end();
});

test('ServicesP1DiagnosticLogger - startStep records step start times', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  const operationId = 'op-123';
  const step = 'services_table_insert';

  const beforeStart = Date.now();
  diagnosticLogger.startStep(operationId, step);
  const afterStart = Date.now();

  const key = `${operationId}:${step}`;
  t.ok(diagnosticLogger.operationTimings.has(key),
    'should store timing with correct key');

  const timing = diagnosticLogger.operationTimings.get(key);
  t.equal(timing.step, step, 'should store step name');
  t.ok(timing.startedAt >= beforeStart, 'startedAt should be >= beforeStart');
  t.ok(timing.startedAt <= afterStart, 'startedAt should be <= afterStart');
  t.end();
});

test('ServicesP1DiagnosticLogger - startStep records multiple steps', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  const operationId = 'op-456';
  const step1 = 'services_table_insert';
  const step2 = 'create_replica_send';
  const step3 = 'ack_receipt';

  diagnosticLogger.startStep(operationId, step1);
  diagnosticLogger.startStep(operationId, step2);
  diagnosticLogger.startStep(operationId, step3);

  t.equal(diagnosticLogger.operationTimings.size, 3,
    'should have 3 timing entries');
  t.ok(diagnosticLogger.operationTimings.has(`${operationId}:${step1}`),
    'should have step1');
  t.ok(diagnosticLogger.operationTimings.has(`${operationId}:${step2}`),
    'should have step2');
  t.ok(diagnosticLogger.operationTimings.has(`${operationId}:${step3}`),
    'should have step3');
  t.end();
});

test('ServicesP1DiagnosticLogger - endStep calculates step durations', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  const operationId = 'op-789';
  const step = 'services_table_insert';

  diagnosticLogger.startStep(operationId, step);

  // Small delay to ensure measurable duration
  await new Promise((resolve) => setImmediate(resolve));

  diagnosticLogger.endStep(operationId, step, {tableName: 'services'});

  t.equal(mockLogger.calls.debug.length, 1, 'should log debug message');

  const logCall = mockLogger.calls.debug[0];
  t.equal(logCall.message, LOG_MSG.STEP_COMPLETED,
    'should use correct log message');
  t.equal(logCall.data.operationId, operationId, 'should include operationId');
  t.equal(logCall.data.step, step, 'should include step');
  t.ok(typeof logCall.data.elapsedMs === 'number', 'should include elapsedMs');
  t.ok(logCall.data.elapsedMs >= 0, 'elapsedMs should be >= 0');
  t.equal(logCall.data.tableName, 'services', 'should include metadata');

  // Verify timing was removed
  const key = `${operationId}:${step}`;
  t.notOk(diagnosticLogger.operationTimings.has(key),
    'should remove timing after endStep');
  t.end();
});

test('ServicesP1DiagnosticLogger - endStep with no matching start', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  const operationId = 'op-nonexistent';
  const step = 'unknown_step';

  // Should not throw, just do nothing
  diagnosticLogger.endStep(operationId, step);

  t.equal(mockLogger.calls.debug.length, 0, 'should not log anything');
  t.end();
});

test('ServicesP1DiagnosticLogger - endStep removes timing entry', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  const operationId = 'op-remove';
  const step = 'test_step';

  diagnosticLogger.startStep(operationId, step);
  t.equal(diagnosticLogger.operationTimings.size, 1, 'should have 1 entry');

  diagnosticLogger.endStep(operationId, step);
  t.equal(diagnosticLogger.operationTimings.size, 0,
    'should have 0 entries after endStep');
  t.end();
});

test('ServicesP1DiagnosticLogger - logTimeout with all pending steps', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  const operationId = 'op-timeout';
  const step1 = 'services_table_insert';
  const step2 = 'create_replica_send';

  diagnosticLogger.startStep(operationId, step1);
  diagnosticLogger.startStep(operationId, step2);

  // Small delay to ensure measurable duration
  await new Promise((resolve) => setImmediate(resolve));

  diagnosticLogger.logTimeout(operationId, {timeoutMs: 30000});

  t.equal(mockLogger.calls.error.length, 1, 'should log error message');

  const logCall = mockLogger.calls.error[0];
  t.equal(logCall.message, LOG_MSG.OPERATION_TIMEOUT,
    'should use correct log message');
  t.equal(logCall.data.operationId, operationId, 'should include operationId');
  t.equal(logCall.data.timeoutMs, 30000, 'should include metadata');

  t.ok(Array.isArray(logCall.data.pendingSteps), 'should include pendingSteps');
  t.equal(logCall.data.pendingSteps.length, 2, 'should have 2 pending steps');

  const stepNames = logCall.data.pendingSteps.map((s) => s.step);
  t.ok(stepNames.includes(step1), 'should include step1');
  t.ok(stepNames.includes(step2), 'should include step2');

  // Verify each pending step has elapsedMs
  for (const pendingStep of logCall.data.pendingSteps) {
    t.ok(typeof pendingStep.elapsedMs === 'number',
      'each pending step should have elapsedMs');
    t.ok(pendingStep.elapsedMs >= 0, 'elapsedMs should be >= 0');
  }
  t.end();
});

test('ServicesP1DiagnosticLogger - logTimeout with no pending steps', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  const operationId = 'op-no-pending';

  diagnosticLogger.logTimeout(operationId);

  t.equal(mockLogger.calls.error.length, 1, 'should log error message');

  const logCall = mockLogger.calls.error[0];
  t.equal(logCall.data.pendingSteps.length, 0, 'should have empty pendingSteps');
  t.end();
});

test('ServicesP1DiagnosticLogger - logTimeout only includes matching operation', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  const operationId1 = 'op-first';
  const operationId2 = 'op-second';

  diagnosticLogger.startStep(operationId1, 'step1');
  diagnosticLogger.startStep(operationId1, 'step2');
  diagnosticLogger.startStep(operationId2, 'step3');

  diagnosticLogger.logTimeout(operationId1);

  const logCall = mockLogger.calls.error[0];
  t.equal(logCall.data.pendingSteps.length, 2,
    'should only include steps for operationId1');

  const stepNames = logCall.data.pendingSteps.map((s) => s.step);
  t.ok(stepNames.includes('step1'), 'should include step1');
  t.ok(stepNames.includes('step2'), 'should include step2');
  t.notOk(stepNames.includes('step3'), 'should not include step3');
  t.end();
});

test('ServicesP1DiagnosticLogger - full operation lifecycle', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  const operationId = 'op-lifecycle';

  // Start all steps
  diagnosticLogger.startStep(operationId, 'services_table_insert');
  diagnosticLogger.startStep(operationId, 'create_replica_send');
  diagnosticLogger.startStep(operationId, 'ack_receipt');

  t.equal(diagnosticLogger.operationTimings.size, 3, 'should have 3 entries');

  // End first step
  diagnosticLogger.endStep(operationId, 'services_table_insert');
  t.equal(diagnosticLogger.operationTimings.size, 2, 'should have 2 entries');
  t.equal(mockLogger.calls.debug.length, 1, 'should have 1 debug log');

  // End second step
  diagnosticLogger.endStep(operationId, 'create_replica_send');
  t.equal(diagnosticLogger.operationTimings.size, 1, 'should have 1 entry');
  t.equal(mockLogger.calls.debug.length, 2, 'should have 2 debug logs');

  // End third step
  diagnosticLogger.endStep(operationId, 'ack_receipt');
  t.equal(diagnosticLogger.operationTimings.size, 0, 'should have 0 entries');
  t.equal(mockLogger.calls.debug.length, 3, 'should have 3 debug logs');
  t.end();
});

test('ServicesP1DiagnosticLogger - timeout during partial completion', async (t) => {
  const mockLogger = createMockLogger();
  const diagnosticLogger = new ServicesP1DiagnosticLogger(mockLogger);

  const operationId = 'op-partial';

  // Start all steps
  diagnosticLogger.startStep(operationId, 'services_table_insert');
  diagnosticLogger.startStep(operationId, 'create_replica_send');
  diagnosticLogger.startStep(operationId, 'ack_receipt');

  // Complete first step
  diagnosticLogger.endStep(operationId, 'services_table_insert');

  // Timeout occurs with 2 pending steps
  diagnosticLogger.logTimeout(operationId);

  const logCall = mockLogger.calls.error[0];
  t.equal(logCall.data.pendingSteps.length, 2,
    'should have 2 pending steps');

  const stepNames = logCall.data.pendingSteps.map((s) => s.step);
  t.notOk(stepNames.includes('services_table_insert'),
    'should not include completed step');
  t.ok(stepNames.includes('create_replica_send'),
    'should include pending step');
  t.ok(stepNames.includes('ack_receipt'),
    'should include pending step');
  t.end();
});

test('ServicesP1DiagnosticLogger - LOG_MSG constants', async (t) => {
  t.equal(LOG_MSG.STEP_COMPLETED, 'Services-p1 operation step completed',
    'should have correct STEP_COMPLETED message');
  t.equal(LOG_MSG.OPERATION_TIMEOUT, 'Services-p1 operation timeout',
    'should have correct OPERATION_TIMEOUT message');
  t.end();
});

