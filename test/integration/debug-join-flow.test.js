/**
 * Debug test to understand where the join flow hangs.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {URL} from 'url';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getUniquePort,
  waitFor,
  TEST_CONFIG,
} from './helpers/cluster-test-helpers.js';
import {SERVICE_TYPE, TABLES, NUM} from '../../src/constants/index.js';
import {BOOTSTRAP_EVENT} from '../../src/bootstrap/bootstrap-constants.js';

const HTTP_METHOD = Object.freeze({
  POST: 'POST',
});

const HTTP_STATUS_RANGE = Object.freeze({
  SUCCESS_MIN: 200,
  SUCCESS_MAX: 300,
});

function createInProcHttpPost(seedApi) {
  return async (url, body) => {
    const {pathname} = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: HTTP_METHOD.POST,
      url: pathname,
      payload: body,
    });
    if (res.statusCode < HTTP_STATUS_RANGE.SUCCESS_MIN ||
        res.statusCode >= HTTP_STATUS_RANGE.SUCCESS_MAX) {
      throw new Error(`HTTP ${res.statusCode}: ${res.payload}`);
    }
    return res.json();
  };
}

test('Debug join flow', {timeout: 20000}, async (t) => {
  initializeTestEnvironment();

  const seedNodeId = '550e8400-e29b-41d4-a716-446655440099';
  const seedWsPort = getUniquePort();

  console.log('DEBUG: Starting seed node bootstrap on port', seedWsPort);

  const bootstrapService = new BootstrapService({
    nodeId: seedNodeId,
    nodeAddress: `ws://localhost:${seedWsPort}`,
    wsPort: seedWsPort,
    config: TEST_CONFIG.bootstrap,
  });

  let bootstrapResult;
  let seedApi;
  let joiningService;
  const phases = [];

  try {
    bootstrapResult = await bootstrapService.bootstrap();
    console.log('DEBUG: Seed bootstrap result:', bootstrapResult.success);
    t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

    // Start Bootstrap API
    seedApi = new BootstrapAPI({
      seedNodeId,
      seedNodeAddress: `ws://localhost:${seedWsPort}`,
      seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      systemTableCache: NodeService.getInstance().getSystemTableCache(),
      messageRouter: bootstrapResult.messageRouter,
      epochManager: bootstrapResult.epochManager,
      bootstrapService: bootstrapService,
    });

    await seedApi.initialize(0, {listen: false});
    const systemCache = NodeService.getInstance().getSystemTableCache();
    const sqlQueryEngine = new SQLQueryEngine({
      systemCache: systemCache,
      messageRouter: bootstrapResult.messageRouter,
      nodeId: seedNodeId,
    });
    seedApi.setSqlQueryEngine(sqlQueryEngine);
    const httpPost = createInProcHttpPost(seedApi);

    console.log('DEBUG: Seed API initialized');

    // Debug: Print services in cache
    const services = systemCache.getAll(TABLES.SERVICES) || [];
    console.log('DEBUG: Services in cache:', services.length);
    const debugPartitionIds = ['nodes-p1', 'services-p1', 'replica_operations-p1', 'node_endpoints-p1'];
    for (const partitionId of debugPartitionIds) {
      const partitionServices = services.filter((s) =>
        s.partition_id === partitionId && s.service_type === SERVICE_TYPE.PARTITION);
      console.log(`DEBUG: ${partitionId} services count:`, partitionServices.length);
      for (const svc of partitionServices) {
        console.log(
          `DEBUG: ${partitionId} service:`,
          svc.service_id,
          svc.address,
          svc.raft_role,
          svc.status,
        );
      }
    }

    // Debug: Check if partition services are registered with message router
    const registeredHandlers = bootstrapResult.messageRouter.getRegisteredAddresses?.() || [];
    console.log('DEBUG: Registered handlers count:', registeredHandlers.length);
    const partitionPathSegment = '/partition/';
    const partitionHandlers = registeredHandlers.filter((a) => a.includes(partitionPathSegment));
    console.log('DEBUG: Partition handlers:', partitionHandlers.slice(NUM.ZERO, 5));

    // Test a simple query to nodes table before joining
    console.log('DEBUG: Testing SELECT * FROM nodes...');
    const testResult = await sqlQueryEngine.executeQuery('SELECT * FROM nodes');
    console.log('DEBUG: Test query result:', testResult.success, testResult.rows?.length);

    // Check if CDC integration service has proper SQL query engine
    const cdcService = bootstrapService.cdcIntegrationService;
    console.log('DEBUG: CDC service exists:', !!cdcService);
    console.log('DEBUG: CDC SQL engine exists:', !!cdcService?.sqlQueryEngine);
    console.log('DEBUG: CDC SQL engine has cache:',
      !!cdcService?.sqlQueryEngine?.systemCache);
    console.log('DEBUG: CDC SQL engine has router:',
      !!cdcService?.sqlQueryEngine?.messageRouter);

    // Test INSERT via CDC integration service
    console.log('DEBUG: Testing INSERT via CDC...');
    // Note: Skipping actual INSERT to avoid creating fake nodes that the joining
    // service would try to connect to
    console.log('DEBUG: Skipping CDC INSERT test to avoid fake node creation');

    // Create joining service
    const joiningNodeId = '550e8400-e29b-41d4-a716-446655440098';
    const joiningWsPort = getUniquePort();

    console.log('DEBUG: Creating joining service on port', joiningWsPort);

    joiningService = new NodeJoiningService({
      nodeId: joiningNodeId,
      nodeAddress: `ws://localhost:${joiningWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
      wsPort: joiningWsPort,
      config: {
        httpTimeoutMs: 5000,
        leadershipWaitTimeoutMs: 10000,
        leadershipWaitInitialDelayMs: 5,
        leadershipWaitMaxDelayMs: 50,
        replicaStaggerDelayMs: 20,
        joinRegistrationMaxAttempts: 1,
      },
      httpPost,
    });

    // Add event listeners to track progress
    joiningService.on(BOOTSTRAP_EVENT.PHASE_START, (data) => {
      phases.push(data.phase);
      console.log('DEBUG: Phase started:', data.phase);
    });
    joiningService.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (data) => {
      console.log('DEBUG: Phase completed:', data.phase, 'duration:', data.duration);
    });
    joiningService.on(BOOTSTRAP_EVENT.PHASE_FAILED, (data) => {
      console.log('DEBUG: Phase failed:', data.phase, 'error:', data.error);
    });

    console.log('DEBUG: Starting join...');
    const joinPromise = joiningService.join().catch((error) => ({
      success: false,
      error: error.message,
    }));
    const reachedQueryingState = await waitFor(() => {
      return phases.includes('querying_state');
    }, 5000);
    t.equal(reachedQueryingState, true, 'join should reach querying_state');

    const joinResult = await Promise.race([
      joinPromise,
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: false,
            error: 'join did not finish within debug budget',
          });
        }, 1000);
      }),
    ]);
    console.log('DEBUG: Join result:', joinResult.success, joinResult.error);

    t.equal(joinResult.success, true,
      'debug harness should complete the repaired registration flow');

    const joinedNodesResult = await sqlQueryEngine.executeQuery(
      'SELECT * FROM nodes',
    );
    const joinedNodeRecord = Array.isArray(joinedNodesResult.rows) ?
      joinedNodesResult.rows.find((row) => row.node_id === joiningNodeId) :
      null;

    t.equal(joinedNodesResult.success, true,
      'seed query should succeed after the join completes');
    t.ok(
      joinedNodeRecord,
      'joined node should be visible from the seed nodes view after registration',
    );
  } catch (error) {
    console.log('DEBUG: Error during test:', error.message);
    console.log('DEBUG: Error stack:', error.stack);
    throw error;
  } finally {
    console.log('DEBUG: Cleanup starting');
    if (joiningService) {
      await joiningService.cleanup().catch(() => {});
    }
    if (seedApi) {
      await seedApi.shutdown().catch(() => {});
    }
    if (bootstrapService && bootstrapService.shutdown) {
      await bootstrapService.shutdown().catch(() => {});
    }
    if (bootstrapResult?.messageRouter) {
      await bootstrapResult.messageRouter.shutdown().catch(() => {});
    }
    await cleanupTestEnvironment();
    console.log('DEBUG: Cleanup complete');
  }
});
