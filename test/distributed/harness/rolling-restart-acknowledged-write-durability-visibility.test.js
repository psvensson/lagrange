import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {QueryExecutor} from '../../../src/query/query-executor.js';
import {SQLParser} from '../../../src/query/sql-parser.js';
import {DistributedWriteCoordinator} from
  '../../../src/query/distributed/distributed-write-coordinator.js';
import {createAdminQueryResultMessageEnvelope} from
  '../../../src/admin/admin-query-result-message-envelope.js';
import {buildAdminWriteReceipt} from '../../../src/admin/admin-write-receipt.js';
import LifeRaft from '../../../src/raft/liferaft.js';
import {InMemoryLogAdapter} from '../../../src/raft/in-memory-log-adapter.js';
import {buildDurableCommitWitness} from
  '../../../src/partition/partition-write-kernel.js';
import {createMockSystemCache} from
  '../../query/query-executor-test-support.js';
import {createVirtualNetwork} from './virtual-network.js';
import {connectRaftCluster, driveNetwork} from './raft-network-host.js';
import {LoadGenerator} from './load-generator.js';
import {
  assertAcknowledgedWritesVisibleOnReachableNodes,
} from './acknowledged-write-visibility.js';

const FAILED_RUN_IDS = Object.freeze([
  'bench-9fc36d55-8126-4f3d-ad77-c3fd1c151d5d-412',
  'bench-9fc36d55-8126-4f3d-ad77-c3fd1c151d5d-414',
  'bench-9fc36d55-8126-4f3d-ad77-c3fd1c151d5d-416',
  'bench-9fc36d55-8126-4f3d-ad77-c3fd1c151d5d-418',
  'bench-9fc36d55-8126-4f3d-ad77-c3fd1c151d5d-420',
]);
const ACCEPTING_NODE_ID = '9c847442-605f-44c9-86dd-34d7d40484b3';
const RESTARTING_NODE_ID = '2623e7e1-d6e3-4ab6-8d9c-7ed95cd83b03';
const FAILED_READ_NODE_ID = 'b01ff99f-167b-4c1b-b879-2bb0af6fee56';
const OTHER_NODE_IDS = Object.freeze([
  ACCEPTING_NODE_ID,
  RESTARTING_NODE_ID,
  '8b6ebd73-ff2c-4b98-a1d2-7a8d8beff77f',
  'c60a00c6-88ec-4e7d-b7ff-e39a201f61bf',
]);
const FAST = Object.freeze({
  visibilityTimeoutMs: 20,
  visibilityPollIntervalMs: 1,
});
const RUN13_PARTITION_ID = 'benchmark_events-p1';
const RUN13_NODE_IDS = Object.freeze([FAILED_READ_NODE_ID, ...OTHER_NODE_IDS]);
const RUN13_RECOVERY_SEED = 13;
const RUN13_RAFT_OPTIONS = Object.freeze({
  'election min': '100000 ms',
  'election max': '100000 ms',
  'heartbeat': '30 ms',
  'Log': InMemoryLogAdapter,
});
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);

function createEndToEndPartition() {
  return new PartitionService({
    partitionId: 'logs-p1',
    tableId: 'logs',
    tableName: 'logs',
    replicaId: 'logs-p1-r9c847',
    replicaIds: ['logs-p1-r9c847'],
    nodeId: ACCEPTING_NODE_ID,
    schema: {
      columns: [
        {name: 'log_id', type: 'TEXT', primaryKey: true},
        {name: 'timestamp', type: 'INTEGER'},
        {name: 'level', type: 'TEXT'},
        {name: 'node_id', type: 'TEXT'},
        {name: 'message', type: 'TEXT'},
        {name: 'created_at', type: 'INTEGER'},
      ],
    },
    dbPath: ':memory:',
  });
}

function createEndToEndCoordinator(partition) {
  const partitionId = partition.partitionId;
  const queryExecutor = new QueryExecutor({
    systemCache: createMockSystemCache([partitionId]),
    messageRouter: {
      deliver: async (_address, request) =>
        partition.handleRemoteQuery(request),
    },
  });
  return new DistributedWriteCoordinator({
    partitionResolver: {
      resolvePartitionForKey: () => partitionId,
    },
    queryExecutor,
    getTablePartitions: () => [{partition_id: partitionId}],
    getTableInfo: () => ({
      primaryKey: partition.tableName === 'logs' ? 'log_id' : 'event_id',
    }),
    maxRetries: 0,
  });
}

function createRun13Partition(nodeId, dbPath) {
  return new PartitionService({
    partitionId: RUN13_PARTITION_ID,
    tableId: 'benchmark_events',
    tableName: 'benchmark_events',
    replicaId: `benchmark_events-p1-${nodeId}`,
    replicaIds: [`benchmark_events-p1-${nodeId}`],
    nodeId,
    schema: {
      columns: [
        {name: 'event_id', type: 'TEXT', primaryKey: true},
        {name: 'payload', type: 'TEXT'},
      ],
    },
    dbPath,
  });
}

function buildRun13Command(id, index) {
  const operationId = `run13-accepted-${index}`;
  return {
    type: 'INSERT',
    entryId: `run13-entry-${index}`,
    operationId,
    idempotencyKey: operationId,
    sql: 'INSERT INTO benchmark_events (event_id, payload) VALUES (?, ?)',
    params: [id, `payload-${index}`],
  };
}

function createLocalPartitionReadNode(partition) {
  return {
    id: partition.nodeId,
    isReachable: async () => true,
    query: async (sql) => {
      const result = await partition.handleRemoteQuery({sql, params: []});
      if (result.success !== true) {
        throw new Error(result.error || 'local partition read failed');
      }
      return {
        rows: result.rows,
        readAuthorityWitnesses: [result.readAuthorityWitness],
      };
    },
  };
}

function createRun13Receipt(id, command, entry, acknowledgedAtMs) {
  const durableCommitWitness = buildDurableCommitWitness({
    partitionId: RUN13_PARTITION_ID,
    leaderNodeId: ACCEPTING_NODE_ID,
    leaderReplicaId: ACCEPTING_NODE_ID,
    logEntry: {...entry, data: command},
  });
  const writeReceipt = buildAdminWriteReceipt({
    operationId: command.operationId,
    idempotencyKey: command.idempotencyKey,
    participantResults: [{
      success: true,
      partitionId: RUN13_PARTITION_ID,
      acceptingNodeId: ACCEPTING_NODE_ID,
      acknowledgedAtMs,
      durableCommitWitness,
    }],
  });
  return {
    id,
    gatewayNodeId: ACCEPTING_NODE_ID,
    receivedAtMs: acknowledgedAtMs,
    ...writeReceipt,
    acceptingNodeId: ACCEPTING_NODE_ID,
    acknowledgedAtMs,
  };
}

function run13RaftOptions() {
  return {
    ...RUN13_RAFT_OPTIONS,
    write: (_packet, callback) => callback?.(null),
  };
}

async function initializeRun13Partitions(tempDir) {
  const partitions = new Map();
  for (const nodeId of RUN13_NODE_IDS) {
    const partition = createRun13Partition(
      nodeId,
      path.join(tempDir, `${nodeId}.db`),
    );
    await partition.initialize();
    partitions.set(nodeId, partition);
  }
  return partitions;
}

function wireRun13CommitApplication(rafts, partitions, dropAppliedNodeId) {
  for (const nodeId of RUN13_NODE_IDS) {
    rafts.get(nodeId).on('commit', (command) => {
      const partition = partitions.get(nodeId);
      if (partition && nodeId !== dropAppliedNodeId) {
        partition.applyCommittedEntry(command);
      }
    });
  }
}

async function assertRun13RecoveryBarrier(rafts, expectedIndex) {
  for (const nodeId of RUN13_NODE_IDS) {
    const raft = rafts.get(nodeId);
    assert.equal(
      raft.log.committedIndex,
      expectedIndex,
      `${nodeId} crossed the committed-log recovery barrier`,
    );
    for (let index = 1; index <= expectedIndex; index++) {
      assert.equal(
        (await raft.log.get(index))?.committed,
        true,
        `${nodeId} has durable committed entry ${index}`,
      );
    }
  }
}

async function acceptRun13Writes(rafts, net) {
  const leader = rafts.get(ACCEPTING_NODE_ID);
  const commands = arrayMap(FAILED_RUN_IDS, buildRun13Command);
  for (const command of commands) await leader.command(command);
  await driveNetwork(net, {untilMs: net.now() + 300, stepMs: 5});
  const receipts = [];
  for (let index = 0; index < commands.length; index++) {
    const entry = await leader.log.get(index + 1);
    assert.equal(entry?.committed, true, `accepted entry ${index + 1} committed`);
    receipts.push(createRun13Receipt(
      FAILED_RUN_IDS[index],
      commands[index],
      entry,
      net.now() + index,
    ));
  }
  return receipts;
}

async function cleanupRun13Resources(partitions, rafts, tempDir) {
  for (const partition of partitions.values()) await partition.shutdown();
  rafts.forEach((raft) => raft.end());
  fs.rmSync(tempDir, {recursive: true, force: true});
}

async function runRealRaftRun13({dropAppliedNodeId = null} = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-run13-'));
  const net = createVirtualNetwork({seed: RUN13_RECOVERY_SEED});
  const rafts = connectRaftCluster(
    net,
    RUN13_NODE_IDS,
    run13RaftOptions,
  );
  const partitions = await initializeRun13Partitions(tempDir);
  wireRun13CommitApplication(rafts, partitions, dropAppliedNodeId);
  try {
    rafts.get(ACCEPTING_NODE_ID).promote();
    await driveNetwork(net, {untilMs: 200, stepMs: 5});
    assert.equal(rafts.get(ACCEPTING_NODE_ID).state, LifeRaft.LEADER);

    await partitions.get(RESTARTING_NODE_ID).shutdown();
    partitions.delete(RESTARTING_NODE_ID);
    net.killNode(RESTARTING_NODE_ID);
    const receipts = await acceptRun13Writes(rafts, net);

    const restartedPartition = createRun13Partition(
      RESTARTING_NODE_ID,
      path.join(tempDir, `${RESTARTING_NODE_ID}.db`),
    );
    await restartedPartition.initialize();
    partitions.set(RESTARTING_NODE_ID, restartedPartition);
    net.startNode(RESTARTING_NODE_ID);
    await driveNetwork(net, {untilMs: net.now() + 500, stepMs: 5});
    await assertRun13RecoveryBarrier(rafts, FAILED_RUN_IDS.length);

    return {
      acknowledgedWrites: {
        tableName: 'benchmark_events',
        idColumn: 'event_id',
        ids: [...FAILED_RUN_IDS],
        receipts,
      },
      nodes: arrayMap(RUN13_NODE_IDS, (nodeId) =>
        createLocalPartitionReadNode(partitions.get(nodeId))),
      cleanup: () => cleanupRun13Resources(partitions, rafts, tempDir),
    };
  } catch (error) {
    await cleanupRun13Resources(partitions, rafts, tempDir);
    throw error;
  }
}

function buildAcknowledgedWrites({witnessed = true} = {}) {
  return {
    tableName: 'benchmark_events',
    idColumn: 'event_id',
    ids: [...FAILED_RUN_IDS],
    receipts: arrayMap(FAILED_RUN_IDS, (id, index) => {
      const operationId = `write-${index}`;
      const acknowledgedAtMs = 1785630280000 + index;
      const durableCommitWitness = witnessed ? {
        partitionId: 'benchmark_events-p1',
        leaderNodeId: ACCEPTING_NODE_ID,
        leaderReplicaId: 'benchmark_events-p1-r2',
        term: 8,
        logIndex: 412 + index,
        entryId: `entry-${index}`,
        operationId,
        idempotencyKey: operationId,
      } : null;
      return {
        id,
        gatewayNodeId: ACCEPTING_NODE_ID,
        receivedAtMs: acknowledgedAtMs,
        acceptingNodeId: ACCEPTING_NODE_ID,
        acknowledgedAtMs,
        operationId,
        idempotencyKey: operationId,
        successfulParticipantCount: 1,
        witnessedParticipantCount: witnessed ? 1 : 0,
        commitWitnessComplete: witnessed,
        missingCommitWitnessPartitions:
          witnessed ? [] : ['benchmark_events-p1'],
        durableCommitWitnesses:
          durableCommitWitness ? [durableCommitWitness] : [],
        participantReceipts: [{
          partitionId: 'benchmark_events-p1',
          acceptingNodeId: ACCEPTING_NODE_ID,
          acknowledgedAtMs,
          durableCommitWitness,
          complete: witnessed,
        }],
      };
    }),
  };
}

function createNode(nodeId, visibleIds, calls, {throws = false} = {}) {
  return {
    id: nodeId,
    isReachable: async () => true,
    query: async () => {
      calls.push(nodeId);
      if (throws) {
        throw new Error(`read authority unavailable on ${nodeId}`);
      }
      return {
        rows: arrayMap(visibleIds, (id) => ({ack_id: id})),
        readAuthorityWitnesses: [{
          state: 'observed',
          partitionId: 'benchmark_events-p1',
          servingNodeId: nodeId,
          servingReplicaId: `benchmark_events-p1-${nodeId}`,
          term: 8,
          role: 'leader',
          observedAtMs: Date.now(),
        }],
      };
    },
  };
}

async function captureVisibilityFailure(acknowledgedWrites, nodes) {
  try {
    await assertAcknowledgedWritesVisibleOnReachableNodes(
      acknowledgedWrites,
      nodes,
      FAST,
    );
  } catch (error) {
    return error;
  }
  assert.fail('expected acknowledged-write visibility verification to fail');
}

describe('rolling-restart acknowledged-write durability and visibility', () => {
  it('binds a real INSERT identity through partition, coordinator, admin, ' +
    'and acknowledged-write ledger', async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: ACCEPTING_NODE_ID},
    });
    LoggingService.getInstance().initialize({level: 'error'});
    const partition = createEndToEndPartition();
    await partition.initialize();
    partition.role = 'leader';
    partition.isLeader = true;
    const coordinator = createEndToEndCoordinator(partition);
    const gateway = {
      id: ACCEPTING_NODE_ID,
      query: async (sql) => {
        const ast = new SQLParser(sql).parse();
        const plan = coordinator.createWritePlan(ast);
        const result = await coordinator.executePlan(plan);
        return createAdminQueryResultMessageEnvelope('query-1', result);
      },
    };
    const run = new LoadGenerator([gateway], {
      opsPerSec: 20,
      duration: 80,
      operations: ['INSERT'],
      trackAcknowledgedWrites: true,
    }).start();
    try {
      await run.waitComplete();
      const acknowledgedWrites = run.getAcknowledgedWrites();
      assert.ok(acknowledgedWrites.receipts.length > 0);
      for (const receipt of acknowledgedWrites.receipts) {
        assert.equal(receipt.commitWitnessComplete, true);
        assert.equal(receipt.successfulParticipantCount, 1);
        const participant = receipt.participantReceipts[0];
        assert.equal(participant.acceptingNodeId, ACCEPTING_NODE_ID);
        assert.equal(
          participant.durableCommitWitness.operationId,
          receipt.operationId,
        );
        assert.equal(
          participant.durableCommitWitness.idempotencyKey,
          receipt.idempotencyKey,
        );
        assert.ok(participant.durableCommitWitness.entryId.length > 0);
      }
    } finally {
      run.cancel();
      await partition.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

  it('replays run13 through real Raft quorum and guarded restart catch-up',
    async () => {
      const scenario = await runRealRaftRun13();
      try {
        const visibility = await assertAcknowledgedWritesVisibleOnReachableNodes(
          scenario.acknowledgedWrites,
          scenario.nodes,
          FAST,
        );
        assert.equal(visibility.classification, 'visible_everywhere');
        assert.equal(visibility.verified, true);
        assert.equal(visibility.nodeObservations.length, RUN13_NODE_IDS.length);
        assert.equal(
          arrayFind(visibility.nodeObservations,
            (observation) => observation.nodeId === RESTARTING_NODE_ID,
          ).state,
          'visible',
        );
        assert.equal(
          visibility.receipts[0].durableCommitWitnesses[0].leaderNodeId,
          ACCEPTING_NODE_ID,
        );
      } finally {
        await scenario.cleanup();
      }
    });

  it('fails red when a committed replica stops applying the accepted entries',
    async () => {
      const scenario = await runRealRaftRun13({
        dropAppliedNodeId: FAILED_READ_NODE_ID,
      });
      try {
        const error = await captureVisibilityFailure(
          scenario.acknowledgedWrites,
          scenario.nodes,
        );
        const visibility = error.acknowledgedWriteVisibility;
        assert.equal(
          visibility.classification,
          'durable_replica_catchup_failure',
        );
        assert.deepEqual(
          arrayFind(visibility.nodeObservations,
            (observation) => observation.nodeId === FAILED_READ_NODE_ID,
          ).missingIds,
          FAILED_RUN_IDS,
        );
        assert.equal(
          arrayFind(visibility.nodeObservations,
            (observation) => observation.nodeId === RESTARTING_NODE_ID,
          ).state,
          'visible',
        );
      } finally {
        await scenario.cleanup();
      }
    });

  it('reproduces run13 and inspects every node after b01ff reports all five ' +
    'writes missing', async () => {
    const calls = [];
    const nodes = [
      createNode(FAILED_READ_NODE_ID, [], calls),
      ...arrayMap(OTHER_NODE_IDS, (nodeId) =>
        createNode(nodeId, FAILED_RUN_IDS, calls)),
    ];

    const error = await captureVisibilityFailure(
      buildAcknowledgedWrites(),
      nodes,
    );
    const visibility = error.acknowledgedWriteVisibility;

    assert.deepEqual(
      new Set(calls),
      new Set([FAILED_READ_NODE_ID, ...OTHER_NODE_IDS]),
      'the first missing-node observation must not short-circuit later nodes',
    );
    assert.equal(
      visibility.classification,
      'durable_replica_catchup_failure',
    );
    assert.equal(visibility.lossDetected, true);
    assert.equal(visibility.verified, false);
    assert.equal(
      visibility.receipts[0].acceptingNodeId,
      ACCEPTING_NODE_ID,
    );
    assert.deepEqual(
      arrayFind(visibility.nodeObservations,
        (observation) => observation.nodeId === FAILED_READ_NODE_ID,
      ).missingIds,
      FAILED_RUN_IDS,
    );
    assert.equal(
      arrayFilter(visibility.nodeObservations,
        (observation) => observation.state === 'visible',
      ).length,
      OTHER_NODE_IDS.length,
    );
  });

  it('classifies absent-everywhere writes without a witness as an ' +
    'acknowledgment-before-durability breach', async () => {
    const calls = [];
    const nodes = arrayMap(OTHER_NODE_IDS, (nodeId) =>
      createNode(nodeId, [], calls));
    const error = await captureVisibilityFailure(
      buildAcknowledgedWrites({witnessed: false}),
      nodes,
    );

    assert.equal(
      error.acknowledgedWriteVisibility.classification,
      'acknowledged_before_durable_commit',
    );
    assert.deepEqual(
      error.acknowledgedWriteVisibility.unwitnessedIds,
      FAILED_RUN_IDS,
    );
  });

  it('rejects a receipt when any successful participant lacks evidence',
    async () => {
      const acknowledgedWrites = buildAcknowledgedWrites();
      const receipt = acknowledgedWrites.receipts[0];
      receipt.successfulParticipantCount = 2;
      receipt.commitWitnessComplete = false;
      receipt.missingCommitWitnessPartitions = ['benchmark_events-p2'];
      receipt.participantReceipts.push({
        partitionId: 'benchmark_events-p2',
        acceptingNodeId: 'node-p2',
        acknowledgedAtMs: receipt.acknowledgedAtMs,
        durableCommitWitness: null,
        complete: false,
      });
      const calls = [];
      const error = await captureVisibilityFailure(
        acknowledgedWrites,
        [createNode(ACCEPTING_NODE_ID, FAILED_RUN_IDS, calls)],
      );

      assert.equal(
        error.acknowledgedWriteVisibility.classification,
        'durable_commit_witness_missing',
      );
      assert.deepEqual(
        error.acknowledgedWriteVisibility.unwitnessedIds,
        [FAILED_RUN_IDS[0]],
      );
    });

  it('prioritizes missing durability evidence over a blind read authority',
    async () => {
      const blindNode = {
        id: ACCEPTING_NODE_ID,
        isReachable: async () => true,
        query: async () => ({
          rows: arrayMap(FAILED_RUN_IDS, (id) => ({ack_id: id})),
          readAuthorityWitnesses: [],
        }),
      };
      const error = await captureVisibilityFailure(
        buildAcknowledgedWrites({witnessed: false}),
        [blindNode],
      );

      assert.equal(
        error.acknowledgedWriteVisibility.classification,
        'durable_commit_witness_missing',
      );
    });

  it('rejects a non-empty acknowledged ledger without durable receipts',
    async () => {
      const calls = [];
      const error = await captureVisibilityFailure({
        tableName: 'benchmark_events',
        idColumn: 'event_id',
        ids: [...FAILED_RUN_IDS],
      }, [createNode(ACCEPTING_NODE_ID, FAILED_RUN_IDS, calls)]);

      assert.equal(
        error.acknowledgedWriteVisibility.classification,
        'durable_commit_witness_missing',
      );
      assert.deepEqual(
        error.acknowledgedWriteVisibility.unwitnessedIds,
        FAILED_RUN_IDS,
      );
    });

  it('rejects a forged complete receipt when the acceptor is not its leader',
    async () => {
      const acknowledgedWrites = buildAcknowledgedWrites();
      acknowledgedWrites.receipts[0].participantReceipts[0].acceptingNodeId =
        FAILED_READ_NODE_ID;
      const calls = [];
      const error = await captureVisibilityFailure(
        acknowledgedWrites,
        [createNode(ACCEPTING_NODE_ID, FAILED_RUN_IDS, calls)],
      );

      assert.equal(
        error.acknowledgedWriteVisibility.classification,
        'durable_commit_witness_missing',
      );
      assert.deepEqual(
        error.acknowledgedWriteVisibility.unwitnessedIds,
        [FAILED_RUN_IDS[0]],
      );
    });

  it('rejects forged complete receipts with invalid Raft positions',
    async () => {
      const acknowledgedWrites = buildAcknowledgedWrites();
      acknowledgedWrites.receipts[0]
        .participantReceipts[0].durableCommitWitness.term = -1;
      acknowledgedWrites.receipts[1]
        .participantReceipts[0].durableCommitWitness.logIndex = 0;
      const calls = [];
      const error = await captureVisibilityFailure(
        acknowledgedWrites,
        [createNode(ACCEPTING_NODE_ID, FAILED_RUN_IDS, calls)],
      );

      assert.equal(
        error.acknowledgedWriteVisibility.classification,
        'durable_commit_witness_missing',
      );
      assert.deepEqual(
        error.acknowledgedWriteVisibility.unwitnessedIds,
        FAILED_RUN_IDS.slice(0, 2),
      );
    });

  it('rejects forged receipts with blank identities or negative acceptance time',
    async () => {
      const blankIdentityWrites = buildAcknowledgedWrites();
      const blankParticipant = blankIdentityWrites.receipts[0]
        .participantReceipts[0];
      blankParticipant.partitionId = ' ';
      blankParticipant.acceptingNodeId = ' ';
      blankParticipant.durableCommitWitness.partitionId = ' ';
      blankParticipant.durableCommitWitness.leaderNodeId = ' ';
      blankParticipant.durableCommitWitness.leaderReplicaId = ' ';
      blankParticipant.durableCommitWitness.entryId = ' ';
      const negativeTimestampWrites = buildAcknowledgedWrites();
      negativeTimestampWrites.receipts[1]
        .participantReceipts[0].acknowledgedAtMs = -1;
      const calls = [];

      for (const [acknowledgedWrites, expectedId] of [
        [blankIdentityWrites, FAILED_RUN_IDS[0]],
        [negativeTimestampWrites, FAILED_RUN_IDS[1]],
      ]) {
        const error = await captureVisibilityFailure(
          acknowledgedWrites,
          [createNode(ACCEPTING_NODE_ID, FAILED_RUN_IDS, calls)],
        );
        assert.equal(
          error.acknowledgedWriteVisibility.classification,
          'durable_commit_witness_missing',
        );
        assert.deepEqual(
          error.acknowledgedWriteVisibility.unwitnessedIds,
          [expectedId],
        );
      }
    });

  it('stays oracle blind when visible rows have malformed read authority',
    async () => {
      const malformedAuthorityNode = {
        id: ACCEPTING_NODE_ID,
        isReachable: async () => true,
        query: async () => ({
          rows: arrayMap(FAILED_RUN_IDS, (id) => ({ack_id: id})),
          readAuthorityWitnesses: [{
            state: 'observed',
            partitionId: '',
            servingNodeId: '',
            servingReplicaId: '',
            term: -1,
            observedAtMs: -1,
          }],
        }),
      };
      const error = await captureVisibilityFailure(
        buildAcknowledgedWrites(),
        [malformedAuthorityNode],
      );

      assert.equal(error.acknowledgedWriteVisibility.oracleBlind, true);
      assert.equal(
        error.acknowledgedWriteVisibility.classification,
        'read_authority_witness_missing',
      );
    });

  it('stays oracle blind for whitespace-only read authority identities',
    async () => {
      const blankAuthorityNode = {
        id: ACCEPTING_NODE_ID,
        isReachable: async () => true,
        query: async () => ({
          rows: arrayMap(FAILED_RUN_IDS, (id) => ({ack_id: id})),
          readAuthorityWitnesses: [{
            state: 'observed',
            partitionId: ' ',
            servingNodeId: ' ',
            servingReplicaId: ' ',
            term: 1,
            observedAtMs: 1,
          }],
        }),
      };
      const error = await captureVisibilityFailure(
        buildAcknowledgedWrites(),
        [blankAuthorityNode],
      );

      assert.equal(error.acknowledgedWriteVisibility.oracleBlind, true);
      assert.equal(
        error.acknowledgedWriteVisibility.classification,
        'read_authority_witness_missing',
      );
    });

  it('rejects read authority from a partition unrelated to the durable commit',
    async () => {
      const unrelatedAuthorityNode = {
        id: ACCEPTING_NODE_ID,
        isReachable: async () => true,
        query: async () => ({
          rows: arrayMap(FAILED_RUN_IDS, (id) => ({ack_id: id})),
          readAuthorityWitnesses: [{
            state: 'observed',
            partitionId: 'unrelated-p2',
            servingNodeId: ACCEPTING_NODE_ID,
            servingReplicaId: 'unrelated-p2-replica',
            term: 1,
            observedAtMs: 1,
          }],
        }),
      };
      const error = await captureVisibilityFailure(
        buildAcknowledgedWrites(),
        [unrelatedAuthorityNode],
      );

      assert.equal(error.acknowledgedWriteVisibility.oracleBlind, true);
      assert.deepEqual(
        error.acknowledgedWriteVisibility.requiredReadAuthorityPartitionIds,
        [RUN13_PARTITION_ID],
      );
      assert.equal(
        error.acknowledgedWriteVisibility.classification,
        'read_authority_witness_missing',
      );
    });

  it('distinguishes a durable but unreadable node from clean partial ' +
    'visibility', async () => {
    const calls = [];
    const nodes = [
      createNode(FAILED_READ_NODE_ID, [], calls, {throws: true}),
      createNode(ACCEPTING_NODE_ID, FAILED_RUN_IDS, calls),
    ];
    const error = await captureVisibilityFailure(
      buildAcknowledgedWrites(),
      nodes,
    );

    assert.equal(
      error.acknowledgedWriteVisibility.classification,
      'durable_read_authority_unavailable',
    );
    assert.equal(error.acknowledgedWriteVisibility.oracleBlind, true);
    assert.equal(
      arrayFind(error.acknowledgedWriteVisibility.nodeObservations,
        (observation) => observation.nodeId === FAILED_READ_NODE_ID,
      ).state,
      'unreadable',
    );
  });

  it('retains retry errors after a clean missing read and stays oracle blind',
    async () => {
      let queryCount = 0;
      const unstableNode = {
        id: FAILED_READ_NODE_ID,
        isReachable: async () => true,
        query: async () => {
          queryCount++;
          if (queryCount > 1) {
            throw new Error('route authority retryable');
          }
          return {
            rows: [],
            readAuthorityWitnesses: [{
              state: 'observed',
              partitionId: 'benchmark_events-p1',
              servingNodeId: FAILED_READ_NODE_ID,
              servingReplicaId: 'benchmark_events-p1-b01ff',
              term: 8,
              role: 'follower',
              observedAtMs: Date.now(),
            }],
          };
        },
      };
      const error = await captureVisibilityFailure(
        buildAcknowledgedWrites(),
        [unstableNode],
      );
      const observation = error.acknowledgedWriteVisibility.nodeObservations[0];

      assert.equal(observation.state, 'unreadable');
      assert.match(observation.queryError, /route authority retryable/);
      assert.equal(observation.missingIds.length, FAILED_RUN_IDS.length);
      assert.equal(observation.attempts[0].state, 'missing');
      assert.equal(observation.attempts.at(-1).state, 'unreadable');
      assert.equal(error.acknowledgedWriteVisibility.oracleBlind, true);
    });
});
