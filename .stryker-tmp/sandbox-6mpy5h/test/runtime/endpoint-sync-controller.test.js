// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  ENDPOINT_SYNC_CONTROLLER_ERROR,
  EndpointSyncController,
  EndpointSyncControllerError,
} from '../../src/runtime/endpoint-sync-controller.js';
import {
  ENDPOINT_SYNC_EVENT_REASON,
  ENDPOINT_SYNC_LOG,
  ENDPOINT_SYNC_METRIC,
} from '../../src/runtime/endpoint-sync-constants.js';

function createConfig(overrides = {}) {
  return {
    adminStreamUrl: 'ws://127.0.0.1:8081/api/admin/stream',
    protocolAllowlist: ['postgresql'],
    serviceIdAllowlist: [],
    healthyOnly: true,
    strictPortMode: true,
    unhealthyPolicy: 'exclude',
    maxEndpointsPerSlice: 100,
    serviceNamePrefix: 'edge',
    targetNamespace: 'edge',
    metricsEnabled: true,
    ...overrides,
  };
}

function createSourceRows() {
  return [
    {
      endpointId: 'ep-1',
      serviceId: 'sys-postgres-wire',
      logicalServiceName: 'sys-postgres-wire',
      nodeId: 'node-a',
      protocol: 'postgresql',
      address: '10.0.0.2',
      port: 5432,
      healthStatus: 'healthy',
      metadata: {},
      updatedAt: 10,
      serviceKey: 'sys-postgres-wire|postgresql',
    },
  ];
}

function createConflictAndFailureRows() {
  return [
    {
      endpointId: 'ep-1',
      serviceId: 'svc-conflict',
      logicalServiceName: 'svc-conflict',
      nodeId: 'node-a',
      protocol: 'postgresql',
      address: '10.0.0.2',
      port: 5432,
      healthStatus: 'healthy',
      metadata: {},
      updatedAt: 10,
      serviceKey: 'svc-conflict|postgresql',
    },
    {
      endpointId: 'ep-2',
      serviceId: 'svc-conflict',
      logicalServiceName: 'svc-conflict',
      nodeId: 'node-b',
      protocol: 'postgresql',
      address: '10.0.0.3',
      port: 6432,
      healthStatus: 'healthy',
      metadata: {},
      updatedAt: 11,
      serviceKey: 'svc-conflict|postgresql',
    },
    {
      endpointId: 'ep-3',
      serviceId: 'svc-fail',
      logicalServiceName: 'svc-fail',
      nodeId: 'node-c',
      protocol: 'postgresql',
      address: '10.0.0.4',
      port: 5432,
      healthStatus: 'healthy',
      metadata: {},
      updatedAt: 12,
      serviceKey: 'svc-fail|postgresql',
    },
  ];
}

class FakeSourceClient {
  constructor(rows) {
    this.rows = rows;
    this.calls = [];
  }

  async fetchEndpointRows(config) {
    this.calls.push(config);
    return this.rows;
  }
}

class FakeK8sClient {
  constructor() {
    this.services = [];
    this.endpointSlices = [];
    this.upsertServiceCalls = [];
    this.upsertEndpointSliceCalls = [];
    this.recordEventCalls = [];
    this.failServiceNames = new Set();
  }

  async upsertService(manifest) {
    if (this.failServiceNames.has(manifest?.metadata?.name)) {
      throw new Error(`service upsert failed: ${manifest.metadata.name}`);
    }
    this.upsertServiceCalls.push(manifest);
  }

  async upsertEndpointSlice(manifest) {
    this.upsertEndpointSliceCalls.push(manifest);
  }

  async listServices(_namespace) {
    return this.services;
  }

  async listEndpointSlices(_namespace) {
    return this.endpointSlices;
  }

  async deleteService(_namespace, _name) {
    // no-op
  }

  async deleteEndpointSlice(_namespace, _name) {
    // no-op
  }

  async recordEvent(event) {
    this.recordEventCalls.push(event);
  }

  async getLease(_namespace, _name) {
    return null;
  }

  async createLease(_manifest) {
    // no-op
  }

  async updateLease(_manifest) {
    // no-op
  }
}

function createFakeLogger() {
  const calls = {
    info: [],
    warn: [],
    error: [],
  };
  return {
    calls,
    info(message, payload) {
      calls.info.push({message, payload});
    },
    warn(message, payload) {
      calls.warn.push({message, payload});
    },
    error(message, payload) {
      calls.error.push({message, payload});
    },
  };
}

describe('endpoint-sync-controller', () => {
  it('throws when source client is missing', () => {
    assert.throws(
      () => new EndpointSyncController({
        k8sClient: {},
        config: createConfig(),
      }),
      (error) => {
        assert.ok(error instanceof EndpointSyncControllerError);
        assert.equal(
          error.message,
          ENDPOINT_SYNC_CONTROLLER_ERROR.SOURCE_CLIENT_REQUIRED,
        );
        return true;
      },
    );
  });

  it('throws when namespace cannot be resolved', () => {
    assert.throws(
      () => new EndpointSyncController({
        sourceClient: new FakeSourceClient([]),
        k8sClient: {},
        config: createConfig({targetNamespace: ''}),
      }),
      (error) => {
        assert.ok(error instanceof EndpointSyncControllerError);
        assert.equal(
          error.message,
          ENDPOINT_SYNC_CONTROLLER_ERROR.NAMESPACE_REQUIRED,
        );
        return true;
      },
    );
  });

  it('runs one end-to-end convergence cycle', async () => {
    const sourceClient = new FakeSourceClient(createSourceRows());
    const k8sClient = new FakeK8sClient();

    const controller = new EndpointSyncController({
      sourceClient,
      k8sClient,
      config: createConfig(),
    });

    const summary = await controller.runOnce();

    assert.equal(summary.sourceRowCount, 1);
    assert.equal(summary.filteredRowCount, 1);
    assert.equal(summary.plannedExportCount, 1);
    assert.equal(summary.conflictCount, 0);
    assert.equal(summary.reconcileSummary.desiredServices, 1);
    assert.equal(summary.reconcileSummary.upsertedServices, 1);
    assert.equal(summary.reconcileSummary.upsertedEndpointSlices, 1);
    assert.equal(summary.reconcileSummary.exportedEndpoints, 1);

    assert.equal(sourceClient.calls.length, 1);
    assert.equal(k8sClient.upsertServiceCalls.length, 1);
    assert.equal(k8sClient.upsertEndpointSliceCalls.length, 1);
  });

  it('skips source reads and k8s writes when running as follower', async () => {
    const sourceClient = new FakeSourceClient(createSourceRows());
    const k8sClient = new FakeK8sClient();

    const controller = new EndpointSyncController({
      sourceClient,
      k8sClient,
      config: createConfig({leaderElectionEnabled: true}),
      leaderElector: {
        async tryAcquireLeadership() {
          return {
            isLeader: false,
            holderIdentity: 'controller-b',
            observedHolderIdentity: 'controller-a',
            leaseName: 'endpoint-sync-controller',
            leaseNamespace: 'edge',
          };
        },
      },
    });

    const summary = await controller.runOnce();

    assert.equal(summary.skippedAsFollower, true);
    assert.equal(summary.sourceRowCount, 0);
    assert.equal(summary.filteredRowCount, 0);
    assert.equal(summary.plannedExportCount, 0);
    assert.equal(summary.reconcileSummary.upsertedServices, 0);
    assert.equal(sourceClient.calls.length, 0);
    assert.equal(k8sClient.upsertServiceCalls.length, 0);
    assert.equal(k8sClient.upsertEndpointSliceCalls.length, 0);
  });

  it('emits group diagnostics and updates metrics on conflicts/failures', async () => {
    const sourceClient = new FakeSourceClient(createConflictAndFailureRows());
    const k8sClient = new FakeK8sClient();
    k8sClient.failServiceNames.add('edge-svc-fail-postgresql');
    const logger = createFakeLogger();

    const controller = new EndpointSyncController({
      sourceClient,
      k8sClient,
      config: createConfig(),
      logger,
    });

    const summary = await controller.runOnce();
    const metrics = controller.getMetricsSnapshot();

    assert.equal(summary.conflictCount, 1);
    assert.equal(summary.reconcileSummary.groupFailures.length, 1);
    assert.equal(summary.reconcileSummary.groupFailures[0].serviceKey, 'svc-fail|postgresql');

    assert.equal(k8sClient.recordEventCalls.length, 2);
    assert.deepEqual(
      k8sClient.recordEventCalls.map((event) => event.reason).sort(),
      [
        ENDPOINT_SYNC_EVENT_REASON.PORT_CONFLICT,
        ENDPOINT_SYNC_EVENT_REASON.RECONCILE_FAILED,
      ],
    );

    assert.ok(
      logger.calls.warn.some((entry) => entry.message === ENDPOINT_SYNC_LOG.GROUP_FAILURE),
    );
    assert.ok(
      logger.calls.error.some((entry) => entry.message === ENDPOINT_SYNC_LOG.GROUP_FAILURE),
    );

    assert.equal(metrics[ENDPOINT_SYNC_METRIC.EXPORTED_SERVICES], 0);
    assert.equal(metrics[ENDPOINT_SYNC_METRIC.EXPORTED_ENDPOINTS], 0);
    assert.equal(metrics[ENDPOINT_SYNC_METRIC.PORT_CONFLICT_TOTAL], 1);
    assert.equal(metrics[ENDPOINT_SYNC_METRIC.RECONCILE_FAILURES_TOTAL], 1);
    assert.ok(metrics[ENDPOINT_SYNC_METRIC.RECONCILE_DURATION_MS] >= 0);
  });
});
