/**
 * Guard for the receiver-side partition fence: a data-local dispatch
 * carries the CDC-visible ownership/epoch tokens resolved at dispatch
 * time, and THIS node re-asserts them against its own cache rows before
 * anything executes. Ownership moved, topology epoch bumped, non-NORMAL
 * state, or a fence naming a different node all refuse typed
 * TARGET_STALE (retryable, preserveReplicaState, invoked=false); a
 * current fence admits the invocation; an absent fence is a
 * non-data-local dispatch and asserts nothing.
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {handleCallCellInvocation} from
  '../../src/node/runtime-service-call-cell-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
} from '../../src/service/call-cell-routing-contract.js';

const NODE_ID = 'fence-node-a';
const OTHER_NODE_ID = 'fence-node-b';
const TENANT_ID = 'tenant-1';
const SERVICE_ID = 'svc-fence';
const REPLICA_ID = `${SERVICE_ID}-r1`;
const PARTITION_ID = 'shard_ratings-p1';
const TABLE_NAME = 'shard_ratings';
const CALL_RESULT = '"fence-ok"';

function currentFence() {
  return {
    activePartitionVersion: 1,
    hostNodeId: NODE_ID,
    partitionId: PARTITION_ID,
    partitionReplicaId: PARTITION_ID,
    partitionState: 'NORMAL',
    partitionVersion: 1,
  };
}

function makeHandler(partitionRowOverrides = {}) {
  const partitionRow = {
    leader_node_id: NODE_ID,
    partition_id: PARTITION_ID,
    partition_version: 1,
    state: 'NORMAL',
    table_id: TABLE_NAME,
    table_name: TABLE_NAME,
    ...partitionRowOverrides,
  };
  const route = {
    bindingDigest: 'digest-1',
    bindingVersionId: 'bv-1',
    hostNodeId: NODE_ID,
    name: SERVICE_ID,
    nodeId: NODE_ID,
    replicaId: REPLICA_ID,
    serviceId: SERVICE_ID,
    statement: `SELECT id FROM ${TABLE_NAME}`,
    targetAddress: `${NODE_ID}/service/runtime-service-handler`,
    targetNodeId: NODE_ID,
    tenantId: TENANT_ID,
  };
  return {
    route,
    handler: {
      callBindingRouteResolver: {
        assertSelectedRoute: () => ({nodeId: NODE_ID}),
      },
      cdcIntegrationService: {},
      localReplicas: new Map([[REPLICA_ID, {
        entityId: SERVICE_ID,
        replicaHandle: {serviceId: SERVICE_ID},
        status: ReplicaStatus.ACTIVE,
      }]]),
      nodeId: NODE_ID,
      partitionServicesProvider: () => null,
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === SYSTEM_TABLE_NAME.PARTITIONS &&
              key === PARTITION_ID) {
            return partitionRow;
          }
          return null;
        },
      },
      serviceRuntimeLifecycle: {
        async health() {
          return {status: 'healthy'};
        },
        async invoke() {
          return {partials: [], result: CALL_RESULT};
        },
      },
    },
  };
}

function makeEnvelope(route, fence) {
  return {
    metadata: {roles: ['application']},
    principal: 'alice',
    tenantId: TENANT_ID,
    payload: {
      batch: [],
      call: {arguments: '{}', name: SERVICE_ID},
      invocation: {
        deadlineMs: Date.now() + 60000,
        exportName: 'run',
        id: 'call-invocation-fence-1#slot-1',
        intentDigest: 'intent-1',
      },
      partitionFence: fence,
      partitionId: PARTITION_ID,
      route,
    },
  };
}

test('a current fence admits the invocation', async () => {
  const {handler, route} = makeHandler();
  const response = await handleCallCellInvocation(
    handler, makeEnvelope(route, currentFence()));
  assert.equal(response.processed, true);
  assert.equal(response.componentResult, CALL_RESULT);
});

test('an absent fence asserts nothing (non-data-local dispatch)',
  async () => {
    const {handler, route} = makeHandler();
    const response = await handleCallCellInvocation(
      handler, makeEnvelope(route, undefined));
    assert.equal(response.processed, true);
  });

for (const [label, partitionRowOverrides, fenceOverrides] of [
  ['ownership moved to another node', {leader_node_id: OTHER_NODE_ID}, {}],
  ['topology epoch bumped by split/merge', {partition_version: 2}, {}],
  ['partition left NORMAL state', {state: 'SPLITTING'}, {}],
  ['the fence names a node this receiver is not',
    {}, {hostNodeId: OTHER_NODE_ID}],
]) {
  test(`${label} refuses typed TARGET_STALE before anything executes`,
    async () => {
      const {handler, route} = makeHandler(partitionRowOverrides);
      const response = await handleCallCellInvocation(
        handler,
        makeEnvelope(route, {...currentFence(), ...fenceOverrides}),
      );
      assert.equal(response.processed, false);
      assert.equal(
        response.invocationOutcome.code,
        CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
      );
      assert.equal(
        response.invocationOutcome.classification,
        CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
      );
      assert.equal(response.invocationOutcome.invoked, false,
        'nothing reached the component');
    });
}
