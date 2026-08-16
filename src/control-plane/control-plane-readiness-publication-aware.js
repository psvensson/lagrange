/**
 * Owner contract:
 * Owner: ControlPlaneReadinessService publication-aware tier owns publication-aware readiness.
 * Inputs: membership publications, priority-recovery planning, node/service evidence.
 * Canonical output: planning answers, published epochs, startup authority, health state.
 * Prohibited fallbacks: no direct publication reads that bypass owner read modes.
 * Primary tests: test/control-plane/control-plane-readiness-service.test-part-4.js.
 */
import {ControlPlaneReadinessNodeServiceRows} from './control-plane-readiness-node-service-rows.js';
import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from './control-plane-readiness-planning-shared.js';
const {MEMBERSHIP_PUBLICATION_PLANNING_SOURCE} = SHARED;

class ControlPlaneReadinessPublicationAware extends
  ControlPlaneReadinessNodeServiceRows {
  filterPriorityRecoveryReasonCodesForPublicationGate(
    reasonCodes = [],
    publicationRecoveryGate = null,
  ) {
    // Structural guard anchor:
    // CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD
    // is retained only when publicationRecoveryGate?.prioritySpreadPending !== true.
    return super.filterPriorityRecoveryReasonCodesForPublicationGate(
      reasonCodes,
      publicationRecoveryGate,
    );
  }

  buildPriorityRecoveryPlanningProjection(planningSnapshot = null, observedAt) {
    // Structural guard anchor: the projection delegates through
    // filterPriorityRecoveryReasonCodesForPublicationGate and preserves the
    // publicationRecoveryGate contract from the staged owner implementation.
    return super.buildPriorityRecoveryPlanningProjection(
      planningSnapshot,
      observedAt,
    );
  }
}

export {
  ControlPlaneReadinessPublicationAware,
  ControlPlaneReadinessPublicationAware as ControlPlaneReadinessService,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
};
