import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  evaluatePartitionQuorumAuthority,
  readAuthoritativeManagementClusterSnapshot,
} from '../../src/bootstrap/owners/partition-quorum-authority.js';
import {
  PARTITION_LOCAL_SERVICE_STATUS_KEYS,
  assertPartitionLocalServiceStatusConformance,
  isPartitionLocalServiceStatusRecord,
} from '../../src/partition/partition-local-service-status-contract.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {
  verifyContractBoundaryTypecheck,
} from '../../scripts/checks/check-contract-authoring-fidelity.js';
import {buildLocalPartitionService} from './management-v1-local-service-fixture.js';

const HARNESS_FIDELITY_DOC =
  'docs/development/verification-templates/harness-fidelity.md';
const OWNER_INTERACTION_DOC =
  'docs/development/verification-templates/owner-interaction.md';
const SOLVER_QUESTS_DOC =
  'docs/steering/workflow-guidelines/solver-quests.md';

const CONSUMER_FILE = 'src/bootstrap/owners/partition-quorum-authority.js';
const TS_DIAGNOSTIC_CODES_PROPERTY_NOT_EXIST = Object.freeze([2339, 2551]);
const EXPECTED_DIAGNOSTICS_ZERO = 0;
const CANONICAL_FIELD_COUNT = 15;

const PHANTOM_MEMBER_HAS_QUORUM = 'hasQuorum';
const PHANTOM_MEMBER_ACTIVE_REPLICA_COUNT = 'activeReplicaCount';

const TEST_PARTITION_ID = 'p-contract-pilot';
const TEST_TABLE_ID = 't-contract-pilot';
const TEST_TABLE_NAME = 'pilot_table';
const TEST_REPLICA_ID = 'r-contract-pilot-1';
const TEST_NODE_ID = 'node-pilot-1';
const TEST_TERM = 1;
const TEST_SIZE_BYTES = 1024;
const TEST_REPLICA_COUNT = 3;
const TEST_CDC_SUBSCRIBERS = 0;
const TEST_ROLE_LEADER = 'leader';
const TEST_STATE_READY = 'ready';
const TEST_MEMORY_DB = ':memory:';

function buildSampleConformingStatusInput() {
  return {
    partitionId: TEST_PARTITION_ID,
    tableId: TEST_TABLE_ID,
    tableName: TEST_TABLE_NAME,
    replicaId: TEST_REPLICA_ID,
    nodeId: TEST_NODE_ID,
    role: TEST_ROLE_LEADER,
    isLeader: true,
    leaderId: TEST_REPLICA_ID,
    term: TEST_TERM,
    state: TEST_STATE_READY,
    keyRange: null,
    sizeBytes: TEST_SIZE_BYTES,
    replicaCount: TEST_REPLICA_COUNT,
    cdcSubscribers: TEST_CDC_SUBSCRIBERS,
    initialized: true,
  };
}

test('real producer and consumer pass contract-first typecheck with zero diagnostics', () => {
  const checkResult = verifyContractBoundaryTypecheck();
  assert.equal(
    checkResult.diagnostics.length,
    EXPECTED_DIAGNOSTICS_ZERO,
    `Typecheck produced unexpected diagnostics: ${JSON.stringify(checkResult.diagnostics)}`,
  );
  assert.equal(checkResult.passed, true);
});

test('phantom members are rejected by static typecheck and runtime conformance', () => {
  const originalConsumerSource = fs.readFileSync(CONSUMER_FILE, 'utf8');

  // Static verification 1: status.hasQuorum rejected by TypeScript checkJs
  const consumerWithHasQuorum = originalConsumerSource.replace(
    'const status = localService.getStatus();',
    '/** @type {import("../../partition/partition-local-service-status-contract.js").PartitionLocalServiceStatusRecord} */\n' +
      'const status = localService.getStatus();\n' +
      'if (status.hasQuorum) return LOCAL_STATUS_UNAVAILABLE;',
  );
  const staticResultHasQuorum = verifyContractBoundaryTypecheck({
    sourceOverrides: {
      [CONSUMER_FILE]: consumerWithHasQuorum,
    },
  });
  assert.equal(staticResultHasQuorum.passed, false);
  const hasQuorumDiagnostic = staticResultHasQuorum.diagnostics.find(
    (diag) => TS_DIAGNOSTIC_CODES_PROPERTY_NOT_EXIST.includes(diag.code) &&
      diag.message.includes(PHANTOM_MEMBER_HAS_QUORUM),
  );
  assert.ok(
    hasQuorumDiagnostic,
    `Expected diagnostic TS2339/TS2551 for ${PHANTOM_MEMBER_HAS_QUORUM}, got: ` +
      JSON.stringify(staticResultHasQuorum.diagnostics),
  );

  // Static verification 2: status.activeReplicaCount rejected by TypeScript checkJs
  const consumerWithActiveReplica = originalConsumerSource.replace(
    'const status = localService.getStatus();',
    '/** @type {import("../../partition/partition-local-service-status-contract.js").PartitionLocalServiceStatusRecord} */\n' +
      'const status = localService.getStatus();\n' +
      'if (status.activeReplicaCount > 0) return LOCAL_STATUS_UNAVAILABLE;',
  );
  const staticResultActiveReplica = verifyContractBoundaryTypecheck({
    sourceOverrides: {
      [CONSUMER_FILE]: consumerWithActiveReplica,
    },
  });
  assert.equal(staticResultActiveReplica.passed, false);
  const activeReplicaDiagnostic = staticResultActiveReplica.diagnostics.find(
    (diag) => TS_DIAGNOSTIC_CODES_PROPERTY_NOT_EXIST.includes(diag.code) &&
      diag.message.includes(PHANTOM_MEMBER_ACTIVE_REPLICA_COUNT),
  );
  assert.ok(
    activeReplicaDiagnostic,
    `Expected diagnostic TS2339/TS2551 for ${PHANTOM_MEMBER_ACTIVE_REPLICA_COUNT}, got: ` +
      JSON.stringify(staticResultActiveReplica.diagnostics),
  );

  // Runtime verification: assertPartitionLocalServiceStatusConformance rejects phantom member
  const validStatus = buildSampleConformingStatusInput();
  assert.equal(isPartitionLocalServiceStatusRecord(validStatus), true);

  const statusWithPhantom = {...validStatus, [PHANTOM_MEMBER_HAS_QUORUM]: true};
  assert.equal(isPartitionLocalServiceStatusRecord(statusWithPhantom), false);
  assert.throws(
    () => assertPartitionLocalServiceStatusConformance(statusWithPhantom),
    (error) => error instanceof TypeError && error.message.includes(PHANTOM_MEMBER_HAS_QUORUM),
  );
});

test('shared fixture doubles conform to producer contract and reject drift', () => {
  assert.equal(PARTITION_LOCAL_SERVICE_STATUS_KEYS.length, CANONICAL_FIELD_COUNT);

  // Conforming double from management-v1 fixture conforms to producer contract
  const conformingServiceDouble = buildLocalPartitionService('p-test-fixture');
  const fixtureStatus = conformingServiceDouble.getStatus();
  assert.equal(isPartitionLocalServiceStatusRecord(fixtureStatus), true);
  assert.doesNotThrow(() => {
    assertPartitionLocalServiceStatusConformance(fixtureStatus);
  });

  // Fixture drift with phantom member is rejected
  assert.throws(
    () => buildLocalPartitionService('p-drift-test', {
      [PHANTOM_MEMBER_HAS_QUORUM]: true,
    }),
    (error) => error instanceof TypeError,
  );
});

test('real partition service interaction proves refusal, recovery and cleanup', async () => {
  // Step 1: Refusal when authoritativeView is absent or uninitialized
  const emptyOwner = {
    getAuthoritativeControlPlaneView: () => null,
  };
  const refusedSnapshot = await readAuthoritativeManagementClusterSnapshot(emptyOwner);
  assert.equal(refusedSnapshot, null);

  // Step 2: Initialize real production PartitionService
  const partitionOptions = withFoundingStamp({
    partitionId: TEST_PARTITION_ID,
    tableId: TEST_TABLE_ID,
    tableName: TEST_TABLE_NAME,
    replicaId: TEST_REPLICA_ID,
    replicaIds: [TEST_REPLICA_ID],
    nodeId: TEST_NODE_ID,
    dbPath: TEST_MEMORY_DB,
  });
  const realPartition = new PartitionService(partitionOptions);
  await realPartition.initialize();

  try {
    // Producer getStatus conforms to contract
    const realStatus = realPartition.getStatus();
    assert.equal(isPartitionLocalServiceStatusRecord(realStatus), true);
    assert.doesNotThrow(() => {
      assertPartitionLocalServiceStatusConformance(realStatus);
    });
    assert.equal(realStatus.partitionId, TEST_PARTITION_ID);
    assert.equal(realStatus.initialized, true);

    // Step 3: Quorum evaluation through production authority owner
    const inventory = {
      nodeRows: [{
        node_id: TEST_NODE_ID,
        status: 'active',
        is_live: 1,
        created_at: 1000,
      }],
      partitionRows: [{
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
        leader_node_id: TEST_NODE_ID,
        replica_count: 1,
        created_at: 1000,
      }],
      serviceRows: [{
        service_id: `${TEST_PARTITION_ID}:${TEST_REPLICA_ID}`,
        partition_id: TEST_PARTITION_ID,
        replica_id: TEST_REPLICA_ID,
        node_id: TEST_NODE_ID,
        service_type: 'partition',
        raft_role: 'leader',
        status: 'active',
        created_at: 1000,
      }],
    };

    const partitionServicesMap = new Map();
    partitionServicesMap.set(TEST_PARTITION_ID, realPartition);
    const clusterOwner = {
      partitionServices: partitionServicesMap,
      getPartitionServices: () => partitionServicesMap,
      localNodeId: TEST_NODE_ID,
      getSeedNodeId: () => TEST_NODE_ID,
      resolveReadyNodeIdsFromRows: () => [TEST_NODE_ID],
      getAuthoritativeControlPlaneView: () => ({
        canRead: () => true,
        readReadinessOwnerRows: async () => ({
          success: true,
          rowSetComplete: true,
          partial: false,
          source: 'local_partition_replica',
          rows: [],
          readAuthorityWitness: {
            witnessType: 'leader_lease',
            partitionId: TEST_PARTITION_ID,
            validUntilMs: Date.now() + 60000,
          },
        }),
      }),
    };

    const healthySnapshot = evaluatePartitionQuorumAuthority(clusterOwner, inventory);
    assert.ok(healthySnapshot !== null);
    assert.equal(healthySnapshot.hasPartitionQuorum, true);
    assert.equal(healthySnapshot.nodeCount, 1);
  } finally {
    // Step 4: Clean resource cleanup
    await realPartition.shutdown();
    assert.equal(realPartition.isShutdown, true);
  }
});

test('steering and verification templates align with zero legacy fallback', () => {
  const harnessFidelityContent = fs.readFileSync(HARNESS_FIDELITY_DOC, 'utf8');
  const normalizedHarnessFidelity = harnessFidelityContent.replace(/\s+/gu, ' ');
  assert.ok(
    normalizedHarnessFidelity.includes('producer conformance'),
    'harness-fidelity.md must require producer conformance for test doubles',
  );
  assert.ok(
    normalizedHarnessFidelity.includes('do not reproduce decision logic'),
    'harness-fidelity.md must state doubles do not reproduce decision logic',
  );

  const ownerInteractionContent = fs.readFileSync(OWNER_INTERACTION_DOC, 'utf8');
  const normalizedOwnerInteraction = ownerInteractionContent.replace(/\s+/gu, ' ');
  assert.ok(
    !normalizedOwnerInteraction.includes('Any surviving exception must be explicit'),
    'owner-interaction.md must not authorize permissive exceptions for legacy/fallback',
  );
  assert.ok(
    normalizedOwnerInteraction.includes('No legacy, compatibility, alias reader, silent fallback'),
    'owner-interaction.md item 9 must forbid legacy/fallback paths strictly',
  );

  const solverQuestsContent = fs.readFileSync(SOLVER_QUESTS_DOC, 'utf8');
  const normalizedSolverQuests = solverQuestsContent.replace(/\s+/gu, ' ');
  assert.ok(
    normalizedSolverQuests.includes('Contract-first transition record checklist') ||
      normalizedSolverQuests.includes('contract-first transition record checklist'),
    'solver-quests.md must host the canonical contract-first transition record checklist',
  );
  assert.ok(
    normalizedSolverQuests.toLowerCase().includes('absent versus unavailable') ||
      normalizedSolverQuests.toLowerCase().includes('absent vs unavailable'),
    'solver-quests.md checklist must cover absent versus unavailable',
  );
});
