/**
 * Tests for ErrorHandler
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.10
 */

import {test} from '../../../src/test-helpers/tap.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ErrorHandler,
  ERROR_LEVEL,
  NOTIFICATION_TYPE,
  MIN_TERMINAL_SIZE,
} from '../../../src/cli/core/error-handler.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';

// Helper to create a temp log path
function createTempLogPath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-handler-test-'));
  return path.join(tempDir, 'error.log');
}

// Helper to cleanup temp directory
function cleanupTempDir(logPath) {
  const dir = path.dirname(logPath);
  try {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
    if (fs.existsSync(dir)) {
      fs.rmdirSync(dir);
    }
  } catch {
    // Ignore cleanup errors
  }
}

test('ErrorHandler - constructor initializes with defaults', async (t) => {
  const handler = new ErrorHandler();

  t.ok(handler.notifications, 'should have notifications array');
  t.equal(handler.notifications.length, 0, 'should start with no notifications');
  t.equal(handler.maxNotifications, 50, 'should have default max notifications');
  t.equal(handler.defaultDuration, 5000, 'should have default duration');
  t.equal(handler.terminalTooSmall, false, 'should not be too small initially');

  handler.destroy();
});

test('ErrorHandler - constructor accepts custom options', async (t) => {
  const eventBus = new EventBus();
  const logPath = createTempLogPath();

  const handler = new ErrorHandler({
    eventBus,
    logPath,
    maxNotifications: 10,
    defaultDuration: 3000,
    logToConsole: false,
  });

  t.equal(handler.eventBus, eventBus, 'should use provided event bus');
  t.equal(handler.logPath, logPath, 'should use provided log path');
  t.equal(handler.maxNotifications, 10, 'should use provided max notifications');
  t.equal(handler.defaultDuration, 3000, 'should use provided duration');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - log writes to file', async (t) => {
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({logPath});

  handler.log(ERROR_LEVEL.ERROR, 'Test error message', {key: 'value'});

  // Read log file
  const content = fs.readFileSync(logPath, 'utf8');
  const entry = JSON.parse(content.trim());

  t.equal(entry.level, ERROR_LEVEL.ERROR, 'should log correct level');
  t.equal(entry.message, 'Test error message', 'should log correct message');
  t.same(entry.context, {key: 'value'}, 'should log context');
  t.ok(entry.timestamp, 'should have timestamp');
  t.ok(entry.isoTime, 'should have ISO time');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - log methods work correctly', async (t) => {
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({logPath});

  handler.debug('Debug message');
  handler.info('Info message');
  handler.warn('Warning message');
  handler.error('Error message');
  handler.critical('Critical message');

  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.trim().split('\n');

  t.equal(lines.length, 5, 'should have 5 log entries');

  const entries = lines.map((line) => JSON.parse(line));
  t.equal(entries[0].level, ERROR_LEVEL.DEBUG, 'first should be debug');
  t.equal(entries[1].level, ERROR_LEVEL.INFO, 'second should be info');
  t.equal(entries[2].level, ERROR_LEVEL.WARNING, 'third should be warning');
  t.equal(entries[3].level, ERROR_LEVEL.ERROR, 'fourth should be error');
  t.equal(entries[4].level, ERROR_LEVEL.CRITICAL, 'fifth should be critical');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - log handles Error objects in context', async (t) => {
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({logPath});

  const error = new Error('Test error');
  handler.error('Operation failed', {error});

  const content = fs.readFileSync(logPath, 'utf8');
  const entry = JSON.parse(content.trim());

  t.ok(entry.stack, 'should include stack trace');
  t.equal(entry.context.error, 'Test error', 'should include error message');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - notify creates notification', async (t) => {
  const handler = new ErrorHandler();

  const id = handler.notify(NOTIFICATION_TYPE.INFO, 'Test notification', {
    duration: 0, // Don't auto-dismiss
  });

  t.ok(id, 'should return notification ID');
  t.match(id, /^notification_\d+$/, 'should have correct ID format');

  const notifications = handler.getActiveNotifications();
  t.equal(notifications.length, 1, 'should have one notification');
  t.equal(notifications[0].type, NOTIFICATION_TYPE.INFO, 'should have correct type');
  t.equal(notifications[0].message, 'Test notification', 'should have correct message');
  t.equal(notifications[0].dismissed, false, 'should not be dismissed');

  handler.destroy();
});

test('ErrorHandler - notification helper methods', async (t) => {
  const handler = new ErrorHandler();

  handler.notifyInfo('Info', {duration: 0});
  handler.notifySuccess('Success', {duration: 0});
  handler.notifyWarning('Warning', {duration: 0});

  const notifications = handler.getActiveNotifications();
  t.equal(notifications.length, 3, 'should have three notifications');
  t.equal(notifications[0].type, NOTIFICATION_TYPE.INFO, 'first should be info');
  t.equal(notifications[1].type, NOTIFICATION_TYPE.SUCCESS, 'second should be success');
  t.equal(notifications[2].type, NOTIFICATION_TYPE.WARNING, 'third should be warning');

  handler.destroy();
});

test('ErrorHandler - notifyError also logs error', async (t) => {
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({logPath});

  handler.notifyError('Error notification', {duration: 0});

  const notifications = handler.getActiveNotifications();
  t.equal(notifications.length, 1, 'should have one notification');
  t.equal(notifications[0].type, NOTIFICATION_TYPE.ERROR, 'should be error type');

  // Check log file
  const content = fs.readFileSync(logPath, 'utf8');
  const entry = JSON.parse(content.trim());
  t.equal(entry.level, ERROR_LEVEL.ERROR, 'should log as error');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - dismissNotification removes notification', async (t) => {
  const handler = new ErrorHandler();

  const id = handler.notify(NOTIFICATION_TYPE.INFO, 'Test', {duration: 0});
  t.equal(handler.getActiveNotifications().length, 1, 'should have one active');

  handler.dismissNotification(id);
  t.equal(handler.getActiveNotifications().length, 0, 'should have no active');

  const all = handler.getAllNotifications();
  t.equal(all[0].dismissed, true, 'should be marked dismissed');

  handler.destroy();
});

test('ErrorHandler - dismissAllNotifications clears all', async (t) => {
  const handler = new ErrorHandler();

  handler.notify(NOTIFICATION_TYPE.INFO, 'Test 1', {duration: 0});
  handler.notify(NOTIFICATION_TYPE.INFO, 'Test 2', {duration: 0});
  handler.notify(NOTIFICATION_TYPE.INFO, 'Test 3', {duration: 0});

  t.equal(handler.getActiveNotifications().length, 3, 'should have three active');

  handler.dismissAllNotifications();
  t.equal(handler.getActiveNotifications().length, 0, 'should have no active');

  handler.destroy();
});

test('ErrorHandler - notifications auto-dismiss after duration', async (t) => {
  const handler = new ErrorHandler();

  handler.notify(NOTIFICATION_TYPE.INFO, 'Test', {duration: 50});
  t.equal(handler.getActiveNotifications().length, 1, 'should have one active');

  // Wait for auto-dismiss
  await new Promise((resolve) => setTimeout(resolve, 100));
  t.equal(handler.getActiveNotifications().length, 0, 'should auto-dismiss');

  handler.destroy();
});

test('ErrorHandler - max notifications limit', async (t) => {
  const handler = new ErrorHandler({maxNotifications: 3});

  handler.notify(NOTIFICATION_TYPE.INFO, 'Test 1', {duration: 0});
  handler.notify(NOTIFICATION_TYPE.INFO, 'Test 2', {duration: 0});
  handler.notify(NOTIFICATION_TYPE.INFO, 'Test 3', {duration: 0});
  handler.notify(NOTIFICATION_TYPE.INFO, 'Test 4', {duration: 0});

  const all = handler.getAllNotifications();
  t.equal(all.length, 3, 'should trim to max');
  t.equal(all[0].message, 'Test 2', 'should keep most recent');

  handler.destroy();
});

test('ErrorHandler - handleTerminalResize updates size', async (t) => {
  const handler = new ErrorHandler();

  handler.handleTerminalResize(120, 40);

  const size = handler.getTerminalSize();
  t.equal(size.width, 120, 'should update width');
  t.equal(size.height, 40, 'should update height');
  t.equal(handler.isTerminalTooSmall(), false, 'should not be too small');

  handler.destroy();
});

test('ErrorHandler - handleTerminalResize detects too small', async (t) => {
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({logPath});

  handler.handleTerminalResize(60, 20);

  t.equal(handler.isTerminalTooSmall(), true, 'should detect too small');

  // Check warning was logged
  const content = fs.readFileSync(logPath, 'utf8');
  t.ok(content.includes('Terminal too small'), 'should log warning');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - handleTerminalResize emits events', async (t) => {
  const eventBus = new EventBus();
  const handler = new ErrorHandler({eventBus});

  let resizeEvent = null;
  let tooSmallEvent = null;

  eventBus.on('terminal:resize', (data) => {
    resizeEvent = data;
  });
  eventBus.on('terminal:tooSmall', (data) => {
    tooSmallEvent = data;
  });

  handler.handleTerminalResize(60, 20);

  t.ok(resizeEvent, 'should emit resize event');
  t.equal(resizeEvent.width, 60, 'resize event should have width');
  t.equal(resizeEvent.tooSmall, true, 'resize event should indicate too small');

  t.ok(tooSmallEvent, 'should emit tooSmall event');
  t.same(tooSmallEvent.current, {width: 60, height: 20}, 'should have current size');
  t.same(tooSmallEvent.minimum, MIN_TERMINAL_SIZE, 'should have minimum size');

  handler.destroy();
});

test('ErrorHandler - handleTerminalResize calls callbacks', async (t) => {
  const handler = new ErrorHandler();

  let resizeCallback = null;
  let tooSmallCallback = null;

  handler.onTerminalResize = (w, h) => {
    resizeCallback = {w, h};
  };
  handler.onTerminalTooSmall = (current, min) => {
    tooSmallCallback = {current, min};
  };

  handler.handleTerminalResize(60, 20);

  t.same(resizeCallback, {w: 60, h: 20}, 'should call resize callback');
  t.ok(tooSmallCallback, 'should call too small callback');

  handler.destroy();
});

test('ErrorHandler - getMinTerminalSize returns constants', async (t) => {
  const handler = new ErrorHandler();

  const min = handler.getMinTerminalSize();
  t.same(min, MIN_TERMINAL_SIZE, 'should return minimum size');

  handler.destroy();
});

test('ErrorHandler - formatWithMissingIndicator handles null/undefined', async (t) => {
  const handler = new ErrorHandler();

  t.equal(handler.formatWithMissingIndicator(null), 'N/A', 'null should be N/A');
  t.equal(handler.formatWithMissingIndicator(undefined), 'N/A', 'undefined should be N/A');
  t.equal(handler.formatWithMissingIndicator('value'), 'value', 'value should pass through');
  t.equal(handler.formatWithMissingIndicator(123), '123', 'number should stringify');
  t.equal(handler.formatWithMissingIndicator(null, '-'), '-', 'custom placeholder');

  handler.destroy();
});

test('ErrorHandler - createPartialDataIndicator creates indicator', async (t) => {
  const handler = new ErrorHandler();

  const indicator = handler.createPartialDataIndicator('Metrics');

  t.equal(indicator.section, 'Metrics', 'should have section name');
  t.equal(indicator.message, '[Metrics: Data unavailable]', 'should have message');
  t.equal(indicator.isMissing, true, 'should be marked as missing');

  handler.destroy();
});

test('ErrorHandler - checkPartialData detects missing fields', async (t) => {
  const handler = new ErrorHandler();

  const data = {
    name: 'test',
    value: 123,
    missing: null,
    alsoMissing: undefined,
  };

  const result = handler.checkPartialData(data, ['name', 'value', 'missing', 'alsoMissing']);

  t.equal(result.isPartial, true, 'should detect partial data');
  t.same(result.missingFields, ['missing', 'alsoMissing'], 'should list missing fields');

  handler.destroy();
});

test('ErrorHandler - checkPartialData returns false for complete data', async (t) => {
  const handler = new ErrorHandler();

  const data = {
    name: 'test',
    value: 123,
  };

  const result = handler.checkPartialData(data, ['name', 'value']);

  t.equal(result.isPartial, false, 'should not be partial');
  t.same(result.missingFields, [], 'should have no missing fields');

  handler.destroy();
});

test('ErrorHandler - handleApiError creates notification and logs', async (t) => {
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({logPath});

  const error = new Error('Connection refused');
  handler.handleApiError(error, 'Fetch nodes');

  const notifications = handler.getActiveNotifications();
  t.equal(notifications.length, 1, 'should create notification');
  t.ok(notifications[0].message.includes('Fetch nodes failed'), 'should include operation');
  t.ok(notifications[0].message.includes('Connection refused'), 'should include error');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - logMetadataWarning logs with context', async (t) => {
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({logPath});

  handler.logMetadataWarning('computePartitionCount', 'Invalid partition data', {
    tableId: 'test-table',
  });

  const content = fs.readFileSync(logPath, 'utf8');
  const entry = JSON.parse(content.trim());

  t.equal(entry.level, ERROR_LEVEL.WARNING, 'should be warning level');
  t.ok(entry.message.includes('computePartitionCount'), 'should include operation');
  t.ok(entry.message.includes('Invalid partition data'), 'should include message');
  t.equal(entry.context.operation, 'computePartitionCount', 'should have operation in context');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - safeExecute returns result on success', async (t) => {
  const handler = new ErrorHandler();

  const result = handler.safeExecute(() => 'success', 'default');
  t.equal(result, 'success', 'should return function result');

  handler.destroy();
});

test('ErrorHandler - safeExecute returns default on error', async (t) => {
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({logPath});

  const result = handler.safeExecute(() => {
    throw new Error('Test error');
  }, 'default', 'Test operation');

  t.equal(result, 'default', 'should return default value');

  // Check warning was logged
  const content = fs.readFileSync(logPath, 'utf8');
  t.ok(content.includes('Test operation failed'), 'should log warning');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - wrapWithErrorHandling wraps function', async (t) => {
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({logPath});

  const fn = async () => 'result';
  const wrapped = handler.wrapWithErrorHandling(fn, 'Test operation');

  const result = await wrapped();
  t.equal(result, 'result', 'should return function result');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - wrapWithErrorHandling handles errors', async (t) => {
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({logPath});

  const fn = async () => {
    throw new Error('Test error');
  };
  const wrapped = handler.wrapWithErrorHandling(fn, 'Test operation');

  try {
    await wrapped();
    t.fail('should throw error');
  } catch (err) {
    t.equal(err.message, 'Test error', 'should rethrow error');
  }

  // Check notification was created
  const notifications = handler.getActiveNotifications();
  t.equal(notifications.length, 1, 'should create notification');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - notification emits events', async (t) => {
  const eventBus = new EventBus();
  const handler = new ErrorHandler({eventBus});

  let showEvent = null;
  let dismissEvent = null;

  eventBus.on('notification:show', (data) => {
    showEvent = data;
  });
  eventBus.on('notification:dismiss', (data) => {
    dismissEvent = data;
  });

  const id = handler.notify(NOTIFICATION_TYPE.INFO, 'Test', {duration: 0});

  t.ok(showEvent, 'should emit show event');
  t.equal(showEvent.id, id, 'show event should have ID');

  handler.dismissNotification(id);

  t.ok(dismissEvent, 'should emit dismiss event');
  t.equal(dismissEvent.id, id, 'dismiss event should have ID');

  handler.destroy();
});

test('ErrorHandler - notification calls callback', async (t) => {
  const handler = new ErrorHandler();

  let callbackNotification = null;
  handler.onNotification = (notification) => {
    callbackNotification = notification;
  };

  handler.notify(NOTIFICATION_TYPE.INFO, 'Test', {duration: 0});

  t.ok(callbackNotification, 'should call callback');
  t.equal(callbackNotification.message, 'Test', 'callback should receive notification');

  handler.destroy();
});

test('ErrorHandler - destroy cleans up resources', async (t) => {
  const handler = new ErrorHandler();

  handler.notify(NOTIFICATION_TYPE.INFO, 'Test', {duration: 10000});
  t.equal(handler.dismissTimers.size, 1, 'should have timer');

  handler.destroy();

  t.equal(handler.dismissTimers.size, 0, 'should clear timers');
  t.equal(handler.notifications.length, 0, 'should clear notifications');
  t.equal(handler.eventBus, null, 'should clear event bus');

  // Should not throw
  handler.destroy();
});

test('ErrorHandler - log emits event', async (t) => {
  const eventBus = new EventBus();
  const logPath = createTempLogPath();
  const handler = new ErrorHandler({eventBus, logPath});

  let logEvent = null;
  eventBus.on('error:logged', (data) => {
    logEvent = data;
  });

  handler.error('Test error');

  t.ok(logEvent, 'should emit log event');
  t.equal(logEvent.level, ERROR_LEVEL.ERROR, 'event should have level');
  t.equal(logEvent.message, 'Test error', 'event should have message');

  handler.destroy();
  cleanupTempDir(logPath);
});

test('ErrorHandler - handles missing log directory gracefully', async (_t) => {
  const handler = new ErrorHandler({
    logPath: '/nonexistent/path/that/should/not/exist/error.log',
  });

  // Should not throw
  handler.error('Test error');

  handler.destroy();
});

test('MIN_TERMINAL_SIZE has correct values', async (t) => {
  t.equal(MIN_TERMINAL_SIZE.width, 80, 'minimum width should be 80');
  t.equal(MIN_TERMINAL_SIZE.height, 24, 'minimum height should be 24');
});

test('ERROR_LEVEL has all levels', async (t) => {
  t.equal(ERROR_LEVEL.DEBUG, 'debug', 'should have debug');
  t.equal(ERROR_LEVEL.INFO, 'info', 'should have info');
  t.equal(ERROR_LEVEL.WARNING, 'warning', 'should have warning');
  t.equal(ERROR_LEVEL.ERROR, 'error', 'should have error');
  t.equal(ERROR_LEVEL.CRITICAL, 'critical', 'should have critical');
});

test('NOTIFICATION_TYPE has all types', async (t) => {
  t.equal(NOTIFICATION_TYPE.INFO, 'info', 'should have info');
  t.equal(NOTIFICATION_TYPE.SUCCESS, 'success', 'should have success');
  t.equal(NOTIFICATION_TYPE.WARNING, 'warning', 'should have warning');
  t.equal(NOTIFICATION_TYPE.ERROR, 'error', 'should have error');
});
