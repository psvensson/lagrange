/**
 * PartitionService collaborator propagation: a CDC service and SQL engine
 * wired after construction reach the rebalancer, its coordinator and its
 * system-table gateway.
 * Moved from partition-service-role-metadata-publication.test.js
 * (file-size ratchet).
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {createReadinessServiceForTest} from '../helpers/readiness-service-fixture.js';
import {
  partitionCollaboratorFake,
  partitionCollaboratorOptions,
} from '../helpers/partition-service-fixture.js';
import {
  PARTITION_SERVICE_COLLABORATOR as COLLABORATOR,
} from '../../src/partition/partition-service-collaborators.js';

// A CDC service fake completed to the partition's collaborator interface.
const cdcFake = (fake) =>
  partitionCollaboratorFake(COLLABORATOR.CDC_INTEGRATION_SERVICE, fake);

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('PartitionService - setCdcIntegrationService sets service on partition and rebalancer',
  async (t) => {
    const mockCdcIntegrationService = cdcFake({
      deleteSystemTableRow: async () => ({success: true}),
      insertSystemTableRow: async () => ({success: true}),
    });

    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
      partitionId: 'test-partition-22',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'test-node',
      dbPath: ':memory:',
    })));

    await partition.initialize();

    // Initially no cdcIntegrationService
    t.equal(partition.cdcIntegrationService, null, 'Initially null');

    // Provide stubbed rebalancer/coordinator to verify propagation.
    // A UnifiedRebalancer stand-in: production's always takes the
    // (edge-aware) leadership the partition re-asserts on every rewire.
    partition.rebalancer = {
      cdcIntegrationService: null,
      setRebalanceCoordinator: () => {},
      setLeader: () => {},
      shutdown: () => {},
    };
    partition.rebalanceCoordinator = partitionCollaboratorFake(
      COLLABORATOR.REBALANCE_COORDINATOR, {cdcIntegrationService: null});

    // Set the CDC integration service
    partition.setCdcIntegrationService(mockCdcIntegrationService);

    // Verify it was set on the partition
    t.equal(
      partition.cdcIntegrationService,
      mockCdcIntegrationService,
      'Should be set on partition',
    );

    // Verify it was set on the rebalancer
    t.equal(
      partition.rebalancer.cdcIntegrationService,
      mockCdcIntegrationService,
      'Should be set on rebalancer',
    );

    // Verify it was set on the coordinator
    t.equal(
      partition.rebalanceCoordinator.cdcIntegrationService,
      mockCdcIntegrationService,
      'Should be set on coordinator',
    );

    await partition.shutdown();
  });

// An initialized leader partition with every rebalancer owner wired except
// its SQL engine: the test's setSqlQueryEngine is what initializes the
// rebalancer.
async function leaderPartitionAwaitingSqlEngine(partitionId) {
  const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
    partitionId,
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'test-node',
    dbPath: ':memory:',
  })));
  await partition.initialize();
  partition.rebalanceCoordinator = partitionCollaboratorFake(
    COLLABORATOR.REBALANCE_COORDINATOR, {
      systemTableCache: null,
      cdcIntegrationService: null,
      tablePolicyService: null,
      sqlQueryEngine: null,
      controlPlaneReadinessService: createReadinessServiceForTest(),
      initialize: () => {},
    });
  partition.systemTableCache = partitionCollaboratorFake(
    COLLABORATOR.SYSTEM_TABLE_CACHE, {
      get: () => null,
      filter: () => [],
      onCacheChange: () => {},
      offCacheChange: () => {},
    });
  partition.cdcIntegrationService = cdcFake({
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
    deleteSystemTableRow: async () => ({success: true}),
  });
  partition.tablePolicyService = {
    getPolicyForPartition: () => ({targetReplicaCount: 3}),
  };
  partition.messageRouter = {
    getConnectionState: () => 'connected',
    send: async () => {},
  };
  partition.isLeader = true;
  return partition;
}

test('PartitionService - initializeRebalancer passes sqlQueryEngine to gateway',
  async (t) => {
    // Bug reproduction: initializeRebalancer() creates UnifiedRebalancer
    // without passing sqlQueryEngine, so the gateway is created with null.
    // Later, maybeInitializeRebalancer() sets rebalancer.sqlQueryEngine
    // but does NOT propagate to the gateway. The gateway retains null
    // forever, causing "requires sqlQueryEngine" errors when the
    // rebalancer tries to call getConfiguredRebalanceBudget() or
    // getGlobalInFlightOperationCount().
    const mockSqlQueryEngine = {
      executeQuery: async () => ({success: true, rows: []}),
    };
    const partition = await leaderPartitionAwaitingSqlEngine('test-partition-gw-1');
    // All other dependencies are wired, so initializeRebalancer() fires.
    partition.setSqlQueryEngine(mockSqlQueryEngine);

    // Rebalancer should now exist
    t.ok(partition.rebalancer, 'rebalancer should be initialized');

    // The gateway must have the sqlQueryEngine — this is the bug
    const gateway = partition.rebalancer.controlPlaneSystemTableGateway;
    t.ok(gateway, 'gateway should exist on rebalancer');
    t.equal(
      gateway.sqlQueryEngine,
      mockSqlQueryEngine,
      'gateway.sqlQueryEngine must be set after initializeRebalancer ' +
      '(uses injected owner path via constructor)',
    );

    // Verify the gateway can actually execute a query without throwing
    const result = await gateway.executeQuery(
      'SELECT 1',
      [],
      {},
    );
    t.ok(result, 'gateway.executeQuery should succeed');

    await partition.shutdown();
  });

test('PartitionService - maybeInitializeRebalancer propagates sqlQueryEngine ' +
  'to gateway on refresh',
async (t) => {
  // Bug reproduction: when maybeInitializeRebalancer() refreshes an
  // existing rebalancer, it sets rebalancer.sqlQueryEngine but does NOT
  // propagate to the gateway. The gateway retains the stale engine.
  const firstEngine = {
    executeQuery: async () => ({success: true, rows: [], tag: 'first'}),
  };
  const secondEngine = {
    executeQuery: async () => ({success: true, rows: [], tag: 'second'}),
  };
  const partition = await leaderPartitionAwaitingSqlEngine('test-partition-gw-2');
  // Initialize with first engine
  partition.setSqlQueryEngine(firstEngine);

  t.ok(partition.rebalancer, 'rebalancer should be initialized');

  const gateway = partition.rebalancer.controlPlaneSystemTableGateway;
  t.equal(
    gateway.sqlQueryEngine,
    firstEngine,
    'gateway should have first engine after init',
  );

  // Now update to second engine — this triggers maybeInitializeRebalancer
  partition.setSqlQueryEngine(secondEngine);

  // The gateway must have the updated engine — this is the bug
  t.equal(
    gateway.sqlQueryEngine,
    secondEngine,
    'gateway.sqlQueryEngine must be updated when ' +
    'maybeInitializeRebalancer refreshes (uses injected owner path)',
  );

  await partition.shutdown();
});
