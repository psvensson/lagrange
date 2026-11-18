import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
} from '../../src/rebalancer/operation-reservation-attempt-outcome.js';
import {createTestCoordinator} from './test-helpers.js';

const NODE_ID = 'formation-progress-seed';
const TARGET_NODE_ID = 'formation-progress-joiner';
const PARTITION_ID = 'sql_transactions-p1';
const OPERATION_ID = 'formation-cure-progress-op';
const RESERVATION_ID = 'res-' + OPERATION_ID;
const REPLICA_ID = 'sql_transactions-p1-r4';
const OWNER_RPC_SOURCE = 'owner_rpc_lane';
const RESERVATION_INSERT_PATTERN =
  /^insert(?:\s+or\s+ignore)?\s+into\s+storage_reservations\b/iu;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function buildReservationRow(params) {
  return {
    reservation_id: params[0],
    operation_id: params[1],
    entity_type: params[2],
    entity_id: params[3],
    partition_id: params[4],
    target_node_id: params[5],
    estimated_bytes: params[6],
    amplification_factor: params[7],
    status: params[8],
    reason_code: params[9],
    created_at: params[10],
    updated_at: params[11],
    expires_at: params[12],
  };
}

async function attemptOperationCreation(coordinator, operation) {
  try {
    return {
      created: await coordinator.createOperation(operation),
      creationError: null,
    };
  } catch (creationError) {
    return {created: null, creationError};
  }
}

function observeProgressOwnership(owner, operationId, durable) {
  const handoffRetryActive =
    owner.hasActiveCreatedOperationHandoffRetry(operationId);
  const transitionRetryActive =
    owner.isOperationDeferredRetryActive(operationId);
  return {
    handoffRetryActive,
    transitionRetryActive,
    progressOwned:
      handoffRetryActive ||
      transitionRetryActive ||
      durable?.workflowStep !== WORKFLOW_STEP.PENDING,
  };
}

test(
  'formation cure creation retains its canonical progress obligation when ' +
  'post-reservation operation authority is temporarily unavailable',
  async (t) => {
    initializeTestEnvironment();

    const coordinator = createTestCoordinator({
      nodeId: NODE_ID,
      autoProgressCreatedOperations: true,
      enableTimeouts: false,
    });
    const gateway = coordinator.controlPlaneSystemTableGateway;
    const originalExecuteQuery = gateway.executeQuery.bind(gateway);
    const originalReadAuthoritativeRows =
      gateway.readAuthoritativeRows.bind(gateway);
    const originalResolveOperationOwnerNodeId =
      coordinator.workflowOwner.repository.resolveOperationOwnerNodeId.bind(
        coordinator.workflowOwner.repository,
      );
    const originalQueryAuthoritativeOperationVisibilityObservation =
      coordinator.queryAuthoritativeOperationVisibilityObservation
        .bind(coordinator);

    const planningIdentity = Object.freeze({
      globalPlanningGeneration: 1,
      nodePlanningGeneration: 1,
      saturated: false,
    });
    coordinator.controlPlaneReadinessService = {
      ...coordinator.controlPlaneReadinessService,
      readCurrentPlanningProjectionIdentity: () => planningIdentity,
    };
    coordinator.observeReplicaOperationMutationRoute = () => Object.freeze({
      allowed: true,
      reasonCode: null,
      retryAfterMs: 0,
      routingSnapshot: Object.freeze({
        canonicalLeaderNodeId: NODE_ID,
        routableServiceCount: 1,
        candidateCount: 1,
      }),
    });
    coordinator.assertLocalControlPlaneMutationReady = () => {};
    coordinator.resolveProvisioningLedgerInterlockDeferral = async () => null;
    coordinator.ensureNoConflictingInFlightReplaceForRemove = async () => {};
    coordinator.ensurePriorityControlPlaneRemoveLaneAvailable = async () => {};
    coordinator.ensurePrioritySurplusRemovePlacementFenceAllowed =
      async () => {};
    coordinator.ensureEntityAddLikeCreateLaneAvailable = async () => {};
    coordinator.ensureCriticalPartitionCreateLaneAvailable = async () => {};
    coordinator.ensureCreateTopologyGuardAllowed = async () => {};
    coordinator.ensureProvisioningAdmissionAllowed = async () => {};
    coordinator.resolveEntitySizeBytes = () => 1;

    // Force the created operation to use the real remote-owner handoff path.
    // The product still persists an ordinary priority ADD; only the ownership
    // fixture is controlled so the progress obligation is observable as a
    // created-operation handoff retry rather than an inline local dispatch.
    coordinator.workflowOwner.repository.resolveOperationOwnerNodeId =
      (operation) =>
        operation?.operationId === OPERATION_ID ?
          TARGET_NODE_ID :
          originalResolveOperationOwnerNodeId(operation);

    const reservationRows = new Map();
    let reservationMutationAttempts = 0;
    let postReservationOperationOwnerReadCount = 0;
    let operationAuthorityAvailable = false;
    let remoteHandoffDeliveries = 0;

    const originalDeliver = coordinator.messageRouter.deliver.bind(
      coordinator.messageRouter,
    );
    coordinator.messageRouter.deliver = async (target, payload, options = {}) => {
      if (
        payload &&
        JSON.stringify(payload).includes(OPERATION_ID)
      ) {
        remoteHandoffDeliveries += 1;
      }
      return originalDeliver(target, payload, options);
    };

    gateway.executeQuery = async (sql, params = [], options = {}) => {
      const statement = String(sql).replace(/\s+/gu, ' ').trim();
      if (RESERVATION_INSERT_PATTERN.test(statement)) {
        reservationMutationAttempts += 1;
        const row = buildReservationRow(params);
        const existed = reservationRows.has(row.reservation_id);
        if (!existed) {
          reservationRows.set(row.reservation_id, row);
        }
        return {
          success: true,
          affectedRows: existed ? 0 : 1,
          changes: existed ? 0 : 1,
        };
      }
      if (/from\s+storage_reservations\b/iu.test(statement)) {
        const operationId = params[0] || null;
        const status = params[1] || null;
        const rows = Array.from(reservationRows.values()).filter(
          (row) =>
            (!operationId || row.operation_id === operationId) &&
            (!status || row.status === status),
        );
        return {success: true, rows};
      }
      return originalExecuteQuery(sql, params, options);
    };

    gateway.readAuthoritativeRows = async (
      tableName,
      sql,
      params = [],
      options = {},
    ) => {
      if (tableName === SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS) {
        const operationId = params[0] || null;
        const status = params[1] || null;
        return {
          success: true,
          source: OWNER_RPC_SOURCE,
          rows: Array.from(reservationRows.values()).filter(
            (row) =>
              (!operationId || row.operation_id === operationId) &&
              (!status || row.status === status),
          ),
        };
      }
      return originalReadAuthoritativeRows(
        tableName,
        sql,
        params,
        options,
      );
    };

    coordinator.queryAuthoritativeOperationVisibilityObservation =
      async (operationId, options = {}) => {
        if (
          reservationRows.has(RESERVATION_ID) &&
          operationId === OPERATION_ID &&
          operationAuthorityAvailable !== true
        ) {
          postReservationOperationOwnerReadCount += 1;
          return Object.freeze({
            operation: null,
            deferredOutcome: Object.freeze({
              deferRetry: true,
              error: 'fixture-owner-rpc-temporarily-unavailable',
              reasonCode: 'owner_rpc_unavailable',
            }),
          });
        }
        return originalQueryAuthoritativeOperationVisibilityObservation(
          operationId,
          options,
        );
      };

    try {
      const move = {
        type: OperationType.ADD,
        partitionId: PARTITION_ID,
        entityType: 'partition',
        entityId: PARTITION_ID,
        nodeId: TARGET_NODE_ID,
        replicaIntentId: REPLICA_ID,
        operationIntentId: OPERATION_ID,
        deferDispatchUntilBootstrapTopology: true,
        emitOperationCreated: true,
      };
      const admission = await coordinator.checkProvisioningAdmission(move);
      t.equal(
        admission.allowed,
        true,
        'precondition: the real operation-creation owner admits the stable move',
      );

      const {created, creationError} = await attemptOperationCreation(
        coordinator,
        {
          ...move,
          operationCreationAdmission: admission.operationCreationAdmission,
        },
      );

      t.equal(
        reservationRows.size,
        1,
        'exactly one durable reservation identity exists independent of INSERT spelling',
      );
      t.equal(
        reservationRows.get(RESERVATION_ID)?.operation_id,
        OPERATION_ID,
        'the durable ACTIVE reservation is bound to the deterministic operation',
      );
      t.ok(
        reservationMutationAttempts >= 1,
        'at least one reservation mutation attempt reached the reservation owner',
      );
      t.comment(
        'post-reservation operation-authority observations=' +
          postReservationOperationOwnerReadCount,
      );

      operationAuthorityAvailable = true;
      const durable = await coordinator.repository.queryOperationById(
        OPERATION_ID,
      );
      t.equal(
        durable?.operationId,
        OPERATION_ID,
        'the one durable operation remains observable after authority returns',
      );
      t.equal(
        durable?.workflowStep,
        WORKFLOW_STEP.PENDING,
        'the remote-owned formation operation is still PENDING while handoff owns progress',
      );

      const reservationObservation =
        await coordinator.ensureReservationForOperation(durable);
      t.equal(
        reservationObservation?.outcome,
        OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE,
        'the reservation owner itself confirms the deterministic ACTIVE hold',
      );
      t.equal(
        reservationRows.size,
        1,
        'owner confirmation does not create a duplicate reservation',
      );

      const owner = coordinator.workflowOwner;
      const {
        handoffRetryActive,
        transitionRetryActive,
        progressOwned,
      } = observeProgressOwnership(owner, OPERATION_ID, durable);

      t.ok(
        progressOwned,
        'durable operation + ACTIVE reservation already has one canonical ' +
          'workflow progress/retry obligation; creation may not leave a bare ' +
          'PENDING row awaiting a coincidental planner pass',
      );
      t.ok(
        remoteHandoffDeliveries >= 1 || transitionRetryActive,
        'the real owner either attempted the remote handoff or retained a ' +
          'transition retry after the injected authority loss',
      );
      t.equal(
        coordinator.resolveReusedOperationRearmAction(
          durable,
          WORKFLOW_STEP.PENDING,
        ),
        handoffRetryActive || transitionRetryActive ?
          'skip_live_deferred_retry' :
          'rearm_dispatch',
        'CL-008 sees the same progress ownership: live retry suppresses a ' +
          'duplicate rearm; only a genuinely missed handoff is reclaimable',
      );

      if (creationError) {
        t.comment(
          'creation returned an error after durable state; retained progress ' +
            'ownership is the binding invariant: ' + creationError.message,
        );
      } else {
        t.equal(
          created?.operationId,
          OPERATION_ID,
          'successful creation returns the deterministic operation identity',
        );
      }
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);
