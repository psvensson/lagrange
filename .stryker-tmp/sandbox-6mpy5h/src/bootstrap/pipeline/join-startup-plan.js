/**
 * Join startup pipeline plans.
 *
 * Owns the canonical join plan shape including named segments (D4.1).
 * The phases array preserves backward compatibility while segments
 * provide named checkpoint boundaries for join orchestration.
 */
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
import { MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy } from '../message-group-assignment.js';
import { JOIN_PLAN_SEGMENT as Segment, JOINING_PHASE as JoiningPhase } from '../bootstrap-constants.js';
import { JOINING_ERROR_MSG } from '../node-joining-constants.js';
const READINESS_CONVERGENCE_PHASE = stryMutAct_9fa48("27572") ? "" : (stryCov_9fa48("27572"), 'joining:readiness-convergence');

/**
 * Create the join startup plan with named phase segments.
 *
 * The returned plan exposes both a flat `phases` array (backward
 * compatible) and a `segments` object keyed by JOIN_PLAN_SEGMENT
 * values. Each segment is a non-empty array of phase objects that
 * also appear in the flat phases list.
 *
 * Segment boundaries (Req 3.1, D4.1):
 *   seedContact    — seed node contact
 *   infrastructure — websocket, message-group, leadership setup
 *   membership     — system state query and membership write
 *   readiness      — readiness convergence before READY signaling
 *
 * @param {Object} service - NodeJoiningService instance.
 * @return {{phases: Array, segments: Object}} Join startup plan.
 */
function createJoinStartupPlan(service) {
  if (stryMutAct_9fa48("27573")) {
    {}
  } else {
    stryCov_9fa48("27573");
    const contactSeedPhase = stryMutAct_9fa48("27574") ? {} : (stryCov_9fa48("27574"), {
      name: JoiningPhase.CONTACTING_SEED,
      run: stryMutAct_9fa48("27575") ? () => undefined : (stryCov_9fa48("27575"), () => service.executePhase(JoiningPhase.CONTACTING_SEED, stryMutAct_9fa48("27576") ? () => undefined : (stryCov_9fa48("27576"), () => service.joiningPhaseOwners.contactSeed())))
    });
    const connectWebSocketPhase = stryMutAct_9fa48("27577") ? {} : (stryCov_9fa48("27577"), {
      name: JoiningPhase.CONNECTING_WEBSOCKET,
      run: stryMutAct_9fa48("27578") ? () => undefined : (stryCov_9fa48("27578"), () => service.executePhase(JoiningPhase.CONNECTING_WEBSOCKET, stryMutAct_9fa48("27579") ? () => undefined : (stryCov_9fa48("27579"), () => service.joiningPhaseOwners.connectWebSocket())))
    });
    const messageGroupAssignmentPhase = stryMutAct_9fa48("27580") ? {} : (stryCov_9fa48("27580"), {
      name: stryMutAct_9fa48("27581") ? "" : (stryCov_9fa48("27581"), 'joining:message-group-assignment'),
      run: () => {
        if (stryMutAct_9fa48("27582")) {
          {}
        } else {
          stryCov_9fa48("27582");
          const assignment = service.bootstrapResponse.messageGroupAssignment;
          if (stryMutAct_9fa48("27585") ? assignment.strategy !== AssignmentStrategy.CREATE_SELF_HOSTED : stryMutAct_9fa48("27584") ? false : stryMutAct_9fa48("27583") ? true : (stryCov_9fa48("27583", "27584", "27585"), assignment.strategy === AssignmentStrategy.CREATE_SELF_HOSTED)) {
            if (stryMutAct_9fa48("27586")) {
              {}
            } else {
              stryCov_9fa48("27586");
              return service.executePhase(JoiningPhase.CREATING_MESSAGE_GROUP, stryMutAct_9fa48("27587") ? () => undefined : (stryCov_9fa48("27587"), () => service.joiningPhaseOwners.createSelfHostedMessageGroup(assignment)));
            }
          }
          if (stryMutAct_9fa48("27590") ? assignment.strategy !== AssignmentStrategy.MOVE_REPLICA : stryMutAct_9fa48("27589") ? false : stryMutAct_9fa48("27588") ? true : (stryCov_9fa48("27588", "27589", "27590"), assignment.strategy === AssignmentStrategy.MOVE_REPLICA)) {
            if (stryMutAct_9fa48("27591")) {
              {}
            } else {
              stryCov_9fa48("27591");
              return service.executePhase(JoiningPhase.JOINING_MESSAGE_GROUP, stryMutAct_9fa48("27592") ? () => undefined : (stryCov_9fa48("27592"), () => service.joiningPhaseOwners.joinExistingMessageGroup(assignment)));
            }
          }
          return undefined;
        }
      }
    });
    const waitLeadershipPhase = stryMutAct_9fa48("27593") ? {} : (stryCov_9fa48("27593"), {
      name: JoiningPhase.WAITING_LEADERSHIP,
      run: stryMutAct_9fa48("27594") ? () => undefined : (stryCov_9fa48("27594"), () => service.executePhase(JoiningPhase.WAITING_LEADERSHIP, stryMutAct_9fa48("27595") ? () => undefined : (stryCov_9fa48("27595"), () => service.joiningPhaseOwners.waitForLeadership())))
    });
    const queryStatePhase = stryMutAct_9fa48("27596") ? {} : (stryCov_9fa48("27596"), {
      name: JoiningPhase.QUERYING_STATE,
      run: stryMutAct_9fa48("27597") ? () => undefined : (stryCov_9fa48("27597"), () => service.executePhase(JoiningPhase.QUERYING_STATE, stryMutAct_9fa48("27598") ? () => undefined : (stryCov_9fa48("27598"), () => service.joiningPhaseOwners.querySystemState())))
    });
    const readinessConvergencePhase = stryMutAct_9fa48("27599") ? {} : (stryCov_9fa48("27599"), {
      name: READINESS_CONVERGENCE_PHASE,
      run: stryMutAct_9fa48("27600") ? () => undefined : (stryCov_9fa48("27600"), () => service.executePhase(READINESS_CONVERGENCE_PHASE, stryMutAct_9fa48("27601") ? () => undefined : (stryCov_9fa48("27601"), () => service.joinReadinessEvaluator.waitForCanonicalJoinReadinessConvergence())))
    });
    const phases = stryMutAct_9fa48("27602") ? [] : (stryCov_9fa48("27602"), [contactSeedPhase, connectWebSocketPhase, messageGroupAssignmentPhase, waitLeadershipPhase, queryStatePhase, readinessConvergencePhase]);
    return stryMutAct_9fa48("27603") ? {} : (stryCov_9fa48("27603"), {
      phases,
      segments: stryMutAct_9fa48("27604") ? {} : (stryCov_9fa48("27604"), {
        [Segment.SEED_CONTACT]: stryMutAct_9fa48("27605") ? [] : (stryCov_9fa48("27605"), [contactSeedPhase]),
        [Segment.INFRASTRUCTURE]: stryMutAct_9fa48("27606") ? [] : (stryCov_9fa48("27606"), [connectWebSocketPhase, messageGroupAssignmentPhase, waitLeadershipPhase]),
        [Segment.MEMBERSHIP]: stryMutAct_9fa48("27607") ? [] : (stryCov_9fa48("27607"), [queryStatePhase]),
        [Segment.READINESS]: stryMutAct_9fa48("27608") ? [] : (stryCov_9fa48("27608"), [readinessConvergencePhase])
      })
    });
  }
}

/**
 * Required segment keys that must be present and non-empty in every
 * join startup plan. Derived from JOIN_PLAN_SEGMENT constants (D4.1).
 */
const REQUIRED_SEGMENTS = Object.freeze(stryMutAct_9fa48("27609") ? [] : (stryCov_9fa48("27609"), [Segment.SEED_CONTACT, Segment.INFRASTRUCTURE, Segment.MEMBERSHIP, Segment.READINESS]));

/**
 * Validate that a join startup plan contains all required named
 * segments and that each required segment is a non-empty array.
 *
 * Throws immediately on the first missing or empty segment so
 * join startup fails fast before checkpoint execution (Req 3.3, D4.3).
 *
 * @param {Object} plan - Join startup plan from createJoinStartupPlan.
 * @throws {Error} If plan.segments is missing, a required segment is
 *   absent, or a required segment is empty.
 */
function assertJoinPlanSegments(plan) {
  if (stryMutAct_9fa48("27610")) {
    {}
  } else {
    stryCov_9fa48("27610");
    if (stryMutAct_9fa48("27613") ? !plan.segments && typeof plan.segments !== 'object' : stryMutAct_9fa48("27612") ? false : stryMutAct_9fa48("27611") ? true : (stryCov_9fa48("27611", "27612", "27613"), (stryMutAct_9fa48("27614") ? plan.segments : (stryCov_9fa48("27614"), !plan.segments)) || (stryMutAct_9fa48("27616") ? typeof plan.segments === 'object' : stryMutAct_9fa48("27615") ? false : (stryCov_9fa48("27615", "27616"), typeof plan.segments !== (stryMutAct_9fa48("27617") ? "" : (stryCov_9fa48("27617"), 'object')))))) {
      if (stryMutAct_9fa48("27618")) {
        {}
      } else {
        stryCov_9fa48("27618");
        throw new Error(JOINING_ERROR_MSG.JOIN_PLAN_SEGMENTS_MISSING);
      }
    }
    for (const segmentName of REQUIRED_SEGMENTS) {
      if (stryMutAct_9fa48("27619")) {
        {}
      } else {
        stryCov_9fa48("27619");
        const segment = plan.segments[segmentName];
        if (stryMutAct_9fa48("27622") ? false : stryMutAct_9fa48("27621") ? true : stryMutAct_9fa48("27620") ? Array.isArray(segment) : (stryCov_9fa48("27620", "27621", "27622"), !Array.isArray(segment))) {
          if (stryMutAct_9fa48("27623")) {
            {}
          } else {
            stryCov_9fa48("27623");
            throw new Error(JOINING_ERROR_MSG.joinPlanSegmentMissing(segmentName));
          }
        }
        if (stryMutAct_9fa48("27626") ? segment.length !== 0 : stryMutAct_9fa48("27625") ? false : stryMutAct_9fa48("27624") ? true : (stryCov_9fa48("27624", "27625", "27626"), segment.length === 0)) {
          if (stryMutAct_9fa48("27627")) {
            {}
          } else {
            stryCov_9fa48("27627");
            throw new Error(JOINING_ERROR_MSG.joinPlanSegmentEmpty(segmentName));
          }
        }
      }
    }
  }
}
export { READINESS_CONVERGENCE_PHASE, createJoinStartupPlan, assertJoinPlanSegments };