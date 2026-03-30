/**
 * Join startup pipeline plans.
 *
 * Owns the canonical join plan shape including named segments (D4.1).
 * The phases array preserves backward compatibility while segments
 * provide named checkpoint boundaries for join orchestration.
 */

import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../message-group-assignment.js';
import {
  JOIN_PLAN_SEGMENT as Segment,
  JOINING_PHASE as JoiningPhase,
} from '../bootstrap-constants.js';
import {JOINING_ERROR_MSG} from '../node-joining-constants.js';

const READINESS_CONVERGENCE_PHASE =
  'joining:readiness-convergence';

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
  const contactSeedPhase = {
    name: JoiningPhase.CONTACTING_SEED,
    run: () => service.executePhase(
      JoiningPhase.CONTACTING_SEED,
      () => service.joiningPhaseOwners.contactSeed(),
    ),
  };

  const connectWebSocketPhase = {
    name: JoiningPhase.CONNECTING_WEBSOCKET,
    run: () => service.executePhase(
      JoiningPhase.CONNECTING_WEBSOCKET,
      () => service.joiningPhaseOwners.connectWebSocket(),
    ),
  };

  const messageGroupAssignmentPhase = {
    name: 'joining:message-group-assignment',
    run: () => {
      const assignment =
        service.bootstrapResponse.messageGroupAssignment;
      if (assignment.strategy ===
          AssignmentStrategy.CREATE_SELF_HOSTED) {
        return service.executePhase(
          JoiningPhase.CREATING_MESSAGE_GROUP,
          () => service.joiningPhaseOwners
            .createSelfHostedMessageGroup(assignment),
        );
      }
      if (assignment.strategy ===
          AssignmentStrategy.MOVE_REPLICA) {
        return service.executePhase(
          JoiningPhase.JOINING_MESSAGE_GROUP,
          () => service.joiningPhaseOwners
            .joinExistingMessageGroup(assignment),
        );
      }
      return undefined;
    },
  };

  const waitLeadershipPhase = {
    name: JoiningPhase.WAITING_LEADERSHIP,
    run: () => service.executePhase(
      JoiningPhase.WAITING_LEADERSHIP,
      () => service.joiningPhaseOwners.waitForLeadership(),
    ),
  };

  const queryStatePhase = {
    name: JoiningPhase.QUERYING_STATE,
    run: () => service.executePhase(
      JoiningPhase.QUERYING_STATE,
      () => service.joiningPhaseOwners.querySystemState(),
    ),
  };

  const readinessConvergencePhase = {
    name: READINESS_CONVERGENCE_PHASE,
    run: () => service.executePhase(
      READINESS_CONVERGENCE_PHASE,
      () => service.joinReadinessEvaluator
        .waitForCanonicalJoinReadinessConvergence(),
    ),
  };

  const phases = [
    contactSeedPhase,
    connectWebSocketPhase,
    messageGroupAssignmentPhase,
    waitLeadershipPhase,
    queryStatePhase,
    readinessConvergencePhase,
  ];

  return {
    phases,
    segments: {
      [Segment.SEED_CONTACT]: [contactSeedPhase],
      [Segment.INFRASTRUCTURE]: [
        connectWebSocketPhase,
        messageGroupAssignmentPhase,
        waitLeadershipPhase,
      ],
      [Segment.MEMBERSHIP]: [queryStatePhase],
      [Segment.READINESS]: [readinessConvergencePhase],
    },
  };
}

/**
 * Required segment keys that must be present and non-empty in every
 * join startup plan. Derived from JOIN_PLAN_SEGMENT constants (D4.1).
 */
const REQUIRED_SEGMENTS = Object.freeze([
  Segment.SEED_CONTACT,
  Segment.INFRASTRUCTURE,
  Segment.MEMBERSHIP,
  Segment.READINESS,
]);

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
  if (!plan.segments || typeof plan.segments !== 'object') {
    throw new Error(JOINING_ERROR_MSG.JOIN_PLAN_SEGMENTS_MISSING);
  }

  for (const segmentName of REQUIRED_SEGMENTS) {
    const segment = plan.segments[segmentName];
    if (!Array.isArray(segment)) {
      throw new Error(
        JOINING_ERROR_MSG.joinPlanSegmentMissing(segmentName),
      );
    }
    if (segment.length === 0) {
      throw new Error(
        JOINING_ERROR_MSG.joinPlanSegmentEmpty(segmentName),
      );
    }
  }
}

export {
  READINESS_CONVERGENCE_PHASE,
  createJoinStartupPlan,
  assertJoinPlanSegments,
};
