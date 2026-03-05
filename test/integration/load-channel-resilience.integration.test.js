import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {NodeClient} from '../distributed/harness/node-client.js';
import {LoadGenerator} from '../distributed/harness/load-generator.js';

const ZERO = 0;
const ONE = 1;
const TIMEOUT_ERROR_CODE = 'ETIMEDOUT';
const CIRCUIT_OPEN_ERROR_CODE = 'circuit_open';
const ROUTING_NOT_READY_ERROR_CODE = 'routing_not_ready';
const LOAD_BREAKER_OWNER_NODE_CLIENT = 'node-client';

function createNodeHandle(id, queryWithTimeout) {
  return {
    id,
    queryWithTimeout,
    async getReachabilityDiagnostics() {
      return {
        nodeId: id,
        reachable: true,
        adminReady: true,
      };
    },
  };
}

function createRoutedLoadNodes(nodeClient, nodeHandles) {
  return nodeHandles.map((nodeHandle) => ({
    id: nodeHandle.id,
    breakerOwner: LOAD_BREAKER_OWNER_NODE_CLIENT,
    query: (sql) => nodeClient.queryLoad(nodeHandle, sql),
  }));
}

test('small timeout bursts do not amplify into operation-level load errors',
  {timeout: 30000}, async () => {
    const burstWindowMs = 70;
    const burstDeadlineMs = Date.now() + burstWindowMs;
    let burstNodeCalls = ZERO;

    const burstNode = createNodeHandle(
      'burst-node',
      async (_sql, _params, options = {}) => {
        if (options.lane === 'load') {
          burstNodeCalls += ONE;
          if (Date.now() < burstDeadlineMs) {
            const timeoutError = new Error('load channel timed out');
            timeoutError.code = TIMEOUT_ERROR_CODE;
            throw timeoutError;
          }
        }
        return {rows: [{ok: true}]};
      },
    );

    let healthyNodeCalls = ZERO;
    const healthyNode = createNodeHandle(
      'healthy-node',
      async (_sql, _params, options = {}) => {
        if (options.lane === 'load') {
          healthyNodeCalls += ONE;
        }
        return {rows: [{ok: true}]};
      },
    );

    const nodeClient = new NodeClient({
      channelPolicies: {
        load: {
          circuitBreakerThreshold: 2,
          cooldownMs: 120,
          retryBudget: 0,
        },
      },
    });
    const routedLoadNodes = createRoutedLoadNodes(nodeClient, [
      burstNode,
      healthyNode,
    ]);
    const loadGenerator = new LoadGenerator(routedLoadNodes, {
      opsPerSec: 220,
      duration: 220,
      maxInFlight: 32,
      nodeMaxInFlight: 4,
      admissionBackoffMs: 30,
      operations: ['SELECT'],
    });

    const run = loadGenerator.start();
    try {
      const metrics = await run.waitComplete();
      assert.equal(metrics.failed, ZERO,
        'timeout burst should not become operation-level failures');
      assert.equal(metrics.errors, ZERO,
        'timeout burst should not become operation-level errors');
      assert.ok(metrics.attemptErrors > ZERO,
        'attempt-level failures should remain observable');
      assert.ok(metrics.success > ZERO, 'load should continue on healthy capacity');
      assert.ok(healthyNodeCalls > ZERO, 'healthy node should absorb traffic');
      assert.ok(burstNodeCalls > ZERO, 'burst node should be attempted');
    } finally {
      run.cancel();
    }
  });

test('control-lane saturation does not starve load-lane throughput',
  {timeout: 30000}, async () => {
    let releaseControl = null;
    let controlCalls = ZERO;
    let loadCalls = ZERO;

    const sharedNode = createNodeHandle(
      'lane-node',
      async (_sql, _params, options = {}) => {
        if (options.lane === 'control') {
          controlCalls += ONE;
          return new Promise((resolve) => {
            releaseControl = resolve;
          });
        }
        if (options.lane === 'load') {
          loadCalls += ONE;
          return {rows: [{ok: true}]};
        }
        return {rows: [{ok: true}]};
      },
    );

    const nodeClient = new NodeClient({
      channelPolicies: {
        control: {
          maxInFlightPerNode: 1,
          retryBudget: 0,
        },
        load: {
          maxInFlightPerNode: 1,
          retryBudget: 0,
        },
      },
    });

    const controlQuery = nodeClient.queryControl(sharedNode, 'SELECT control_hold');
    await Promise.resolve();

    const routedLoadNodes = createRoutedLoadNodes(nodeClient, [sharedNode]);
    const loadGenerator = new LoadGenerator(routedLoadNodes, {
      opsPerSec: 120,
      duration: 140,
      maxInFlight: 8,
      nodeMaxInFlight: 1,
      admissionBackoffMs: 20,
    });

    const run = loadGenerator.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(controlCalls >= ONE, 'control lane should be saturated');
      assert.ok(loadCalls > ZERO, 'load lane should continue dispatching');
      assert.ok(metrics.success > ZERO, 'load lane should retain throughput');
      assert.equal(metrics.failed, ZERO,
        'lane isolation should avoid operation failures under control saturation');
    } finally {
      run.cancel();
      if (typeof releaseControl === 'function') {
        releaseControl({rows: [{ok: true}]});
      }
      await controlQuery;
    }
  });

test('legacy breaker layering can still reproduce cascade-shaped failures',
  {timeout: 30000}, async () => {
    let totalCalls = ZERO;
    const deadlineMs = Date.now() + 90;
    const legacyNode = {
      id: 'legacy-node',
      async query(_sql) {
        totalCalls += ONE;
        if (Date.now() < deadlineMs) {
          const timeoutError = new Error('legacy timeout');
          timeoutError.code = TIMEOUT_ERROR_CODE;
          throw timeoutError;
        }
        const circuitOpenError = new Error('legacy load rejection');
        circuitOpenError.code = CIRCUIT_OPEN_ERROR_CODE;
        throw circuitOpenError;
      },
    };

    const loadGenerator = new LoadGenerator([legacyNode], {
      opsPerSec: 160,
      duration: 180,
      maxInFlight: 16,
      nodeFailureThreshold: 1,
      nodeFailureCooldownMs: 1000,
      admissionBackoffMs: 5,
    });

    const run = loadGenerator.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(metrics.attemptErrors > ZERO,
        'legacy path should record repeated failed attempts');
      assert.ok(totalCalls > ZERO, 'legacy path should repeatedly probe the failing node');
    } finally {
      run.cancel();
    }
  });

test('routing-health admission sheds before dispatching breaker-prone load operations',
  {timeout: 30000}, async () => {
    let blockedAdmissionCalls = ZERO;
    let nodeLoadCalls = ZERO;
    const blockedNode = createNodeHandle(
      'routing-blocked-node',
      async (_sql, _params, options = {}) => {
        if (options.lane === 'load') {
          nodeLoadCalls += ONE;
        }
        return {rows: [{ok: true}]};
      },
    );

    const routedLoadNodes = [{
      id: blockedNode.id,
      breakerOwner: LOAD_BREAKER_OWNER_NODE_CLIENT,
      query: async () => {
        blockedAdmissionCalls += ONE;
        const error = new Error('routing not ready');
        error.code = ROUTING_NOT_READY_ERROR_CODE;
        throw error;
      },
    }];

    const loadGenerator = new LoadGenerator(routedLoadNodes, {
      opsPerSec: 180,
      duration: 180,
      maxInFlight: 8,
      nodeMaxInFlight: 1,
      admissionBackoffMs: 40,
      operations: ['SELECT'],
    });

    const run = loadGenerator.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(blockedAdmissionCalls > ZERO,
        'expected routing admission checks to be exercised');
      assert.equal(nodeLoadCalls, ZERO,
        'load should be shed before dispatching to blocked node');
      assert.equal(metrics.failed, ZERO,
        'routing admission denials should not become operation-level failures');
      assert.equal(metrics.errors, ZERO,
        'routing admission denials should not become operation-level errors');
      assert.ok(metrics.attemptErrors > ZERO,
        'attempt-level admission denials should remain observable');
    } finally {
      run.cancel();
    }
  });
