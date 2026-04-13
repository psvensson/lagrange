// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  EndpointSyncReconcilerError,
  buildEndpointSliceManifest,
  buildManagedLabels,
  buildServiceManifest,
  collectStaleManagedResourceNames,
  isManagedResource,
  reconcilePlannedExports,
  validateReconcileOptions,
} from '../../src/runtime/endpoint-sync-k8s-reconciler.js';
import {
  ENDPOINT_SYNC_LABEL,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
} from '../../src/runtime/endpoint-sync-constants.js';

function createPlannedExport(overrides = {}) {
  return {
    serviceKey: 'sys-postgres-wire|postgresql',
    logicalServiceName: 'sys-postgres-wire',
    protocol: 'postgresql',
    serviceName: 'edge-sys-postgres-wire-postgresql',
    port: 5432,
    endpointCount: 1,
    endpoints: [
      {
        endpointId: 'ep-1',
        nodeId: 'node-a',
        address: '10.0.0.2',
        healthStatus: 'healthy',
      },
    ],
    slicePlans: [
      {
        addressType: 'IPv4',
        endpoints: [
          {
            endpointId: 'ep-1',
            nodeId: 'node-a',
            address: '10.0.0.2',
            healthStatus: 'healthy',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function createManagedResource(name) {
  return {
    metadata: {
      name,
      labels: {
        [ENDPOINT_SYNC_LABEL.MANAGED_KEY]: ENDPOINT_SYNC_LABEL.MANAGED_VALUE,
        [ENDPOINT_SYNC_LABEL.SOURCE_KEY]: ENDPOINT_SYNC_LABEL.SOURCE_VALUE,
      },
    },
  };
}

class FakeK8sClient {
  constructor() {
    this.upsertedServices = [];
    this.upsertedEndpointSlices = [];
    this.deletedServices = [];
    this.deletedEndpointSlices = [];
    this.services = [];
    this.endpointSlices = [];
    this.failServiceNames = new Set();
    this.failEndpointSliceNames = new Set();
  }

  async upsertService(manifest) {
    if (this.failServiceNames.has(manifest?.metadata?.name)) {
      throw new Error(`service upsert failed: ${manifest.metadata.name}`);
    }
    this.upsertedServices.push(manifest);
  }

  async upsertEndpointSlice(manifest) {
    if (this.failEndpointSliceNames.has(manifest?.metadata?.name)) {
      throw new Error(`slice upsert failed: ${manifest.metadata.name}`);
    }
    this.upsertedEndpointSlices.push(manifest);
  }

  async listServices(_namespace) {
    return this.services;
  }

  async listEndpointSlices(_namespace) {
    return this.endpointSlices;
  }

  async deleteService(namespace, name) {
    this.deletedServices.push({namespace, name});
  }

  async deleteEndpointSlice(namespace, name) {
    this.deletedEndpointSlices.push({namespace, name});
  }
}

describe('endpoint-sync-k8s-reconciler', () => {
  describe('buildManagedLabels', () => {
    it('builds canonical managed labels', () => {
      const labels = buildManagedLabels('svc-a|postgresql');
      assert.equal(labels[ENDPOINT_SYNC_LABEL.MANAGED_KEY], 'true');
      assert.equal(labels[ENDPOINT_SYNC_LABEL.SOURCE_KEY], 'service_endpoints');
      assert.equal(labels[ENDPOINT_SYNC_LABEL.SERVICE_KEY], 'svc-a|postgresql');
    });
  });

  describe('buildServiceManifest', () => {
    it('builds selector-less Service manifest', () => {
      const manifest = buildServiceManifest(createPlannedExport(), 'edge');
      assert.equal(manifest.kind, 'Service');
      assert.equal(manifest.metadata.namespace, 'edge');
      assert.equal(manifest.spec.ports[0].port, 5432);
      assert.equal(manifest.spec.selector, undefined);
    });
  });

  describe('buildEndpointSliceManifest', () => {
    it('maps endpoint readiness for not_ready policy', () => {
      const plannedExport = createPlannedExport({
        slicePlans: [
          {
            addressType: 'IPv4',
            endpoints: [
              {
                endpointId: 'ep-1',
                nodeId: 'node-a',
                address: '10.0.0.2',
                healthStatus: 'unhealthy',
              },
            ],
          },
        ],
      });

      const manifest = buildEndpointSliceManifest(
        plannedExport,
        plannedExport.slicePlans[0],
        0,
        'edge',
        ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY,
      );

      assert.equal(manifest.kind, 'EndpointSlice');
      assert.equal(manifest.addressType, 'IPv4');
      assert.equal(manifest.endpoints[0].conditions.ready, false);
      assert.equal(
        manifest.metadata.labels['kubernetes.io/service-name'],
        plannedExport.serviceName,
      );
    });
  });

  describe('isManagedResource', () => {
    it('returns true only for managed source-labeled resources', () => {
      assert.equal(isManagedResource(createManagedResource('x')), true);
      assert.equal(isManagedResource({metadata: {labels: {}}}), false);
      assert.equal(isManagedResource({}), false);
    });
  });

  describe('collectStaleManagedResourceNames', () => {
    it('returns only stale managed resource names', () => {
      const existing = [
        createManagedResource('keep-a'),
        createManagedResource('drop-a'),
        {metadata: {name: 'external-a', labels: {}}},
      ];

      const stale = collectStaleManagedResourceNames(
        existing,
        new Set(['keep-a']),
      );

      assert.deepEqual(stale, ['drop-a']);
    });
  });

  describe('validateReconcileOptions', () => {
    it('throws when required options are missing', () => {
      assert.throws(
        () => validateReconcileOptions(null),
        (error) => error instanceof EndpointSyncReconcilerError,
      );
    });
  });

  describe('reconcilePlannedExports', () => {
    it('upserts desired resources and deletes stale managed resources', async () => {
      const client = new FakeK8sClient();
      client.services = [
        createManagedResource('edge-sys-postgres-wire-postgresql'),
        createManagedResource('stale-service'),
      ];
      client.endpointSlices = [
        createManagedResource('edge-sys-postgres-wire-postgresql-0'),
        createManagedResource('stale-slice-0'),
      ];

      const summary = await reconcilePlannedExports({
        k8sClient: client,
        namespace: 'edge',
        plannedExports: [createPlannedExport()],
        unhealthyPolicy: ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE,
      });

      assert.equal(summary.desiredServices, 1);
      assert.equal(summary.desiredEndpointSlices, 1);
      assert.equal(summary.upsertedServices, 1);
      assert.equal(summary.upsertedEndpointSlices, 1);
      assert.equal(summary.exportedEndpoints, 1);
      assert.equal(summary.deletedServices, 1);
      assert.equal(summary.deletedEndpointSlices, 1);
      assert.equal(summary.groupFailures.length, 0);

      assert.equal(client.upsertedServices.length, 1);
      assert.equal(client.upsertedEndpointSlices.length, 1);
      assert.deepEqual(client.deletedServices, [
        {namespace: 'edge', name: 'stale-service'},
      ]);
      assert.deepEqual(client.deletedEndpointSlices, [
        {namespace: 'edge', name: 'stale-slice-0'},
      ]);
    });

    it('continues reconciling other groups when one group upsert fails', async () => {
      const client = new FakeK8sClient();
      const failingExport = createPlannedExport({
        serviceKey: 'svc-fail|postgresql',
        logicalServiceName: 'svc-fail',
        serviceName: 'edge-svc-fail-postgresql',
      });
      const healthyExport = createPlannedExport({
        serviceKey: 'svc-ok|postgresql',
        logicalServiceName: 'svc-ok',
        serviceName: 'edge-svc-ok-postgresql',
      });
      client.failServiceNames.add('edge-svc-fail-postgresql');

      const summary = await reconcilePlannedExports({
        k8sClient: client,
        namespace: 'edge',
        plannedExports: [failingExport, healthyExport],
        unhealthyPolicy: ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE,
      });

      assert.equal(summary.desiredServices, 2);
      assert.equal(summary.upsertedServices, 1);
      assert.equal(summary.upsertedEndpointSlices, 1);
      assert.equal(summary.exportedEndpoints, 1);
      assert.equal(summary.groupFailures.length, 1);
      assert.equal(summary.groupFailures[0].serviceKey, 'svc-fail|postgresql');
      assert.equal(summary.groupFailures[0].stage, 'service');

      assert.equal(client.upsertedServices.length, 1);
      assert.equal(client.upsertedServices[0].metadata.name, 'edge-svc-ok-postgresql');
      assert.equal(client.upsertedEndpointSlices.length, 1);
    });
  });
});
