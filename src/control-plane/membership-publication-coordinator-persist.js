import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
} from './control-plane-error-classification.js';
import {
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
} from './membership-publication-row-contract.js';
import {
  serializeMembershipPublicationRow,
} from './membership-publication-planning-evidence.js';
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
import {
  PUBLICATION_WRITE_OUTCOME,
  refused,
} from './owners/control-plane-publication-change.js';
import {
  membershipPublicationAcknowledgementChange,
  membershipPublicationRefreshChange,
  membershipPublicationTimeoutAbandonChange,
} from './membership-publication-row-changes.js';
import {
  shouldDeferMembershipReconcileToWriteLeader,
} from './membership-publication-coordinator-reconcile-helpers.js';
import {statePriorityPartitionSummary} from
  './membership-publication-priority-partition-summary.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';

// Why the coordinator refused a publication write before asking the
// publications owner (the owner's and the change's own refusals are named by
// control-plane-publication-change.js and membership-publication-row-changes.js).
const MEMBERSHIP_PUBLICATION_WRITE_REFUSAL = Object.freeze({
  // The coordinator was built without the publications owner.
  PUBLICATIONS_OWNER_UNAVAILABLE: 'publications_owner_unavailable',
  // A node acknowledges only for itself.
  NOT_SELF: 'acknowledging_node_not_self',
  // Only the publications write leader abandons a publication.
  NOT_PUBLICATION_OWNER: 'not_publication_owner',
});

// The projection shows no acknowledgement owed by this node (the row is
// closed, does not require the node, or already holds it): nothing is
// written, and the row answered is the projected one, named as such.
function acknowledgementNotOwed(projectedRow) {
  return Object.freeze({
    outcome: PUBLICATION_WRITE_OUTCOME.UNCHANGED,
    row: projectedRow,
    rowSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
  });
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

  // The delivery options of one publication write of this coordinator.
  buildPublicationWriteOptions(options = {}, operation =
  CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.MEMBERSHIP_PUBLICATION) {
    const ownerKey =
      options[CONTROL_PLANE_CONVERGENCE_FIELD
        .CONTROL_PLANE_CONVERGENCE_OWNER_KEY] || this.buildOwnerKey();
    return {
      ...buildCriticalControlPlaneConvergenceOptions(options, {
        ownerKey,
        operation:
          options[CONTROL_PLANE_CONVERGENCE_FIELD
            .CONTROL_PLANE_CONVERGENCE_OPERATION] || operation,
      }),
      logger: this.logger,
    };
  }

  /**
   * Admit a new publication row (insert-only, revision 1). An admitted row
   * never carries no priority summary: a candidate row without a census (a
   * reconcile that planned without the census inputs) is admitted stating
   * NOT_DERIVED, on which every reader of the spread rule holds.
   * @param {Object} row - The candidate row.
   * @param {Object} [options={}] - The reconcile's convergence options.
   * @return {Promise<Object>} The typed write outcome.
   */
  async admitPublicationRow(row, options = {}) {
    if (!this.controlPlanePublicationsOwner) {
      return refused(MEMBERSHIP_PUBLICATION_WRITE_REFUSAL
        .PUBLICATIONS_OWNER_UNAVAILABLE);
    }
    const {logger: _logger, ...admissionOptions} =
      this.buildPublicationWriteOptions(options);
    return this.controlPlanePublicationsOwner.admitPublication(
      serializeMembershipPublicationRow({
        ...row,
        priority_partition_summary: statePriorityPartitionSummary(
          row.priority_partition_summary),
      }),
      admissionOptions,
    );
  }

  /**
   * Refresh a publication row's summaries and complete the acknowledgements
   * the owner's recovery-eligible rule names, as a change of the durable row.
   * @param {string} publicationId
   * @param {Object} refresh - {priorityPartitionSummary,
   *   membershipLifecycleSummary, acknowledgedNodeIds}.
   * @param {Object} [options={}] - The reconcile's convergence options.
   * @return {Promise<Object>} The typed write outcome.
   */
  async refreshPublicationRow(publicationId, refresh, options = {}) {
    if (!this.controlPlanePublicationsOwner) {
      return refused(MEMBERSHIP_PUBLICATION_WRITE_REFUSAL
        .PUBLICATIONS_OWNER_UNAVAILABLE);
    }
    return this.controlPlanePublicationsOwner.applyPublicationChange(
      publicationId,
      membershipPublicationRefreshChange({...refresh, now: () => this.now()}),
      this.buildPublicationWriteOptions(options),
    );
  }

  /**
   * This node's acknowledgement of the latest publication. A node
   * acknowledges only for itself. The required owner observation names the
   * candidate; the write is a guarded change of that durable row. A projection
   * may wake this interaction but cannot answer an unavailable owner read.
   * @param {string} nodeId - This node.
   * @param {Object} [options={}]
   * @return {Promise<Object|null>} The typed write outcome; null when no
   *   publication is visible to acknowledge.
   */
  async acknowledgeMembershipPublicationForNode(nodeId, options = {}) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return null;
    }
    if (normalizedNodeId !== this.nodeId) {
      return refused(MEMBERSHIP_PUBLICATION_WRITE_REFUSAL.NOT_SELF);
    }
    const acknowledgementCandidate = await this.getAcknowledgementCandidateForNode(
      normalizedNodeId,
      options,
    );
    if (!acknowledgementCandidate || typeof acknowledgementCandidate !== 'object') {
      return null;
    }
    const candidatePublicationRow = acknowledgementCandidate.publicationRow;
    if (!candidatePublicationRow || typeof candidatePublicationRow !== 'object') {
      return null;
    }
    if (
      acknowledgementCandidate.terminal === true ||
      acknowledgementCandidate.requiresAcknowledgement !== true ||
      (
        acknowledgementCandidate.alreadyAcknowledged === true &&
        acknowledgementCandidate.allRequiredAcknowledged !== true
      )
    ) {
      return acknowledgementNotOwed(
        serializeMembershipPublicationRow(candidatePublicationRow));
    }
    return this.acknowledgePublication(
      normalizeControlPlanePublicationRow(candidatePublicationRow).publicationId,
      normalizedNodeId,
      options,
    );
  }

  /**
   * Record `nodeId`'s acknowledgement of a publication as a change of the
   * durable row. The lane is keyed by (publication, node): a second call for
   * the same pair joins the running one (the same change of the same row);
   * a call for another node never joins it - it runs on its own key and the
   * row's revision orders the two writes.
   * @param {string} publicationId
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @return {Promise<Object>} The typed write outcome.
   */
  async acknowledgePublication(publicationId, nodeId, options = {}) {
    if (!this.controlPlanePublicationsOwner) {
      return refused(MEMBERSHIP_PUBLICATION_WRITE_REFUSAL
        .PUBLICATIONS_OWNER_UNAVAILABLE);
    }
    const acknowledgementOwnerKey = `${this.buildOwnerKey()}:ack:` +
      JSON.stringify([publicationId, nodeId]);
    // The projection's rows named the publication; they never reach the
    // write (its base is the durable row).
    const {publicationRow: _row, publicationRows: _rows, ...deliveryOptions} =
      options;
    const acknowledgementOptions = buildCriticalControlPlaneConvergenceOptions(
      deliveryOptions,
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
      () => this.controlPlanePublicationsOwner.applyPublicationChange(
        publicationId,
        membershipPublicationAcknowledgementChange({
          nodeId, now: () => this.now()}),
        {...acknowledgementOptions, logger: this.logger},
      ),
    );
  }

  /**
   * Abandon a publication whose acknowledgement timed out. The decision is
   * the publication owner's (the publications write leader): an acknowledger
   * never abandons.
   * @param {string} publicationId
   * @param {Object} options - {timeoutMs, reasonCode}.
   * @return {Promise<Object>} The typed write outcome.
   */
  async abandonTimedOutPublication(publicationId, options = {}) {
    if (!this.controlPlanePublicationsOwner) {
      return refused(MEMBERSHIP_PUBLICATION_WRITE_REFUSAL
        .PUBLICATIONS_OWNER_UNAVAILABLE);
    }
    if (shouldDeferMembershipReconcileToWriteLeader(this)) {
      return refused(MEMBERSHIP_PUBLICATION_WRITE_REFUSAL
        .NOT_PUBLICATION_OWNER);
    }
    const {timeoutMs, reasonCode, ...deliveryOptions} = options;
    return this.controlPlanePublicationsOwner.applyPublicationChange(
      publicationId,
      membershipPublicationTimeoutAbandonChange({
        timeoutMs, reasonCode, now: () => this.now()}),
      this.buildPublicationWriteOptions(deliveryOptions),
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

export {MEMBERSHIP_PUBLICATION_WRITE_REFUSAL, MembershipPublicationCoordinatorPersist};
