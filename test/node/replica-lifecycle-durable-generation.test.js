/**
 * Durable lifecycle generation probe.
 *
 * These witnesses share a faithful row store: durable rows and cache
 * projections are separate, every mutation evaluates its complete predicate,
 * point reads observe only durable state, and a write may apply before its
 * acknowledgement is lost. Together they pin the single lifecycle authority
 * used by transitions, restart recovery, leader settlement and REMOVE cleanup.
 */

import {test} from '../../src/test-helpers/tap.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
import {SeedPartitionsPhase} from
  '../../src/bootstrap/phases/seed-partitions-phase.js';
import {readDurableServicesIdentitySnapshot} from
  '../../src/bootstrap/rejoin-hints-durable-evidence.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {
  ReplicaState,
  ReplicaStateMachine,
} from '../../src/node/replica-state-machine.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {RaftRsReplicaLifecycleOwner} from
  '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {
  REPLICA_CLEANUP_ACQUIRE_OUTCOME,
  REPLICA_CLEANUP_ERROR_CODE,
  ReplicaCleanupTombstoneOwner,
  isCleanupTombstoneRow,
} from '../../src/node/replica-cleanup-tombstone-owner.js';
import {
  REPLICA_STORAGE_ARTIFACT_OUTCOME,
  removeReplicaStorageArtifacts,
} from '../../src/node/replica-storage-artifacts.js';
import {
  DATA_DIRECTORY_OWNER_ERROR_CODE,
  acquireDataDirectoryProcessOwner,
  bindDataDirectoryProcessOwner,
} from '../../src/storage/data-directory-process-owner.js';
import {createStartupAcquisitionLedger} from
  '../../src/entrypoint-startup-acquisition-ledger.js';

const SERVICES = 'services';
const PARTITIONS = 'partitions';
const NODE_ID = 'test-node';

function runDataDirectoryContender(dataDir, artifactPath) {
  const ownerModuleUrl = pathToFileURL(path.resolve(
    'src/storage/data-directory-process-owner.js',
  )).href;
  const program = `
    import fs from 'node:fs';
    import {
      acquireDataDirectoryProcessOwner,
    } from ${JSON.stringify(ownerModuleUrl)};
    try {
      const owner = acquireDataDirectoryProcessOwner(
        ${JSON.stringify(dataDir)});
      fs.writeFileSync(${JSON.stringify(artifactPath)}, 'opened');
      owner.release();
      process.exitCode = 0;
    } catch (error) {
      process.exitCode = error.code ===
        ${JSON.stringify(DATA_DIRECTORY_OWNER_ERROR_CODE)} ?
        23 : 24;
    }
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath,
      ['--input-type=module', '--eval', program],
      {stdio: ['ignore', 'ignore', 'inherit']});
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });
}

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function cloneRow(row) {
  return row ? {...row} : null;
}

function mutationMatches(row, whereClause = {}) {
  return Boolean(row) && Object.entries(whereClause).every(
    ([key, value]) => row[key] === value,
  );
}

function mutationResult(applied) {
  return {
    success: true,
    outcome: applied ? 'applied' : 'observed_state_changed',
    partitionResult: {affectedRows: applied ? 1 : 0},
  };
}

function mutationKey(mutation) {
  const identity = mutation.row || mutation.whereClause || {};
  return mutation.tableName === SERVICES ?
    identity.service_id : identity.partition_id;
}

function applyRowStoreMutation(durable, mutation) {
  const table = durable[mutation.tableName];
  const key = mutationKey(mutation);
  if (mutation.operation === 'upsert') {
    table.set(key, cloneRow(mutation.row));
    return true;
  }
  const current = table.get(key) || null;
  if (mutation.operation === 'insert') {
    if (current) return false;
    table.set(key, cloneRow(mutation.row));
    return true;
  }
  const applied = mutationMatches(current, mutation.whereClause);
  if (!applied) return false;
  if (mutation.operation === 'delete') {
    table.delete(key);
  } else {
    table.set(key, {...current, ...mutation.data});
  }
  return true;
}

function createLifecycleRowStore({services = [], partitions = []} = {}) {
  const durable = {
    [SERVICES]: new Map(services.map((row) => [row.service_id, cloneRow(row)])),
    [PARTITIONS]: new Map(partitions.map((row) =>
      [row.partition_id, cloneRow(row)])),
  };
  const projection = {
    [SERVICES]: new Map(services.map((row) => [row.service_id, cloneRow(row)])),
    [PARTITIONS]: new Map(partitions.map((row) =>
      [row.partition_id, cloneRow(row)])),
  };
  const mutations = [];
  const authoritativeReads = [];
  let beforeMutation = null;
  let beforeAuthoritativeRead = null;
  let applyThenThrowStatus = null;
  let nextDeleteBehavior = null;

  const cache = {
    get(tableName, key) {
      return cloneRow(projection[tableName]?.get(key));
    },
    filter(tableName, predicate) {
      return [...(projection[tableName]?.values() || [])]
        .map(cloneRow)
        .filter(predicate);
    },
  };

  const gateway = {
    async submitMutation(mutation) {
      mutations.push(structuredClone(mutation));
      await beforeMutation?.(mutation);
      const deleteBehavior = mutation.operation === 'delete' ?
        nextDeleteBehavior : null;
      if (deleteBehavior) nextDeleteBehavior = null;
      if (deleteBehavior?.resultOnly) return deleteBehavior.result;
      const applied = applyRowStoreMutation(durable, mutation);
      if (deleteBehavior) {
        await deleteBehavior.afterApply?.(durable, mutation, applied);
        if (deleteBehavior.throwAfterApply === true) {
          throw new Error('ack-lost-after-delete-apply');
        }
        if (deleteBehavior.result) return deleteBehavior.result;
      }
      if (applied && mutation.tableName === SERVICES &&
          mutation.data?.status === applyThenThrowStatus) {
        applyThenThrowStatus = null;
        throw new Error('ack-lost-after-durable-apply');
      }
      return mutationResult(applied);
    },
    async readAuthoritativeRows(tableName, sql, params, options = {}) {
      authoritativeReads.push({tableName, options: structuredClone(options)});
      await beforeAuthoritativeRead?.(tableName, params, durable);
      if (tableName === SERVICES && sql.includes('service_type = ?')) {
        return {
          success: true,
          rows: [...durable[SERVICES].values()].filter((row) =>
            row.service_type === params[0] &&
            row.status === params[1] &&
            row.node_id === params[2]).map(cloneRow),
        };
      }
      const row = durable[tableName]?.get(params[0]);
      return {success: true, rows: row ? [cloneRow(row)] : []};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      return this.submitMutation({
        operation: 'delete',
        tableName,
        whereClause,
      });
    },
  };

  return {
    cache,
    authoritativeReads,
    durable,
    gateway,
    mutations,
    project(tableName, row) {
      projection[tableName].set(
        tableName === SERVICES ? row.service_id : row.partition_id,
        cloneRow(row),
      );
    },
    setBeforeMutation(hook) {
      beforeMutation = hook;
    },
    setBeforeAuthoritativeRead(hook) {
      beforeAuthoritativeRead = hook;
    },
    setApplyThenThrowStatus(status) {
      applyThenThrowStatus = status;
    },
    setNextDeleteBehavior(behavior) {
      nextDeleteBehavior = behavior;
    },
  };
}

function serviceRow(replicaId, status, version, partitionId = 'partition-1') {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: NODE_ID,
    address: `${NODE_ID}/partition/${replicaId}`,
    status,
    state_entered_at: version,
    updated_at: version,
  };
}

function partitionRow(partitionId = 'partition-1') {
  return {partition_id: partitionId, leader_node_id: NODE_ID, updated_at: 1};
}

function createStateMachine(store, options = {}) {
  return new ReplicaStateMachine({
    nodeId: NODE_ID,
    systemTableCache: store.cache,
    controlPlaneSystemTableGateway: store.gateway,
    ...options,
  });
}

function registerRow(stateMachine, row) {
  const durableVersionColumn = Number.isFinite(row.state_entered_at) ?
    'state_entered_at' : 'updated_at';
  return stateMachine.registerReplicaSnapshot(row.service_id, {
    partitionId: row.partition_id,
    nodeId: row.node_id,
    state: row.status,
    serviceId: row.service_id,
    serviceType: row.service_type,
    serviceAddress: row.address,
    durableVersionColumn,
    durableVersion: row[durableVersionColumn],
    durableUpdatedAt: row.updated_at,
  });
}

function createHandler(store, stateMachine, outcomes = []) {
  return new ReplicaHandler({
    nodeId: NODE_ID,
    dataDir: '/tmp/replica-lifecycle-durable-generation',
    systemTableCache: store.cache,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: store.gateway,
    replicaStateMachine: stateMachine,
    createPartitionService: async () => ({}),
    executorOutcomeEmitter: {
      emitOutcome: (...args) => outcomes.push(args),
    },
  });
}

function registerRetireWitness(t, row, onRetire = () => {}) {
  const owner = new RaftRsReplicaLifecycleOwner({
    groupId: row.partition_id,
    peerId: `peer-${row.service_id}`,
    replicaIdentity: row.service_id,
    db: {
      exec() {},
      prepare(sql) {
        return {
          all: () => [],
          get: () => undefined,
          run: () => {
            if (sql.includes('SET state = \'retired\'')) onRetire();
          },
        };
      },
    },
  });
  t.teardown(() => owner.unregister());
  return owner;
}

function prepareRemovingHandler(t, store, row, outcomes = []) {
  const stateMachine = createStateMachine(store);
  const handler = createHandler(store, stateMachine, outcomes);
  handler.awaitReplicaRemovalConsensusExit = async () => ({reason: 'test'});
  handler.waitForReplicaServingDrain = async () => {};
  handler.localReplicas.set(row.service_id, {
    replicaId: row.service_id,
    partitionId: row.partition_id,
    status: row.status,
    service: null,
  });
  registerRetireWitness(t, row);
  return {handler, stateMachine};
}

async function runRemoval(handler, row, operationId) {
  return handler.removeReplicaAsync({
    operationId,
    partitionId: row.partition_id,
    replicaId: row.service_id,
    reason: operationId,
  });
}

test('durable generation serializes exact-CAS lifecycle intents', async (t) => {
  initializeEnvironment();
  const row = serviceRow('replica-serialization', ReplicaState.CREATING, 100);
  const store = createLifecycleRowStore({
    services: [row],
    partitions: [partitionRow()],
  });
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  store.setBeforeMutation(async (mutation) => {
    if (mutation.tableName === SERVICES &&
        mutation.data?.status === ReplicaState.REMOVING) await held;
  });
  const stateMachine = createStateMachine(store, {now: () => 200});
  registerRow(stateMachine, row);

  const removing = stateMachine.transition(row.service_id, ReplicaState.REMOVING,
    {partitionId: row.partition_id, reason: 'remove'});
  const staleFailure = stateMachine.transition(row.service_id, ReplicaState.FAILED,
    {partitionId: row.partition_id, reason: 'stale-create-failure'});
  release();

  t.equal(await removing, true, 'the exact source generation commits once');
  t.equal(await staleFailure, false,
    'the queued stale source revision never reaches persistence');
  t.equal(store.durable[SERVICES].get(row.service_id).status,
    ReplicaState.REMOVING);
  t.equal(stateMachine.getState(row.service_id)?.state, ReplicaState.REMOVING);
  t.equal(store.mutations.filter((mutation) =>
    mutation.tableName === SERVICES).length, 1,
  'one lifecycle write owns the durable generation');
});

test('zero-row lifecycle CAS cannot commit local state or clear debt',
  async (t) => {
    initializeEnvironment();
    const durableRow = serviceRow('replica-zero-row', ReplicaState.FAILED, 200);
    const staleRow = {...durableRow, state_entered_at: 100, updated_at: 100};
    const store = createLifecycleRowStore({
      services: [durableRow],
      partitions: [partitionRow()],
    });
    store.project(SERVICES, staleRow);
    const stateMachine = createStateMachine(store, {now: () => 300});
    registerRow(stateMachine, staleRow);

    await t.rejects(stateMachine.transition(
      staleRow.service_id,
      ReplicaState.REMOVING,
      {partitionId: staleRow.partition_id, reason: 'stale-remove'},
    ), {code: 'REPLICA_STATE_TRANSITION_DURABILITY_DEFERRED'});
    t.equal(stateMachine.getState(staleRow.service_id)?.state,
      ReplicaState.FAILED, 'zero rows cannot manufacture local authority');
    t.equal(stateMachine.canonicalLeaderClearDebtByReplicaId.has(
      staleRow.service_id), false, 'nonapply cannot create or clear side-effect debt');
    t.equal(store.mutations.some((mutation) =>
      mutation.tableName === PARTITIONS), false,
    'leader settlement cannot run before lifecycle CAS applies');
  });

test('lost-ACK REMOVING redrive observes the authoritative applied target',
  async (t) => {
    initializeEnvironment();
    const row = serviceRow('replica-lost-ack', ReplicaState.CREATING, 100);
    const store = createLifecycleRowStore({
      services: [row],
      partitions: [partitionRow()],
    });
    store.project(PARTITIONS, {
      partition_id: row.partition_id,
      leader_node_id: 'stale-other-node',
      updated_at: 699,
    });
    store.project(SERVICES, serviceRow(
      'phantom-active-sibling',
      ReplicaState.ACTIVE,
      699,
      row.partition_id,
    ));
    store.setApplyThenThrowStatus(ReplicaState.REMOVING);
    const stateMachine = createStateMachine(store, {now: () => 200});
    registerRow(stateMachine, row);

    await t.rejects(stateMachine.transition(
      row.service_id,
      ReplicaState.REMOVING,
      {partitionId: row.partition_id, reason: 'lost-ack'},
    ), /ack-lost-after-durable-apply/);
    t.equal(store.durable[SERVICES].get(row.service_id).status,
      ReplicaState.REMOVING, 'fixture applies before losing acknowledgement');
    t.equal(await stateMachine.transition(
      row.service_id,
      ReplicaState.REMOVING,
      {partitionId: row.partition_id, reason: 'idempotent-redrive'},
    ), true);
    t.equal(store.mutations.filter((mutation) =>
      mutation.tableName === SERVICES).length, 1,
    'redrive point-observes the exact target instead of repeating stale CAS');
    t.equal(stateMachine.getState(row.service_id)?.durableVersion,
      store.durable[SERVICES].get(row.service_id).state_entered_at);
  });

test('restart recovery replaces only newer durable generations and fences ABA',
  async (t) => {
    initializeEnvironment();
    const removing = serviceRow('replica-restart', ReplicaState.REMOVING, 200);
    const staleCreating = {...removing, status: ReplicaState.CREATING,
      state_entered_at: 100, updated_at: 100};
    const abaDurable = serviceRow('replica-aba', ReplicaState.CREATING, 400,
      'partition-aba');
    const abaStale = {...abaDurable, state_entered_at: 300, updated_at: 300};
    const store = createLifecycleRowStore({
      services: [removing, abaDurable],
      partitions: [partitionRow(), partitionRow('partition-aba')],
    });
    store.project(SERVICES, staleCreating);
    store.project(SERVICES, abaStale);
    const stateMachine = createStateMachine(store, {now: () => 500});

    const first = await stateMachine.handleNodeRecovery({
      systemTableCache: store.cache,
    });
    t.equal(first.removingToRemoved, 0,
      'recovery preserves REMOVING for the exact cleanup owner');
    t.equal(first.creatingToFailed, 1,
      'recovery point-observes the newer same-state ABA generation');
    t.equal(stateMachine.getState(removing.service_id)?.state,
      ReplicaState.REMOVING);
    t.equal(stateMachine.getState(abaDurable.service_id)?.state,
      ReplicaState.FAILED);
  });

test('handler binds leader settlement before retire and durable deletion',
  async (t) => {
    initializeEnvironment();
    const row = serviceRow('replica-handler-order', ReplicaState.REMOVING, 700);
    const store = createLifecycleRowStore({
      services: [row],
      partitions: [partitionRow()],
    });
    const stateMachine = createStateMachine(store);
    const handler = createHandler(store, stateMachine);
    const order = [];
    store.setBeforeMutation(async (mutation) => {
      if (mutation.tableName === PARTITIONS) order.push('leader-clear');
      if (mutation.tableName === SERVICES && mutation.operation === 'update' &&
          mutation.data?.status === 'cleanup_owned') {
        t.equal(store.durable[SERVICES].get(row.service_id)?.status,
          ReplicaState.REMOVING,
          'the exact REMOVING row remains present until atomic marker takeover');
        order.push('cleanup-takeover');
      }
      if (mutation.tableName === SERVICES && mutation.operation === 'delete') {
        order.push('services-delete');
      }
    });
    handler.awaitReplicaRemovalConsensusExit = async () => ({reason: 'test'});
    handler.waitForReplicaServingDrain = async () => {};
    handler.cleanupRemovedReplicaLocalRuntime = async () => {
      order.push('runtime-cleanup');
    };
    handler.localReplicas.set(row.service_id, {
      replicaId: row.service_id,
      partitionId: row.partition_id,
      status: ReplicaStatus.REMOVING,
      service: null,
    });
    const raftLifecycle = new RaftRsReplicaLifecycleOwner({
      groupId: row.partition_id,
      peerId: 'peer-handler-order',
      replicaIdentity: row.service_id,
      db: {
        exec() {},
        prepare(sql) {
          return {
            all: () => [],
            get: () => undefined,
            run: () => {
              if (sql.includes('SET state = \'retired\'')) {
                order.push('raft-retire');
              }
            },
          };
        },
      },
    });
    t.teardown(() => raftLifecycle.unregister());

    await handler.removeReplicaAsync({
      operationId: 'remove-order-op',
      partitionId: row.partition_id,
      replicaId: row.service_id,
      reason: 'test',
    });
    t.same(order, [
      'leader-clear',
      'raft-retire',
      'cleanup-takeover',
      'runtime-cleanup',
      'services-delete',
    ], 'the reconstructible REMOVING owner settles before irreversible effects');
    t.same(store.mutations.filter((mutation) =>
      mutation.tableName === SERVICES).map((mutation) => mutation.operation),
    ['update', 'delete'],
    'REMOVING changes in place to its marker without a row-absence gap');
    const deletion = store.mutations.find((mutation) =>
      mutation.tableName === SERVICES && mutation.operation === 'delete');
    t.match(deletion?.whereClause, {
      service_id: row.service_id,
      service_type: 'partition_cleanup',
      partition_id: row.partition_id,
      node_id: row.node_id,
      status: 'cleanup_owned',
      cleanup_token: String,
      updated_at: Number,
    }, 'release deletes only the exact durable cleanup owner');
    t.equal(stateMachine.getState(row.service_id), null,
      'terminal bookkeeping completes only after ordered cleanup');
    for (const read of store.authoritativeReads) {
      t.equal(read.options.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        'lifecycle decisions use the owner RPC authority');
      t.equal(read.options.leaderMode,
        CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        'lifecycle decisions require the authoritative leader');
    }
  });

test('stale REMOVING projection cannot authorize cleanup of newer ACTIVE',
  async (t) => {
    initializeEnvironment();
    const active = serviceRow('replica-stale-cache', ReplicaState.ACTIVE, 200);
    const stale = serviceRow(
      active.service_id,
      ReplicaState.REMOVING,
      100,
    );
    const store = createLifecycleRowStore({
      services: [active],
      partitions: [partitionRow()],
    });
    store.project(SERVICES, stale);
    const {handler} = prepareRemovingHandler(t, store, stale);
    let cleanups = 0;
    handler.cleanupRemovedReplicaLocalRuntime = async () => {
      cleanups += 1;
    };

    await t.rejects(runRemoval(handler, stale, 'stale-cache-remove'), {
      code: 'REPLICA_LEADER_CLEAR_DEFERRED',
      deferRetry: true,
    });
    t.equal(cleanups, 0, 'stale projection cannot reach local cleanup');
    t.equal(store.durable[SERVICES].get(active.service_id)?.status,
      ReplicaState.ACTIVE, 'the newer durable generation survives');
    t.equal(store.mutations.some((mutation) =>
      mutation.operation === 'delete'), false,
    'no DELETE is admitted without exact REMOVING authority');
  });

test('zero-row and deferred marker release preserve typed retry debt',
  async (t) => {
    initializeEnvironment();
    const cases = [
      {
        name: 'zero',
        result: mutationResult(false),
        retryAfterMs: undefined,
      },
      {
        name: 'deferred',
        result: {
          success: false,
          outcome: 'deferred',
          deferRetry: true,
          retryAfterMs: 250,
          partitionResult: {affectedRows: 0},
        },
        retryAfterMs: 250,
      },
    ];
    for (const testCase of cases) {
      const row = serviceRow(
        `replica-delete-${testCase.name}`,
        ReplicaState.REMOVING,
        300,
        `partition-${testCase.name}`,
      );
      const store = createLifecycleRowStore({
        services: [row],
        partitions: [{
          partition_id: row.partition_id,
          leader_node_id: null,
          updated_at: 1,
        }],
      });
      store.setNextDeleteBehavior({resultOnly: true, result: testCase.result});
      const outcomes = [];
      const {handler} = prepareRemovingHandler(t, store, row, outcomes);
      let cleanups = 0;
      handler.cleanupRemovedReplicaLocalRuntime = async () => {
        cleanups += 1;
      };

      await t.rejects(runRemoval(
        handler,
        row,
        `remove-${testCase.name}`,
      ), {
        code: REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNER_DEFERRED,
        deferRetry: true,
      });
      t.equal(cleanups, 1,
        `${testCase.name} cleanup runs only while the marker owns the key`);
      t.equal(isCleanupTombstoneRow(
        store.durable[SERVICES].get(row.service_id)), true,
      `${testCase.name} retains durable cleanup ownership for retry`);
      const failed = outcomes.find(([type]) =>
        type === 'REPLICA_REMOVE_FAILED');
      t.equal(failed?.[3]?.retryAfterMs, testCase.retryAfterMs,
        `${testCase.name} preserves the owner's retry timing`);
    }
  });

test('delete ACK loss accepts only bound-generation absence', async (t) => {
  initializeEnvironment();
  const absentRow = serviceRow(
    'replica-delete-ack-absent',
    ReplicaState.REMOVING,
    400,
    'partition-delete-ack-absent',
  );
  const absentStore = createLifecycleRowStore({
    services: [absentRow],
    partitions: [{
      partition_id: absentRow.partition_id,
      leader_node_id: null,
      updated_at: 1,
    }],
  });
  absentStore.setNextDeleteBehavior({throwAfterApply: true});
  const {handler: absentHandler} = prepareRemovingHandler(
    t,
    absentStore,
    absentRow,
  );
  let absentCleanups = 0;
  absentHandler.cleanupRemovedReplicaLocalRuntime = async () => {
    absentCleanups += 1;
  };
  await runRemoval(absentHandler, absentRow, 'ack-loss-absent');
  t.equal(absentCleanups, 1,
    'authoritative absence resolves an exact apply-then-ACK-loss');

  const replacedRow = serviceRow(
    'replica-delete-ack-replaced',
    ReplicaState.REMOVING,
    500,
    'partition-delete-ack-replaced',
  );
  const replacement = serviceRow(
    replacedRow.service_id,
    ReplicaState.ACTIVE,
    50,
    replacedRow.partition_id,
  );
  const replacedStore = createLifecycleRowStore({
    services: [replacedRow],
    partitions: [{
      partition_id: replacedRow.partition_id,
      leader_node_id: null,
      updated_at: 1,
    }],
  });
  replacedStore.setNextDeleteBehavior({
    throwAfterApply: true,
    afterApply: async (durable) => {
      durable[SERVICES].set(replacement.service_id, cloneRow(replacement));
    },
  });
  const {handler: replacedHandler} = prepareRemovingHandler(
    t,
    replacedStore,
    replacedRow,
  );
  let replacedCleanups = 0;
  replacedHandler.cleanupRemovedReplicaLocalRuntime = async () => {
    replacedCleanups += 1;
  };
  await t.rejects(runRemoval(
    replacedHandler,
    replacedRow,
    'ack-loss-replaced',
  ), {code: 'REPLICA_REMOVAL_COMPLETION_DEFERRED'});
  t.equal(replacedCleanups, 1,
    'cleanup completed while the exact marker still excluded recreation');
  t.equal(replacedStore.durable[SERVICES].get(replacement.service_id)?.status,
    ReplicaState.ACTIVE, 'same-ID replacement survives the retry');
  t.equal(replacedStore.durable[SERVICES].get(replacement.service_id)
    ?.state_entered_at, 50, 'clock-reset generation identity is preserved');
});

test('replacement inserted after marker release is preserved',
  async (t) => {
    initializeEnvironment();
    const row = serviceRow(
      'replica-post-delete-replacement',
      ReplicaState.REMOVING,
      600,
    );
    const replacement = serviceRow(
      row.service_id,
      ReplicaState.ACTIVE,
      601,
    );
    const store = createLifecycleRowStore({
      services: [row],
      partitions: [partitionRow()],
    });
    let absenceReads = 0;
    let deleteApplied = false;
    store.setNextDeleteBehavior({
      afterApply: async () => {
        deleteApplied = true;
      },
    });
    store.setBeforeAuthoritativeRead(async (tableName, _params, durable) => {
      if (tableName !== SERVICES || !deleteApplied ||
          durable[SERVICES].has(row.service_id)) return;
      absenceReads += 1;
      if (absenceReads === 2) {
        durable[SERVICES].set(row.service_id, cloneRow(replacement));
      }
    });
    const {handler} = prepareRemovingHandler(t, store, row);
    let cleanups = 0;
    handler.cleanupRemovedReplicaLocalRuntime = async () => {
      cleanups += 1;
    };

    await t.rejects(runRemoval(handler, row, 'post-delete-replacement'), {
      code: 'REPLICA_REMOVAL_COMPLETION_DEFERRED',
    });
    t.equal(cleanups, 1,
      'physical cleanup precedes release while the marker excludes create');
    t.equal(store.durable[SERVICES].get(row.service_id)?.status,
      ReplicaState.ACTIVE);
  });

test('malformed authoritative recovery cannot poison a later valid generation',
  async (t) => {
    initializeEnvironment();
    const malformed = serviceRow(
      'replica-malformed-recovery',
      ReplicaState.CREATING,
      100,
    );
    delete malformed.state_entered_at;
    delete malformed.updated_at;
    const store = createLifecycleRowStore({services: [malformed]});
    const stateMachine = createStateMachine(store, {now: () => 1000});

    const malformedPass = await stateMachine.handleNodeRecovery({
      systemTableCache: store.cache,
    });
    t.equal(malformedPass.total, 0);
    t.equal(stateMachine.getState(malformed.service_id), null,
      'malformed authority installs no local state');
    t.equal(stateMachine.replicaRevisionByReplicaId.has(malformed.service_id),
      false, 'malformed authority advances no revision');
    t.equal(stateMachine.getStateCounts()[ReplicaState.CREATING], 0,
      'malformed authority changes no counters');

    const valid = serviceRow(
      malformed.service_id,
      ReplicaState.CREATING,
      200,
    );
    store.durable[SERVICES].set(valid.service_id, cloneRow(valid));
    store.project(SERVICES, valid);
    const validPass = await stateMachine.handleNodeRecovery({
      systemTableCache: store.cache,
    });
    t.equal(validPass.creatingToFailed, 1);
    t.equal(stateMachine.getState(valid.service_id)?.state,
      ReplicaState.FAILED, 'later valid authority converges normally');
  });

test('legacy updated_at generation survives bind and cleanup takeover CAS',
  async (t) => {
    initializeEnvironment();
    const row = serviceRow(
      'replica-legacy-generation',
      ReplicaState.REMOVING,
      700,
    );
    delete row.state_entered_at;
    const store = createLifecycleRowStore({
      services: [row],
      partitions: [partitionRow()],
    });
    const {handler, stateMachine} = prepareRemovingHandler(t, store, row);
    handler.cleanupRemovedReplicaLocalRuntime = async () => {};
    await runRemoval(handler, row, 'legacy-remove');
    const takeover = store.mutations.find((mutation) =>
      mutation.operation === 'update' &&
      mutation.data?.status === 'cleanup_owned');
    t.equal(takeover?.whereClause.updated_at, 700);
    t.equal('state_entered_at' in takeover.whereClause, false,
      'legacy generation is never relabeled before cleanup takeover');
    t.equal(stateMachine.getState(row.service_id), null);
  });

test('durable FAILED apply records debt and stale debt cannot clear replacement',
  async (t) => {
    initializeEnvironment();
    const row = serviceRow('replica-failed-debt', ReplicaState.ACTIVE, 800);
    const store = createLifecycleRowStore({
      services: [row],
      partitions: [partitionRow()],
    });
    let failLeaderClear = true;
    store.setBeforeMutation(async (mutation) => {
      if (mutation.tableName === PARTITIONS && failLeaderClear) {
        failLeaderClear = false;
        throw new Error('leader-clear-unavailable');
      }
    });
    const stateMachine = createStateMachine(store, {now: () => 900});
    registerRow(stateMachine, row);
    t.equal(await stateMachine.transition(
      row.service_id,
      ReplicaState.FAILED,
      {partitionId: row.partition_id, reason: 'runtime-failed'},
    ), true, 'durable lifecycle authority commits despite side-effect debt');
    t.equal(stateMachine.getState(row.service_id)?.state, ReplicaState.FAILED);
    t.equal(stateMachine.canonicalLeaderClearDebtByReplicaId.has(
      row.service_id), true);

    const replacement = serviceRow(
      row.service_id,
      ReplicaState.ACTIVE,
      50,
    );
    store.durable[SERVICES].set(row.service_id, cloneRow(replacement));
    t.equal(await stateMachine.settleCanonicalLeaderClearDebt(row.service_id),
      false, 'stale debt refuses before touching the leader row');
    t.equal(stateMachine.getState(row.service_id)?.state, ReplicaState.ACTIVE);
    t.equal(stateMachine.getState(row.service_id)?.durableVersion, 50,
      'authoritative clock-reset replacement supersedes old debt');
    t.equal(stateMachine.canonicalLeaderClearDebtByReplicaId.has(
      row.service_id), false, 'old generation debt is atomically fenced');
  });

test('new authoritative generation fences stale REMOVING uncertainty',
  async (t) => {
    initializeEnvironment();
    const row = serviceRow('replica-uncertain-generation',
      ReplicaState.CREATING, 1000);
    const store = createLifecycleRowStore({services: [row]});
    store.setApplyThenThrowStatus(ReplicaState.REMOVING);
    const stateMachine = createStateMachine(store, {now: () => 1100});
    registerRow(stateMachine, row);
    await t.rejects(stateMachine.transition(
      row.service_id,
      ReplicaState.REMOVING,
      {partitionId: row.partition_id, reason: 'lost-ack'},
    ), /ack-lost/);
    const replacement = serviceRow(
      row.service_id,
      ReplicaState.REMOVING,
      25,
    );
    store.durable[SERVICES].set(row.service_id, cloneRow(replacement));
    t.equal(stateMachine.registerReplicaSnapshot(row.service_id, {
      partitionId: replacement.partition_id,
      nodeId: replacement.node_id,
      state: replacement.status,
      serviceId: replacement.service_id,
      serviceType: replacement.service_type,
      durableVersionColumn: 'state_entered_at',
      durableVersion: replacement.state_entered_at,
      authoritativeSnapshot: true,
    }), true);
    t.equal(stateMachine.uncertainRemovingIntentByReplicaId.has(row.service_id),
      false, 'new authority retires stale uncertainty');
    t.equal(stateMachine.getState(row.service_id)?.durableVersion, 25);
  });

test('clear invalidates a held removal authority and drains its lane',
  async (t) => {
    initializeEnvironment();
    const row = serviceRow('replica-clear-fence', ReplicaState.REMOVING, 1200);
    const store = createLifecycleRowStore({
      services: [row],
      partitions: [partitionRow()],
    });
    const stateMachine = createStateMachine(store);
    const authority = await stateMachine.bindAuthoritativeRemovalAuthority(
      row.service_id,
      {partitionId: row.partition_id, nodeId: row.node_id},
    );
    t.equal(await stateMachine.settleCanonicalLeaderClearDebt(row.service_id),
      true);
    const rebound = await stateMachine.bindAuthoritativeRemovalAuthority(
      row.service_id,
      {partitionId: row.partition_id, nodeId: row.node_id},
    );
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let effects = 0;
    const removal = stateMachine.completeDurableRemovalWithAuthority(
      row.service_id,
      rebound,
      async (guard) => {
        await held;
        if (!await guard.requireRemoving() || !guard.isCurrent()) return false;
        effects += 1;
        return true;
      },
      () => {
        effects += 1;
      },
    );
    await Promise.resolve();
    const clearing = stateMachine.clear();
    release();
    t.equal(await removal, false);
    t.equal(await clearing, true);
    t.equal(effects, 0, 'shutdown invalidation permits no stale effects');
    t.equal(authority.kind, ReplicaState.REMOVING);
  });

test('generation-specific cleanup takeovers cannot coalesce old and new lifetimes',
  async (t) => {
    initializeEnvironment();
    const writes = [];
    const owner = new ReplicaCleanupTombstoneOwner({
      gateway: {
        async submitMutation(mutation, options) {
          writes.push({mutation, options});
          return mutationResult(false);
        },
      },
      observe: async () => ({available: false, row: null}),
      randomUUID: (() => {
        let token = 0;
        return () => `token-${++token}`;
      })(),
    });
    for (const generation of [1300, 25]) {
      await t.rejects(owner.takeoverRemoving({
        durableVersionColumn: 'state_entered_at',
        durableVersion: generation,
        replicaState: {
          serviceId: 'replica-coalescing',
          partitionId: 'partition-coalescing',
          nodeId: NODE_ID,
        },
      }), {code: REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNER_DEFERRED});
    }
    t.equal(writes.every((write) =>
      write.options.allowCoalescing === false), true);
    t.not(writes[0].options.coalescingKey, writes[1].options.coalescingKey,
      'old and clock-reset generations never share a destructive key');
  });

test('terminalization requires settled REMOVING and remains idempotent',
  async (t) => {
    initializeEnvironment();
    for (const state of [
      ReplicaState.PENDING,
      ReplicaState.CREATING,
      ReplicaState.SYNCING,
      ReplicaState.ACTIVE,
      ReplicaState.FAILED,
    ]) {
      const row = serviceRow(`replica-${state}`, state, 100);
      const store = createLifecycleRowStore({services: [row]});
      const stateMachine = createStateMachine(store);
      registerRow(stateMachine, row);
      t.equal(await stateMachine.completeDurableRemoval(row.service_id), false,
        `${state} cannot bypass REMOVING`);
      t.equal(stateMachine.getState(row.service_id)?.state, state);
    }

    const removing = serviceRow('replica-terminal', ReplicaState.REMOVING, 200);
    const store = createLifecycleRowStore({
      services: [removing],
      partitions: [partitionRow()],
    });
    const stateMachine = createStateMachine(store);
    registerRow(stateMachine, removing);
    t.equal(await stateMachine.completeDurableRemoval(removing.service_id), false,
      'unsettled REMOVING cannot terminalize');
    t.equal(await stateMachine.settleCanonicalLeaderClearDebt(
      removing.service_id), true);
    t.equal(await stateMachine.completeDurableRemoval(removing.service_id), true,
      'the exact settled generation terminalizes');
    t.equal(stateMachine.completeDurableRemoval(removing.service_id), false,
      'ordinary completion cannot reinterpret absence');
    t.equal(stateMachine.completeAbsentDurableRemoval, undefined,
      'generic absence cannot manufacture deletion authority');
  });

test('terminal completion refusal emits typed retry debt', async (t) => {
  initializeEnvironment();
  const row = serviceRow('replica-terminal-debt', ReplicaState.REMOVING, 900);
  const store = createLifecycleRowStore({
    services: [row],
    partitions: [partitionRow()],
  });
  const stateMachine = createStateMachine(store);
  const outcomes = [];
  const handler = createHandler(store, stateMachine, outcomes);
  handler.awaitReplicaRemovalConsensusExit = async () => ({reason: 'test'});
  handler.waitForReplicaServingDrain = async () => {};
  handler.cleanupRemovedReplicaLocalRuntime = async () => {};
  handler.localReplicas.set(row.service_id, {
    replicaId: row.service_id,
    partitionId: row.partition_id,
    status: ReplicaStatus.REMOVING,
    service: null,
  });
  const originalComplete =
    stateMachine.completeDurableRemovalWithAuthority.bind(stateMachine);
  stateMachine.completeDurableRemovalWithAuthority = async () => false;

  await t.rejects(handler.removeReplicaAsync({
    operationId: 'terminal-debt-op',
    partitionId: row.partition_id,
    replicaId: row.service_id,
    reason: 'test',
  }), {
    code: 'REPLICA_REMOVAL_COMPLETION_DEFERRED',
    errorCode: 'REPLICA_REMOVAL_COMPLETION_DEFERRED',
    deferRetry: true,
  });
  const failed = outcomes.find(([type]) => type === 'REPLICA_REMOVE_FAILED');
  t.equal(failed?.[3]?.errorCode,
    'REPLICA_REMOVAL_COMPLETION_DEFERRED');
  t.equal(failed?.[3]?.deferRetry, true,
    'executor outcome preserves generic retry metadata');
  t.equal(handler.getLocalReplica(row.service_id)?.status,
    ReplicaStatus.REMOVING, 'retry debt cannot claim terminal local state');
  stateMachine.completeDurableRemovalWithAuthority = originalComplete;
});

test('cleanup tombstone and live creation share one authoritative insert key',
  async (t) => {
    initializeEnvironment();
    const replicaId = 'replica-cleanup-race';
    const store = createLifecycleRowStore();
    const owner = new ReplicaCleanupTombstoneOwner({
      gateway: store.gateway,
      now: () => 100,
      randomUUID: () => 'cleanup-a',
    });
    const acquired = await owner.acquire({
      replicaId,
      partitionId: 'partition-1',
      nodeId: NODE_ID,
      reason: 'race',
    });
    t.equal(acquired.outcome, REPLICA_CLEANUP_ACQUIRE_OUTCOME.ACQUIRED,
      'cleanup wins by inserting the sole primary-key owner');
    t.ok(isCleanupTombstoneRow(store.durable[SERVICES].get(replicaId)));

    const stateMachine = createStateMachine(store, {now: () => 200});
    await t.rejects(stateMachine.transition(replicaId, ReplicaState.PENDING, {
      partitionId: 'partition-1',
      nodeId: NODE_ID,
      serviceId: replicaId,
      serviceAddress: `${NODE_ID}/partition/${replicaId}`,
      reason: 'create-lost-race',
    }), {code: REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS});
    t.equal(stateMachine.getState(replicaId), null,
      'losing create opens no local generation');

    const secondOwner = new ReplicaCleanupTombstoneOwner({
      gateway: store.gateway,
      now: () => 101,
      randomUUID: () => 'cleanup-b',
    });
    const duplicate = await secondOwner.acquire({
      replicaId,
      partitionId: 'partition-1',
      nodeId: NODE_ID,
    });
    t.equal(duplicate.outcome, REPLICA_CLEANUP_ACQUIRE_OUTCOME.OWNED,
      'a second process cannot acquire a second tombstone');
    t.equal(duplicate.authority, null,
      'the losing live owner cannot borrow the winning token');
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-race-'));
    t.teardown(() => fs.rmSync(dataDir, {recursive: true, force: true}));
    const dbDir = path.join(dataDir, 'partitions', 'partition-1');
    fs.mkdirSync(dbDir, {recursive: true});
    fs.writeFileSync(path.join(dbDir, `${replicaId}.db`), 'owned');
    const loserHandler = createHandler(store, stateMachine);
    loserHandler.dataDir = dataDir;
    loserHandler.replicaCleanupTombstoneOwner = secondOwner;
    let loserDeletionCalls = 0;
    loserHandler.cleanupReplicaResources = async () => {
      loserDeletionCalls += 1;
    };
    await loserHandler.sweepRemovedReplicaCleanupDebt(new Map());
    t.equal(loserDeletionCalls, 0,
      'the losing durable owner client performs zero physical deletions');
    const startupSnapshot = await secondOwner.snapshotPersistedAtStartup(
      NODE_ID,
    );
    const resumed = await secondOwner.resumePersistedAtStartup(
      startupSnapshot,
      {replicaId, partitionId: 'partition-1', nodeId: NODE_ID},
    );
    t.equal(resumed.ownerToken, acquired.authority.ownerToken,
      'only the frozen pre-admission startup path may resume persisted debt');
    t.equal(await secondOwner.resumePersistedAtStartup(
      startupSnapshot,
      {replicaId, partitionId: 'partition-1', nodeId: 'wrong-node'},
    ), null, 'a marker for another node cannot be resumed');
  });

test('live creation wins before cleanup and row reappearance cancels cleanup',
  async (t) => {
    initializeEnvironment();
    const replicaId = 'replica-create-race';
    const store = createLifecycleRowStore();
    const stateMachine = createStateMachine(store, {now: () => 300});
    t.equal(await stateMachine.transition(replicaId, ReplicaState.PENDING, {
      partitionId: 'partition-1',
      nodeId: NODE_ID,
      serviceId: replicaId,
      serviceAddress: `${NODE_ID}/partition/${replicaId}`,
      reason: 'create-wins',
    }), true);
    const owner = new ReplicaCleanupTombstoneOwner({gateway: store.gateway});
    const blocked = await owner.acquire({
      replicaId,
      partitionId: 'partition-1',
      nodeId: NODE_ID,
    });
    t.equal(blocked.outcome,
      REPLICA_CLEANUP_ACQUIRE_OUTCOME.LIVE_GENERATION);
    t.equal(store.durable[SERVICES].get(replicaId).service_type, 'partition');

    const appearingId = 'replica-row-reappears';
    store.setBeforeMutation((mutation) => {
      if (mutation.operation === 'insert' &&
          mutation.row?.service_type === 'partition_cleanup') {
        store.durable[SERVICES].set(
          appearingId,
          serviceRow(appearingId, ReplicaState.ACTIVE, 400),
        );
      }
    });
    const revalidated = await owner.acquire({
      replicaId: appearingId,
      partitionId: 'partition-1',
      nodeId: NODE_ID,
    });
    t.equal(revalidated.outcome,
      REPLICA_CLEANUP_ACQUIRE_OUTCOME.LIVE_GENERATION,
      'post-scan row appearance cancels cleanup before destruction');
  });

test('cleanup restart resumes partial sidecars and releases only after absence',
  async (t) => {
    initializeEnvironment();
    const replicaId = 'replica-partial-cleanup';
    const partitionId = 'partition-partial-cleanup';
    const store = createLifecycleRowStore();
    const owner = new ReplicaCleanupTombstoneOwner({
      gateway: store.gateway,
      now: () => 500,
      randomUUID: () => 'restart-token',
    });
    const acquired = await owner.acquire({replicaId, partitionId,
      nodeId: NODE_ID});
    t.equal(await owner.release(acquired.authority), false,
      'R1 tombstone cannot release without positive storage absence');

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-restart-'));
    t.teardown(() => fs.rmSync(dataDir, {recursive: true, force: true}));
    const partitionDir = path.join(dataDir, 'partitions', partitionId);
    fs.mkdirSync(partitionDir, {recursive: true});
    const dbPath = path.join(partitionDir, `${replicaId}.db`);
    fs.writeFileSync(`${dbPath}-wal`, 'wal');
    fs.writeFileSync(`${dbPath}-shm`, 'shm');
    const handler = createHandler(store, createStateMachine(store));
    handler.dataDir = dataDir;
    const startupAuthorities = await handler
      .captureRemovedReplicaCleanupStartupAuthorities();
    const report = await handler.sweepRemovedReplicaCleanupDebt(
      startupAuthorities,
    );
    t.equal(report.deleted, 1, 'R2 restart resumes WAL/SHM-only cleanup');
    t.notOk(fs.existsSync(`${dbPath}-wal`));
    t.notOk(fs.existsSync(`${dbPath}-shm`));
    t.equal(store.durable[SERVICES].has(replicaId), false,
      'R3 all-absent verification permits exact tombstone release');
  });

test('lost unlink outcome is observed and stale cleanup cannot touch recreation',
  async (t) => {
    initializeEnvironment();
    const files = new Set(['/replica.db', '/replica.db-wal']);
    const fakeFs = {
      existsSync: (filePath) => files.has(filePath),
      unlinkSync(filePath) {
        files.delete(filePath);
        if (filePath.endsWith('-wal')) throw new Error('lost unlink ack');
      },
    };
    const validatedArtifacts = [];
    const removal = await removeReplicaStorageArtifacts(
      fakeFs,
      '/replica.db',
      async (artifactPath) => validatedArtifacts.push(artifactPath),
    );
    t.equal(removal.allAbsent, true, 'R4 lost outcome is resolved by absence');
    t.equal(removal.outcomes[1].outcome,
      REPLICA_STORAGE_ARTIFACT_OUTCOME.ALREADY_ABSENT);
    t.same(validatedArtifacts, ['/replica.db', '/replica.db-wal'],
      'each destructive artifact effect has its own immediate token check');

    const replicaId = 'replica-stale-cleanup';
    const store = createLifecycleRowStore();
    const owner = new ReplicaCleanupTombstoneOwner({
      gateway: store.gateway,
      now: () => 600,
      randomUUID: () => 'old-token',
    });
    const acquired = await owner.acquire({replicaId,
      partitionId: 'partition-1', nodeId: NODE_ID});
    t.equal(await owner.release(acquired.authority,
      {artifactsAbsent: true}), true);
    store.durable[SERVICES].set(replicaId,
      serviceRow(replicaId, ReplicaState.ACTIVE, 700));
    t.equal(await owner.requireCurrent(acquired.authority), false,
      'released callback is fenced after recreation');
    t.equal(await owner.release(acquired.authority,
      {artifactsAbsent: true}), false,
    'stale tombstone cannot delete the later live generation');

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-stale-'));
    t.teardown(() => fs.rmSync(dataDir, {recursive: true, force: true}));
    const dbDir = path.join(dataDir, 'partitions', 'partition-1');
    fs.mkdirSync(dbDir, {recursive: true});
    const dbPath = path.join(dbDir, `${replicaId}.db`);
    fs.writeFileSync(dbPath, 'new-generation');
    const handler = createHandler(store, createStateMachine(store));
    handler.dataDir = dataDir;
    await t.rejects(
      handler.cleanupReplicaResources(
        'partition-1', replicaId, acquired.authority,
      ),
      /ownership changed/u,
      'a delayed physical callback revalidates before touching storage',
    );
    t.ok(fs.existsSync(dbPath),
      'delayed old-token cleanup cannot unlink recreated storage');
  });

test('cleanup markers are excluded and destructive paths share one classifier',
  async (t) => {
    initializeEnvironment();
    const marker = {
      service_id: 'replica-marker-consumer',
      service_type: 'partition_cleanup',
      partition_id: 'partition-1',
      node_id: NODE_ID,
      status: 'cleanup_owned',
      address: 'cleanup-owner:consumer',
      created_at: 1,
      updated_at: 1,
    };
    const store = createLifecycleRowStore({services: [marker]});
    store.project(SERVICES, marker);
    const handler = createHandler(store, createStateMachine(store));
    t.equal(handler.getLocalReplica(marker.service_id), null,
      'marker never routes as a local replica');
    t.equal(handler.getAllLocalReplicas().length, 0,
      'marker never counts as a replica');

    const destructiveSources = [
      fs.readFileSync(new URL('../../src/node/replica-handler-runtime-methods.js',
        import.meta.url), 'utf8'),
      fs.readFileSync(new URL('../../src/node/replica-lifecycle-manager.js',
        import.meta.url), 'utf8'),
      fs.readFileSync(new URL('../../src/node/replica-lifecycle-recovery.js',
        import.meta.url), 'utf8'),
    ].join('\n');
    t.notMatch(destructiveSources, /unlinkSync\(/u,
      'T7 replica cleanup has no unclassified direct unlink path');
    t.notMatch(destructiveSources, /renameSync\(/u,
      'recovery has no second ownerless quarantine rename authority');
    t.match(destructiveSources, /removeReplicaStorageArtifacts/u,
      'all replica artifact deletion routes through the classified owner');
    t.match(destructiveSources,
      /storageAuthority\?\.kind !== CLEANUP_STORAGE_AUTHORITY_KIND/u,
      'physical deletion accepts only the current cleanup marker authority');
    t.notMatch(destructiveSources,
      /\['removing', 'cleanup_owned'\]/u,
      'REMOVING alone never authorizes physical storage deletion');
    const cdcMutationSource = fs.readFileSync(new URL(
      '../../src/cdc/cdc-integration-service-mutations.js', import.meta.url,
    ), 'utf8');
    t.match(cdcMutationSource, /SERVICES_UPSERT_FORBIDDEN/u,
      'generic SERVICES upsert is rejected at the canonical CDC boundary');
  });

test('data-directory ownership fences a second process before replica access',
  async (t) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-owner-'));
    t.teardown(() => fs.rmSync(dataDir, {recursive: true, force: true}));
    const partitionsDir = path.join(dataDir, 'partitions');
    const artifactPath = path.join(partitionsDir, 'contender-opened');
    fs.mkdirSync(partitionsDir);

    const owner = acquireDataDirectoryProcessOwner(dataDir);
    t.equal(await runDataDirectoryContender(dataDir, artifactPath), 23,
      'a second OS process receives the typed ownership refusal');
    t.notOk(fs.existsSync(artifactPath),
      'the refused process cannot reach replica storage activity');

    const runtime = bindDataDirectoryProcessOwner({
      async shutdownRuntime() {},
    }, owner);
    await runtime.shutdownRuntime();
    t.equal(await runDataDirectoryContender(dataDir, artifactPath), 0,
      'normal runtime shutdown releases kernel-backed ownership');
    fs.unlinkSync(artifactPath);

    const startupOwner = acquireDataDirectoryProcessOwner(dataDir);
    const ledger = createStartupAcquisitionLedger();
    ledger.defer(() => startupOwner.release());
    await ledger.unwind();
    t.equal(await runDataDirectoryContender(dataDir, artifactPath), 0,
      'startup failure or abort unwind releases ownership');

    const startupSource = fs.readFileSync(new URL(
      '../../src/lagrange-runtime-startup.js', import.meta.url,
    ), 'utf8');
    const ownershipIndex = startupSource.indexOf(
      'acquireDataDirectoryProcessOwner',
      startupSource.indexOf('async function acquireLagrangeRuntime'),
    );
    const provenanceIndex = startupSource.indexOf(
      'logBootProvenance', ownershipIndex,
    );
    const joinIndex = startupSource.indexOf(
      'resolveStartupJoinDecision', ownershipIndex,
    );
    t.ok(ownershipIndex > 0 && ownershipIndex < provenanceIndex &&
      ownershipIndex < joinIndex,
    'the process fence precedes provenance, rejoin, and replica startup');
  });

test('seed storage opens require durable virgin or live-generation proof',
  async (t) => {
    initializeEnvironment();
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-admission-'));
    t.teardown(() => fs.rmSync(dataDir, {recursive: true, force: true}));
    const partitionDir = path.join(dataDir, 'partitions', 'services-p1');
    fs.mkdirSync(partitionDir, {recursive: true});
    const db = new Database(path.join(partitionDir, 'services-p1-r1.db'));
    db.exec(`CREATE TABLE services (
      service_id TEXT PRIMARY KEY,
      service_type TEXT,
      node_id TEXT,
      partition_id TEXT,
      group_id TEXT,
      status TEXT,
      cleanup_token TEXT,
      state_entered_at INTEGER,
      updated_at INTEGER
    )`);
    db.prepare(`INSERT INTO services (
      service_id, service_type, node_id, partition_id, status,
      cleanup_token, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'services-p1-r1',
      'partition_cleanup',
      NODE_ID,
      'services-p1',
      'cleanup_owned',
      'startup-token',
      100,
    );
    db.close();

    const snapshot = await readDurableServicesIdentitySnapshot(dataDir);
    t.equal(snapshot.empty, false,
      'a durable cleanup owner is never mistaken for virgin storage');
    t.match(snapshot.rows[0], {
      service_type: 'partition_cleanup',
      cleanup_token: 'startup-token',
    }, 'the exact cleanup token survives the real SQLite startup snapshot');

    const phase = new SeedPartitionsPhase({
      delegates: {
        getLogger: () => ({debug() {}}),
        getNodeId: () => NODE_ID,
        getStartupServicesAdmission: () => snapshot,
        resolveBootstrapReplicaOptions: () => ({
          replicaId: 'services-p1-r1',
          partitionId: 'services-p1',
        }),
      },
    });
    const rejection = await t.rejects(
      phase.createBootstrapPartitionReplica({
        definition: {serviceId: 'services-p1-r1'},
      }),
      /storage admission deferred/u,
      'seed refuses before constructing or opening marker-owned storage',
    );
    t.equal(rejection.code, 'CLEANUP_IN_PROGRESS',
      'marker ownership remains a typed retryable seed refusal');
  });
