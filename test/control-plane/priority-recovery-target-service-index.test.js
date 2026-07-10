import {test} from '../../src/test-helpers/tap.js';
import {
  buildPriorityRecoveryReplicaOperationContexts,
} from '../../src/control-plane/priority-recovery-snapshot-rebalancer.js';
import {
  buildPriorityRecoveryReplicaOperationContext,
} from '../../src/control-plane/priority-recovery-snapshot-rebalancer.js';

const NOW_MS = 1000000;
const CREATED_AT_MS = 1000;
const UPDATED_AT_MS = 900000;
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const PARTITION_ONE = 'sql_write_operations-p1';
const PARTITION_TWO = 'sql_transactions-p1';
const REPLICA_ONE = `${PARTITION_ONE}-r4`;
const REPLICA_TWO = `${PARTITION_TWO}-r5`;
const OPERATION_ONE = 'op-replace-one';
const OPERATION_TWO = 'op-replace-two';
const STATUS_ACTIVE = 'active';
const STATUS_REMOVED = 'removed';
const STATUS_SYNCING = 'syncing';
const SERVICE_TYPE_PARTITION = 'partition';
const SERVICE_TYPE_CONTROL = 'control-plane';
const RAFT_ROLE_LEARNER = 'learner';
const RAFT_ROLE_VOTER = 'voter';
const MATCH_KEY_FIELDS = new Set([
  'service_type',
  'node_id',
  'partition_id',
  'replica_id',
  'service_id',
]);

function replicaOperation(overrides = {}) {
  const partitionId = overrides.partition_id || PARTITION_ONE;
  return {
    operation_id: overrides.operation_id || OPERATION_ONE,
    type: 'REPLACE',
    workflow_step: 'ACTIVE',
    status: STATUS_ACTIVE,
    entity_type: SERVICE_TYPE_PARTITION,
    partition_id: partitionId,
    entity_id: partitionId,
    replica_id: overrides.replica_id || REPLICA_ONE,
    source_node_id: overrides.source_node_id || NODE_A,
    target_node_id: overrides.target_node_id || NODE_B,
    created_at: CREATED_AT_MS,
    updated_at: UPDATED_AT_MS,
    steps_history: JSON.stringify([
      {step: 'ACTIVE', timestamp: UPDATED_AT_MS},
    ]),
    ...overrides,
  };
}

function partitionService(overrides = {}) {
  const partitionId = overrides.partition_id || PARTITION_ONE;
  const replicaId = overrides.replica_id || `${partitionId}-r4`;
  return {
    service_type: SERVICE_TYPE_PARTITION,
    partition_id: partitionId,
    node_id: overrides.node_id || NODE_B,
    replica_id: replicaId,
    service_id: replicaId,
    raft_role: RAFT_ROLE_VOTER,
    status: STATUS_ACTIVE,
    address: `${NODE_B}/partition/${replicaId}`,
    created_at: CREATED_AT_MS,
    updated_at: UPDATED_AT_MS,
    state_entered_at: UPDATED_AT_MS,
    ...overrides,
  };
}

function directFullScanContexts(replicaOperationRows, serviceRows) {
  const contexts = {};
  for (const row of replicaOperationRows) {
    const built = buildPriorityRecoveryReplicaOperationContext(
      row,
      {},
      serviceRows,
      {nowMs: NOW_MS},
    );
    contexts[built.operationId] = built.context;
  }
  return contexts;
}

function indexedContexts(replicaOperationRows, serviceRows) {
  return buildPriorityRecoveryReplicaOperationContexts(
    replicaOperationRows,
    null,
    serviceRows,
    {nowMs: NOW_MS},
  ).byOperationId;
}

function trackedServiceRows(serviceRows) {
  let iterationCount = 0;
  return {
    rows: new Proxy(serviceRows, {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          iterationCount += 1;
        }
        return Reflect.get(target, property, receiver);
      },
    }),
    iterationCount: () => iterationCount,
  };
}

function countedPartitionService(counter, overrides = {}) {
  const base = partitionService(overrides);
  const counted = {};
  for (const [key, value] of Object.entries(base)) {
    Object.defineProperty(counted, key, {
      enumerable: true,
      get() {
        if (MATCH_KEY_FIELDS.has(key)) {
          counter.matchKeyReads += 1;
        }
        return value;
      },
    });
  }
  return counted;
}

function countedServiceRows(counter) {
  const rows = [];
  for (let index = 0; index < 40; index += 1) {
    rows.push(countedPartitionService(counter, {
      node_id: NODE_C,
      partition_id: `irrelevant-${index}`,
      replica_id: `irrelevant-${index}-r1`,
    }));
  }
  rows.push(countedPartitionService(counter, {
    node_id: NODE_B,
    partition_id: PARTITION_ONE,
    replica_id: REPLICA_ONE,
  }));
  rows.push(countedPartitionService(counter, {
    node_id: NODE_B,
    partition_id: PARTITION_TWO,
    replica_id: REPLICA_TWO,
  }));
  return rows;
}

function repeatedOperationRows() {
  return [
    replicaOperation({
      operation_id: `${OPERATION_ONE}-a`,
      partition_id: PARTITION_ONE,
      entity_id: PARTITION_ONE,
      replica_id: REPLICA_ONE,
    }),
    replicaOperation({
      operation_id: `${OPERATION_ONE}-b`,
      partition_id: PARTITION_ONE,
      entity_id: PARTITION_ONE,
      replica_id: REPLICA_ONE,
    }),
    replicaOperation({
      operation_id: `${OPERATION_TWO}-a`,
      partition_id: PARTITION_TWO,
      entity_id: PARTITION_TWO,
      replica_id: REPLICA_TWO,
    }),
    replicaOperation({
      operation_id: `${OPERATION_TWO}-b`,
      partition_id: PARTITION_TWO,
      entity_id: PARTITION_TWO,
      replica_id: REPLICA_TWO,
    }),
    replicaOperation({
      operation_id: `${OPERATION_TWO}-c`,
      partition_id: PARTITION_TWO,
      entity_id: PARTITION_TWO,
      replica_id: REPLICA_TWO,
    }),
  ];
}

test('target-service index preserves full-scan operation contexts across matching edge cases', (t) => {
  const operationRows = [
    replicaOperation({
      operation_id: OPERATION_ONE,
      partition_id: PARTITION_ONE,
      entity_id: PARTITION_ONE,
      replica_id: REPLICA_ONE,
      target_node_id: NODE_B,
    }),
    replicaOperation({
      operation_id: OPERATION_TWO,
      partition_id: PARTITION_TWO,
      entity_id: PARTITION_TWO,
      replica_id: REPLICA_TWO,
      target_node_id: NODE_B,
    }),
  ];
  const serviceRows = [
    partitionService({
      node_id: NODE_C,
      partition_id: PARTITION_ONE,
      replica_id: REPLICA_ONE,
    }),
    partitionService({
      service_type: SERVICE_TYPE_CONTROL,
      node_id: NODE_B,
      partition_id: PARTITION_ONE,
      replica_id: REPLICA_ONE,
    }),
    partitionService({
      node_id: NODE_B,
      partition_id: PARTITION_TWO,
      replica_id: REPLICA_ONE,
    }),
    partitionService({
      node_id: NODE_B,
      partition_id: PARTITION_ONE,
      replica_id: REPLICA_ONE,
      raft_role: RAFT_ROLE_LEARNER,
      updated_at: UPDATED_AT_MS - 10,
    }),
    partitionService({
      node_id: NODE_B,
      partition_id: PARTITION_ONE,
      replica_id: undefined,
      service_id: REPLICA_ONE,
      raft_role: RAFT_ROLE_VOTER,
      updated_at: UPDATED_AT_MS,
    }),
    partitionService({
      node_id: NODE_B,
      partition_id: undefined,
      replica_id: REPLICA_TWO,
      service_id: REPLICA_TWO,
      status: STATUS_SYNCING,
      raft_role: RAFT_ROLE_VOTER,
      updated_at: UPDATED_AT_MS + 5,
    }),
    partitionService({
      node_id: NODE_B,
      partition_id: PARTITION_TWO,
      replica_id: REPLICA_TWO,
      status: STATUS_REMOVED,
      raft_role: RAFT_ROLE_LEARNER,
      updated_at: UPDATED_AT_MS + 20,
    }),
  ];

  const indexed = indexedContexts(operationRows, serviceRows);
  const fallback = directFullScanContexts(operationRows, serviceRows);

  t.same(indexed, fallback, 'indexed top-level build matches full-scan contexts');
  t.equal(
    JSON.stringify(indexed),
    JSON.stringify(fallback),
    'indexed top-level build is serialized-identical to full-scan contexts',
  );
  t.end();
});

test('target-service index scans the source service rows once per snapshot build', (t) => {
  const operationRows = [
    replicaOperation({
      operation_id: OPERATION_ONE,
      partition_id: PARTITION_ONE,
      entity_id: PARTITION_ONE,
      replica_id: REPLICA_ONE,
    }),
    replicaOperation({
      operation_id: OPERATION_TWO,
      partition_id: PARTITION_TWO,
      entity_id: PARTITION_TWO,
      replica_id: REPLICA_TWO,
    }),
  ];
  const tracked = trackedServiceRows([
    partitionService({partition_id: PARTITION_ONE, replica_id: REPLICA_ONE}),
    partitionService({partition_id: PARTITION_TWO, replica_id: REPLICA_TWO}),
    partitionService({node_id: NODE_C, partition_id: PARTITION_ONE}),
  ]);

  const contexts = indexedContexts(operationRows, tracked.rows);

  t.equal(
    tracked.iterationCount(),
    1,
    'source service rows are indexed once, not rescanned for each operation',
  );
  t.equal(
    contexts[OPERATION_ONE]?.targetVisibilityState,
    'active_operational',
    'first operation still resolves its target service',
  );
  t.equal(
    contexts[OPERATION_TWO]?.targetVisibilityState,
    'active_operational',
    'second operation still resolves its target service',
  );
  t.end();
});

test('target-service index reduces match-key field reads versus the full scan path', (t) => {
  const fallbackCounter = {matchKeyReads: 0};
  const indexedCounter = {matchKeyReads: 0};
  const operationRows = repeatedOperationRows();

  const fallback = directFullScanContexts(
    operationRows,
    countedServiceRows(fallbackCounter),
  );
  const indexed = indexedContexts(
    operationRows,
    countedServiceRows(indexedCounter),
  );

  t.same(indexed, fallback, 'indexed and fallback outputs remain identical');
  t.equal(
    JSON.stringify(indexed),
    JSON.stringify(fallback),
    'indexed and fallback outputs remain serialized-identical',
  );
  t.ok(
    indexedCounter.matchKeyReads < fallbackCounter.matchKeyReads,
    'indexed path performs fewer match-key reads than the full-scan path',
  );
  t.ok(
    indexedCounter.matchKeyReads * 2 < fallbackCounter.matchKeyReads,
    'indexed match-key reads are less than half of fallback reads in a churny snapshot',
  );
  t.end();
});
