// The canonical owners of a seed's event-loop turns during formation
// (formation-seed-decoupling design, "Attribution seam"): every scheduled
// entry inherits one at dispatch; an owner entry hands the rest of the turn
// off to another; whatever no owner claims is unattributed. Timers inherit
// the owner that armed them and are not an owner of their own.
const FORMATION_OWNER = Object.freeze({
  ADMIN: 'admin',
  BOOTSTRAP: 'bootstrap',
  MEMBERSHIP_PUBLICATION: 'membership_publication',
  RAFT_APPLY: 'raft_apply',
  RAFT_PROTOCOL: 'raft_protocol',
  READINESS: 'readiness',
  REBALANCER: 'rebalancer',
  TRANSPORT: 'transport',
  WORKER_DISPATCH: 'worker_dispatch',
  UNATTRIBUTED: 'unattributed',
});

export {
  FORMATION_OWNER,
};
