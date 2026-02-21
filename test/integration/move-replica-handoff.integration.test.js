/**
 * MOVE_REPLICA Handoff Ownership Integration Test.
 *
 * Validates that MOVE_REPLICA handoff follows transactional semantics
 * with explicit phases: prepare_target, verify_target, remove_source,
 * commit_metadata.
 *
 * These tests are written to FAIL against the current codebase,
 * demonstrating the correctness gaps that need to be fixed.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SERVICE_STATUS, WORKFLOW_STEP} from '../../src/constants/index.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  gracefulJoiningShutdown,
  gracefulShutdown,
  getUniquePort,
  TEST_CONFIG,
} from './helpers/cluster-test-helpers.js';

const HANDOFF_PHASE = Object.freeze({
  PREPARE_TARGET: 'prepare_target',
  VERIFY_TARGET: 'verify_target',
  REMOVE_SOURCE: 'remove_source',
  COMMIT_METADATA: 'commit_metadata',
});

function createInProcHttpPost(seedApi) {
  return async (url, body) => {
    const {pathname} = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: pathname,
      payload: body,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`HTTP ${res.statusCode}: ${res.payload}`);
    }
    return res.json();
  };
}

async function waitForQueryRows(
  engine, sql, params, minRows,
  timeoutMs = 3000, intervalMs = 50,
) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await engine.executeQuery(sql, params);
    if (last.success !== false && (last.rows || []).length >= minRows) {
      return last;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last || {success: false, rows: []};
}

async function waitForResolvedAddress(
  service,
  peerId,
  expectedAddress,
  timeoutMs = 3000,
  intervalMs = 50,
) {
  const start = Date.now();
  let resolved = null;
  while (Date.now() - start < timeoutMs) {
    try {
      resolved = service.buildPeerAddress(peerId);
      if (resolved === expectedAddress) {
        return resolved;
      }
    } catch (_error) {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return resolved;
}

test('MOVE_REPLICA handoff ownership integration', {timeout: 180000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('handoff removes source replica before ownership commit', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440091';
    const seedWsPort = getUniquePort();
    const joiningNodeId = '550e8400-e29b-41d4-a716-446655440092';
    const joiningWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    let seedApi = null;
    let joiningService = null;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      const sourceShutdownCalls = new Set();
      for (const [replicaId, service] of bootstrapResult.messageGroupServices.entries()) {
        const originalShutdown = service.shutdown?.bind(service);
        service.shutdown = async () => {
          sourceShutdownCalls.add(replicaId);
          if (originalShutdown) {
            await originalShutdown();
          }
        };
      }

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

      const seedQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(seedQueryEngine);

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 5000,
        },
        httpPost: createInProcHttpPost(seedApi),
      });

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, true, 'joining node should join successfully');

      const assignment = joiningService.bootstrapResponse?.messageGroupAssignment;
      t.equal(assignment?.strategy, 'MOVE_REPLICA', 'join should use MOVE_REPLICA');
      const movedReplicaId = assignment?.replicaToMove;
      t.ok(movedReplicaId, 'MOVE_REPLICA assignment should include replicaToMove');

      t.ok(
        sourceShutdownCalls.has(movedReplicaId),
        'source replica should be explicitly shut down during handoff',
      );

      const rowResult = await waitForQueryRows(
        seedQueryEngine,
        'SELECT * FROM services WHERE service_id = ?',
        [movedReplicaId],
        1,
        5000,
      );
      t.equal(rowResult.success, true, 'service query should succeed');
      const movedRow = (rowResult.rows || [])[0];
      t.equal(movedRow.node_id, joiningNodeId, 'ownership should commit to joining node');
      t.equal(movedRow.status, SERVICE_STATUS.ACTIVE, 'moved replica should remain active');

      const movedAddress = `${seedNodeId}/message-group/${movedReplicaId}`;
      t.equal(
        bootstrapResult.messageGroupServices.has(movedReplicaId),
        false,
        'seed local message group map should no longer contain moved replica',
      );
      t.equal(
        bootstrapResult.messageRouter.isRegistered(movedAddress),
        false,
        'seed message router handler should be unregistered for moved replica',
      );
    } finally {
      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    }
  });

  await t.test('post-handoff peer resolution converges to target address', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440093';
    const seedWsPort = getUniquePort();
    const joiningNodeId = '550e8400-e29b-41d4-a716-446655440094';
    const joiningWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    let seedApi = null;
    let joiningService = null;

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
        bootstrapService: bootstrapService,
      });
      await seedApi.initialize(0, {listen: false});

      const seedQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(seedQueryEngine);

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 5000,
        },
        httpPost: createInProcHttpPost(seedApi),
      });

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, true, 'joining node should join successfully');

      const assignment = joiningService.bootstrapResponse?.messageGroupAssignment;
      t.equal(assignment?.strategy, 'MOVE_REPLICA', 'join should use MOVE_REPLICA');
      const movedReplicaId = assignment?.replicaToMove;
      t.ok(movedReplicaId, 'MOVE_REPLICA assignment should include replicaToMove');

      await waitForQueryRows(
        seedQueryEngine,
        'SELECT * FROM services WHERE service_id = ? AND node_id = ?',
        [movedReplicaId, joiningNodeId],
        1,
        5000,
      );

      const movedService = joinResult.messageGroupServices.get(movedReplicaId);
      t.ok(movedService, 'joining node should host moved replica service');

      const stalePeerAddress = movedService.peerAddresses.find((address) =>
        address.endsWith(`/message-group/${movedReplicaId}`),
      );
      t.ok(stalePeerAddress, 'assignment should include a bootstrap peer address for moved replica');

      const expectedAddress = `${joiningNodeId}/message-group/${movedReplicaId}`;
      const resolvedAddress = await waitForResolvedAddress(
        movedService,
        movedReplicaId,
        expectedAddress,
        5000,
      );
      t.equal(
        resolvedAddress,
        expectedAddress,
        'peer resolution should converge to cache-backed target address',
      );
    } finally {
      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    }
  });

  await t.test('handoff persists replica_operations phase history', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440095';
    const seedWsPort = getUniquePort();
    const joiningNodeId = '550e8400-e29b-41d4-a716-446655440096';
    const joiningWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    let seedApi = null;
    let joiningService = null;

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
        bootstrapService: bootstrapService,
      });
      await seedApi.initialize(0, {listen: false});

      const seedQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(seedQueryEngine);

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 5000,
        },
        httpPost: createInProcHttpPost(seedApi),
      });

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, true, 'joining node should join successfully');

      const assignment = joiningService.bootstrapResponse?.messageGroupAssignment;
      t.equal(assignment?.strategy, 'MOVE_REPLICA', 'join should use MOVE_REPLICA');
      const movedReplicaId = assignment?.replicaToMove;
      t.ok(movedReplicaId, 'MOVE_REPLICA assignment should include replicaToMove');

      const operationResult = await waitForQueryRows(
        seedQueryEngine,
        `SELECT * FROM replica_operations
         WHERE replica_id = ? AND source_node_id = ? AND target_node_id = ?
         ORDER BY created_at DESC`,
        [movedReplicaId, seedNodeId, joiningNodeId],
        1,
        5000,
      );
      t.equal(operationResult.success, true, 'replica operation query should succeed');

      const operationRow = (operationResult.rows || [])[0];
      t.equal(operationRow.status, ReplicaStatus.ACTIVE, 'handoff operation should complete active');
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.ACTIVE,
        'handoff operation should end in ACTIVE workflow step',
      );

      const stepsHistory = JSON.parse(operationRow.steps_history || '[]');
      const phases = stepsHistory
        .map((step) => step.phase)
        .filter(Boolean);
      t.same(
        phases,
        [
          HANDOFF_PHASE.PREPARE_TARGET,
          HANDOFF_PHASE.VERIFY_TARGET,
          HANDOFF_PHASE.REMOVE_SOURCE,
          HANDOFF_PHASE.COMMIT_METADATA,
        ],
        'handoff phase history should be explicit and ordered',
      );
    } finally {
      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    }
  });

  await t.test('handoff failure records failed operation and preserves source owner', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440097';
    const seedWsPort = getUniquePort();
    const joiningNodeId = '550e8400-e29b-41d4-a716-446655440098';
    const joiningWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    let seedApi = null;
    let joiningService = null;
    const originalShutdowns = new Map();

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      for (const [replicaId, service] of bootstrapResult.messageGroupServices.entries()) {
        originalShutdowns.set(replicaId, service.shutdown);
        service.shutdown = async () => {
          throw new Error('forced remove_source failure');
        };
      }

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

      const seedQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(seedQueryEngine);

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 5000,
        },
        httpPost: createInProcHttpPost(seedApi),
      });

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, false, 'join should fail when remove_source phase fails');
      t.match(joinResult.error, /forced remove_source failure/, 'join error should surface failure');

      const assignment = joiningService.bootstrapResponse?.messageGroupAssignment;
      const movedReplicaId = assignment?.replicaToMove;
      t.ok(movedReplicaId, 'failed join should still expose moved replica assignment');

      const operationResult = await waitForQueryRows(
        seedQueryEngine,
        `SELECT * FROM replica_operations
         WHERE replica_id = ? AND source_node_id = ? AND target_node_id = ?
         ORDER BY created_at DESC`,
        [movedReplicaId, seedNodeId, joiningNodeId],
        1,
        5000,
      );
      t.equal(operationResult.success, true, 'replica operation query should succeed');

      const operationRow = (operationResult.rows || [])[0];
      t.equal(operationRow.status, ReplicaStatus.FAILED, 'handoff operation should transition to failed');
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.FAILED,
        'handoff operation should end in FAILED workflow step',
      );

      const serviceResult = await waitForQueryRows(
        seedQueryEngine,
        'SELECT * FROM services WHERE service_id = ?',
        [movedReplicaId],
        1,
        5000,
      );
      t.equal(serviceResult.success, true, 'services query should succeed');
      const serviceRow = (serviceResult.rows || [])[0];
      t.equal(
        serviceRow.node_id,
        seedNodeId,
        'ownership should remain on source when handoff fails',
      );
    } finally {
      for (const [replicaId, originalShutdown] of originalShutdowns.entries()) {
        const service = bootstrapResult?.messageGroupServices?.get(replicaId);
        if (service) {
          service.shutdown = originalShutdown;
        }
      }
      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    }
  });
});
