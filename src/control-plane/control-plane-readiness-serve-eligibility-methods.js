// The readiness owner's serve-eligibility surface (quest
// serve-eligibility-committed-epoch-read): one committed-epoch answer per
// node, read through the readiness-owner leader-required read. Consumers
// call answerServeEligibility; nothing else decides serving.
//
// Explicit-context module of the one ControlPlaneReadinessService class:
// every function takes the service first, and the class delegates to it.
import {ServeEligibilityOwner} from './serve-eligibility-owner.js';
import {CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR} from
  './control-plane-system-table-gateway-constants.js';

const SERVE_ELIGIBILITY_OWNER_DEPENDENCY = 'serveEligibilityOwner';

function getServeEligibilityOwner(service) {
  if (!service.serveEligibilityOwner) {
    service.serveEligibilityOwner = new ServeEligibilityOwner({
      readCommittedRows: (tableName, sql, params) =>
        service.readServeEligibilityCommittedRows(tableName, sql, params),
      now: () => service.now(),
      readTimeoutMs: service.authoritativeReadinessRepairQueryTimeoutMs,
      setTimeout: (fn, ms) => service.setTimeoutFn(fn, ms),
      clearTimeout: (handle) => service.clearTimeoutFn(handle),
      isNodeLoadReady: (nodeRow) => service.isLoadReady(nodeRow),
    });
    // A new committed record re-keys every derived readiness memo: the
    // planning snapshots through their owner-dependency generation, the
    // stored snapshots through the cluster invalidation stamp.
    service.serveEligibilityOwner.subscribe(() => {
      service.lastReadinessSnapshotClusterInvalidatedAtMs = service.now();
      service.readinessPlanningSnapshotOwner?.recordOwnerDependencyReplacement(
        SERVE_ELIGIBILITY_OWNER_DEPENDENCY);
    });
    if (service.isShutDown === true) {
      service.serveEligibilityOwner.shutdown();
    }
  }
  return service.serveEligibilityOwner;
}

// The authoritative view is created by the service (or injected and
// validated at wiring, readReadinessOwnerRows included); without one the
// read owner is unavailable, a typed answer.
async function readServeEligibilityCommittedRows(service, tableName, sql, params) {
  const view = service.getAuthoritativeControlPlaneView();
  if (!view) {
    return {
      success: false,
      error:
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR
          .AUTHORITATIVE_READ_OWNER_UNAVAILABLE,
      rows: [],
    };
  }
  return view.readReadinessOwnerRows(tableName, sql, params, {
    queryTimeoutMs: service.authoritativeReadinessRepairQueryTimeoutMs,
  });
}

/**
 * Run (or join) one committed refresh of the serve-eligibility record.
 * @param {Object} service
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
function readServeEligibility(service, options = {}) {
  return service.getServeEligibilityOwner().readServeEligibility(options);
}

/**
 * The committed-epoch serve answer for one node: {state: ready, decision,
 * reasons, epoch, leaseExpiresAtMs} or {state: unavailable, reason, epoch,
 * retryAfterMs}.
 * @param {Object} service
 * @param {string} nodeId
 * @return {Object}
 */
function answerServeEligibility(service, nodeId) {
  return service.getServeEligibilityOwner().answer(nodeId);
}

/**
 * The committed-epoch answer for a cohort of nodes: per-member answers,
 * eligibleNodeIds and epoch.
 * @param {Object} service
 * @param {Array<string>} [nodeIds]
 * @return {Object}
 */
function answerServeCohort(service, nodeIds) {
  return service.getServeEligibilityOwner().answerCohort(nodeIds);
}

function answerCommittedNodes(service) {
  return service.getServeEligibilityOwner().answerCommittedNodes();
}

function subscribeServeEligibility(service, listener) {
  return service.getServeEligibilityOwner().subscribe(listener);
}

function noteServeEligibilitySourceChange(service, tableName, record) {
  service.serveEligibilityOwner?.noteSourceChange(tableName, record);
}

function shutdownServeEligibilityOwner(service) {
  service.serveEligibilityOwner?.shutdown();
}

export {
  getServeEligibilityOwner,
  readServeEligibilityCommittedRows,
  readServeEligibility,
  answerServeEligibility,
  answerServeCohort,
  answerCommittedNodes,
  subscribeServeEligibility,
  noteServeEligibilitySourceChange,
  shutdownServeEligibilityOwner,
};
