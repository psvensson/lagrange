import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  createBootstrapServiceSeedDelegateMethods,
} from '../../../src/bootstrap/bootstrap-service-seed-delegates.js';
import {
  NodeJoiningReplicaDescriptorCoordination,
} from '../../../src/bootstrap/node-joining-replica-descriptor-coordination.js';
import {
  attachServiceInstallationReconcilerOwner,
  detachServiceInstallationReconcilerOwner,
} from '../../../src/bootstrap/shared/service-installation-reconciler-setup.js';
import {
  attachSqlRuntimeToStartupOwner,
} from '../../../src/bootstrap/shared/startup-sql-runtime-handoff.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';

function catalogOwner() {
  const gateway = {
    bindings: [],
    setSqlQueryEngine(engine) {
      this.bindings.push(engine);
    },
  };
  return {
    gateway,
    getGateway: () => gateway,
    listInstallations: async () => [],
    getRevision: async () => null,
    getPackage: async () => null,
    getFailure: async () => null,
    recordFailure: async () => null,
    recordRolloutOutcome: async () => null,
  };
}

function partitionService(partitionId, isLeader = false) {
  return {
    partitionId,
    isLeader,
    assignments: [],
    setRebalancerLeadershipSink(sink) {
      this.assignments.push(sink);
      this.sink = sink;
      if (sink) sink.setLeader(this.isLeader);
    },
  };
}

describe('service installation reconciler production setup', () => {
  it('binds only to service_installations-p1 and detaches its leadership sink',
    async () => {
      const catalog = catalogOwner();
      const decoy = partitionService('service_definitions-p1', true);
      const authoritative = partitionService('service_installations-p1', false);
      const handle = attachServiceInstallationReconcilerOwner({
        catalogOwner: catalog,
        partitionServices: new Map([
          ['decoy-r1', decoy],
          ['installations-r1', authoritative],
        ]),
      });

      assert.strictEqual(handle.owner.catalogOwner, catalog);
      assert.equal(decoy.assignments.length, 0);
      assert.strictEqual(authoritative.assignments[0], handle.owner);
      assert.strictEqual(handle.partitionService, authoritative);

      handle.detach();
      assert.strictEqual(authoritative.assignments.at(-1), null);
      assert.equal(handle.owner.isShutdown(), true);
    });

  it('retries missing partition wiring on the injected clock and cleans both timers',
    async () => {
      const timeSource = new VirtualTimeSource();
      const services = new Map();
      const handle = attachServiceInstallationReconcilerOwner({
        catalogOwner: catalogOwner(),
        partitionServices: services,
        timeSource,
        sinkWiringRetryIntervalMs: 50,
        sweepIntervalMs: 100,
        logger: {error() {}, warn() {}, info() {}},
      });
      assert.equal(handle.partitionService, null);
      assert.equal(timeSource.pendingTimerCount(), 1);

      const authoritative = partitionService('service_installations-p1', true);
      services.set('installations-r1', authoritative);
      timeSource.advance(50);
      await Promise.resolve();
      await handle.owner.whenIdle();
      assert.strictEqual(handle.partitionService, authoritative);
      assert.strictEqual(authoritative.sink, handle.owner);

      handle.detach();
      assert.equal(timeSource.pendingTimerCount(), 0);
      assert.strictEqual(authoritative.sink, null);
    });

  it('attaches the exact retained catalog after final SQL handoff exactly once',
    async () => {
      const catalog = catalogOwner();
      const authoritative = partitionService('service_installations-p1', false);
      const commandOwner = {catalogOwner: catalog};
      const sqlQueryEngine = {
        setServiceLifecycleCommandOwner(owner) {
          this.commandOwner = owner;
        },
      };
      const owner = {
        serviceLifecycleCommandOwner: commandOwner,
        partitionServices: new Map([['installations-r1', authoritative]]),
        serviceInstallationReconcilerOwnerHandle: null,
      };

      attachSqlRuntimeToStartupOwner({owner, sqlQueryEngine, systemTableCache: {}});
      const firstHandle = owner.serviceInstallationReconcilerOwnerHandle;
      attachSqlRuntimeToStartupOwner({owner, sqlQueryEngine, systemTableCache: {}});

      assert.ok(firstHandle);
      assert.strictEqual(owner.serviceInstallationReconcilerOwnerHandle,
        firstHandle);
      assert.strictEqual(firstHandle.owner.catalogOwner, catalog);
      assert.strictEqual(authoritative.sink, firstHandle.owner);
      assert.equal(authoritative.assignments.filter(Boolean).length, 1);
      assert.deepEqual(catalog.gateway.bindings, [sqlQueryEngine, sqlQueryEngine]);
      assert.strictEqual(sqlQueryEngine.commandOwner, commandOwner);

      detachServiceInstallationReconcilerOwner(owner);
      assert.strictEqual(owner.serviceInstallationReconcilerOwnerHandle, null);
      assert.strictEqual(authoritative.sink, null);
    });

  it('does not synthesize reconciliation from an incomplete handoff owner', () => {
    const incompleteCatalog = {
      getGateway() {
        return {setSqlQueryEngine() {}};
      },
    };
    const owner = {
      serviceLifecycleCommandOwner: {catalogOwner: incompleteCatalog},
      partitionServices: new Map(),
    };

    attachSqlRuntimeToStartupOwner({
      owner,
      sqlQueryEngine: {},
      systemTableCache: {},
    });

    assert.equal(owner.serviceInstallationReconcilerOwnerHandle, undefined);
  });

  it('detaches the retained owner through the production seed cleanup delegate',
    () => {
      const calls = [];
      const service = {
        seedInfrastructurePhase: {
          stopUnifiedLifecycleOwners() {
            calls.push('legacy-owners');
          },
        },
        serviceInstallationReconcilerOwnerHandle: {
          detach() {
            calls.push('installation-owner');
          },
        },
      };
      Object.assign(service, createBootstrapServiceSeedDelegateMethods());

      service._buildCleanupDelegates().stopUnifiedLifecycleOwners();

      assert.deepEqual(calls, ['installation-owner', 'legacy-owners']);
      assert.strictEqual(
        service.serviceInstallationReconcilerOwnerHandle,
        null,
      );
    });

  it('detaches the retained owner through the production join cleanup method',
    () => {
      const calls = [];
      const service = {
        startupServiceLifecycleOwner: {
          stopOwners() {
            calls.push('legacy-owners');
          },
        },
        serviceInstallationReconcilerOwnerHandle: {
          detach() {
            calls.push('installation-owner');
          },
        },
      };

      NodeJoiningReplicaDescriptorCoordination.prototype
        .stopJoiningLifecycleOwners.call(service);

      assert.deepEqual(calls, ['installation-owner', 'legacy-owners']);
      assert.strictEqual(
        service.serviceInstallationReconcilerOwnerHandle,
        null,
      );
    });
});
