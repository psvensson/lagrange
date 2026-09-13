import {FORMATION_OWNER} from './formation-diagnostics-contract.js';
import {runFormationOwner} from './formation-turn-attribution.js';

/**
 * Formation-attribution owner entries for the seed's non-Raft subsystems.
 *
 * Each subsystem keeps its own behaviour; this module owns only the mapping
 * of its dispatch choke point into an exclusive formation-attribution bucket
 * (formation-seed-decoupling design, "Attribution seam"). With no active
 * window, runFormationOwner invokes the callback directly. Timers carry no
 * owner of their own: a timer armed inside an owner's turn inherits that
 * owner through the seam's async context, so charging the timer dispatch
 * itself would only hide who armed it.
 */
function runAdminActivity(callback) {
  return runFormationOwner(FORMATION_OWNER.ADMIN, callback);
}

function runBootstrapActivity(callback) {
  return runFormationOwner(FORMATION_OWNER.BOOTSTRAP, callback);
}

function runMembershipPublicationActivity(callback) {
  return runFormationOwner(FORMATION_OWNER.MEMBERSHIP_PUBLICATION, callback);
}

function runReadinessActivity(callback) {
  return runFormationOwner(FORMATION_OWNER.READINESS, callback);
}

function runRebalancerActivity(callback) {
  return runFormationOwner(FORMATION_OWNER.REBALANCER, callback);
}

function runTransportInboundActivity(callback) {
  return runFormationOwner(FORMATION_OWNER.TRANSPORT, callback);
}

function runWorkerDispatchActivity(callback) {
  return runFormationOwner(FORMATION_OWNER.WORKER_DISPATCH, callback);
}

export {
  runAdminActivity,
  runBootstrapActivity,
  runMembershipPublicationActivity,
  runReadinessActivity,
  runRebalancerActivity,
  runTransportInboundActivity,
  runWorkerDispatchActivity,
};
