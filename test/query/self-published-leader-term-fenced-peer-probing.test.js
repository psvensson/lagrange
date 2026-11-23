// Option A regression & safety proof: self-published leader term-fenced peer
// probing for leaderMode: REQUIRED and readOwnerFact.
//
// Proves:
// 1. S0 ruling Q1 (PUBLISHED_LEADER_UNUSABLE) is 100% preserved whenever
//    canonicalLeaderNodeId !== this.nodeId.
// 2. When canonicalLeaderNodeId === this.nodeId and this.nodeId cannot durably
//    determine its own Raft term T_self, routing fails closed
//    (PUBLISHED_LEADER_UNUSABLE) without probing any peer.
// 3. When canonicalLeaderNodeId === this.nodeId and this.nodeId has no open
//    local replica (DURABLE_REJOIN) with durable SQLite _raft_rs_hard_state.term
//    = T_self on disk, both LEADER_REQUIRED and readOwnerFact probe peers
//    fenced by readAuthorityWitness.term >= T_self and succeed via the
//    legitimate successor leader.
// 4. An honest deposed predecessor answering (directly or via LEADER_REDIRECT)
//    with readAuthorityWitness.term < T_self is refused with BELOW_TERM_FLOOR
//    and ships no rows; if another peer leads with term >= T_self, probing
//    advances to it.
// 5. A live local non-leader replica provides T_self in-process when it has no
//    leader redirect address, whereas a live local LEADER never widens to peers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {
  OWNER_FACT_STATE as STATE,
  OWNER_FACT_UNAVAILABLE_REASON as REASON,
  ownerFactRows,
  readOwnerFact,
} from '../../src/control-plane/control-plane-owner-fact-read.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE as READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {CONTROL_PLANE_READINESS_DIMENSION as DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_RESPONSE_TYPE} from '../../src/query/query-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {getPartitionDbPath} from '../../src/storage/data-directory-manager.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {
  PARTITION,
  READ_SQL,
  READ_TIMEOUT_MS,
  TABLE,
  openLedgerGroupSurface,
  ownerFactDraft,
} from '../cdc/cdc-owner-fact-group-fixture.js';

const TEST_TIMEOUT_MS = 120000;
const OPERATION = 'self-leader-term-fence-op';

function createTempDataDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.teardown(() => {
    fs.rmSync(dir, {recursive: true, force: true});
  });
  return dir;
}

function seedHardStateDb(dataDir, partitionId, replicaId, term) {
  const dbPath = getPartitionDbPath(dataDir, partitionId, replicaId);
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const db = new Database(dbPath);
  try {
    db.exec(
      'CREATE TABLE IF NOT EXISTS _raft_rs_hard_state (' +
      'group_id TEXT PRIMARY KEY, term INTEGER NOT NULL, ' +
      'vote INTEGER NOT NULL, commit_index INTEGER NOT NULL)',
    );
    db.prepare(
      'INSERT OR REPLACE INTO _raft_rs_hard_state ' +
      '(group_id, term, vote, commit_index) VALUES (?, ?, 0, 0)',
    ).run(partitionId, term);
  } finally {
    db.close();
  }
  return dbPath;
}

function copyRealPartitionDbToDataDir(sourceDbPath, dataDir, partitionId, replicaId) {
  const targetDbPath = getPartitionDbPath(dataDir, partitionId, replicaId);
  fs.mkdirSync(path.dirname(targetDbPath), {recursive: true});
  fs.copyFileSync(sourceDbPath, targetDbPath);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${sourceDbPath}${suffix}`)) {
      fs.copyFileSync(`${sourceDbPath}${suffix}`, `${targetDbPath}${suffix}`);
    }
  }
  return targetDbPath;
}

function createSyntheticReadSurface({
  nodeId,
  canonicalLeaderNodeId,
  services,
  dataDir = null,
  getLocalPartitionReplicas = () => [],
  deliver,
}) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    partition_id: PARTITION,
    table_id: TABLE,
    ...(canonicalLeaderNodeId ? {leader_node_id: canonicalLeaderNodeId} : {}),
  });
  for (const svc of services) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      service_id: svc.replicaId,
      replica_id: svc.replicaId,
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: PARTITION,
      node_id: svc.nodeId,
      address: svc.address,
      status: SERVICE_STATUS.ACTIVE,
    });
  }
  const messageRouter = {
    nodeId,
    getConnectionState: () => 'connected',
    getConnectedNodes: () => services.map((s) => s.nodeId).filter((id) => id !== nodeId),
    deliver,
  };
  const queryExecutor = new QueryExecutor({
    nodeId,
    messageRouter,
    systemCache: cache,
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    dataDir,
    getLocalPartitionReplicas,
  });
  const sqlQueryEngine = {queryExecutor};
  const cdc = new CDCIntegrationService({
    nodeId,
    messageRouter,
    sqlQueryEngine,
    systemTableCache: cache,
    partitionServicesProvider: () => new Map(),
  });
  cdc.initialize();
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId,
    cdcIntegrationService: cdc,
    systemTableCache: cache,
    sqlQueryEngine,
  });
  return {
    gateway,
    queryExecutor,
    readLeaderRequired(tableName, sql, params, readOptions = {}) {
      return gateway.readAuthoritativeRows(tableName, sql, params, {
        timeoutMs: READ_TIMEOUT_MS,
        deliveryPriority: 'critical',
        workClass: 'critical',
        ...readOptions,
      });
    },
  };
}

function leaderWitness({nodeId, replicaId, term, leaderRead}) {
  return Object.freeze({
    state: 'observed',
    partitionId: PARTITION,
    servingNodeId: nodeId,
    servingReplicaId: replicaId,
    term,
    appliedIndex: 10,
    commitIndex: 10,
    currentTermApplied: true,
    role: RAFT_ROLE.LEADER,
    ...(leaderRead ? {leaderRead} : {}),
    observedAtMs: Date.now(),
  });
}

test('Option A (real raft-rs): self-published leader in DURABLE_REJOIN reads ' +
  'SQLite _raft_rs_hard_state.term and succeeds via term >= T_self successor',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [previousLeader, follower, successorLeader] = group.services;
  await group.settleLeader(previousLeader);
  const prevTerm = Number(previousLeader.raft.readStatus().term);
  t.ok(prevTerm >= 1, `previous leader holds durable term >= 1 (${prevTerm})`);

  // Snapshot the previous leader's real on-disk Raft SQLite DB before transfer.
  const rejoinDataDir = createTempDataDir(t, 'lagrange-opt-a-rejoin-');
  copyRealPartitionDbToDataDir(
    previousLeader.db.name,
    rejoinDataDir,
    PARTITION,
    previousLeader.replicaId,
  );

  // Transfer leadership to successorLeader (higher term) and seed a row there.
  await group.transferLeadership(previousLeader, successorLeader);
  await group.settleLeader(successorLeader);
  const succTerm = Number(successorLeader.raft.readStatus().term);
  t.ok(succTerm > prevTerm, `successor term (${succTerm}) > previous term (${prevTerm})`);
  group.seedRow(successorLeader, OPERATION);

  // Simulate previousLeader restarting in DURABLE_REJOIN:
  // - stale partitions.leader_node_id still points to previousLeader.nodeId
  // - local replica is NOT open yet (getLocalPartitionReplicas returns [])
  // - local address returns NO_HANDLER (unreachable locally)
  const surface = await group.surfaceOf(previousLeader.nodeId, {
    leaderNodeId: previousLeader.nodeId,
    hostedBy: 'handler-only',
  });
  surface.queryExecutor.dataDir = rejoinDataDir;
  surface.queryExecutor.getLocalPartitionReplicas = () => [];
  group.setReachable(previousLeader.nodeId, false);

  // 1. Plain leaderMode: REQUIRED read (like observeAuthoritativeReplicaLifecycle).
  const strictResult = await surface.readLeaderRequired(TABLE, READ_SQL, [OPERATION], {
    authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: LEADER_MODE.REQUIRED,
    routingReadinessDimension: DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });
  t.equal(strictResult.success, true, 'plain LEADER_REQUIRED read succeeds via successor');
  t.equal(strictResult.readAuthorityWitness?.servingNodeId, successorLeader.nodeId);
  t.ok(strictResult.readAuthorityWitness?.term >= prevTerm,
    `serving witness term (${strictResult.readAuthorityWitness?.term}) >= T_self (${prevTerm})`);
  t.same(strictResult.rows, [
    {operation_id: OPERATION, workflow_step: successorLeader.replicaId},
  ]);

  // 2. Owner-fact read (readOwnerFact).
  const ownerFact = await readOwnerFact(
    surface.readLeaderRequired,
    ownerFactDraft([OPERATION]),
  );
  t.equal(ownerFact.state, STATE.READY, 'readOwnerFact succeeds via successor');
  t.equal(ownerFact.witness?.servingNodeId, successorLeader.nodeId);
  t.ok(ownerFact.witness?.term >= prevTerm);
  t.same(ownerFactRows(ownerFact), [
    {operation_id: OPERATION, workflow_step: successorLeader.replicaId},
  ]);

  // Verify follower is untouched and S0 Q1 still holds for OTHER published leaders.
  const otherSurface = await group.surfaceOf(follower.nodeId, {
    leaderNodeId: 'unpublished-other-node',
  });
  otherSurface.queryExecutor.dataDir = rejoinDataDir;
  otherSurface.queryExecutor.getLocalPartitionReplicas = () => [];
  const sentBefore = group.transit.length;
  const otherAnswer = await readOwnerFact(
    otherSurface.readLeaderRequired,
    ownerFactDraft([OPERATION]),
  );
  t.equal(otherAnswer.state, STATE.UNAVAILABLE,
    'S0 Q1 preserved when canonicalLeaderNodeId !== this.nodeId');
  t.equal(otherAnswer.reason, REASON.PUBLISHED_LEADER_UNUSABLE);
  t.equal(group.transit.length, sentBefore, 'no peer asked for other published leader');
});

test('Option A: fails closed when T_self cannot be durably determined', async (t) => {
  const emptyDataDir = createTempDataDir(t, 'lagrange-opt-a-empty-');
  const services = [
    {nodeId: 'node-b', replicaId: `${PARTITION}-r2`, address: `node-b/partition/${PARTITION}`},
    {nodeId: 'node-c', replicaId: `${PARTITION}-r3`, address: `node-c/partition/${PARTITION}`},
  ];
  const probed = [];
  const surface = createSyntheticReadSurface({
    nodeId: 'node-a',
    canonicalLeaderNodeId: 'node-a',
    services,
    dataDir: emptyDataDir,
    getLocalPartitionReplicas: () => [],
    async deliver(address) {
      probed.push(address);
      return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
    },
  });

  const ownerFact = await readOwnerFact(
    surface.readLeaderRequired,
    ownerFactDraft([OPERATION]),
  );
  t.equal(ownerFact.state, STATE.UNAVAILABLE, 'fails closed without durable T_self');
  t.equal(ownerFact.reason, REASON.PUBLISHED_LEADER_UNUSABLE);
  t.same(probed, [], 'never probes any peer when T_self is missing');
});

test('Option A: refuses honest deposed predecessor (term < T_self) directly and ' +
  'via LEADER_REDIRECT, while advancing to term >= T_self successor', async (t) => {
  const dataDir = createTempDataDir(t, 'lagrange-opt-a-fence-');
  const selfReplicaId = `${PARTITION}-r1`;
  const T_SELF = 5;
  seedHardStateDb(dataDir, PARTITION, selfReplicaId, T_SELF);

  const services = [
    {nodeId: 'node-a', replicaId: selfReplicaId, address: `node-a/partition/${PARTITION}`},
    {nodeId: 'node-b', replicaId: `${PARTITION}-r2`, address: `node-b/partition/${PARTITION}`},
    {nodeId: 'node-c', replicaId: `${PARTITION}-r3`, address: `node-c/partition/${PARTITION}`},
  ];

  // Sub-case 1: Only deposed predecessor (term 2 < T_SELF=5) answers; node-c is down.
  await t.test('deposed predecessor alone is refused with BELOW_TERM_FLOOR and zero rows',
    async (t) => {
      const surface = createSyntheticReadSurface({
        nodeId: 'node-a',
        canonicalLeaderNodeId: 'node-a',
        services,
        dataDir,
        getLocalPartitionReplicas: () => [],
        async deliver(address, request) {
          if (address.startsWith('node-b/')) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: true,
              rows: [{operation_id: OPERATION, workflow_step: 'stale-deposed-node-b'}],
              rowSetComplete: true,
              readAuthorityWitness: leaderWitness({
                nodeId: 'node-b',
                replicaId: `${PARTITION}-r2`,
                term: 2,
                leaderRead: request.leaderRead,
              }),
            });
          }
          return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
        },
      });

      const strictResult = await surface.readLeaderRequired(TABLE, READ_SQL, [OPERATION], {
        authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: LEADER_MODE.REQUIRED,
        routingReadinessDimension: DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      });
      t.equal(strictResult.success, false, 'plain LEADER_REQUIRED refuses deposed term');
      t.equal(strictResult.failureCode, REASON.BELOW_TERM_FLOOR);
      t.same(strictResult.rows, [], 'ships no stale rows');

      const ownerFact = await readOwnerFact(
        surface.readLeaderRequired,
        ownerFactDraft([OPERATION]),
      );
      t.equal(ownerFact.state, STATE.UNAVAILABLE);
      t.equal(ownerFact.reason, REASON.BELOW_TERM_FLOOR);
    });

  // Sub-case 2: node-b answers deposed term 2, node-c answers valid term 6 -> advances to node-c.
  await t.test('skips deposed predecessor (term 2) and succeeds on successor (term 6)',
    async (t) => {
      const visited = [];
      const surface = createSyntheticReadSurface({
        nodeId: 'node-a',
        canonicalLeaderNodeId: 'node-a',
        services,
        dataDir,
        getLocalPartitionReplicas: () => [],
        async deliver(address, request) {
          visited.push(address);
          if (address.startsWith('node-b/')) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: true,
              rows: [{operation_id: OPERATION, workflow_step: 'stale-deposed-node-b'}],
              rowSetComplete: true,
              readAuthorityWitness: leaderWitness({
                nodeId: 'node-b',
                replicaId: `${PARTITION}-r2`,
                term: 2,
                leaderRead: request.leaderRead,
              }),
            });
          }
          if (address.startsWith('node-c/')) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: true,
              rows: [{operation_id: OPERATION, workflow_step: 'fresh-successor-node-c'}],
              rowSetComplete: true,
              readAuthorityWitness: leaderWitness({
                nodeId: 'node-c',
                replicaId: `${PARTITION}-r3`,
                term: 6,
                leaderRead: request.leaderRead,
              }),
            });
          }
          return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
        },
      });

      const ownerFact = await readOwnerFact(
        surface.readLeaderRequired,
        ownerFactDraft([OPERATION]),
      );
      t.equal(ownerFact.state, STATE.READY);
      t.equal(ownerFact.witness?.servingNodeId, 'node-c');
      t.equal(ownerFact.witness?.term, 6);
      t.same(ownerFactRows(ownerFact), [
        {operation_id: OPERATION, workflow_step: 'fresh-successor-node-c'},
      ]);
      t.ok(visited.includes(`node-b/partition/${PARTITION}`), 'probed deposed peer first');
      t.ok(visited.includes(`node-c/partition/${PARTITION}`), 'advanced to valid successor');
    });

  // Sub-case 3: LEADER_REDIRECT to deposed predecessor (term 3 < 5) is also refused.
  await t.test('LEADER_REDIRECT target with term < T_self is refused with BELOW_TERM_FLOOR',
    async (t) => {
      const surface = createSyntheticReadSurface({
        nodeId: 'node-a',
        canonicalLeaderNodeId: 'node-a',
        services,
        dataDir,
        getLocalPartitionReplicas: () => [],
        async deliver(address, request) {
          if (address.startsWith('node-b/')) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: false,
              error: REASON.NOT_LEADER,
              failureCode: REASON.NOT_LEADER,
              partitionId: PARTITION,
              redirect: QUERY_RESPONSE_TYPE.LEADER_REDIRECT,
              leaderAddress: `node-c/partition/${PARTITION}`,
            });
          }
          if (address.startsWith('node-c/')) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: true,
              rows: [{operation_id: OPERATION, workflow_step: 'redirected-deposed-node-c'}],
              rowSetComplete: true,
              readAuthorityWitness: leaderWitness({
                nodeId: 'node-c',
                replicaId: `${PARTITION}-r3`,
                term: 3,
                leaderRead: request.leaderRead,
              }),
            });
          }
          return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
        },
      });

      const ownerFact = await readOwnerFact(
        surface.readLeaderRequired,
        ownerFactDraft([OPERATION]),
      );
      t.equal(ownerFact.state, STATE.UNAVAILABLE);
      t.equal(ownerFact.reason, REASON.BELOW_TERM_FLOOR);
    });
});

test('Option A: live local non-leader replica provides T_self in-process, ' +
  'while live local LEADER never widens to peers', async (t) => {
  const services = [
    {nodeId: 'node-a', replicaId: `${PARTITION}-r1`, address: `node-a/partition/${PARTITION}`},
    {nodeId: 'node-b', replicaId: `${PARTITION}-r2`, address: `node-b/partition/${PARTITION}`},
  ];

  // Sub-case A: live local FOLLOWER (term 4) without leaderAddress -> probes node-b (term 4).
  await t.test('live local non-leader without redirect widens fenced by local core term',
    async (t) => {
      const localFollower = {
        partitionId: PARTITION,
        replicaId: `${PARTITION}-r1`,
        raft: {
          observeCurrentAuthority: () => ({
            outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
            groupId: PARTITION,
            replicaIdentity: `${PARTITION}-r1`,
            role: RAFT_ROLE.FOLLOWER,
            term: 4,
          }),
        },
      };
      const surface = createSyntheticReadSurface({
        nodeId: 'node-a',
        canonicalLeaderNodeId: 'node-a',
        services,
        dataDir: null,
        getLocalPartitionReplicas: () => [localFollower],
        async deliver(address, request) {
          if (address.startsWith('node-a/')) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: false,
              error: REASON.NOT_LEADER,
              failureCode: REASON.NOT_LEADER,
              partitionId: PARTITION,
              leaderAddressRefusal: 'no_known_leader',
            });
          }
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: true,
            rows: [{operation_id: OPERATION, workflow_step: 'node-b-term-4'}],
            rowSetComplete: true,
            readAuthorityWitness: leaderWitness({
              nodeId: 'node-b',
              replicaId: `${PARTITION}-r2`,
              term: 4,
              leaderRead: request.leaderRead,
            }),
          });
        },
      });

      const ownerFact = await readOwnerFact(
        surface.readLeaderRequired,
        ownerFactDraft([OPERATION]),
      );
      t.equal(ownerFact.state, STATE.READY);
      t.equal(ownerFact.witness?.servingNodeId, 'node-b');
      t.equal(ownerFact.witness?.term, 4);
    });

  // Sub-case B: live local LEADER -> does NOT widen to node-b (even with dataDir on disk).
  await t.test('live local LEADER never includes peer candidates', async (t) => {
    const leaderDataDir = createTempDataDir(t, 'lagrange-opt-a-live-leader-');
    seedHardStateDb(leaderDataDir, PARTITION, `${PARTITION}-r1`, 4);
    const localLeader = {
      partitionId: PARTITION,
      replicaId: `${PARTITION}-r1`,
      raft: {
        observeCurrentAuthority: () => ({
          outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
          groupId: PARTITION,
          replicaIdentity: `${PARTITION}-r1`,
          role: RAFT_ROLE.LEADER,
          term: 4,
        }),
      },
    };
    const probed = [];
    const surface = createSyntheticReadSurface({
      nodeId: 'node-a',
      canonicalLeaderNodeId: 'node-a',
      services,
      dataDir: leaderDataDir,
      getLocalPartitionReplicas: () => [localLeader],
      async deliver(address) {
        probed.push(address);
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false,
          error: REASON.ELECTION_LOG_NOT_APPLIED,
          failureCode: REASON.ELECTION_LOG_NOT_APPLIED,
          partitionId: PARTITION,
        });
      },
    });

    const ownerFact = await readOwnerFact(
      surface.readLeaderRequired,
      ownerFactDraft([OPERATION]),
    );
    t.equal(ownerFact.state, STATE.UNAVAILABLE);
    t.equal(ownerFact.reason, REASON.ELECTION_LOG_NOT_APPLIED);
    t.ok(probed.every((addr) => addr.startsWith('node-a/')),
      'never probes peer when local replica leads');
  });
});

test('Option A: SQLQueryEngine threads dataDir and local partition replicas ' +
  'into QueryExecutor', async (t) => {
  const dataDir = createTempDataDir(t, 'lagrange-opt-a-engine-');
  const cache = new SystemTableCache();
  const fakeReplica = {partitionId: PARTITION, replicaId: `${PARTITION}-r1`};
  const partitionServices = new Map([[fakeReplica.replicaId, fakeReplica]]);
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: {nodeId: 'node-a', deliver: async () => null},
    dataDir,
    partitionServicesProvider: () => partitionServices,
    migrationAutoWire: false,
    autoStartDistributedTransactionRecovery: false,
    unrefRetryDelayTimers: true,
  });
  t.teardown(async () => {
    await engine.shutdown();
  });
  t.equal(engine.queryExecutor.dataDir, dataDir,
    'SQLQueryEngine forwards dataDir to QueryExecutor');
  t.same(engine.queryExecutor.getLocalPartitionReplicas(PARTITION), [fakeReplica],
    'SQLQueryEngine resolves local partition replicas for QueryExecutor');
});
