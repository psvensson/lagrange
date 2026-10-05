// The CREATE_REPLICA target's identity record (verifier N3): createReplicaAsync
// hands its port a pending record whenever the prior-existence fact is not
// yet durable, and only the durable SYNCING write - through the status
// owner's bounded retry - releases it. The partition factory opens a REAL
// rs-raft port (createRaftRsOperationPort, the real WASM core) from exactly
// the options the handler passes, so the port's own answers are the verdict.
//
//   R1  the record is pending at the open and while the SYNCING write is in
//       flight, and released by its durable acknowledgement alone;
//   R2  a SYNCING write that is retried once releases once, after success;
//   R3  a SYNCING write refused for good never releases: the spent wait is
//       logged, the create fails and the port - which never stepped
//       anything - is closed;
//   R4  the paths that skip the PENDING insert (runtime repair; a restarted
//       create whose authoritative row is SYNCING on this node) read the
//       fact, hand no pending record, and a wiped target is refused
//       reseed-required at open: no port ever opens empty.

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
import {REPLICA_HANDLER_LOG_MSG} from
  '../../src/node/replica-handler-constants.js';
import {createLifecycleControlPlaneGatewayForCache} from
  '../test-helpers/lifecycle-state-store.js';
import {bindRegisteredReplicaHandler} from
  '../test-helpers/replica-handler-identity-fixture.js';

const PARTITION_ID = 'identity-record-partition';
const NODE_ID = 'test-node';
const TIMING = Object.freeze({heartbeatMs: 50, electionMinMs: 150,
  electionMaxMs: 300, tickIntervalMs: 10});

function addressOf(replicaId) {
  return `raft-rs://replica-${replicaId}`;
}

// The partition factory: one real port per create, from the handler's own
// options; a refused opening throws as PartitionService.initialize does.
function realPortFactory(directory, opened) {
  return async (options) => {
    const db = new Database(path.join(directory, `${options.replicaId}.db`));
    const request = {
      [REQUEST.GROUP_ID]: options.partitionId,
      [REQUEST.PEER_ID]: options.replicaId,
      [REQUEST.PEER_ADDRESS]: addressOf(options.replicaId),
      [REQUEST.BOOTSTRAP_PEER_IDS]: [options.replicaId],
      [REQUEST.BOOTSTRAP_MEMBERSHIP]: genesisStamp([options.replicaId]),
      [REQUEST.IDENTITY_EXISTED]: options.identityExisted,
      ...(options.identityRecorded === undefined ? {} :
        {[REQUEST.IDENTITY_RECORDED]: options.identityRecorded}),
      [REQUEST.DURABLE_STORAGE]: db,
      [REQUEST.TIMING]: TIMING,
      [REQUEST.DEFER_ELECTION]: true,
      [REQUEST.SEND_TO_PEER]: () => undefined,
      [REQUEST.RESOLVE_PEER_ADDRESS]: addressOf,
      [REQUEST.APPLY_COMMITTED_ENTRY]: () => undefined,
      [REQUEST.SNAPSHOT_CATCHUP_NEEDED]: () => undefined,
    };
    const entry = {options, port: null, refusal: null, closed: false};
    opened.push(entry);
    try {
      entry.port = createRaftRsOperationPort(request);
    } catch (error) {
      entry.refusal = error.consensus ?? {reason: error.message};
      db.close();
      throw error;
    }
    return bindRegisteredReplicaHandler({
      partitionId: options.partitionId,
      replicaId: options.replicaId,
      initialized: true,
      raft: entry.port,
      async shutdown() {
        if (!entry.closed) {
          entry.closed = true;
          entry.port.close();
          db.close();
        }
      },
      async syncFromLeader() {},
    }, options);
  };
}

function syncingWrite(mutation, status) {
  return mutation.tableName === 'services' &&
    mutation.operation === 'update' && mutation.data?.status === status;
}

export async function registerReplicaHandlerIdentityRecordTests({
  t,
  ReplicaHandler,
  OperationType,
  ReplicaStatus,
  ReplicaStateMachine,
  createMockCDCService,
  createSeededCache,
}) {
  async function driveCreate({replicaId, beforeMutation, seedRow = null,
    request = {}}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-rec-'));
    const cache = createSeededCache({partitionId: PARTITION_ID});
    if (seedRow !== null) {
      cache.applySystemTableChange('services', 'INSERT', seedRow);
    }
    const opened = [];
    const stateMachine = new ReplicaStateMachine({
      nodeId: NODE_ID,
      controlPlaneSystemTableGateway:
        createLifecycleControlPlaneGatewayForCache(cache, {
          beforeMutation: (mutation) => beforeMutation?.(mutation, opened),
        }),
    });
    const handler = new ReplicaHandler({
      nodeId: NODE_ID,
      dataDir: directory,
      systemTableCache: cache,
      cdcIntegrationService: createMockCDCService(cache),
      replicaStateMachine: stateMachine,
      createPartitionService: realPortFactory(directory, opened),
    });
    handler.initialize();
    const warnings = [];
    const warn = handler.logger.warn.bind(handler.logger);
    handler.logger.warn = (message, context) => {
      warnings.push({message, context});
      return warn(message, context);
    };
    let failure = null;
    try {
      await handler.createReplicaAsync({
        operationId: `${replicaId}-op`,
        explicitOperationType: OperationType.ADD,
        partitionId: PARTITION_ID,
        replicaId,
        bootstrapReplicaIds: [],
        bootstrapPeerAddresses: [],
        bootstrapTableMetadata: null,
        bootstrapPartitionMetadata: null,
        ...request,
      });
    } catch (error) {
      failure = error;
    }
    const finish = async () => {
      await handler.shutdown();
      for (const entry of opened) {
        if (entry.port !== null && !entry.closed) {
          entry.port.close();
        }
      }
      fs.rmSync(directory, {recursive: true, force: true});
    };
    return {opened, warnings, failure, finish};
  }

  const recordStateAt = (entry) => entry.port.readStatus().identityRecorded;

  t.test('R1: the identity record is pending through the SYNCING write and ' +
    'released by its durable acknowledgement alone', async (t) => {
    const atWrite = [];
    const run = await driveCreate({
      replicaId: 'r1-target',
      beforeMutation: (mutation, opened) => {
        if (syncingWrite(mutation, ReplicaStatus.SYNCING)) {
          atWrite.push(recordStateAt(opened[0]));
        }
      },
    });
    try {
      t.equal(run.failure, null, 'the create completes');
      t.equal(run.opened.length, 1);
      t.ok(run.opened[0].options.identityRecorded, 'a pending record');
      t.same(atWrite, [false], 'unrecorded while the write is in flight');
      t.equal(recordStateAt(run.opened[0]), true, 'released after it');
      t.equal(run.opened[0].port.readStatus().gateOpen, true);
    } finally {
      await run.finish();
    }
  });

  t.test('R2: a SYNCING write retried once releases once, after success',
    async (t) => {
      const atWrite = [];
      const run = await driveCreate({
        replicaId: 'r2-target',
        beforeMutation: (mutation, opened) => {
          if (!syncingWrite(mutation, ReplicaStatus.SYNCING)) {
            return;
          }
          atWrite.push(recordStateAt(opened[0]));
          if (atWrite.length === 1) {
            const error = new Error(
              'Distributed operation failed due to participant failures');
            error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
            error.retryAfterMs = 1;
            throw error;
          }
        },
      });
      try {
        t.equal(run.failure, null);
        t.same(atWrite, [false, false], 'still unrecorded on the retry');
        t.equal(recordStateAt(run.opened[0]), true);
      } finally {
        await run.finish();
      }
    });

  t.test('R3: a SYNCING write refused for good never releases; the spent ' +
    'wait is logged and the never-participating port is closed',
  async (t) => {
    let campaignWhileClosed = null;
    const run = await driveCreate({
      replicaId: 'r3-target',
      beforeMutation: (mutation, opened) => {
        if (syncingWrite(mutation, ReplicaStatus.SYNCING)) {
          campaignWhileClosed = opened[0].port.campaign();
          throw new Error('SERVICES write refused');
        }
      },
    });
    try {
      t.ok(run.failure, 'the create fails');
      t.equal(campaignWhileClosed?.reason,
        'participation-gate-identity-unrecorded');
      t.equal(run.opened[0].closed, true, 'the port is closed');
      const spent = run.warnings.find((line) => line.message ===
        REPLICA_HANDLER_LOG_MSG.IDENTITY_RECORD_WAIT_SPENT);
      t.ok(spent, 'the spent wait is logged');
      t.equal(spent?.context?.awaited, ReplicaStatus.SYNCING);
      t.equal(spent?.context?.lastObserved, 'SERVICES write refused');
    } finally {
      await run.finish();
    }
  });

  const openedRow = (replicaId, status) => ({
    service_id: replicaId,
    service_type: 'partition',
    partition_id: PARTITION_ID,
    node_id: NODE_ID,
    replica_id: replicaId,
    status,
    address: `${NODE_ID}/partition/${replicaId}`,
    created_at: 1,
    state_entered_at: 1,
    updated_at: 1,
  });

  for (const [name, status, request] of [
    ['runtime repair (no status write)', ReplicaStatus.ACTIVE,
      {skipLifecycleStatusPersistence: true}],
    ['a restarted create whose row is SYNCING', ReplicaStatus.SYNCING, {}],
  ]) {
    t.test(`R4: ${name}: the fact is read before any write, no pending ` +
      'record is handed, and a wiped target is refused at open', async (t) => {
      const replicaId = `r4-${status}`;
      const run = await driveCreate({replicaId,
        seedRow: openedRow(replicaId, status), request});
      try {
        t.ok(run.failure, 'the create fails closed');
        const opens = run.opened;
        t.ok(opens.every((entry) => entry.port === null),
          'no port opened empty');
        if (opens.length > 0) {
          t.equal(opens[0].options.identityExisted, true);
          t.equal(opens[0].options.identityRecorded, undefined);
          t.equal(opens[0].refusal?.reason,
            COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED);
        } else {
          t.comment(`${name}: refused before the open: ${run.failure.message}`);
        }
      } finally {
        await run.finish();
      }
    });
  }
}
