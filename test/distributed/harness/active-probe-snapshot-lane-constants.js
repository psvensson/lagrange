// Single owner of the active-probe snapshot-lane vocabulary.
//
// The lane outcome is produced by cluster-class-active-probe-attempt-join.js
// and consumed by oracle-blindness.js to decide whether a coverage record
// means "the oracle could not read" rather than "the cluster is inactive".
// Both sides previously declared the literal independently, so renaming one
// would have silently restored the mislabel that made GCP run
// 2026-08-30T17-32-03 report an inactive cluster while all five nodes were
// active. This leaf module owns the strings; it imports nothing, so neither
// consumer drags the other's layer in.
const ACTIVE_PROBE_SNAPSHOT_LANE_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  DEADLINE_BOUNDED: 'deadline_bounded',
});

const ACTIVE_PROBE_SNAPSHOT_LANE_DEADLINE_BOUNDED_REASON =
  'snapshot_lane_running_at_deadline';

export {
  ACTIVE_PROBE_SNAPSHOT_LANE_DEADLINE_BOUNDED_REASON,
  ACTIVE_PROBE_SNAPSHOT_LANE_OUTCOME,
};
