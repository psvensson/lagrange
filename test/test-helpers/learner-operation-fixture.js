/** Shared canonical operation/native fixture; transport and metadata are supplied
 * test physics, not distributed SQL or physical networking. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createServiceDeliveryFixture} from './service-delivery-fixture.js';
import * as admission from '../../src/raft/raft-rs-group-membership-admission.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {NODES_SCHEMA, REPLICA_OPERATIONS_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL, generateCreateIndexSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {ReplicaStatus, OperationType} from '../../src/rebalancer/replica-status.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {PartitionNodeCluster} from '../raft/raft-rs-backend/partition-node-cluster.js';

const GROUP = 'learner-consumer';
const FOUNDERS = ['consumer-a', 'consumer-b', 'consumer-c'];
const TARGET = 'consumer-fresh';
const NODE = 'consumer-node';
const SUCCESSOR = 'consumer-successor';
const O = 'consumer-operation';
const NOW = 1000000;
const noLog = {debug() {}, info() {}, warn() {}, error() {}};

async function fixture(t, {issue = true, permitChanges = {}, nativeTimeSource = null,
  tempRoot = os.tmpdir()} = {}) {
  const cluster = new PartitionNodeCluster({partitionId: GROUP, replicaIds: FOUNDERS, tempRoot,
    substrateFor: nativeTimeSource === null ? null : () => ({timeSource: nativeTimeSource})});
  t.after(() => cluster.dispose());
  cluster.tickers = [FOUNDERS[0]];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null));
  const leader = cluster.leaderReplicaId();
  assert.ok(cluster.settle(() => FOUNDERS.every((id) =>
    BigInt(cluster.node(id).readStatus().appliedIndex) > 0n)),
  'the founding no-op must be committed and applied before the operation fixture');
  const port = cluster.node(leader);
  const status = port.readStatus();
  const dir = fs.mkdtempSync(path.join(tempRoot, 'learner-authorization-'));
  let db = new Database(path.join(dir, 'operations.sqlite'));
  t.after(() => {
    db.close(); fs.rmSync(dir, {recursive: true, force: true});
  });
  db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL');
  db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  db.exec(generateCreateTableSQL(NODES_SCHEMA));
  for (const sql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) db.exec(sql);
  const execute = (sql, params = []) => {
    const statement = db.prepare(sql);
    return statement.reader ? {success: true, rows: statement.all(...params)} :
      {success: true, affectedRows: statement.run(...params).changes};
  };
  for (const node of [NODE, SUCCESSOR]) {
    execute(`INSERT INTO nodes
      (node_id,node_address,cpu_cores,memory_mb,disk_gb,last_heartbeat,boot_incarnation,created_at)
      VALUES (?,?,?,?,?,?,?,?)`, [node, node, 2, 512, 10, NOW, 1, NOW]);
  }
  const reads = [];
  let failedTable = null;
  let beforeNodes = null;
  let beforeOperation = null;
  const gateway = {
    executeQuery: async (sql, params) => execute(sql, params),
    readAuthoritativeRows: async (table, sql, params, options) => {
      reads.push({table, sql, options});
      if (failedTable === table) return {success: false, error: 'fixture read unavailable'};
      if (table === 'nodes' && beforeNodes) await beforeNodes();
      if (table === 'replica_operations' && beforeOperation) await beforeOperation();
      return execute(sql, params);
    },
  };
  gateway.readRows = gateway.readAuthoritativeRows;
  gateway.updateSystemTableRow = async (table, where, data) => {
    assert.equal(table, 'replica_operations');
    const changed = execute(`UPDATE replica_operations SET ${Object.keys(data)
      .map((key) => `${key} = ?`).join(', ')} WHERE ${Object.keys(where)
      .map((key) => `${key} IS ?`).join(' AND ')}`, [...Object.values(data), ...Object.values(where)]);
    return {success: true, outcome: changed.affectedRows === 1 ? 'applied' : 'no_op'};
  };
  const clock = new VirtualTimeSource({startMs: NOW});
  // The service census the discovery owner reads for a hosted witness. Rows are
  // route hints the test places explicitly; nothing here is committed evidence.
  const serviceRows = [];
  const systemTableCache = {get: () => null, getAll: () => [],
    filter: (table, predicate) => table === 'services' ? serviceRows.filter(predicate) : []};
  const hostWitness = (nodeId, replicaId, status = 'active') => {
    serviceRows.push({service_id: replicaId, service_type: SERVICE_TYPE.MESSAGE_GROUP,
      group_id: GROUP, node_id: nodeId, replica_id: replicaId, status});
    return serviceRows[serviceRows.length - 1];
  };
  const repositoryFor = (nodeId) => new ReplicaOperationRepository({nodeId,
    membershipOwnerBootIncarnation: 1, timeSource: clock,
    controlPlaneSystemTableGateway: gateway, logger: noLog, systemTableCache,
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    authoritativeVisibilityTimeoutMs: 0, authoritativeVisibilityRetryDelayMs: 0});
  const repository = repositoryFor(NODE);
  const identity = JSON.stringify({operationId: O, groupId: GROUP,
    sourceReplicaId: leader, sourceNodeId: NODE, sourceCreatedAt: 30,
    sourceCreateAttemptToken: 'supplied-source-generation', targetReplicaId: TARGET,
    targetPeerId: deriveRaftRsPeerId(TARGET), targetNodeId: SUCCESSOR,
    targetAddress: cluster.addressOf(TARGET), transitionIdentity: 'consumer-transition',
    membershipLaneKey: `message-group:${GROUP}`});
  await repository.persistNewOperation({operationId: O, type: OperationType.REPLACE,
    partitionId: GROUP, entityId: GROUP, entityType: SERVICE_TYPE.MESSAGE_GROUP,
    replicaId: TARGET, sourceReplicaId: leader, sourceNodeId: NODE, targetNodeId: SUCCESSOR,
    status: ReplicaStatus.PENDING, workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: NOW, updatedAt: NOW, completedAt: null, stepsHistory: [],
    membershipPublicationEpoch: 1, messageGroupMembershipLaneKey: `message-group:${GROUP}`,
    messageGroupMembershipIdentity: identity, messageGroupMembershipPhase: 'learner_requested',
    messageGroupMembershipObligationState: 'intent_recorded',
    messageGroupMembershipOwnerClaim: null, messageGroupMembershipPermit: null,
    messageGroupLearnerStamp: null, messageGroupVoterStamp: null, messageGroupRemovalStamp: null,
    messageGroupSourceLifecycleClaim: JSON.stringify({replicaId: leader,
      createdAt: 30, stateEnteredAt: 40, createAttemptToken: 'supplied-source-generation'})});
  const claimed = await repository.claimMessageGroupMembershipOwner({
    operationId: O, identity, expectedClaim: null});
  assert.equal(claimed.outcome, 'recorded');
  const holder = JSON.parse(claimed.claim);
  const permit = JSON.stringify({version: 2, transitionIdentity: 'consumer-transition',
    permitSequence: 1, permitStage: 'add-learner', permitState: 'in_flight',
    workflowOwnerNodeId: NODE, workflowOwnerFence: `${NODE}:1:${holder.generation}`,
    membershipLeaseExpiresAt: holder.expiresAt, proposerNodeId: NODE, proposerBootIncarnation: 1,
    destinationNodeId: NODE, destinationBootIncarnation: 1,
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration, leaderTerm: status.term,
    leaderConfigurationStamp: {configurationKey: status.configurationKey,
      membershipGenerationIndex: status.membershipGenerationIndex},
    proposalIndex: null, replicaIdentity: TARGET, peerId: deriveRaftRsPeerId(TARGET),
    ...permitChanges});
  if (issue) {
    assert.equal((await repository.authorizeMessageGroupLearner({operationId: O, identity, permit}))
      .outcome, 'recorded', 'fixture must use the real initial authorization CAS');
  }
  const request = {operationId: O, identity, permit, executionClaim: claimed.claim};
  const receiver = {groupId: GROUP, nodeId: NODE, bootIncarnation: 1,
    localReplicaIdentity: leader, senderNodeId: NODE, senderBootIncarnation: 1};
  const observe = repository.observeMessageGroupLearnerAuthorization.bind(repository);
  const transport = await createServiceDeliveryFixture(t, NODE);
  let delivery = await transport.local();
  return {cluster, port, leader, repository, repositoryFor, clock, execute, reads,
    request, receiver, observe, gateway, transport, serviceRows, hostWitness,
    get db() {
      return db;
    },
    reopenOperations: () => {
      const old = db;
      db.close();
      db = new Database(path.join(dir, 'operations.sqlite'));
      db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL');
      assert.equal(old.open, false, 'old operation database must actually close');
      assert.equal(db === old, false, 'operation recovery must acquire a new connection');
      assert.equal(db.pragma('journal_mode', {simple: true}), 'wal');
      assert.equal(db.pragma('synchronous', {simple: true}), 2);
      return repositoryFor(NODE);
    },
    get delivery() {
      return delivery;
    },
    set delivery(value) {
      delivery = value;
    },
    row: () => db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?').get(O),
    failReads: (table) => {
      failedTable = table;
    },
    pauseOperation: (callback) => {
      beforeOperation = callback;
    },
    pauseNodes: (callback) => {
      beforeNodes = callback;
    },
    run: () => admission.proposeAuthorizedGroupLearner(port, receiver, request, observe, delivery),
    proposalCount: () => cluster.coreEntries.filter((entry) =>
      entry.operation === 'propose_conf_change_v2').length};
}

export {fixture, GROUP, FOUNDERS, TARGET, NODE, SUCCESSOR, O, NOW};
