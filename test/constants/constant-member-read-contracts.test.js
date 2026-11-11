/**
 * Each case here is a read that once named a member its constants object did
 * not have, so the code ran on `undefined`: an error with no message, a SQL
 * column named "undefined", a state that was never recognised. The table pins
 * the members their owners now define; the behaviour cases pin what each read
 * decides at its use site.
 */

import {test} from '../../src/test-helpers/tap.js';
import {FIELD} from '../../src/constants/index.js';
import {BOOTSTRAP_ERROR, BOOTSTRAP_LOG_MSG} from
  '../../src/bootstrap/bootstrap-constants.js';
import {JOINING_ERROR_MSG} from '../../src/bootstrap/node-joining-constants.js';
import {
  createBootstrapServiceReplicaStateRuntimeMethods,
} from '../../src/bootstrap/bootstrap-service-replica-registration-methods.js';
import {SeedRegistrationRuntimeOwner} from
  '../../src/bootstrap/owners/seed-registration-runtime-owner.js';
import {buildNodeStateUpdateDeliveryError} from
  '../../src/bootstrap/shared/node-state-publication-outcome.js';
import {CDCEmitter} from '../../src/cdc/cdc-emitter.js';
import {CDC_EMITTER_OPERATION} from '../../src/cdc/cdc-emitter-constants.js';
import {DEBUG_BREAKPOINT_FIELD} from
  '../../src/debug-runtime/debug-metadata-constants.js';
import {normalizeBreakpointRow} from
  '../../src/debug-runtime/debug-metadata-service-row-normalizers.js';
import {POLICY_ERROR_CODE, POLICY_READ_REASON} from
  '../../src/policy/policy-constants.js';
import {DISTRIBUTED_PREDICATE_SHAPE} from
  '../../src/query/distributed/distributed-query-plan-constants.js';
import {distributedTransactionStatementMethods} from
  '../../src/query/distributed/distributed-transaction-statement.js';
import {DistributedWriteCoordinator} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {
  createInitialKeyConditions,
  resolvePredicateShape,
} from '../../src/query/partition-resolver-key-conditions.js';
import {
  QUERY_AST_TYPE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {SQLQueryEngineSelectExecution} from
  '../../src/query/sql-query-engine-select-execution.js';
import {defineTableCreationSchemaDerivation} from
  '../../src/query/table-creation-service-schema-derivation.js';
import {PriorityPublicationSafetyRows} from
  '../../src/rebalancer/priority-publication-safety-rows.js';
import {buildPriorityRecoveryPartitionObservation} from
  '../../src/control-plane/priority-recovery-snapshot-burndown.js';
import {PRIORITY_RECOVERY_VISIBILITY_STATE} from
  '../../src/control-plane/priority-recovery-snapshot-contract.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED} from
  '../../src/rebalancer/unified-rebalancer-follow-up-shared.js';
import {
  applyUnifiedRebalancerPriorityRecoveryFollowUpDecisionMethods,
} from '../../src/rebalancer/unified-rebalancer-priority-recovery-follow-up-decisions.js';

const {PRIORITY_RECOVERY_FOLLOW_UP_FIELD} = UNIFIED_REBALANCER_FOLLOW_UP_SHARED;

const OWNER_MEMBERS = Object.freeze([
  [DEBUG_BREAKPOINT_FIELD, 'TENANT_ID', 'tenant_id'],
  [DISTRIBUTED_PREDICATE_SHAPE, 'CONTRADICTION', 'contradiction'],
  [QUERY_ERROR_MSG, 'QUERY_EXECUTION_FAILED', 'Query execution failed'],
  [QUERY_ERROR_MSG, 'NO_PARTITIONS_FOR_TABLE',
    'No partitions available for table'],
  [QUERY_ERROR_MSG, 'PRIMARY_KEY_REQUIRED',
    'A PRIMARY KEY value is required to route the row to a partition'],
  [QUERY_ERROR_MSG, 'COLUMN_DATA_TYPE_REQUIRED', 'Column data type is required'],
  [JOINING_ERROR_MSG, 'CONTROL_PLANE_MESSAGE_WAS_NOT_ACKNOWLEDGED',
    'control-plane message was not acknowledged'],
  [BOOTSTRAP_ERROR, 'PARTITION_LEADER_MISSING', 'Partition leader not available'],
  [BOOTSTRAP_ERROR, 'STATE_MACHINE_MISSING',
    'No state machine provided for replica registration'],
]);

test('each owner defines the member its readers name', async (t) => {
  for (const [owner, member, value] of OWNER_MEMBERS) {
    t.equal(owner[member], value, member);
  }
  t.notOk(
    Object.hasOwn(BOOTSTRAP_LOG_MSG, 'STATE_MACHINE_MISSING'),
    'the assertion text has one owner',
  );
  // Members once added only to keep a read no producer feeds: a changed
  // service record is a system-table row (service_id), and a priority
  // recovery decision has no top-level visibility state.
  t.notOk(Object.hasOwn(FIELD, 'SERVICE_ID'), 'no camelCase service id read');
  t.notOk(Object.hasOwn(PRIORITY_RECOVERY_FOLLOW_UP_FIELD, 'VISIBILITY_STATE'));
});

test('an undelivered node-state publication names why it failed', async (t) => {
  const error = buildNodeStateUpdateDeliveryError({}, 'node-2/control-plane/cp');

  t.equal(error.message, JOINING_ERROR_MSG.CONTROL_PLANE_MESSAGE_WAS_NOT_ACKNOWLEDGED);
});

test('a missing partition leader and a missing state machine are named errors',
  async (t) => {
    const owner = new SeedRegistrationRuntimeOwner({});
    owner.findLeaderPartition = () => null;
    t.throws(
      () => owner.getLeaderPartition('nodes'),
      {message: BOOTSTRAP_ERROR.PARTITION_LEADER_MISSING},
    );

    const methods = createBootstrapServiceReplicaStateRuntimeMethods();
    t.throws(
      () => methods.registerReplicasWithStateMachine(null, new Map()),
      {message: BOOTSTRAP_ERROR.STATE_MACHINE_MISSING},
    );
  });

test('INSERT OR REPLACE is a write the CDC emitter recognises', async (t) => {
  const extract = CDCEmitter.prototype.extractOperationFromSQL;

  t.equal(
    extract('  insert or replace into nodes (node_id) values (?)'),
    CDC_EMITTER_OPERATION.INSERT,
  );
  t.equal(extract('INSERT INTO nodes (node_id) VALUES (?)'),
    CDC_EMITTER_OPERATION.INSERT);
  t.equal(extract('SELECT * FROM nodes'), null);
  t.equal(extract('undefined'), null, 'no prefix is the text "undefined"');
});

test('a stored breakpoint row carries its tenant column', async (t) => {
  const row = {
    [DEBUG_BREAKPOINT_FIELD.BREAKPOINT_ID]: 'bp-1',
    [DEBUG_BREAKPOINT_FIELD.SESSION_ID]: 'session-1',
    [DEBUG_BREAKPOINT_FIELD.TENANT_ID]: 'tenant-1',
  };

  t.equal(row.tenant_id, 'tenant-1');
  t.notOk(Object.hasOwn(row, 'undefined'));
  t.equal(normalizeBreakpointRow(row).tenantId, 'tenant-1');
});

test('a contradictory key predicate has its own named shape', async (t) => {
  const conditions = createInitialKeyConditions();
  conditions.contradiction = true;

  t.equal(resolvePredicateShape(conditions), DISTRIBUTED_PREDICATE_SHAPE.CONTRADICTION);
  t.not(
    resolvePredicateShape(conditions),
    resolvePredicateShape(createInitialKeyConditions()),
    'a contradiction is not planned as a scatter',
  );
});

test('a read refused for a spent transaction budget names its operation',
  async (t) => {
    const coordinator = {
      ...distributedTransactionStatementMethods,
      transactionsBySession: new Map([['session-1', {transactionId: 'tx-1'}]]),
      runTransactionOperation: (_sessionId, operation) => operation(),
      isTransactionBudgetExceeded: () => true,
    };

    const result = await coordinator.executeReadStatement(
      'session-1', null, () => t.fail('the read must not execute'));

    t.equal(result.success, false);
    t.equal(result.operation, QUERY_AST_TYPE.SELECT);
    t.equal(result.errorCode, QUERY_ERROR_CODE.TIMEOUT);
  });

test('an INSERT row that no primary key can route is refused with a message',
  async (t) => {
    const route =
      DistributedWriteCoordinator.prototype.routeRowToSinglePartitionOrThrow;
    const appended = [];
    const coordinator = {
      appendInsertRowToPartition: (_statements, partitionId) =>
        appended.push(partitionId),
    };

    t.throws(
      () => route.call(coordinator, [{partition_id: 'p1'}, {partition_id: 'p2'}],
        new Map(), {}, []),
      {message: QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED},
    );
    route.call(coordinator, [{partition_id: 'p1'}], new Map(), {}, []);
    t.same(appended, ['p1']);
  });

test('a FROM-less SELECT with no partition fails with a message', async (t) => {
  const engine = {systemCache: {getAll: () => []}};

  const result = await SQLQueryEngineSelectExecution.prototype
    .executeFromlessSelect.call(engine, {}, [], 'session-1', {}, null);

  t.equal(result.success, false);
  t.equal(result.error, QUERY_ERROR_MSG.NO_PARTITIONS_FOR_TABLE);
  t.equal(result.errorCode, QUERY_ERROR_CODE.PARTITION_NOT_FOUND);
});

test('a column with no declared type is refused, never defaulted', async (t) => {
  class Service {}
  defineTableCreationSchemaDerivation(Service);
  const service = new Service();

  t.equal(service.normalizeDataType({name: 'varchar'}), 'TEXT');
  t.equal(service.normalizeDataType('bigint'), 'INTEGER');
  for (const typeless of [undefined, null, {}, {name: ''}, '']) {
    t.throws(
      () => service.normalizeDataType(typeless),
      {message: QUERY_ERROR_MSG.COLUMN_DATA_TYPE_REQUIRED},
    );
  }
  t.throws(
    () => service.buildSchemaDefinition([{name: 'id', primaryKey: true}]),
    {message: QUERY_ERROR_MSG.COLUMN_DATA_TYPE_REQUIRED},
  );
  t.equal(
    service.buildSchemaDefinition(
      [{name: 'id', type: 'integer', primaryKey: true}]).columns[0].type,
    'INTEGER',
  );
});

test('a policy read that is not authoritative and gives no reason is refused ' +
  'under a named reason', async (t) => {
  const safetyRows = Object.create(PriorityPublicationSafetyRows.prototype);
  safetyRows.resolvePartitionRemoveSafetyPolicyFact = async () => null;

  await t.rejects(
    safetyRows.getCriticalMinReplicaCount('partition-1'),
    {
      code: POLICY_ERROR_CODE.READ_UNAVAILABLE,
      reason: POLICY_READ_REASON.READ_FAILED,
      partitionId: 'partition-1',
    },
  );
});

test('a deferred operation read on the coordinator decision is not operation ' +
  'visibility', async (t) => {
  class Rebalancer {}
  applyUnifiedRebalancerPriorityRecoveryFollowUpDecisionMethods(Rebalancer);
  const rebalancer = new Rebalancer();
  // The observation as the priority-recovery snapshot owner builds it when
  // its authoritative operation read was deferred: no operation was seen.
  const deferredObservation = buildPriorityRecoveryPartitionObservation({
    capturedAt: 1,
    operationContexts: [],
    authoritativeOperationReadDeferred: true,
  });
  t.equal(deferredObservation.visibilityState,
    PRIORITY_RECOVERY_VISIBILITY_STATE.DEFERRED);

  t.equal(
    rebalancer.hasPriorityRecoveryCoordinatorDecisionOperationVisibility({
      observation: deferredObservation,
    }),
    false,
    'a read that saw nothing is no evidence of an operation',
  );
  t.equal(
    rebalancer.hasPriorityRecoveryCoordinatorDecisionOperationVisibility({
      observation: buildPriorityRecoveryPartitionObservation({
        capturedAt: 1,
        operationContexts: [{operationId: 'op-1', status: 'RUNNING'}],
      }),
    }),
    true,
    'a seen operation is visible through its workflow state',
  );
  t.equal(
    rebalancer.hasPriorityRecoveryCoordinatorDecisionOperationVisibility({
      visibilityState: 'cache_visible',
    }),
    false,
    'no producer writes a top-level visibility state',
  );
  t.equal(
    rebalancer.hasPriorityRecoveryCoordinatorDecisionOperationVisibility({}),
    false,
  );
});
