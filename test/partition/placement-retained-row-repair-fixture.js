// Real file-backed ledger and committed apply/CDC/outcome path. Consensus
// transport is controlled; callers can compose this with a real user group.
import assert from 'node:assert/strict';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {isTerminalStep, WORKFLOW_STEP_TO_STATUS, ReplicaStatus} from
  '../../src/rebalancer/replica-operation-progress.js';
import fs from 'node:fs';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {createReplicaPlacementOwner} from '../../src/rebalancer/replica-placement-owner.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {installCommittedOperationMutationFixture} from '../rebalancer/operation-outcome-fixture.js';
import {createMockControlPlaneSystemTableGateway, createTestCoordinator} from
  '../rebalancer/test-helpers.js';
import {applyCommitted, temporaryDbPath} from '../test-helpers/participant-transaction-fixture.js';
import {NODE, commitLedgerStatement, onLedgerLeader} from './placement-admission-fixture.js';
const DEFAULT_PARTITION_ID = 'retained-repair-p1';
const planner = new ControlPlaneSystemTableGateway();

async function withRepairLedger(measure, {partitionId = DEFAULT_PARTITION_ID,
  nodeId = NODE.A, replicaId, serviceNodeId, partitionRows, releaseAdmission} = {}) {
  const temporary = temporaryDbPath();
  try {
    await onLedgerLeader(async (leader, proposed) => {
      let mutationId = 0;
      const sqlEngine = {async executeQuery(sql, params = []) {
        const statement = leader.db.prepare(sql);
        assert.equal(statement.reader, true, 'only native committed apply mutates');
        return {success: true, rows: statement.all(...params), rowSetComplete: true,
          readAuthorityWitness: leader.buildRemoteReadAuthorityWitness(false)};
      }};
      const gateway = createMockControlPlaneSystemTableGateway(sqlEngine);
      gateway.submitMutation = async (mutation) => {
        const {sql, params} = planner.buildSqlMutationPlan(mutation);
        const entryId = `retained:${leader.replicaId}:sql:${++mutationId}`;
        assert.equal(commitLedgerStatement(leader, entryId, sql, params), null);
        const result = readCommittedStatementOutcome(leader, `entry:${entryId}`);
        return {success: true, partitionResult: {affectedRows: result.changes}};
      };
      installCommittedOperationMutationFixture(gateway);
      const coordinator = createTestCoordinator({nodeId,
        sqlQueryEngine: sqlEngine, controlPlaneSystemTableGateway: gateway});
      coordinator.registerLedgerPartitionService(leader);
      const commands = [];
      leader.controllablePort.setProposeHandler(async (entry) => {
        proposed.push({...entry});
        commands.push(entry);
        queueMicrotask(() => assert.equal(applyCommitted(leader, entry), null));
      });
      const world = {leader, coordinator, gateway, commands, partitionId, partitionRows};
      attachCurrentCopyOwner(world);
      try {
        await measure(world);
      } finally {
        world.placementOwner?.shutdown();
        leader.setRebalancerLeadershipSink(null);
        await coordinator.shutdown();
      }
    }, {dbPath: temporary.dbPath, replicaId, nodeId: serviceNodeId, releaseAdmission});
  } finally {
    fs.rmSync(temporary.directory, {recursive: true, force: true});
  }
}


function attachCurrentCopyOwner(world) {
  world.placementOwner?.shutdown();
  const now = Date.now();
  const partitionId = world.partitionId;
  const cache = {
    get(table, nodeId) {
      return table === 'nodes' ? {node_id: nodeId, boot_incarnation: 1, storage_incarnation: 1} : null;
    },
    getAll(table) {
      if (table === 'partitions') {
        return world.partitionRows ?? [{partition_id: partitionId, status: 'active',
          replica_count: 3, leader_node_id: NODE.A}];
      }
      if (table === 'services') {
        return [{replica_id: `${partitionId}-source`,
          partition_id: partitionId, node_id: NODE.A, status: 'active', raft_role: 'leader'}];
      }
      return [];
    },
    onCacheApplyChange() {}, offCacheApplyChange() {},
  };
  const owner = createReplicaPlacementOwner({nodeId: world.coordinator.nodeId,
    ledgerPartitionService: world.leader, systemTableCache: cache,
    workflowOwner: world.coordinator.workflowOwner,
    nodeAuthority: {
      answerCommittedNodes: () => ({state: 'ready', epoch: {publicationEpoch: 7},
        formation: {state: 'FORMED', latchEpoch: 7},
        nodeRows: [NODE.A, NODE.B, NODE.C].map((node, index) => ({node_id: node,
          host_id: `host-${index}`, status: 'active', boot_incarnation: 1,
          ready_lease_expires_at: now + 60_000}))}),
      subscribe: () => () => {}, scheduleRefresh() {},
    }, now: () => now, logger: world.leader.logger});
  world.leader.setRebalancerLeadershipSink(owner);
  // Pause ordinary planning while measuring the supported pure preparation
  // path. This does not replace its real node/deficit/classification algorithm.
  owner.setLeader(false);
  world.placementOwner = owner;
}


async function stepRetainedLedgerRow(world, operationId, step) {
  const raw = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
    .get(operationId);
  assert.ok(raw, 'the actual committed blocker exists before transition');
  const operation = world.coordinator.repository.rowToOperation(raw);
  const now = Math.max(Date.now(), operation.updatedAt + 1);
  const terminal = isTerminalStep(operation.type, step);
  const next = {...operation, workflowStep: step, status: step === WORKFLOW_STEP.FAILED ?
    ReplicaStatus.FAILED : WORKFLOW_STEP_TO_STATUS[step],
  updatedAt: now, completedAt: terminal ? now : null,
  stepsHistory: [...operation.stepsHistory, {step, timestamp: now}]};
  const answer = await world.coordinator.repository.persistOperationUpdate(next,
    {expectedWorkflowStep: operation.workflowStep, expectedStepsHistory: operation.stepsHistory});
  assert.equal(answer.persisted, true, 'normal guarded mutation commits the complete transition tuple');
  return world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?').get(operationId);
}

export {withRepairLedger, attachCurrentCopyOwner, stepRetainedLedgerRow};
