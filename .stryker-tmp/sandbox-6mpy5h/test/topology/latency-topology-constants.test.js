// @ts-nocheck
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  LATENCY_ASSIGNMENT_STATE,
  LATENCY_GROUP_STATE,
  LATENCY_PROPAGATION_MODE,
  LATENCY_TOPOLOGY_CONFIG_KEY,
  LATENCY_TOPOLOGY_DEFAULT,
  LATENCY_TOPOLOGY_SUBSYSTEM,
} from '../../src/topology/latency-topology-constants.js';
import {
  CONFIG_KEY,
  DEFAULT_CONFIG,
} from '../../src/config/config-constants.js';

test('latency topology constants map to config keys', async (t) => {
  await t.test('config key bindings are centralized', () => {
    assert.equal(
      LATENCY_TOPOLOGY_CONFIG_KEY.GROUP_THRESHOLD_MS,
      CONFIG_KEY.LATENCY_GROUP_THRESHOLD_MS,
    );
    assert.equal(
      LATENCY_TOPOLOGY_CONFIG_KEY.RECALC_INTERVAL_MS,
      CONFIG_KEY.LATENCY_RECALC_INTERVAL_MS,
    );
    assert.equal(
      LATENCY_TOPOLOGY_CONFIG_KEY.RECALC_JITTER_RATIO,
      CONFIG_KEY.LATENCY_RECALC_JITTER_RATIO,
    );
    assert.equal(
      LATENCY_TOPOLOGY_CONFIG_KEY.PING_TIMEOUT_MS,
      CONFIG_KEY.LATENCY_PING_TIMEOUT_MS,
    );
    assert.equal(
      LATENCY_TOPOLOGY_CONFIG_KEY.PING_RETRY_COUNT,
      CONFIG_KEY.LATENCY_PING_RETRY_COUNT,
    );
    assert.equal(
      LATENCY_TOPOLOGY_CONFIG_KEY.SMOOTHING_ALPHA,
      CONFIG_KEY.LATENCY_SMOOTHING_ALPHA,
    );
    assert.equal(
      LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE,
      CONFIG_KEY.LATENCY_PROPAGATION_MODE,
    );
  });

  await t.test('default values follow central configuration defaults', () => {
    assert.equal(
      LATENCY_TOPOLOGY_DEFAULT.GROUP_THRESHOLD_MS,
      DEFAULT_CONFIG.latency.groupThresholdMs,
    );
    assert.equal(
      LATENCY_TOPOLOGY_DEFAULT.RECALC_INTERVAL_MS,
      DEFAULT_CONFIG.latency.recalcIntervalMs,
    );
    assert.equal(
      LATENCY_TOPOLOGY_DEFAULT.RECALC_JITTER_RATIO,
      DEFAULT_CONFIG.latency.recalcJitterRatio,
    );
    assert.equal(
      LATENCY_TOPOLOGY_DEFAULT.PING_TIMEOUT_MS,
      DEFAULT_CONFIG.latency.pingTimeoutMs,
    );
    assert.equal(
      LATENCY_TOPOLOGY_DEFAULT.PING_RETRY_COUNT,
      DEFAULT_CONFIG.latency.pingRetryCount,
    );
    assert.equal(
      LATENCY_TOPOLOGY_DEFAULT.SMOOTHING_ALPHA,
      DEFAULT_CONFIG.latency.smoothingAlpha,
    );
    assert.equal(
      LATENCY_TOPOLOGY_DEFAULT.PROPAGATION_MODE,
      DEFAULT_CONFIG.latency.propagationMode,
    );
  });

  await t.test('state and mode enums expose expected canonical values', () => {
    assert.equal(LATENCY_ASSIGNMENT_STATE.UNASSIGNED, 'unassigned');
    assert.equal(LATENCY_ASSIGNMENT_STATE.ASSIGNED, 'assigned');
    assert.equal(LATENCY_ASSIGNMENT_STATE.REASSIGNING, 'reassigning');

    assert.equal(LATENCY_GROUP_STATE.ACTIVE, 'active');
    assert.equal(LATENCY_GROUP_STATE.DRAINING, 'draining');

    assert.equal(LATENCY_PROPAGATION_MODE.SAFE, 'safe');
    assert.equal(LATENCY_PROPAGATION_MODE.GROUPED, 'grouped');
  });

  await t.test('exported objects are frozen', () => {
    assert.equal(LATENCY_TOPOLOGY_SUBSYSTEM, 'latency-topology');
    assert.ok(Object.isFrozen(LATENCY_TOPOLOGY_CONFIG_KEY));
    assert.ok(Object.isFrozen(LATENCY_TOPOLOGY_DEFAULT));
    assert.ok(Object.isFrozen(LATENCY_ASSIGNMENT_STATE));
    assert.ok(Object.isFrozen(LATENCY_GROUP_STATE));
    assert.ok(Object.isFrozen(LATENCY_PROPAGATION_MODE));
  });
});
