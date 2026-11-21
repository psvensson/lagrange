import {installCommittedOperationMutationFixture} from './operation-outcome-fixture.js';
// The existing real rs-raft user-group world with a file-backed operation
// ledger. Only ledger consensus transport and CDC delivery are controlled.
// Every ledger write uses PartitionService committed apply; the user group,
// membership reads, handoff and REMOVE effect remain the existing real owners.
import assert from 'node:assert/strict';
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
const HISTORICAL_ID = 'native-s11-historical-remove';

function routeLedgerMessages(coordinator, ledger) {
  const original = coordinator.messageRouter;
  const routed = Object.create(original);
  routed.deliver = async (address, payload, options) => {
    if (payload.type === 'PLACEMENT_REPAIR' || payload.type === 'PLACEMENT_REPAIR_PREPARE') {
      return buildDeliveryEnvelope({acknowledged: true}, await send(ledger.leader, payload));
    }
    return original.deliver(address, payload, options);
  };
  coordinator.syncOwnerDependencies({messageRouter: routed});
  coordinator.systemTableCache.upsert('services', {service_id: ledger.leader.replicaId,
    replica_id: ledger.leader.replicaId, node_id: ledger.leader.nodeId,
    partition_id: 'replica_operations-p1', status: 'active', raft_role: 'leader'});
}

function ledgerGatewayForWorld(world, ledger) {
  const original = world.coordinator.controlPlaneSystemTableGateway;
  const gateway = Object.create(original);
  for (const method of ['readAuthoritativeRows', 'readRows']) {
    gateway[method] = (tableName, ...args) => tableName === 'replica_operations' ?
      ledger.gateway[method](tableName, ...args) : original[method](tableName, ...args);
  }
  gateway.executeQuery = (sql, ...args) => /\breplica_operations\b/i.test(sql) ?
    ledger.gateway.executeQuery(sql, ...args) : original.executeQuery(sql, ...args);
  gateway.submitMutation = async (mutation, ...args) => {
    if (mutation.tableName !== 'replica_operations') return original.submitMutation(mutation, ...args);
    const answer = await ledger.gateway.submitMutation(mutation, ...args);
    // Explicit delivery of the incumbent's real committed row. The historical
    // owner's insert CDC remains withheld, as the fault sequence requires.
    const row = ledger.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
      .get(world.operation.operationId);
    if (row) world.cache.upsert('replica_operations', row);
    return answer;
  };
  installCommittedOperationMutationFixture(gateway);
  return gateway;
}

async function seedMissingHistoricalOwner(ledger) {
  const holder = createTestCoordinator({nodeId: NODE.PEER_C,
    controlPlaneSystemTableGateway: ledger.gateway,
    cacheData: {services: [{replica_id: ledger.leader.replicaId, node_id: ledger.leader.nodeId,
      partition_id: 'replica_operations-p1', status: 'active', raft_role: 'leader'}]},
    replaceWitness: false, committedMembershipFixture: false,
    messageRouter: {async deliver(_address, payload) {
      return buildDeliveryEnvelope({acknowledged: true}, await send(ledger.leader, payload));
    }},
  });
  const operation = createOperationAt({operationId: HISTORICAL_ID, type: OperationType.REMOVE,
    partitionId: PARTITION_ID, replicaId: `${PARTITION_ID}-r3`, sourceNodeId: NODE.PEER_C,
    targetNodeId: NODE.PEER_C, membershipPublicationEpoch: 7}, Date.now());
  operation.entityType = 'partition';
  operation.entityId = PARTITION_ID;
  await holder.repository.persistNewOperation(operation);
  const retained = await holder.getOperation(HISTORICAL_ID);
  assert.ok(retained && holder.repository.isOperationLocallyOwned(retained));
  const removed = await ledger.gateway.submitMutation({tableName: 'replica_operations',
    operation: 'delete', whereClause: {operation_id: HISTORICAL_ID}});
  assert.equal(removed.partitionResult.affectedRows, 1);
  return {holder, retained};
}

async function withNativeLedgerReplace(measure) {
  await withRepairLedger(async (ledger) => {
    const historical = await seedMissingHistoricalOwner(ledger);
    let world;
    try {
      const answer = await requestPlacementAdmission(ledger.leader, {
        entryId: 'native-s11-normal-replace', body: placementStatement({partitionId: PARTITION_ID,
          type: OperationType.REPLACE, target: NODE.TARGET, source: NODE.SOURCE,
          sourceReplicaId: `${PARTITION_ID}-r1`, placementClass: classifyPlacementClass(PARTITION_ID)})});
      assert.equal(answer.placementResult.outcome, 'ADMITTED');
      const admitted = ledger.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(answer.placementResult.operationIds[0]);
      world = await openReplaceWorld({partitionId: PARTITION_ID,
        targetReplicaId: admitted.replica_id,
        async initializeOperation(candidate) {
          const gateway = ledgerGatewayForWorld(candidate, ledger);
          candidate.coordinator.syncOwnerDependencies({controlPlaneSystemTableGateway: gateway});
          routeLedgerMessages(candidate.coordinator, ledger);
          candidate.operation = candidate.coordinator.repository.rowToOperation(admitted);
          // The real group admitted this exact target. As in the existing
          // fixture, publish observed ACTIVE; no physical CREATE is invented.
          const now = Date.now();
          const active = {...candidate.operation, workflowStep: WORKFLOW_STEP.ACTIVE,
            status: ReplicaStatus.ACTIVE, updatedAt: now,
            stepsHistory: [...candidate.operation.stepsHistory,
              {step: WORKFLOW_STEP.ACTIVE, timestamp: now}]};
          const repo = candidate.coordinator.repository;
          const observed = [];
          for (const method of ['shouldRejectExpectedWorkflowStepMutation',
            'executeReplicaOperationGatewayMutationWithRetry', 'resolveZeroChangeOperationUpdate',
            'confirmPersistedOperationUpdate']) {
            const original = repo[method].bind(repo);
            repo[method] = async (...args) => {
              const result = await original(...args);
              observed.push({method, result});
              return result;
            };
          }
          const persisted = await candidate.coordinator.repository.persistOperationUpdate(active,
            {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
          assert.equal(persisted.persisted, true, JSON.stringify({admitted, active, persisted,
            observed, actual: ledger.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?').get(active.operationId)}));
          candidate.operation = persisted.operation;
        }});
      await settleTurns();
      await measure({world, ledger, ...historical});
    } finally {
      await historical.holder.shutdown();
      if (world) await disposeWorld(world);
    }
  }, {partitionId: PARTITION_ID});
}

export {withNativeLedgerReplace, HISTORICAL_ID};
