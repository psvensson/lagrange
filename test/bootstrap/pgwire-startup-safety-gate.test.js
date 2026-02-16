/**
 * Tests for PgWireStartupSafetyGate.
 *
 * Verifies:
 * 1. PG wire startup is gated behind control-plane readiness
 * 2. PG wire startup failure does not deadlock bootstrap
 * 3. PG wire startup failure does not deadlock join
 * 4. Startup ordering is correct (control plane first, then PG wire)
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert';
import {
  PgWireStartupSafetyGate,
} from '../../src/bootstrap/pgwire-startup-safety-gate.js';
import {
  PGWIRE_SAFETY_GATE_ERROR_MSG,
} from '../../src/bootstrap/pgwire-startup-safety-gate-constants.js';

describe('PgWireStartupSafetyGate', () => {
  let mockServiceLifecycleManager;
  let mockSystemTableCache;
  let mockHeartbeatService;

  beforeEach(() => {
    mockServiceLifecycleManager = {
      createReplica: async () => ({}),
      startReplica: async () => ({}),
      stopReplica: async () => ({}),
      getReplicaState: () => 'running',
    };

    mockSystemTableCache = {
      get: () => null,
      filter: () => [],
    };

    mockHeartbeatService = {
      start: () => {},
      sendHeartbeat: async () => ({}),
    };
  });

  describe('checkControlPlaneReady()', () => {
    it('should return not ready when serviceLifecycleManager is missing',
      () => {
        const gate = new PgWireStartupSafetyGate({
          nodeId: 'test-node',
          systemTableCache: mockSystemTableCache,
          heartbeatService: mockHeartbeatService,
        });

        const result = gate.checkControlPlaneReady();

        assert.strictEqual(result.ready, false);
        assert.strictEqual(
          result.reason,
          PGWIRE_SAFETY_GATE_ERROR_MSG.LIFECYCLE_MANAGER_MISSING,
        );
      });

    it('should return not ready when systemTableCache is missing',
      () => {
        const gate = new PgWireStartupSafetyGate({
          nodeId: 'test-node',
          serviceLifecycleManager: mockServiceLifecycleManager,
          heartbeatService: mockHeartbeatService,
        });

        const result = gate.checkControlPlaneReady();

        assert.strictEqual(result.ready, false);
        assert.strictEqual(
          result.reason,
          PGWIRE_SAFETY_GATE_ERROR_MSG.SYSTEM_CACHE_MISSING,
        );
      });

    it('should return not ready when heartbeatService is missing',
      () => {
        const gate = new PgWireStartupSafetyGate({
          nodeId: 'test-node',
          serviceLifecycleManager: mockServiceLifecycleManager,
          systemTableCache: mockSystemTableCache,
        });

        const result = gate.checkControlPlaneReady();

        assert.strictEqual(result.ready, false);
        assert.strictEqual(
          result.reason,
          PGWIRE_SAFETY_GATE_ERROR_MSG.CONTROL_PLANE_NOT_READY,
        );
      });

    it('should return ready when all prerequisites are met', () => {
      const gate = new PgWireStartupSafetyGate({
        nodeId: 'test-node',
        serviceLifecycleManager: mockServiceLifecycleManager,
        systemTableCache: mockSystemTableCache,
        heartbeatService: mockHeartbeatService,
      });

      const result = gate.checkControlPlaneReady();

      assert.strictEqual(result.ready, true);
      assert.strictEqual(result.reason, null);
    });
  });

  describe('guardedSetup()', () => {
    it('should return null when control plane is not ready', () => {
      const gate = new PgWireStartupSafetyGate({
        nodeId: 'test-node',
      });

      let setupCalled = false;
      const result = gate.guardedSetup(() => {
        setupCalled = true;
        return {runtimeServiceHandler: {}};
      });

      assert.strictEqual(result, null);
      assert.strictEqual(setupCalled, false,
        'setup function should not be called when gate blocks');
    });

    it('should call setup function when control plane is ready',
      () => {
        const gate = new PgWireStartupSafetyGate({
          nodeId: 'test-node',
          serviceLifecycleManager: mockServiceLifecycleManager,
          systemTableCache: mockSystemTableCache,
          heartbeatService: mockHeartbeatService,
        });

        let setupCalled = false;
        const mockHandler = {runtimeServiceHandler: {id: 'test'}};
        const result = gate.guardedSetup(() => {
          setupCalled = true;
          return mockHandler;
        });

        assert.strictEqual(setupCalled, true);
        assert.deepStrictEqual(result, mockHandler);
      });

    it('should isolate setup failure and return null', () => {
      const gate = new PgWireStartupSafetyGate({
        nodeId: 'test-node',
        serviceLifecycleManager: mockServiceLifecycleManager,
        systemTableCache: mockSystemTableCache,
        heartbeatService: mockHeartbeatService,
      });

      const result = gate.guardedSetup(() => {
        throw new Error('PG wire bind failed on port 5432');
      });

      assert.strictEqual(result, null,
        'should return null on setup failure');
    });

    it('should not throw when setup function throws', () => {
      const gate = new PgWireStartupSafetyGate({
        nodeId: 'test-node',
        serviceLifecycleManager: mockServiceLifecycleManager,
        systemTableCache: mockSystemTableCache,
        heartbeatService: mockHeartbeatService,
      });

      assert.doesNotThrow(() => {
        gate.guardedSetup(() => {
          throw new Error('TCP listener failed');
        });
      });
    });
  });

  describe('bootstrap safety (Req 11.1, 11.4)', () => {
    it('should not deadlock bootstrap when PG wire setup fails',
      () => {
        const gate = new PgWireStartupSafetyGate({
          nodeId: 'seed-node',
          serviceLifecycleManager: mockServiceLifecycleManager,
          systemTableCache: mockSystemTableCache,
          heartbeatService: mockHeartbeatService,
        });

        // Simulate bootstrap flow: control plane ready, PG wire fails
        const readiness = gate.checkControlPlaneReady();
        assert.strictEqual(readiness.ready, true);

        const result = gate.guardedSetup(() => {
          throw new Error('Port 5432 already in use');
        });

        // Bootstrap continues — result is null but no exception
        assert.strictEqual(result, null);
      });

    it('should block PG wire before control plane is initialized',
      () => {
        // Simulate early bootstrap: no heartbeat service yet
        const gate = new PgWireStartupSafetyGate({
          nodeId: 'seed-node',
          serviceLifecycleManager: mockServiceLifecycleManager,
          systemTableCache: mockSystemTableCache,
          heartbeatService: null,
        });

        let setupCalled = false;
        const result = gate.guardedSetup(() => {
          setupCalled = true;
          return {runtimeServiceHandler: {}};
        });

        assert.strictEqual(result, null);
        assert.strictEqual(setupCalled, false,
          'PG wire setup must not run before control plane');
      });
  });

  describe('join safety (Req 11.2, 11.3, 11.4)', () => {
    it('should not deadlock join when PG wire setup fails', () => {
      const gate = new PgWireStartupSafetyGate({
        nodeId: 'joining-node',
        serviceLifecycleManager: mockServiceLifecycleManager,
        systemTableCache: mockSystemTableCache,
        heartbeatService: mockHeartbeatService,
      });

      const result = gate.guardedSetup(() => {
        throw new Error('Runtime module prepare() failed');
      });

      assert.strictEqual(result, null);
    });

    it('should gate PG wire behind join control-plane readiness',
      () => {
        // Simulate join flow before control plane init
        const gate = new PgWireStartupSafetyGate({
          nodeId: 'joining-node',
          serviceLifecycleManager: null,
          systemTableCache: mockSystemTableCache,
          heartbeatService: null,
        });

        const readiness = gate.checkControlPlaneReady();
        assert.strictEqual(readiness.ready, false);

        let setupCalled = false;
        gate.guardedSetup(() => {
          setupCalled = true;
          return {};
        });

        assert.strictEqual(setupCalled, false);
      });
  });

  describe('startup ordering (Req 11.1, 11.2)', () => {
    it('should enforce control plane before PG wire ordering',
      () => {
        const executionOrder = [];

        // Step 1: Control plane init (simulated)
        executionOrder.push('control_plane_init');

        // Step 2: PG wire gate check
        const gate = new PgWireStartupSafetyGate({
          nodeId: 'test-node',
          serviceLifecycleManager: mockServiceLifecycleManager,
          systemTableCache: mockSystemTableCache,
          heartbeatService: mockHeartbeatService,
        });

        gate.guardedSetup(() => {
          executionOrder.push('pgwire_setup');
          return {runtimeServiceHandler: {}};
        });

        assert.deepStrictEqual(
          executionOrder,
          ['control_plane_init', 'pgwire_setup'],
        );
      });

    it('should skip PG wire when called before control plane',
      () => {
        const executionOrder = [];

        // PG wire gate check BEFORE control plane
        const gate = new PgWireStartupSafetyGate({
          nodeId: 'test-node',
          serviceLifecycleManager: null,
          systemTableCache: null,
          heartbeatService: null,
        });

        gate.guardedSetup(() => {
          executionOrder.push('pgwire_setup');
          return {runtimeServiceHandler: {}};
        });

        // Control plane init happens later
        executionOrder.push('control_plane_init');

        assert.deepStrictEqual(
          executionOrder,
          ['control_plane_init'],
          'PG wire setup must not execute before control plane',
        );
      });
  });
});
