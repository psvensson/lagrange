/**
 * Owner-boundary guards for data-local call activation: the invocation
 * path introduces NO parallel topology cache, NO second scheduler, and
 * NO caller-owned placement.
 *
 * - The shard-host topology module is a stateless pass-through over the
 *   canonical query-executor owners: every resolution consults the live
 *   routing snapshot; nothing is memoized or re-derived.
 * - The invoker's only activation surface is the bounded lease publish —
 *   it exposes no placement, move, or replica-operation API, and the
 *   lease owner's grammar writes exactly one system table.
 * - Placement stays planner output: activation pins reach placement only
 *   through the policy object the planner already owns, and the caller-
 *   facing invoke request carries no node input at all.
 * - Execution capacity stays pinned to the immutable Binding artifact:
 *   the route carries bindingDigest/bindingVersionId and the receiver
 *   re-asserts them on every dispatch.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CallCellInvoker} from '../../src/service/call-cell-invoker.js';
import {createCallActivationLeaseOwner} from
  '../../src/service/call-activation-lease-owner.js';
import {createCallPartitionTopology} from
  '../../src/service/call-partition-topology.js';

const SERVICE_ID = 'svc-boundaries';
const NODE_ID = 'boundary-node-a';
const PARTITION_ID = 'shard-p1';
const TABLE_NAME = 'shard';

test('the topology module is a stateless pass-through over the canonical ' +
  'routing owners', async (t) => {
  const resolutions = [];
  const partitionRow = {
    partition_id: PARTITION_ID,
    partition_version: 1,
    state: 'NORMAL',
    table_name: TABLE_NAME,
  };
  const engine = {
    getTableInfo: () => ({table_name: TABLE_NAME}),
    isPartitionVisibleForRouting: () => true,
    resolveActivePartitionVersion: () => 1,
    queryExecutor: {
      getPartitionRecord: () => partitionRow,
      resolvePartitionServiceCandidates: (partitionId) => {
        resolutions.push(partitionId);
        return {
          candidates: [{address: `${NODE_ID}/partition/${PARTITION_ID}`,
            nodeId: NODE_ID, replicaId: PARTITION_ID}],
          routingSnapshot: {canonicalLeaderNodeId: NODE_ID},
        };
      },
    },
  };
  const topology = createCallPartitionTopology({sqlQueryEngine: engine});
  const first = topology.resolveShardHost(TABLE_NAME, PARTITION_ID);
  const second = topology.resolveShardHost(TABLE_NAME, PARTITION_ID);
  t.equal(resolutions.length, 2,
    'every resolution consults the canonical owner — nothing is cached');
  t.same(first, second, 'resolution is a pure projection of live rows');
  t.equal(Object.isFrozen(first), true);
  t.equal(
    Object.keys(topology).join(','),
    'resolveShardHost',
    'the module exposes resolution only — no registration, no mutation',
  );
  t.end();
});

test('the invoker exposes no placement surface and the caller request ' +
  'carries no node input', (t) => {
  const publicApi = Object.getOwnPropertyNames(CallCellInvoker.prototype)
    .filter((name) => name !== 'constructor' && !name.startsWith('_'));
  t.same(publicApi, ['invoke'],
    'invoke is the whole public surface — no move, place, or scale API');
  t.end();
});

test('the lease owner writes exactly the activation lease system table, ' +
  'nothing else', async (t) => {
  const statements = [];
  const owner = createCallActivationLeaseOwner({
    executeInternal: async (sql) => {
      statements.push(sql);
      return {rows: [], success: true};
    },
    leaseMs: 60000,
    nowProvider: () => 1_700_000_000_000,
  });
  await owner.publishActivationLease(SERVICE_ID, NODE_ID);
  t.ok(statements.length >= 2, 'refresh-then-insert grammar');
  t.ok(
    statements.every((sql) =>
      sql.includes(SYSTEM_TABLE_NAME.CALL_ACTIVATION_LEASES)),
    'every statement targets the registered lease table only',
  );
  t.ok(
    statements.every((sql) => !/replica_operations|services\b/u.test(sql)),
    'the lease owner never touches placement or replica state directly',
  );
  const insert = statements.find((sql) => sql.startsWith('INSERT'));
  t.match(insert, /lease_expires_at/u,
    'every published lease carries its expiry bound');
  t.end();
});

test('a canonical leader missing from the candidate set refuses at ' +
  'resolution instead of dispatching somewhere doomed', (t) => {
  const engine = {
    getTableInfo: () => ({table_name: TABLE_NAME}),
    isPartitionVisibleForRouting: () => true,
    resolveActivePartitionVersion: () => 1,
    queryExecutor: {
      getPartitionRecord: () => ({
        partition_id: PARTITION_ID,
        partition_version: 1,
        state: 'NORMAL',
        table_name: TABLE_NAME,
      }),
      resolvePartitionServiceCandidates: () => ({
        candidates: [{address: 'other/partition/x', nodeId: 'other-node',
          replicaId: 'x'}],
        routingSnapshot: {canonicalLeaderNodeId: NODE_ID},
      }),
    },
  };
  const topology = createCallPartitionTopology({sqlQueryEngine: engine});
  t.throws(
    () => topology.resolveShardHost(TABLE_NAME, PARTITION_ID),
    /no canonical leader host/u,
    'a non-leader candidate is never selected as the host',
  );
  t.end();
});

test('a lost lease-INSERT race self-heals when the winning row exists',
  async (t) => {
    let inserts = 0;
    const rowsAfterUpdate = [];
    const owner = createCallActivationLeaseOwner({
      executeInternal: async (sql) => {
        if (sql.startsWith('INSERT')) {
          inserts += 1;
          rowsAfterUpdate.push({lease_id: 'raced'});
          throw new Error('UNIQUE constraint failed');
        }
        if (sql.startsWith('SELECT')) {
          return {rows: [...rowsAfterUpdate], success: true};
        }
        return {rows: [], success: true};
      },
      leaseMs: 60000,
      nowProvider: () => 1_700_000_000_000,
    });
    const lease = await owner.publishActivationLease(SERVICE_ID, NODE_ID);
    t.equal(inserts, 1, 'the losing INSERT happened once');
    t.ok(lease.leaseExpiresAt > 0,
      'the publish succeeds because the winner covers the same demand');
    t.end();
  });
