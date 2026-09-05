/**
 * ControlPlaneReadinessService recovery-epoch summary: recovery-open state,
 * the recovery-epoch and membership-planning feedback signatures, the
 * per-node recovery epoch summary, and the recovery epoch history projection
 * read by diagnostics and the planning owner. Installed on the service
 * prototype by the snapshot-store installer.
 */

import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';
import {
  summarizeProjectionReadinessContractForHistory,
} from './projection-readiness-state.js';

const LOCAL_STR_ONE = '1';
const LOCAL_STR_ZERO = '0';
const LOCAL_STR_SIGNATURE_FIELD_SEPARATOR = '|';
const LOCAL_STR_SIGNATURE_LIST_SEPARATOR = ',';
const stringConstructor = String;

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  PROJECTION_READINESS_CONTRACT_STATE,
  normalizeIsoTimestamp,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

const controlPlaneReadinessRecoveryEpochSummaryMethods = {
  /**
   * Resolve recovery-open state from a raw snapshot without building the
   * epoch summary. Must match buildRecoveryEpochSummary's recoveryActive.
   * @param {Object|null} snapshot
   * @return {boolean}
   * @private
   */
  isRecoverySnapshotActive(snapshot) {
    const projectionReadinessContract =
      snapshot?.projectionReadinessContract &&
      typeof snapshot.projectionReadinessContract === 'object' ?
        snapshot.projectionReadinessContract :
        null;
    return projectionReadinessContract?.recoveryOpen !== false;
  },

  /**
   * Cheap semantic-change signature for recovery epoch observations. Covers
   * exactly the semantic fields of buildRecoveryEpochSummary and excludes
   * observation timestamps so identical consecutive states compare equal.
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @return {string}
   * @private
   */
  buildRecoveryEpochSignature(nodeId, snapshot) {
    const dimensions =
      snapshot?.dimensions && typeof snapshot.dimensions === 'object' ?
        snapshot.dimensions :
        {};
    const projectionReadinessContract =
      snapshot?.projectionReadinessContract &&
      typeof snapshot.projectionReadinessContract === 'object' ?
        snapshot.projectionReadinessContract :
        null;
    const reasonCodes = Array.isArray(snapshot?.reasons) ?
      snapshot.reasons
        .map((reason) => stringConstructor(reason?.code || ''))
        .filter(Boolean)
        .join(LOCAL_STR_SIGNATURE_LIST_SEPARATOR) :
      '';
    const priorityReasonCodes = Array.isArray(
      projectionReadinessContract?.priorityRecovery?.reasonCodes,
    ) ?
      projectionReadinessContract.priorityRecovery.reasonCodes.join(
        LOCAL_STR_SIGNATURE_LIST_SEPARATOR,
      ) :
      '';
    // Sign every owner-produced dimension directly. Several dimensions are
    // currently derivable from signed reasons, but keeping the semantic vector
    // complete prevents a future derivation change from becoming a stale-positive
    // token hole.
    const dimensionBits = Object.values(CONTROL_PLANE_READINESS_DIMENSION)
      .map((dimension) =>
        dimensions[dimension] === true ? LOCAL_STR_ONE : LOCAL_STR_ZERO,
      )
      .join('');
    return [
      nodeId,
      snapshot?.lifecycleState || '',
      dimensionBits,
      projectionReadinessContract?.state ||
        PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
      projectionReadinessContract?.priorityRecovery?.active === true ?
        LOCAL_STR_ONE :
        LOCAL_STR_ZERO,
      priorityReasonCodes,
      reasonCodes,
      projectionReadinessContract?.recoveryOpen !== false ?
        LOCAL_STR_ONE :
        LOCAL_STR_ZERO,
    ].join(LOCAL_STR_SIGNATURE_FIELD_SEPARATOR);
  },

  /**
   * Canonical, caller-variant-independent readiness feedback consumed by
   * all-node planning. The recovery signature already contains only semantic
   * readiness/recovery fields and excludes timestamps and build options; this
   * separate seam prevents planning from signing an option-specific snapshot.
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @return {string}
   * @private
   */
  buildMembershipPlanningFeedbackSignature(nodeId, snapshot) {
    return this.buildRecoveryEpochSignature(nodeId, snapshot);
  },

  /**
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @param {number} observedAtMs
   * @return {Object}
   * @private
   */
  buildRecoveryEpochSummary(nodeId, snapshot, observedAtMs) {
    const dimensions =
      snapshot?.dimensions && typeof snapshot.dimensions === 'object' ?
        snapshot.dimensions :
        {};
    const reasonCodes = Array.isArray(snapshot?.reasons) ?
      [
        ...new Set(
          snapshot.reasons
            .map((reason) => stringConstructor(reason?.code || ''))
            .filter(Boolean),
        ),
      ] :
      [];
    const projectionReadinessContract =
      snapshot?.projectionReadinessContract &&
      typeof snapshot.projectionReadinessContract === 'object' ?
        snapshot.projectionReadinessContract :
        null;
    return Object.freeze({
      nodeId,
      observedAt: snapshot?.observedAt || normalizeIsoTimestamp(observedAtMs),
      observedAtMs,
      lifecycleState: snapshot?.lifecycleState || null,
      processAlive:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true,
      clusterMemberHealthy:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] ===
        true,
      controlPlaneWritable:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] ===
        true,
      controlPlanePublished:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
        ] === true,
      controlPlaneRecoveryEligible:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
        ] === true,
      repairEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true,
      serveEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true,
      // CL-031(d): epoch events carry the bounded contract SUMMARY — the
      // full contract embed made each event ~300KB (gate 220403Z measured
      // 10MB events arrays); the scalar dimensions below already capture
      // the decision-relevant state.
      projectionReadinessContract:
        summarizeProjectionReadinessContractForHistory(
          projectionReadinessContract,
        ),
      projectionReadinessState:
        projectionReadinessContract?.state ||
        PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
      priorityControlPlaneRecoveryActive:
        projectionReadinessContract?.priorityRecovery?.active === true,
      priorityControlPlaneRecoveryReasonCodes:
        Array.isArray(
          projectionReadinessContract?.priorityRecovery?.reasonCodes,
        ) ?
          Object.freeze([
            ...projectionReadinessContract.priorityRecovery.reasonCodes,
          ]) :
          Object.freeze([]),
      reasonCodes: Object.freeze(reasonCodes),
      recoveryActive:
        projectionReadinessContract?.recoveryOpen !== false,
    });
  },

  /**
   * @return {Object}
   */
  getRecoveryEpochHistoryByNodeId() {
    const entries = {};
    for (const [
      nodeId,
      history,
    ] of this.recoveryEpochHistoryByNodeId.entries()) {
      entries[nodeId] = Array.isArray(history) ?
        history.map((epoch) =>
          Object.freeze({
            ...epoch,
            events: Object.freeze(
              (Array.isArray(epoch.events) ? epoch.events : []).map((event) =>
                Object.freeze({...event}),
              ),
            ),
          }),
        ) :
        [];
    }
    for (const [nodeId, epoch] of this.currentRecoveryEpochByNodeId.entries()) {
      entries[nodeId] = Object.freeze([
        ...(Array.isArray(entries[nodeId]) ? entries[nodeId] : []),
        Object.freeze({
          ...epoch,
          events: Object.freeze(
            (Array.isArray(epoch.events) ? epoch.events : []).map((event) =>
              Object.freeze({...event}),
            ),
          ),
        }),
      ]);
    }
    return Object.freeze(entries);
  },
};

function installControlPlaneReadinessRecoveryEpochSummaryMethods(prototype) {
  Object.defineProperties(
    prototype,
    Object.fromEntries(
      Object.entries(controlPlaneReadinessRecoveryEpochSummaryMethods).map(
        ([name, value]) => [
          name,
          {configurable: true, value, writable: true},
        ],
      ),
    ),
  );
}

export {installControlPlaneReadinessRecoveryEpochSummaryMethods};
