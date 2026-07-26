import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';

import {AddressManager} from '../../src/address/address-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {
  requestSnapshotInstall,
  resolveReplicaCheckpointsRoot,
} from '../../src/raft/snapshot-install.js';
import {
  createSealedSourceGeneration,
} from './snapshot-catchup-fixture.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
} from '../../src/raft/snapshot-install-constants.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME,
} from '../../src/raft/snapshot-catchup-constants.js';
import {
  dispatchSnapshotCatchup,
  orchestrateSnapshotCatchupInstall,
} from '../../src/raft/snapshot-catchup.js';
import {
  createInProcWebSocketPair,
} from '../../src/transport/inproc-transport.js';

// S4 end-to-end (quest raft-snapshot-compacted-follower-catchup): two REAL
// PartitionServices over one MessageRouter (the raft-message-delivery
// property-test skeleton) with deferred elections and MANUAL leader
// promotion (the production single-replica promotion precedent). The leader
// replica is INSTALLED from a sealed generation — its log prefix is
// GENUINELY absent — and commits further entries above the boundary; a
// fresh follower joins, the append-fail cycle emits the typed
// install_snapshot decision through the service seam, and the full loop
// (dispatch -> in-process transfer -> shutdown -> install -> recreate via
// the injected factory -> registerReplacementService) recovers it: the
// FIRST entry applied post-recreation is exactly boundary+1 and the state
// machines converge. Scenario (a) — an installed follower resuming against
// a full-log leader — is pinned as a regression with NO dispatch, and both
// tests pin the durable-currentTerm raft.term boot seeding.

const TABLE = 'catchup_rows';
const PARTITION_ID = 'catchup_rows-p1';
const TERM = 4;
const SEALED_EPOCH = 7;
const BOUNDARY_ENTRY_COUNT = 3;
const EXTRA_ENTRY_COUNT = 2;
const HEAD_INDEX = BOUNDARY_ENTRY_COUNT + EXTRA_ENTRY_COUNT;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: TABLE}),
  membershipEpoch: SEALED_EPOCH,
});
const SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'payload', type: 'TEXT'},
  ],
});
const HUGE_HEARTBEAT_MS = 3600000;
const HUGE_ELECTION_MIN_MS = 7200000;
const HUGE_ELECTION_MAX_MS = 7300000;
const WAIT_TIMEOUT_MS = 10000;
const WAIT_POLL_MS = 10;

let testPortCounter = 33500;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'catchup-e2e-node'},
    raft: {
      heartbeatIntervalMs: HUGE_HEARTBEAT_MS,
      electionTimeoutMinMs: HUGE_ELECTION_MIN_MS,
      electionTimeoutMaxMs: HUGE_ELECTION_MAX_MS,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
});

async function waitFor(predicate, label) {
  const startMs = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) {
      return value;
    }
    if (Date.now() - startMs > WAIT_TIMEOUT_MS) {
      throw new Error(`waitFor timeout: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
  }
}

// Source replica with BOUNDARY_ENTRY_COUNT committed+applied entries; its
// sealed checkpoint generation lands directly in `checkpointsRoot`.
function createSealedGeneration(workDir, checkpointsRoot) {
  return createSealedSourceGeneration({
    workDir,
    checkpointsRoot,
    partitionId: PARTITION_ID,
    stateTable: TABLE,
    term: TERM,
    identity: IDENTITY,
    entryCount: BOUNDARY_ENTRY_COUNT,
  });
}

function buildService(router, {replicaId, replicaIds, dbPath}) {
  const addressManager = AddressManager.getInstance();
  return new PartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE,
    tableName: TABLE,
    replicaId,
    replicaIds,
    peerAddresses: replicaIds.map(
      (peerReplicaId) => addressManager.format(
        'catchup-e2e-node', 'partition', peerReplicaId)),
    nodeId: 'catchup-e2e-node',
    transport: router,
    dbPath,
    schema: SCHEMA,
    deferElection: true,
  });
}

// Manual leader promotion — the production single-replica precedent
// (partition-service-raft-init-base.js): no live election timers anywhere.
function promoteLeader(service) {
  service.raft.change({state: LifeRaft.LEADER});
  service.raft.leader = service.getUnifiedAddress();
}

// Commit+apply one production INSERT envelope on the leader WITHOUT quorum
// machinery (deferred-election harness): durable log append + commit, then
// the same applyCommittedEntry + recordAppliedAdvance pair the raft commit
// event wiring performs.
function commitLeaderInsert(service, ordinal) {
  const command = {
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: `INSERT INTO ${TABLE} (id, payload) VALUES (?, ?)`,
    params: [`extra-${ordinal}`, `extra-payload-${ordinal}`],
    entryId: `extra-entry-${ordinal}`,
  };
  const entry = service.logAdapter.saveCommand(command, TERM);
  service.logAdapter.commit(entry.index);
  service.applyCommittedEntry(command);
  service.storage.recordAppliedAdvance();
  return entry;
}

async function driveHeartbeat(service) {
  const heartbeat = await service.raft.packet('append');
  service.raft.message(LifeRaft.FOLLOWER, heartbeat);
}

function readStateRows(db) {
  return db.prepare(`SELECT id, payload FROM ${TABLE} ORDER BY id`).all();
}

function readRaftStateValue(db, key) {
  const row = db.prepare(
    'SELECT value FROM _raft_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

test('a fresh follower behind an installed leader recovers end to end',
  async (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catchup-e2e-'));
    const port = testPortCounter++;
    const router = new MessageRouter({nodeId: 'catchup-e2e-node', wsPort: port});
    const leaderDbPath = path.join(workDir, 'partition', 'leader.db');
    const followerDbPath = path.join(workDir, 'partition', 'follower.db');
    fs.mkdirSync(path.dirname(leaderDbPath), {recursive: true});
    const leaderRoot = resolveReplicaCheckpointsRoot(leaderDbPath);
    const followerRoot = resolveReplicaCheckpointsRoot(followerDbPath);
    const leaderReplicaId = `${PARTITION_ID}-r1`;
    const followerReplicaId = `${PARTITION_ID}-r2`;
    const replicaIds = [leaderReplicaId, followerReplicaId];
    let leader = null;
    let follower = null;
    let replacement = null;
    try {
      // The leader replica is INSTALLED from the sealed generation: its log
      // prefix 1..boundary is genuinely absent (compacted-empty + boundary).
      const generation = await createSealedGeneration(workDir, leaderRoot);
      const installed = await requestSnapshotInstall({
        replicaDbPath: leaderDbPath,
        checkpointsRoot: leaderRoot,
        generationIndex: generation.boundaryIndex,
        expectedIdentity: IDENTITY,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'fixture: the leader replica is snapshot-installed');

      await router.initialize({startServer: true});
      leader = buildService(router,
        {replicaId: leaderReplicaId, replicaIds, dbPath: leaderDbPath});
      await leader.initialize();
      t.equal(leader.raft.term, TERM,
        'recorded gap: the live raft term is boot-seeded from durable ' +
        'currentTerm on the installed leader');
      follower = buildService(router,
        {replicaId: followerReplicaId, replicaIds, dbPath: followerDbPath});
      await follower.initialize();
      promoteLeader(leader);

      // Commit+apply entries ABOVE the boundary on the leader.
      for (let ordinal = 1; ordinal <= EXTRA_ENTRY_COUNT; ordinal += 1) {
        commitLeaderInsert(leader, ordinal);
      }
      t.equal(leader.logAdapter.getCommittedIndex(), HEAD_INDEX,
        'fixture: the leader head sits above the boundary');

      // The append-fail cycle emits the typed decision through the seam.
      const decisions = [];
      leader.onSnapshotCatchupNeeded = (decision) => decisions.push(decision);
      await driveHeartbeat(leader);
      await waitFor(() => decisions.length > 0, 'install_snapshot decision');
      t.equal(decisions[0].outcome,
        RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        'the leader emits the typed install_snapshot decision');
      t.equal(decisions[0].leaderBoundary, generation.boundaryIndex,
        'the decision carries the leader boundary');
      t.equal(decisions[0].followerAddress, follower.getUnifiedAddress(),
        'the decision names the compacted-behind follower');

      // Full recovery loop over an in-process duplex.
      const {a, b} = createInProcWebSocketPair();
      const appliedCommands = [];
      const [dispatched, orchestrated] = await Promise.all([
        dispatchSnapshotCatchup({
          decision: decisions[0],
          checkpointsRoot: leaderRoot,
          identity: IDENTITY,
          db: leader.db,
          socketProvider: () => a,
        }),
        orchestrateSnapshotCatchupInstall({
          service: follower,
          receiveOptions: {
            socket: b,
            checkpointsRoot: followerRoot,
            expectedIdentity: IDENTITY,
          },
          createPartitionService: async (factoryOptions) => {
            t.equal(factoryOptions.dbPath, followerDbPath,
              'the factory receives the SAME dbPath as the old service');
            const service = buildService(router, {
              replicaId: factoryOptions.replicaId,
              replicaIds: factoryOptions.replicaIds,
              dbPath: factoryOptions.dbPath,
            });
            await service.initialize();
            const originalApply = service.applyCommittedEntry.bind(service);
            service.applyCommittedEntry = (command) => {
              appliedCommands.push(command);
              return originalApply(command);
            };
            return service;
          },
          registerReplacementService: (service) => {
            replacement = service;
          },
        }),
      ]);
      t.equal(dispatched.outcome,
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
        'the leader dispatch serves the transfer to completion');
      t.equal(dispatched.generationIndex, generation.boundaryIndex,
        'the newest eligible generation is served');
      t.equal(orchestrated.outcome,
        RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.INSTALLED_AND_RECREATED,
        'the follower orchestration installs and recreates');
      t.equal(orchestrated.service, replacement,
        'the replacement is handed to registerReplacementService');
      t.equal(follower.isShutdown, true,
        'the old service instance is shut down, never re-initialized');
      t.equal(replacement.raft.term, TERM,
        'the recreated follower raft term equals the durable currentTerm');
      t.equal(
        Number(readRaftStateValue(replacement.db,
          RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_INDEX)),
        generation.boundaryIndex,
        'the recreated follower boots at the installed boundary');

      // Resume: the next leader append-fail cycle batches boundary+1..head.
      await driveHeartbeat(leader);
      await waitFor(
        () => replacement.logAdapter.getCommittedIndex() === HEAD_INDEX,
        'follower commits through the leader head');

      t.equal(appliedCommands.length, EXTRA_ENTRY_COUNT,
        'exactly the above-boundary entries are applied post-recreation');
      t.equal(appliedCommands[0].entryId, 'extra-entry-1',
        'the first applied command is the boundary+1 entry');
      t.equal(
        replacement.db.prepare(
          'SELECT MIN(log_index) AS m FROM _raft_log').get().m,
        generation.boundaryIndex + 1,
        'nothing below boundary+1 was ever appended — resume is exact');
      t.equal(
        Number(readRaftStateValue(replacement.db, 'lastAppliedIndex')),
        HEAD_INDEX,
        'the applied watermark advances densely from the boundary');
      t.same(readStateRows(replacement.db), readStateRows(leader.db),
        'the follower state machine converges with the leader');
      t.equal(readStateRows(replacement.db).length, HEAD_INDEX,
        'the converged state carries both the image and the resumed rows');
    } finally {
      if (replacement && !replacement.isShutdown) {
        await replacement.shutdown();
      }
      if (follower && !follower.isShutdown) {
        await follower.shutdown();
      }
      if (leader && !leader.isShutdown) {
        await leader.shutdown();
      }
      await router.shutdown();
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });

test('scenario (a) regression: an installed follower resumes against a ' +
  'full-log leader with NO dispatch', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catchup-e2e-a-'));
  const port = testPortCounter++;
  const router = new MessageRouter({nodeId: 'catchup-e2e-node', wsPort: port});
  const leaderDbPath = path.join(workDir, 'partition', 'leader.db');
  const followerDbPath = path.join(workDir, 'partition', 'follower.db');
  fs.mkdirSync(path.dirname(leaderDbPath), {recursive: true});
  const followerRoot = resolveReplicaCheckpointsRoot(followerDbPath);
  const leaderReplicaId = `${PARTITION_ID}-r1`;
  const followerReplicaId = `${PARTITION_ID}-r2`;
  const replicaIds = [leaderReplicaId, followerReplicaId];
  let leader = null;
  let follower = null;
  try {
    // The follower is INSTALLED from the sealed generation; the leader keeps
    // the FULL log 1..boundary (a copy of the source lineage) — boundary 0.
    const generation = await createSealedGeneration(workDir, followerRoot);
    fs.copyFileSync(generation.sourceDbPath, leaderDbPath);
    const seedDb = new Database(leaderDbPath);
    seedDb.prepare(
      'INSERT INTO _raft_state (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run('currentTerm', String(TERM));
    seedDb.close();
    const installed = await requestSnapshotInstall({
      replicaDbPath: followerDbPath,
      checkpointsRoot: followerRoot,
      generationIndex: generation.boundaryIndex,
      expectedIdentity: IDENTITY,
    });
    t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
      'fixture: the follower replica is snapshot-installed');

    await router.initialize({startServer: true});
    leader = buildService(router,
      {replicaId: leaderReplicaId, replicaIds, dbPath: leaderDbPath});
    await leader.initialize();
    t.equal(leader.raft.term, TERM,
      'the durable currentTerm row seeds the full-log leader term too');
    follower = buildService(router,
      {replicaId: followerReplicaId, replicaIds, dbPath: followerDbPath});
    await follower.initialize();
    t.equal(follower.raft.term, TERM,
      'the installed follower raft term is boot-seeded');
    promoteLeader(leader);
    for (let ordinal = 1; ordinal <= EXTRA_ENTRY_COUNT; ordinal += 1) {
      commitLeaderInsert(leader, ordinal);
    }

    const decisions = [];
    leader.onSnapshotCatchupNeeded = (decision) => decisions.push(decision);
    await driveHeartbeat(leader);
    await waitFor(
      () => follower.logAdapter.getCommittedIndex() === HEAD_INDEX,
      'installed follower commits through the full-log leader head');

    t.same(decisions, [],
      'a boundary-0 leader never emits a catch-up decision (no dispatch)');
    t.equal(leader.raft._lastSnapshotCatchupDecision, undefined,
      'no decision is recorded on the leader instance either');
    t.equal(
      follower.db.prepare(
        'SELECT MIN(log_index) AS m FROM _raft_log').get().m,
      generation.boundaryIndex + 1,
      'the installed follower resumes exactly after its boundary');
    t.same(readStateRows(follower.db), readStateRows(leader.db),
      'the installed follower state machine converges with the leader');
  } finally {
    if (follower && !follower.isShutdown) {
      await follower.shutdown();
    }
    if (leader && !leader.isShutdown) {
      await leader.shutdown();
    }
    await router.shutdown();
    fs.rmSync(workDir, {recursive: true, force: true});
  }
});
