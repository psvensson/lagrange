// The real SQLQueryEngine passes its system-table contract.
//
// One node, booted the production way (BootstrapService), the engine built
// exactly as the seven-node probe builds it. This is the "real-there" leg the
// derived harness model points at for the `sql-engine-cache-membership` pair;
// the seam's run is test/distributed/harness/__tests__/sql-engine-seam-conformance.test.js.

import {test} from 'node:test';

import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {registerSqlEngineSystemTableContract} from '../query/sql-engine-system-table-contract-cases.js';
import {
  TEST_CONFIG,
  cleanupTestEnvironment,
  getUniquePort,
  gracefulShutdown,
  initializeTestEnvironment,
} from './helpers/cluster-test-helpers.js';

const SEED_NODE_ID = 'contract-seed';

registerSqlEngineSystemTableContract(test, {
  name: 'real',
  async open() {
    initializeTestEnvironment({nodeId: SEED_NODE_ID});
    const wsPort = getUniquePort();
    const bootstrapService = new BootstrapService({
      nodeId: SEED_NODE_ID,
      nodeAddress: `ws://localhost:${wsPort}`,
      wsPort,
      config: TEST_CONFIG.bootstrap,
    });
    const bootstrapResult = await bootstrapService.bootstrap();
    if (!bootstrapResult.success) {
      throw new Error(`seed bootstrap failed: ${JSON.stringify(bootstrapResult.error || null)}`);
    }
    const engine = new SQLQueryEngine({
      systemCache: NodeService.getInstance().getSystemTableCache(),
      messageRouter: bootstrapResult.messageRouter,
      nodeId: SEED_NODE_ID,
    });
    return {
      engine,
      owner: bootstrapService.cdcIntegrationService,
      async close() {
        // The probe's own teardown: the booted node's sockets and timers go
        // down before the environment is reset, or the process never exits.
        await gracefulShutdown(bootstrapService, bootstrapResult, null);
        await cleanupTestEnvironment();
      },
    };
  },
});
