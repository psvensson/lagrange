// A partition never reports a consensus operation its port refused as done
// (quest raft-rs-single-path-partition-cutover, verification round 1: F-f and
// F-h; rules R07 and R11).
//
// F-f: a single-replica partition campaigns for its own group at
// initialization. When the port refuses the campaign, the partition cannot
// lead and cannot serve a write, so initialization fails closed with a typed
// startup outcome and releases what it acquired - it never reports an
// initialized partition that will answer every write "no leader".
//
// F-h: the admission owner proposes a peer through the port and records the
// port's actual answer: proposed, refused (with the port's reason), deferred
// (a retryable host failure such as an open user transaction) or queued
// behind the group's in-flight work (and recorded again when it settles).
//
// Expectations are read from what the port answered: the controllable
// provider records every answer it gave, and the production inert port (an
// rs-raft record without its lifecycle row) answers with its own reason.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {
  ControllablePartitionRaftProvider,
  createControllablePartitionService,
} from './partition-service-test-support.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDCOperation,
  PartitionService,
} from '../../src/partition/partition-service.js';
import {PARTITION_CONSENSUS_STARTUP_OUTCOME} from
  '../../src/partition/partition-service-constants.js';
import {admitPartitionRaftPeer} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {deepFreeze} from '../../src/raft/raft-operation-port.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_PERSISTENCE_ADMISSION} from
  '../../src/raft/raft-rs-durable-store-constants.js';

const TEMP_PREFIX = 'partition-port-refusal-';
const DB_FILE = 'partition.sqlite';
const TABLE_NAME = 'port_refusal_rows';
const TEST_TIMEOUT_MS = 30000;
const LOG_LEVELS = ['info', 'warn', 'error', 'debug', 'trace', 'fatal'];
// Inputs: what a refusing port answers (the port's own outcome vocabulary).
const CAMPAIGN_REFUSAL = deepFreeze({
  outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
  reason: 'campaign-refused-by-test-port',
  retryable: false,
  recoveryRequired: false,
});
const PEER = Object.freeze({
  replicaIdentity: 'refusal-peer-r2',
  peerAddress: 'refusal-node-2/partition/refusal-peer-r2',
});

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'port-refusal-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function partitionOptions(partitionId, dbPath) {
  return {
    partitionId,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'port-refusal-node',
    dbPath,
    schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
  };
}

async function withDirectory(body) {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  try {
    await body(path.join(directory, DB_FILE));
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

function recordLog(service) {
  const entries = [];
  const base = service.logger;
  const recorder = {};
  for (const level of LOG_LEVELS) {
    recorder[level] = (message, payload) => {
      entries.push({level, message, payload});
      base[level](message, payload);
    };
  }
  service.logger = recorder;
  return entries;
}

function admissionsLogged(log) {
  return log.filter((entry) =>
    entry.payload?.admission?.replicaIdentity === PEER.replicaIdentity)
    .map((entry) => entry.payload.admission);
}

async function refusedInitialization(service) {
  try {
    await service.initialize();
  } catch (error) {
    return error;
  }
  return null;
}

test('F-f: a single-replica partition whose port refuses its campaign fails ' +
  'initialization closed with a typed outcome', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withDirectory(async (dbPath) => {
    const provider = new ControllablePartitionRaftProvider();
    provider.setCampaignHandler(() => CAMPAIGN_REFUSAL);
    const service = createControllablePartitionService(
      partitionOptions('ff-controllable', dbPath), provider);
    const error = await refusedInitialization(service);
    try {
      assert.ok(error !== null,
        'initialization does not report a partition that cannot lead');
      assert.equal(error.code,
        PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED,
        `the refusal is the typed startup outcome (${error?.message})`);
      assert.deepEqual(error.consensus, CAMPAIGN_REFUSAL,
        'the error carries what the port answered');
      assert.equal(error.phase, CAMPAIGN_REFUSAL.phase ?? null,
        'and names the port\'s phase (none here)');
      assert.equal(service.initialized, false, 'the partition is not initialized');
      assert.equal(service.raft, null, 'the port was released');
      assert.equal(service.db, null, 'the database handle was released');
    } finally {
      await service.shutdown();
    }
  });
});

test('F-f: production construction over an inert rs-raft record (no ' +
  'lifecycle row) fails initialization closed with the port\'s own reason',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withDirectory(async (dbPath) => {
    const partitionId = 'ff-inert-port';
    // An rs-raft record whose lifecycle row is missing: the store owner's
    // own writer puts only the applied state.
    const seeded = new Database(dbPath);
    try {
      new RaftRsDurableStore(seeded).putAppliedState(partitionId, '0', {
        voters: ['1'], learners: [], votersOutgoing: [], learnersNext: [],
        autoLeave: false,
      });
    } finally {
      seeded.close();
    }
    const service = new PartitionService(partitionOptions(partitionId, dbPath));
    const error = await refusedInitialization(service);
    try {
      assert.ok(error !== null,
        'initialization does not report a partition that cannot lead');
      assert.equal(error.code,
        PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED,
        `the refusal is the typed startup outcome (${error?.message})`);
      assert.equal(error.consensus?.outcome,
        RAFT_OPERATION_OUTCOME.CORE_REFUSED, 'the port refused the campaign');
      assert.equal(typeof error.consensus?.reason, 'string',
        'the port\'s own reason rides on the refusal');
      assert.equal(service.raft, null, 'the port was released');
      assert.equal(service.db, null, 'the database handle was released');
    } finally {
      await service.shutdown();
    }
  });
});

test('F-h: peer admission records the port\'s actual answer - proposed, ' +
  'refused with its reason, deferred, or queued and then settled',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withDirectory(async (dbPath) => {
    const provider = new ControllablePartitionRaftProvider();
    const service = createControllablePartitionService(
      partitionOptions('fh-admission', dbPath), provider);
    try {
      await service.initialize();
      assert.equal(service.raft.readStatus().role, RAFT_ROLE.LEADER,
        'setup: the lone replica leads');
      const log = recordLog(service);
      const answers = [
        deepFreeze({
          outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
          reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.PEER_UNRESERVED,
          phase: 'membership-admission',
          retryable: false,
          recoveryRequired: false,
        }),
        deepFreeze({
          outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
          reason: RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN,
          phase: 'ready-persistence',
          retryable: true,
          recoveryRequired: false,
        }),
      ];
      const queued = Promise.withResolvers();
      let next = 0;
      provider.setConfChangeHandler(() => {
        const answer = next < answers.length ? answers[next] : queued.promise;
        next += 1;
        return answer;
      });

      const refused = admitPartitionRaftPeer(service, PEER);
      const deferred = admitPartitionRaftPeer(service, PEER);
      const pending = admitPartitionRaftPeer(service, PEER);
      queued.resolve(deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK}));
      const settled = await pending.settled;

      assert.equal(refused.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED,
        'a refused proposal is recorded as refused, never as proposed');
      assert.equal(refused.reason, provider.confChangeOutcomes[0].reason,
        'the refusal carries the port\'s reason');
      assert.equal(deferred.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.DEFERRED,
        'a retryable host failure is recorded as deferred');
      assert.equal(deferred.reason, provider.confChangeOutcomes[1].reason,
        'the deferral carries the port\'s reason');
      assert.equal(pending.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.QUEUED,
        'a proposal queued behind the group is recorded as queued');
      assert.equal(settled.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
        'the queued proposal is recorded as proposed once the port answers ' +
        'CORE_OK');
      assert.deepEqual(admissionsLogged(log).map((entry) => entry.outcome), [
        RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED,
        RAFT_MEMBERSHIP_ADMISSION_OUTCOME.DEFERRED,
        RAFT_MEMBERSHIP_ADMISSION_OUTCOME.QUEUED,
        RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
      ], 'the log records every answer the port actually gave');
      assert.equal(provider.confChanges.length, 3,
        'each admission reached the port exactly once');
    } finally {
      await service.shutdown();
    }
  });
});

test('F-h: the services-cache reconcile records a refused admission as ' +
  'refused, with the port\'s reason', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withDirectory(async (dbPath) => {
    const provider = new ControllablePartitionRaftProvider();
    const partitionId = 'fh-reconcile';
    const cache = new SystemTableCache();
    const service = createControllablePartitionService({
      ...partitionOptions(partitionId, dbPath),
      systemTableCache: cache,
    }, provider);
    try {
      await service.initialize();
      const log = recordLog(service);
      provider.setConfChangeHandler(() => deepFreeze({
        outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.PEER_UNRESERVED,
        phase: 'membership-admission',
        retryable: false,
        recoveryRequired: false,
      }));
      cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
        service_id: PEER.replicaIdentity,
        replica_id: PEER.replicaIdentity,
        partition_id: partitionId,
        service_type: SERVICE_TYPE.PARTITION,
        address: PEER.peerAddress,
        status: SERVICE_STATUS.ACTIVE,
      });
      service.reconcileRaftPeersFromCache();

      const logged = log.filter((entry) =>
        entry.payload?.admission?.replicaIdentity === PEER.replicaIdentity);
      assert.ok(logged.length > 0, 'the reconcile reached the admission owner');
      assert.equal(provider.confChangeOutcomes.length > 0, true,
        'the admission reached the port');
      for (const entry of logged) {
        assert.equal(entry.payload.admission.outcome,
          RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED,
          'every recorded admission is the refusal the port gave');
        assert.equal(entry.payload.admission.reason,
          provider.confChangeOutcomes[0].reason,
          'the record carries the port\'s reason');
        assert.equal(entry.level, 'warn',
          'a refused admission is operator-visible');
      }
    } finally {
      await service.shutdown();
    }
  });
});
