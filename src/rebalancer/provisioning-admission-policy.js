/**
 * ProvisioningAdmissionPolicy
 *
 * Owns storage/admission/readiness synthesis for storage-increasing topology
 * mutations. Extracted from RebalanceCoordinator per D7.1 / D7.2.
 */

import {NUM, SERVICE_TYPE} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  getLocalControlPlaneMutationReadinessBlocker,
  normalizeControlPlaneMutationWorkClass,
  requiresStableLocalControlPlaneMutationReadiness,
} from '../control-plane/control-plane-mutation-readiness.js';
import {
  isPriorityControlPlanePartition,
} from '../bootstrap/system-partition-classification.js';
import {
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from './rebalancer-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_REASON,
} from './storage-admission-constants.js';
import {OperationType} from './replica-status.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_DEFER = 'defer';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_SECONDARY = 'secondary=';
const LOCAL_STR_COMMA = ',';
const LOCAL_STR_NODE_REASON_CODES = 'node_reason_codes=';

const PROVISIONING_ADMISSION_EVALUATION_STATE = Object.freeze({
  CHECK_ADD: 'check_add',
  CHECK_REPLACE: 'check_replace',
  NO_ADMISSION_REQUIRED: 'no_admission_required',
});

class ProvisioningAdmissionPolicy {
  /**
   * @param {Object} options
   * @param {string} [options.nodeId]
   * @param {Object} [options.logger]
   * @param {Object} [options.delegates]
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.logger = options.logger || console;
    this.delegates = options.delegates || {};
  }

  /**
   * @return {string|null}
   * @private
   */
  getNodeId() {
    if (typeof this.delegates.getNodeId === LOCAL_STR_FUNCTION) {
      return this.delegates.getNodeId();
    }
    return this.nodeId;
  }

  /**
   * @return {Object|null}
   * @private
   */
  getControlPlaneReadinessService() {
    if (typeof this.delegates.getControlPlaneReadinessService === LOCAL_STR_FUNCTION) {
      return this.delegates.getControlPlaneReadinessService();
    }
    return null;
  }

  /**
   * @return {Object|null}
   * @private
   */
  getStorageAdmissionService() {
    if (typeof this.delegates.getStorageAdmissionService === LOCAL_STR_FUNCTION) {
      return this.delegates.getStorageAdmissionService();
    }
    return null;
  }

  /**
   * @return {Object|null}
   * @private
   */
  getStorageAccountingService() {
    if (typeof this.delegates.getStorageAccountingService === LOCAL_STR_FUNCTION) {
      return this.delegates.getStorageAccountingService();
    }
    return null;
  }

  /**
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isCriticalSystemPartition(partitionId) {
    if (typeof this.delegates.isCriticalSystemPartition === LOCAL_STR_FUNCTION) {
      return this.delegates.isCriticalSystemPartition(partitionId) === true;
    }
    return false;
  }

  /**
   * Resolve whether one admission should use critical-system semantics.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  resolveAdmissionCriticality(context = {}) {
    const partitionId =
      context.partitionId ||
      context.entityId ||
      context.move?.partitionId ||
      context.move?.entityId ||
      null;
    return this.isCriticalSystemPartition(partitionId);
  }

  /**
   * @param {string} moveType
   * @return {string|null}
   * @private
   */
  normalizeMoveType(moveType) {
    if (typeof this.delegates.normalizeMoveType === LOCAL_STR_FUNCTION) {
      return this.delegates.normalizeMoveType(moveType);
    }
    return moveType;
  }

  /**
   * @param {Object} move
   * @return {string}
   * @private
   */
  normalizeControlPlaneMutationWorkClass(move) {
    return normalizeControlPlaneMutationWorkClass(
      move?.controlPlaneMutationWorkClass,
      CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE,
    );
  }

  /**
   * Build an admission result for local control-plane mutation unhealthiness.
   * @param {Object} blocker
   * @return {Object}
   */
  buildLocalControlPlaneMutationAdmissionResult(blocker) {
    const reasonCodes = Array.isArray(blocker?.reasonCodes) &&
        blocker.reasonCodes.length > NUM.ZERO ?
      blocker.reasonCodes :
      [STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY];
    const firstReason = String(
      reasonCodes[NUM.ZERO] ||
      STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
    );
    const nodeSummary = blocker?.readiness &&
        typeof blocker.readiness === 'object' ?
      Object.freeze({
        status: blocker.readiness.lifecycleState ?? null,
        connectionState:
          blocker.readiness.nodeEvidence?.connectionState ?? null,
        lastHeartbeat:
          blocker.readiness.nodeEvidence?.lastHeartbeat ?? null,
        readyLeaseExpiresAt:
          blocker.readiness.nodeEvidence?.readyLeaseExpiresAt ?? null,
        storageBudgetBytes:
          blocker.readiness.capacity?.storageBudgetBytes ?? null,
      }) :
      null;
    return Object.freeze({
      allowed: false,
      decision: LOCAL_STR_DEFER,
      decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
      reason: firstReason,
      blockingReasons: Object.freeze(
        reasonCodes.map((code) => Object.freeze({code})),
      ),
      eligibleNodeIds: Object.freeze([]),
      ineligibleNodes: Object.freeze([
        Object.freeze({
          nodeId: blocker?.nodeId || this.getNodeId(),
          failedDimensions:
            Array.isArray(blocker?.failedDimensions) ?
              [...blocker.failedDimensions] :
              [],
          reasonCodes: Object.freeze([...reasonCodes]),
          nodeSummary,
          readinessSnapshot: blocker?.readinessSnapshot || null,
        }),
      ]),
    });
  }

  /**
   * Defer optional background topology mutation when local control-plane
   * readiness is degraded.
   * @param {Object} move
   * @return {void}
   */
  assertLocalControlPlaneMutationReady(move) {
    if (!requiresStableLocalControlPlaneMutationReadiness(
      this.normalizeControlPlaneMutationWorkClass(move),
    )) {
      return;
    }

    // Priority control-plane recovery moves are the actuation that REOPENS
    // the writability dimensions this veto checks; vetoing them on a
    // recovery-degraded leader severs the in-flight operation's only
    // convergence driver (CL-028). The bypass itself only relaxes the two
    // circular dimensions and only while the recovery lane is open.
    const blocker = getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.getNodeId(),
      controlPlaneReadinessService: this.getControlPlaneReadinessService(),
      allowPriorityRecoveryBypass: isPriorityControlPlanePartition({
        partitionId: move?.partitionId || move?.entityId || null,
      }),
    });
    if (!blocker) {
      return;
    }

    const admissionResult =
      this.buildLocalControlPlaneMutationAdmissionResult(blocker);
    const error = this.createProvisioningAdmissionError(move, admissionResult);
    error.rebalanceSkipReason = REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY;
    throw error;
  }

  /**
   * Probe provisioning admission without persisting replica_operations rows.
   * @param {Object} move
   * @return {Promise<Object>}
   */
  async checkProvisioningAdmission(move) {
    const moveType = this.normalizeMoveType(move?.type);
    if (moveType !== OperationType.ADD &&
        moveType !== OperationType.REPLACE) {
      return {
        allowed: true,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        admissionResult: {
          allowed: true,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        },
      };
    }

    const entityType = move.entityType || SERVICE_TYPE.PARTITION;
    const entityId = move.entityId || move.partitionId;
    const partitionId = move.partitionId || entityId;
    const normalizedMove = {
      ...move,
      type: moveType,
    };
    const sourceNodeId = moveType === OperationType.REPLACE ?
      (move.sourceNodeId || this.getNodeId()) :
      this.getNodeId();

    try {
      await this.ensureProvisioningAdmissionAllowed({
        move: normalizedMove,
        entityType,
        entityId,
        partitionId,
        sourceNodeId,
      });
      return {
        allowed: true,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        admissionResult: {
          allowed: true,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        },
      };
    } catch (error) {
      if (!error?.admissionResult) {
        throw error;
      }
      return {
        allowed: false,
        decisionType:
          error.admissionResult?.decisionType ||
          STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
        admissionResult: error.admissionResult,
        error,
      };
    }
  }

  /**
   * Ensure storage admission approves one storage-increasing workflow.
   * @param {Object} context
   * @return {Promise<void>}
   */
  async ensureProvisioningAdmissionAllowed(context) {
    const {moveType, admissionResult, estimatedBytes} =
      await this.evaluateProvisioningAdmission(context);
    if (!admissionResult) {
      return;
    }
    if (admissionResult.allowed === true ||
        admissionResult.decisionType ===
          STORAGE_ADMISSION_DECISION_TYPE.ADMITTED) {
      return;
    }

    const firstIneligibleNode = Array.isArray(admissionResult.ineligibleNodes) &&
      admissionResult.ineligibleNodes.length > NUM.ZERO ?
      admissionResult.ineligibleNodes[NUM.ZERO] :
      null;
    this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.PROVISIONING_ADMISSION_DENIED, {
      moveType,
      targetNodeId: context?.move?.nodeId || null,
      sourceNodeId: context?.sourceNodeId || null,
      estimatedBytes,
      decisionType: admissionResult?.decisionType || null,
      blockingReasons: Array.isArray(admissionResult?.blockingReasons) ?
        admissionResult.blockingReasons :
        [],
      eligibleNodeIds: Array.isArray(admissionResult?.eligibleNodeIds) ?
        admissionResult.eligibleNodeIds :
        [],
      firstIneligibleNode: firstIneligibleNode ?
        {
          nodeId: firstIneligibleNode.nodeId || null,
          failedDimensions: Array.isArray(firstIneligibleNode.failedDimensions) ?
            firstIneligibleNode.failedDimensions :
            [],
          reasonCodes: Array.isArray(firstIneligibleNode.reasonCodes) ?
            firstIneligibleNode.reasonCodes :
            [],
          nodeSummary: firstIneligibleNode.nodeSummary &&
            typeof firstIneligibleNode.nodeSummary === LOCAL_STR_OBJECT ?
            {
              status: firstIneligibleNode.nodeSummary.status ?? null,
              connectionState:
                firstIneligibleNode.nodeSummary.connectionState ??
                null,
              lastHeartbeat:
                firstIneligibleNode.nodeSummary.lastHeartbeat ??
                null,
              readyLeaseExpiresAt:
                firstIneligibleNode.nodeSummary.readyLeaseExpiresAt ??
                null,
              storageBudgetBytes:
                firstIneligibleNode.nodeSummary.storageBudgetBytes ??
                null,
            } :
            null,
        } :
        null,
    });

    throw this.createProvisioningAdmissionError(
      context.move,
      admissionResult,
    );
  }

  /**
   * Evaluate storage admission for one storage-increasing move.
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async evaluateProvisioningAdmission(context) {
    const evaluation =
      this.buildProvisioningAdmissionEvaluationSnapshot(context);
    if (evaluation.state ===
        PROVISIONING_ADMISSION_EVALUATION_STATE.NO_ADMISSION_REQUIRED) {
      return {
        moveType: evaluation.moveType,
        state: evaluation.state,
        admissionResult: null,
        estimatedBytes: NUM.ZERO,
      };
    }

    this.assertProvisioningAdmissionDependencies(evaluation.moveType);
    const storageAdmissionService = this.getStorageAdmissionService();
    const admissionResult = await this.executeProvisioningAdmissionCheck(
      evaluation,
      storageAdmissionService,
    );

    assertCritical(
      admissionResult,
      REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_REQUIRED,
    );
    return {
      moveType: evaluation.moveType,
      state: evaluation.state,
      admissionResult,
      estimatedBytes: evaluation.estimatedBytes,
    };
  }

  /**
   * Normalize one provisioning-admission evaluation into one explicit state
   * snapshot before dispatching to admission owners.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildProvisioningAdmissionEvaluationSnapshot(context) {
    const moveType = this.normalizeMoveType(context?.move?.type);
    const state = this.resolveProvisioningAdmissionEvaluationState(moveType);
    return Object.freeze({
      moveType,
      state,
      targetNodeId: context?.move?.nodeId || null,
      sourceNodeId: context?.sourceNodeId || null,
      estimatedBytes: state ===
          PROVISIONING_ADMISSION_EVALUATION_STATE.NO_ADMISSION_REQUIRED ?
        NUM.ZERO :
        this.estimateProvisioningAdmissionBytes(context?.entityType),
      isCritical: this.resolveAdmissionCriticality(context),
    });
  }

  /**
   * Resolve one provisioning-admission state from one normalized move type.
   * @param {string|null} moveType
   * @return {string}
   * @private
   */
  resolveProvisioningAdmissionEvaluationState(moveType) {
    if (moveType === OperationType.ADD) {
      return PROVISIONING_ADMISSION_EVALUATION_STATE.CHECK_ADD;
    }
    if (moveType === OperationType.REPLACE) {
      return PROVISIONING_ADMISSION_EVALUATION_STATE.CHECK_REPLACE;
    }
    return PROVISIONING_ADMISSION_EVALUATION_STATE.NO_ADMISSION_REQUIRED;
  }

  /**
   * Execute one admission-owner check from one normalized evaluation snapshot.
   * @param {Object} evaluation
   * @param {Object} storageAdmissionService
   * @return {Promise<Object>}
   * @private
   */
  async executeProvisioningAdmissionCheck(
    evaluation,
    storageAdmissionService,
  ) {
    if (evaluation.state ===
        PROVISIONING_ADMISSION_EVALUATION_STATE.CHECK_ADD) {
      return storageAdmissionService.checkAdd({
        targetNodeId: evaluation.targetNodeId,
        estimatedBytes: evaluation.estimatedBytes,
        isCritical: evaluation.isCritical,
      });
    }

    return storageAdmissionService.checkReplace({
      sourceNodeId: evaluation.sourceNodeId,
      targetNodeId: evaluation.targetNodeId,
      estimatedBytes: evaluation.estimatedBytes,
      isCritical: evaluation.isCritical,
    });
  }

  /**
   * Estimate replica bytes for admission decisions.
   * @param {string} entityType
   * @return {number}
   */
  estimateProvisioningAdmissionBytes(entityType) {
    const storageAccountingService = this.getStorageAccountingService();
    if (!storageAccountingService ||
        typeof storageAccountingService.estimateReplicaBytes !== LOCAL_STR_FUNCTION) {
      return NUM.ZERO;
    }
    return storageAccountingService.estimateReplicaBytes({
      entityType: entityType || SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.ZERO,
    });
  }

  /**
   * Verify admission and accounting owners are available for storage-increasing
   * moves.
   * @param {string} moveType
   * @return {void}
   */
  assertProvisioningAdmissionDependencies(moveType) {
    const storageAdmissionService = this.getStorageAdmissionService();
    const storageAccountingService = this.getStorageAccountingService();

    assertCritical(
      storageAdmissionService,
      REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_REQUIRED,
    );
    assertCritical(
      storageAccountingService &&
        typeof storageAccountingService.estimateReplicaBytes ===
          LOCAL_STR_FUNCTION,
      REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED,
    );
    if (moveType === OperationType.ADD) {
      assertCritical(
        typeof storageAdmissionService.checkAdd === LOCAL_STR_FUNCTION,
        REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_CHECK_ADD_REQUIRED,
      );
    }
    if (moveType === OperationType.REPLACE) {
      assertCritical(
        typeof storageAdmissionService.checkReplace === LOCAL_STR_FUNCTION,
        REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_CHECK_REPLACE_REQUIRED,
      );
    }
  }

  /**
   * Build a typed admission-denied error for coordinator callers.
   * @param {Object} move
   * @param {Object} admissionResult
   * @return {Error}
   */
  createProvisioningAdmissionError(move, admissionResult) {
    const blockingReasons = Array.isArray(admissionResult?.blockingReasons) ?
      admissionResult.blockingReasons.map((reason) => String(
        reason?.code ||
        reason?.reason ||
        reason ||
        '',
      )).filter((reason) => reason.length > NUM.ZERO) :
      [];
    const primaryReason = blockingReasons.length > NUM.ZERO ?
      String(
        blockingReasons[NUM.ZERO] ||
        '',
      ) :
      String(admissionResult?.reason || admissionResult?.decisionType || '');
    const secondaryReasons = blockingReasons
      .slice(NUM.ONE)
      .filter((reason) => reason !== primaryReason)
      .slice(0, 3);
    const firstIneligibleReasonCodes = Array.isArray(
      admissionResult?.ineligibleNodes?.[NUM.ZERO]?.reasonCodes,
    ) ?
      admissionResult.ineligibleNodes[NUM.ZERO].reasonCodes
        .map((reason) => String(reason || ''))
        .filter((reason) => reason.length > NUM.ZERO)
        .slice(0, 4) :
      [];
    const diagnosticsSuffixParts = [];
    if (secondaryReasons.length > NUM.ZERO) {
      diagnosticsSuffixParts.push(
        LOCAL_STR_SECONDARY + secondaryReasons.join(LOCAL_STR_COMMA),
      );
    }
    if (firstIneligibleReasonCodes.length > NUM.ZERO) {
      diagnosticsSuffixParts.push(
        LOCAL_STR_NODE_REASON_CODES + firstIneligibleReasonCodes.join(LOCAL_STR_COMMA),
      );
    }
    const diagnosticsSuffix = diagnosticsSuffixParts.length > NUM.ZERO ?
      ` (${diagnosticsSuffixParts.join('; ')})` :
      '';
    const error = new Error(
      `Provisioning admission ${admissionResult?.decisionType || 'blocked'} ` +
      `for ${move?.type || 'operation'} on ${move?.nodeId || 'unknown'}` +
      (primaryReason ? `: ${primaryReason}` : '') +
      diagnosticsSuffix,
    );
    error.admissionResult = admissionResult;
    return error;
  }
}

export {ProvisioningAdmissionPolicy};
