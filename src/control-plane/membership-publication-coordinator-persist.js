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
import {assertPublicationWriteRevision} from './owners/control-plane-publications-owner.js';
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
  normalizePositiveInteger,
} from './membership-publication-row-helpers.js';
import {
  buildPublicationReadOptions,
  serializeMembershipPublicationRow,
} from './membership-publication-planning-evidence.js';
import {PUBLICATION_INTENT_DECISION, decidePublicationIntent, observePublicationIntent,
  publicationAcknowledgementIntent, publicationBirthIntent} from
  './membership-publication-write-intent.js';
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
import {
  captureControlPlaneWriteConfirmation,
  controlPlaneWriteIdentity,
} from './control-plane-write-identity.js';

const PUBLICATION_WRITE_UNCONFIRMED = 'PUBLICATION_WRITE_UNCONFIRMED';
const PUBLICATION_WRITE_IDENTITY_SUBJECT = 'membership-publication';
const PUBLICATION_WRITE_UNCONFIRMED_OUTCOME =
  'durable_publication_unconfirmed';
const PUBLICATION_WRITE_CONFIRMATION_WAIT = Object.freeze({
  wait: 'PUBLICATION_WRITE_MAX_ATTEMPTS',
  awaited: 'durable publication row satisfying the desired state after ' +
    'upsert + readback',
});

// Keep the certification wait bound visible when no authoritative row confirms the write.
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

function publicationWriteUnconfirmed(publicationId, cause) {
  return Object.assign(new Error(`Publication write unconfirmed for ${publicationId}`, {cause}), {
    code: PUBLICATION_WRITE_UNCONFIRMED, deferRetry: true,
  });
}

async function readPublicationForWrite(owner, publicationId, readOptions, writeIdentity) {
  const confirm = captureControlPlaneWriteConfirmation(writeIdentity);
  const row = await owner.getPublication(publicationId, readOptions);
  confirm(row);
  return row;
}

function canUsePublicationCommit(result, publicationId) {
  return result?.success === true && result.committed === true &&
    result.partitionResult?.affectedRows === 1 &&
    result.position?.tableName === TABLES.CONTROL_PLANE_PUBLICATIONS &&
    result.position.key === publicationId &&
    typeof result.position.originHlc === 'string' && result.position.originHlc.length > 0;
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

  async persistPublicationBirth(row, options = {}) {
    return this.persistPublicationIntent(publicationBirthIntent(row), options);
  }

  async persistPublicationIntent(intent, options) {
    const {
      [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_OWNER_KEY]:
        ownerKey = this.buildOwnerKey(),
      [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_OPERATION]:
        operation = CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.MEMBERSHIP_PUBLICATION,
    } = options;
    const publicationOptions = buildCriticalControlPlaneConvergenceOptions(
      options, {ownerKey, operation});
    const publicationId = intent.revision.publication_id;
    const owner = this.controlPlanePublicationsOwner;
    if (!owner || !publicationId) {
      throw publicationWriteUnconfirmed(publicationId);
    }
    const {idempotencyKey, ...writeOptions} = publicationOptions;
    const writeIdentity = controlPlaneWriteIdentity(
      PUBLICATION_WRITE_IDENTITY_SUBJECT, this.nodeId, publicationId, ownerKey,
      idempotencyKey ?? null);
    const readOptions = buildPublicationReadOptions(publicationOptions);
    const maxAttempts = normalizePositiveInteger(
      options.publicationWriteMaxAttempts, PUBLICATION_WRITE_MAX_ATTEMPTS);
    let current = await readPublicationForWrite(owner, publicationId, readOptions, writeIdentity);
    let observedIntent = observePublicationIntent(intent, current);
    let decision = decidePublicationIntent(observedIntent, current);
    let failure;
    for (let attempt = 0; attempt < maxAttempts &&
        decision.state === PUBLICATION_INTENT_DECISION.WRITE; attempt += 1) {
      const candidate = decision.row;
      try {
        const result = await owner.upsertPublication(candidate, {
          ...writeOptions, writeIdentity, expectedPublicationRow: current,
        });
        if (options.skipPublicationWriteReadback === true &&
            canUsePublicationCommit(result, publicationId)) {
          await this._maybeLatchFormationAfterPublicationWrite(candidate);
          return candidate;
        }
      } catch (error) {
        if (isControlPlaneWriterShutDown(error)) throw error;
        failure = error;
      }
      try {
        current = await readPublicationForWrite(owner, publicationId, readOptions, writeIdentity);
      } catch (error) {
        if (isControlPlaneWriterShutDown(error)) throw error;
        reportPublicationWriteUnconfirmed(this, {
          maxAttempts: attempt + 1, publicationId, row: candidate,
        });
        throw publicationWriteUnconfirmed(publicationId, error);
      }
      observedIntent = observePublicationIntent(observedIntent, current);
      decision = decidePublicationIntent(observedIntent, current);
    }
    if (decision.state === PUBLICATION_INTENT_DECISION.CONFIRMED) {
      const confirmed = serializeMembershipPublicationRow(decision.row);
      await this._maybeLatchFormationAfterPublicationWrite(confirmed);
      return confirmed;
    }
    if (decision.state === PUBLICATION_INTENT_DECISION.WRITE) {
      reportPublicationWriteUnconfirmed(this, {maxAttempts, publicationId, row: decision.row});
    }
    throw publicationWriteUnconfirmed(publicationId, failure);
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
        const owner = this.controlPlanePublicationsOwner;
        if (!owner || typeof owner.getPublication !== 'function') {
          throw publicationWriteUnconfirmed(publicationId);
        }
        const baseRow = await owner.getPublication(
          publicationId, buildPublicationReadOptions(acknowledgementOptions));
        if (!baseRow) return null;
        if (acknowledgementOptions.publicationRow) {
          assertPublicationWriteRevision(baseRow, acknowledgementOptions.publicationRow);
        }
        return this.persistPublicationIntent(publicationAcknowledgementIntent(baseRow, {
          nodeId,
          nowMs: this.now(),
          timeoutMs: acknowledgementOptions.timeoutMs,
          timeoutReasonCode: acknowledgementOptions.timeoutReasonCode,
        }), acknowledgementOptions);
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
