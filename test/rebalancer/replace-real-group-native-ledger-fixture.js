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
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
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

// The canonical ledger route as production publishes it: PARTITIONS names the
// leader node and the leader's own registration row (raft_role follower, like
// every partition SERVICES row) is its endpoint.
function ledgerRouteRows(ledger) {
  return {partitions: [{partition_id: ledger.leader.partitionId,
    leader_node_id: ledger.leader.nodeId}], services: [{...ledger.endpoint}]};
}

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
      observation.effects.push({
        operationId: payload.operationId, replicaId: payload.replicaId,
        liveCompetitors: observation.readLiveCompetitors(world.partitionId, payload.operationId),
      });
    }
    return original.deliver(address, payload, options);
  };
  coordinator.syncOwnerDependencies({messageRouter: routed});
  const route = ledgerRouteRows(ledger);
  for (const table of ['partitions', 'services']) {
    for (const row of route[table]) coordinator.systemTableCache.upsert(table, row);
  }
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
  const isCopy = historicalType === OperationType.ADD;
  const sourceNode = isCopy ? NODE.SOURCE : NODE.PEER_C;
  const targetNode = isCopy ? NODE.PEER_B : NODE.PEER_C;
  const requests = [];
  const repairAnswers = [];
  const holder = createTestCoordinator({nodeId: sourceNode,
    controlPlaneSystemTableGateway: ledger.gateway,
    cacheData: ledgerRouteRows(ledger),
    replaceWitness: false, committedMembershipFixture: false,
    messageRouter: {async deliver(_address, payload) {
      const answer = await send(ledger.leader, payload);
      requests.push({type: payload.type, reason: answer.reason ?? answer.placementResult?.reason,
        state: answer.state, failureCode: answer.failureCode});
      if (payload.type === 'PLACEMENT_REPAIR') repairAnswers.push({payload, answer});
      return buildDeliveryEnvelope({acknowledged: true}, answer);
    }},
  });
  const operation = createOperationAt({operationId: HISTORICAL_ID, type: historicalType,
    partitionId: PARTITION_ID, replicaId: `${PARTITION_ID}-r3`, sourceNodeId: sourceNode,
    targetNodeId: targetNode, membershipPublicationEpoch: 7,
    ...(isCopy ?
      {targetNodeBootIncarnation: 1, targetNodeStorageIncarnation: 1} : {})},
  Date.now() + clockOffsetMs);
  if (isCopy) operation.copySourceNodeId = sourceNode;
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
  return {holder, retained, historicalRow, requests, repairAnswers};
}

function effectViolations(observation) {
  return observation.effects.flatMap(({operationId, replicaId, liveCompetitors}) =>
    liveCompetitors.map(({operation_id: liveCompetitor}) =>
      ({kind: EFFECT_WHILE_LIVE, operationId, replicaId, liveCompetitor})));
}

async function withNativeLedgerReplace(measure, {
  historicalType = OperationType.REMOVE, clockOffsetMs = 0,
} = {}) {
  await withRepairLedger(async (ledger) => {
    const historical = await seedMissingHistoricalOwner(ledger, historicalType, clockOffsetMs);
    const reader = new Database(ledger.leader.db.name, {readonly: true});
    const statement = reader.prepare('SELECT * FROM replica_operations WHERE operation_id = ?');
    const live = reader.prepare(`SELECT operation_id FROM replica_operations
      WHERE entity_type = 'partition' AND entity_id = ? AND operation_id <> ?
        AND completed_at IS NULL ORDER BY operation_id`);
    const observation = {effects: [], unavailable: false, refusedReads: 0,
      readCommitted: (id) => statement.get(id),
      readPlacementOutcome: (command) => readCommittedStatementOutcome(
        {db: reader}, ledger.leader.getCommittedEntryKey(command)),
      readLiveCompetitors: (entityId, incumbentId) => live.all(entityId, incumbentId)};
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
