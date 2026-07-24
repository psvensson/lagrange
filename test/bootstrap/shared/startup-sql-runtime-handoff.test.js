import {describe, it} from 'node:test';
import assert from 'node:assert';
import {CDCIntegrationSetup} from '../../../src/bootstrap/shared/cdc-integration-setup.js';
import {
  attachSqlRuntimeToStartupOwner,
} from '../../../src/bootstrap/shared/startup-sql-runtime-handoff.js';
import {SQLQueryEngine} from '../../../src/query/sql-query-engine.js';

const JOIN_BOOTSTRAP_SYSTEM_TABLE_SNAPSHOTS = Object.freeze({
  partitions: Object.freeze([
    Object.freeze({
      partition_id: 'sql_transactions-p1',
      table_name: 'sql_transactions',
      leader_node_id: 'seed-node',
    }),
  ]),
  services: Object.freeze([
    Object.freeze({
      service_id: 'sql_transactions-p1-r1',
      partition_id: 'sql_transactions-p1',
      service_type: 'partition',
      node_id: 'seed-node',
      status: 'active',
      address: 'seed-node/partition/sql_transactions-p1-r1',
    }),
  ]),
});

describe('startup-sql-runtime-handoff', () => {
  it('rebinds runtime access policy ownership to the final engine', () => {
    const runtimeAccessPolicyOwner = {
      async getRuntimePolicy() {
        return {status: 'resolved'};
      },
    };
    let attachedOwner = null;
    const sqlQueryEngine = {
      setRuntimeAccessPolicyOwner(owner) {
        attachedOwner = owner;
      },
    };

    attachSqlRuntimeToStartupOwner({
      owner: {
        systemMetadataOwners: {runtimeAccessPolicyOwner},
      },
      sqlQueryEngine,
      systemTableCache: {},
    });

    assert.strictEqual(attachedOwner, runtimeAccessPolicyOwner);
  });

  it('rebinds the exact lifecycle owner and catalog gateway to the final engine',
    async () => {
      const systemTableCache = {
        filter: () => [],
        get: () => null,
        getAll: () => [],
      };
      const gatewayBindings = [];
      const gateway = {
        sqlQueryEngine: null,
        setSqlQueryEngine(sqlQueryEngine) {
          this.sqlQueryEngine = sqlQueryEngine;
          gatewayBindings.push(sqlQueryEngine);
        },
      };
      const ownerCalls = [];
      let finalEngine = null;
      const commandOwner = {
        catalogOwner: {getGateway: () => gateway},
        async execute(command, payload, securityContext) {
          ownerCalls.push({command, payload, securityContext});
          return {
            changes: 0,
            operation: command,
            rowCount: 1,
            rows: [{usesFinalGateway: gateway.sqlQueryEngine === finalEngine}],
            success: true,
          };
        },
      };
      const owner = {serviceLifecycleCommandOwner: commandOwner};
      const provisionalEngine = new SQLQueryEngine({
        autoStartDistributedTransactionRecovery: false,
        messageRouter: {deliver: async () => ({success: true})},
        systemCache: systemTableCache,
      });
      provisionalEngine.setServiceLifecycleCommandOwner(commandOwner);
      gateway.setSqlQueryEngine(provisionalEngine);
      finalEngine = new SQLQueryEngine({
        autoStartDistributedTransactionRecovery: false,
        messageRouter: {deliver: async () => ({success: true})},
        systemCache: systemTableCache,
      });

      attachSqlRuntimeToStartupOwner({
        owner,
        sqlQueryEngine: finalEngine,
        systemTableCache,
      });
      attachSqlRuntimeToStartupOwner({
        owner,
        sqlQueryEngine: finalEngine,
        systemTableCache,
      });
      await provisionalEngine.shutdown();
      const securityContext = Object.freeze({
        principal: 'phase-one-operator',
        roles: Object.freeze(['service-operator']),
        tenantId: 'tenant-phase-one',
      });
      const result = await finalEngine.tryExecuteServiceLifecycleSql(
        'SHOW SERVICES',
        [],
        {securityContext, sessionId: 'handoff-session'},
      );

      assert.equal(result.result.success, true);
      assert.deepEqual(result.result.rows, [{usesFinalGateway: true}]);
      assert.equal(ownerCalls.length, 1);
      assert.equal(ownerCalls[0].securityContext, securityContext);
      assert.deepEqual(
        gatewayBindings,
        [provisionalEngine, finalEngine, finalEngine],
      );
      assert.equal(gateway.sqlQueryEngine, finalEngine);
      assert.equal(
        finalEngine.serviceLifecycleCommandOwnerBinding.owner,
        commandOwner,
      );
      await finalEngine.shutdown();
    });

  it('does not synthesize a fallback lifecycle owner during handoff',
    async () => {
      const systemTableCache = {
        filter: () => [],
        get: () => null,
        getAll: () => [],
      };
      const finalEngine = new SQLQueryEngine({
        autoStartDistributedTransactionRecovery: false,
        messageRouter: {deliver: async () => ({success: true})},
        systemCache: systemTableCache,
      });

      attachSqlRuntimeToStartupOwner({
        owner: {},
        sqlQueryEngine: finalEngine,
        systemTableCache,
      });
      const result = await finalEngine.tryExecuteServiceLifecycleSql(
        'SHOW SERVICES',
        [],
        {
          securityContext: {
            principal: 'phase-one-operator',
            roles: ['service-operator'],
            tenantId: 'tenant-phase-one',
          },
          sessionId: 'missing-owner-session',
        },
      );
      assert.equal(
        result.result.errorCode,
        'service_lifecycle_command_owner_unavailable',
      );
    });

  it('upgrades the canonical startup owner CDC path and re-arms deferred recovery after runtime handoff',
    () => {
      const systemTableCache = {
        get() {
          return null;
        },
        has() {
          return false;
        },
        filter() {
          return [];
        },
        onCacheChange() {},
        offCacheChange() {},
      };
      const messageRouter = {
        register() {},
        send: async () => {},
      };
      const cdcIntegrationService = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'seed-node',
        messageRouter,
      });
      let capturedProvider = null;
      cdcIntegrationService.setPartitionServicesProvider = (provider) => {
        capturedProvider = provider;
      };

      let recovered = 0;
      let attachedCdcService = null;
      const sqlQueryEngine = {
        setCDCIntegrationService(service) {
          attachedCdcService = service;
        },
        activateDistributedTransactionRecovery() {
          recovered += 1;
        },
      };

      const owner = {
        cdcIntegrationService,
        hasActiveControlPlaneBackgroundWriters() {
          return true;
        },
        activateDistributedTransactionRecovery() {
          return this.sqlQueryEngine.activateDistributedTransactionRecovery();
        },
      };
      const partitionServicesProvider = () => new Map();

      attachSqlRuntimeToStartupOwner({
        owner,
        sqlQueryEngine,
        systemTableCache,
        cacheMutationTarget: systemTableCache,
        messageRouter,
        partitionServicesProvider,
      });

      assert.strictEqual(owner.sqlQueryEngine, sqlQueryEngine);
      assert.strictEqual(cdcIntegrationService.sqlQueryEngine, sqlQueryEngine);
      assert.strictEqual(cdcIntegrationService.systemTableCache, systemTableCache);
      assert.strictEqual(attachedCdcService, cdcIntegrationService);
      assert.strictEqual(capturedProvider, partitionServicesProvider);
      assert.strictEqual(recovered, 1);
    });

  it('does not start deferred recovery before steady-state control-plane writers are active',
    () => {
      const systemTableCache = {
        get() {
          return null;
        },
        has() {
          return false;
        },
        filter() {
          return [];
        },
        onCacheChange() {},
        offCacheChange() {},
      };
      const cdcIntegrationService = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'seed-node',
      });

      let recovered = 0;
      const sqlQueryEngine = {
        setCDCIntegrationService() {},
        activateDistributedTransactionRecovery() {
          recovered += 1;
        },
      };
      const owner = {
        cdcIntegrationService,
        hasActiveControlPlaneBackgroundWriters() {
          return false;
        },
        activateDistributedTransactionRecovery() {
          return this.sqlQueryEngine.activateDistributedTransactionRecovery();
        },
      };

      attachSqlRuntimeToStartupOwner({
        owner,
        sqlQueryEngine,
        systemTableCache,
      });

      assert.strictEqual(recovered, 0);
      assert.strictEqual(owner.sqlQueryEngine, sqlQueryEngine);
      assert.strictEqual(cdcIntegrationService.sqlQueryEngine, sqlQueryEngine);
    });

  it('syncs rebalance owner dependencies to the final runtime SQL engine',
    () => {
      const systemTableCache = {
        get() {
          return null;
        },
        has() {
          return false;
        },
        filter() {
          return [];
        },
        onCacheChange() {},
        offCacheChange() {},
      };
      const messageRouter = {register() {}};
      const cdcIntegrationService = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'joining-node',
        messageRouter,
      });
      const sqlQueryEngine = {
        setCDCIntegrationService() {},
      };
      const tablePolicyService = {};
      let coordinatorSync = null;
      let partitionSync = null;
      const rebalanceCoordinator = {
        syncOwnerDependencies(options) {
          coordinatorSync = options;
        },
      };
      const partitionRebalanceCoordinator = {
        syncOwnerDependencies(options) {
          partitionSync = options;
        },
      };
      const partitionService = {
        rebalanceCoordinator: partitionRebalanceCoordinator,
      };
      const owner = {
        cdcIntegrationService,
        rebalanceCoordinator,
        tablePolicyService,
        partitionServices: new Map([
          ['replica-1', partitionService],
        ]),
      };

      attachSqlRuntimeToStartupOwner({
        owner,
        sqlQueryEngine,
        systemTableCache,
        messageRouter,
      });

      assert.strictEqual(coordinatorSync.sqlQueryEngine, sqlQueryEngine);
      assert.strictEqual(coordinatorSync.cdcIntegrationService, cdcIntegrationService);
      assert.strictEqual(coordinatorSync.systemTableCache, systemTableCache);
      assert.strictEqual(coordinatorSync.messageRouter, messageRouter);
      assert.strictEqual(coordinatorSync.tablePolicyService, tablePolicyService);
      assert.strictEqual(partitionService.sqlQueryEngine, sqlQueryEngine);
      assert.strictEqual(partitionSync.sqlQueryEngine, sqlQueryEngine);
      assert.strictEqual(partitionSync.cdcIntegrationService, cdcIntegrationService);
    });

  it('seeds bootstrap leader routing bridges onto the final runtime engine during handoff',
    () => {
      const bootstrapTopologySnapshotOwner = {
        ownerId: 'bootstrap-topology-snapshot-owner',
      };
      let seededSnapshots = null;
      let attachedOwner = null;
      const sqlQueryEngine = {
        queryExecutor: {
          setBootstrapTopologySnapshotOwner(owner) {
            attachedOwner = owner;
          },
        },
        seedBootstrapRoutingOverlayFromSnapshots(systemTableSnapshots) {
          seededSnapshots = systemTableSnapshots;
        },
      };
      const owner = {
        bootstrapTopologySnapshotOwner,
        bootstrapResponse: {
          systemTableSnapshots: JOIN_BOOTSTRAP_SYSTEM_TABLE_SNAPSHOTS,
        },
      };

      attachSqlRuntimeToStartupOwner({
        owner,
        sqlQueryEngine,
        systemTableCache: null,
      });

      assert.strictEqual(owner.sqlQueryEngine, sqlQueryEngine);
      assert.strictEqual(attachedOwner, bootstrapTopologySnapshotOwner);
      assert.strictEqual(
        seededSnapshots,
        JOIN_BOOTSTRAP_SYSTEM_TABLE_SNAPSHOTS,
      );
    });

  it('attaches bootstrap topology owner from the owner getter when no direct property exists',
    () => {
      const bootstrapTopologySnapshotOwner = {
        ownerId: 'bootstrap-topology-snapshot-owner-via-getter',
      };
      let attachedOwner = null;
      const sqlQueryEngine = {
        queryExecutor: {
          setBootstrapTopologySnapshotOwner(owner) {
            attachedOwner = owner;
          },
        },
      };
      const owner = {
        getBootstrapTopologySnapshotOwner() {
          return bootstrapTopologySnapshotOwner;
        },
      };

      attachSqlRuntimeToStartupOwner({
        owner,
        sqlQueryEngine,
        systemTableCache: null,
      });

      assert.strictEqual(owner.sqlQueryEngine, sqlQueryEngine);
      assert.strictEqual(attachedOwner, bootstrapTopologySnapshotOwner);
    });
});
