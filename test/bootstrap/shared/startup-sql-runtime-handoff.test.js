import {describe, it} from 'node:test';
import assert from 'node:assert';
import {CDCIntegrationSetup} from '../../../src/bootstrap/shared/cdc-integration-setup.js';
import {
  attachSqlRuntimeToStartupOwner,
} from '../../../src/bootstrap/shared/startup-sql-runtime-handoff.js';

describe('startup-sql-runtime-handoff', () => {
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
});
