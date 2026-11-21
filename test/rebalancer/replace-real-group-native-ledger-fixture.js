import {installCommittedOperationMutationFixture} from './operation-outcome-fixture.js';
// The existing real rs-raft user-group world with a file-backed operation
// ledger. Only ledger consensus transport and CDC delivery are controlled.
// Every ledger write uses PartitionService committed apply; the user group,
// membership reads, handoff and REMOVE effect remain the existing real owners.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {ReplicaOperationMessageType} from '../../src/rebalancer/replica-operation-constants.js';
import {withRepairLedger} from '../partition/placement-retained-row-repair-fixture.js';
import {placementStatement} from '../partition/placement-admission-fixture.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {classifyPlacementClass} from '../../src/rebalancer/replica-placement-owner-order.js';
import {createOperationAt, OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createTestCoordinator} from './test-helpers.js';
import {send} from '../test-helpers/participant-transaction-fixture.js';
import {openReplaceWorld, disposeWorld, NODE, settleTurns} from './replace-real-group-harness.js';

const PARTITION_ID = 'sql_transactions-p1';
const HISTORICAL_ID = 'native-s11-historical-holder';
const LEDGER = 'replica_operations';
const EFFECT_WHILE_LIVE = 'remove_with_live_committed_competitor';

function routeLedgerMessages(world, ledger, observation) {
  const {coordinator} = world;
  const original = coordinator.messageRouter;
  const routed = Object.create(original);
  routed.deliver = async (address, payload, options) => {
    if (payload.type === 'PLACEMENT_REPAIR' || payload.type === 'PLACEMENT_REPAIR_PREPARE') {
      return buildDeliveryEnvelope({acknowledged: true}, await send(ledger.leader, payload));
    }
    if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA &&
        payload.operationId === world.operation.operationId) {
      const holder = observation.readCommitted(HISTORICAL_ID);
      observation.effects.push({operationId: payload.operationId, replicaId: payload.replicaId,
        liveCompetitor: holder?.completed_at === null ? holder.operation_id : null});
    }
    return original.deliver(address, payload, options);
  };
  coordinator.syncOwnerDependencies({messageRouter: routed});
  coordinator.systemTableCache.upsert('services', {service_id: ledger.leader.replicaId,
    replica_id: ledger.leader.replicaId, node_id: ledger.leader.nodeId,
    partition_id: 'replica_operations-p1', status: 'active', raft_role: 'leader'});
}

function ledgerGatewayForWorld(world, ledger, original, incumbentId, observation) {
  const gateway = Object.create(original);
  const readLedger = (read, sql, args) => {
    if (observation.unavailable && /WHERE entity_type = \? AND entity_id = \?/i.test(sql)) {
      observation.refusedReads += 1;
      return {success: false, error: 'S11 ledger read withheld', rowSetComplete: false};
    }
    return read(sql, ...args);
  };
  for (const method of ['readAuthoritativeRows', 'readRows']) {
    gateway[method] = (tableName, sql, ...args) => tableName === LEDGER ?
      readLedger(ledger.gateway[method].bind(ledger.gateway, tableName), sql, args) :
      original[method](tableName, sql, ...args);
  }
  gateway.executeQuery = (sql, ...args) => /\breplica_operations\b/i.test(sql) ?
    readLedger(ledger.gateway.executeQuery.bind(ledger.gateway), sql, args) :
    original.executeQuery(sql, ...args);
  gateway.submitMutation = async (mutation, ...args) => {
    if (mutation.tableName !== 'replica_operations') return original.submitMutation(mutation, ...args);
    const answer = await ledger.gateway.submitMutation(mutation, ...args);
    // Explicit delivery of the incumbent's real committed row. The historical
    // owner's insert CDC remains withheld, as the fault sequence requires.
    const row = ledger.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
      .get(incumbentId);
    if (row) world.cache.upsert('replica_operations', row);
    return answer;
  };
  installCommittedOperationMutationFixture(gateway);
  return gateway;
}

async function seedMissingHistoricalOwner(ledger, historicalType, clockOffsetMs) {
  const holder = createTestCoordinator({nodeId: NODE.PEER_C,
    controlPlaneSystemTableGateway: ledger.gateway,
    cacheData: {services: [{replica_id: ledger.leader.replicaId, node_id: ledger.leader.nodeId,
      partition_id: 'replica_operations-p1', status: 'active', raft_role: 'leader'}]},
    replaceWitness: false, committedMembershipFixture: false,
    messageRouter: {async deliver(_address, payload) {
      return buildDeliveryEnvelope({acknowledged: true}, await send(ledger.leader, payload));
    }},
  });
  const operation = createOperationAt({operationId: HISTORICAL_ID, type: historicalType,
    partitionId: PARTITION_ID, replicaId: `${PARTITION_ID}-r3`, sourceNodeId: NODE.PEER_C,
    targetNodeId: NODE.PEER_C, membershipPublicationEpoch: 7,
    ...(historicalType === OperationType.ADD ?
      {targetNodeBootIncarnation: 1, targetNodeStorageIncarnation: 1} : {})},
  Date.now() + clockOffsetMs);
  if (historicalType === OperationType.ADD) operation.copySourceNodeId = NODE.SOURCE;
  operation.entityType = 'partition';
  operation.entityId = PARTITION_ID;
  await holder.repository.persistNewOperation(operation);
  const retained = await holder.getOperation(HISTORICAL_ID);
  assert.ok(retained && holder.repository.isOperationLocallyOwned(retained));
  const historicalRow = ledger.leader.db.prepare(
    'SELECT * FROM replica_operations WHERE operation_id = ?').get(HISTORICAL_ID);
  assert.equal(historicalRow.workflow_step, WORKFLOW_STEP.PENDING);
  const removed = await ledger.gateway.submitMutation({tableName: 'replica_operations',
    operation: 'delete', whereClause: {operation_id: HISTORICAL_ID}});
  assert.equal(removed.partitionResult.affectedRows, 1);
  return {holder, retained, historicalRow};
}

function effectViolations(observation) {
  return observation.effects.filter((effect) => effect.liveCompetitor !== null)
    .map((effect) => ({kind: EFFECT_WHILE_LIVE, ...effect}));
}

async function withNativeLedgerReplace(measure, {
  historicalType = OperationType.REMOVE, clockOffsetMs = 0,
} = {}) {
  await withRepairLedger(async (ledger) => {
    const historical = await seedMissingHistoricalOwner(ledger, historicalType, clockOffsetMs);
    const reader = new Database(ledger.leader.db.name, {readonly: true});
    const statement = reader.prepare('SELECT * FROM replica_operations WHERE operation_id = ?');
    const observation = {effects: [], unavailable: false, refusedReads: 0,
      readCommitted: (id) => statement.get(id)};
    let world;
    try {
      const answer = await requestPlacementAdmission(ledger.leader, {
        entryId: 'native-s11-normal-replace', body: placementStatement({partitionId: PARTITION_ID,
          type: OperationType.REPLACE, target: NODE.TARGET, source: NODE.SOURCE,
          sourceReplicaId: `${PARTITION_ID}-r1`, placementClass: classifyPlacementClass(PARTITION_ID)})});
      assert.equal(answer.placementResult.outcome, 'ADMITTED');
      const admitted = ledger.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(answer.placementResult.operationIds[0]);
      let nativeGateway;
      world = await openReplaceWorld({partitionId: PARTITION_ID,
        targetReplicaId: admitted.replica_id,
        controlPlaneSystemTableGatewayFactory(original, candidate) {
          nativeGateway = ledgerGatewayForWorld(
            candidate, ledger, original, admitted.operation_id, observation);
          return nativeGateway;
        },
        async initializeOperation(candidate) {
          assert.equal(candidate.coordinator.controlPlaneSystemTableGateway, nativeGateway);
          assert.equal(candidate.coordinator.repository.controlPlaneSystemTableGateway,
            nativeGateway,
            'the construction-only repository owner is the actual routed ledger gateway');
          routeLedgerMessages(candidate, ledger, observation);
          candidate.operation = candidate.coordinator.repository.rowToOperation(admitted);
          // The real group admitted this exact target. As in the existing
          // fixture, publish observed ACTIVE; no physical CREATE is invented.
          const now = Date.now();
          const active = {...candidate.operation, workflowStep: WORKFLOW_STEP.ACTIVE,
            status: ReplicaStatus.ACTIVE, updatedAt: now,
            stepsHistory: [...candidate.operation.stepsHistory,
              {step: WORKFLOW_STEP.ACTIVE, timestamp: now}]};
          const persisted = await candidate.coordinator.repository.persistOperationUpdate(active,
            {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
          assert.equal(persisted.persisted, true);
          const actual = ledger.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
            .get(admitted.operation_id);
          assert.equal(actual.workflow_step, WORKFLOW_STEP.ACTIVE,
            'actual file-backed apply, not another fixture store, committed the ACTIVE milestone');
          candidate.operation = persisted.operation;
        }});
      await settleTurns();
      await measure({world, ledger, observation, ...historical});
    } finally {
      await historical.holder.shutdown();
      if (world) await disposeWorld(world);
      reader.close();
    }
  }, {partitionId: PARTITION_ID});
}

export {withNativeLedgerReplace, HISTORICAL_ID, effectViolations, EFFECT_WHILE_LIVE};
