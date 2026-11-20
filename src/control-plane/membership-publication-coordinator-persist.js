import {readStateField, readUpperStateField} from '../utils/state-field-read.js';
import {CDC_OPERATION, TABLES} from '../constants/index.js';
import {LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY} from
  '../cdc/cdc-integration-service-shared-constants.js';
import {resolveLocalSystemTableServices} from
  '../cdc/cdc-integration-service-local-system-table-routing.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  isControlPlaneWriterShutDown,
} from './control-plane-error-classification.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {publicationRowSatisfiesDesiredState} from './control-plane-publication-merge.js';
import {
  MEMBERSHIP_PUBLICATION_STATUS,
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
  PUBLICATION_WRITE_MAX_ATTEMPTS,
} from './membership-publication-row-contract.js';
import {
  FORMATION_REFUSAL_REASON,
  FORMATION_TRANSITION_ACTION,
  FORMATION_TRANSITION_OUTCOME,
  FORMATION_TRANSITION_TYPE,
  buildFormationLatchBody,
  decodeFormationRecord,
  evaluateFormationLatch,
  readFormationRecordIn,
  requestFormationLatch,
} from './membership-publication-formation-record.js';
import {shouldDeferMembershipReconcileToWriteLeader} from
  './membership-publication-coordinator-reconcile-helpers.js';
import {PARTITION_SERVICE_EVENT} from
  '../partition/partition-service-constants.js';
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
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const PUBLICATION_WRITE_UNCONFIRMED_OUTCOME =
  'unconfirmed_row_returned_as_persisted';
const PUBLICATION_WRITE_CONFIRMATION_WAIT = Object.freeze({
  wait: 'PUBLICATION_WRITE_MAX_ATTEMPTS',
  awaited: 'durable publication row satisfying the desired state after ' +
    'upsert + readback',
});

// Every publication write attempt is spent without a readback that
// satisfies the desired row. The caller still gets the unconfirmed row
// (unchanged behaviour; the owner finding is recorded in the quest log).
function reportPublicationWriteUnconfirmed(coordinator, spent) {
  reportWaitBoundSpent(coordinator.logger, {
    ...PUBLICATION_WRITE_CONFIRMATION_WAIT,
    boundMs: null,
    lastObserved: () => ({
      attempts: spent.maxAttempts,
      outcome: PUBLICATION_WRITE_UNCONFIRMED_OUTCOME,
      status: readStateField(spent.row?.status),
      publicationEpoch: spent.row?.publication_epoch ?? null,
      acknowledgedCount: Array.isArray(spent.row?.acknowledged_node_ids) ?
        spent.row.acknowledged_node_ids.length :
        null,
    }),
    scope: {
      nodeId: coordinator.nodeId ?? null,
      publicationId: spent.publicationId,
    },
  });
}

// What a failed publication write leaves to do. A failed answer does not
// prove the row is absent (a committed write can answer failed), so while
// attempts remain the durable row is read back and the write re-attempted.
// The one exception is the CDC service's terminal shut-down answer: nothing
// can be read back or re-attempted through a torn-down writer.
const PUBLICATION_WRITE_FAILURE_NEXT_STEP = Object.freeze({
  VERIFY_AND_REATTEMPT: 'verify_and_reattempt',
  FAIL: 'fail',
});
const LATCH_REASON_LEADER_PARTITION_UNAVAILABLE =
  'LEADER_PARTITION_UNAVAILABLE';
const LATCH_REASON_BODY_INVALID = 'LATCH_BODY_INVALID';
const DEFAULT_FORMATION_LATCH_NODE_ID = 'publication-coordinator';
const FORMATION_WATCHED_TABLES = new Set([
  TABLES.CONTROL_PLANE_PUBLICATIONS,
  TABLES.SERVICES,
  TABLES.NODES,
  TABLES.PARTITIONS,
]);

function readLeaderFormationRow(partitionService) {
  const storage = partitionService?.db;
  return storage ? readFormationRecordIn(storage) : undefined;
}

function syncCommittedFormationRow(coordinator, partitionService) {
  const committedRow = readLeaderFormationRow(partitionService);
  if (committedRow) {
    coordinator.projectCommittedFormationRow(committedRow);
  }
  return committedRow;
}

function retainedLatchAttemptsOf(coordinator) {
  if (!coordinator.retainedFormationLatchAttempts) {
    coordinator.retainedFormationLatchAttempts = new Map();
  }
  return coordinator.retainedFormationLatchAttempts;
}

function getOrBuildFormationLatchAttempt(coordinator, evaluation, nowMs) {
  const entryId =
    `formation-latch:${evaluation.clusterId}:` +
    `${evaluation.formedPublicationEpoch}`;
  const retained = retainedLatchAttemptsOf(coordinator);
  const existing = retained.get(entryId);
  if (existing) {
    return existing;
  }
  const body = buildFormationLatchBody({
    clusterId: evaluation.clusterId,
    declaredHostCount: evaluation.declaredHostCount,
    formedAt: nowMs,
    formedByNodeId: coordinator.nodeId || DEFAULT_FORMATION_LATCH_NODE_ID,
    formedPublicationEpoch: evaluation.formedPublicationEpoch,
    formedHostIds: evaluation.formedHostIds,
    formedReadyNodeIds: evaluation.formedReadyNodeIds,
    priorityPartitionVoters: evaluation.priorityPartitionVoters,
  });
  if (!body) {
    return {entryId, body: null};
  }
  const attempt = Object.freeze({entryId, body});
  retained.set(entryId, attempt);
  return attempt;
}

function isSettledTerminalFormationLatchResponse(response) {
  if (response?.deferRetry === true) {
    return false;
  }
  const result = response?.formationResult;
  if (!result) {
    return false;
  }
  if (
    result.outcome === FORMATION_TRANSITION_OUTCOME.APPLIED ||
    result.outcome === FORMATION_TRANSITION_OUTCOME.SETTLED
  ) {
    return true;
  }
  return (
    result.outcome === FORMATION_TRANSITION_OUTCOME.REFUSED &&
    result.reason !== FORMATION_REFUSAL_REASON.CDC_CAPACITY
  );
}

async function submitFormationLatchCommand(
  coordinator,
  partitionService,
  evaluation,
  nowMs,
) {
  const attempt = partitionService ?
    getOrBuildFormationLatchAttempt(coordinator, evaluation, nowMs) :
    {entryId: null, body: null};
  if (!partitionService || !attempt.body) {
    return {
      latched: false,
      evaluation,
      reason: !partitionService ?
        LATCH_REASON_LEADER_PARTITION_UNAVAILABLE :
        LATCH_REASON_BODY_INVALID,
    };
  }
  const response = await requestFormationLatch(partitionService, attempt);
  if (isSettledTerminalFormationLatchResponse(response)) {
    retainedLatchAttemptsOf(coordinator).delete(attempt.entryId);
  }
  if (response?.success === true) {
    syncCommittedFormationRow(coordinator, partitionService);
  }
  return {latched: response?.success === true, evaluation, response};
}

function resolvePublicationWriteFailureNextStep(
  error,
  canVerifyPersistedRow,
  attemptsLeft,
) {
  return canVerifyPersistedRow && attemptsLeft > 0 &&
    !isControlPlaneWriterShutDown(error) ?
    PUBLICATION_WRITE_FAILURE_NEXT_STEP.VERIFY_AND_REATTEMPT :
    PUBLICATION_WRITE_FAILURE_NEXT_STEP.FAIL;
}

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
      typeof this.controlPlanePublicationsOwner.upsertPublication === 'function'
    ) {
      const publicationId = persistedRow.publication_id || null;
      const canVerifyPersistedRow =
        publicationId &&
        options.skipPublicationWriteReadback !== true &&
        typeof this.controlPlanePublicationsOwner.getPublication === 'function';
      const maxAttempts = normalizePositiveInteger(
        options.publicationWriteMaxAttempts,
        PUBLICATION_WRITE_MAX_ATTEMPTS,
      );
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
          if (
            resolvePublicationWriteFailureNextStep(
              error,
              canVerifyPersistedRow,
              maxAttempts - attempt - 1,
            ) === PUBLICATION_WRITE_FAILURE_NEXT_STEP.FAIL
          ) {
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
          const finalRow = serializeMembershipPublicationRow(
            mergePublicationRows(durableRow, persistedRow),
          );
          const latchPromise =
            this._maybeLatchFormationAfterPublicationWrite(finalRow);
          if (latchPromise) {
            await latchPromise;
          }
          return finalRow;
        }
        persistedRow = serializeMembershipPublicationRow(
          mergePublicationRows(durableRow, persistedRow),
        );
      }
      reportPublicationWriteUnconfirmed(this, {
        maxAttempts,
        publicationId,
        row: persistedRow,
      });
    }
    const latchPromise =
      this._maybeLatchFormationAfterPublicationWrite(persistedRow);
    if (latchPromise) {
      await latchPromise;
    }
    return persistedRow;
  }

  _maybeLatchFormationAfterPublicationWrite(publicationRow) {
    if (
      !this.getPublicationsLeaderPartitionService() ||
      readUpperStateField(publicationRow?.status) !==
        MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED
    ) {
      return;
    }
    const check = this._checkFormationLatchEligibility?.({publicationRow});
    if (check?.shouldLatch === true) {
      return submitFormationLatchCommand(
        this,
        check.partitionService,
        check.evaluation,
        check.nowMs,
      ).catch(() => {});
    }
  }

  getPublicationsLeaderPartitionService() {
    if (this.publicationsPartitionService) {
      return this.publicationsPartitionService;
    }
    const services = this.cdcIntegrationService ?
      resolveLocalSystemTableServices(
        this.cdcIntegrationService,
        TABLES.CONTROL_PLANE_PUBLICATIONS,
        {consistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER},
      ) :
      undefined;
    return services?.[0];
  }

  projectCommittedFormationRow(row) {
    if (!row || this._projectingFormationRow === true) {
      return;
    }
    this._projectingFormationRow = true;
    try {
      this.systemTableCache?.applySystemTableChange?.(
        TABLES.CONTROL_PLANE_PUBLICATIONS,
        CDC_OPERATION.UPDATE,
        row,
      );
      const decoded = decodeFormationRecord(row);
      const serveOwner =
        this.controlPlaneReadinessService?.getServeEligibilityOwner?.();
      serveOwner?.adoptFormationObservation?.(decoded);
      serveOwner?.scheduleRefresh?.();
    } finally {
      this._projectingFormationRow = false;
    }
  }

  _checkFormationLatchEligibility(context = {}) {
    if (shouldDeferMembershipReconcileToWriteLeader(this)) {
      return {shouldLatch: false, result: {latched: false, deferred: true}};
    }
    const partitionService = this.getPublicationsLeaderPartitionService();
    const committedFormationRow = syncCommittedFormationRow(
      this,
      partitionService,
    );
    const nowMs = this.now();
    const evaluation = evaluateFormationLatch({
      systemTableCache: this.systemTableCache,
      ...(committedFormationRow !== undefined ?
        {formationRow: committedFormationRow} :
        {}),
      publicationRow: context.publicationRow || null,
      nowMs,
    });
    return {
      shouldLatch: evaluation.shouldLatch === true,
      partitionService,
      evaluation,
      nowMs,
      result: {latched: false, evaluation},
    };
  }

  async evaluateAndLatchFormationIfEligible(context = {}) {
    const check = this._checkFormationLatchEligibility(context);
    return check.shouldLatch === true ?
      submitFormationLatchCommand(
        this,
        check.partitionService,
        check.evaluation,
        check.nowMs,
      ) :
      check.result;
  }

  attachFormationLatchTriggers(options = {}) {
    if (!this._formationCacheTriggerListener && this.systemTableCache) {
      this._formationCacheTriggerListener = (tableNameOrChange) => {
        if (
          this._projectingFormationRow === true ||
          (!FORMATION_WATCHED_TABLES.has(tableNameOrChange) &&
            !FORMATION_WATCHED_TABLES.has(tableNameOrChange?.tableName))
        ) {
          return;
        }
        this.evaluateAndLatchFormationIfEligible().catch(() => {});
      };
      this.systemTableCache.onCacheApplyChange?.(
        this._formationCacheTriggerListener,
      );
    }
    const partitionService =
      options.resolvePartitionService === false ?
        this.publicationsPartitionService || null :
        this.getPublicationsLeaderPartitionService();
    if (partitionService && !this._formationPartitionEntryListener) {
      this._formationAttachedPartitionService = partitionService;
      this._formationPartitionEntryListener = (event) => {
        if (
          event?.command?.type === FORMATION_TRANSITION_TYPE &&
          event?.command?.body?.action === FORMATION_TRANSITION_ACTION.DECLARE
        ) {
          this.evaluateAndLatchFormationIfEligible().catch(() => {});
        }
      };
      partitionService.on?.(
        PARTITION_SERVICE_EVENT.ENTRY_COMMITTED,
        this._formationPartitionEntryListener,
      );
    }
  }

  detachFormationLatchTriggers() {
    if (this._formationCacheTriggerListener) {
      this.systemTableCache?.offCacheApplyChange?.(
        this._formationCacheTriggerListener,
      );
    }
    this._formationCacheTriggerListener = null;
    if (this._formationPartitionEntryListener) {
      this._formationAttachedPartitionService?.off?.(
        PARTITION_SERVICE_EVENT.ENTRY_COMMITTED,
        this._formationPartitionEntryListener,
      );
    }
    this._formationPartitionEntryListener = null;
    this._formationAttachedPartitionService = null;
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
          typeof this.controlPlanePublicationsOwner.getPublication === 'function'
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
      typeof this.reconcileQueue?.getDiagnostics === 'function' ?
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
      Math.max(0, Math.floor(
        queueDiagnostics.retryableDrainFailureCount,
      )) :
      0;
    return Object.freeze({
      pendingWrites,
      pendingWriteGrowthCount: 0,
      retainedBacklogGrowthCount:
        retryingKeys.includes(ownerKey) ? 1 : 0,
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
        activeExecutionCount: inFlightExecutions.has(this.buildOwnerKey()) ? 1 : 0,
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
