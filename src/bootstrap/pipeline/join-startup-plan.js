/**
 * Join startup pipeline plans.
 */

import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../message-group-assignment.js';
import {
  JOINING_PHASE as JoiningPhase,
} from '../bootstrap-constants.js';

function createJoinStartupPlan(service) {
  return {
    phases: [
      {
        name: JoiningPhase.CONTACTING_SEED,
        run: () => service.executePhase(
          JoiningPhase.CONTACTING_SEED,
          () => service.joiningPhaseOwners.contactSeed(),
        ),
      },
      {
        name: JoiningPhase.CONNECTING_WEBSOCKET,
        run: () => service.executePhase(
          JoiningPhase.CONNECTING_WEBSOCKET,
          () => service.joiningPhaseOwners.connectWebSocket(),
        ),
      },
      {
        name: 'joining:message-group-assignment',
        run: () => {
          const assignment = service.bootstrapResponse.messageGroupAssignment;
          if (assignment.strategy === AssignmentStrategy.CREATE_SELF_HOSTED) {
            return service.executePhase(
              JoiningPhase.CREATING_MESSAGE_GROUP,
              () => service.joiningPhaseOwners
                .createSelfHostedMessageGroup(assignment),
            );
          }
          if (assignment.strategy === AssignmentStrategy.MOVE_REPLICA) {
            return service.executePhase(
              JoiningPhase.JOINING_MESSAGE_GROUP,
              () => service.joiningPhaseOwners.joinExistingMessageGroup(assignment),
            );
          }
          return undefined;
        },
      },
      {
        name: JoiningPhase.WAITING_LEADERSHIP,
        run: () => service.executePhase(
          JoiningPhase.WAITING_LEADERSHIP,
          () => service.joiningPhaseOwners.waitForLeadership(),
        ),
      },
      {
        name: JoiningPhase.QUERYING_STATE,
        run: () => service.executePhase(
          JoiningPhase.QUERYING_STATE,
          () => service.joiningPhaseOwners.querySystemState(),
        ),
      },
    ],
  };
}

export {createJoinStartupPlan};
