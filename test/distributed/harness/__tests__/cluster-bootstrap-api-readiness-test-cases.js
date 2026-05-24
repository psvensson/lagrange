import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {createCluster} from './cluster-test-helpers.js';

export function registerClusterBootstrapApiReadinessTests() {
  test('Unit: _isNodeActive matches active status case-insensitively',
    async () => {
      const cluster = createCluster({
        size: 1,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });

      assert.strictEqual(
        cluster._isNodeActive({rows: [{status: 'active'}]}),
        true,
        'lowercase active should be treated as active',
      );
      assert.strictEqual(
        cluster._isNodeActive({rows: [{status: 'ACTIVE'}]}),
        true,
        'uppercase active should be treated as active',
      );
      assert.strictEqual(
        cluster._isNodeActive({status: 'active'}),
        true,
        'top-level lowercase active should be treated as active',
      );
      assert.strictEqual(
        cluster._isNodeActive({rows: [{status: 'ready'}]}),
        false,
        'non-active status should remain false',
      );
    });

  test('Unit: _waitForBootstrapApi succeeds after transient non-2xx statuses',
    async () => {
      const cluster = createCluster({
        size: 1,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
        timeouts: {nodeStartup: 200, bootstrapReadyStableWindowMs: 0},
      });

      const bootstrapStatuses = [503, -1, 200];
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

      await cluster._waitForBootstrapApi({
        id: '00000000-0000-4000-8000-000000000001',
        ip: '127.0.0.1',
      });
      assert.strictEqual(
        bootstrapCallCount,
        bootstrapStatuses.length,
        'should poll until bootstrap API returns a join-ready 2xx response',
      );
    });

  test('Unit: _waitForBootstrapApi waits for bootstrap join readiness probe',
    async () => {
      const cluster = createCluster({
        size: 1,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
        timeouts: {nodeStartup: 200, bootstrapReadyStableWindowMs: 0},
      });

      const bootstrapStatuses = [503, 503, 200];
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

      await cluster._waitForBootstrapApi({
        id: '00000000-0000-4000-8000-000000000001',
        ip: '127.0.0.1',
      });
      assert.strictEqual(
        bootstrapCallCount,
        bootstrapStatuses.length,
        'should wait for bootstrap probe success readiness',
      );
    });

  test('Unit: _waitForBootstrapApi probes lightweight bootstrap readiness endpoint',
    async () => {
      const cluster = createCluster({
        size: 1,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
        timeouts: {nodeStartup: 200, bootstrapReadyStableWindowMs: 0},
      });

      const probeCalls = [];
      cluster._httpRequest = async (request) => {
        probeCalls.push(request);
        return {
          status: 200,
          body: {
            ready: true,
            scope: 'bootstrap_join',
          },
        };
      };
      cluster._sleep = async () => {};
      cluster._collectFailureLogs = async () => {
        throw new Error('should not collect failure logs on success');
      };

      await cluster._waitForBootstrapApi({
        id: '00000000-0000-4000-8000-000000000001',
        ip: '127.0.0.1',
      });

      assert.strictEqual(
        probeCalls.length,
        1,
        'startup gate should probe readiness endpoint exactly once on immediate success',
      );
      assert.strictEqual(
        probeCalls[0].method,
        'GET',
        'startup gate should use GET readiness probe',
      );
      assert.ok(
        probeCalls[0].url.endsWith('/bootstrap/ready'),
        'startup gate should target lightweight /bootstrap/ready endpoint',
      );
    });

  test('Unit: _waitForBootstrapApi returns on first bootstrap-ready success',
    async () => {
      const cluster = createCluster({
        size: 1,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
        timeouts: {
          nodeStartup: 200,
          bootstrapReadyStableWindowMs: 2000,
        },
      });

      const bootstrapStatuses = [503, 200, 503, 503];
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
      cluster._collectFailureLogs = async () => {
        throw new Error('should not collect failure logs on success');
      };

      await cluster._waitForBootstrapApi({
        id: '00000000-0000-4000-8000-000000000001',
        ip: '127.0.0.1',
      });

      assert.ok(
        bootstrapCallCount === 2,
        'should stop probing after the first bootstrap-ready success',
      );
    });

  test('Unit: _waitForBootstrapApi extends past startup timeout while progress advances',
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
            phase: 'INIT',
            reasons: ['BOOTSTRAP_PHASE_INCOMPLETE'],
          },
        },
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
          status: 503,
          body: {
            ready: false,
            phase: 'JOIN_READY',
            phaseRank: 2,
            reasons: ['READINESS_STABLE_WINDOW_PENDING'],
            stableWindowMs: 10,
            stableElapsedMs: 5,
          },
        },
        {
          status: 200,
          body: {
            ready: true,
            phase: 'JOIN_READY',
            phaseRank: 2,
            reasons: [],
          },
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
        throw new Error('should not collect failure logs on success');
      };

      try {
        await cluster._waitForBootstrapApi({
          id: '00000000-0000-4000-8000-000000000001',
          ip: '127.0.0.1',
        });
      } finally {
        Date.now = originalDateNow;
      }

      assert.ok(
        bootstrapCallCount >= 4,
        'should keep probing past the base startup timeout while readiness advances',
      );
    });
}
