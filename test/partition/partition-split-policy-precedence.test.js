import {afterEach, beforeEach, test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {DEFAULT_CONFIG} from '../../src/config/config-definitions.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionSplitMergeManager} from
  '../../src/partition/partition-split-merge-manager.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {RATINGS_TABLE_SPLIT_POLICY} from
  '../../examples/service-data-affinity/lagrange-loader.js';

const CONFIGURED_SPLIT_THRESHOLD_BYTES = 1024 * 1024;
const EXPLICIT_SPLIT_THRESHOLD_BYTES = 20 * 1024 * 1024;
const OBSERVED_RATINGS_SIZE_BYTES = 12635760;
const LOCAL_NODE_ID = 'node-a';
const DEFAULT_TABLE_ID = 'tbl-ratings-default';
const DEFAULT_PARTITION_ID = 'ratings-default-p1';
const SCENARIO_TABLE_ID = 'tbl-ratings-scenario';
const SCENARIO_PARTITION_ID = 'ratings-scenario-p1';
const SYSTEM_LOGS_PARTITION_ID = 'logs-p1';

function createPolicyCache() {
  const tables = [{
    table_id: DEFAULT_TABLE_ID,
    table_name: 'ratings_default',
    table_policies: JSON.stringify({minReplicaCount: 3}),
  }, {
    table_id: 'tbl-ratings-override',
    table_name: 'ratings_override',
    table_policies: JSON.stringify({
      splitStorageThreshold: EXPLICIT_SPLIT_THRESHOLD_BYTES,
    }),
  }];
  const partitions = [{
    partition_id: DEFAULT_PARTITION_ID,
    table_id: DEFAULT_TABLE_ID,
    table_name: 'ratings_default',
    size_bytes: OBSERVED_RATINGS_SIZE_BYTES,
  }, {
    partition_id: 'ratings-override-p1',
    table_id: 'tbl-ratings-override',
    table_name: 'ratings_override',
    size_bytes: OBSERVED_RATINGS_SIZE_BYTES,
  }];

  return {
    tables,
    partitions,
    getAll(tableName) {
      if (tableName === 'tables') {
        return tables;
      }
      if (tableName === 'partitions') {
        return partitions;
      }
      return [];
    },
  };
}

function createPolicyMutationCapture() {
  const updates = [];
  return {
    updates,
    async updateSystemTableRow(tableName, whereClause, data) {
      updates.push({tableName, whereClause, data});
      return {success: true};
    },
  };
}

function createManager(cache, policyService, executedPartitionIds) {
  return new PartitionSplitMergeManager({
    listPartitions: async () => cache.partitions,
    getPartitionMetrics: async (_partitionId, partition) => ({
      sizeBytes: partition.size_bytes,
      queriesPerMinute: 0,
    }),
    tablePolicyService: policyService,
    executeSplitCandidate: async (partitionId) => {
      executedPartitionIds.push(partitionId);
      return {success: true, partitionId};
    },
    pressureGovernor: {
      evaluate() {
        return {action: 'allow', retryAfterMs: 0, summary: null};
      },
    },
  });
}

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: LOCAL_NODE_ID},
    partition: {
      splitThresholdBytes: CONFIGURED_SPLIT_THRESHOLD_BYTES,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('managed split policy uses configured defaults and explicit table ' +
  'overrides', async (t) => {
  const cache = createPolicyCache();
  const executedPartitionIds = [];
  const policyService = new TablePolicyService({systemTableCache: cache});
  const manager = createManager(cache, policyService, executedPartitionIds);

  const results = await manager.evaluateAllPartitions({
    triggerReason: 'reactive_request',
    reasonCodes: ['write_activity'],
  });

  t.same(
    results.splitCandidates,
    [DEFAULT_PARTITION_ID],
    'a sparse table policy inherits the configured split threshold while an ' +
      'explicit table threshold still wins',
  );
  t.same(
    executedPartitionIds,
    [DEFAULT_PARTITION_ID],
    'the effective policy drives the real managed split execution seam',
  );

  manager.shutdown();
});

test('unrelated policy updates preserve configured split threshold ' +
  'provenance', async (t) => {
  const cache = createPolicyCache();
  const cdcIntegrationService = createPolicyMutationCapture();
  const policyService = new TablePolicyService({
    systemTableCache: cache,
    cdcIntegrationService,
  });

  await policyService.updateTablePolicy(DEFAULT_TABLE_ID, {replicaCount: 5});

  const persistedPolicy = JSON.parse(
    cdcIntegrationService.updates[0].data.table_policies,
  );
  t.same(
    persistedPolicy,
    {minReplicaCount: 3, replicaCount: 5},
    'an unrelated update persists only stored and explicitly updated fields',
  );
  t.notOk(
    Object.hasOwn(persistedPolicy, 'splitStorageThreshold'),
    'the inherited split threshold is not materialized as an override',
  );

  cache.tables[0].table_policies = JSON.stringify(persistedPolicy);
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: LOCAL_NODE_ID},
    partition: {splitThresholdBytes: EXPLICIT_SPLIT_THRESHOLD_BYTES},
  });

  const refreshedPolicyService = new TablePolicyService({
    systemTableCache: cache,
  });
  const executedPartitionIds = [];
  const manager = createManager(
    cache,
    refreshedPolicyService,
    executedPartitionIds,
  );
  const results = await manager.evaluateAllPartitions({
    triggerReason: 'reactive_request',
    reasonCodes: ['write_activity'],
  });

  t.same(
    results.splitCandidates,
    [],
    'the later configured default governs split candidacy after the update',
  );
  t.same(
    executedPartitionIds,
    [],
    'no split executes when the refreshed configured threshold is not met',
  );

  manager.shutdown();
});

test('MovieLens ratings override leaves system logs on the production ' +
  'split default through the real policy and split owners', async (t) => {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: LOCAL_NODE_ID},
    partition: {
      splitThresholdBytes: DEFAULT_CONFIG.partition.splitThresholdBytes,
    },
  });
  const cache = {
    tables: [{
      table_id: SCENARIO_TABLE_ID,
      table_name: 'ratings',
      table_policies: JSON.stringify(RATINGS_TABLE_SPLIT_POLICY),
    }, {
      table_id: 'logs',
      table_name: 'logs',
      table_policies: JSON.stringify({}),
    }],
    partitions: [{
      partition_id: SCENARIO_PARTITION_ID,
      table_id: SCENARIO_TABLE_ID,
      table_name: 'ratings',
      size_bytes: OBSERVED_RATINGS_SIZE_BYTES,
    }, {
      partition_id: SYSTEM_LOGS_PARTITION_ID,
      table_id: 'logs',
      table_name: 'logs',
      size_bytes: OBSERVED_RATINGS_SIZE_BYTES,
    }],
    getAll(tableName) {
      if (tableName === 'tables') {
        return this.tables;
      }
      if (tableName === 'partitions') {
        return this.partitions;
      }
      return [];
    },
  };
  const executedPartitionIds = [];
  const policyService = new TablePolicyService({systemTableCache: cache});
  const manager = createManager(cache, policyService, executedPartitionIds);

  const results = await manager.evaluateAllPartitions({
    triggerReason: 'reactive_request',
    reasonCodes: ['write_activity'],
  });

  t.same(results.splitCandidates, [SCENARIO_PARTITION_ID]);
  t.same(executedPartitionIds, [SCENARIO_PARTITION_ID]);
  t.notOk(results.splitCandidates.includes(SYSTEM_LOGS_PARTITION_ID),
    'the teaching threshold cannot select the system logs partition');

  manager.shutdown();
});
