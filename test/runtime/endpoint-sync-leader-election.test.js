import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  ENDPOINT_SYNC_LEASE,
} from '../../src/runtime/endpoint-sync-constants.js';
import {
  EndpointSyncLeaderElectorError,
  EndpointSyncLeaseLeaderElector,
} from '../../src/runtime/endpoint-sync-leader-election.js';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeLeaseClient {
  constructor(initialLease = null) {
    this.lease = initialLease ? deepClone(initialLease) : null;
    this.getLeaseCalls = [];
    this.createLeaseCalls = [];
    this.updateLeaseCalls = [];
    this._resourceVersion = 1;
  }

  async getLease(namespace, name) {
    this.getLeaseCalls.push({namespace, name});
    return this.lease ? deepClone(this.lease) : null;
  }

  async createLease(manifest) {
    this.createLeaseCalls.push(deepClone(manifest));
    this._resourceVersion += 1;
    this.lease = {
      ...deepClone(manifest),
      metadata: {
        ...manifest.metadata,
        resourceVersion: String(this._resourceVersion),
      },
    };
  }

  async updateLease(manifest) {
    this.updateLeaseCalls.push(deepClone(manifest));
    this._resourceVersion += 1;
    this.lease = {
      ...deepClone(manifest),
      metadata: {
        ...manifest.metadata,
        resourceVersion: String(this._resourceVersion),
      },
    };
  }
}

function createLease({
  namespace = 'edge',
  name = 'endpoint-sync-controller',
  holderIdentity = 'controller-a',
  acquireTime = '2025-01-01T00:00:00.000Z',
  renewTime = '2025-01-01T00:00:00.000Z',
  leaseDurationSeconds = 15,
  leaseTransitions = 0,
  resourceVersion = '3',
} = {}) {
  return {
    apiVersion: ENDPOINT_SYNC_LEASE.API_VERSION,
    kind: ENDPOINT_SYNC_LEASE.KIND,
    metadata: {
      namespace,
      name,
      resourceVersion,
    },
    spec: {
      holderIdentity,
      acquireTime,
      renewTime,
      leaseDurationSeconds,
      leaseTransitions,
    },
  };
}

describe('endpoint-sync-leader-election', () => {
  it('throws when client methods are missing', () => {
    assert.throws(
      () => new EndpointSyncLeaseLeaderElector({
        k8sClient: {},
        namespace: 'edge',
        leaseName: 'endpoint-sync-controller',
      }),
      (error) => error instanceof EndpointSyncLeaderElectorError,
    );
  });

  it('acquires leadership by creating a lease when none exists', async () => {
    const nowMs = Date.parse('2025-01-01T00:00:15.000Z');
    const client = new FakeLeaseClient(null);
    const elector = new EndpointSyncLeaseLeaderElector({
      k8sClient: client,
      namespace: 'edge',
      leaseName: 'endpoint-sync-controller',
      holderIdentity: 'controller-a',
      nowProvider: () => nowMs,
    });

    const result = await elector.tryAcquireLeadership();

    assert.equal(result.isLeader, true);
    assert.equal(result.holderIdentity, 'controller-a');
    assert.equal(result.observedHolderIdentity, null);
    assert.equal(client.createLeaseCalls.length, 1);
    assert.equal(client.updateLeaseCalls.length, 0);
  });

  it('renews lease when already leader', async () => {
    const nowMs = Date.parse('2025-01-01T00:00:20.000Z');
    const existingLease = createLease({
      holderIdentity: 'controller-a',
      acquireTime: '2025-01-01T00:00:10.000Z',
      renewTime: '2025-01-01T00:00:15.000Z',
      leaseTransitions: 2,
    });
    const client = new FakeLeaseClient(existingLease);
    const elector = new EndpointSyncLeaseLeaderElector({
      k8sClient: client,
      namespace: 'edge',
      leaseName: 'endpoint-sync-controller',
      holderIdentity: 'controller-a',
      nowProvider: () => nowMs,
    });

    const result = await elector.tryAcquireLeadership();

    assert.equal(result.isLeader, true);
    assert.equal(client.createLeaseCalls.length, 0);
    assert.equal(client.updateLeaseCalls.length, 1);
    assert.equal(
      client.updateLeaseCalls[0].spec.acquireTime,
      '2025-01-01T00:00:10.000Z',
    );
    assert.equal(client.updateLeaseCalls[0].spec.leaseTransitions, 2);
  });

  it('returns follower state when another holder has a non-expired lease', async () => {
    const nowMs = Date.parse('2025-01-01T00:00:20.000Z');
    const existingLease = createLease({
      holderIdentity: 'controller-a',
      renewTime: '2025-01-01T00:00:15.000Z',
      leaseDurationSeconds: 30,
    });
    const client = new FakeLeaseClient(existingLease);
    const elector = new EndpointSyncLeaseLeaderElector({
      k8sClient: client,
      namespace: 'edge',
      leaseName: 'endpoint-sync-controller',
      holderIdentity: 'controller-b',
      nowProvider: () => nowMs,
    });

    const result = await elector.tryAcquireLeadership();

    assert.equal(result.isLeader, false);
    assert.equal(result.observedHolderIdentity, 'controller-a');
    assert.equal(client.createLeaseCalls.length, 0);
    assert.equal(client.updateLeaseCalls.length, 0);
  });

  it('takes over lease after expiration', async () => {
    const nowMs = Date.parse('2025-01-01T00:01:00.000Z');
    const existingLease = createLease({
      holderIdentity: 'controller-a',
      renewTime: '2025-01-01T00:00:10.000Z',
      leaseDurationSeconds: 15,
      leaseTransitions: 4,
    });
    const client = new FakeLeaseClient(existingLease);
    const elector = new EndpointSyncLeaseLeaderElector({
      k8sClient: client,
      namespace: 'edge',
      leaseName: 'endpoint-sync-controller',
      holderIdentity: 'controller-b',
      nowProvider: () => nowMs,
    });

    const result = await elector.tryAcquireLeadership();

    assert.equal(result.isLeader, true);
    assert.equal(result.observedHolderIdentity, 'controller-a');
    assert.equal(client.updateLeaseCalls.length, 1);
    assert.equal(client.updateLeaseCalls[0].spec.holderIdentity, 'controller-b');
    assert.equal(client.updateLeaseCalls[0].spec.leaseTransitions, 5);
  });
});
