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
import {performance} from 'node:perf_hooks';
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
import {
  resolveSelfPublishedLeaderTermFloor,
} from '../../src/query/query-executor-self-leader-term-floor.js';
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
  leaderClaimRaftTerm = null,
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
    ...(leaderClaimRaftTerm !== null ? {leader_claim_raft_term: leaderClaimRaftTerm} : {}),
  });
  for (const svc of services) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      service_id: svc.replicaId,
      replica_id: svc.replicaId,
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: PARTITION,
      node_id: svc.nodeId,
      address: svc.address,
      status: svc.status ?? SERVICE_STATUS.ACTIVE,
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

test('Option A adversarial hardening: exact replica-identity binding ignores ' +
  'obsolete/retired .db files and fails closed without authoritative local SERVICES row',
async (t) => {
  const selfReplicaId = `${PARTITION}-r1-active`;
  const retiredReplicaId = `${PARTITION}-r0-retired`;
  const unlistedReplicaId = `${PARTITION}-r99-orphan`;

  await t.test('obsolete/retired .db files with higher or lower terms are ignored',
    async (t) => {
      const dataDir = createTempDataDir(t, 'lagrange-opt-a-obsolete-');
      seedHardStateDb(dataDir, PARTITION, selfReplicaId, 5);
      seedHardStateDb(dataDir, PARTITION, retiredReplicaId, 99);
      seedHardStateDb(dataDir, PARTITION, unlistedReplicaId, 100);

      const services = [
        {
          nodeId: 'node-a',
          replicaId: retiredReplicaId,
          address: `node-a/partition/${PARTITION}`,
          status: 'removed',
        },
        {
          nodeId: 'node-a',
          replicaId: selfReplicaId,
          address: `node-a/partition/${PARTITION}`,
          status: SERVICE_STATUS.ACTIVE,
        },
        {nodeId: 'node-b', replicaId: `${PARTITION}-r2`, address: `node-b/partition/${PARTITION}`},
      ];

      // Successor at term 6 MUST succeed (>= active replica term 5), proving retired term 99
      // and orphan term 100 were completely ignored.
      const surface = createSyntheticReadSurface({
        nodeId: 'node-a',
        canonicalLeaderNodeId: 'node-a',
        leaderClaimRaftTerm: 5,
        services,
        dataDir,
        getLocalPartitionReplicas: () => [],
        async deliver(address, request) {
          if (address.startsWith('node-b/')) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: true,
              rows: [{operation_id: OPERATION, workflow_step: 'term-6-successor'}],
              rowSetComplete: true,
              readAuthorityWitness: leaderWitness({
                nodeId: 'node-b',
                replicaId: `${PARTITION}-r2`,
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
      t.equal(ownerFact.state, STATE.READY,
        'active replica term 5 permits term 6 successor despite retired/orphan term 99/100 files');
      t.equal(ownerFact.witness?.term, 6);
    });

  await t.test('missing authoritative non-removed SERVICES row fails closed even if .db files exist',
    async (t) => {
      const dataDir = createTempDataDir(t, 'lagrange-opt-a-no-service-');
      seedHardStateDb(dataDir, PARTITION, retiredReplicaId, 12);
      seedHardStateDb(dataDir, PARTITION, unlistedReplicaId, 15);

      const probed = [];
      const surface = createSyntheticReadSurface({
        nodeId: 'node-a',
        canonicalLeaderNodeId: 'node-a',
        services: [
          {
            nodeId: 'node-a',
            replicaId: retiredReplicaId,
            address: `node-a/partition/${PARTITION}`,
            status: 'removed',
          },
          {nodeId: 'node-b', replicaId: `${PARTITION}-r2`, address: `node-b/partition/${PARTITION}`},
        ],
        dataDir,
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
      t.equal(ownerFact.state, STATE.UNAVAILABLE);
      t.equal(ownerFact.reason, REASON.PUBLISHED_LEADER_UNUSABLE,
        'must fail closed when only removed/unlisted .db files exist');
      t.same(probed, [], 'must not probe peers when no authoritative local SERVICES row exists');
    });

  await t.test('localTerm < published leader_claim_raft_term fails closed to PUBLISHED_LEADER_UNUSABLE',
    async (t) => {
      const dataDir = createTempDataDir(t, 'lagrange-opt-a-claim-term-');
      seedHardStateDb(dataDir, PARTITION, selfReplicaId, 5);

      const probed = [];
      const surface = createSyntheticReadSurface({
        nodeId: 'node-a',
        canonicalLeaderNodeId: 'node-a',
        leaderClaimRaftTerm: 8,
        services: [
          {nodeId: 'node-a', replicaId: selfReplicaId, address: `node-a/partition/${PARTITION}`},
          {nodeId: 'node-b', replicaId: `${PARTITION}-r2`, address: `node-b/partition/${PARTITION}`},
        ],
        dataDir,
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
      t.equal(ownerFact.state, STATE.UNAVAILABLE);
      t.equal(ownerFact.reason, REASON.PUBLISHED_LEADER_UNUSABLE,
        'localTerm (5) < leader_claim_raft_term (8) must fail closed');
      t.same(
        probed.filter((addr) => !addr.startsWith('node-a/')),
        [],
        'must not probe peers when localTerm lags published leader_claim_raft_term',
      );
    });

  await t.test('lower-term peer leader is refused with BELOW_TERM_FLOOR when localTerm >= leader_claim_raft_term',
    async (t) => {
      const dataDir = createTempDataDir(t, 'lagrange-opt-a-lower-peer-');
      seedHardStateDb(dataDir, PARTITION, selfReplicaId, 8);

      const surface = createSyntheticReadSurface({
        nodeId: 'node-a',
        canonicalLeaderNodeId: 'node-a',
        leaderClaimRaftTerm: 7,
        services: [
          {nodeId: 'node-a', replicaId: selfReplicaId, address: `node-a/partition/${PARTITION}`},
          {nodeId: 'node-b', replicaId: `${PARTITION}-r2`, address: `node-b/partition/${PARTITION}`},
        ],
        dataDir,
        getLocalPartitionReplicas: () => [],
        async deliver(address, request) {
          if (address.startsWith('node-b/')) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: true,
              rows: [{operation_id: OPERATION, workflow_step: 'stale-term-7'}],
              rowSetComplete: true,
              readAuthorityWitness: leaderWitness({
                nodeId: 'node-b',
                replicaId: `${PARTITION}-r2`,
                term: 7,
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
      t.equal(ownerFact.reason, REASON.BELOW_TERM_FLOOR,
        'peer witness term 7 < localTerm 8 must be refused with BELOW_TERM_FLOOR');
    });
});

test('Option A adversarial hardening: 46-partition memoized disk term lookup avoids ' +
  'repeated SQLite opens and invalidates once live PartitionService exists', async (t) => {
  const dataDir = createTempDataDir(t, 'lagrange-opt-a-46p-perf-');
  const cache = new SystemTableCache();
  const partitions = [];
  for (let i = 1; i <= 46; i += 1) {
    const partitionId = `sys-part-${i}-p1`;
    const replicaId = `${partitionId}-r1`;
    seedHardStateDb(dataDir, partitionId, replicaId, i + 2);
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
      partition_id: partitionId,
      table_id: `sys_part_${i}`,
      leader_node_id: 'node-a',
      leader_claim_raft_term: i + 2,
    });
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      service_id: replicaId,
      replica_id: replicaId,
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: 'node-a',
      address: `node-a/partition/${partitionId}`,
      status: SERVICE_STATUS.ACTIVE,
    });
    partitions.push({partitionId, replicaId, expectedTerm: i + 2});
  }

  let liveReplicasByPartition = new Map();
  const executor = new QueryExecutor({
    nodeId: 'node-a',
    messageRouter: {nodeId: 'node-a', deliver: async () => null},
    systemCache: cache,
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    dataDir,
    getLocalPartitionReplicas: (partitionId) =>
      liveReplicasByPartition.get(partitionId) || [],
  });

  // Cold pass across all 46 partitions populates memoized disk terms.
  const snapshots = partitions.map(({partitionId}) =>
    executor.getPartitionRoutingSnapshot(partitionId, DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE));
  for (let i = 0; i < partitions.length; i += 1) {
    const floor = resolveSelfPublishedLeaderTermFloor(
      executor,
      partitions[i].partitionId,
      snapshots[i],
    );
    t.equal(floor.eligible, true);
    t.equal(floor.termFloor, partitions[i].expectedTerm);
  }

  // Capture memo entry references after the cold pass: with all 46 files intact
  // on disk, 460 subsequent warm lookups MUST validate the physical file-state
  // witness and reuse the exact cached memo entries with zero SQLite re-opens!
  const coldMemoEntries = partitions.map(({partitionId, replicaId}) =>
    executor.selfPublishedLeaderDiskTermMemo.get(partitionId)?.get(`${dataDir}\0${replicaId}`),
  );
  t.ok(coldMemoEntries.every(Boolean),
    'cold pass populated a witnessed disk-term memo entry for all 46 partitions');

  const warmStartMs = performance.now();
  const ROUNDS = 10;
  let mismatches = 0;
  for (let round = 0; round < ROUNDS; round += 1) {
    for (let i = 0; i < partitions.length; i += 1) {
      const floor = resolveSelfPublishedLeaderTermFloor(
        executor,
        partitions[i].partitionId,
        snapshots[i],
      );
      if (floor.eligible !== true || floor.termFloor !== partitions[i].expectedTerm) {
        mismatches += 1;
      }
    }
  }
  const warmElapsedMs = performance.now() - warmStartMs;
  const reopenedCount = partitions.filter(({partitionId, replicaId}, i) =>
    executor.selfPublishedLeaderDiskTermMemo.get(partitionId)?.get(`${dataDir}\0${replicaId}`) !==
      coldMemoEntries[i],
  ).length;
  t.equal(mismatches, 0,
    'all 460 memoized 46-partition lookups must return eligible with exact cached term');
  t.equal(reopenedCount, 0,
    'all 460 warm lookups must reuse exact memo entries with zero SQLite re-opens');
  t.ok(
    warmElapsedMs < 100,
    `460 memoized 46-partition lookups must complete well under 100ms (observed ${warmElapsedMs.toFixed(2)}ms)`,
  );

  // Removing a cached partition DB file on disk MUST invalidate its physical
  // witness and fail closed rather than serving the deleted file's old term.
  const removedPartition = partitions[1];
  fs.rmSync(
    getPartitionDbPath(dataDir, removedPartition.partitionId, removedPartition.replicaId),
    {force: true},
  );
  const removedFloor = resolveSelfPublishedLeaderTermFloor(
    executor,
    removedPartition.partitionId,
    snapshots[1],
  );
  t.equal(removedFloor.eligible, false,
    'deleting a cached partition DB file on disk must invalidate memo and fail closed');

  // Once a live PartitionService opens for partition 0, the memoized disk term is
  // invalidated and the live Raft core authority governs instead.
  const first = partitions[0];
  fs.rmSync(getPartitionDbPath(dataDir, first.partitionId, first.replicaId), {force: true});
  liveReplicasByPartition.set(first.partitionId, [{
    partitionId: first.partitionId,
    replicaId: first.replicaId,
    raft: {
      observeCurrentAuthority: () => ({
        outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        groupId: first.partitionId,
        replicaIdentity: first.replicaId,
        role: RAFT_ROLE.FOLLOWER,
        term: first.expectedTerm + 10,
      }),
    },
  }]);
  const liveFloor = resolveSelfPublishedLeaderTermFloor(
    executor,
    first.partitionId,
    snapshots[0],
  );
  t.equal(liveFloor.eligible, true);
  t.equal(liveFloor.hasLocalReplica, true);
  t.equal(liveFloor.termFloor, first.expectedTerm + 10,
    'live PartitionService supersedes and invalidates cached disk term');

  // If the live replica later closes without a DB on disk, the invalidated disk
  // cache must NOT serve the old pre-open term.
  liveReplicasByPartition = new Map();
  const afterCloseFloor = resolveSelfPublishedLeaderTermFloor(
    executor,
    first.partitionId,
    snapshots[0],
  );
  t.equal(afterCloseFloor.eligible, false,
    'invalidated disk cache must not serve stale term after live replica closes and file is absent');
});

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function seedWalHardStateDb(dataDir, partitionId, replicaId, term) {
  const dbPath = getPartitionDbPath(dataDir, partitionId, replicaId);
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
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

test('Option A (Finding 2): redirected reads enforce a newly raised in-flight ' +
  'local term floor across both readDelivery and direct-deliver paths', async (t) => {
  const selfReplicaId = `${PARTITION}-r1`;
  const services = [
    {nodeId: 'node-a', replicaId: selfReplicaId, address: `node-a/partition/${PARTITION}`},
    {nodeId: 'node-b', replicaId: `${PARTITION}-r2`, address: `node-b/partition/${PARTITION}`},
    {nodeId: 'node-c', replicaId: `${PARTITION}-r3`, address: `node-c/partition/${PARTITION}`},
  ];

  async function runInFlightRedirectFloorRiseCase(t, {useRecoveryReadDelivery}) {
    let localTerm = 5;
    let nodeCDeliveries = 0;
    const redirectEntered = createDeferred();
    const releaseStaleRedirect = createDeferred();
    const localFollower = {
      partitionId: PARTITION,
      replicaId: selfReplicaId,
      raft: {
        observeCurrentAuthority: () => ({
          outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
          groupId: PARTITION,
          replicaIdentity: selfReplicaId,
          role: RAFT_ROLE.FOLLOWER,
          term: localTerm,
        }),
      },
    };
    const stablePeerIdentities = new Map([
      ['node-a', Object.freeze({nodeId: 'node-a', bootIncarnation: 'boot-a-1', connectionId: 'local'})],
      ['node-b', Object.freeze({nodeId: 'node-b', bootIncarnation: 'boot-b-1', connectionId: 'conn-b-1'})],
      ['node-c', Object.freeze({nodeId: 'node-c', bootIncarnation: 'boot-c-1', connectionId: 'conn-c-1'})],
    ]);
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
      partition_id: PARTITION,
      table_id: TABLE,
      leader_node_id: 'node-a',
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
      nodeId: 'node-a',
      getConnectionState: () => 'connected',
      getConnectedNodes: () => ['node-b', 'node-c'],
      getLocalBootIncarnationIdentity: () => stablePeerIdentities.get('node-a'),
      getCurrentPrimaryConnectionBootIncarnation: (peerId) =>
        stablePeerIdentities.get(peerId) || null,
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
          nodeCDeliveries += 1;
          if (nodeCDeliveries === 1) {
            redirectEntered.resolve();
            await releaseStaleRedirect.promise;
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: true,
              rows: [{operation_id: OPERATION, workflow_step: 'stale-redirect-term-6'}],
              rowSetComplete: true,
              readAuthorityWitness: leaderWitness({
                nodeId: 'node-c',
                replicaId: `${PARTITION}-r3`,
                term: 6,
                leaderRead: request.leaderRead,
              }),
            });
          }
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: true,
            rows: [{operation_id: OPERATION, workflow_step: 'fresh-successor-term-8'}],
            rowSetComplete: true,
            readAuthorityWitness: leaderWitness({
              nodeId: 'node-c',
              replicaId: `${PARTITION}-r3`,
              term: 8,
              leaderRead: request.leaderRead,
            }),
          });
        }
        return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
      },
    };
    const executor = new QueryExecutor({
      nodeId: 'node-a',
      messageRouter,
      systemCache: cache,
      controlPlaneReadinessService: createCommittedServeEligibilityOwner({
        projectedDimensions: {controlPlaneRecoveryEligible: true},
      }),
      getLocalPartitionReplicas: () => [localFollower],
    });
    const executionOptions = useRecoveryReadDelivery ? {
      timeoutMs: READ_TIMEOUT_MS,
      routingReadinessDimension: DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      readAuthority: {
        authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: LEADER_MODE.REQUIRED,
      },
    } : {
      routingReadinessDimension: DIMENSION.SERVE_ELIGIBLE,
      requireLeader: true,
      readAuthority: {
        authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: LEADER_MODE.REQUIRED,
      },
    };
    const readPromise = executor.executeOnPartition(
      PARTITION,
      READ_SQL,
      [OPERATION],
      true,
      true,
      false,
      executionOptions,
    );
    await redirectEntered.promise;
    // Raise local term floor 5 -> 8 while redirected response is in flight,
    // leaving all peer identities (address, replicaId, bootIncarnation, connectionId) unchanged.
    localTerm = 8;
    releaseStaleRedirect.resolve();

    const result = await readPromise;
    t.equal(result.success, true, 'subsequent term-8 delivery succeeds after term-6 redirect rejected');
    t.equal(result.readAuthorityWitness?.term, 8,
      'must reject stale term-6 redirect once floor rose to 8 and accept term-8 successor');
    t.same(result.rows, [{operation_id: OPERATION, workflow_step: 'fresh-successor-term-8'}]);
    t.equal(nodeCDeliveries, 2, 'node-c served stale term-6 first (rejected), then fresh term-8');
  }

  await t.test('readDelivery recovery-read redirect rejects stale term 6 after floor rises 5 -> 8',
    async (t) => {
      await runInFlightRedirectFloorRiseCase(t, {useRecoveryReadDelivery: true});
    });

  await t.test('non-readDelivery direct-deliver redirect rejects stale term 6 after floor rises 5 -> 8',
    async (t) => {
      await runInFlightRedirectFloorRiseCase(t, {useRecoveryReadDelivery: false});
    });

  await t.test('redirected stale term 6 alone fails with BELOW_TERM_FLOOR after floor rises 5 -> 8',
    async (t) => {
      for (const useRecoveryReadDelivery of [true, false]) {
        let localTerm = 5;
        const redirectEntered = createDeferred();
        const releaseStaleRedirect = createDeferred();
        const localFollower = {
          partitionId: PARTITION,
          replicaId: selfReplicaId,
          raft: {
            observeCurrentAuthority: () => ({
              outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
              groupId: PARTITION,
              replicaIdentity: selfReplicaId,
              role: RAFT_ROLE.FOLLOWER,
              term: localTerm,
            }),
          },
        };
        const surface = createSyntheticReadSurface({
          nodeId: 'node-a',
          canonicalLeaderNodeId: 'node-a',
          services,
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
              if (localTerm === 5) {
                redirectEntered.resolve();
                await releaseStaleRedirect.promise;
              }
              return buildDeliveryEnvelope({acknowledged: true}, {
                success: true,
                rows: [{operation_id: OPERATION, workflow_step: 'stale-term-6-only'}],
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
        surface.queryExecutor.readRetryAttempts = 1;
        const execOpts = useRecoveryReadDelivery ? {
          timeoutMs: READ_TIMEOUT_MS,
          routingReadinessDimension: DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
          readAuthority: {
            authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
            leaderMode: LEADER_MODE.REQUIRED,
          },
        } : {
          routingReadinessDimension: DIMENSION.SERVE_ELIGIBLE,
          requireLeader: true,
          readAuthority: {
            authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
            leaderMode: LEADER_MODE.REQUIRED,
          },
        };
        const pending = surface.queryExecutor.executeOnPartition(
          PARTITION, READ_SQL, [OPERATION], true, true, false, execOpts,
        );
        await redirectEntered.promise;
        localTerm = 8;
        releaseStaleRedirect.resolve();
        const result = await pending;
        t.equal(result.success, false,
          `stale term-6 redirect rejected (readDelivery=${useRecoveryReadDelivery})`);
        t.equal(result.failureCode, REASON.BELOW_TERM_FLOOR);
        t.same(result.rows, [], 'ships no stale rows');
      }
    });

  await t.test('redirect from local follower rejects stale term 6 if local replica ' +
    'becomes LEADER at term 8 while redirect is in flight', async (t) => {
    let localRole = RAFT_ROLE.FOLLOWER;
    let localTerm = 5;
    const redirectEntered = createDeferred();
    const releaseStaleRedirect = createDeferred();
    const localReplica = {
      partitionId: PARTITION,
      replicaId: selfReplicaId,
      raft: {
        observeCurrentAuthority: () => ({
          outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
          groupId: PARTITION,
          replicaIdentity: selfReplicaId,
          role: localRole,
          term: localTerm,
        }),
      },
    };
    const surface = createSyntheticReadSurface({
      nodeId: 'node-a',
      canonicalLeaderNodeId: 'node-a',
      services,
      getLocalPartitionReplicas: () => [localReplica],
      async deliver(address, request) {
        if (address.startsWith('node-a/')) {
          if (localRole === RAFT_ROLE.LEADER) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: true,
              rows: [{operation_id: OPERATION, workflow_step: 'local-leader-term-8'}],
              rowSetComplete: true,
              readAuthorityWitness: leaderWitness({
                nodeId: 'node-a',
                replicaId: selfReplicaId,
                term: 8,
                leaderRead: request.leaderRead,
              }),
            });
          }
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
          redirectEntered.resolve();
          await releaseStaleRedirect.promise;
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: true,
            rows: [{operation_id: OPERATION, workflow_step: 'stale-redirect-term-6'}],
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
    const pending = surface.queryExecutor.executeOnPartition(
      PARTITION,
      READ_SQL,
      [OPERATION],
      true,
      true,
      false,
      {
        timeoutMs: READ_TIMEOUT_MS,
        routingReadinessDimension: DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        readAuthority: {
          authoritativeReadMode: READ_MODE.OWNER_RPC_REQUIRED,
          leaderMode: LEADER_MODE.REQUIRED,
        },
      },
    );
    await redirectEntered.promise;
    localRole = RAFT_ROLE.LEADER;
    localTerm = 8;
    releaseStaleRedirect.resolve();
    const result = await pending;
    t.equal(result.success, true, 'succeeds via new local term-8 leader after rejecting term 6');
    t.equal(result.readAuthorityWitness?.term, 8);
    t.same(result.rows, [{operation_id: OPERATION, workflow_step: 'local-leader-term-8'}]);
  });
});

test('Option A (Finding 4): disk-term memo invalidates when replica opens, advances ' +
  'hard-state term on disk, and closes with zero intermediate lookups', async (t) => {
  const selfReplicaId = `${PARTITION}-r1`;

  function buildExecutorForDiskLookup(dataDir) {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
      partition_id: PARTITION,
      table_id: TABLE,
      leader_node_id: 'node-a',
    });
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      service_id: selfReplicaId,
      replica_id: selfReplicaId,
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: PARTITION,
      node_id: 'node-a',
      address: `node-a/partition/${PARTITION}`,
      status: SERVICE_STATUS.ACTIVE,
    });
    const executor = new QueryExecutor({
      nodeId: 'node-a',
      messageRouter: {nodeId: 'node-a', deliver: async () => null},
      systemCache: cache,
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      dataDir,
      getLocalPartitionReplicas: () => [],
    });
    const snapshot = executor.getPartitionRoutingSnapshot(
      PARTITION,
      DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    );
    return {executor, snapshot};
  }

  await t.test('WAL-mode checkpointed open -> advance 5 -> 8 -> close within same ms invalidates memo',
    async (t) => {
      const dataDir = createTempDataDir(t, 'lagrange-opt-a-f4-wal-close-');
      const dbPath = seedWalHardStateDb(dataDir, PARTITION, selfReplicaId, 5);
      const {executor, snapshot} = buildExecutorForDiskLookup(dataDir);

      const initial = resolveSelfPublishedLeaderTermFloor(executor, PARTITION, snapshot);
      t.equal(initial.eligible, true);
      t.equal(initial.termFloor, 5, 'initial lookup caches disk term 5');

      // Replica opens, advances term 5 -> 8 in WAL mode, and closes cleanly with zero lookups while open.
      const db = new Database(dbPath);
      try {
        db.pragma('journal_mode = WAL');
        db.prepare(
          'INSERT OR REPLACE INTO _raft_rs_hard_state ' +
          '(group_id, term, vote, commit_index) VALUES (?, ?, 0, 0)',
        ).run(PARTITION, 8);
      } finally {
        db.close();
      }

      const afterClose = resolveSelfPublishedLeaderTermFloor(executor, PARTITION, snapshot);
      t.equal(afterClose.eligible, true);
      t.equal(afterClose.termFloor, 8,
        'next lookup must observe advanced on-disk term 8, never stale cached term 5');
    });

  await t.test('WAL-mode pre-allocated in-WAL advance 5 -> 8 within same ms invalidates memo',
    async (t) => {
      const dataDir = createTempDataDir(t, 'lagrange-opt-a-f4-wal-live-');
      const dbPath = seedWalHardStateDb(dataDir, PARTITION, selfReplicaId, 1);
      const {executor, snapshot} = buildExecutorForDiskLookup(dataDir);

      const writer = new Database(dbPath);
      t.teardown(() => {
        if (writer.open) writer.close();
      });
      writer.pragma('journal_mode = WAL');
      const upsert = writer.prepare(
        'INSERT OR REPLACE INTO _raft_rs_hard_state ' +
        '(group_id, term, vote, commit_index) VALUES (?, ?, 0, 0)',
      );
      // Pre-allocate WAL file frames, restart at frame 0, then write term 5.
      for (let i = 1; i <= 10; i += 1) upsert.run(PARTITION, i);
      writer.pragma('wal_checkpoint(RESTART)');
      upsert.run(PARTITION, 5);

      const initial = resolveSelfPublishedLeaderTermFloor(executor, PARTITION, snapshot);
      t.equal(initial.eligible, true);
      t.equal(initial.termFloor, 5, 'initial lookup caches in-WAL term 5');

      // Advance to term 8 inside the already pre-allocated WAL without changing WAL size or header.
      upsert.run(PARTITION, 8);

      const afterWalWrite = resolveSelfPublishedLeaderTermFloor(executor, PARTITION, snapshot);
      t.equal(afterWalWrite.eligible, true);
      t.equal(afterWalWrite.termFloor, 8,
        'next lookup must detect pre-allocated WAL advance to term 8');
    });

  await t.test('rollback-journal reopen -> advance 5 -> 8 -> close within same ms invalidates memo',
    async (t) => {
      const dataDir = createTempDataDir(t, 'lagrange-opt-a-f4-journal-');
      seedHardStateDb(dataDir, PARTITION, selfReplicaId, 5);
      const {executor, snapshot} = buildExecutorForDiskLookup(dataDir);

      const initial = resolveSelfPublishedLeaderTermFloor(executor, PARTITION, snapshot);
      t.equal(initial.eligible, true);
      t.equal(initial.termFloor, 5);

      seedHardStateDb(dataDir, PARTITION, selfReplicaId, 8);

      const afterReopen = resolveSelfPublishedLeaderTermFloor(executor, PARTITION, snapshot);
      t.equal(afterReopen.eligible, true);
      t.equal(afterReopen.termFloor, 8,
        'rollback-journal advance to term 8 must invalidate disk-term memo');
    });
});
