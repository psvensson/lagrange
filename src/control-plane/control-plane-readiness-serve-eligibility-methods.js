// The readiness owner's serve-eligibility surface (quest
// serve-eligibility-committed-epoch-read): one committed-epoch answer per
// node, read through the readiness-owner leader-required read. Consumers
// call answerServeEligibility; nothing else decides serving.
import {ServeEligibilityOwner} from './serve-eligibility-owner.js';
import {CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR} from
  './control-plane-system-table-gateway-constants.js';

const LOCAL_STR_FUNCTION = 'function';
const SERVE_ELIGIBILITY_OWNER_DEPENDENCY = 'serveEligibilityOwner';

const controlPlaneReadinessServeEligibilityMethods = {
  getServeEligibilityOwner() {
    if (!this.serveEligibilityOwner) {
      this.serveEligibilityOwner = new ServeEligibilityOwner({
        readCommittedRows: (tableName, sql, params) =>
          this.readServeEligibilityCommittedRows(tableName, sql, params),
        now: () => this.now(),
        readTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
        setTimeout: (fn, ms) => this.setTimeoutFn(fn, ms),
        clearTimeout: (handle) => this.clearTimeoutFn(handle),
        isNodeLoadReady: (nodeRow) => this.isLoadReady(nodeRow),
      });
      // A new committed record re-keys every derived readiness memo: the
      // planning snapshots through their owner-dependency generation, the
      // stored snapshots through the cluster invalidation stamp.
      this.serveEligibilityOwner.subscribe(() => {
        this.lastReadinessSnapshotClusterInvalidatedAtMs = this.now();
        this.readinessPlanningSnapshotOwner?.recordOwnerDependencyReplacement(
          SERVE_ELIGIBILITY_OWNER_DEPENDENCY);
      });
      if (this.isShutDown === true) {
        this.serveEligibilityOwner.shutdown();
      }
    }
    return this.serveEligibilityOwner;
  },

  async readServeEligibilityCommittedRows(tableName, sql, params) {
    const view = this.getAuthoritativeControlPlaneView();
    if (typeof view?.readReadinessOwnerRows !== LOCAL_STR_FUNCTION) {
      return {
        success: false,
        error:
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR
            .AUTHORITATIVE_READ_OWNER_UNAVAILABLE,
        rows: [],
      };
    }
    return view.readReadinessOwnerRows(tableName, sql, params, {
      queryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
    });
  },

  /**
   * Run (or join) one committed refresh of the serve-eligibility record.
   * @return {Promise<void>}
   */
  readServeEligibility() {
    return this.getServeEligibilityOwner().readServeEligibility();
  },

  /**
   * The committed-epoch serve answer for one node: {state: ready, decision,
   * reasons, epoch, leaseExpiresAtMs} or {state: unavailable, reason, epoch,
   * retryAfterMs}.
   * @param {string} nodeId
   * @return {Object}
   */
  answerServeEligibility(nodeId) {
    return this.getServeEligibilityOwner().answer(nodeId);
  },

  /**
   * The committed-epoch answer for a cohort of nodes: per-member answers,
   * eligibleNodeIds and epoch.
   * @param {Array<string>} [nodeIds]
   * @return {Object}
   */
  answerServeCohort(nodeIds) {
    return this.getServeEligibilityOwner().answerCohort(nodeIds);
  },

  subscribeServeEligibility(listener) {
    return this.getServeEligibilityOwner().subscribe(listener);
  },

  noteServeEligibilitySourceChange(tableName, record) {
    this.serveEligibilityOwner?.noteSourceChange(tableName, record);
  },

  shutdownServeEligibilityOwner() {
    this.serveEligibilityOwner?.shutdown();
  },
};

function installControlPlaneReadinessServeEligibilityMethods(prototype) {
  Object.defineProperties(
    prototype,
    Object.fromEntries(
      Object.entries(controlPlaneReadinessServeEligibilityMethods).map(
        ([name, value]) => [
          name,
          {configurable: true, value, writable: true},
        ],
      ),
    ),
  );
}

export {installControlPlaneReadinessServeEligibilityMethods};
