import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../control-plane/owner-contract-outcome.js';
import {
  isPlanningIdentityCurrent,
  planningIdentitiesEqual,
} from '../control-plane/readiness-planning-semantic-generation.js';
import {
  QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE,
} from '../query/query-execution-budget.js';
import {
  normalizeRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';
import {
  MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE,
  assertMembershipPublicationEpochBinding,
} from './replica-operation-membership-epoch-binding.js';

const OPERATION_CREATION_ADMISSION_ERROR_CODE =
  'OPERATION_CREATION_ADMISSION_REENTER';
const OPERATION_CREATION_MOVE_EPOCH_BINDING_SOURCE =
  'operation_creation_move_identity';
const OPERATION_CREATION_ADMISSION_REASON = Object.freeze({
  IDENTITY_CHANGED: 'readiness_planning_identity_changed',
  IDENTITY_UNAVAILABLE: 'readiness_planning_identity_unavailable',
  ROUTE_UNAVAILABLE: 'replica_operation_route_unavailable',
});
const OPERATION_CREATION_ADMISSION_DECISION_TYPE = Object.freeze({
  ADMITTED: 'admitted',
  DEFERRED: 'deferred',
});
const EMPTY_REASON_CODES = Object.freeze([]);

function freezeReasonCodes(values = []) {
  return Object.freeze([...new Set(values.filter(Boolean).map(String))]);
}

function normalizeRetryAfterMs(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function stringOrEmpty(value) {
  return value === null || value === undefined ? '' : String(value);
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function resolveMoveMembershipPublicationEpoch(move) {
  const binding = assertMembershipPublicationEpochBinding(
    move?.membershipPublicationEpoch,
    {
      source: OPERATION_CREATION_MOVE_EPOCH_BINDING_SOURCE,
      operationId: move?.operationId || move?.operationIntentId,
    },
  );
  return binding.state === MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE.BOUND ?
    binding.epoch : null;
}

function buildMoveIdentity(move = {}) {
  const {entityType, entityId} = normalizeRebalancerEntityIdentity(move);
  return Object.freeze({
    type: stringOrEmpty(move.type).toUpperCase(),
    partitionId: stringOrEmpty(move.partitionId ?? entityId),
    entityType: stringOrEmpty(entityType),
    entityId: stringOrEmpty(entityId),
    nodeId: stringOrEmpty(move.nodeId),
    sourceNodeId: stringOrEmpty(move.sourceNodeId),
    replicaId: stringOrEmpty(move.replicaId),
    operationId: stringOrEmpty(move.operationId),
    operationIntentId: stringOrEmpty(move.operationIntentId),
    replicaIntentId: stringOrEmpty(move.replicaIntentId),
    membershipPublicationEpoch: resolveMoveMembershipPublicationEpoch(move),
    controlPlaneMutationWorkClass:
      stringOrEmpty(move.controlPlaneMutationWorkClass),
    priorityRecoveryOperationCreationRequired:
      move.priorityRecoveryOperationCreationRequired === true,
    enforceConcurrentOperationBudget:
      move.enforceConcurrentOperationBudget === true,
  });
}

function moveIdentitiesEqual(left, right) {
  return Object.keys(left).every((field) => left[field] === right?.[field]);
}

function buildAdmissionObservation(options = {}) {
  const allowed = options.allowed === true;
  const reasonCodes = freezeReasonCodes(options.reasonCodes);
  const retryAfterMs = normalizeRetryAfterMs(options.retryAfterMs);
  return Object.freeze({
    allowed,
    decisionType: allowed ?
      OPERATION_CREATION_ADMISSION_DECISION_TYPE.ADMITTED :
      OPERATION_CREATION_ADMISSION_DECISION_TYPE.DEFERRED,
    contractState: allowed ?
      OWNER_CONTRACT_STATE.READY : OWNER_CONTRACT_STATE.DEFERRED,
    nextAction: allowed ?
      OWNER_CONTRACT_NEXT_ACTION.PROCEED : OWNER_CONTRACT_NEXT_ACTION.RETRY,
    reasonCodes,
    retryAfterMs,
    planningIdentity: options.planningIdentity || null,
    moveIdentity: options.moveIdentity || null,
    routeObservation: options.routeObservation || null,
    resolvedEntitySizeBytes:
      Number.isFinite(options.resolvedEntitySizeBytes) ?
        Math.max(0, options.resolvedEntitySizeBytes) : null,
    admissionResult: options.admissionResult || Object.freeze({
      allowed,
      decisionType: allowed ?
        OPERATION_CREATION_ADMISSION_DECISION_TYPE.ADMITTED :
        OPERATION_CREATION_ADMISSION_DECISION_TYPE.DEFERRED,
      blockingReasons: reasonCodes,
      reasonCodes,
      retryAfterMs,
    }),
  });
}

function buildDeniedObservation(options = {}) {
  const admissionResult = options.admissionResult || null;
  const reasonCodes = [
    ...arrayOrEmpty(options.reasonCodes),
    ...arrayOrEmpty(admissionResult?.blockingReasons),
    ...arrayOrEmpty(admissionResult?.reasonCodes),
    admissionResult?.reason,
    admissionResult?.reasonCode,
  ];
  return buildAdmissionObservation({
    allowed: false,
    admissionResult,
    moveIdentity: options.moveIdentity,
    planningIdentity: options.planningIdentity,
    reasonCodes,
    retryAfterMs:
      options.retryAfterMs ?? admissionResult?.retryAfterMs ?? 0,
    routeObservation: options.routeObservation,
  });
}

function buildRouteDeniedObservation(context) {
  const {moveIdentity, planningIdentity, routeObservation} = context;
  return buildDeniedObservation({
    moveIdentity,
    planningIdentity,
    reasonCodes: [
      routeObservation.reasonCode ||
        OPERATION_CREATION_ADMISSION_REASON.ROUTE_UNAVAILABLE,
    ],
    retryAfterMs: routeObservation.retryAfterMs,
    routeObservation,
  });
}

function buildGateErrorDeniedObservation(context, error) {
  return buildDeniedObservation({
    ...context,
    admissionResult: readAdmissionResult(error),
    reasonCodes: [
      error?.reasonCode,
      error?.rebalanceSkipReason,
      error?.code,
      error?.message,
    ],
    retryAfterMs: error?.retryAfterMs,
  });
}

function readAdmissionResult(error) {
  return error?.admissionResult && typeof error.admissionResult === 'object' ?
    error.admissionResult : null;
}

function buildUnavailableRouteObservation() {
  return Object.freeze({
    allowed: false,
    reasonCode: OPERATION_CREATION_ADMISSION_REASON.ROUTE_UNAVAILABLE,
    retryAfterMs: 0,
    routingSnapshot: null,
  });
}

function buildRouteObservation(candidateResolution) {
  const routingSnapshot = candidateResolution?.routingSnapshot || null;
  const candidates = arrayOrEmpty(candidateResolution?.candidates);
  const routableServices = arrayOrEmpty(routingSnapshot?.routableServices);
  const canonicalLeaderNodeId =
    typeof routingSnapshot?.canonicalLeaderNodeId === 'string' ?
      routingSnapshot.canonicalLeaderNodeId : null;
  const allowed = candidates.length > 0;
  return Object.freeze({
    allowed,
    reasonCode: allowed ? null :
      OPERATION_CREATION_ADMISSION_REASON.ROUTE_UNAVAILABLE,
    retryAfterMs: 0,
    routingSnapshot: routingSnapshot ? Object.freeze({
      canonicalLeaderNodeId,
      canonicalLeaderRoutingGapState:
        routingSnapshot.canonicalLeaderRoutingGapState || null,
      routableServiceCount: routableServices.length,
      candidateCount: candidates.length,
    }) : null,
  });
}

const operationCreationAdmissionMethods = {
  captureOperationCreationPlanningIdentity(nodeId) {
    const readinessOwner = this.controlPlaneReadinessService;
    if (
      !readinessOwner ||
      typeof readinessOwner.readCurrentPlanningProjectionIdentity !==
        'function'
    ) {
      return null;
    }
    return readinessOwner.readCurrentPlanningProjectionIdentity(
      nodeId,
      typeof this.nowFn === 'function' ? this.nowFn() : undefined,
    );
  },

  observeReplicaOperationMutationRoute() {
    const queryExecutor = this.sqlQueryEngine?.queryExecutor || null;
    const partitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS];
    if (
      !partitionId ||
      typeof queryExecutor?.resolvePartitionServiceCandidates !== 'function'
    ) {
      return buildUnavailableRouteObservation();
    }
    try {
      const candidateResolution =
        queryExecutor.resolvePartitionServiceCandidates(
          partitionId,
          false,
          false,
          false,
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
          {allowReadinessAuthoritativeRefresh: false},
        );
      return buildRouteObservation(candidateResolution);
    } catch {
      return buildUnavailableRouteObservation();
    }
  },

  async runOperationCreationAdmissionGates(move, moveIdentity) {
    const normalizedMoveType = this.normalizeMoveType(move?.type);
    const {entityType, entityId, partitionId} = moveIdentity;
    const sourceNodeId = move.sourceNodeId || this.nodeId;
    const gateContext = {
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
      sourceNodeId,
    };
    this.assertLocalControlPlaneMutationReady(move);
    const ledgerDeferral =
      await this.resolveProvisioningLedgerInterlockDeferral(move);
    if (ledgerDeferral) return {ledgerDeferral};
    await this.ensureNoConflictingInFlightReplaceForRemove(gateContext);
    await this.ensurePriorityControlPlaneRemoveLaneAvailable(gateContext);
    await this.ensurePrioritySurplusRemovePlacementFenceAllowed(gateContext);
    await this.ensureEntityAddLikeCreateLaneAvailable(gateContext);
    await this.ensureCriticalPartitionCreateLaneAvailable(gateContext);
    await this.ensureCreateTopologyGuardAllowed(gateContext);

    const resolvedEntitySizeBytes = this.resolveEntitySizeBytes({
      entityType,
      entityId,
    });
    await this.ensureProvisioningAdmissionAllowed({
      move: {
        ...move,
        type: normalizedMoveType || move.type,
        entityType,
        entityId,
        partitionId,
      },
      entityType,
      entityId,
      partitionId,
      sourceNodeId,
      resolvedEntitySizeBytes,
    });
    return {ledgerDeferral: null, resolvedEntitySizeBytes};
  },

  async observeOperationCreationAdmission(move) {
    const moveIdentity = buildMoveIdentity(move);
    const planningIdentity =
      this.captureOperationCreationPlanningIdentity(moveIdentity.nodeId);
    if (!isPlanningIdentityCurrent(planningIdentity)) {
      return buildDeniedObservation({
        moveIdentity,
        planningIdentity,
        reasonCodes: [
          OPERATION_CREATION_ADMISSION_REASON.IDENTITY_UNAVAILABLE,
        ],
      });
    }

    const routeObservation = this.observeReplicaOperationMutationRoute(move);
    if (routeObservation.allowed !== true) {
      return buildRouteDeniedObservation({
        moveIdentity,
        planningIdentity,
        routeObservation,
      });
    }

    let resolvedEntitySizeBytes = null;
    try {
      const gateResult = await this.runOperationCreationAdmissionGates(
        move,
        moveIdentity,
      );
      if (gateResult.ledgerDeferral) {
        return buildDeniedObservation({
          moveIdentity,
          planningIdentity,
          admissionResult: gateResult.ledgerDeferral.admissionResult,
          routeObservation,
        });
      }
      resolvedEntitySizeBytes = gateResult.resolvedEntitySizeBytes;
    } catch (error) {
      return buildGateErrorDeniedObservation({
        moveIdentity,
        planningIdentity,
        routeObservation,
      }, error);
    }

    const currentPlanningIdentity =
      this.captureOperationCreationPlanningIdentity(moveIdentity.nodeId);
    if (!planningIdentitiesEqual(planningIdentity, currentPlanningIdentity)) {
      return buildDeniedObservation({
        moveIdentity,
        planningIdentity: currentPlanningIdentity,
        reasonCodes: [
          OPERATION_CREATION_ADMISSION_REASON.IDENTITY_CHANGED,
        ],
        routeObservation,
      });
    }
    return buildAdmissionObservation({
      allowed: true,
      moveIdentity,
      planningIdentity,
      reasonCodes: EMPTY_REASON_CODES,
      resolvedEntitySizeBytes,
      routeObservation,
    });
  },

  createOperationCreationAdmissionReentryError(observation) {
    const error = new Error(
      'Operation creation admission changed before persistence',
    );
    error.code = OPERATION_CREATION_ADMISSION_ERROR_CODE;
    error.contractState = observation?.contractState ||
      OWNER_CONTRACT_STATE.DEFERRED;
    error.nextAction = observation?.nextAction ||
      OWNER_CONTRACT_NEXT_ACTION.RETRY;
    error.reasonCodes = observation?.reasonCodes || EMPTY_REASON_CODES;
    error.retryAfterMs = observation?.retryAfterMs || 0;
    error.admissionResult = observation?.admissionResult || null;
    return error;
  },

  async consumeOperationCreationAdmission(move, observation) {
    const moveIdentity = buildMoveIdentity(move);
    if (
      observation?.allowed !== true ||
      !moveIdentitiesEqual(moveIdentity, observation?.moveIdentity)
    ) {
      throw this.createOperationCreationAdmissionReentryError(observation);
    }
    const currentObservation =
      await this.observeOperationCreationAdmission(move);
    if (currentObservation.allowed !== true) {
      throw this.createOperationCreationAdmissionReentryError(
        currentObservation,
      );
    }
    if (!planningIdentitiesEqual(
      observation.planningIdentity,
      currentObservation.planningIdentity,
    )) {
      throw this.createOperationCreationAdmissionReentryError(
        buildDeniedObservation({
          moveIdentity,
          planningIdentity: currentObservation.planningIdentity,
          reasonCodes: [
            OPERATION_CREATION_ADMISSION_REASON.IDENTITY_CHANGED,
          ],
          routeObservation: currentObservation.routeObservation,
        }),
      );
    }
    return currentObservation;
  },

  async persistNewOperationAtAdmissionBoundary(
    operation,
    move,
    persistenceOptions,
  ) {
    const admittedObservation = move?.operationCreationAdmission || null;
    let operationCreationAdmission = null;
    const inheritedBeforeAttempt = persistenceOptions?.beforeAttempt;
    const effectBoundaryOptions =
      admittedObservation || typeof inheritedBeforeAttempt === 'function' ?
        {
          ...(persistenceOptions || {}),
          beforeAttempt: async () => {
            if (
              typeof inheritedBeforeAttempt === 'function' &&
              await inheritedBeforeAttempt() !== true
            ) {
              return false;
            }
            if (admittedObservation) {
              operationCreationAdmission =
                await this.consumeOperationCreationAdmission(
                  move,
                  admittedObservation,
                );
            }
            return true;
          },
        } :
        persistenceOptions;
    let persistResult;
    try {
      persistResult = await this.persistNewOperation(
        operation,
        effectBoundaryOptions,
      );
    } catch (error) {
      if (
        error?.deliveryDisposition !==
          QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE ||
        error?.priorMutationDeliveryMayHaveBeenAttempted === true
      ) {
        throw error;
      }
      throw this.createOperationCreationAdmissionReentryError(
        buildDeniedObservation({
          moveIdentity: buildMoveIdentity(move),
          planningIdentity:
            this.captureOperationCreationPlanningIdentity(move?.nodeId),
          reasonCodes: [
            OPERATION_CREATION_ADMISSION_REASON.ROUTE_UNAVAILABLE,
          ],
          routeObservation: buildUnavailableRouteObservation(),
        }),
      );
    }
    return {operationCreationAdmission, persistResult};
  },
};

function applyRebalanceCoordinatorOperationCreationAdmissionMethods(target) {
  Object.defineProperties(
    target.prototype,
    Object.getOwnPropertyDescriptors(operationCreationAdmissionMethods),
  );
}

export {
  applyRebalanceCoordinatorOperationCreationAdmissionMethods,
};
