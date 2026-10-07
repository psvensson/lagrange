import {test} from '../../src/test-helpers/tap.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from
  '../../src/constants/index.js';
import {
  INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING,
} from '../../src/rebalancer/replica-operation-membership-epoch-binding.js';
import {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
} from '../../src/rebalancer/operation-reservation-attempt-outcome.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createCoordinatorWithStorage,
  createTrackingSqlEngine,
  initializeConfig,
  seedAuthoritativeOperation,
} from '../rebalancer/reservation-dispatch-gate-test-harness.js';

const OWNER_NODE_ID = 'dispatch-projection-owner';
const TARGET_NODE_ID = 'dispatch-projection-target';
const OPERATION_ID = 'dispatch-projection-runtime-create';
const SERVICE_ID = 'sys-postgres-wire';
const REPLICA_ID = `${SERVICE_ID}-r1`;
const TARGET_CLAIM_KEY = `${SERVICE_ID}:${TARGET_NODE_ID}`;
const MEMBERSHIP_PUBLICATION_EPOCH = 1;

function buildRuntimeServiceOperation(overrides = {}) {
  const now = Date.now();
  return {
    operationId: OPERATION_ID,
    type: OperationType.ADD,
    partitionId: SERVICE_ID,
    entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entityId: SERVICE_ID,
    replicaId: REPLICA_ID,
    targetClaimKey: TARGET_CLAIM_KEY,
    sourceNodeId: OWNER_NODE_ID,
    targetNodeId: TARGET_NODE_ID,
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [],
    membershipPublicationEpoch: MEMBERSHIP_PUBLICATION_EPOCH,
    ...overrides,
  };
}

function createProjectionService(coordinator) {
  return new ReplicaDispatchService({
    nodeId: OWNER_NODE_ID,
    rebalanceCoordinator: coordinator,
  });
}

test('dispatch projection preserves the exact reservation identity through ' +
  'the canonical dispatch gate', async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine();
  const {coordinator} = createCoordinatorWithStorage({
    nodeId: OWNER_NODE_ID,
    sqlQueryEngine: sqlEngine,
  });
  const operation = buildRuntimeServiceOperation();
  seedAuthoritativeOperation(sqlEngine, operation);
  sqlEngine.operations.get(OPERATION_ID).membership_publication_epoch =
    MEMBERSHIP_PUBLICATION_EPOCH;

  try {
    const initialReservation =
      await coordinator.ensureReservationForOperation(operation);
    t.equal(
      initialReservation.outcome,
      OPERATION_RESERVATION_ATTEMPT_OUTCOME.CREATED,
      'setup creates one exact ACTIVE reservation through the real owner',
    );

    const dispatchService = createProjectionService(coordinator);
    const dispatchRow =
      dispatchService.buildOperationRowFromCoordinator(operation);
    const projectedOperation =
      dispatchService.buildOperationFromRow(dispatchRow);

    t.equal(
      dispatchRow.target_claim_key,
      TARGET_CLAIM_KEY,
      'the coordinator row projection retains the durable target claim',
    );
    t.equal(
      dispatchRow.membership_publication_epoch,
      MEMBERSHIP_PUBLICATION_EPOCH,
      'the coordinator row projection retains the durable planning epoch',
    );
    t.equal(
      projectedOperation.targetClaimKey,
      TARGET_CLAIM_KEY,
      'the dispatch operation retains the exact target claim',
    );
    t.equal(
      projectedOperation.membershipPublicationEpoch,
      MEMBERSHIP_PUBLICATION_EPOCH,
      'the dispatch operation retains the exact planning epoch',
    );

    const gateOutcomes = [];
    const ensureReservationForOperation =
      coordinator.workflowOwner.ensureReservationForOperation;
    coordinator.workflowOwner.ensureReservationForOperation =
      async (...args) => {
        const outcome = await ensureReservationForOperation(...args);
        gateOutcomes.push(outcome.outcome);
        return outcome;
      };
    coordinator.workflowOwner.getCurrentPublishedMembershipEpoch = () =>
      MEMBERSHIP_PUBLICATION_EPOCH;
    const dispatchCalls = [];
    coordinator.workflowOwner.executeOperationInternal = async (candidate) => {
      dispatchCalls.push(candidate.operationId);
      return {success: true, operationId: candidate.operationId};
    };

    const result = await coordinator.dispatchOperation(projectedOperation);
    t.equal(result.success, true,
      'the canonical owner dispatches after the strict identity gate');
    t.same(
      gateOutcomes,
      [OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE],
      'the canonical dispatch gate adopts the exact existing hold once',
    );
    t.same(dispatchCalls, [OPERATION_ID],
      'the exact projected operation dispatches once');
  } finally {
    await coordinator.shutdown();
  }
});

test('dispatch projection preserves unbound identity and rejects malformed ' +
  'durable epochs', (t) => {
  initializeConfig();
  const dispatchService = createProjectionService(null);
  const unbound = buildRuntimeServiceOperation({
    operationId: `${OPERATION_ID}-unbound`,
    targetClaimKey: null,
    membershipPublicationEpoch: undefined,
  });
  const unboundRow = dispatchService.buildOperationRowFromCoordinator(unbound);
  const projectedUnbound = dispatchService.buildOperationFromRow(unboundRow);

  t.equal(unboundRow.target_claim_key, null,
    'an absent target claim remains SQL-null in row shape');
  t.equal(unboundRow.membership_publication_epoch, null,
    'an unbound planning epoch remains SQL-null in row shape');
  t.equal(projectedUnbound.targetClaimKey, null,
    'an absent target claim remains explicitly null after decode');
  t.notOk(
    Object.hasOwn(projectedUnbound, 'membershipPublicationEpoch'),
    'an unbound planning epoch remains omitted after canonical decode',
  );

  const emptyClaimRow = dispatchService.buildOperationRowFromCoordinator({
    ...unbound,
    targetClaimKey: '',
  });
  t.equal(
    emptyClaimRow.target_claim_key,
    null,
    'an empty in-memory target claim uses canonical SQL-null writer shape',
  );

  const malformedRow = {
    ...unboundRow,
    membership_publication_epoch: String(MEMBERSHIP_PUBLICATION_EPOCH),
  };
  t.throws(
    () => dispatchService.buildOperationFromRow(malformedRow),
    {code: INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING},
    'a malformed durable planning epoch fails closed at dispatch decode',
  );
  dispatchService.stop();
  t.end();
});
