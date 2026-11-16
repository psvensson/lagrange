/**
 * Seed-restart recovery gate (seed-restart-recovery-mode-v2): a durable seed
 * can no longer serve bootstrap purely on a persisted seed role. Before
 * serving it must confirm a cluster-id match plus EITHER live peer contact
 * (a probed-reachable current member) OR durable quorum evidence. An isolated
 * stale seed without that proof fails closed (SEED_RECOVERY_PROOF_MISSING)
 * instead of resurrecting a divergent cluster.
 *
 * These tests are red-on-revert: each asserts the typed gate outcome and
 * fails if the seed branch of resolveAutoRejoinDecisionState is reverted to
 * unconditional DURABLE_SEED while the rest of the change remains.
 */

import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import Database from 'better-sqlite3';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {
  RejoinHintsPersistenceService,
  resolveAutoRejoinStartupDecision,
} from '../../src/bootstrap/rejoin-hints.js';
import {
  AUTO_REJOIN_DECISION_STATE,
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  ORIGINAL_SEED_ALLOCATION_STATE,
  STARTUP_JOIN_MODE,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  readOriginalSeedAllocationOutcome,
} from '../../src/bootstrap/rejoin-hints-durable-evidence.js';
import {
  originalSeedAnchor,
} from '../../src/bootstrap/seed-original-allocation-declaration.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CLUSTER_ID_CONFIG_KEY,
} from '../../src/bootstrap/cluster-identity-constants.js';
import {
  ORIGINAL_ALLOCATION,
  ORIGINAL_ALLOCATION_COLUMN,
} from '../../src/raft/raft-rs-original-allocation-constants.js';
import {
  REPLICA_LIFECYCLE_TABLE,
} from '../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {
  getMessageGroupDbPath,
  getPartitionDbPath,
} from '../../src/storage/data-directory-manager.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const LOCAL_NODE_ID = 'node-local';
const LOCAL_NODE_ADDRESS = 'seed-node:8080';
const PEER_NODE_ADDRESS_A = 'peer-a:8080';
const PEER_NODE_ADDRESS_B = 'peer-b:8080';
const CLUSTER_ID_A = '11111111-1111-4111-8111-111111111111';
const CLUSTER_ID_B = '22222222-2222-4222-8222-222222222222';

function createSystemTableCache(nodeRows = [], clusterId = null) {
  return {
    getAll(tableName) {
      return tableName === TABLES.NODES ? nodeRows : [];
    },
    get(tableName, key) {
      if (tableName !== TABLES.CONFIG || key !== CLUSTER_ID_CONFIG_KEY) {
        return undefined;
      }
      return clusterId === null ?
        undefined :
        {[COLUMN.CONFIG_VALUE]: clusterId};
    },
  };
}

async function persistSeedHints(dataDir, {nodeRows, clusterId}) {
  const persistence = new RejoinHintsPersistenceService({
    bootIncarnation: TEST_BOOT_INCARNATION,
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    nodeRole: 'seed',
    getSystemTableCache: () => createSystemTableCache(nodeRows, clusterId),
    logger: {warn() {}, debug() {}},
  });
  await persistence.persistNow();
}

test('an isolated stale seed with no quorum evidence and no reachable peer ' +
  'refuses to serve', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-recovery-gate-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  // A single-node durable record: no peer rows, no reachable peer — the
  // only "proof" is the persisted seed role itself, which is insufficient.
  await persistSeedHints(dataDir, {
    nodeRows: [
      {
        [COLUMN.NODE_ID]: LOCAL_NODE_ID,
        [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
      },
    ],
    clusterId: CLUSTER_ID_A,
  });

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async () => false,
  });

  t.equal(
    decision.state,
    'seed_recovery_proof_missing',
    'a persisted seed role alone is not proof of cluster membership',
  );
  t.equal(decision.mode, 'fail', 'the decision is terminal (fail closed)');
  t.equal(
    decision.membershipOwnerOutcome.outcomeType,
    MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
    'the membership owner records a blocked startup',
  );
  t.equal(
    decision.membershipOwnerOutcome.reasonCode,
    'seed_recovery_proof_missing',
    'the refusal carries the typed seed-recovery-proof reason',
  );
  t.ok(
    typeof decision.error === 'string' && decision.error.length > 0,
    'the refusal surfaces an operator-facing message',
  );
});

test('a durable seed serves when cluster-id matches AND a current member ' +
  'is reachable', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-recovery-gate-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  // Single-node durable record (no durable quorum evidence) BUT a peer is
  // reachable — live peer contact satisfies the recovery proof.
  await persistSeedHints(dataDir, {
    nodeRows: [
      {
        [COLUMN.NODE_ID]: LOCAL_NODE_ID,
        [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
      },
      {
        [COLUMN.NODE_ID]: 'node-peer-a',
        [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
      },
    ],
    clusterId: CLUSTER_ID_A,
  });

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async () => true,
  });

  t.equal(
    decision.state,
    'durable_seed',
    'cluster-id match plus live peer contact lets the seed serve',
  );
  t.equal(decision.mode, 'seed');
  t.equal(decision.startupMode, STARTUP_JOIN_MODE.SEED);
});

test('a durable seed serves when cluster-id matches AND durable quorum ' +
  'evidence exists (even with no reachable peer)', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-recovery-gate-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  // Multi-node durable record (quorum evidence) but no reachable peer.
  await persistSeedHints(dataDir, {
    nodeRows: [
      {
        [COLUMN.NODE_ID]: LOCAL_NODE_ID,
        [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
      },
      {
        [COLUMN.NODE_ID]: 'node-peer-a',
        [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
      },
    ],
    clusterId: CLUSTER_ID_A,
  });

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async () => false,
  });

  t.equal(
    decision.state,
    'durable_seed',
    'cluster-id match plus durable quorum evidence lets the seed serve ' +
        'even without live peer contact',
  );
  t.equal(decision.mode, 'seed');
});

test('a durable seed without a confirmed cluster-id match refuses even ' +
  'with quorum evidence and a reachable peer', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-recovery-gate-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  await persistSeedHints(dataDir, {
    nodeRows: [
      {
        [COLUMN.NODE_ID]: LOCAL_NODE_ID,
        [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
      },
      {
        [COLUMN.NODE_ID]: 'node-peer-a',
        [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
      },
    ],
    clusterId: CLUSTER_ID_A,
  });

  // The node expects a DIFFERENT cluster identity than its hints carry:
  // cluster-id match is not confirmed, so the recovery gate must not let
  // it serve (this also trips the dedicated CLUSTER_ID_MISMATCH fence).
  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_B,
    probePeerAddress: async () => true,
  });

  t.equal(
    decision.mode,
    'fail',
    'an unconfirmed cluster-id never lets a seed serve',
  );
  t.not(
    decision.state,
    'durable_seed',
    'no cluster-id match means no durable_seed serve',
  );
});

test('a pre-identity persisted seed role (no cluster-id) refuses to serve ' +
  'purely on that role', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-recovery-gate-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  // A hints file with NO clusterId (pre-identity era): the cluster-id
  // match reads UNKNOWN, not MATCH, so the recovery gate refuses even
  // though a peer is reachable. This is the persisted-role-not-proof
  // behavior change the constraint pins.
  await persistSeedHints(dataDir, {
    nodeRows: [
      {
        [COLUMN.NODE_ID]: LOCAL_NODE_ID,
        [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
      },
      {
        [COLUMN.NODE_ID]: 'node-peer-a',
        [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
      },
    ],
    clusterId: null,
  });

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    probePeerAddress: async () => true,
  });

  t.equal(
    decision.state,
    'seed_recovery_proof_missing',
    'a pre-identity persisted seed role is not proof (cluster-id UNKNOWN)',
  );
  t.equal(decision.mode, 'fail');
});


test('durable nodes rows without seed-role hints cannot rebootstrap fresh ' +
  'after a process loss', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-no-hints-recovery-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));
  const nodesDir = join(dataDir, 'partitions', 'nodes-p1');
  await mkdir(nodesDir, {recursive: true});
  // Same physical path and table read by the production durable-nodes owner.
  const db = new Database(join(nodesDir, 'nodes-p1-r1.db'));
  try {
    db.exec('CREATE TABLE nodes (node_id TEXT PRIMARY KEY, ' +
      'node_address TEXT NOT NULL)');
    db.prepare('INSERT INTO nodes (node_id, node_address) VALUES (?, ?)')
      .run(LOCAL_NODE_ID, LOCAL_NODE_ADDRESS);
  } finally {
    db.close();
  }

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    probePeerAddress: async () => false,
  });
  t.equal(decision.state, 'seed_recovery_proof_missing',
    'a readable nodes Raft replica with no hints cannot authorize genesis');
  t.equal(decision.mode, 'fail', 'no seed serving without recovery proof');
  t.equal(decision.durableStateDetected, true,
    'a durable nodes-table record is still present after process loss');
  t.equal(decision.source, 'durable_nodes_table',
    'the startup decision names the actual surviving source');
  t.equal(decision.membershipOwnerOutcome.outcomeType,
    MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
    'the existing membership owner rejects unproved startup');

  const explicit = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    probePeerAddress: async () => false,
    forceNewCluster: true,
  });
  t.equal(explicit.state, 'fresh_seed',
    'only explicit operator authorization may reset a no-hints directory');
  t.equal(explicit.mode, 'seed');
});

test('a genuinely empty directory remains eligible for fresh bootstrap',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'seed-recovery-virgin-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));
    const decision = await resolveAutoRejoinStartupDecision({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      probePeerAddress: async () => false,
    });
    t.equal(decision.state, 'fresh_seed');
    t.equal(decision.mode, 'seed');
    t.equal(decision.durableStateDetected, false);
  });

async function writeOriginalLifecycleDb({
  dbPath,
  groupId,
  replicaId,
  serviceRight,
  identityRight = null,
}) {
  await mkdir(dirname(dbPath), {recursive: true});
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${REPLICA_LIFECYCLE_TABLE} (
        group_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        replica_identity TEXT NOT NULL,
        state TEXT NOT NULL,
        reason TEXT,
        changed_at TEXT NOT NULL,
        ${ORIGINAL_ALLOCATION_COLUMN.DECLARATION} TEXT,
        ${ORIGINAL_ALLOCATION_COLUMN.MEMBER} TEXT,
        ${ORIGINAL_ALLOCATION_COLUMN.ISSUE} TEXT,
        ${ORIGINAL_ALLOCATION_COLUMN.SERVICE_RIGHT} TEXT,
        ${ORIGINAL_ALLOCATION_COLUMN.IDENTITY_RIGHT} TEXT,
        PRIMARY KEY (group_id, peer_id)
      )
    `);
    db.prepare(`
      INSERT INTO ${REPLICA_LIFECYCLE_TABLE} (
        group_id, peer_id, replica_identity, state, changed_at,
        ${ORIGINAL_ALLOCATION_COLUMN.DECLARATION},
        ${ORIGINAL_ALLOCATION_COLUMN.MEMBER},
        ${ORIGINAL_ALLOCATION_COLUMN.ISSUE},
        ${ORIGINAL_ALLOCATION_COLUMN.SERVICE_RIGHT},
        ${ORIGINAL_ALLOCATION_COLUMN.IDENTITY_RIGHT}
      ) VALUES (?, ?, ?, 'active', '2026-11-16T00:00:00Z', '{}', '{}', ?, ?, ?)
    `).run(
      groupId,
      `peer-${replicaId}`,
      replicaId,
      identityRight === null ? ORIGINAL_ALLOCATION.PREPARING : ORIGINAL_ALLOCATION.ISSUED,
      serviceRight,
      identityRight,
    );
  } finally {
    db.close();
  }
}

async function writeDurableNodesReplicaDb(dataDir, nodeRows) {
  const nodesDir = join(dataDir, 'partitions', 'nodes-p1');
  await mkdir(nodesDir, {recursive: true});
  const db = new Database(join(nodesDir, 'nodes-p1-r1.db'));
  try {
    db.exec('CREATE TABLE IF NOT EXISTS nodes (node_id TEXT PRIMARY KEY, node_address TEXT NOT NULL)');
    db.exec('DELETE FROM nodes');
    const insert = db.prepare('INSERT INTO nodes (node_id, node_address) VALUES (?, ?)');
    for (const row of nodeRows) {
      insert.run(row[COLUMN.NODE_ID], row[COLUMN.NODE_ADDRESS]);
    }
  } finally {
    db.close();
  }
}

async function seedCompletedOriginalFounderDbs(
  dataDir,
  {includeAnchor = true, includeMg = true} = {},
) {
  if (includeAnchor) {
    const anchor = originalSeedAnchor(dataDir);
    await writeOriginalLifecycleDb({
      dbPath: anchor.dbPath,
      groupId: anchor.groupId,
      replicaId: anchor.replicaId,
      serviceRight: ORIGINAL_ALLOCATION.TRANSFERRED,
      identityRight: ORIGINAL_ALLOCATION.TRANSFERRED,
    });
  }
  if (includeMg) {
    for (const replicaId of INITIAL_MESSAGE_GROUP_REPLICA_IDS) {
      await writeOriginalLifecycleDb({
        dbPath: getMessageGroupDbPath(dataDir, INITIAL_MESSAGE_GROUP_ID, replicaId),
        groupId: INITIAL_MESSAGE_GROUP_ID,
        replicaId,
        serviceRight: ORIGINAL_ALLOCATION.TRANSFERRED,
      });
    }
  }
}

const THREE_NODE_ROWS = [
  {[COLUMN.NODE_ID]: LOCAL_NODE_ID, [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS},
  {[COLUMN.NODE_ID]: 'node-peer-a', [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A},
  {[COLUMN.NODE_ID]: 'node-peer-b', [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_B},
];

test('a completed multi-node founder with transferred original rights routes to ' +
  'durable_rejoin instead of re-entering seed preparation', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-completed-rejoin-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  await seedCompletedOriginalFounderDbs(dataDir);
  await writeDurableNodesReplicaDb(dataDir, THREE_NODE_ROWS);
  await persistSeedHints(dataDir, {nodeRows: THREE_NODE_ROWS, clusterId: CLUSTER_ID_A});

  const allocation = await readOriginalSeedAllocationOutcome(dataDir);
  t.equal(allocation.state, ORIGINAL_SEED_ALLOCATION_STATE.TRANSFERRED);

  const probed = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async (address) => address === PEER_NODE_ADDRESS_B,
  });
  t.equal(probed.state, AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER);
  t.equal(probed.mode, 'join');
  t.equal(probed.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN);
  t.equal(probed.peerAddress, PEER_NODE_ADDRESS_B);
  t.equal(
    probed.membershipOwnerOutcome.outcomeType,
    MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
  );

  const recovered = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async () => false,
  });
  t.equal(recovered.state, AUTO_REJOIN_DECISION_STATE.JOIN_RECOVERED_PEER);
  t.equal(recovered.mode, 'join');
  t.equal(recovered.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN);
  t.equal(recovered.peerAddress, PEER_NODE_ADDRESS_A);
});

test('a completed multi-node founder whose drained services-p1-r1 anchor was unlinked ' +
  'still detects TRANSFERRED rights via mg-1-r1..3 and routes to durable_rejoin', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-unlinked-anchor-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  await seedCompletedOriginalFounderDbs(dataDir, {includeAnchor: false, includeMg: true});
  await persistSeedHints(dataDir, {nodeRows: THREE_NODE_ROWS, clusterId: CLUSTER_ID_A});

  const allocation = await readOriginalSeedAllocationOutcome(dataDir);
  t.equal(allocation.state, ORIGINAL_SEED_ALLOCATION_STATE.TRANSFERRED);

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async (address) => address === PEER_NODE_ADDRESS_A,
  });
  t.equal(decision.state, AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER);
  t.equal(decision.mode, 'join');
  t.equal(decision.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN);
});

test('a completed multi-node founder whose drained services-p1-r1 anchor and mg-1-r1..3 ' +
  'were unlinked still detects TRANSFERRED rights via surviving system-table founders', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-unlinked-anchor-and-mg-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  const tablesGroupId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.TABLES];
  const tablesReplicaId = getInitialReplicaIds(SYSTEM_TABLE_NAME.TABLES)[1];
  await writeOriginalLifecycleDb({
    dbPath: getPartitionDbPath(dataDir, tablesGroupId, tablesReplicaId),
    groupId: tablesGroupId,
    replicaId: tablesReplicaId,
    serviceRight: ORIGINAL_ALLOCATION.TRANSFERRED,
  });
  await persistSeedHints(dataDir, {nodeRows: THREE_NODE_ROWS, clusterId: CLUSTER_ID_A});

  const allocation = await readOriginalSeedAllocationOutcome(dataDir);
  t.equal(allocation.state, ORIGINAL_SEED_ALLOCATION_STATE.TRANSFERRED);

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async (address) => address === PEER_NODE_ADDRESS_A,
  });
  t.equal(decision.state, AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER);
  t.equal(decision.mode, 'join');
  t.equal(decision.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN);
});

test('a completed multi-node founder with drained original founder DBs still routes ' +
  'to durable_rejoin via durableSnapshot.hasDurableNodesTable', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-nodes-table-rejoin-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  await writeDurableNodesReplicaDb(dataDir, THREE_NODE_ROWS);
  await persistSeedHints(dataDir, {nodeRows: THREE_NODE_ROWS, clusterId: CLUSTER_ID_A});

  const allocation = await readOriginalSeedAllocationOutcome(dataDir);
  t.equal(allocation.state, ORIGINAL_SEED_ALLOCATION_STATE.MISSING);

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async () => true,
  });
  t.equal(decision.state, AUTO_REJOIN_DECISION_STATE.JOIN_PROBED_PEER);
  t.equal(decision.mode, 'join');
  t.equal(decision.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN);
});

test('a completed single-node isolated founder without quorum or live peer still ' +
  'refuses with seed_recovery_proof_missing', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-isolated-completed-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  const singleRow = [
    {[COLUMN.NODE_ID]: LOCAL_NODE_ID, [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS},
  ];
  await seedCompletedOriginalFounderDbs(dataDir);
  await writeDurableNodesReplicaDb(dataDir, singleRow);
  await persistSeedHints(dataDir, {nodeRows: singleRow, clusterId: CLUSTER_ID_A});

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async () => false,
  });
  t.equal(decision.state, AUTO_REJOIN_DECISION_STATE.SEED_RECOVERY_PROOF_MISSING);
  t.equal(decision.mode, 'fail');
  t.equal(
    decision.membershipOwnerOutcome.outcomeType,
    MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
  );
});

test('an untransferred retained seed allocation keeps fresh_seed/durable_seed behavior ' +
  'without prematurely routing to durable_rejoin', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-untransferred-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  const anchor = originalSeedAnchor(dataDir);
  await writeOriginalLifecycleDb({
    dbPath: anchor.dbPath,
    groupId: anchor.groupId,
    replicaId: anchor.replicaId,
    serviceRight: ORIGINAL_ALLOCATION.UNUSED,
    identityRight: ORIGINAL_ALLOCATION.UNUSED,
  });
  await writeOriginalLifecycleDb({
    dbPath: getMessageGroupDbPath(
      dataDir,
      INITIAL_MESSAGE_GROUP_ID,
      INITIAL_MESSAGE_GROUP_REPLICA_IDS[0],
    ),
    groupId: INITIAL_MESSAGE_GROUP_ID,
    replicaId: INITIAL_MESSAGE_GROUP_REPLICA_IDS[0],
    serviceRight: ORIGINAL_ALLOCATION.UNUSED,
  });
  await writeDurableNodesReplicaDb(dataDir, []);

  const allocation = await readOriginalSeedAllocationOutcome(dataDir);
  t.equal(allocation.state, ORIGINAL_SEED_ALLOCATION_STATE.UNTRANSFERRED);

  const retainedNoHints = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    probePeerAddress: async () => false,
  });
  t.equal(retainedNoHints.state, AUTO_REJOIN_DECISION_STATE.FRESH_SEED);
  t.equal(retainedNoHints.mode, 'seed');

  await persistSeedHints(dataDir, {nodeRows: THREE_NODE_ROWS, clusterId: CLUSTER_ID_A});
  await writeDurableNodesReplicaDb(dataDir, THREE_NODE_ROWS);
  const retainedWithHints = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async () => true,
  });
  t.equal(retainedWithHints.state, AUTO_REJOIN_DECISION_STATE.DURABLE_SEED,
    'UNTRANSFERRED originalSeedAllocation is never overridden by hasDurableNodesTable');
  t.equal(retainedWithHints.mode, 'seed');
  t.equal(retainedWithHints.startupMode, STARTUP_JOIN_MODE.SEED);
});

test('an orphan founder -wal sidecar without its .db file fails closed as unreadable_durable_evidence',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'seed-orphan-wal-founder-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    const mgPath = getMessageGroupDbPath(
      dataDir,
      INITIAL_MESSAGE_GROUP_ID,
      INITIAL_MESSAGE_GROUP_REPLICA_IDS[0],
    );
    await mkdir(dirname(mgPath), {recursive: true});
    await writeFile(`${mgPath}-wal`, 'orphan-wal-bytes', 'utf8');

    const allocation = await readOriginalSeedAllocationOutcome(dataDir);
    t.equal(allocation.state, ORIGINAL_SEED_ALLOCATION_STATE.UNREADABLE);

    const decision = await resolveAutoRejoinStartupDecision({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      probePeerAddress: async () => false,
    });
    t.equal(decision.state, AUTO_REJOIN_DECISION_STATE.UNREADABLE_DURABLE_EVIDENCE);
    t.equal(decision.mode, 'fail');
  });

test('a corrupt original-seed founder DB fails closed as unreadable_durable_evidence',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'seed-corrupt-founder-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    const mgPath = getMessageGroupDbPath(
      dataDir,
      INITIAL_MESSAGE_GROUP_ID,
      INITIAL_MESSAGE_GROUP_REPLICA_IDS[0],
    );
    await mkdir(dirname(mgPath), {recursive: true});
    await writeFile(mgPath, 'corrupt-sqlite-bytes', 'utf8');

    const allocation = await readOriginalSeedAllocationOutcome(dataDir);
    t.equal(allocation.state, ORIGINAL_SEED_ALLOCATION_STATE.UNREADABLE);

    const decision = await resolveAutoRejoinStartupDecision({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      probePeerAddress: async () => false,
    });
    t.equal(decision.state, AUTO_REJOIN_DECISION_STATE.UNREADABLE_DURABLE_EVIDENCE);
    t.equal(decision.mode, 'fail');
  });

test('a completed seed with multi-node count but no peer addresses fails as ' +
  'peer_required_but_missing', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'seed-completed-no-peers-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  await seedCompletedOriginalFounderDbs(dataDir);
  await persistSeedHints(dataDir, {
    nodeRows: [
      {[COLUMN.NODE_ID]: LOCAL_NODE_ID, [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS},
      {[COLUMN.NODE_ID]: 'node-peer-empty-addr', [COLUMN.NODE_ADDRESS]: ''},
    ],
    clusterId: CLUSTER_ID_A,
  });

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    expectedClusterId: CLUSTER_ID_A,
    probePeerAddress: async () => false,
  });
  t.equal(decision.state, AUTO_REJOIN_DECISION_STATE.PEER_REQUIRED_BUT_MISSING);
  t.equal(decision.mode, 'fail');
  t.equal(decision.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN);
});
