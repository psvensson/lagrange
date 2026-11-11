/**
 * Initial partition bootstrap cohort at the provisioning seam: what a retry
 * of provisionInitialTablePartition plans, and what the cohort owner
 * (src/query/initial-partition-bootstrap-cohort.js) answers for it.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OWNER_CONTRACT_STATE} from
  '../../src/control-plane/owner-contract-outcome.js';
import {
  classifyTypedDistributedFailure,
} from '../../src/control-plane/control-plane-error-classification.js';
import {REBALANCER_SKIP_REASON} from
  '../../src/rebalancer/rebalancer-constants.js';
import {isTransientProvisioningError} from
  '../../src/query/schema-provisioning-job-owner.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  createMockMessageRouter,
  createProvisioningReadyService,
} from './sql-query-engine-test-support.js';

ConfigurationManager.getInstance().initialize();

test('SQLQueryEngine - provisionInitialTablePartition preserves genesis bootstrap cohort decoded via ReplicaOperationRepository.rowToOperation across retry and restart with zero redundant persistOperationUpdate writes and refuses conflicting metadata', async (t) => {
  const {ReplicaOperationRepository} = await import(
    '../../src/rebalancer/replica-operation-repository.js'
  );
  const {validateBootstrapMembershipStamp} = await import(
    '../../src/raft/raft-committed-membership-stamp.js'
  );

  const repository = new ReplicaOperationRepository({});
  const tableId = 'tbl-bootstrap-cohort-preserve';
  const partitionId = `${tableId}-p1`;
  const nodes = [
    {node_id: 'node-a', status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const replicaIdByNodeId = {
    'node-a': `${partitionId}-r1`,
    'node-b': `${partitionId}-r2`,
    'node-c': `${partitionId}-r3`,
  };
  const tableMetadata = {
    table_id: tableId,
    table_name: 'cohort_events',
    schema_definition: JSON.stringify({
      columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
    }),
  };
  const partitionMetadata = {
    partition_id: partitionId,
    table_id: tableId,
    table_name: 'cohort_events',
    partition_version: 1,
    replica_count: 3,
    state: 'NORMAL',
  };

  // Durable row store emulating replica_operations rows decoded via rowToOperation
  const durableRowsByTargetNodeId = new Map();
  const persistUpdateCalls = [];
  const executeCalls = [];
  let services = [];

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    has: () => false,
    get(type, key) {
      if (type === TABLES.SERVICES) {
        return services.find((row) => row.service_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) return nodes.filter(predicate);
      if (type === TABLES.SERVICES) return services.filter(predicate);
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) return nodes;
      if (type === TABLES.SERVICES) return services;
      return [];
    },
  };

  const toDurableRow = (operation) => ({
    operation_id: operation.operationId,
    type: operation.type || 'ADD',
    entity_type: operation.entityType || 'partition',
    entity_id: operation.entityId || partitionId,
    partition_id: operation.partitionId || partitionId,
    replica_id: operation.replicaId,
    source_node_id: null,
    target_node_id: operation.targetNodeId || operation.nodeId,
    status: operation.status || 'IN_PROGRESS',
    workflow_step: operation.workflowStep || WORKFLOW_STEP.PENDING,
    created_at: operation.createdAt || 1000,
    updated_at: operation.updatedAt || 1000,
    completed_at: null,
    error_message: null,
    retry_count: 0,
    steps_history: JSON.stringify(operation.stepsHistory || []),
  });

  const makeEngine = () => {
    const engine = new SQLQueryEngine({
      nodeId: 'node-a',
      systemCache: cache,
      controlPlaneReadinessService: createProvisioningReadyService(nodes),
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator: {
        async createOperation(move) {
          const existingRow = durableRowsByTargetNodeId.get(move.nodeId);
          if (existingRow) {
            // Decode strictly through the real ReplicaOperationRepository.rowToOperation owner
            return repository.rowToOperation(existingRow);
          }
          const created = {
            operationId: `op-${move.nodeId}`,
            replicaId: replicaIdByNodeId[move.nodeId],
            targetNodeId: move.nodeId,
            nodeId: move.nodeId,
            partitionId,
            type: 'ADD',
            entityType: 'partition',
            entityId: partitionId,
            status: 'PENDING',
            workflowStep: WORKFLOW_STEP.PENDING,
            createdAt: 1000,
            updatedAt: 1000,
            stepsHistory: [{
              step: WORKFLOW_STEP.PENDING,
              timestamp: 1000,
              bootstrapTopologyDispatchDeferred: true,
              operationIntentId: move.operationIntentId,
              replicaIntentId: move.replicaIntentId,
            }],
          };
          durableRowsByTargetNodeId.set(move.nodeId, toDurableRow(created));
          return created;
        },
        // The partition's durable operation rows, decoded by their owner.
        async getOperationsByEntity() {
          return [...durableRowsByTargetNodeId.values()]
            .map((row) => repository.rowToOperation(row));
        },
        async persistOperationUpdate(operation) {
          persistUpdateCalls.push(operation.operationId);
          durableRowsByTargetNodeId.set(
            operation.targetNodeId || operation.nodeId,
            toDurableRow(operation),
          );
        },
        async dispatchOperation(operation) {
          return this.executeOperation(operation);
        },
        async executeOperation(operation) {
          executeCalls.push(operation.operationId);
          operation.workflowStep =
            operation.targetNodeId === 'node-a' ?
              WORKFLOW_STEP.SYNCING :
              WORKFLOW_STEP.CREATING;
          durableRowsByTargetNodeId.set(
            operation.targetNodeId || operation.nodeId,
            toDurableRow(operation),
          );
          return {success: true};
        },
      },
    });
    engine.waitForPartitionServiceMetadata = async () => {};
    engine.waitForRoutablePartitionServiceCount = async () => {
      if (services.length < 3) {
        const err = new Error(
          `Timed out waiting for routable partition service for partition ${partitionId}`,
        );
        err.code = QUERY_ERROR_CODE.TIMEOUT;
        throw err;
      }
    };
    engine.waitForPartitionLeaderService = async () => {};
    return engine;
  };

  // Attempt 1: Stamps 3 operations, persists 3 updates, dispatches 3 operations, then times out waiting for routable services
  const engineAttempt1 = makeEngine();
  await t.rejects(
    engineAttempt1.provisionInitialTablePartition({
      tableId,
      tableName: 'cohort_events',
      tableMetadata,
      partitionId,
      partitionMetadata,
      replicaCount: 3,
      schemaJobId: 'schema-job-cohort-1',
    }),
    {code: QUERY_ERROR_CODE.TIMEOUT},
  );
  t.same(
    persistUpdateCalls,
    ['op-node-a', 'op-node-b', 'op-node-c'],
    'attempt 1 persists bootstrap cohort once per founding operation',
  );
  t.same(
    executeCalls,
    ['op-node-a', 'op-node-b', 'op-node-c'],
    'attempt 1 dispatches each founding operation once',
  );

  // Verify rowToOperation decoded stamp on all 3 durable rows
  for (const [nodeId, rawRow] of durableRowsByTargetNodeId.entries()) {
    const decoded = repository.rowToOperation(rawRow);
    const stampValidation = validateBootstrapMembershipStamp(
      decoded.bootstrapMembership,
    );
    t.equal(stampValidation.valid, true, `decoded stamp on ${nodeId} is valid`);
    t.equal(stampValidation.stamp.kind, 'genesis');
    t.same(stampValidation.stamp.founders, [
      `${partitionId}-r1`,
      `${partitionId}-r2`,
      `${partitionId}-r3`,
    ]);
    t.same(stampValidation.stamp.founderNodeIds, {
      [`${partitionId}-r1`]: 'node-a',
      [`${partitionId}-r2`]: 'node-b',
      [`${partitionId}-r3`]: 'node-c',
    });
  }

  // Attempt 2 (retry / restart on fresh engine instance): services converge;
  // rowToOperation decodes existing operations -> zero persistOperationUpdate calls and zero re-dispatches!
  services = nodes.map((n) => ({
    service_id: replicaIdByNodeId[n.node_id],
    replica_id: replicaIdByNodeId[n.node_id],
    partition_id: partitionId,
    service_type: 'partition',
    status: 'active',
    raft_role: n.node_id === 'node-a' ? 'leader' : 'follower',
    node_id: n.node_id,
    address: `${n.node_id}/partition/${replicaIdByNodeId[n.node_id]}`,
  }));
  const engineAttempt2 = makeEngine();
  // Keep getRoutablePartitionServiceNodeIds empty at entry so planning/cohort loop runs before final wait
  let entryCheck = true;
  const origGetRoutable = engineAttempt2.getRoutablePartitionServiceNodeIds.bind(
    engineAttempt2,
  );
  engineAttempt2.getRoutablePartitionServiceNodeIds = (...args) => {
    if (entryCheck) {
      entryCheck = false;
      return [];
    }
    return origGetRoutable(...args);
  };

  const summary = await engineAttempt2.provisionInitialTablePartition({
    tableId,
    tableName: 'cohort_events',
    tableMetadata,
    partitionId,
    partitionMetadata,
    replicaCount: 3,
    schemaJobId: 'schema-job-cohort-1',
  });
  t.equal(summary.contractState, OWNER_CONTRACT_STATE.READY);
  t.equal(
    persistUpdateCalls.length,
    3,
    'retry/restart must perform ZERO additional persistOperationUpdate rewrites for already-bootstrapped operations',
  );
  t.equal(
    executeCalls.length,
    3,
    'retry/restart must perform ZERO duplicate executeOperation calls for in-flight operations',
  );

  // Negative Control A: Array-typed bootstrapMembership (or malformed stamp) is rejected with BOOTSTRAP_COHORT_CONFLICT
  const corruptedArrayRow = JSON.parse(
    JSON.stringify(durableRowsByTargetNodeId.get('node-a')),
  );
  const parsedHistoryA = JSON.parse(corruptedArrayRow.steps_history);
  parsedHistoryA[0].bootstrapMembership = [
    `${partitionId}-r1`,
    `${partitionId}-r2`,
    `${partitionId}-r3`,
  ];
  corruptedArrayRow.steps_history = JSON.stringify(parsedHistoryA);
  durableRowsByTargetNodeId.set('node-a', corruptedArrayRow);

  entryCheck = true;
  await t.rejects(
    engineAttempt2.provisionInitialTablePartition({
      tableId,
      tableName: 'cohort_events',
      tableMetadata,
      partitionId,
      partitionMetadata,
      replicaCount: 3,
      schemaJobId: 'schema-job-cohort-1',
    }),
    {code: QUERY_ERROR_CODE.BOOTSTRAP_COHORT_CONFLICT},
    'Array-typed bootstrapMembership must be rejected as BOOTSTRAP_COHORT_CONFLICT',
  );

  // Negative Control B: Equal array lengths (3) but different founding replica identity ('r99' instead of 'r3')
  const corruptedFounderRow = JSON.parse(
    JSON.stringify(durableRowsByTargetNodeId.get('node-b')),
  );
  const parsedHistoryB = JSON.parse(corruptedFounderRow.steps_history);
  parsedHistoryB[0].replicaIds = [
    `${partitionId}-r1`,
    `${partitionId}-r2`,
    `${partitionId}-r99`,
  ];
  parsedHistoryB[0].bootstrapMembership = {
    kind: 'genesis',
    founders: [
      `${partitionId}-r1`,
      `${partitionId}-r2`,
      `${partitionId}-r99`,
    ],
    founderNodeIds: {
      [`${partitionId}-r1`]: 'node-a',
      [`${partitionId}-r2`]: 'node-b',
      [`${partitionId}-r99`]: 'node-c',
    },
  };
  corruptedFounderRow.steps_history = JSON.stringify(parsedHistoryB);
  // Restore node-a first, corrupt node-b
  durableRowsByTargetNodeId.set(
    'node-a',
    JSON.parse(JSON.stringify(durableRowsByTargetNodeId.get('node-c'))),
  );
  const fixedNodeARow = durableRowsByTargetNodeId.get('node-a');
  fixedNodeARow.operation_id = 'op-node-a';
  fixedNodeARow.replica_id = `${partitionId}-r1`;
  fixedNodeARow.target_node_id = 'node-a';
  durableRowsByTargetNodeId.set('node-b', corruptedFounderRow);

  entryCheck = true;
  await t.rejects(
    engineAttempt2.provisionInitialTablePartition({
      tableId,
      tableName: 'cohort_events',
      tableMetadata,
      partitionId,
      partitionMetadata,
      replicaCount: 3,
      schemaJobId: 'schema-job-cohort-1',
    }),
    {code: QUERY_ERROR_CODE.BOOTSTRAP_COHORT_CONFLICT},
    'Equal-length cohort with differing founder replica identity must be rejected as BOOTSTRAP_COHORT_CONFLICT',
  );

  // Negative Control C: Identical founder replica IDs but conflicting founderNodeIds mapping
  const parsedHistoryC = JSON.parse(corruptedFounderRow.steps_history);
  parsedHistoryC[0].replicaIds = [
    `${partitionId}-r1`,
    `${partitionId}-r2`,
    `${partitionId}-r3`,
  ];
  parsedHistoryC[0].bootstrapMembership = {
    kind: 'genesis',
    founders: [
      `${partitionId}-r1`,
      `${partitionId}-r2`,
      `${partitionId}-r3`,
    ],
    founderNodeIds: {
      [`${partitionId}-r1`]: 'node-a',
      [`${partitionId}-r2`]: 'node-b',
      [`${partitionId}-r3`]: 'node-rogue',
    },
  };
  corruptedFounderRow.steps_history = JSON.stringify(parsedHistoryC);
  durableRowsByTargetNodeId.set('node-b', corruptedFounderRow);

  entryCheck = true;
  await t.rejects(
    engineAttempt2.provisionInitialTablePartition({
      tableId,
      tableName: 'cohort_events',
      tableMetadata,
      partitionId,
      partitionMetadata,
      replicaCount: 3,
      schemaJobId: 'schema-job-cohort-1',
    }),
    {code: QUERY_ERROR_CODE.BOOTSTRAP_COHORT_CONFLICT},
    'Conflicting founderNodeIds mapping must be rejected as BOOTSTRAP_COHORT_CONFLICT',
  );
});

// A compact provisioning seam: the real engine plans against a serving
// cohort the test changes between attempts, and a coordinator that keeps
// one durable operation per (schema job, target node) intent and answers
// the authoritative per-partition operation read from them.
function createCohortProvisioningSeam(coordinatorOverrides = {}) {
  const tableId = 'tbl-cohort-replan';
  const partitionId = `${tableId}-p1`;
  const seam = {
    partitionId,
    tableMetadata: {table_id: tableId, table_name: 'cohort_replan'},
    nodes: ['node-a', 'node-b', 'node-c'],
    operationsByNodeId: new Map(),
    createCalls: [],
    executeCalls: [],
    replicaIdOf: (nodeId) => `${partitionId}-r-${nodeId}`,
  };
  const nodeRows = () => seam.nodes.map((nodeId) =>
    ({node_id: nodeId, status: 'active'}));
  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    has: () => false,
    get: () => null,
    filter: (type, predicate) =>
      (type === TABLES.NODES ? nodeRows().filter(predicate) : []),
    getAll: (type) => (type === TABLES.NODES ? nodeRows() : []),
  };
  seam.provision = async (context = {}) => {
    const engine = new SQLQueryEngine({
      nodeId: 'node-a',
      systemCache: cache,
      controlPlaneReadinessService: createProvisioningReadyService(nodeRows),
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator: {
        async getOperationsByEntity() {
          return [...seam.operationsByNodeId.values()];
        },
        async createOperation(move) {
          seam.createCalls.push(move.nodeId);
          if (!seam.operationsByNodeId.has(move.nodeId)) {
            seam.operationsByNodeId.set(move.nodeId, {
              operationId: move.operationIntentId,
              type: move.type,
              replicaId: seam.replicaIdOf(move.nodeId),
              targetNodeId: move.nodeId,
              nodeId: move.nodeId,
              partitionId,
              status: 'PENDING',
              workflowStep: WORKFLOW_STEP.PENDING,
              createdAt: 1000,
              stepsHistory: [{step: WORKFLOW_STEP.PENDING,
                bootstrapTopologyDispatchDeferred: true}],
            });
          }
          return seam.operationsByNodeId.get(move.nodeId);
        },
        async persistOperationUpdate() {},
        async dispatchOperation(operation) {
          return this.executeOperation(operation);
        },
        async executeOperation(operation) {
          seam.executeCalls.push(operation.targetNodeId);
          operation.workflowStep = WORKFLOW_STEP.CREATING;
          return {success: true};
        },
        ...coordinatorOverrides,
      },
    });
    engine.waitForPartitionServiceMetadata = async () => {};
    engine.waitForPartitionLeaderService = async () => {};
    // The founders never become routable in this seam: every attempt ends at
    // the routable-count wait with the provisioning timeout.
    engine.waitForRoutablePartitionServiceCount = async () => {
      throw Object.assign(new Error('Timed out waiting for routable ' +
        `partition service for partition ${partitionId}`),
      {code: QUERY_ERROR_CODE.TIMEOUT});
    };
    try {
      await engine.provisionInitialTablePartition({
        tableId,
        tableName: 'cohort_replan',
        tableMetadata: seam.tableMetadata,
        partitionId,
        replicaCount: 3,
        schemaJobId: 'schema-job-cohort-replan',
        ...context,
      });
      return null;
    } catch (error) {
      return error;
    }
  };
  return seam;
}

const FOUNDER_NODES = ['node-a', 'node-b', 'node-c'];

// S9 (R10, R14): a retry of the same schema job consumes the founding
// cohort its durable bootstrap operations established; the serving cohort
// of the moment is a projection that may have changed. The planner would
// take the first three nodes of the current cohort (ordered by node id, the
// local node first), so a node that joins and sorts before a founder, or a
// founder's node that leaves while a spare exists, used to make the retry
// plan a founder the genesis stamp does not name: BOOTSTRAP_COHORT_CONFLICT,
// a terminal CREATE TABLE, and a new undispatched operation left behind.
test('a retry of the same schema job attaches to the established genesis ' +
  'cohort whatever the serving cohort has become', async (t) => {
  const replans = {
    'a node joins that sorts before a founder':
      ['node-a', 'node-ab', 'node-b', 'node-c'],
    'a founder\'s node leaves the serving cohort and a spare exists':
      ['node-a', 'node-b', 'node-d'],
    'no founder is in the serving cohort any more':
      ['node-x', 'node-y', 'node-z'],
  };
  for (const [name, nodes] of Object.entries(replans)) {
    const seam = createCohortProvisioningSeam();
    const first = await seam.provision();
    t.equal(first?.code, QUERY_ERROR_CODE.TIMEOUT,
      `${name}: setup: attempt 1 stamps and dispatches, then times out`);
    t.same(seam.executeCalls, FOUNDER_NODES,
      `${name}: setup: attempt 1 founded on a, b, c`);
    seam.nodes = nodes;
    seam.createCalls.length = 0;
    const retry = await seam.provision();
    t.equal(retry?.code, QUERY_ERROR_CODE.TIMEOUT,
      `${name}: the retry waits on the established founders ` +
      `(${retry?.message})`);
    t.same(seam.createCalls, FOUNDER_NODES,
      `${name}: the retry attaches to the founders' operations only`);
    t.same([...seam.operationsByNodeId.keys()], FOUNDER_NODES,
      `${name}: no operation exists for a node that is not a founder`);
    t.same(seam.executeCalls, FOUNDER_NODES,
      `${name}: nothing was dispatched again`);
  }
});

// BOOTSTRAP_COHORT_CONFLICT is left for a genuinely different intent: the
// same identity asked for with bootstrap metadata the established
// operations do not carry. It is permanent, and it creates nothing.
test('conflicting bootstrap metadata for an established cohort is a ' +
  'permanent BOOTSTRAP_COHORT_CONFLICT', async (t) => {
  const seam = createCohortProvisioningSeam();
  await seam.provision();
  seam.createCalls.length = 0;
  const conflict = await seam.provision({
    tableMetadata: {table_id: 'tbl-another-intent', table_name: 'other'},
  });
  t.equal(conflict?.code, QUERY_ERROR_CODE.BOOTSTRAP_COHORT_CONFLICT,
    `the different intent is refused (${conflict?.message})`);
  t.equal(classifyTypedDistributedFailure(conflict), 'terminal',
    'the refusal is permanent');
  t.same(seam.createCalls, [], 'the refusal is decided before any planning');
});

// The established cohort is read from the operation owner. A read the owner
// defers is not an empty cohort: provisioning refuses with a typed retryable
// answer and plans nothing from the serving cohort.
test('a deferred read of the durable bootstrap operations is a typed ' +
  'retryable refusal, never an unfounded partition', async (t) => {
  const seam = createCohortProvisioningSeam({
    async getOperationsByEntity() {
      throw Object.assign(
        new Error('Authoritative operation visibility deferred'),
        {rebalanceSkipReason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          retryAfterMs: 250});
    },
  });
  const deferred = await seam.provision();
  t.equal(deferred?.code,
    QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE);
  t.equal(isTransientProvisioningError(deferred), true,
    'the schema job stays PENDING');
  t.same(seam.createCalls, [], 'nothing was planned');
  const broken = createCohortProvisioningSeam({
    async getOperationsByEntity() {
      throw new Error('operation rows are malformed');
    },
  });
  t.equal((await broken.provision())?.message, 'operation rows are malformed',
    'any other read failure surfaces as it is');
});

// S8: whether an operation is dispatched is decided from its durable
// workflow step. The engine holds the rebalance coordinator, whose contract
// has no deferred-retry query (that state lives with the workflow owner), so
// a method of that name on the coordinator is never consulted.
test('provisioning dispatch does not consult a deferred-retry method the ' +
  'coordinator contract does not have', async (t) => {
  const skipped = createCohortProvisioningSeam({
    isOperationDeferredRetryActive: () => true,
  });
  await skipped.provision();
  t.same(skipped.executeCalls, ['node-a', 'node-b', 'node-c'],
    'every PENDING founding operation is dispatched');
  const refused = createCohortProvisioningSeam({
    isOperationDeferredRetryActive: () => true,
    async executeOperation() {
      return {success: false, error: 'create refused',
        errorCode: 'REPLICA_OWNER_CONFLICT'};
    },
  });
  const error = await refused.provision({minimumRoutableReplicaCount: 3});
  t.same({message: error?.message, errorCode: error?.errorCode,
    deferRetry: error?.deferRetry ?? null},
  {message: 'create refused', errorCode: 'REPLICA_OWNER_CONFLICT',
    deferRetry: null},
  'a refused dispatch carries its own answer, with no invented retry signal');
});
