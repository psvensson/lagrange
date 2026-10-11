/**
 * Shared setup for MessageGroupServiceHandler.
 */

import {LoggingService} from '../../logging/logging-service.js';
import {MessageGroupServiceHandler} from
  '../../node/message-group-service-handler.js';
import {createMessageGroupLearnerJoinCapability} from
  '../../message-group/message-group-learner-join.js';
import {DependencyError} from '../bootstrap-errors.js';

const MESSAGE_GROUP_HANDLER_SETUP_SUBSYSTEM =
  'message-group-service-handler-setup';
const MESSAGE_GROUP_SERVICE_HANDLER_SETUP_NAME =
  'MessageGroupServiceHandlerSetup';
const TYPEOF_FUNCTION = 'function';

const LOG_MSG = Object.freeze({
  CREATING: 'Creating MessageGroupServiceHandler',
  CREATED: 'MessageGroupServiceHandler created and registered',
});

const ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId',
  MESSAGE_ROUTER_REQUIRED: 'messageRouter',
  CDC_INTEGRATION_SERVICE_REQUIRED: 'cdcIntegrationService',
  SYSTEM_TABLE_CACHE_REQUIRED: 'systemTableCache',
  CREATE_REQUIRED: 'createMessageGroupReplica',
  START_REQUIRED: 'startMessageGroupReplica',
  STOP_REQUIRED: 'stopMessageGroupReplica',
});

/**
 * The handler's learner-CREATE dependencies, composed from a learner-join
 * host when one is supplied.
 * @param {Object} parts - {messageGroupLearnerJoinHost,
 *   replicaOperationRepository, ownerIncarnation}.
 * @return {Object} Handler options (none without a host).
 */
function learnerCreateComposition(parts) {
  if (!parts.messageGroupLearnerJoinHost) return {};
  return {
    joinMessageGroupReplicaAsLearner: createMessageGroupLearnerJoinCapability(
      parts.messageGroupLearnerJoinHost),
    replicaOperationRepository: parts.replicaOperationRepository,
    ownerIncarnation: parts.ownerIncarnation,
  };
}

class MessageGroupServiceHandlerSetup {
  static create(options) {
    const {
      nodeId,
      messageRouter,
      cdcIntegrationService,
      systemTableCache,
      createMessageGroupReplica,
      startMessageGroupReplica,
      stopMessageGroupReplica,
      resolveLocalMessageGroupReplica,
      rpcClient,
      executorOutcomeEmitter,
      messageGroupLearnerJoinHost,
      replicaOperationRepository,
      ownerIncarnation,
    } = options;

    if (!nodeId) {
      throw new DependencyError(
        MESSAGE_GROUP_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.NODE_ID_REQUIRED,
      );
    }
    if (!messageRouter) {
      throw new DependencyError(
        MESSAGE_GROUP_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.MESSAGE_ROUTER_REQUIRED,
      );
    }
    if (!cdcIntegrationService) {
      throw new DependencyError(
        MESSAGE_GROUP_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED,
      );
    }
    if (!systemTableCache) {
      throw new DependencyError(
        MESSAGE_GROUP_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
      );
    }
    if (typeof createMessageGroupReplica !== TYPEOF_FUNCTION) {
      throw new DependencyError(
        MESSAGE_GROUP_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.CREATE_REQUIRED,
      );
    }
    if (typeof startMessageGroupReplica !== TYPEOF_FUNCTION) {
      throw new DependencyError(
        MESSAGE_GROUP_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.START_REQUIRED,
      );
    }
    if (typeof stopMessageGroupReplica !== TYPEOF_FUNCTION) {
      throw new DependencyError(
        MESSAGE_GROUP_SERVICE_HANDLER_SETUP_NAME,
        ERROR_MSG.STOP_REQUIRED,
      );
    }

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(
        MESSAGE_GROUP_HANDLER_SETUP_SUBSYSTEM,
      ) : console;

    logger.info(LOG_MSG.CREATING, {nodeId});

    const messageGroupServiceHandler = new MessageGroupServiceHandler({
      nodeId,
      systemTableCache,
      cdcIntegrationService,
      createMessageGroupReplica,
      startMessageGroupReplica,
      stopMessageGroupReplica,
      resolveLocalMessageGroupReplica,
      executorOutcomeEmitter,
      // The learner CREATE path (FreshMG 6.B): composed only from a
      // learner-join host, never from createMessageGroupReplica (a lone
      // founder). No production root passes a host yet, so a learner CREATE
      // stays refused (capability unavailable) until the routes are wired.
      ...learnerCreateComposition({messageGroupLearnerJoinHost,
        replicaOperationRepository, ownerIncarnation}),
    });

    messageGroupServiceHandler.initialize();
    messageGroupServiceHandler.registerWithRouter(messageRouter, {
      rpcClient,
    });

    logger.info(LOG_MSG.CREATED, {nodeId});

    return {messageGroupServiceHandler};
  }
}

export {MessageGroupServiceHandlerSetup};
