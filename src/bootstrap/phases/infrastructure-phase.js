/**
 * Infrastructure Phase - First phase of bootstrap process.
 *
 * Creates core infrastructure services:
 * - NodeService initialization
 * - MessageRouter creation and configuration
 *
 * Requirements: 2.1, 2.6, 2.7, 2.8
 */

import {v4 as uuidv4} from 'uuid';
import {EventEmitter} from 'events';
import {ConfigurationManager} from '../../config/configuration-manager.js';
import {LoggingService} from '../../logging/logging-service.js';
import {NodeService} from '../../node/node-service.js';
import {MessageRouter} from '../../transport/message-router.js';
import {NODE_CONFIG_KEY} from '../../node/node-constants.js';
import {NUM} from '../../constants/index.js';
import {BOOTSTRAP_SUBSYSTEM, BOOTSTRAP_LOG_MSG, BOOTSTRAP_ERROR} from '../bootstrap-constants.js';

/**
 * Phase constants for infrastructure setup.
 */
const INFRASTRUCTURE_PHASE = {
  NAME: 'infrastructure',
  EVENT_START: 'infrastructure:start',
  EVENT_COMPLETE: 'infrastructure:complete',
  EVENT_FAILED: 'infrastructure:failed',
};

/**
 * InfrastructurePhase handles the first phase of bootstrap.
 * Creates NodeService and MessageRouter for cluster communication.
 */
class InfrastructurePhase extends EventEmitter {
  /**
   * Create infrastructure phase.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (optional, will be generated if not provided).
   * @param {string} options.nodeAddress - Node address.
   * @param {number} options.wsPort - WebSocket port.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.wsPort = options.wsPort || null;

    // Services created during this phase
    this.nodeService = null;
    this.messageRouter = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE) : console;
  }

  /**
   * Execute the infrastructure phase.
   * @return {Promise<Object>} Phase result with created services.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(INFRASTRUCTURE_PHASE.EVENT_START, {
      nodeId: this.nodeId,
    });

    try {
      // Initialize configuration if not already done
      const configManager = ConfigurationManager.getInstance();
      if (!configManager.isInitialized()) {
        configManager.initialize({
          node: {id: this.nodeId},
        });
      }

      // Get or generate node ID
      this.nodeId = this.nodeId || configManager.get(NODE_CONFIG_KEY.ID) || uuidv4();

      // Initialize node service
      this.nodeService = NodeService.getInstance();
      if (!this.nodeService.isInitialized()) {
        this.nodeService.initialize({
          nodeId: this.nodeId,
          nodeAddress: this.nodeAddress,
        });
      }

      this.nodeId = this.nodeService.getNodeId();
      this.nodeAddress = this.nodeService.getNodeAddress();

      // Create MessageRouter for unified local/remote message routing
      this.messageRouter = new MessageRouter({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
      });

      // Set up resolver to extract nodeId from address pattern "${nodeId}/..."
      this.messageRouter.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[NUM.ONE] : null;
      });

      // Initialize message router
      if (this.wsPort) {
        try {
          await this.messageRouter.initialize({startServer: true});

          this.logger.info(BOOTSTRAP_LOG_MSG.WS_SELF_CONNECTED, {
            nodeId: this.nodeId,
            wsPort: this.wsPort,
            hasSelfConnection: this.messageRouter.hasSelfConnection(),
          });
        } catch (error) {
          this.logger.error(BOOTSTRAP_LOG_MSG.ROUTER_INIT_FAILED, {
            nodeId: this.nodeId,
            wsPort: this.wsPort,
            error: error.message,
            stack: error.stack,
          });
          throw new Error(BOOTSTRAP_ERROR.routerInitFailed(error.message));
        }
      } else {
        // No wsPort - initialize without server (for testing or single-node scenarios)
        try {
          await this.messageRouter.initialize({startServer: false});
        } catch (error) {
          this.logger.error(BOOTSTRAP_LOG_MSG.ROUTER_INIT_FAILED, {
            nodeId: this.nodeId,
            error: error.message,
            stack: error.stack,
          });
          throw new Error(BOOTSTRAP_ERROR.routerInitFailed(error.message));
        }
      }

      const duration = Date.now() - startTime;

      this.logger.debug(BOOTSTRAP_LOG_MSG.INFRA_READY, {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
        hasMessageRouter: !!this.messageRouter,
        hasSelfConnection: this.wsPort ? this.messageRouter.hasSelfConnection() : false,
      });

      const result = {
        phaseName: INFRASTRUCTURE_PHASE.NAME,
        duration,
        services: {
          nodeService: this.nodeService,
          messageRouter: this.messageRouter,
        },
        metadata: {
          nodeId: this.nodeId,
          nodeAddress: this.nodeAddress,
          wsPort: this.wsPort,
        },
      };

      this.emit(INFRASTRUCTURE_PHASE.EVENT_COMPLETE, result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.emit(INFRASTRUCTURE_PHASE.EVENT_FAILED, {
        phaseName: INFRASTRUCTURE_PHASE.NAME,
        duration,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Clean up resources on failure.
   * @return {Promise<void>}
   */
  async cleanup() {
    if (this.messageRouter) {
      try {
        await this.messageRouter.shutdown();
      } catch (error) {
        this.logger.warn('Failed to shutdown message router during cleanup', {
          error: error.message,
        });
      }
      this.messageRouter = null;
    }
  }
}

export {InfrastructurePhase, INFRASTRUCTURE_PHASE};
