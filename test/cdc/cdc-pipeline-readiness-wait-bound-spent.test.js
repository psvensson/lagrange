/**
 * Spent-wait witness for the CDC owner: the pipeline readiness gate's
 * deadline logs exactly one wait_bound_spent ERROR naming the unmet
 * conditions (and no WARN duplicate), none on normal completion, and still
 * rejects with the same typed timeout error.
 */

import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
import {test} from '../../src/test-helpers/tap.js';
import {CDCPipelineReadinessGate} from
  '../../src/cdc/cdc-pipeline-readiness-gate.js';
import {WAIT_BOUND_SPENT_EVENT} from '../../src/logging/wait-bound-spent.js';


function createCacheStub() {
  const listeners = new Set();
  return {
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
    fire(tableName, operation, record) {
      for (const listener of listeners) {
        listener(tableName, operation, record);
      }
    },
  };
}

function createGate(cache, clock) {
  const gate = new CDCPipelineReadinessGate({
    systemTableCache: cache,
    cdcPropagatedTables: ['nodes'],
    now: () => clock.nowMs,
    sleep: async (intervalMs) => {
      clock.nowMs += intervalMs;
    },
  });
  const capture = captureLogger();
  gate.logger = capture.logger;
  return {gate, capture};
}

test('pipeline readiness deadline logs one wait_bound_spent ERROR and ' +
  'still rejects with the typed timeout error', async (t) => {
  const clock = {nowMs: 1000};
  const {gate, capture} = createGate(createCacheStub(), clock);
  const context = {
    partitionServices: new Map(),
    messageGroupServices: new Map(),
  };

  let rejected = null;
  try {
    await gate.waitForReady(context, 50, 10);
  } catch (error) {
    rejected = error;
  }

  t.ok(rejected, 'the wait still rejects');
  t.equal(rejected.timeoutMs, 50);
  t.equal(rejected.timeoutKind, 'no_progress');
  t.equal(rejected.unmetConditions.length, 3);
  t.equal(capture.errors().length, 1, 'exactly one ERROR');
  t.equal(capture.warns().length, 0, 'the old WARN line is replaced');
  const context0 = capture.errors()[0].context;
  t.equal(context0.event, WAIT_BOUND_SPENT_EVENT);
  t.equal(context0.wait, 'CDC_PIPELINE_READINESS_TIMEOUT_MS');
  t.equal(context0.boundMs, 50);
  t.ok(context0.elapsedMs >= 50, 'elapsed is measured on the gate clock');
  t.same(context0.lastObserved.unmetConditions, rejected.unmetConditions);
  t.equal(context0.lastObserved.timeoutKind, 'no_progress');
  t.end();
});

test('pipeline readiness that completes logs no wait_bound_spent ERROR',
  async (t) => {
    const clock = {nowMs: 1000};
    const cache = createCacheStub();
    const {gate, capture} = createGate(cache, clock);
    cache.fire('nodes', 'INSERT', {node_id: 'n1'});
    const context = {
      partitionServices: new Map([
        ['p1', {tableName: 'nodes', cdcSubscribers: {size: 1}}],
      ]),
      messageGroupServices: new Map([
        ['mg1', {isLeaderReplica: () => true, getLeaderId: () => null}],
      ]),
    };

    const result = await gate.waitForReady(context, 50, 10);

    t.equal(result.ready, true);
    t.equal(capture.errors().length, 0);
    t.end();
  });
