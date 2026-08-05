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

import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {
  RejoinHintsPersistenceService,
  resolveAutoRejoinStartupDecision,
} from '../../src/bootstrap/rejoin-hints.js';
import {
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  STARTUP_JOIN_MODE,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  CLUSTER_ID_CONFIG_KEY,
} from '../../src/bootstrap/cluster-identity-constants.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';

const LOCAL_NODE_ID = 'node-local';
const LOCAL_NODE_ADDRESS = 'seed-node:8080';
const PEER_NODE_ADDRESS_A = 'peer-a:8080';
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
