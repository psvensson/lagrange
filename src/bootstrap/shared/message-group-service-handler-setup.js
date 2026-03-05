/**
 * Shared setup for MessageGroupServiceHandler.
 */

import {LoggingService} from '../../logging/logging-service.js';
import {MessageGroupServiceHandler} from
  '../../node/message-group-service-handler.js';
import {DependencyError} from '../bootstrap-errors.js';

const MESSAGE_GROUP_HANDLER_SETUP_SUBSYSTEM =
  'message-group-service-handler-setup';

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
    } = options;

    if (!nodeId) {
      throw new DependencyError(
        'MessageGroupServiceHandlerSetup',
        ERROR_MSG.NODE_ID_REQUIRED,
      );
    }
    if (!messageRouter) {
      throw new DependencyError(
        'MessageGroupServiceHandlerSetup',
        ERROR_MSG.MESSAGE_ROUTER_REQUIRED,
      );
    }
    if (!cdcIntegrationService) {
      throw new DependencyError(
        'MessageGroupServiceHandlerSetup',
        ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED,
      );
    }
    if (!systemTableCache) {
      throw new DependencyError(
        'MessageGroupServiceHandlerSetup',
        ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
      );
    }
    if (typeof createMessageGroupReplica !== 'function') {
      throw new DependencyError(
        'MessageGroupServiceHandlerSetup',
        ERROR_MSG.CREATE_REQUIRED,
      );
    }
    if (typeof startMessageGroupReplica !== 'function') {
      throw new DependencyError(
        'MessageGroupServiceHandlerSetup',
        ERROR_MSG.START_REQUIRED,
      );
    }
    if (typeof stopMessageGroupReplica !== 'function') {
      throw new DependencyError(
        'MessageGroupServiceHandlerSetup',
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
