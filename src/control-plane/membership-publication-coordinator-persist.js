import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
} from './control-plane-error-classification.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {publicationRowSatisfiesDesiredState} from './control-plane-publication-merge.js';
import {
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
  PUBLICATION_WRITE_MAX_ATTEMPTS,
} from './membership-publication-row-contract.js';
import {
  listEquals,
  normalizePositiveInteger,
} from './membership-publication-row-helpers.js';
import {
  buildPublicationReadOptions,
  mergePublicationRows,
  serializeMembershipPublicationRow,
} from './membership-publication-planning-evidence.js';
import {acknowledgeMembershipPublication} from './membership-publication-acknowledgement.js';
import {MembershipPublicationCoordinatorPlanning} from './membership-publication-coordinator-planning.js';
import {
  readActiveGateMembershipPublicationVisibleRow,
  readActiveGateMembershipPublicationVisibleReconcileRow,
  reconcileActiveGateMembershipPublication,
} from './membership-publication-active-gate-reconcile.js';
import {
  CONTROL_PLANE_CONVERGENCE_FIELD,
  CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION,
  buildCriticalControlPlaneConvergenceOptions,
} from './membership-publication-control-plane-convergence.js';

class MembershipPublicationCoordinatorPersist extends
  MembershipPublicationCoordinatorPlanning {
  async ensureWorkflow(ownerKey, candidate) {
    const existingWorkflow = this.workflowCoordinator.getWorkflowByOwnerKey(ownerKey);
    if (existingWorkflow) {
      return existingWorkflow;
    }
    return this.workflowCoordinator.registerWorkflow({
      workflowId: `membership-publication:${candidate.publicationEpoch}`,
      ownerKey,
      step: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.IDLE,
      metadata: {
        publicationKind: candidate.publicationKind,
      },
      transitionHistory: [],
    });
  }

  async persistPublicationRow(row, options = {}) {
    const ownerKey =
      options[CONTROL_PLANE_CONVERGENCE_FIELD
        .CONTROL_PLANE_CONVERGENCE_OWNER_KEY] || this.buildOwnerKey();
    const publicationOptions = buildCriticalControlPlaneConvergenceOptions(
      options,
      {
        ownerKey,
        operation:
          options[CONTROL_PLANE_CONVERGENCE_FIELD
            .CONTROL_PLANE_CONVERGENCE_OPERATION] ||
          CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.MEMBERSHIP_PUBLICATION,
      },
    );
    let persistedRow = serializeMembershipPublicationRow(row);
    if (
      this.controlPlanePublicationsOwner &&
      typeof this.controlPlanePublicationsOwner.upsertPublication === TYPEOF.FUNCTION
    ) {
      const publicationId = persistedRow.publication_id || null;
      const canVerifyPersistedRow =
        publicationId &&
        options.skipPublicationWriteReadback !== true &&
        typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION;
      const maxAttempts = normalizePositiveInteger(
        options.publicationWriteMaxAttempts,
        PUBLICATION_WRITE_MAX_ATTEMPTS,
      );
      for (let attempt = NUM.ZERO; attempt < maxAttempts; attempt += NUM.ONE) {
        if (canVerifyPersistedRow) {
          const currentRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(publicationOptions),
          );
          persistedRow = serializeMembershipPublicationRow(
            mergePublicationRows(persistedRow, currentRow),
          );
        }
        try {
          await this.controlPlanePublicationsOwner.upsertPublication(
            persistedRow,
            publicationOptions,
          );
        } catch (error) {
          if (!canVerifyPersistedRow || attempt + NUM.ONE >= maxAttempts) {
            throw error;
          }
          const durableRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(publicationOptions),
          );
          if (publicationRowSatisfiesDesiredState(durableRow, persistedRow)) {
            return serializeMembershipPublicationRow(
              mergePublicationRows(durableRow, persistedRow),
            );
          }
          persistedRow = serializeMembershipPublicationRow(
            mergePublicationRows(durableRow, persistedRow),
          );
          continue;
        }
        if (!canVerifyPersistedRow) {
          return persistedRow;
        }
        if (options.skipPublicationWriteReadback === true) {
          return persistedRow;
        }
        const durableRow = await this.controlPlanePublicationsOwner.getPublication(
          publicationId,
          buildPublicationReadOptions(publicationOptions),
        );
        if (publicationRowSatisfiesDesiredState(durableRow, persistedRow)) {
          return serializeMembershipPublicationRow(mergePublicationRows(durableRow, persistedRow));
        }
        persistedRow = serializeMembershipPublicationRow(
          mergePublicationRows(durableRow, persistedRow),
        );
      }
    }
    return persistedRow;
  }

  async acknowledgePublication(publicationId, nodeId, options = {}) {
    const acknowledgementOwnerKey = `${this.buildOwnerKey()}:ack:${publicationId}`;
    const acknowledgementOptions = buildCriticalControlPlaneConvergenceOptions(
      options,
      {
        ownerKey: acknowledgementOwnerKey,
        operation: CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.PUBLICATION_ACK,
      },
    );
    return this.publicationAcknowledgementLane.run(
      {
        ownerKey: acknowledgementOwnerKey,
        [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_CLASS]:
          CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
      },
      async () => {
        let existingRow = null;
        if (
          this.controlPlanePublicationsOwner &&
          typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION
        ) {
          existingRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(acknowledgementOptions),
          );
        }
        const baseRow = mergePublicationRows(
          existingRow,
          acknowledgementOptions.publicationRow || null,
        );
        if (!baseRow) {
          return null;
        }
        const normalizedBaseRow = normalizeControlPlanePublicationRow(baseRow);
        const acknowledgedRow = acknowledgeMembershipPublication({
          publicationRow: baseRow,
          nodeId,
          nowMs: this.now(),
          timeoutMs: acknowledgementOptions.timeoutMs,
          timeoutReasonCode: acknowledgementOptions.timeoutReasonCode,
        });
        const normalizedAcknowledgedRow = normalizeControlPlanePublicationRow(acknowledgedRow);
        const acknowledgementChanged =
          normalizedAcknowledgedRow.status !== normalizedBaseRow.status ||
          !listEquals(
            normalizedAcknowledgedRow.acknowledgedNodeIds,
            normalizedBaseRow.acknowledgedNodeIds,
          );
        if (!acknowledgementChanged) {
          return acknowledgedRow;
        }
        return this.persistPublicationRow(acknowledgedRow, acknowledgementOptions);
      },
    );
  }

  async readActiveGateMembershipPublicationVisibleRow(
    publicationRow,
    target,
    context,
  ) {
    return readActiveGateMembershipPublicationVisibleRow(
      this,
      publicationRow,
      target,
      context,
    );
  }

  async readActiveGateMembershipPublicationVisibleReconcileRow(
    reconcileOutcome,
    target,
    context,
  ) {
    return readActiveGateMembershipPublicationVisibleReconcileRow(
      this,
      reconcileOutcome,
      target,
      context,
    );
  }

  async reconcileActiveGateMembershipPublication(
    publicationActiveGateHandoff,
    options = {},
  ) {
    return reconcileActiveGateMembershipPublication(
      this,
      publicationActiveGateHandoff,
      options,
    );
  }

  getControlPlaneOwnerQueueDepth() {
    const ownerKey = this.buildOwnerKey();
    const queueDiagnostics =
      typeof this.reconcileQueue?.getDiagnostics === TYPEOF.FUNCTION ?
        this.reconcileQueue.getDiagnostics() :
        null;
    const pendingKeys = Array.isArray(queueDiagnostics?.pendingKeys) ?
      queueDiagnostics.pendingKeys.map(String) :
      (
        this.reconcileQueue?.pending instanceof Map ?
          [...this.reconcileQueue.pending.keys()].map(String) :
          []
      );
    const retryingKeys = Array.isArray(queueDiagnostics?.retryingKeys) ?
      queueDiagnostics.retryingKeys.map(String) :
      (
        this.reconcileQueue?.retryWorkItems instanceof Map ?
          [...this.reconcileQueue.retryWorkItems.keys()].map(String) :
          []
      );
    const inFlightKeys = Array.isArray(queueDiagnostics?.inFlightKeys) ?
      queueDiagnostics.inFlightKeys.map(String) :
      (
        this.reconcileQueue?.inFlight instanceof Set ?
          [...this.reconcileQueue.inFlight].map(String) :
          []
      );
    const pendingWrites = [
      pendingKeys.includes(ownerKey),
      retryingKeys.includes(ownerKey),
      inFlightKeys.includes(ownerKey),
    ].filter(Boolean).length;
    const retryableDrainFailureCount = Number.isFinite(
      queueDiagnostics?.retryableDrainFailureCount,
    ) ?
      Math.max(NUM.ZERO, Math.floor(
        queueDiagnostics.retryableDrainFailureCount,
      )) :
      NUM.ZERO;
    return Object.freeze({
      pendingWrites,
      pendingWriteGrowthCount: NUM.ZERO,
      retainedBacklogGrowthCount:
        retryingKeys.includes(ownerKey) ? NUM.ONE : NUM.ZERO,
      sharedPressureBackpressured: false,
      transportPressureBackpressured: false,
      queryPressureBackpressured: false,
      ownerKey,
      pendingKeys,
      retryingKeys,
      inFlightKeys,
      retryableDrainFailureCount,
    });
  }

  getLaneDiagnostics() {
    const inFlightExecutions =
      this.workflowCoordinator?.inFlightExecutionsByOwnerKey instanceof Map ?
        this.workflowCoordinator.inFlightExecutionsByOwnerKey :
        new Map();
    return Object.freeze({
      reconcileLane: Object.freeze({
        name: this.publicationReconcileLane?.name || null,
        activeExecutionCount: inFlightExecutions.has(this.buildOwnerKey()) ? NUM.ONE : NUM.ZERO,
      }),
      acknowledgementLane: Object.freeze({
        name: this.publicationAcknowledgementLane?.name || null,
        activeExecutionCount: [...inFlightExecutions.keys()].filter((ownerKey) =>
          String(ownerKey).startsWith(`${this.buildOwnerKey()}:ack:`),
        ).length,
      }),
    });
  }
}

export {MembershipPublicationCoordinatorPersist};
