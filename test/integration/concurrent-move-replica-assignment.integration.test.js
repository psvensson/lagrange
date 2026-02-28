import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  cleanupTestEnvironment,
  getUniquePort,
  gracefulShutdown,
  initializeTestEnvironment,
  TEST_CONFIG,
} from './helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 120000;
const NODE_ONE_ID = '550e8400-e29b-41d4-a716-446655440231';
const NODE_TWO_ID = '550e8400-e29b-41d4-a716-446655440232';

test('concurrent MOVE_REPLICA bootstrap assignments are unique', {
  timeout: TEST_TIMEOUT_MS,
}, async (t) => {
  initializeTestEnvironment();
  t.teardown(async () => {
    await cleanupTestEnvironment();
  });

  const seedNodeId = '550e8400-e29b-41d4-a716-446655440230';
  const seedWsPort = getUniquePort();
  const bootstrapService = new BootstrapService({
    nodeId: seedNodeId,
    nodeAddress: `ws://localhost:${seedWsPort}`,
    wsPort: seedWsPort,
    config: TEST_CONFIG.bootstrap,
  });

  let bootstrapResult = null;
  let seedApi = null;
  try {
    bootstrapResult = await bootstrapService.bootstrap();
    t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

    seedApi = new BootstrapAPI({
      seedNodeId,
      seedNodeAddress: `ws://localhost:${seedWsPort}`,
      seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      systemTableCache: NodeService.getInstance().getSystemTableCache(),
      messageRouter: bootstrapResult.messageRouter,
      epochManager: bootstrapResult.epochManager,
      bootstrapService,
    });
    await seedApi.initialize(0, {listen: false});

    const seedQueryEngine = new SQLQueryEngine({
      systemCache: NodeService.getInstance().getSystemTableCache(),
      messageRouter: bootstrapResult.messageRouter,
      nodeId: seedNodeId,
    });
    seedApi.setSqlQueryEngine(seedQueryEngine);

    const [responseOne, responseTwo] = await Promise.all([
      seedApi.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: NODE_ONE_ID,
          nodeAddress: 'ws://localhost:19231',
        },
      }),
      seedApi.getFastify().inject({
        method: 'POST',
        url: '/bootstrap',
        payload: {
          nodeId: NODE_TWO_ID,
          nodeAddress: 'ws://localhost:19232',
        },
      }),
    ]);

    t.equal(responseOne.statusCode, 200, 'first bootstrap request should succeed');
    t.equal(responseTwo.statusCode, 200, 'second bootstrap request should succeed');

    const bodyOne = responseOne.json();
    const bodyTwo = responseTwo.json();

    t.equal(
      bodyOne.messageGroupAssignment?.strategy,
      'MOVE_REPLICA',
      'first join should use MOVE_REPLICA',
    );
    t.equal(
      bodyTwo.messageGroupAssignment?.strategy,
      'MOVE_REPLICA',
      'second join should use MOVE_REPLICA',
    );
    t.ok(
      bodyOne.messageGroupAssignment?.replicaToMove,
      'first assignment should include replicaToMove',
    );
    t.ok(
      bodyTwo.messageGroupAssignment?.replicaToMove,
      'second assignment should include replicaToMove',
    );

    t.not(
      bodyOne.messageGroupAssignment?.replicaToMove,
      bodyTwo.messageGroupAssignment?.replicaToMove,
      'concurrent joiners must receive unique MOVE_REPLICA assignments',
    );
  } finally {
    await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
  }
});
