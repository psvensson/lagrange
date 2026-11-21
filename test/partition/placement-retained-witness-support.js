// Shared support of the retained placement repair contract witnesses.
// Every wait is bounded in event-loop turns and every owner timer runs on a
// VirtualTimeSource: a witness fails with a message, it never waits on the
// wall clock and never hangs to the runner's timeout.
import assert from 'node:assert/strict';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {createOperationAt, OperationType} from '../../src/rebalancer/replica-status.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createTestCoordinator} from '../rebalancer/test-helpers.js';
import {send, settleTicks} from '../test-helpers/participant-transaction-fixture.js';
import {NODE, placementStatement} from './placement-admission-fixture.js';

const BOUNDED_TURNS = 40;
const CONTINUATION_TURNS = 200;
const CONTINUATION_STEP_MS = 1000;
const REPAIR_COMMAND = 'PLACEMENT_REPAIR';
const READ_FAULT = Object.freeze({THROW: 'throw'});
const ROW_SQL = 'SELECT * FROM replica_operations WHERE operation_id = ?';

// Await a production promise for a bounded number of event-loop turns.
async function bounded(promise, label) {
  const state = {settled: false, value: undefined, error: null};
  Promise.resolve(promise).then((value) => {
    state.settled = true;
    state.value = value;
  }, (error) => {
    state.settled = true;
    state.error = error;
  });
  for (let turn = 0; turn < BOUNDED_TURNS && !state.settled; turn += 1) await settleTicks();
  assert.ok(state.settled, `${label}: settles in bounded event-loop turns, without wall-clock time`);
  if (state.error) throw state.error;
  return state.value;
}

// Let every named repository's retained drain run dry, bounded.
async function idleRepairs(...repositories) {
  await settleTicks();
  for (const repository of repositories) {
    if (repository.retainedPlacementRepairDrain) {
      await bounded(repository.retainedPlacementRepairDrain, 'retained repair drain');
    }
  }
  await settleTicks();
}

// The repository's own deadlines move to a virtual clock the witness advances.
function installVirtualClock(repository) {
  const clock = new VirtualTimeSource({startMs: Date.now()});
  repository.timeSource = clock;
  return clock;
}

// Advance the owner clock one continuation step at a time until `done`.
async function advanceContinuation(clock, repositories, done, turns = CONTINUATION_TURNS) {
  let spent = 0;
  while (spent < turns && !done()) {
    clock.advance(CONTINUATION_STEP_MS);
    await idleRepairs(...repositories);
    spent += 1;
  }
  return spent;
}

// Control the retained owner's qualified (owner RPC) reads of one repository:
// count them, fail or corrupt chosen ones, hold one in flight.
function controlOwnerReads(repository) {
  const read = repository.executeReplicaOperationsRead;
  const control = {attempted: 0, inFlight: 0, maxInFlight: 0, fault: () => null, hold: null,
    restore() {
      repository.executeReplicaOperationsRead = read;
    },
    holdNext() {
      const hold = {};
      hold.arrived = new Promise((resolve) => {
        hold.arrive = resolve;
      });
      hold.released = new Promise((resolve) => {
        hold.release = resolve;
      });
      control.hold = hold;
      return hold;
    }};
  repository.executeReplicaOperationsRead = async (...args) => {
    if (args[2]?.authoritativeReadMode !== READ_MODE.OWNER_RPC_REQUIRED) {
      return read.apply(repository, args);
    }
    control.attempted += 1;
    const fault = control.fault(control.attempted);
    control.inFlight += 1;
    control.maxInFlight = Math.max(control.maxInFlight, control.inFlight);
    try {
      if (fault === READ_FAULT.THROW) throw new Error('owner read transport failure');
      const answer = await read.apply(repository, args);
      const hold = control.hold;
      if (hold) {
        control.hold = null;
        hold.arrive();
        await hold.released;
      }
      return fault === null ? answer : fault(answer);
    } finally {
      control.inFlight -= 1;
    }
  };
  return control;
}

function repairCommands(...worlds) {
  return worlds.flatMap((world) => world.commands)
    .filter((command) => command.type === REPAIR_COMMAND);
}

function ledgerRow(world, operationId) {
  return world.leader.db.prepare(ROW_SQL).get(operationId);
}

// A real producer creates the historical row; a committed delete removes it.
async function retainMissingOperation(world, {operationId, partitionId, replicaId,
  targetNodeId = NODE.B}) {
  const operation = createOperationAt({operationId, type: OperationType.REMOVE, partitionId,
    replicaId, sourceNodeId: NODE.A, targetNodeId, membershipPublicationEpoch: 7}, Date.now());
  operation.entityType = 'partition';
  operation.entityId = partitionId;
  await world.coordinator.repository.persistNewOperation(operation);
  const retained = await world.coordinator.getOperation(operation.operationId);
  assert.ok(retained, 'a real producer created the historical row');
  await world.gateway.submitMutation({tableName: 'replica_operations', operation: 'delete',
    whereClause: {operation_id: retained.operationId}});
  assert.equal(ledgerRow(world, retained.operationId), undefined);
  return retained;
}

// An ordinary admitted holder of the same entity: the retained repair is BUSY.
async function admitCompetitor(world, partitionId) {
  const answer = await requestPlacementAdmission(world.leader, {
    entryId: `competitor:${partitionId}`,
    body: placementStatement({partitionId, type: OperationType.REMOVE, target: NODE.C,
      replicaId: `${partitionId}-r2`,
      voterRetirement: {nodeBootIncarnation: 1, replicaCreatedAt: 1}})});
  assert.equal(answer.placementResult.outcome, 'ADMITTED');
  return answer.placementResult.operationIds[0];
}

// A sender with no local ledger. Its route comes from PARTITIONS leader plus
// the leader's follower-published endpoint row, admitted through a real cache.
function remoteSender(world, nodeId = NODE.A) {
  const messages = [];
  const coordinator = createTestCoordinator({nodeId,
    replaceWitness: false, committedMembershipFixture: false,
    controlPlaneSystemTableGateway: world.gateway,
    messageRouter: {async deliver(address, payload) {
      messages.push({address, payload});
      return buildDeliveryEnvelope({acknowledged: true}, await send(world.leader, payload));
    }},
  });
  const cache = new SystemTableCache();
  coordinator.syncOwnerDependencies({systemTableCache: cache});
  assert.equal(coordinator.ledgerPartitionServices.size, 0, 'the sender has no local ledger');
  // The ledger replica's own registration row, as the ledger node holds it.
  const endpoint = {...world.endpoint};
  const publish = (table, row) => {
    assert.notEqual(cache.applySystemTableChange(table, CACHE_CDC_OPERATIONS.UPSERT, row), false,
      `the sender cache admits the published ${table} row`);
  };
  publish('partitions', {partition_id: world.leader.partitionId,
    leader_node_id: world.leader.nodeId});
  publish('services', endpoint);
  assert.equal(coordinator.resolveRemoteLedgerLeader()?.replicaId, world.leader.replicaId,
    'the sender resolves the canonical ledger route');
  return {coordinator, repository: coordinator.repository, messages, cache, endpoint, publish};
}

function repairMessages(messages) {
  return messages.filter((message) => message.payload.type === REPAIR_COMMAND);
}

export {READ_FAULT, admitCompetitor, advanceContinuation, bounded, controlOwnerReads,
  idleRepairs, installVirtualClock, ledgerRow, remoteSender, repairCommands, repairMessages,
  retainMissingOperation};
