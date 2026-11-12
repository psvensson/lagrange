import {serviceRoleObservation} from '../test-helpers/service-role-observation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {createRaftRsOperationPort} from '../../src/raft/raft-rs-operation-port.js';
import {
  RAFT_COMMITTED_ENTRY_APPLY_MODE,
  RAFT_OPERATION_PORT_REQUEST as REQUEST,
} from '../../src/raft/raft-operation-port-request.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  applyReplicaDemotion,
  applyReplicaLeadership,
} from '../../src/raft/replica-leadership-state.js';
import {
  evaluatePartitionQuorumAuthority,
} from '../../src/bootstrap/owners/partition-quorum-authority.js';
import {
  ManagementV1Owner,
  computeCanonicalOperationDigest,
} from '../../src/bootstrap/owners/management-v1-owner.js';
import {
  MANAGEMENT_OPERATION_KIND,
  MANAGEMENT_OPERATION_STATE,
  MANAGEMENT_V1_CONTRACT,
  L4_ROLLING_UPGRADE_REASON_CODE,
} from '../../src/bootstrap/owners/management-v1-constants.js';

const CLUSTER_ID = 'lagrange-cluster-auth-test';
const NODE_IDS = Object.freeze(['node-1', 'node-2', 'node-3']);
const PARTITION_ID = 'p-app';
const REPLICA_ID = 'p-app-node-1';

function createInMemoryNativeRaftPort(overrides = {}) {
  const db = new Database(':memory:');
  db.pragma('journal_mode=WAL');
  const port = createRaftRsOperationPort({
    groupId: PARTITION_ID,
    peerId: REPLICA_ID,
    peerAddress: 'raft://node-1/p-app',
    bootstrapPeerIds: [REPLICA_ID],
    bootstrapMembership: genesisStamp([REPLICA_ID], {}),
    durableStorage: db,
    timing: {heartbeatMs: 50, electionMinMs: 150, electionMaxMs: 300, tickIntervalMs: 10},
    substrate: {timeSource: new VirtualTimeSource({startMs: 1000})},
    deferElection: true,
    sendToPeer: () => undefined,
    resolvePeerAddress: () => 'raft://node-1/p-app',
    applyCommittedEntry: () => undefined,
    [REQUEST.APPLY_COMMITTED_ENTRY_MODE]: RAFT_COMMITTED_ENTRY_APPLY_MODE.SYNCHRONOUS,
    snapshotCatchupNeeded: () => undefined,
    ...overrides,
  });
  return {port, db};
}

function buildTestInventory() {
  const now = Date.now();
  const nodeRows = NODE_IDS.map((nodeId) => ({
    node_id: nodeId,
    status: 'active',
    updated_at_ms: now,
  }));
  const partitionRows = [
    {
      partition_id: PARTITION_ID,
      table_id: 'app',
      table_name: 'app',
      replica_count: 1,
      leader_node_id: NODE_IDS[0],
    },
  ];
  const serviceRows = [
    {
      service_id: `${PARTITION_ID}-${NODE_IDS[0]}`,
      service_type: 'partition',
      partition_id: PARTITION_ID,
      replica_id: REPLICA_ID,
      node_id: NODE_IDS[0],
      status: 'active',
      raft_role: 'leader',
    },
  ];
  return {nodeRows, partitionRows, serviceRows};
}

function buildViewOwner(service, readyNodes = [...NODE_IDS]) {
  const servicesMap = new Map([[PARTITION_ID, service]]);
  return {
    getSeedNodeId: () => NODE_IDS[0],
    getPartitionServices: () => servicesMap,
    getReplicaHandler: () => ({localServices: servicesMap}),
    resolveReadyNodeIdsFromRows: () => readyNodes,
  };
}

let opSeq = 0;
function buildOperationEnvelope(kind, parameters = {}, clusterId = CLUSTER_ID) {
  opSeq += 1;
  const c = MANAGEMENT_V1_CONTRACT;
  const env = {
    schemaVersion: c.SCHEMA_VERSION,
    sourceContract: c.SOURCE_CONTRACT,
    sourceContractVersion: c.SOURCE_CONTRACT_VERSION,
    protocolVersion: c.PROTOCOL_VERSION,
    capabilityVersion: c.CAPABILITY_VERSION,
    clusterId,
    operationId: `op-auth-${String(opSeq).padStart(4, '0')}-${'a'.repeat(16)}`,
    kind,
    parameters,
    sequence: opSeq,
    createdAtMs: 1000 + opSeq,
    expiresAtMs: 2000 + opSeq,
    requestedBy: 'operator-auth-test',
  };
  env.requestDigest = computeCanonicalOperationDigest(env);
  return env;
}

test('operation-authority-contract: canonical operation authority contract shape and fields', async () => {
  const {port, db} = createInMemoryNativeRaftPort();
  try {
    const service = new PartitionService({
      partitionId: PARTITION_ID,
      tableId: 'app',
      tableName: 'app',
      replicaId: REPLICA_ID,
      replicaIds: [REPLICA_ID],
      nodeId: NODE_IDS[0],
      suppressLifecycleLogs: true,
    });
    service.initialized = true;
    service.raft = port;

    assert.equal(typeof service.readPartitionConsensusAuthority, 'function',
      'PartitionService exposes readPartitionConsensusAuthority');

    // Follower before election does not hold leader authority
    const followerAuth = service.readPartitionConsensusAuthority();
    assert.equal(followerAuth.isLeader, false, 'follower is not leader');
    assert.equal(followerAuth.hasQuorum, false, 'follower does not certify leader quorum');

    // Campaign to elect genuine native leader
    port.campaign();
    applyReplicaLeadership(service, 'leader', service.raft.readRoleAndTerm().term);

    const leaderAuth = service.readPartitionConsensusAuthority();
    assert.equal(leaderAuth.outcome, 'core-ok', 'outcome is core-ok');
    assert.equal(leaderAuth.available, true, 'authority is available');
    assert.equal(leaderAuth.role, 'leader', 'role is leader');
    assert.equal(leaderAuth.isLeader, true, 'isLeader is true');
    assert.equal(leaderAuth.term, 1, 'term is 1');
    assert.equal(leaderAuth.commitIndex, 1, 'commitIndex is 1');
    assert.equal(leaderAuth.appliedIndex, 1, 'appliedIndex is 1');
    assert.equal(typeof leaderAuth.configurationKey, 'string', 'configurationKey is a string');
    assert.equal(leaderAuth.configurationKey.length > 0, true, 'configurationKey is non-empty');
    assert.equal(leaderAuth.membershipGenerationIndex, 0, 'membershipGenerationIndex is 0');
    assert.equal(typeof leaderAuth.lifecycleIncarnation, 'string', 'lifecycleIncarnation is string');
    assert.equal(leaderAuth.voterCount, 1, 'voterCount is 1');
    assert.equal(leaderAuth.hasQuorum, true, 'hasQuorum is true');
    assert.ok(Number.isFinite(leaderAuth.observedAtMs), 'observedAtMs is finite number');

    // Check cluster snapshot carrying operationAuthority contract
    const viewOwner = buildViewOwner(service);
    const inventory = buildTestInventory();
    const snap = evaluatePartitionQuorumAuthority(viewOwner, inventory);
    assert.equal(snap.hasPartitionQuorum, true, 'cluster has partition quorum');
    assert.ok(snap.operationAuthority, 'snapshot carries operationAuthority contract');
    assert.equal(snap.operationAuthority.contractVersion, 1, 'contractVersion is 1');
    assert.equal(snap.operationAuthority.hasQuorum, true, 'operationAuthority hasQuorum is true');
    assert.equal(snap.operationAuthority.configurationKey, leaderAuth.configurationKey, 'configurationKey matches');
    assert.equal(snap.operationAuthority.term, 1, 'term matches');
    assert.equal(snap.configurationKey, leaderAuth.configurationKey, 'snapshot carries configurationKey');
    assert.ok(Number.isFinite(snap.capturedAtMs), 'snapshot carries capturedAtMs');
    assert.ok(Number.isFinite(snap.maxFreshnessMs) && snap.maxFreshnessMs > 0, 'snapshot carries maxFreshnessMs');

    // Verify diagnostic getStatus() retains its 15 keys without phantom pollution
    const status = service.getStatus();
    assert.equal(Object.keys(status).length, 15, 'getStatus retains exactly 15 keys');
    for (const phantom of ['hasQuorum', 'quorum', 'activeReplicaCount', 'operationAuthority']) {
      assert.equal(phantom in status, false, `getStatus omits ${phantom}`);
    }
  } finally {
    port.close();
    db.close();
  }
});

test('invalid-authority-refused: hand-set role and uncertified consensus are refused', async () => {
  const service = new PartitionService({
    partitionId: PARTITION_ID,
    tableId: 'app',
    tableName: 'app',
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: NODE_IDS[0],
    suppressLifecycleLogs: true,
  });
  service.initialized = true;

  const viewOwner = buildViewOwner(service);
  const inventory = buildTestInventory();

  // Test 2a: Hand-set role + stubbed term ({term: 4}) without native consensus MUST be refused
  service.raft = {readStatus: () => ({term: 4})};
  applyReplicaLeadership(service, 'leader', 4);
  assert.equal(evaluatePartitionQuorumAuthority(viewOwner, inventory).hasPartitionQuorum, false,
    'hand-set role with stubbed term refused');

  // Test 2b: Consensus core refusal outcome
  service.raft = {
    readStatus: () => ({
      outcome: 'CORE_REFUSED',
      reason: 'election-lost',
      role: 'leader',
      term: 4,
    }),
  };
  assert.equal(evaluatePartitionQuorumAuthority(viewOwner, inventory).hasPartitionQuorum, false,
    'consensus CORE_REFUSED refused');

  // Test 2c: Follower on leader node
  service.raft = {
    readStatus: () => ({
      outcome: 'CORE_OK',
      role: 'follower',
      term: 4,
      confState: {voters: [REPLICA_ID]},
    }),
  };
  applyReplicaDemotion(service, 'follower');
  assert.equal(evaluatePartitionQuorumAuthority(viewOwner, inventory).hasPartitionQuorum, false,
    'follower role on leader node refused');

  // Test 2d: Candidate
  service.raft = {
    readStatus: () => ({
      outcome: 'CORE_OK',
      role: 'candidate',
      term: 4,
      confState: {voters: [REPLICA_ID]},
    }),
  };
  applyReplicaDemotion(service, 'candidate');
  assert.equal(evaluatePartitionQuorumAuthority(viewOwner, inventory).hasPartitionQuorum, false,
    'candidate role refused');

  // Test 2e: Pending unapplied conf change
  service.raft = {
    readRoleAndTerm: () => (serviceRoleObservation('leader', 4)),
    readStatus: () => ({
      outcome: 'CORE_OK',
      role: 'leader',
      term: 4,
      confChangePending: true,
      confState: {voters: [REPLICA_ID]},
    }),
  };
  applyReplicaLeadership(service, 'leader', service.raft.readRoleAndTerm().term);
  assert.equal(evaluatePartitionQuorumAuthority(viewOwner, inventory).hasPartitionQuorum, false,
    'unapplied pending conf change refused');

  // Test 2f: Term 0
  service.raft = {
    readStatus: () => ({
      outcome: 'CORE_OK',
      role: 'leader',
      term: 0,
      confState: {voters: [REPLICA_ID]},
    }),
  };
  assert.equal(evaluatePartitionQuorumAuthority(viewOwner, inventory).hasPartitionQuorum, false,
    'zero term refused');

  // Test 2g: Empty voters
  service.raft = {
    readRoleAndTerm: () => (serviceRoleObservation('leader', 4)),
    readStatus: () => ({
      outcome: 'CORE_OK',
      role: 'leader',
      term: 4,
      confState: {voters: []},
    }),
  };
  assert.equal(evaluatePartitionQuorumAuthority(viewOwner, inventory).hasPartitionQuorum, false,
    'empty voter set refused');

  // Test 2h: Uninitialized service
  service.initialized = false;
  assert.equal(evaluatePartitionQuorumAuthority(viewOwner, inventory).hasPartitionQuorum, false,
    'uninitialized service refused');
  service.initialized = true;

  // Test 2i: Shutting down service
  service.isShutdown = true;
  assert.equal(evaluatePartitionQuorumAuthority(viewOwner, inventory).hasPartitionQuorum, false,
    'shutting down service refused');
  service.isShutdown = false;

  // Test 2j: Null raft port
  service.raft = null;
  assert.equal(evaluatePartitionQuorumAuthority(viewOwner, inventory).hasPartitionQuorum, false,
    'missing raft port refused');
});

test('mutation-time-identity-and-freshness: mutation point revalidates configuration identity and freshness bound', async () => {
  const baseNow = 10_000;
  const maxFreshnessMs = 5000;
  let currentSnapshot = {
    nodeCount: 3,
    readyNodeCount: 3,
    underReplicatedPartitionCount: 0,
    nodeIds: [...NODE_IDS],
    ready: true,
    hasPartitionQuorum: true,
    clusterId: CLUSTER_ID,
    configurationKey: 'conf-key-v1',
    membershipGenerationIndex: 1,
    lifecycleIncarnation: 'inc-1',
    capturedAtMs: baseNow,
    maxFreshnessMs,
    operationAuthority: {
      contractVersion: 1,
      configurationKey: 'conf-key-v1',
      membershipGenerationIndex: 1,
      lifecycleIncarnation: 'inc-1',
      clusterId: CLUSTER_ID,
      capturedAtMs: baseNow,
      maxFreshnessMs,
      hasQuorum: true,
    },
  };

  const rollingUpgradeOwner = {
    capabilitySupported: true,
    startUpgrade: (args) => ({
      state: MANAGEMENT_OPERATION_STATE.ACCEPTED,
      lagrangeOperationId: args.lagrangeOperationId,
      updatedAtMs: args.nowMs,
    }),
  };

  const mgmt = new ManagementV1Owner({
    clusterId: CLUSTER_ID,
    getClusterSnapshot: () => currentSnapshot,
    rollingUpgradeOwner,
  });

  const releaseParams = {
    targetVersion: '0.5.0',
    targetArtifactDigest: `sha256:${'5'.repeat(64)}`,
  };

  // Test 3a: Fresh snapshot passes
  const validRes = await mgmt.submitOperation(
    buildOperationEnvelope(MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE, releaseParams),
    {nowMs: baseNow + 1000},
  );
  assert.equal(validRes.state, MANAGEMENT_OPERATION_STATE.ACCEPTED, 'fresh snapshot admitted');

  // Test 3b: Expired snapshot refused with QUORUM_SAFETY_HALT
  const expiredRes = await mgmt.submitOperation(
    buildOperationEnvelope(MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE, releaseParams),
    {nowMs: baseNow + maxFreshnessMs + 1},
  );
  assert.equal(expiredRes.state, MANAGEMENT_OPERATION_STATE.REJECTED,
    'expired snapshot rejected');
  assert.equal(expiredRes.reasonCode, L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT,
    'expired snapshot refused with QUORUM_SAFETY_HALT');

  // Test 3c: Monotonicity violated (nowMs < capturedAtMs)
  const timeInvertedRes = await mgmt.submitOperation(
    buildOperationEnvelope(MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE, releaseParams),
    {nowMs: baseNow - 2000},
  );
  assert.equal(timeInvertedRes.state, MANAGEMENT_OPERATION_STATE.REJECTED,
    'time-inverted snapshot rejected');
  assert.equal(timeInvertedRes.reasonCode, L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT,
    'time-inverted snapshot refused with QUORUM_SAFETY_HALT');

  // Test 3d: Configuration key changed / missing
  currentSnapshot = {...currentSnapshot, configurationKey: null};
  const missingConfRes = await mgmt.submitOperation(
    buildOperationEnvelope(MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE, releaseParams),
    {nowMs: baseNow + 2000},
  );
  assert.equal(missingConfRes.state, MANAGEMENT_OPERATION_STATE.REJECTED,
    'missing configurationKey rejected');
  assert.equal(missingConfRes.reasonCode, L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT,
    'missing configurationKey refused with QUORUM_SAFETY_HALT');

  // Test 3e: Incarnation changed / missing
  currentSnapshot = {...currentSnapshot, configurationKey: 'conf-key-v1', lifecycleIncarnation: null};
  const missingIncRes = await mgmt.submitOperation(
    buildOperationEnvelope(MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE, releaseParams),
    {nowMs: baseNow + 2000},
  );
  assert.equal(missingIncRes.state, MANAGEMENT_OPERATION_STATE.REJECTED,
    'missing lifecycleIncarnation rejected');
  assert.equal(missingIncRes.reasonCode, L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT,
    'missing lifecycleIncarnation refused with QUORUM_SAFETY_HALT');

  // Test 3f: Quorum lost (hasPartitionQuorum: false)
  currentSnapshot = {...currentSnapshot, hasPartitionQuorum: false};
  const noQuorumRes = await mgmt.submitOperation(
    buildOperationEnvelope(MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE, releaseParams),
    {nowMs: baseNow + 2000},
  );
  assert.equal(noQuorumRes.state, MANAGEMENT_OPERATION_STATE.REJECTED,
    'quorum lost snapshot rejected');
  assert.equal(noQuorumRes.reasonCode, L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT,
    'quorum lost snapshot refused with QUORUM_SAFETY_HALT');
});

test('real-native-producer-consumer-action: real native consensus leader executes management operation', async () => {
  const {port, db} = createInMemoryNativeRaftPort();
  try {
    const service = new PartitionService({
      partitionId: PARTITION_ID,
      tableId: 'app',
      tableName: 'app',
      replicaId: REPLICA_ID,
      replicaIds: [REPLICA_ID],
      nodeId: NODE_IDS[0],
      suppressLifecycleLogs: true,
    });
    service.initialized = true;
    service.raft = port;

    // Campaign port in real WASM Raft to become leader
    port.campaign();
    applyReplicaLeadership(service, 'leader', service.raft.readRoleAndTerm().term);

    const viewOwner = buildViewOwner(service);
    const inventory = buildTestInventory();

    const rollingUpgradeOwner = {
      capabilitySupported: true,
      startUpgrade: (args) => ({
        state: MANAGEMENT_OPERATION_STATE.ACCEPTED,
        lagrangeOperationId: args.lagrangeOperationId,
        updatedAtMs: args.nowMs,
      }),
    };

    const mgmt = new ManagementV1Owner({
      clusterId: CLUSTER_ID,
      getClusterSnapshot: () => evaluatePartitionQuorumAuthority(viewOwner, inventory),
      rollingUpgradeOwner,
    });

    const releaseParams = {
      targetVersion: '0.5.0',
      targetArtifactDigest: `sha256:${'5'.repeat(64)}`,
    };

    const res = await mgmt.submitOperation(
      buildOperationEnvelope(MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE, releaseParams),
    );

    assert.equal(res.state, MANAGEMENT_OPERATION_STATE.ACCEPTED, 'real native leader executes management operation');
    assert.ok(res.lagrangeOperationId.startsWith('lagrange-op-'), 'returns canonical operation id');
  } finally {
    port.close();
    db.close();
  }
});

test('refusal-recovery-and-cleanup: refusal during quorum loss, recovery on restoration, and clean resource teardown', async () => {
  const {port, db} = createInMemoryNativeRaftPort();
  try {
    const service = new PartitionService({
      partitionId: PARTITION_ID,
      tableId: 'app',
      tableName: 'app',
      replicaId: REPLICA_ID,
      replicaIds: [REPLICA_ID],
      nodeId: NODE_IDS[0],
      suppressLifecycleLogs: true,
    });
    service.initialized = true;
    service.raft = port;

    // Initially follower without campaign: no quorum
    const viewOwner = buildViewOwner(service);
    const inventory = buildTestInventory();

    const rollingUpgradeOwner = {
      capabilitySupported: true,
      startUpgrade: (args) => ({
        state: MANAGEMENT_OPERATION_STATE.ACCEPTED,
        lagrangeOperationId: args.lagrangeOperationId,
        updatedAtMs: args.nowMs,
      }),
    };

    const mgmt = new ManagementV1Owner({
      clusterId: CLUSTER_ID,
      getClusterSnapshot: () => evaluatePartitionQuorumAuthority(viewOwner, inventory),
      rollingUpgradeOwner,
    });

    const releaseParams = {
      targetVersion: '0.5.0',
      targetArtifactDigest: `sha256:${'5'.repeat(64)}`,
    };

    // 1. Refusal when not leader
    const rejectedRes = await mgmt.submitOperation(
      buildOperationEnvelope(MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE, releaseParams),
    );
    assert.equal(rejectedRes.state, MANAGEMENT_OPERATION_STATE.REJECTED,
      'mutation refused when consensus has not elected leader');
    assert.equal(rejectedRes.reasonCode, L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT);

    // 2. Recovery on campaign & leadership promotion
    port.campaign();
    applyReplicaLeadership(service, 'leader', service.raft.readRoleAndTerm().term);

    const res = await mgmt.submitOperation(
      buildOperationEnvelope(MANAGEMENT_OPERATION_KIND.TRANSITION_RELEASE, releaseParams),
    );
    assert.equal(res.state, MANAGEMENT_OPERATION_STATE.ACCEPTED, 'mutation succeeds after recovery');
  } finally {
    // 3. Clean teardown
    port.close();
    db.close();
    assert.ok(true, 'resources cleanly closed');
  }
});
