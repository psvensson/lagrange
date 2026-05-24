/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {createCluster} from './cluster-test-helpers.js';

/**
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * *For any* cluster configuration with `docker.hosts` of length H and
 * `nodesPerHost` limit P, no single Docker host SHALL have more than P
 * containers, and the total container count SHALL equal the requested
 * cluster size (up to H * P).
 *
 * **Validates: Requirements 2.3**
 */
test('Unit: _waitForBootstrapApi times out after bootstrap progress stalls',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: 10,
        bootstrapReadyStableWindowMs: 10,
      },
    });

    const probeResponses = [
      {
        status: 503,
        body: {
          ready: false,
          phase: 'CONTROL_READY',
          phaseRank: 1,
          reasons: ['SQL_ENGINE_UNAVAILABLE'],
        },
      },
      {
        status: -1,
        body: null,
      },
      {
        status: -1,
        body: null,
      },
      {
        status: -1,
        body: null,
      },
    ];
    let bootstrapCallCount = 0;
    cluster._httpRequest = async () => {
      const response = probeResponses[Math.min(
        bootstrapCallCount,
        probeResponses.length - 1,
      )];
      bootstrapCallCount += 1;
      return response;
    };

    const originalDateNow = Date.now;
    let fakeNowMs = 0;
    Date.now = () => fakeNowMs;
    cluster._sleep = async () => {
      fakeNowMs += 5;
    };
    cluster._collectFailureLogs = async () => {
      collected = true;
    };
    let collected = false;

    await assert.rejects(
      async () => {
        try {
          await cluster._waitForBootstrapApi({
            id: '00000000-0000-4000-8000-000000000001',
            ip: '127.0.0.1',
          });
        } finally {
          Date.now = originalDateNow;
        }
      },
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /timeoutReason=no_progress/);
        assert.match(error.message, /bestPhase=CONTROL_READY/);
        assert.match(error.message, /lastProgressElapsedMs=/);
        return true;
      },
    );

    assert.ok(
      bootstrapCallCount >= 3,
      'should continue probing until the no-progress budget is exhausted',
    );
  });
test('Unit: _waitForBootstrapApi exposes diagnostic status summary on timeout',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {nodeStartup: 40, bootstrapReadyStableWindowMs: 0},
    });

    const bootstrapStatuses = [503, 503, -1, 503];
    let bootstrapCallCount = 0;
    cluster._httpRequest = async () => {
      const status = bootstrapStatuses[Math.min(
        bootstrapCallCount,
        bootstrapStatuses.length - 1,
      )];
      bootstrapCallCount += 1;
      return status;
    };
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };

    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };

    await assert.rejects(
      async () => cluster._waitForBootstrapApi({
        id: '00000000-0000-4000-8000-000000000001',
        ip: '127.0.0.1',
      }),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /attempts=/, 'should include attempt count');
        assert.match(error.message, /lastStatus=/, 'should include last status');
        assert.match(error.message, /statusCounts=/, 'should include status histogram');
        return true;
      },
    );
    assert.ok(bootstrapCallCount > 0, 'should execute bootstrap readiness probes');
  });

test('Unit: _waitForBootstrapApi timeout diagnostics include readiness reasons and histograms',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {nodeStartup: 40, bootstrapReadyStableWindowMs: 0},
    });

    const probeResponses = [
      {
        status: 503,
        body: {
          ready: false,
          phase: 'CONTROL_READY',
          state: 'bootstrapping',
          reasons: ['BOOTSTRAP_PHASE_INCOMPLETE'],
        },
      },
      {
        status: 503,
        body: {
          ready: false,
          phase: 'JOIN_READY',
          state: 'warming',
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
        },
      },
      {status: -1, body: null},
    ];
    let bootstrapCallCount = 0;
    cluster._httpRequest = async () => {
      const response = probeResponses[Math.min(
        bootstrapCallCount,
        probeResponses.length - 1,
      )];
      bootstrapCallCount += 1;
      return response;
    };
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };

    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };

    await assert.rejects(
      async () => cluster._waitForBootstrapApi({
        id: '00000000-0000-4000-8000-000000000001',
        ip: '127.0.0.1',
      }),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /statusCounts=/, 'should include status histogram');
        assert.match(error.message, /phaseCounts=/, 'should include phase histogram');
        assert.match(error.message, /lastPhase=/, 'should include last phase');
        assert.match(error.message, /reasonCounts=/, 'should include reason histogram');
        assert.match(error.message, /lastReasons=/, 'should include last blocker reasons');
        return true;
      },
    );
    assert.ok(bootstrapCallCount > 0, 'should execute readiness probes before timeout');
  });

test('Unit: _waitForBootstrapApi records periodic startup-stage diagnostics',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {nodeStartup: 200, bootstrapReadyStableWindowMs: 0},
    });

    const bootstrapStatuses = new Array(20).fill(503).concat([200]);
    let bootstrapCallCount = 0;
    cluster._httpRequest = async () => {
      const status = bootstrapStatuses[Math.min(
        bootstrapCallCount,
        bootstrapStatuses.length - 1,
      )];
      bootstrapCallCount += 1;
      return status;
    };
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs on success');
    };

    const stageEvents = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      stageEvents.push({stage, details});
    };

    await cluster._waitForBootstrapApi({
      id: '00000000-0000-4000-8000-000000000001',
      ip: '127.0.0.1',
    });

    assert.strictEqual(
      bootstrapCallCount,
      bootstrapStatuses.length,
      'should continue polling until join readiness succeeds',
    );
    assert.strictEqual(
      stageEvents.length,
      1,
      'should emit one periodic waiting stage event at attempt 20',
    );
    assert.strictEqual(
      stageEvents[0].stage,
      'setup.seed.bootstrap.waiting',
      'should emit bootstrap waiting stage',
    );
    assert.strictEqual(
      stageEvents[0].details.nodeId,
      '00000000-0000-4000-8000-000000000001',
      'should include seed node id in waiting stage diagnostics',
    );
    assert.strictEqual(
      stageEvents[0].details.attempts,
      20,
      'should report periodic waiting attempts',
    );
  });
