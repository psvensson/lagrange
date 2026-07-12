/**
 * Fresh join via non-seed node integration test.
 *
 * Quest: fresh-join-multi-peer-contact — forms a small cluster (seed + one
 * joined node), then fresh-joins a third node whose candidate contact list
 * is [unreachable-address, second-node-address] and proves the join
 * completes through the second (non-seed) node: ContactSeedPhase rotates
 * off the dead first candidate onto the live non-seed candidate.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {NodeService} from '../../src/node/node-service.js';
import {NODE_STATE, NUM} from '../../src/constants/index.js';
import {
  hydrateBootstrapApiRuntime,
  resolveSystemCacheHandles,
} from '../../src/entrypoint-runtime-helpers.js';
import {
  TEST_CONFIG,
  cleanupTestEnvironment,
  createInProcHttpPost,
  getUniquePort,
  gracefulJoiningShutdown,
  gracefulShutdown,
  initializeTestEnvironment,
} from '../integration/helpers/cluster-test-helpers.js';

const TEST_TIMEOUT_MS = 60000;
const SEED_NODE_ID = '550e8400-e29b-41d4-a716-446655440701';
const NODE_B_ID = '550e8400-e29b-41d4-a716-446655440702';
const NODE_C_ID = '550e8400-e29b-41d4-a716-446655440703';
const UNREACHABLE_ADDRESS = 'http://unreachable.invalid:1';
const TRANSPORT_REFUSED_CODE = 'ECONNREFUSED';
const TRANSPORT_REFUSED_MESSAGE = 'connect ECONNREFUSED (injected)';
const MIN_LOCAL_MESSAGE_GROUPS = 1;
const JOINING_CONFIG = Object.freeze({
  httpTimeoutMs: NUM.FIVE_THOUSAND,
  leadershipWaitTimeoutMs: 12000,
  leadershipWaitInitialDelayMs: NUM.TEN,
  leadershipWaitMaxDelayMs: NUM.HUNDRED,
  replicaStaggerDelayMs: 20,
});

function getLifecycleState(joinResult) {
  return joinResult.lifecycleStateMachine?.getState?.() || null;
}

/**
 * Expose a joined node's BootstrapAPI the way the entrypoint does for
 * joining nodes (src/index.js joiner path), hydrated post-join.
 *
 * @param {Object} joiningService - The joined NodeJoiningService.
 * @param {Object} joinResult - Its successful join() result.
 * @param {Object} identity - {nodeId, nodeAddress, wsPort}.
 * @return {Promise<Object>} Initialized, hydrated BootstrapAPI.
 */
async function exposeJoinerBootstrapApi(joiningService, joinResult, identity) {
  const bootstrapApi = new BootstrapAPI({
    seedNodeId: identity.nodeId,
    seedNodeAddress: identity.nodeAddress,
    seedNodeWsAddress: identity.nodeAddress,
    wsPort: identity.wsPort,
    messageGroupServices: joiningService.messageGroupServices,
    partitionServices: joiningService.partitionServices,
    replicaHandler: joiningService.replicaHandler,
    systemTableCache: null,
    bootstrapStartupAdapter: joiningService,
    bootstrapService: null,
    epochManager: joiningService.epochManager,
    messageRouter: joiningService.messageRouter,
  });
  await bootstrapApi.initialize(0, {listen: false});

  const cacheHandles =
    resolveSystemCacheHandles(joinResult.messageGroupServices);
  const systemTableCache = cacheHandles.systemTableCache ||
    joiningService.cdcIntegrationService?.systemTableCache;
  hydrateBootstrapApiRuntime({
    bootstrapAPI: bootstrapApi,
    systemTableCache,
    messageGroupServices: joinResult.messageGroupServices,
    partitionServices: joinResult.partitionServices,
    replicaHandler: joinResult.replicaHandler,
    epochManager: joiningService.epochManager,
    messageRouter: joinResult.messageRouter,
    startupRecoveryCoordinator:
      joiningService.rebalanceCoordinator?.startupRecoveryCoordinator ||
      null,
  });
  bootstrapApi.setSqlQueryEngine(new SQLQueryEngine({
    systemCache: systemTableCache,
    messageRouter: joinResult.messageRouter,
    nodeId: identity.nodeId,
  }));
  return bootstrapApi;
}

test('fresh join completes through a non-seed node when the first candidate is down', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  initializeTestEnvironment({
    rebalancer: {
      periodicCheckIntervalMs: 600000,
      periodicCheckJitterMs: NUM.HUNDRED,
      stabilizationPeriodMs: 10000,
    },
  });

  const seedWsPort = getUniquePort();
  const seedAddress = `ws://localhost:${seedWsPort}`;
  const bootstrapService = new BootstrapService({
    nodeId: SEED_NODE_ID,
    nodeAddress: seedAddress,
    wsPort: seedWsPort,
    config: TEST_CONFIG.bootstrap,
  });

  let bootstrapResult = null;
  let seedApi = null;
  let nodeBApi = null;
  const joiningServices = [];

  try {
    bootstrapResult = await bootstrapService.bootstrap();
    t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    t.ok(systemTableCache, 'seed system table cache should be available');

    seedApi = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
      seedNodeAddress: seedAddress,
      seedNodeWsAddress: seedAddress,
      messageGroupServices: bootstrapResult.messageGroupServices,
      partitionServices: bootstrapResult.partitionServices,
      systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      epochManager: bootstrapResult.epochManager,
      bootstrapService,
    });
    await seedApi.initialize(0, {listen: false});
    seedApi.setSqlQueryEngine(new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      nodeId: SEED_NODE_ID,
    }));

    // --- Node B: joins through the seed (in-proc HTTP). ---
    const nodeBWsPort = getUniquePort();
    const nodeBAddress = `ws://localhost:${nodeBWsPort}`;
    const nodeBService = new NodeJoiningService({
      nodeId: NODE_B_ID,
      nodeAddress: nodeBAddress,
      seedNodeAddress: 'http://localhost:0',
      seedNodeWsAddress: seedAddress,
      wsPort: nodeBWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        ...JOINING_CONFIG,
      },
      httpPost: createInProcHttpPost(seedApi),
    });
    joiningServices.push(nodeBService);

    const nodeBJoinResult = await nodeBService.join();
    t.equal(nodeBJoinResult.success, true, 'node B should join via the seed');
    t.equal(
      getLifecycleState(nodeBJoinResult),
      NODE_STATE.READY,
      'node B lifecycle should transition to READY',
    );

    nodeBApi = await exposeJoinerBootstrapApi(nodeBService, nodeBJoinResult, {
      nodeId: NODE_B_ID,
      nodeAddress: nodeBAddress,
      wsPort: nodeBWsPort,
    });

    // --- Node C: fresh join with candidate list [unreachable, node B]. ---
    const nodeBContactAddress = `http://localhost:${nodeBWsPort}`;
    const nodeBInProcHttpPost = createInProcHttpPost(nodeBApi);
    const triedUrls = [];
    const routingHttpPost = async (url, body, requestOptions) => {
      triedUrls.push(url);
      if (url.startsWith(UNREACHABLE_ADDRESS)) {
        const refusedError = new Error(TRANSPORT_REFUSED_MESSAGE);
        refusedError.code = TRANSPORT_REFUSED_CODE;
        throw refusedError;
      }
      return nodeBInProcHttpPost(url, body, requestOptions);
    };

    const nodeCWsPort = getUniquePort();
    const nodeCService = new NodeJoiningService({
      nodeId: NODE_C_ID,
      nodeAddress: `ws://localhost:${nodeCWsPort}`,
      seedNodeAddress: UNREACHABLE_ADDRESS,
      seedNodeAddresses: [UNREACHABLE_ADDRESS, nodeBContactAddress],
      seedNodeWsAddress: nodeBAddress,
      wsPort: nodeCWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        ...JOINING_CONFIG,
      },
      httpPost: routingHttpPost,
    });
    joiningServices.push(nodeCService);

    const nodeCJoinResult = await nodeCService.join();
    t.equal(
      nodeCJoinResult.success,
      true,
      'node C should join through the non-seed candidate',
      {error: nodeCJoinResult.error},
    );

    const unreachableContacts = triedUrls.filter((url) =>
      url.startsWith(UNREACHABLE_ADDRESS),
    );
    const nodeBContacts = triedUrls.filter((url) =>
      url.startsWith(nodeBContactAddress),
    );
    t.ok(
      unreachableContacts.length >= 1,
      'node C should have tried the unreachable first candidate',
    );
    t.ok(
      nodeBContacts.length >= 1,
      'node C should have rotated to the non-seed candidate',
    );
    t.equal(
      triedUrls[0].startsWith(UNREACHABLE_ADDRESS),
      true,
      'the first contact attempt targets the first (dead) candidate',
    );
    t.equal(
      nodeCService.seedNodeId,
      NODE_B_ID,
      'node C completed its bootstrap contact against node B (non-seed)',
    );
    t.ok(
      nodeCJoinResult.messageGroupServices.size >= MIN_LOCAL_MESSAGE_GROUPS,
      'node C should host at least one local message group service',
    );
    t.equal(
      getLifecycleState(nodeCJoinResult),
      NODE_STATE.READY,
      'node C lifecycle should transition to READY',
    );
  } finally {
    if (nodeBApi) {
      await nodeBApi.shutdown().catch(() => {});
    }
    for (let index = joiningServices.length - 1; index >= 0; index -= 1) {
      await gracefulJoiningShutdown(joiningServices[index]);
    }
    await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    await cleanupTestEnvironment();
  }
});
