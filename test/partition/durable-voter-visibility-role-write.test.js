import {test} from '../../src/test-helpers/tap.js';
import {PartitionServiceCoreBase} from
  '../../src/partition/partition-service-core-base.js';
import {createPartitionServiceMetadataDeliveryMethods} from
  '../../src/partition/partition-service-metadata-delivery-methods.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {evaluateOperationLedgerQuorumConcentration} from
  '../../src/rebalancer/operation-ledger-quorum-concentration.js';

// Quest formation-ledger-post-spread-voter-visibility-latency (affinity-demo
// run-27): a promoted priority-control-plane replica's durable
// services.raft_role write was SILENTLY LOST — the CL-035 voter-ready seed
// upserts the promoted role into the LOCAL cache row, and the role-mutation
// helper's cache-equality dedup (syncFromCache) then treats that local seed as
// proof of durable persistence and drops its pending write. The whole cluster
// (including the hosting node's own quorum-concentration evaluation) keeps
// reading the replica as a LEARNER forever: the quorum-spread admission hold
// never releases, the spread planner computes overTarget=false, and the demo
// CREATE TABLE starves. These guards drive the REAL production wiring
// (createRoleMutationHelper / seedLocalReplicaVoterRaftRole via prototype
// calls on contract-faithful substrates) — not by-fiat cache rows.

const SERVICES = 'services';
const NODES = 'nodes';
const PARTITIONS = 'partitions';
const LEDGER_PARTITION_ID = 'replica_operations-p1';

function rowKey(tableName, row) {
  if (tableName === SERVICES) {
    return row.service_id;
  }
  if (tableName === NODES) {
    return row.node_id;
  }
  if (tableName === PARTITIONS) {
    return row.partition_id;
  }
  throw new Error(`unexpected table ${tableName}`);
}

/**
 * Contract-faithful cache fake: newer-updated_at-wins field merge (the real
 * row-merge stale-guard that protects the CL-035 seed from older
 * authoritative refreshes), plus the filter/get surface the evaluator and the
 * helper callbacks read.
 */
function createCacheFake() {
  const tables = new Map();
  const tableMap = (tableName) => {
    if (!tables.has(tableName)) {
      tables.set(tableName, new Map());
    }
    return tables.get(tableName);
  };
  return {
    get(tableName, key) {
      return tableMap(tableName).get(key) || null;
    },
    filter(tableName, predicate) {
      return [...tableMap(tableName).values()].filter((row) =>
        predicate(row),
      );
    },
    applySystemTableChange(tableName, _operation, data) {
      const key = rowKey(tableName, data);
      const existing = tableMap(tableName).get(key);
      if (
        existing &&
        Number.isFinite(existing.updated_at) &&
        Number.isFinite(data.updated_at) &&
        data.updated_at < existing.updated_at
      ) {
        return; // stale-guard: an older write never clobbers a newer row
      }
      tableMap(tableName).set(key, {...existing, ...data});
    },
    deleteRow(tableName, key) {
      tableMap(tableName).delete(key);
    },
  };
}

/**
 * Contract-faithful durable services store + CDC integration fake:
 * - updateSystemTableRow applies WHERE-equality CAS semantics and returns an
 *   honest affectedRows count (the run-15 lineage contract);
 * - a successful durable write propagates to the subscribed caches (the CDC
 *   round-trip), through the same stale-guarded merge;
 * - refreshAuthoritativeCacheRow repairs a cache row FROM the durable store
 *   (also stale-guarded — the seed out-versions it, which is exactly why the
 *   fix must CAS-guard from the authoritative ROW, not the merged cache);
 * - executeAuthoritativeSystemTableRead is the read-only authoritative point
 *   read (the fix's capability gate + comparison source).
 */
function createDurableStoreFake({caches}) {
  const rows = new Map();
  const propagate = (row) => {
    for (const cache of caches) {
      cache.applySystemTableChange(SERVICES, 'upsert', {...row});
    }
  };
  return {
    rows,
    seedDurableRow(row) {
      rows.set(row.service_id, {...row});
      propagate({...row});
    },
    removeDurableRow(serviceId) {
      rows.delete(serviceId);
      for (const cache of caches) {
        cache.deleteRow(SERVICES, serviceId);
      }
    },
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data) {
        if (tableName !== SERVICES) {
          throw new Error(`unexpected table ${tableName}`);
        }
        let affectedRows = 0;
        for (const [serviceId, row] of rows) {
          const matches = Object.entries(whereClause).every(
            ([field, value]) => row[field] === value,
          );
          if (matches) {
            rows.set(serviceId, {...row, ...data});
            affectedRows += 1;
            propagate(rows.get(serviceId));
          }
        }
        return {success: true, affectedRows};
      },
      async refreshAuthoritativeCacheRow(tableName, key) {
        const row = rows.get(key);
        if (!row) {
          return false;
        }
        for (const cache of caches) {
          cache.applySystemTableChange(tableName, 'upsert', {...row});
        }
        return true;
      },
      async executeAuthoritativeSystemTableRead(tableName, _sql, params) {
        if (tableName !== SERVICES) {
          throw new Error(`unexpected table ${tableName}`);
        }
        const row = rows.get(params[0]);
        return {success: true, rows: row ? [{...row}] : []};
      },
    },
  };
}

/**
 * Build the REAL role-mutation helper exactly as the partition service wires
 * it (prototype call on a contract-faithful self), so the CAS guard shape,
 * dedup callbacks, and recovery paths under test are production code.
 */
function createRoleHelperForReplica({replicaId, cache, store, warns}) {
  const svc = {
    replicaId,
    partitionId: LEDGER_PARTITION_ID,
    systemTableCache: cache,
    cdcIntegrationService: store.cdcIntegrationService,
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: (tableName, sql, params, options) =>
        store.cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options,
        ),
    },
    pendingRoleUpdate: null,
    logger: {
      warn: (msg, ctx) => warns.push({msg, ctx}),
      info: () => {},
      debug: () => {},
      error: (msg, ctx) => warns.push({msg, ctx}),
    },
    isServicesLeaderAvailable: () => true,
  };
  // Wire the REAL metadata-delivery mixin methods the helper wiring consults
  // (getMetadataPublicationReadinessDimension) plus the core-base guard-row
  // refresh, so the wiring under test is production code.
  const deliveryMethods = createPartitionServiceMetadataDeliveryMethods();
  svc.getMetadataPublicationReadinessDimension =
    deliveryMethods.getMetadataPublicationReadinessDimension.bind(svc);
  svc.refreshMetadataPublicationGuardRow =
    PartitionServiceCoreBase.prototype.refreshMetadataPublicationGuardRow
      .bind(svc);
  return PartitionServiceCoreBase.prototype.createRoleMutationHelper.call(svc);
}

/**
 * queue() fires an un-awaited flush; concurrent explicit flushes report
 * in-flight. Settle deterministically: keep flushing until the pending value
 * drains or the spin bound trips (the bound keeps livelock regressions loud
 * instead of hanging the suite).
 */
async function settleHelper(helper, maxSpins = 10) {
  for (let spin = 0; spin < maxSpins; spin += 1) {
    const result = await helper.flush();
    if (result.reason !== 'in-flight' && helper.pendingValue === null) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function seedPromotedRoleViaRealHandlerSeam({replicaId, cache, markedLocalOnly}) {
  const handler = {
    systemTableCache: cache,
    getTrackedReplicaRole: () => RAFT_ROLE.FOLLOWER,
    replicaStateMachine: {
      markServiceRowLocalOnly: (serviceId) => markedLocalOnly.push(serviceId),
    },
  };
  return ReplicaHandler.prototype.seedLocalReplicaVoterRaftRole.call(
    handler,
    replicaId,
    LEDGER_PARTITION_ID,
  );
}

function ledgerServiceRow({replicaId, nodeId, raftRole, updatedAt}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: LEDGER_PARTITION_ID,
    service_type: 'partition',
    node_id: nodeId,
    status: 'active',
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
    updated_at: updatedAt,
  };
}

test('durable voter visibility - CL-035 local seed must not mask the durable raft_role write', async (t) => {
  const replicaId = `${LEDGER_PARTITION_ID}-r4`;
  const cache = createCacheFake();
  const store = createDurableStoreFake({caches: [cache]});
  const warns = [];
  const markedLocalOnly = [];

  // Durable + cache state: the replica's services row exists as LEARNER
  // (the lifecycle create write landed; promotion has not).
  store.seedDurableRow(
    ledgerServiceRow({
      replicaId,
      nodeId: 'node-3',
      raftRole: RAFT_ROLE.LEARNER,
      updatedAt: 1000,
    }),
  );

  // Run-27 interleaving: the replica handler's voter-ready poll observes the
  // in-memory promotion and applies the CL-035 local seed BEFORE the role
  // helper's queued flush runs (becomeFollower flips the in-memory role
  // synchronously; the helper flush is a microtask behind).
  const seeded = seedPromotedRoleViaRealHandlerSeam({
    replicaId,
    cache,
    markedLocalOnly,
  });
  t.equal(seeded, true, 'the CL-035 seed applies to the existing row');
  t.equal(
    cache.get(SERVICES, replicaId).raft_role,
    RAFT_ROLE.FOLLOWER,
    'local cache row now reads the promoted role (seeded, not durable)',
  );

  const helper = createRoleHelperForReplica({replicaId, cache, store, warns});
  helper.queue(RAFT_ROLE.FOLLOWER);
  await settleHelper(helper);
  helper.shutdown();

  // THE quest assertion (RED on head): the durable row must converge to the
  // promoted role — a locally seeded cache row is not durability evidence.
  t.equal(
    store.rows.get(replicaId).raft_role,
    RAFT_ROLE.FOLLOWER,
    'durable services row converges to the promoted role despite the seed',
  );
});

test('durable voter visibility - CAS-miss retry must re-guard from the authoritative row (anti-livelock)', async (t) => {
  const replicaId = `${LEDGER_PARTITION_ID}-r4`;
  const cache = createCacheFake();
  const store = createDurableStoreFake({caches: [cache]});
  const warns = [];
  const markedLocalOnly = [];

  // Divergence run-27 exhibited: the durable row was (re)written by the
  // lifecycle path with a NEWER updated_at than the cache's guard snapshot,
  // so the helper's first CAS UPDATE zero-rows.
  cache.applySystemTableChange(
    SERVICES,
    'upsert',
    ledgerServiceRow({
      replicaId,
      nodeId: 'node-3',
      raftRole: RAFT_ROLE.LEARNER,
      updatedAt: 1000,
    }),
  );
  store.rows.set(
    replicaId,
    ledgerServiceRow({
      replicaId,
      nodeId: 'node-3',
      raftRole: RAFT_ROLE.LEARNER,
      updatedAt: 2000,
    }),
  );

  const helper = createRoleHelperForReplica({replicaId, cache, store, warns});
  helper.queue(RAFT_ROLE.FOLLOWER);

  // Between the queue and the settle, the CL-035 seed lands (newer
  // updated_at than any authoritative refresh — the cache stale-guard
  // protects it, so refreshing the merged cache cannot repair the guard).
  seedPromotedRoleViaRealHandlerSeam({replicaId, cache, markedLocalOnly});

  // Drive the retries deterministically (the scheduled timer path calls the
  // same flush).
  await settleHelper(helper);
  helper.shutdown();

  t.equal(
    store.rows.get(replicaId).raft_role,
    RAFT_ROLE.FOLLOWER,
    'retry converges the durable row (guards from the authoritative row, ' +
      'not the seed-protected merged cache)',
  );
});

test('durable voter visibility - quorum-spread hold releases once cure moves complete (coordinator view)', async (t) => {
  // Run-27 shape: bootstrap concentrated r1,r2,r3 on the seed; cure REPLACEs
  // move two replicas off (r4/node-3 then r5/node-2, sources removed). The
  // COORDINATOR cache never holds local seeds — it sees only durable rows.
  // On head the promoted replacements stay durable LEARNERS (masked role
  // writes), so the hold can never release; with the fix the durable writes
  // land and the evaluation releases.
  const coordinatorCache = createCacheFake();
  const hostCacheR4 = createCacheFake();
  const hostCacheR5 = createCacheFake();
  const store = createDurableStoreFake({
    caches: [coordinatorCache, hostCacheR4, hostCacheR5],
  });
  const warns = [];

  for (const nodeId of ['node-0', 'node-1', 'node-2', 'node-3', 'node-4']) {
    coordinatorCache.applySystemTableChange(NODES, 'upsert', {
      node_id: nodeId,
      connection_state: 'ready',
      updated_at: 1,
    });
  }
  coordinatorCache.applySystemTableChange(PARTITIONS, 'upsert', {
    partition_id: LEDGER_PARTITION_ID,
    replica_count: 3,
    updated_at: 1,
  });

  for (const [replicaId, nodeId, role] of [
    [`${LEDGER_PARTITION_ID}-r1`, 'node-0', RAFT_ROLE.LEADER],
    [`${LEDGER_PARTITION_ID}-r2`, 'node-0', RAFT_ROLE.FOLLOWER],
    [`${LEDGER_PARTITION_ID}-r3`, 'node-0', RAFT_ROLE.FOLLOWER],
  ]) {
    store.seedDurableRow(
      ledgerServiceRow({replicaId, nodeId, raftRole: role, updatedAt: 10}),
    );
  }

  const engagedBefore =
    evaluateOperationLedgerQuorumConcentration(coordinatorCache);
  t.equal(
    engagedBefore.holdEngaged,
    true,
    'fully seed-concentrated bootstrap engages the hold (control)',
  );

  // Cure move 1: REPLACE r1 -> r4(node-3). Create lands the durable LEARNER
  // row; promotion goes through the REAL seed + role-helper machinery on the
  // hosting node; then the source is removed.
  const runCure = async ({newReplicaId, hostCache, hostNodeId, removedId}) => {
    store.seedDurableRow(
      ledgerServiceRow({
        replicaId: newReplicaId,
        nodeId: hostNodeId,
        raftRole: RAFT_ROLE.LEARNER,
        updatedAt: 20,
      }),
    );
    const markedLocalOnly = [];
    seedPromotedRoleViaRealHandlerSeam({
      replicaId: newReplicaId,
      cache: hostCache,
      markedLocalOnly,
    });
    const helper = createRoleHelperForReplica({
      replicaId: newReplicaId,
      cache: hostCache,
      store,
      warns,
    });
    helper.queue(RAFT_ROLE.FOLLOWER);
    await settleHelper(helper);
    helper.shutdown();
    store.removeDurableRow(removedId);
  };

  await runCure({
    newReplicaId: `${LEDGER_PARTITION_ID}-r4`,
    hostCache: hostCacheR4,
    hostNodeId: 'node-3',
    removedId: `${LEDGER_PARTITION_ID}-r1`,
  });
  await runCure({
    newReplicaId: `${LEDGER_PARTITION_ID}-r5`,
    hostCache: hostCacheR5,
    hostNodeId: 'node-2',
    removedId: `${LEDGER_PARTITION_ID}-r3`,
  });

  // Physical end state: voters r2(node-0), r4(node-3), r5(node-2) — spread.
  // THE quest assertion (RED on head): the coordinator's actuals-only
  // evaluation must release once the durable role writes land.
  const evaluation =
    evaluateOperationLedgerQuorumConcentration(coordinatorCache);
  t.equal(
    evaluation.holdEngaged,
    false,
    'the quorum-spread hold releases once the cure moves complete and the ' +
      'promoted roles are durably visible',
  );
});

test('durable voter visibility - in-flight learner flush superseded during readAuthoritativeRoleRow is fenced and followed by voter flush', async (t) => {
  const replicaId = `${LEDGER_PARTITION_ID}-r6`;
  const cache = createCacheFake();
  const store = createDurableStoreFake({caches: [cache]});
  const warns = [];

  store.seedDurableRow(
    ledgerServiceRow({
      replicaId,
      nodeId: 'node-3',
      raftRole: null,
      updatedAt: 1000,
    }),
  );

  let releaseFirstProbe;
  const firstProbeGate = new Promise((resolve) => {
    releaseFirstProbe = resolve;
  });
  let readCallCount = 0;
  const originalRead =
    store.cdcIntegrationService.executeAuthoritativeSystemTableRead;
  store.cdcIntegrationService.executeAuthoritativeSystemTableRead = async (
    tableName,
    sql,
    params,
    options,
  ) => {
    readCallCount += 1;
    if (readCallCount === 1) {
      await firstProbeGate;
    }
    return originalRead(tableName, sql, params, options);
  };

  const writtenRoles = [];
  const originalUpdate = store.cdcIntegrationService.updateSystemTableRow;
  store.cdcIntegrationService.updateSystemTableRow = async (
    tableName,
    whereClause,
    data,
  ) => {
    writtenRoles.push(data.raft_role);
    return originalUpdate(tableName, whereClause, data);
  };

  const helper = createRoleHelperForReplica({replicaId, cache, store, warns});
  // Start an in-flight learner flush that pauses inside readAuthoritativeRoleRow.
  helper.queue(RAFT_ROLE.LEARNER);
  await new Promise((resolve) => setTimeout(resolve, 5));
  t.equal(helper.inFlight, true, 'initial learner flush is in flight');

  // While the authoritative probe for learner is in flight, the replica
  // promotes to follower and queues the voter role.
  helper.queue(RAFT_ROLE.FOLLOWER);
  releaseFirstProbe();

  await settleHelper(helper);
  helper.shutdown();

  t.same(
    writtenRoles,
    [RAFT_ROLE.FOLLOWER],
    'superseded learner flush is fenced before submitMutation and only follower is written',
  );
  t.equal(
    store.rows.get(replicaId).raft_role,
    RAFT_ROLE.FOLLOWER,
    'durable row converges to follower without regressing to learner',
  );
});

test('durable voter visibility - ReplicaStateMachine preserves voter raft_role across buildUpdateCdcData and buildCreateCdcData for the same replica identity', async (t) => {
  const replicaId = `${LEDGER_PARTITION_ID}-r7`;
  const cache = createCacheFake();
  cache.applySystemTableChange(
    SERVICES,
    'upsert',
    ledgerServiceRow({
      replicaId,
      nodeId: 'node-3',
      raftRole: RAFT_ROLE.FOLLOWER,
      updatedAt: 1000,
    }),
  );

  const stateMachine = new ReplicaStateMachine({
    nodeId: 'node-3',
    systemTableCache: cache,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true, affectedRows: 1}),
    },
  });

  const replicaState = {
    replicaId,
    serviceId: replicaId,
    replicaIdentity: replicaId,
    partitionId: LEDGER_PARTITION_ID,
    nodeId: 'node-3',
    state: 'active',
    stateEnteredAt: 2000,
    triggerReason: 'voter_ready',
    createdAt: 1000,
  };

  const updatePayload = stateMachine._buildUpdateCdcData(
    replicaState,
    'syncing',
  );
  t.equal(
    updatePayload.raft_role,
    RAFT_ROLE.FOLLOWER,
    'buildUpdateCdcData preserves voter raft_role for the same replica identity',
  );

  const createPayload = stateMachine._buildCreateCdcData(
    replicaState,
    replicaId,
    'partition',
    'node-3/partition/r7',
  );
  t.equal(
    createPayload.raft_role,
    RAFT_ROLE.FOLLOWER,
    'buildCreateCdcData preserves voter raft_role for the same replica identity',
  );

  const mismatchedIdentityPayload = stateMachine._buildUpdateCdcData(
    {
      ...replicaState,
      replicaIdentity: `${replicaId}#gen-2`,
    },
    'syncing',
  );
  t.equal(
    mismatchedIdentityPayload.raft_role,
    undefined,
    'buildUpdateCdcData does not copy raft_role across different replica identities',
  );

  // Stale cached leader role after stepdown to follower must never be
  // republished by lifecycle writes or by an in-flight stale role flush.
  cache.applySystemTableChange(
    SERVICES,
    'upsert',
    ledgerServiceRow({
      replicaId,
      nodeId: 'node-3',
      raftRole: RAFT_ROLE.LEADER,
      updatedAt: 3000,
    }),
  );
  const unconfirmedCachedLeaderUpdate = stateMachine._buildUpdateCdcData(
    replicaState,
    'syncing',
  );
  t.equal(
    unconfirmedCachedLeaderUpdate.raft_role,
    undefined,
    'unconfirmed cached leader role is not copied into lifecycle UPDATE payload',
  );
  const liveFollowerPayload = stateMachine._buildUpdateCdcData(
    {
      ...replicaState,
      raftRole: RAFT_ROLE.FOLLOWER,
    },
    'syncing',
  );
  t.equal(
    liveFollowerPayload.raft_role,
    RAFT_ROLE.FOLLOWER,
    'live follower role overrides stale cached leader role in lifecycle payload',
  );
  await stateMachine.clear();
});
