import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {bindReplaceCreateTargetReplicaId} from
  '../../src/rebalancer/operation-workflow-replace-target-binding.js';
import {OPERATION_METADATA_KEY, ReplicaStatus} from
  '../../src/rebalancer/replica-operation-progress.js';
import {
  ReplicaOperationField, ReplicaOperationMessageType, ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {mintServiceRowCreatedAt} from '../../src/node/service-row-incarnation.js';
import {LEDGER_PARTITION_ID} from '../../src/partition/partition-placement-admission-decision.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {REPAIR_AUTHORITY_REFUSAL} from '../../src/rebalancer/replica-operation-retained-repair-authority.js';
import {REPAIR_OBSERVATION} from '../../src/rebalancer/replica-operation-retained-repair-observation.js';
import {
  RETAINED_REPAIR_PORT_REFUSAL, createRetainedPlacementRepairPorts,
} from '../../src/rebalancer/replica-operation-repository-retained-placement-repair.js';
import {
  RETAINED_REPAIR_CONTINUATION, RETAINED_REPAIR_ENTRY, RETAINED_REPAIR_ORIGIN,
  RETAINED_REPAIR_RETIREMENT, RETAINED_REPAIR_VERDICT, retainedRepairRecord, unconfirmedVerdict,
} from '../../src/rebalancer/replica-operation-retained-repair-record.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  '../../src/rebalancer/operation-workflow-owner-shared.js';
import {PLACEMENT_ADMISSION_ERROR} from
  '../../src/partition/partition-placement-admission-constants.js';
import {unavailableRetainedRepairPorts} from '../test-helpers/retained-repair-ports.js';
import {committedStampFor} from '../node/replica-handler-bootstrap-stamps.js';
import {installCommittedOperationMutationFixture} from '../rebalancer/operation-outcome-fixture.js';
import {
  createCoordinatorSqlStore, createMockCache, createMockControlPlaneReadinessService,
  createMockControlPlaneSystemTableGateway, createTestCoordinator,
} from '../rebalancer/test-helpers.js';
import {
  NODE, admitOnLeader, commitLedgerStatement, ledgerRows, onLedgerLeader, placementStatement,
} from './placement-admission-fixture.js';
import {advanceContinuation, installVirtualClock} from './placement-retained-witness-support.js';

const PARTITION_ID = 'sql_transactions-p1';
const VOTER_ID = `${PARTITION_ID}-r1`;
const MEMBERSHIP = committedStampFor([VOTER_ID]);
const planner = new ControlPlaneSystemTableGateway();
// The ledger route in the cache of the coordinator (NODE.A; the ledger leader
// runs on the fixture's own node). PUBLISHED names the replica that serves the
// owner read; PREVIOUS_LEADER still names an earlier leader's node while the
// current leader serves it; UNPUBLISHED has neither half of the publication.
const LEDGER_ROUTE = Object.freeze({PUBLISHED: 'published',
  PREVIOUS_LEADER: 'previous-leader', UNPUBLISHED: 'unpublished'});
const PREVIOUS_LEDGER_REPLICA_ID = `${LEDGER_PARTITION_ID}-previous`;
const DEPOSED_LEDGER_REPLICA_ID = 'tx1-v3-r2';
// The retained owner's qualified read of its own row and known blockers.
const RETAINED_READ_PREFIX = 'SELECT * FROM replica_operations WHERE operation_id IN (';

// Production-shaped route rows: PARTITIONS owns the leader; the endpoint is a
// partition SERVICES row, published as follower like every partition row.
function ledgerRouteRows(ledgerRoute, leader) {
  if (ledgerRoute === LEDGER_ROUTE.UNPUBLISHED) return {partitions: [], services: []};
  const [nodeId, replicaId] = ledgerRoute === LEDGER_ROUTE.PUBLISHED ?
    [leader.nodeId, leader.replicaId] : [NODE.D, PREVIOUS_LEDGER_REPLICA_ID];
  const birth = mintServiceRowCreatedAt(Date.now());
  return {partitions: [{partition_id: LEDGER_PARTITION_ID, leader_node_id: nodeId}],
    services: [{service_id: replicaId, replica_id: replicaId, node_id: nodeId,
      partition_id: LEDGER_PARTITION_ID, service_type: SERVICE_TYPE.PARTITION,
      address: `${nodeId}/${SERVICE_TYPE.PARTITION}/${replicaId}`, group_id: null,
      status: SERVICE_STATUS.ACTIVE, raft_role: RAFT_ROLE.FOLLOWER, cleanup_token: null,
      create_attempt_token: null, created_at: birth, updated_at: birth}]};
}

function committedUpdate(leader, entryId, sql, params) {
  assert.equal(commitLedgerStatement(leader, entryId, sql, params), null);
  const outcome = readCommittedStatementOutcome(leader, `entry:${entryId}`);
  assert.ok(Number.isInteger(outcome.changes));
  return outcome.changes;
}

async function withPlacementExecution(measure, {duringCreate, ledgerRoute} = {}) {
  await onLedgerLeader(async (leader, proposed) => {
    const {command} = await admitOnLeader(leader, proposed, 'execution-mirror:placement',
      placementStatement({partitionId: PARTITION_ID, target: NODE.B}));
    assert.ok(command, 'the placement owner proposed the operation');
    const [initial] = ledgerRows(leader);
    assert.equal(initial.workflow_step, WORKFLOW_STEP.PENDING);
    const route = ledgerRoute === undefined ? {partitions: [], services: []} :
      ledgerRouteRows(ledgerRoute, leader);
    const cache = createMockCache({partitions: route.partitions, services: [{
      service_id: VOTER_ID, replica_id: VOTER_ID, partition_id: PARTITION_ID,
      node_id: NODE.A, address: `${NODE.A}/partition/${VOTER_ID}`,
    }, ...route.services]});
    // With a declared ledger route, a read carries the witness of the ledger
    // replica that actually served it (the leader unless a witness redirects).
    const served = {replica: leader};
    const servedBy = () => ledgerRoute === undefined ? {} :
      {readAuthorityWitness: served.replica.buildRemoteReadAuthorityWitness(false)};
    const reservations = createCoordinatorSqlStore(createMockCache());
    const sqlQueryEngine = {async executeQuery(sql, params = []) {
      if (!/\breplica_operations\b/u.test(sql)) return reservations.execute(sql, params);
      const statement = served.replica.db.prepare(sql);
      assert.equal(statement.reader, true, 'only committed apply writes this operation ledger');
      return {success: true, rowSetComplete: true, rows: statement.all(...params), ...servedBy()};
    }};
    const gateway = createMockControlPlaneSystemTableGateway(sqlQueryEngine);
    let nextMutation = 0;
    gateway.submitMutation = async (mutation) => {
      if (mutation.tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return reservations.submitMutation(mutation);
      }
      const {sql, params} = planner.buildSqlMutationPlan(mutation);
      const affectedRows = committedUpdate(leader, `execution-mirror:write:${++nextMutation}`,
        sql, params);
      return {success: true, partitionResult: {affectedRows}};
    };
    installCommittedOperationMutationFixture(gateway);
    const deliveries = [];
    const coordinator = createTestCoordinator({
      nodeId: NODE.A, systemTableCache: cache, sqlQueryEngine,
      controlPlaneSystemTableGateway: gateway,
      controlPlaneReadinessService: createMockControlPlaneReadinessService({
        defaultRepairEligible: true,
        callbacks: {
          getCurrentPublishedMembershipEpochSync: () => initial.membership_publication_epoch,
        },
      }),
    });
    const owner = coordinator.workflowOwner;
    owner.messageRouter = {
      async deliver(address, request) {
        if (request.type === ReplicaOperationMessageType.READ_COMMITTED_MEMBERSHIP) {
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: ReplicaOperationResponseStatus.COMPLETED,
            [ReplicaOperationField.MEMBERSHIP]: MEMBERSHIP,
          });
        }
        assert.equal(request.type, ReplicaOperationMessageType.CREATE_REPLICA);
        const [sending] = ledgerRows(leader);
        deliveries.push({address, request, sending});
        duringCreate?.(leader, sending);
        return buildDeliveryEnvelope({acknowledged: true},
          {status: ReplicaOperationResponseStatus.INITIATED});
      },
    };
    try {
      await measure({coordinator, owner, leader, initial, deliveries, proposed, served});
    } finally {
      try {
        await coordinator.shutdown();
      } finally {
        reservations.suspend();
      }
    }
  });
}

function assertCreateDelivery(deliveries, initial) {
  assert.equal(deliveries.length, 1);
  const [{address, request, sending}] = deliveries;
  assert.equal(address, `${NODE.B}/service/replica-handler`);
  assert.equal(request.operationId, initial.operation_id);
  assert.equal(request.replicaId, initial.replica_id);
  assert.equal(request[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH],
    initial.membership_publication_epoch);
  assert.equal(sending.workflow_step, WORKFLOW_STEP.SENDING);
  assert.deepEqual(request[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP], MEMBERSHIP);
  const admissionToken = buildReplicaCreateAdmissionToken({
    operationId: initial.operation_id, replicaId: initial.replica_id, targetNodeId: NODE.B,
    workflowUpdatedAt: sending.updated_at,
  });
  assert.equal(request[ReplicaOperationField.CREATE_ADMISSION_TOKEN], admissionToken);
  assert.equal(request[ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN],
    buildReplicaCreateAttemptToken(admissionToken, 1));
  const [first] = JSON.parse(sending.steps_history);
  assert.deepEqual(first[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP], MEMBERSHIP);
}

test('fresh placement CREATE binds its topology and advances through actual dispatch transitions',
  async () => {
    await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
      const operation = owner.repository.rowToOperation(initial);
      const result = await owner.executeOperationInternal(operation, {});
      assert.equal(result.success, true, JSON.stringify(result));
      assertCreateDelivery(deliveries, initial);
      assert.equal(ledgerRows(leader)[0].workflow_step, WORKFLOW_STEP.CREATING);
    });
  });

test('a SENDING placement CREATE re-entered by ledger CDC advances through real acknowledgement',
  async () => {
    await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
      const operation = owner.repository.rowToOperation(initial);
      const claimed = await owner.claimPendingDispatchOperation(operation);
      assert.equal(claimed?.workflowStep, WORKFLOW_STEP.SENDING, 'the real owner claimed dispatch');
      const [sending] = ledgerRows(leader);
      owner.handleObservedReplicaStateChange(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, 'UPSERT', sending);
      await owner.operationWorkflowRunExclusive(
        owner.getOperationOwnerSingleFlightKey(initial.operation_id), async () => {});
      assertCreateDelivery(deliveries, initial);
      assert.equal(ledgerRows(leader)[0].workflow_step, WORKFLOW_STEP.CREATING);
    });
  });

// The real owner claims the placement, then ledger CDC re-enters it SENDING.
async function claimAndReenter(owner, leader, initial) {
  const operation = owner.repository.rowToOperation(initial);
  const claimed = await owner.claimPendingDispatchOperation(operation);
  assert.equal(claimed?.workflowStep, WORKFLOW_STEP.SENDING, 'the real owner claimed dispatch');
  const [sending] = ledgerRows(leader);
  owner.handleObservedReplicaStateChange(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, 'UPSERT', sending);
  await owner.operationWorkflowRunExclusive(
    owner.getOperationOwnerSingleFlightKey(initial.operation_id), async () => {});
  return sending;
}

function assertOwedToRoute(owner, initial, reason) {
  const record = owner.repository.retainedPlacementRepairs.get(initial.operation_id);
  assert.ok(record, 'the retained owner keeps the obligation');
  assert.equal(record.lastDecision.reason, reason);
  assert.notEqual(record.owed & REPAIR_OBSERVATION.ROUTE, 0,
    'the next ledger route publication owns the reconsideration');
  assert.equal(record.continuation.state, RETAINED_REPAIR_CONTINUATION.IDLE,
    'no timer: the route publication is the wake');
}

// The coordinator composes the retained owner's three ports itself
// (rebalance-coordinator-lifecycle); the dispatch gate asks that owner to
// confirm the row of every storage-increasing dispatch. The bound replica's
// read confirms a present row; with no route at all, any qualified ledger read.
for (const ledgerRoute of [LEDGER_ROUTE.PUBLISHED, LEDGER_ROUTE.UNPUBLISHED]) {
  test('a present placement row dispatches its CREATE once, without delay, through the ' +
    `retained owner's confirmation (cached ledger route: ${ledgerRoute})`, async () => {
    await withPlacementExecution(async ({owner, leader, initial, deliveries, proposed}) => {
      const proposals = proposed.length;
      await claimAndReenter(owner, leader, initial);
      assertCreateDelivery(deliveries, initial);
      assert.equal(ledgerRows(leader)[0].workflow_step, WORKFLOW_STEP.CREATING);
      assert.equal(proposed.length, proposals, 'a present row needs no native repair proposal');
      assert.equal(owner.repository.retainedPlacementRepairs.size, 0,
        'the confirmed row leaves no retained obligation behind');
    }, {ledgerRoute});
  });
}

test('a read served by another replica than the cached ledger route settles nothing: the ' +
  'CREATE dispatch is withheld and owed to the route publication', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries, proposed}) => {
    const proposals = proposed.length;
    await claimAndReenter(owner, leader, initial);
    assert.equal(deliveries.length, 0, 'the serving replica or the cache is stale: no dispatch');
    assert.equal(proposed.length, proposals);
    assert.equal(ledgerRows(leader)[0].workflow_step, WORKFLOW_STEP.SENDING);
    assertOwedToRoute(owner, initial, REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_BINDING);
  }, {ledgerRoute: LEDGER_ROUTE.PREVIOUS_LEADER});
});

test('an absence served by another replica than the cached ledger route settles nothing: ' +
  'nothing is prepared or presented, the route publication owns the reconsideration', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries, proposed}) => {
    const operation = owner.repository.rowToOperation(initial);
    assert.equal(committedUpdate(leader, 'execution-mirror:absent-elsewhere',
      'DELETE FROM replica_operations WHERE operation_id = ?', [initial.operation_id]), 1);
    const proposals = proposed.length;
    assert.equal(await owner.repository.ensureRetainedOperationRow(operation), false);
    assert.equal(deliveries.length, 0);
    assert.equal(proposed.length, proposals, 'an absence read elsewhere authorizes no proposal');
    const record = owner.repository.retainedPlacementRepairs.get(initial.operation_id);
    assert.equal(record?.entry.state, RETAINED_REPAIR_ENTRY.UNPINNED,
      'nothing was prepared on that absence');
    assertOwedToRoute(owner, initial, REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_BINDING);
  }, {ledgerRoute: LEDGER_ROUTE.PREVIOUS_LEADER});
});

test('a row still present on a deposed ledger leader but retired on the current one is not ' +
  'confirmed for dispatch', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries, proposed, served}) => {
    const operation = owner.repository.rowToOperation(initial);
    // The deposed replica still answers as leader of its older term with the
    // row; the current leader (the cached route) has retired it.
    await onLedgerLeader(async (deposed) => {
      const columns = Object.keys(initial);
      commitLedgerStatement(deposed, 'execution-mirror:deposed-copy',
        `INSERT INTO replica_operations (${columns.join(', ')}) VALUES ` +
        `(${columns.map(() => '?').join(', ')})`, columns.map((column) => initial[column]));
      assert.equal(committedUpdate(leader, 'execution-mirror:retired',
        'DELETE FROM replica_operations WHERE operation_id = ?', [initial.operation_id]), 1);
      const proposals = proposed.length;
      served.replica = deposed;
      try {
        assert.equal(await owner.repository.ensureRetainedOperationRow(operation), false,
          'presence answered by a replica other than the bound current leader confirms nothing');
      } finally {
        served.replica = leader;
      }
      assert.equal(deliveries.length, 0);
      assert.equal(proposed.length, proposals, 'nothing is presented on a stale answer');
      assert.equal(ledgerRows(leader).length, 0, 'the retired row is not resurrected');
      assertOwedToRoute(owner, initial, REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_BINDING);
    }, {nodeId: NODE.C, replicaId: DEPOSED_LEDGER_REPLICA_ID});
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
});

// Withheld at the gate while the bound owner read failed; the retained owner's
// own continuation later confirms the row with no other caller or event. The
// withheld dispatch must then happen exactly once (open: no owned re-drive).
test('a CREATE dispatch withheld at the gate is dispatched exactly once after the retained ' +
  'owner confirms the row', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
    const repository = owner.repository;
    const clock = installVirtualClock(repository);
    const read = repository.executeReplicaOperationsRead;
    let failed = 0;
    repository.executeReplicaOperationsRead = (sql, params, options) =>
      sql.startsWith(RETAINED_READ_PREFIX) && failed++ === 0 ?
        Promise.resolve({success: false, rowSetComplete: false}) :
        read.call(repository, sql, params, options);
    await claimAndReenter(owner, leader, initial);
    assert.equal(deliveries.length, 0, 'withheld while the owner read failed');
    const record = repository.retainedPlacementRepairs.get(initial.operation_id);
    assert.equal(record?.continuation.state, RETAINED_REPAIR_CONTINUATION.ARMED,
      'the retained owner owns the failed read');
    await advanceContinuation(clock, [repository],
      () => repository.retainedPlacementRepairs.size === 0);
    assert.equal(repository.retainedPlacementRepairs.size, 0, 'the retained owner confirmed the row');
    await owner.operationWorkflowRunExclusive(
      owner.getOperationOwnerSingleFlightKey(initial.operation_id), async () => {});
    assert.equal(deliveries.length, 1, 'the withheld CREATE dispatch is re-driven exactly once');
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
});

// The retained owner's verdicts as its workflow owner consumes them (the port
// the coordinator composes), recorded with the consumer's answer.
function observeRetainedVerdicts(owner) {
  const verdicts = [];
  const consume = owner.observeRetainedRepairVerdict;
  owner.observeRetainedRepairVerdict = (event) => {
    const answer = consume.call(owner, event);
    verdicts.push({event, answer});
    return answer;
  };
  return verdicts;
}

function failFirstRetainedRead(repository) {
  const read = repository.executeReplicaOperationsRead;
  let failed = 0;
  repository.executeReplicaOperationsRead = (sql, params, options) =>
    sql.startsWith(RETAINED_READ_PREFIX) && failed++ === 0 ?
      Promise.resolve({success: false, rowSetComplete: false}) :
      read.call(repository, sql, params, options);
}

function settleOperationLane(owner, initial) {
  return owner.operationWorkflowRunExclusive(
    owner.getOperationOwnerSingleFlightKey(initial.operation_id), async () => {});
}

function verdictFor(initial, verdict) {
  return {operationId: initial.operation_id, createdAt: initial.created_at, verdict};
}

// Only a dispatch the gate withheld is re-driven: a confirmation for an
// operation whose dispatch was never withheld dispatches nothing, and a row the
// owner confirmed at the first ask leaves no verdict behind.
test('a retained confirmation for an operation whose dispatch was never withheld re-drives ' +
  'nothing', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
    const verdicts = observeRetainedVerdicts(owner);
    owner.repository.reportRetainedRepairVerdict(
      verdictFor(initial, {state: RETAINED_REPAIR_VERDICT.CONFIRMED}));
    await settleOperationLane(owner, initial);
    assert.equal(verdicts.length, 1, 'the composed port reaches the workflow owner');
    assert.equal(deliveries.length, 0, 'nothing was withheld: nothing is dispatched');
    await claimAndReenter(owner, leader, initial);
    await settleOperationLane(owner, initial);
    assert.equal(deliveries.length, 1, 'the gate dispatches the confirmed row itself, once');
    assert.equal(verdicts.length, 1, 'a record that answered its caller emits no verdict');
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
});

// A withheld dispatch whose operation became terminal, or whose owner shut
// down, is not re-driven by a verdict that arrives afterwards.
test('a retained confirmation after the operation became terminal, or after shutdown, ' +
  're-drives nothing', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
    const repository = owner.repository;
    const clock = installVirtualClock(repository);
    failFirstRetainedRead(repository);
    const verdicts = observeRetainedVerdicts(owner);
    await claimAndReenter(owner, leader, initial);
    assert.equal(deliveries.length, 0, 'withheld while the owner read failed');
    owner.clearTerminalOperationRetryState(repository.rowToOperation(initial));
    await advanceContinuation(clock, [repository],
      () => repository.retainedPlacementRepairs.size === 0);
    await settleOperationLane(owner, initial);
    assert.equal(verdicts.length, 1, 'the record that refused its caller settles once, visibly');
    assert.deepEqual(verdicts[0].event,
      verdictFor(initial, {state: RETAINED_REPAIR_VERDICT.CONFIRMED}));
    assert.equal(deliveries.length, 0, 'the terminal operation is not dispatched');
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
  await withPlacementExecution(async ({coordinator, owner, leader, initial, deliveries}) => {
    failFirstRetainedRead(owner.repository);
    const verdicts = observeRetainedVerdicts(owner);
    await claimAndReenter(owner, leader, initial);
    assert.equal(deliveries.length, 0, 'withheld while the owner read failed');
    await coordinator.shutdown();
    assert.equal(owner.withheldDispatchByOperationId.size, 0,
      'shutdown clears withheld dispatch waits');
    owner.repository.reportRetainedRepairVerdict(
      verdictFor(initial, {state: RETAINED_REPAIR_VERDICT.CONFIRMED}));
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].answer.state, 'not_withheld');
    assert.equal(deliveries.length, 0, 'a shut-down owner dispatches nothing');
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
});

test('a retained confirmation that arrives while the withheld dispatch turn still holds the ' +
  'operation lane re-drives in its own retained turn after the holder releases', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
    const repository = owner.repository;
    const clock = installVirtualClock(repository);
    failFirstRetainedRead(repository);
    const verdicts = observeRetainedVerdicts(owner);
    const advance = owner.advanceDispatchCandidateStep;
    let firedWhileHeld = false;
    owner.advanceDispatchCandidateStep = async function(...args) {
      const result = await advance.apply(this, args);
      if (!firedWhileHeld && repository.retainedPlacementRepairs.has(initial.operation_id)) {
        firedWhileHeld = true;
        assert.equal(this.isOperationOwnerLaneHeld(initial.operation_id), true,
          'the withheld turn still holds the operation lane when the verdict arrives');
        await advanceContinuation(clock, [repository],
          () => repository.retainedPlacementRepairs.size === 0);
      }
      return result;
    };
    await claimAndReenter(owner, leader, initial);
    assert.equal(firedWhileHeld, true);
    assert.equal(verdicts.length, 1);
    await verdicts[0].answer.dispatch;
    await settleOperationLane(owner, initial);
    assert.equal(deliveries.length, 1,
      'the retained re-drive takes its own turn after the held lane releases');
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
});

test('the gate registers the withheld wait before asking and clears it when the gate passes',
  async () => {
    await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
      const repository = owner.repository;
      const verdicts = observeRetainedVerdicts(owner);
      const ensure = repository.ensureRetainedOperationRow;
      let intercepted = false;
      let registeredBeforeAsk = false;
      repository.ensureRetainedOperationRow = async function(operation) {
        if (!intercepted) {
          intercepted = true;
          registeredBeforeAsk = owner.withheldDispatchByOperationId.has(initial.operation_id);
          repository.reportRetainedRepairVerdict(
            verdictFor(initial, {state: RETAINED_REPAIR_VERDICT.CONFIRMED}));
          return false;
        }
        return ensure.call(this, operation);
      };
      await claimAndReenter(owner, leader, initial);
      assert.equal(registeredBeforeAsk, true,
        'the wait is registered before asking the retained owner');
      assert.equal(verdicts.length, 1);
      await verdicts[0].answer.dispatch;
      await settleOperationLane(owner, initial);
      assert.equal(deliveries.length, 1, 'a verdict during the ask is caught and re-driven once');
      assert.equal(owner.withheldDispatchByOperationId.has(initial.operation_id), false,
        'the wait is cleared when the re-driven gate check passes');
    }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
    await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
      const repository = owner.repository;
      failFirstRetainedRead(repository);
      const verdicts = observeRetainedVerdicts(owner);
      await claimAndReenter(owner, leader, initial);
      assert.equal(owner.withheldDispatchByOperationId.has(initial.operation_id), true);
      const direct = await owner.dispatchOperation(initial.operation_id);
      assert.equal(direct.success, true);
      assert.equal(deliveries.length, 1, 'the second ask confirms the row directly');
      assert.equal(verdicts.length, 0,
        'awaitingCallers === 0: retiring for an awaiting caller emits no verdict');
      assert.equal(owner.withheldDispatchByOperationId.has(initial.operation_id), false,
        'passing the gate clears any previously registered wait');
    }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
  });

test('row_changed re-evaluates the gate once; a definite refusal ends the wait with the typed ' +
  'non-dispatchable outcome', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
    const repository = owner.repository;
    const clock = installVirtualClock(repository);
    failFirstRetainedRead(repository);
    const verdicts = observeRetainedVerdicts(owner);
    const sending = await claimAndReenter(owner, leader, initial);
    assert.equal(deliveries.length, 0);
    assert.equal(committedUpdate(leader, 'execution-mirror:row-changed',
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
      [sending.updated_at + 1, initial.operation_id]), 1);
    await advanceContinuation(clock, [repository],
      () => repository.retainedPlacementRepairs.size === 0);
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].event.verdict.reason, RETAINED_REPAIR_RETIREMENT.CHANGED);
    assert.equal(verdicts[0].answer.state, 'redriven',
      'row_changed re-enters the dispatch gate once');
    await verdicts[0].answer.dispatch;
    await settleOperationLane(owner, initial);
    assert.equal(deliveries.length, 1, 'the re-evaluated row dispatches once');
    assert.equal(owner.withheldDispatchByOperationId.size, 0);
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
  await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
    const repository = owner.repository;
    failFirstRetainedRead(repository);
    const verdicts = observeRetainedVerdicts(owner);
    await claimAndReenter(owner, leader, initial);
    repository.reportRetainedRepairVerdict(verdictFor(initial,
      unconfirmedVerdict(RETAINED_REPAIR_RETIREMENT.CHANGED)));
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].answer.state, 'redriven');
    // Before the re-drive turn runs, if the re-evaluation itself also yields
    // row_changed, the second row_changed ends the wait without looping.
    owner.withheldDispatchByOperationId.set(initial.operation_id, {
      createdAt: initial.created_at, fenceEpoch: owner.getOperationOwnershipFenceEpoch(),
      deadlineMs: initial.created_at +
        OPERATION_WORKFLOW_OWNER_SHARED.TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
      awaitingVerdict: true, changedRedriven: true,
    });
    repository.reportRetainedRepairVerdict(verdictFor(initial,
      unconfirmedVerdict(RETAINED_REPAIR_RETIREMENT.CHANGED)));
    assert.equal(verdicts.length, 2);
    assert.equal(verdicts[1].answer.state, 'unconfirmed');
    assert.equal(verdicts[1].answer.outcome?.reason,
      OPERATION_WORKFLOW_OWNER_SHARED.OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE);
    assert.equal(verdicts[1].answer.outcome?.error, RETAINED_REPAIR_RETIREMENT.CHANGED);
    await verdicts[0].answer.dispatch;
    await settleOperationLane(owner, initial);
    assert.equal(deliveries.length, 1);
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
  await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
    const repository = owner.repository;
    const verdicts = observeRetainedVerdicts(owner);
    const read = repository.executeReplicaOperationsRead;
    let deleted = false;
    repository.executeReplicaOperationsRead = (sql, params, options) => {
      if (sql.startsWith(RETAINED_READ_PREFIX) && !deleted) {
        deleted = true;
        assert.equal(committedUpdate(leader, 'execution-mirror:definite-refusal-delete',
          'DELETE FROM replica_operations WHERE operation_id = ?', [initial.operation_id]), 1);
      }
      return read.call(repository, sql, params, options);
    };
    repository.prepareRetainedPlacementRepair = async (operation) => ({
      state: 'prepared',
      owner: {nodeId: leader.nodeId, replicaId: leader.replicaId},
      body: {operation},
    });
    repository.repairRetainedPlacement = async () => ({
      success: false, committed: false,
      failureCode: PLACEMENT_ADMISSION_ERROR.BYTES,
    });
    const result = await owner.dispatchOperation(repository.rowToOperation(initial));
    assert.equal(result.skipped, true);
    assert.equal(result.reason,
      OPERATION_WORKFLOW_OWNER_SHARED.OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE);
    assert.equal(result.error, PLACEMENT_ADMISSION_ERROR.BYTES,
      'same-step definite refusal hands the typed refusal outcome to the workflow');
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].answer.state, 'unconfirmed');
    assert.equal(owner.withheldDispatchByOperationId.size, 0,
      'definite refusal ends the wait with no leaked entry');
    assert.equal(deliveries.length, 0);
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
});

test('withheld dispatch fences createdAt, ownership fenceEpoch, budget deadline, ingress ' +
  'retirement, and missing-port construction', async () => {
  assert.throws(() => createRetainedPlacementRepairPorts({
    ...unavailableRetainedRepairPorts(), reportRetainedRepairVerdict: null,
  }), (error) => error instanceof TypeError && error.code === RETAINED_REPAIR_PORT_REFUSAL);
  await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
    const repository = owner.repository;
    failFirstRetainedRead(repository);
    const verdicts = observeRetainedVerdicts(owner);
    await claimAndReenter(owner, leader, initial);
    // Ingress-origin record (callerAnswer === NONE, awaitingCallers === 0) emits nothing.
    const ingressOp = {...repository.rowToOperation(initial), operationId: 'ingress-only-op'};
    const ingressRecord = retainedRepairRecord(ingressOp, RETAINED_REPAIR_ORIGIN.INGRESS);
    repository.retainedPlacementRepairs.set(ingressOp.operationId, ingressRecord);
    repository.retireRetainedRepair(ingressRecord,
      unconfirmedVerdict(RETAINED_REPAIR_RETIREMENT.TENURE_ENDED));
    assert.equal(verdicts.length, 0,
      'callerAnswer === WITHHELD: an ingress record that never refused a caller emits nothing');
    // createdAt fence: a verdict for another incarnation keeps the current wait.
    repository.reportRetainedRepairVerdict({
      operationId: initial.operation_id, createdAt: initial.created_at + 1,
      verdict: {state: RETAINED_REPAIR_VERDICT.CONFIRMED},
    });
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].answer.state, 'not_withheld');
    assert.equal(owner.withheldDispatchByOperationId.has(initial.operation_id), true);
    assert.equal(deliveries.length, 0);
    // deadlineMs fence: at the budget deadline boundary the wait is not current.
    const originalNow = owner.resolveTimeoutCheckNowMs;
    const deadlineMs = initial.created_at +
      OPERATION_WORKFLOW_OWNER_SHARED.TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
    owner.resolveTimeoutCheckNowMs = () => deadlineMs;
    try {
      repository.reportRetainedRepairVerdict(
        verdictFor(initial, {state: RETAINED_REPAIR_VERDICT.CONFIRMED}));
    } finally {
      owner.resolveTimeoutCheckNowMs = originalNow;
    }
    assert.equal(verdicts.length, 2);
    assert.equal(verdicts[1].answer.state, 'not_current');
    assert.equal(owner.withheldDispatchByOperationId.has(initial.operation_id), false);
    assert.equal(deliveries.length, 0);
    // fenceEpoch comparison: bumping the ownership fence epoch invalidates a wait.
    failFirstRetainedRead(repository);
    await owner.dispatchOperation(initial.operation_id);
    assert.equal(owner.withheldDispatchByOperationId.has(initial.operation_id), true);
    owner.bumpOperationOwnershipFenceEpoch();
    repository.reportRetainedRepairVerdict(
      verdictFor(initial, {state: RETAINED_REPAIR_VERDICT.CONFIRMED}));
    assert.equal(verdicts.length, 3);
    assert.equal(verdicts[2].answer.state, 'not_current');
    assert.equal(owner.withheldDispatchByOperationId.has(initial.operation_id), false);
    assert.equal(deliveries.length, 0);
  }, {ledgerRoute: LEDGER_ROUTE.PUBLISHED});
});

test('an absent placement row is withheld from dispatch while no ledger route is published; ' +
  'the retained owner keeps the obligation, owed to the route publication', async () => {
  await withPlacementExecution(async ({owner, leader, initial, deliveries, proposed}) => {
    const operation = owner.repository.rowToOperation(initial);
    assert.equal(committedUpdate(leader, 'execution-mirror:lost-row',
      'DELETE FROM replica_operations WHERE operation_id = ?', [initial.operation_id]), 1);
    const proposals = proposed.length;
    assert.equal(await owner.repository.ensureRetainedOperationRow(operation), false,
      'the dispatch gate question: no row and no route confirm nothing');
    assert.equal(deliveries.length, 0);
    assert.equal(proposed.length, proposals, 'without a route nothing is presented');
    const record = owner.repository.retainedPlacementRepairs.get(initial.operation_id);
    assert.ok(record, 'the retained owner keeps the obligation');
    assert.notEqual(record.owed & REPAIR_OBSERVATION.ROUTE, 0,
      'the next ledger route publication owns the reconsideration');
    assert.equal(record.continuation.state, RETAINED_REPAIR_CONTINUATION.IDLE,
      'no timer: the route publication is the wake');
    assert.equal(record.lastDecision.reason, 'unqualified_binding',
      'an absence read without a binding keeps its own name');
    assert.equal(record.waiting.state, 'route_publication', 'the record names its wait');
  }, {ledgerRoute: LEDGER_ROUTE.UNPUBLISHED});
});

test('a competing terminal result survives acknowledgement of a previously stamped CREATE',
  async () => {
    await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
      const placement = owner.repository.rowToOperation(initial);
      const bound = await bindReplaceCreateTargetReplicaId(owner, placement, false, null);
      assert.ok(bound, 'the prior workflow recorded the stamp');
      const [recorded] = ledgerRows(leader);
      const restored = owner.repository.rowToOperation(recorded);
      const claimed = await owner.claimPendingDispatchOperation(restored);
      assert.equal(claimed?.workflowStep, WORKFLOW_STEP.SENDING, 'the real owner claimed dispatch');
      const dispatch = await owner.executeOperationInternal(claimed, {});
      assert.equal(dispatch.success, false, JSON.stringify(dispatch));
      assertCreateDelivery(deliveries, initial);
      const [terminal] = ledgerRows(leader);
      assert.equal(terminal.workflow_step, WORKFLOW_STEP.FAILED);
      assert.equal(terminal.completed_at, terminal.updated_at);
      assert.equal(terminal.error_message, 'competing terminal result');
    }, {duringCreate(leader, sending) {
      const step = WORKFLOW_STEP.FAILED;
      const timestamp = sending.updated_at + 1;
      assert.equal(committedUpdate(leader, 'execution-mirror:competing-terminal',
        `UPDATE replica_operations SET workflow_step = ?, status = ?, updated_at = ?,
         completed_at = ?, error_message = ?, steps_history = json_insert(steps_history, '$[#]', json(?))
         WHERE operation_id = ? AND workflow_step = ?`,
        [step, ReplicaStatus.FAILED, timestamp, timestamp, 'competing terminal result',
          JSON.stringify({step, timestamp}), sending.operation_id, sending.workflow_step]), 1);
    }});
  });
