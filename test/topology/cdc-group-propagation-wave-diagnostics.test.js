/**
 * The durable CDC delivery's trace (one vector to one recipient group)
 * accumulates the source apply time, keeps a bounded list of target
 * attempts, and is written as one console-only line when the delivery
 * finishes; the one refusal left (the grouped plan names another source
 * group) and skipped targets are one throttled line per kind. The node-wide
 * wave slot is gone, and with it the busy / yield-hold refusals and the
 * slice and waiting-table fields these lines carried.
 */

import {test} from '../../src/test-helpers/tap.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_GROUP_PROPAGATION_LOG_MSG} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {
  DURABLE_WAVE_REFUSAL,
  TARGET_SKIP_REASON,
  openDurableWaveTrace,
  reportCdcTargetSkipped,
  reportDurableWaveFinished,
  reportDurableWaveRefused,
  traceWaveLeaf,
} from '../../src/topology/cdc-group-propagation-wave-diagnostics.js';

function captureConsoleOnly(t) {
  const logging = LoggingService.getInstance();
  const lines = [];
  const original = logging.logConsoleOnly;
  const originalLog = logging.log;
  logging.logConsoleOnly = (level, message, context) => {
    lines.push({level, message, context});
  };
  logging.log = (level, message) => {
    lines.push({persistingPath: true, message});
  };
  t.teardown(() => {
    logging.logConsoleOnly = original;
    logging.log = originalLog;
  });
  return lines;
}

function createOwner(nowMs) {
  const clock = {nowMs};
  return {
    clock,
    nodeId: 'node-a',
    now: () => clock.nowMs,
    activeDurableDeliveries: new Set(['another-delivery-in-flight']),
  };
}

const EVENT = Object.freeze({
  tableName: 'ratings',
  sourcePartition: 'ratings-p0',
  sourceLogIndex: 77,
  sourceOrdinal: 2,
  timestamp: '1700000000000:0:node-a',
});

function targetLeaf(groupId) {
  return {groupId, route: {groupId, coordinatorNodeId: `${groupId}-coordinator`}};
}

test('the trace accumulates the source apply and each target attempt',
  async (t) => {
    const trace = openDurableWaveTrace(createOwner(1000));

    traceWaveLeaf(trace, {isSource: true, leaf: {}, elapsedMs: 4, answer: {success: true}});
    traceWaveLeaf(trace, {isSource: true, leaf: {}, elapsedMs: 6, answer: {success: true}});
    traceWaveLeaf(trace, {
      isSource: false, leaf: targetLeaf('mg-1'), elapsedMs: 12, answer: {success: true},
    });
    traceWaveLeaf(trace, {
      isSource: false, leaf: targetLeaf('mg-2'), elapsedMs: 5000,
      answer: {success: false, error: 'backpressure'},
    });
    traceWaveLeaf(trace, {
      isSource: false, leaf: targetLeaf('mg-3'), elapsedMs: 9, answer: null,
      error: new Error('delivery expired'),
    });

    t.equal(trace.sourceApplyMs, 10, 'source apply time adds up across retries');
    t.same(trace.targets, [
      {groupId: 'mg-1', coordinatorNodeId: 'mg-1-coordinator', deliverMs: 12,
        outcome: 'success', error: null},
      {groupId: 'mg-2', coordinatorNodeId: 'mg-2-coordinator', deliverMs: 5000,
        outcome: 'not_successful', error: 'backpressure'},
      {groupId: 'mg-3', coordinatorNodeId: 'mg-3-coordinator', deliverMs: 9,
        outcome: 'threw', error: 'Error: delivery expired'},
    ]);
  });

test('the traced target attempts are bounded and the overflow is counted',
  async (t) => {
    const trace = openDurableWaveTrace(createOwner(1000));

    for (let attempt = 0; attempt < 20; attempt += 1) {
      traceWaveLeaf(trace, {
        isSource: false, leaf: targetLeaf(`mg-${attempt}`), elapsedMs: 1,
        answer: {success: false},
      });
    }

    t.equal(trace.targets.length, 16);
    t.equal(trace.untracedTargetAttempts, 4);
  });

test('a finished wave is one console-only line with its whole trace',
  async (t) => {
    const lines = captureConsoleOnly(t);
    const owner = createOwner(5000);
    const trace = openDurableWaveTrace(owner);
    trace.eventCount = 1;
    trace.recipientGroupId = 'mg-source';
    traceWaveLeaf(trace, {isSource: true, leaf: {}, elapsedMs: 3, answer: {success: true}});
    owner.clock.nowMs = 5040;

    reportDurableWaveFinished(owner, EVENT, trace);

    t.equal(lines.length, 1);
    t.equal(lines[0].message, CDC_GROUP_PROPAGATION_LOG_MSG.DURABLE_WAVE_FINISHED);
    t.equal(lines[0].level, 'info');
    t.same(lines[0].context, {
      subsystem: 'cdc-group-propagation',
      localNodeId: 'node-a',
      tableName: 'ratings',
      sourcePartition: 'ratings-p0',
      sourceLogIndex: 77,
      sourceOrdinal: 2,
      originHlc: '1700000000000:0:node-a',
      eventCount: 1,
      recipientGroupId: 'mg-source',
      admittedAtMs: 5000,
      waveMs: 40,
      sourceApplyMs: 3,
      targets: [],
      untracedTargetAttempts: 0,
      planRoutingReason: null,
      activeDeliveries: 1,
      suppressed: 0,
      maxWaveMs: 40,
    });
    t.notOk(lines.some((line) => line.persistingPath),
      'nothing goes through the persisting log path');
  });

test('refusals are one line per kind and skipped targets one per reason',
  async (t) => {
    const lines = captureConsoleOnly(t);
    const owner = createOwner(9000);

    reportDurableWaveRefused(owner, EVENT, {});
    reportDurableWaveRefused(owner, EVENT, {});
    reportCdcTargetSkipped(owner, EVENT, targetLeaf('mg-9').route,
      TARGET_SKIP_REASON.NOT_ROUTABLE, 'missing_coordinator_address');

    t.same(lines.map((line) => line.message), [
      CDC_GROUP_PROPAGATION_LOG_MSG.DURABLE_WAVE_REFUSED,
      CDC_GROUP_PROPAGATION_LOG_MSG.TARGET_SKIPPED,
    ], 'the repeated refusal inside the window is suppressed');
    t.equal(lines[0].context.refusal, 'source_mismatch');
    t.same(Object.keys(DURABLE_WAVE_REFUSAL), ['SOURCE_MISMATCH'],
      'no busy or yield-hold refusal exists: there is no shared slot');
    t.equal(lines[1].context.groupId, 'mg-9');
    t.equal(lines[1].context.coordinatorNodeId, 'mg-9-coordinator');
    t.equal(lines[1].context.reason, 'not_routable');
    t.equal(lines[1].context.planRoutingReason, 'missing_coordinator_address');
    t.equal(lines[1].context.sourceLogIndex, 77);
  });
