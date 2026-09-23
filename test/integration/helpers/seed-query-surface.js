// The SQL surface of a bootstrapped in-process seed.
//
// A seed test bootstraps through production construction, then needs the
// seed's query engine and its BootstrapAPI (initialized without listening)
// wired together over the node's system table cache. This is that wiring,
// shared by the seed tests that make it; each test still owns its bootstrap,
// its assertions and its shutdown.

import {BootstrapAPI} from '../../../src/bootstrap/bootstrap-api.js';
import {NodeService} from '../../../src/node/node-service.js';
import {SQLQueryEngine} from '../../../src/query/sql-query-engine.js';

/**
 * Build the seed's query engine and BootstrapAPI. The API is returned before
 * it starts, so the caller can hand it to its shutdown path first.
 * @param {Object} bootstrapService - The seed's BootstrapService.
 * @param {Object} bootstrapResult - What its bootstrap() returned.
 * @param {{seedNodeId: string, seedWsPort: number}} seed - The seed identity.
 * @return {{systemTableCache: Object, sqlQueryEngine: SQLQueryEngine,
 *   seedApi: BootstrapAPI, start: Function}} The surface and its start.
 */
export function createSeedQuerySurface(bootstrapService, bootstrapResult,
  {seedNodeId, seedWsPort}) {
  const seedAddress = `ws://localhost:${seedWsPort}`;
  const systemTableCache = NodeService.getInstance().getSystemTableCache();
  const sqlQueryEngine = new SQLQueryEngine({
    systemCache: systemTableCache,
    messageRouter: bootstrapResult.messageRouter,
    cdcIntegrationService: bootstrapService.cdcIntegrationService,
    nodeId: seedNodeId,
    rebalanceCoordinator: bootstrapService.rebalanceCoordinator,
  });
  const seedApi = new BootstrapAPI({
    seedNodeId,
    seedNodeAddress: seedAddress,
    seedNodeWsAddress: seedAddress,
    messageGroupServices: bootstrapResult.messageGroupServices,
    partitionServices: bootstrapResult.partitionServices,
    systemTableCache,
    messageRouter: bootstrapResult.messageRouter,
    epochManager: bootstrapResult.epochManager,
    bootstrapService,
  });
  return {
    systemTableCache,
    sqlQueryEngine,
    seedApi,
    // Initialize the API without listening, then give it the query engine.
    start: async () => {
      await seedApi.initialize(0, {listen: false});
      seedApi.setSqlQueryEngine(sqlQueryEngine);
    },
  };
}
