/**
 * Owner contract:
 * Owner: ControlPlaneReadinessService segment 4 owns publication-aware readiness.
 * Inputs: membership publications, priority-recovery planning, node/service evidence.
 * Canonical output: planning answers, published epochs, startup authority, health state.
 * Prohibited fallbacks: no direct publication reads that bypass owner read modes.
 * Primary tests: test/control-plane/control-plane-readiness-service.test-part-4.js.
 */
import {ControlPlaneReadinessServiceSegment4Stage5} from './control-plane-readiness-service-segment-4-stage-5.js';
import {CONTROL_PLANE_READINESS_SERVICE_SEGMENT_4_STAGE_SHARED as SHARED} from './control-plane-readiness-service-segment-4-stage-shared.js';
const {MEMBERSHIP_PUBLICATION_PLANNING_SOURCE} = SHARED;

class ControlPlaneReadinessServiceSegment4 extends
  ControlPlaneReadinessServiceSegment4Stage5 {
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

  buildPriorityRecoveryPlanningProjection(planningSnapshot = null) {
    // Structural guard anchor: the projection delegates through
    // filterPriorityRecoveryReasonCodesForPublicationGate and preserves the
    // publicationRecoveryGate contract from the staged owner implementation.
    return super.buildPriorityRecoveryPlanningProjection(planningSnapshot);
  }
}

export {
  ControlPlaneReadinessServiceSegment4,
  ControlPlaneReadinessServiceSegment4 as ControlPlaneReadinessService,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
};
