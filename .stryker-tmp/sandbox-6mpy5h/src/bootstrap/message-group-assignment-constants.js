// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { ENTITY_TYPE, NUM } from '../constants/index.js';
import { BOOTSTRAP_ASSIGNMENT_STRATEGY } from './bootstrap-constants.js';
const MESSAGE_GROUP_ASSIGNMENT_SUBSYSTEM = stryMutAct_9fa48("15832") ? "" : (stryCov_9fa48("15832"), 'message-group-assignment');
const MESSAGE_GROUP_ASSIGNMENT_STRATEGY = BOOTSTRAP_ASSIGNMENT_STRATEGY;
const MESSAGE_GROUP_ASSIGNMENT_DEFAULT = Object.freeze(stryMutAct_9fa48("15833") ? {} : (stryCov_9fa48("15833"), {
  GROUP_ID_PREFIX: stryMutAct_9fa48("15834") ? "" : (stryCov_9fa48("15834"), 'mg-'),
  GROUP_ID_SEGMENT_SEPARATOR: stryMutAct_9fa48("15835") ? "" : (stryCov_9fa48("15835"), '-'),
  GROUP_ID_HEAD_LENGTH: NUM.EIGHT,
  GROUP_ID_TAIL_LENGTH: stryMutAct_9fa48("15836") ? NUM.EIGHT - NUM.FOUR : (stryCov_9fa48("15836"), NUM.EIGHT + NUM.FOUR),
  GROUP_ID_FALLBACK: stryMutAct_9fa48("15837") ? "" : (stryCov_9fa48("15837"), 'group'),
  REPLICA_COUNT: NUM.THREE,
  MIN_REPLICAS_FOR_MOVE: NUM.THREE,
  MIN_REPLICAS_ON_NODE_FOR_MOVE: NUM.TWO,
  RAFT_MIN_REPLICA_COUNT: NUM.THREE,
  RAFT_ODD_MODULO: NUM.TWO,
  DISTRIBUTION_NODES_PER_GROUP: NUM.THREE,
  ROUNDING_MULTIPLIER: NUM.HUNDRED,
  ROUNDING_DIVISOR: NUM.HUNDRED,
  DEFAULT_ENTITY_TYPE: ENTITY_TYPE.MESSAGE_GROUP
}));
const MESSAGE_GROUP_ASSIGNMENT_LOG_MSG = Object.freeze(stryMutAct_9fa48("15838") ? {} : (stryCov_9fa48("15838"), {
  DETERMINING: stryMutAct_9fa48("15839") ? "" : (stryCov_9fa48("15839"), 'Determining message group assignment'),
  USING_MOVE_REPLICA: stryMutAct_9fa48("15840") ? "" : (stryCov_9fa48("15840"), 'Using MOVE_REPLICA strategy'),
  USING_CREATE_SELF_HOSTED: stryMutAct_9fa48("15841") ? "" : (stryCov_9fa48("15841"), 'Using CREATE_SELF_HOSTED strategy'),
  EXISTING_MEMBERSHIP_DETECTED: stryMutAct_9fa48("15842") ? "" : (stryCov_9fa48("15842"), 'Node already has message group membership, using CREATE_SELF_HOSTED')
}));
const MESSAGE_GROUP_ASSIGNMENT_ERROR = Object.freeze(stryMutAct_9fa48("15843") ? {} : (stryCov_9fa48("15843"), {
  ASSIGNMENT_REQUIRED: stryMutAct_9fa48("15844") ? "" : (stryCov_9fa48("15844"), 'Assignment is required'),
  STRATEGY_REQUIRED: stryMutAct_9fa48("15845") ? "" : (stryCov_9fa48("15845"), 'Strategy is required'),
  GROUP_ID_REQUIRED: stryMutAct_9fa48("15846") ? "" : (stryCov_9fa48("15846"), 'Group ID is required'),
  SOURCE_NODE_REQUIRED: stryMutAct_9fa48("15847") ? "" : (stryCov_9fa48("15847"), 'Source node ID is required for MOVE_REPLICA'),
  REPLICA_TO_MOVE_REQUIRED: stryMutAct_9fa48("15848") ? "" : (stryCov_9fa48("15848"), 'Replica to move is required for MOVE_REPLICA'),
  REPLICA_ADDRESSES_REQUIRED: stryMutAct_9fa48("15849") ? "" : (stryCov_9fa48("15849"), 'Replica addresses are required for MOVE_REPLICA'),
  REPLICA_COUNT_MIN: stryMutAct_9fa48("15850") ? "" : (stryCov_9fa48("15850"), 'Replica count must be at least 3 for CREATE_SELF_HOSTED'),
  REPLICA_COUNT_ODD: stryMutAct_9fa48("15851") ? "" : (stryCov_9fa48("15851"), 'Replica count must be odd for Raft consensus'),
  invalidStrategy: stryMutAct_9fa48("15852") ? () => undefined : (stryCov_9fa48("15852"), strategy => stryMutAct_9fa48("15853") ? `` : (stryCov_9fa48("15853"), `Invalid strategy: ${strategy}`))
}));
export { MESSAGE_GROUP_ASSIGNMENT_DEFAULT, MESSAGE_GROUP_ASSIGNMENT_ERROR, MESSAGE_GROUP_ASSIGNMENT_LOG_MSG, MESSAGE_GROUP_ASSIGNMENT_STRATEGY, MESSAGE_GROUP_ASSIGNMENT_SUBSYSTEM };