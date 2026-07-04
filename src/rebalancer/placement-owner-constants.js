import {NUM} from '../constants/index.js';
import {
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_REASON,
  PLACEMENT_OWNER_REINTERPRETATION,
  PLACEMENT_OWNER_TARGET_ACTION,
  PLACEMENT_OWNER_TARGET_STATE,
  TOPOLOGY_CONTROL_PLANE_OWNER,
} from './topology-owner-constants.js';

const PLACEMENT_OWNER = 'placement_owner';

const PLACEMENT_OWNER_PHASE = Object.freeze({
  FILTER: 'filter',
  SCORE: 'score',
  RESERVE: 'reserve',
  INTENT: 'intent',
});

const PLACEMENT_OWNER_FILTER_STATE = Object.freeze({
  NO_CANDIDATES: 'no_candidates',
  CAPACITY_CONSTRAINED: 'capacity_constrained',
  CANDIDATES_ACCEPTED: 'candidates_accepted',
});

const PLACEMENT_OWNER_FILTER_ACTION = Object.freeze({
  REJECT: 'reject',
  ACCEPT: 'accept',
});

const PLACEMENT_OWNER_FILTER_REASON = Object.freeze({
  CANDIDATE_SET_EMPTY: PLACEMENT_OWNER_REASON.CANDIDATE_SET_EMPTY,
  CAPACITY_REJECTED_CANDIDATES: 'capacity_rejected_candidates',
  CANDIDATES_ACCEPTED: 'candidates_accepted',
});

const PLACEMENT_OWNER_SCORE_PROFILE = Object.freeze({
  LOAD: 'load',
  SUITABILITY: 'suitability',
});

const PLACEMENT_OWNER_SCORE_DIMENSION = Object.freeze({
  CPU_LOAD: 'cpu_load',
  MEMORY_LOAD: 'memory_load',
  DISK_LOAD: 'disk_load',
  SAME_LATENCY_GROUP: 'same_latency_group',
  LATENCY_GROUP_DIVERSITY: 'latency_group_diversity',
  DATA_AFFINITY: 'data_affinity',
  DATA_AFFINITY_NODE: 'data_affinity_node',
  DATA_AFFINITY_INCUMBENT_RETENTION: 'data_affinity_incumbent_retention',
  DISK_TIE_BREAKER: 'disk_tie_breaker',
});

const PLACEMENT_OWNER_SCORE_STATE = Object.freeze({
  NO_SCORED_CANDIDATES: 'no_scored_candidates',
  RANKED_CANDIDATES: 'ranked_candidates',
});

const PLACEMENT_OWNER_RESERVATION_STATE = Object.freeze({
  NO_RESERVATIONS: 'no_reservations',
  RESERVATIONS_APPLIED: 'reservations_applied',
});

const PLACEMENT_OWNER_RESERVATION_REASON = Object.freeze({
  NONE: PLACEMENT_OWNER_REASON.NONE,
  SAME_ENTITY_TRANSITION: 'same_entity_transition',
  GLOBAL_SYSTEM_TRANSITION_DEFERRED: 'global_system_transition_deferred',
  LEADER_RETENTION: 'leader_retention',
  INCUMBENT_RETENTION: 'incumbent_retention',
});

const PLACEMENT_OWNER_INTENT_STATE = Object.freeze({
  NO_TARGET_REQUESTED: PLACEMENT_OWNER_TARGET_STATE.NO_TARGET_REQUESTED,
  NO_CANDIDATES: PLACEMENT_OWNER_TARGET_STATE.NO_CANDIDATES,
  TARGETS_SELECTED: PLACEMENT_OWNER_TARGET_STATE.TARGETS_SELECTED,
});

const PLACEMENT_OWNER_INTENT_ACTION = Object.freeze({
  SELECT_NONE: PLACEMENT_OWNER_TARGET_ACTION.SELECT_NONE,
  SELECT_TARGETS: PLACEMENT_OWNER_TARGET_ACTION.SELECT_TARGETS,
});

const PLACEMENT_OWNER_TOPOLOGY_SCORE = Object.freeze({
  SAME_GROUP_BONUS: NUM.FIVE,
  SAME_GROUP_PENALTY: 2,
  DIVERSITY_NEW_GROUP_BONUS: NUM.FOUR,
  DIVERSITY_EXISTING_GROUP_PENALTY: NUM.FOUR,
});

// DATA_AFFINITY dimension weights (service↔data affinity placement epic).
// AFFINITY_WEIGHT scales a candidate group's accessed-data weight (0..1)
// into score points, so the maximum affinity gradient between a
// full-weight and a zero-weight group is AFFINITY_WEIGHT points.
// INCUMBENT_MOVEMENT_COST is the in-score hysteresis margin: a challenger
// must beat an incumbent by MORE than this many points before the rank
// changes (Tier-1a sim: load-coupled scoring without such a margin
// limit-cycles; the usable band is wide, bounded below by the load
// shadow and above by the affinity gradient — census sweeps B/C/E).
const PLACEMENT_OWNER_DATA_AFFINITY_SCORE = Object.freeze({
  AFFINITY_WEIGHT: NUM.TEN,
  // Node-granular term dominates the group term: within one latency
  // group only node weights discriminate ("code ON its data"), and a
  // data-holding node must outbid the incumbent movement cost.
  NODE_AFFINITY_WEIGHT: NUM.SIXTEEN,
  INCUMBENT_MOVEMENT_COST: NUM.FOUR,
});

export {
  PLACEMENT_OWNER,
  PLACEMENT_OWNER_FILTER_ACTION,
  PLACEMENT_OWNER_FILTER_REASON,
  PLACEMENT_OWNER_FILTER_STATE,
  PLACEMENT_OWNER_INTENT_ACTION,
  PLACEMENT_OWNER_INTENT_STATE,
  PLACEMENT_OWNER_PHASE,
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_REASON,
  PLACEMENT_OWNER_REINTERPRETATION,
  PLACEMENT_OWNER_RESERVATION_REASON,
  PLACEMENT_OWNER_RESERVATION_STATE,
  PLACEMENT_OWNER_DATA_AFFINITY_SCORE,
  PLACEMENT_OWNER_SCORE_DIMENSION,
  PLACEMENT_OWNER_SCORE_PROFILE,
  PLACEMENT_OWNER_SCORE_STATE,
  PLACEMENT_OWNER_TARGET_ACTION,
  PLACEMENT_OWNER_TARGET_STATE,
  PLACEMENT_OWNER_TOPOLOGY_SCORE,
  TOPOLOGY_CONTROL_PLANE_OWNER,
};
