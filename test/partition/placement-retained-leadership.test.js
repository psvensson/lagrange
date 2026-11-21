import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {stepRetainedLedgerRow} from './placement-retained-row-repair-fixture.js';
import {withRetainedLeadershipPair} from './placement-retained-leadership-fixture.js';
import {createOperationAt, OperationType} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {raiseParticipantCutoverPause} from '../../src/partition/partition-participant-transaction-pause.js';
import {clearFixtureSingletons, resetFixtureSingletons, resumeFixtureParticipantAdmission,
  settleTicks} from '../test-helpers/participant-transaction-fixture.js';
import {NODE, placementStatement} from './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);
const PARTITION_ID = 'retained-transfer-p1';

async function retainMissing(a) {
  const operation = createOperationAt({operationId: 'retained-transfer-remove',
    type: OperationType.REMOVE, partitionId: PARTITION_ID, replicaId: `${PARTITION_ID}-r1`,
    sourceNodeId: NODE.A, targetNodeId: NODE.A, membershipPublicationEpoch: 7}, Date.now());
  operation.entityType = 'partition';
  operation.entityId = PARTITION_ID;
  await a.coordinator.repository.persistNewOperation(operation);
  const retained = await a.coordinator.getOperation(operation.operationId);
  await a.gateway.submitMutation({tableName: 'replica_operations', operation: 'delete',
    whereClause: {operation_id: operation.operationId}});
  return retained;
}

async function idle(...nodes) {
  await settleTicks();
  for (const node of nodes) await node.coordinator.repository.retainedPlacementRepairDrain;
  await settleTicks();
}

test('A-origin BUSY repairs route to B and clear on the incumbent native terminal commit on B', () =>
  withRetainedLeadershipPair(async ({a, b, messages, elect}) => {
    const retained = await retainMissing(a);
    const competitor = await requestPlacementAdmission(a.leader,
      {entryId: 'transfer-incumbent', body: placementStatement({partitionId: PARTITION_ID,
        type: OperationType.REMOVE, target: NODE.C, replicaId: `${PARTITION_ID}-r2`,
        voterRetirement: {nodeBootIncarnation: 1, replicaCreatedAt: 1}})});
    assert.equal(competitor.placementResult.outcome, 'ADMITTED');
    assert.equal(await a.coordinator.repository.repairRetainedOperation(retained), false);
    await elect(b);
    await idle(a, b);
    assert.ok(messages.some((message) => message.from === a && message.to === b &&
      message.payload.type === 'PLACEMENT_REPAIR'), 'A used current B route instead of saved A closure');
    assert.equal(b.coordinator.repository.retainedPlacementRepairs.size, 1);
    await stepRetainedLedgerRow(b, competitor.placementResult.operationIds[0],
      WORKFLOW_STEP.FAILED);
    await idle(a, b);
    assert.ok(b.leader.db.prepare('SELECT operation_id FROM replica_operations WHERE operation_id = ?')
      .get(retained.operationId), 'B actual commit clears and restores without another resync');
    assert.equal(b.coordinator.repository.retainedPlacementRepairs.size, 0);
  }));

test('paused pinned A request survives B custody and genuine A recovery unchanged', () =>
  withRetainedLeadershipPair(async ({a, b, messages, elect}) => {
    const retained = await retainMissing(a);
    raiseParticipantCutoverPause(a.leader);
    assert.equal(await a.coordinator.repository.repairRetainedOperation(retained), false);
    const original = a.coordinator.repository.retainedPlacementRepairs.get(retained.operationId);
    const entryId = original.entryId;
    const bodyText = JSON.stringify(original.body);
    await elect(b, {resume: false});
    await idle(a, b);
    const bAttempt = b.coordinator.repository.retainedPlacementRepairs.get(retained.operationId);
    assert.equal(bAttempt.entryId, entryId);
    assert.equal(JSON.stringify(bAttempt.body), bodyText);
    await elect(a, {resume: false});
    await idle(a, b);
    const before = a.commands.length + b.commands.length;
    await resumeFixtureParticipantAdmission(a.leader);
    await idle(a, b);
    const restores = [...a.commands, ...b.commands].filter((command) =>
      command.type === 'PLACEMENT_REPAIR' && command.body.operation.operationId === retained.operationId);
    assert.equal(restores.length, 1);
    assert.equal(restores[0].entryId, entryId);
    assert.equal(JSON.stringify(restores[0].body), bodyText);
    assert.ok(a.commands.length + b.commands.length > before);
    assert.ok(messages.some((message) => message.to === b));
    assert.equal(a.coordinator.repository.retainedPlacementRepairs.size, 0);
  }));


test('a lost committed reply retires from the visible winner without another native proposal', () =>
  withRetainedLeadershipPair(async ({a, b, messages, elect}) => {
    const retained = await retainMissing(a);
    const repository = a.coordinator.repository;
    const submit = repository.repairRetainedPlacement;
    let answers = 0;
    repository.repairRetainedPlacement = async (payload) => {
      const answer = await submit(payload);
      answers += 1;
      if (answers <= 2) throw new Error('lost after actual committed native answer');
      return answer;
    };
    assert.equal(await repository.repairRetainedOperation(retained), false);
    const original = repository.retainedPlacementRepairs.get(retained.operationId);
    const entryId = original.entryId;
    const bodyText = JSON.stringify(original.body);
    assert.ok(a.leader.db.prepare('SELECT operation_id FROM replica_operations WHERE operation_id = ?')
      .get(retained.operationId), 'the first reply loss followed an actual commit');
    await elect(b);
    await idle(a, b);
    assert.equal(repository.retainedPlacementRepairs.size, 0,
      'the actual row is visible on both appliers; no unknown write remains');
    assert.equal(messages.filter((message) => message.payload.type === 'PLACEMENT_REPAIR').length, 0);
    await elect(a);
    await idle(a, b);
    assert.equal(repository.retainedPlacementRepairs.size, 0);
    const restores = [...a.commands, ...b.commands].filter((command) =>
      command.type === 'PLACEMENT_REPAIR' && command.body.operation.operationId === retained.operationId);
    assert.equal(restores.length, 1, 'both recovery turns read the original settled native outcome');
    assert.equal(restores[0].entryId, entryId);
    assert.equal(JSON.stringify(restores[0].body), bodyText);
    assert.equal(answers, 1, 'authoritative visible-winner confirmation requires no redundant send');
  }));


test('genuinely uncommitted pinned A request routes A-B-A without changing identity or proposing early', () =>
  withRetainedLeadershipPair(async ({a, b, messages, elect}) => {
    const retained = await retainMissing(a);
    raiseParticipantCutoverPause(a.leader);
    const repository = a.coordinator.repository;
    assert.equal(await repository.repairRetainedOperation(retained), false);
    const original = repository.retainedPlacementRepairs.get(retained.operationId);
    const entryId = original.entryId;
    const bodyText = JSON.stringify(original.body);
    await elect(b, {resume: false});
    await idle(a, b);
    assert.ok(messages.some((message) => message.from === a && message.to === b &&
      message.payload.entryId === entryId));
    assert.equal(a.commands.length + b.commands.length, 0);
    await elect(a, {resume: false});
    await idle(a, b);
    assert.equal(repository.retainedPlacementRepairs.get(retained.operationId).entryId, entryId);
    assert.equal(JSON.stringify(repository.retainedPlacementRepairs.get(retained.operationId).body),
      bodyText);
    assert.equal(a.commands.length + b.commands.length, 0);
    await resumeFixtureParticipantAdmission(a.leader);
    await idle(a, b);
    const restores = [...a.commands, ...b.commands].filter((command) =>
      command.type === 'PLACEMENT_REPAIR');
    assert.equal(restores.length, 1);
    assert.equal(restores[0].entryId, entryId);
    assert.equal(JSON.stringify(restores[0].body), bodyText);
    assert.equal(repository.retainedPlacementRepairs.size, 0);
  }));
