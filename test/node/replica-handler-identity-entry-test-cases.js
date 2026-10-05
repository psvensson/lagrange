// The CREATE_REPLICA production entry (handleCreateReplica) over the durable
// row an earlier life of the replica left, with the REAL rs-raft port (the
// WASM core) opened from exactly the options the handler passes:
//
//   K3   a replica that reached SYNCING - voted for a second real voter and
//        acked its entries - then FAILED and lost its disk is never re-driven
//        under the same replica id: the re-drive is refused typed, opens no
//        port, never votes again in the term it voted in, and the fact (the
//        row's previous_state) stays sticky across re-drives. A FAILED row
//        that never opened (failed at CREATING) is re-driven and completes.
//   F3c  the ack-loss wedge: a SYNCING row with no create in flight and no
//        tracked runtime in this process (a process restart) is routed into
//        the create/resume branch: a virgin record completes to ACTIVE, a
//        voted record restores, an absent record is refused reseed-required;
//        a tracked live runtime answers in_progress and is never opened over.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {createRaftRsOperationPort} from
  '../../src/raft/raft-rs-operation-port.js';
import {RAFT_OPERATION_PORT_REQUEST as REQUEST} from
  '../../src/raft/raft-operation-port-request.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../src/raft/raft-committed-membership-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {createLifecycleControlPlaneGatewayForCache} from
  '../test-helpers/lifecycle-state-store.js';
import {
  NODE_ID,
  PARTITION_ID,
  addressOf,
  isVirgin,
  leaveEarlierAttempt,
  openedRow,
  portRequest,
  readRecord,
  realPortFactory,
} from './replica-handler-identity-record-test-cases.js';

const OPENED_RESTART_REFUSED = 'REPLICA_OPENED_IDENTITY_RESTART_REFUSED';
const PEER_ID = 'k3-peer';

async function within(predicate, deadlineMs) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

function statusWrite(mutation, status) {
  return mutation.tableName === 'services' && mutation.data?.status === status;
}

function wipeRecord(directory, replicaId) {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(path.join(directory, `${replicaId}.db${suffix}`), {force: true});
  }
}

export async function registerReplicaHandlerIdentityEntryTests({
  t,
  ReplicaHandler,
  OperationType,
  ReplicaStatus,
  ReplicaStateMachine,
  createMockCDCService,
  createSeededCache,
}) {
  // One process of the node: a handler over the durable store (shared across
  // a restart) and the data directory.
  function startNode({directory, cache, store = null, beforeMutation = null,
    overridesFor = undefined}) {
    const opened = [];
    const outcomes = [];
    const gateway = createLifecycleControlPlaneGatewayForCache(cache, {
      store,
      beforeMutation: (mutation) => beforeMutation?.(mutation),
    });
    const createPartitionService =
      realPortFactory(directory, opened, overridesFor);
    const handler = new ReplicaHandler({
      nodeId: NODE_ID,
      dataDir: directory,
      systemTableCache: cache,
      cdcIntegrationService: createMockCDCService(cache),
      replicaStateMachine: new ReplicaStateMachine({nodeId: NODE_ID,
        controlPlaneSystemTableGateway: gateway}),
      createPartitionService,
    });
    handler.initialize();
    handler.executorOutcomeEmitter = {
      emitOutcome: (type, operationId, step, options) =>
        outcomes.push({type, operationId, step, options}),
    };
    const drive = async (replicaId, operationId) => {
      const response = await handler.handleCreateReplica({operationId,
        operationType: OperationType.ADD, partitionId: PARTITION_ID,
        replicaId});
      await Promise.allSettled([...handler.operationTasks]);
      return response;
    };
    const stop = async () => {
      await handler.shutdown();
      for (const entry of opened) {
        if (entry.port !== null && !entry.closed) {
          entry.closed = true;
          entry.port.close();
        }
      }
    };
    return {handler, opened, outcomes, store: gateway.store, drive, stop,
      createPartitionService};
  }

  function seededCache(row = null) {
    const cache = createSeededCache({partitionId: PARTITION_ID});
    if (row !== null) {
      cache.applySystemTableChange('services', 'INSERT', row);
    }
    return cache;
  }

  // Two founding voters: the target (opened by the handler) and a second
  // real voter, over an in-process transport.
  // openedOf() - the opened ports of the node process currently up.
  function twoVoterGroup(directory, replicaId, openedOf) {
    const founders = [PEER_ID, replicaId];
    const peerDb = new Database(path.join(directory, `${PEER_ID}.db`));
    let peer = null;
    const portAt = (address) => address === addressOf(PEER_ID) ? peer :
      openedOf().findLast((entry) => entry.port !== null && !entry.closed)
        ?.port;
    const send = (address, envelope) => {
      setImmediate(() => {
        try {
          portAt(address)?.step(envelope);
        } catch {
          // A closed recipient drops the envelope, as a dead peer does.
        }
      });
    };
    const membership = {
      [REQUEST.BOOTSTRAP_PEER_IDS]: founders,
      [REQUEST.BOOTSTRAP_MEMBERSHIP]: genesisStamp(founders),
      [REQUEST.SEND_TO_PEER]: send,
    };
    peer = createRaftRsOperationPort(portRequest({
      partitionId: PARTITION_ID, replicaId: PEER_ID, identityExisted: false,
    }, peerDb, membership));
    return {
      peer,
      overridesFor: () => membership,
      close() {
        peer.close();
        peerDb.close();
      },
    };
  }

  // The earlier life: created through the entry, released by its durable
  // SYNCING row, it votes for the peer and acks the peer's entries; then its
  // ACTIVE write is refused, so the create FAILS from SYNCING.
  async function voteAckThenFail({directory, cache, group, replicaId,
    nodes}) {
    const life = {record: null, node: null};
    life.node = startNode({directory, cache, overridesFor: group.overridesFor,
      beforeMutation: async (mutation) => {
        if (!statusWrite(mutation, ReplicaStatus.ACTIVE) || life.record) {
          return;
        }
        group.peer.campaign();
        await within(() => group.peer.readStatus().role === 'leader', 5000);
        group.peer.propose('k3-acked-entry');
        await within(() =>
          readRecord(directory, replicaId).entries >= 2, 5000);
        life.record = readRecord(directory, replicaId);
        throw new Error('ACTIVE write refused');
      }});
    nodes.push(life.node);
    await life.node.drive(replicaId, 'k3-first');
    return life;
  }

  // What a port reopened empty does in the term it voted in (red at the
  // base: the vote it cast is forgotten, a second one is open).
  async function forgetsItsVote(entry, directory, replicaId, earlier) {
    entry.port.campaign();
    await within(() => false, 300);
    const after = readRecord(directory, replicaId).hardState ?? {};
    const before = earlier.hardState;
    return String(after.term) === String(before.term) &&
      String(after.vote) !== String(before.vote);
  }

  t.test('K3: a replica that voted and acked, then FAILED and lost its ' +
    'disk, is never re-driven under its replica id (real second voter)',
  async (t) => {
    const replicaId = 'k3-target';
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-k3-'));
    const cache = seededCache();
    const nodes = [];
    const group = twoVoterGroup(directory, replicaId,
      () => nodes.at(-1)?.opened ?? []);
    try {
      const life = await voteAckThenFail({directory, cache, group, replicaId,
        nodes});
      const failedRow = life.node.store.durableRow('services', replicaId);
      t.same([failedRow.status, failedRow.previous_state],
        [ReplicaStatus.FAILED, ReplicaStatus.SYNCING],
        'it FAILED after it reached SYNCING');
      t.ok(Number(life.record.hardState.term) >= 1 &&
        life.record.entries >= 2, 'it voted and acked entries');
      await life.node.stop();
      wipeRecord(directory, replicaId);
      // The process restarts on the wiped disk; the control plane re-drives.
      const second = startNode({directory, cache, store: life.node.store,
        overridesFor: group.overridesFor});
      nodes.push(second);
      await second.drive(replicaId, 'k3-redrive-1');
      await second.drive(replicaId, 'k3-redrive-2');
      const reopened = second.opened.filter((entry) => entry.port !== null);
      for (const entry of reopened) {
        t.notOk(await forgetsItsVote(entry, directory, replicaId,
          life.record), 'never forgets the vote it cast in that term');
      }
      t.equal(second.opened.length, 0, 'no port opened, empty or otherwise');
      const refusals = second.outcomes.filter((outcome) =>
        outcome.type === EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED);
      t.same(refusals.map((outcome) => [outcome.options.errorCode,
        outcome.options.deferRetry === true]),
      [[OPENED_RESTART_REFUSED, false], [OPENED_RESTART_REFUSED, false]],
      'each re-drive fails the operation, refused typed and terminal');
      const row = second.store.durableRow('services', replicaId);
      t.same([row.status, row.previous_state],
        [ReplicaStatus.FAILED, ReplicaStatus.SYNCING],
        'the row stays FAILED; the opened fact is sticky');
    } finally {
      for (const node of nodes) await node.stop();
      group.close();
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });

  t.test('K3: a FAILED create that never opened (failed at CREATING) is ' +
    're-driven under its replica id and completes', async (t) => {
    const replicaId = 'k3-never-opened';
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-k3n-'));
    const node = startNode({directory, cache: seededCache({
      ...openedRow(replicaId, ReplicaStatus.FAILED),
      previous_state: ReplicaStatus.CREATING})});
    try {
      const response = await node.drive(replicaId, 'k3-never-opened-op');
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED);
      t.equal(node.opened.length, 1, 'one open');
      t.equal(node.opened[0].options.identityExisted, false);
      t.equal(node.store.durableRow('services', replicaId)?.status,
        ReplicaStatus.ACTIVE, 'the re-drive completes');
    } finally {
      await node.stop();
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });

  for (const [label, record] of [
    ['a virgin record completes to ACTIVE', 'virgin'],
    ['a voted record restores and completes', 'voted'],
    ['an absent record is refused reseed-required', null],
  ]) {
    t.test(`F3c: a SYNCING row re-driven after a process restart: ${label}`,
      async (t) => {
        const replicaId = `f3c-${record ?? 'absent'}`;
        const directory =
          fs.mkdtempSync(path.join(os.tmpdir(), 'identity-f3c-'));
        if (record !== null) {
          leaveEarlierAttempt(replicaId, {voted: record === 'voted'})(
            directory);
        }
        const before = record === null ? null :
          readRecord(directory, replicaId);
        const node = startNode({directory,
          cache: seededCache(openedRow(replicaId, ReplicaStatus.SYNCING))});
        try {
          const response = await node.drive(replicaId, `${replicaId}-op`);
          t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
            'routed into the create/resume branch, not in_progress');
          t.ok(node.opened.length >= 1, 'the create opened');
          t.equal(node.opened[0].options.identityExisted, true, 'fact read');
          t.equal(node.opened[0].options.identityRecorded, undefined);
          const row = node.store.durableRow('services', replicaId);
          if (record === null) {
            t.ok(node.opened.every((entry) => entry.port === null),
              'no port opened empty');
            t.equal(node.opened[0].refusal?.reason,
              COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED);
            t.not(row?.status, ReplicaStatus.ACTIVE);
          } else {
            t.equal(isVirgin(before), record === 'virgin');
            t.equal(row?.status, ReplicaStatus.ACTIVE, 'completes to ACTIVE');
            if (record === 'voted') {
              t.ok(Number(readRecord(directory, replicaId).hardState?.term) >=
                Number(before.hardState.term), 'the voted record restored');
            }
          }
        } finally {
          await node.stop();
          fs.rmSync(directory, {recursive: true, force: true});
        }
      });
  }

  // A tracked live runtime (an earlier create of this process still runs it):
  // the entry answers in_progress, and the create path itself never resumes
  // over it (verifier Z5).
  async function trackedRuntimeNode(replicaId) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-trk-'));
    leaveEarlierAttempt(replicaId, {voted: false})(directory);
    const node = startNode({directory,
      cache: seededCache(openedRow(replicaId, ReplicaStatus.SYNCING))});
    const live = await node.createPartitionService({partitionId: PARTITION_ID,
      replicaId, identityExisted: true});
    node.handler.localServices.set(replicaId, live);
    return {node, directory};
  }

  t.test('F3c: a tracked live runtime on its SYNCING row answers ' +
    'in_progress and is never opened over', async (t) => {
    const {node, directory} = await trackedRuntimeNode('f3c-tracked');
    try {
      const response = await node.drive('f3c-tracked', 'f3c-tracked-op');
      t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS);
      t.equal(node.opened.length, 1, 'no second open');
    } finally {
      await node.stop();
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });

  t.test('F3c: the create path never resumes over a tracked runtime',
    async (t) => {
      const {node, directory} = await trackedRuntimeNode('f3c-resume');
      try {
        await node.handler.createReplicaAsync({operationId: 'f3c-resume-op',
          explicitOperationType: OperationType.ADD, partitionId: PARTITION_ID,
          replicaId: 'f3c-resume', bootstrapReplicaIds: [],
          bootstrapPeerAddresses: [], bootstrapTableMetadata: null,
          bootstrapPartitionMetadata: null}).catch(() => undefined);
        t.equal(node.opened.length, 1, 'no second open over the runtime');
      } finally {
        await node.stop();
        fs.rmSync(directory, {recursive: true, force: true});
      }
    });
}
