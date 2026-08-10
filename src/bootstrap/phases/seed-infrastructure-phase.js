/**
 * Seed Infrastructure Phase — handles Phase 1 of seed bootstrap:
 * node service initialization, message router setup, and unified
 * lifecycle owner creation.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../../config/configuration-manager.js';
import {NodeService} from '../../node/node-service.js';
import {MessageRouterSetup} from '../shared/message-router-setup.js';
import {
  StartupServiceLifecycleOwner,
} from '../shared/startup-service-lifecycle-owner.js';
import {assertCritical} from '../../utils/assert.js';
import {
  BOOTSTRAP_ERROR,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_UNIFIED_RECONCILE,
} from '../bootstrap-constants.js';
import {NODE_CONFIG_KEY} from '../../node/node-constants.js';
import {
  SERVICE_DESCRIPTOR_FIELD,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';
import {
  resolveQueryTransportSelection,
} from '../shared/query-transport-selection.js';

const MESSAGE_ROUTER_SETUP_OWNER = 'MessageRouterSetup';
const RECONCILER_INIT_REQUIRED =
  'Bootstrap reconciler must be initialized before reconciliation';

/**
 * Format bootstrap replica options mismatch message.
 * @param {string} serviceId
 * @return {string}
 */
const formatMissingReplicaOptions = (serviceId) =>
  `Missing bootstrap replica options for service ${serviceId}`;

/**
 * Format bootstrap service type mismatch message.
 * @param {string} serviceId
 * @param {string} serviceType
 * @return {string}
 */
const formatServiceTypeMismatch = (serviceId, serviceType) =>
  `Bootstrap service type mismatch for ${serviceId}: ` +
  `expected ${serviceType}`;

/**
 * Handles the infrastructure phase of seed bootstrap.
 */
class SeedInfrastructurePhase {
  /**
   * @param {Object} options
   * @param {Object} options.delegates - Callbacks into the bootstrap
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.startupServiceLifecycleOwner =
      new StartupServiceLifecycleOwner({
        delegates: {
          getNodeId: () => this.delegates.getNodeId(),
          getPhase: () => this.delegates.getPhase(),
          getServiceLifecycleManager: () =>
            this.delegates.getServiceLifecycleManager(),
          setServiceLifecycleManager: (value) =>
            this.delegates.setServiceLifecycleManager(value),
          getServiceReconciler: () =>
            this.delegates.getServiceReconciler(),
          setServiceReconciler: (value) =>
            this.delegates.setServiceReconciler(value),
          createMessageGroupReplica: (context) =>
            this.delegates.createBootstrapMessageGroupReplica(context),
          startMessageGroupReplica: (replicaHandle, context) =>
            this.delegates.startBootstrapMessageGroupReplica(
              replicaHandle,
              context,
            ),
          stopMessageGroupReplica: (replicaHandle, context) =>
            this.delegates.stopBootstrapMessageGroupReplica(
              replicaHandle,
              context,
            ),
          createPartitionReplica: (context) =>
            this.delegates.createBootstrapPartitionReplica(context),
          startPartitionReplica: (replicaHandle, context) =>
            this.delegates.startBootstrapPartitionReplica(
              replicaHandle,
              context,
            ),
          stopPartitionReplica: (replicaHandle, context) =>
            this.delegates.stopBootstrapPartitionReplica(
              replicaHandle,
              context,
            ),
          getServiceRuntimeLifecycle: () =>
            this.delegates.getServiceRuntimeLifecycle(),
          readDesiredState: () =>
            [...this.delegates.getBootstrapDesiredServiceDefinitions()
              .values()],
          readActualState: async () => this.buildBootstrapActualStateRows(),
          getCheckIntervalMs: () => BOOTSTRAP_UNIFIED_RECONCILE.CHECK_INTERVAL_MS,
          getMaxConcurrentServiceActions: () =>
            this.delegates.getConfig().maxConcurrentServiceActions,
          clearDesiredState: () => {
            this.delegates.getBootstrapDesiredServiceDefinitions().clear();
            this.delegates.getBootstrapReplicaOptionsByServiceId().clear();
          },
        },
        reconcilerRequiredError: RECONCILER_INIT_REQUIRED,
      });
  }

  /**
   * Phase 1: Infrastructure setup.
   * Initialize node service and transport.
   * @return {Promise<void>}
   */
  async phaseInfrastructure() {
    const d = this.delegates;
    const logger = d.getLogger();
    const nodeId = d.getNodeId();
    const config = d.getConfig();

    // Initialize configuration if not already done
    const configManager = ConfigurationManager.getInstance();
    if (!configManager.isInitialized()) {
      configManager.initialize({
        node: {id: nodeId},
      });
    }

    // Get or generate node ID
    const resolvedNodeId = nodeId ||
      configManager.get(NODE_CONFIG_KEY.ID) || uuidv4();
    d.setNodeId(resolvedNodeId);

    // Initialize node service
    const nodeService = NodeService.getInstance();
    if (!nodeService.isInitialized()) {
      nodeService.initialize({
        nodeId: resolvedNodeId,
        nodeAddress: d.getNodeAddress(),
      });
    }

    d.setNodeId(nodeService.getNodeId());
    d.setNodeAddress(nodeService.getNodeAddress());

    // Determine WebSocket port from config or options
    const wsPort = d.getWsPort() || config.wsPort;

    // Route message-router setup through the shared owner.
    const messageRouter = await this.createSeedMessageRouter(wsPort);
    d.setMessageRouter(messageRouter);
    d.setTransport(messageRouter);

    logger.debug(BOOTSTRAP_LOG_MSG.INFRA_READY, {
      nodeId: d.getNodeId(),
      nodeAddress: d.getNodeAddress(),
      wsPort: wsPort,
      hasMessageRouter: !!messageRouter,
      hasSelfConnection: wsPort ?
        messageRouter.hasSelfConnection() : false,
      owner: MESSAGE_ROUTER_SETUP_OWNER,
    });

    await this.initializeUnifiedLifecycleOwners();
    await this.triggerBootstrapReconciler(
      BOOTSTRAP_UNIFIED_RECONCILE.INFRA_READY_REASON,
    );
  }

  /**
   * Create the seed message router through the shared setup owner and
   * wire the query message-group service resolver when supported.
   * @param {number|undefined} wsPort
   * @return {Promise<Object>}
   */
  async createSeedMessageRouter(wsPort) {
    const d = this.delegates;
    let messageRouter;
    try {
      messageRouter = await MessageRouterSetup.create({
        nodeId: d.getNodeId(),
        nodeAddress: d.getNodeAddress(),
        advertisedNodeWsAddress: d.getAdvertisedNodeWsAddress?.() || null,
        wsPort: wsPort,
        externalAdmissionEnabled: false,
        bootIncarnation: d.getBootIncarnation?.() || 0,
      });
    } catch (error) {
      d.getLogger().error(BOOTSTRAP_LOG_MSG.ROUTER_INIT_FAILED, {
        nodeId: d.getNodeId(),
        wsPort: wsPort,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(BOOTSTRAP_ERROR.routerInitFailed(error.message));
    }

    if (typeof messageRouter.setQueryMessageGroupServiceResolver ===
        'function') {
      messageRouter.setQueryMessageGroupServiceResolver(() =>
        resolveQueryTransportSelection(
          () => d.resolveQueryTransportMessageGroupSelection(),
        ),
      );
    }
    return messageRouter;
  }

  /**
   * Initialize unified lifecycle owners for bootstrap orchestration.
   * @return {Promise<void>}
   */
  async initializeUnifiedLifecycleOwners() {
    await this.startupServiceLifecycleOwner.ensureOwners();
  }

  /**
   * Trigger one bootstrap reconciliation cycle.
   * @param {string} reason
   * @return {Promise<void>}
   */
  async triggerBootstrapReconciler(reason) {
    await this.startupServiceLifecycleOwner.triggerReconciler(reason);
  }

  /**
   * Stop unified lifecycle owners and clear bootstrap desired-state
   * catalogs.
   * @return {void}
   */
  stopUnifiedLifecycleOwners() {
    this.startupServiceLifecycleOwner.stopOwners();
  }

  /**
   * Build a canonical unified descriptor for bootstrap-managed
   * replicas.
   * @param {string} serviceType
   * @param {string} serviceId
   * @return {Object}
   */
  createBootstrapServiceDescriptor(serviceType, serviceId) {
    const d = this.delegates;
    return {
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: serviceType,
      [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: d.getNodeId(),
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: 1,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]:
        BOOTSTRAP_UNIFIED_RECONCILE.RUNTIME_KIND,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF]: null,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]: null,
    };
  }

  /**
   * Queue a bootstrap replica in desired state and option catalogs.
   * @param {Object} descriptor
   * @param {Object} options
   * @return {void}
   */
  queueBootstrapServiceReplica(descriptor, options) {
    const d = this.delegates;
    const serviceId =
      descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    d.getBootstrapDesiredServiceDefinitions().set(
      serviceId, descriptor,
    );
    d.getBootstrapReplicaOptionsByServiceId().set(
      serviceId, options,
    );
  }

  /**
   * Resolve bootstrap replica options for one serviceId.
   * @param {string} serviceId
   * @param {string} serviceType
   * @return {Object}
   */
  resolveBootstrapReplicaOptions(serviceId, serviceType) {
    const d = this.delegates;
    const options =
      d.getBootstrapReplicaOptionsByServiceId().get(serviceId) ||
      null;
    assertCritical(
      options,
      formatMissingReplicaOptions(serviceId),
    );
    assertCritical(
      options.serviceType === serviceType,
      formatServiceTypeMismatch(serviceId, serviceType),
    );
    return options;
  }

  /**
   * Build local actual-state rows for bootstrap service
   * reconciliation.
   * @return {Object[]}
   */
  buildBootstrapActualStateRows() {
    const d = this.delegates;
    const serviceLifecycleManager = d.getServiceLifecycleManager();
    if (!serviceLifecycleManager) {
      return [];
    }

    const rows = [];

    for (const replicaId of d.getMessageGroupServices().keys()) {
      const handle = this.createBootstrapServiceDescriptor(
        UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
        replicaId,
      );
      rows.push({
        ...handle,
        [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
          serviceLifecycleManager.getReplicaState(handle),
      });
    }

    for (const replicaId of d.getPartitionServices().keys()) {
      const handle = this.createBootstrapServiceDescriptor(
        UNIFIED_SERVICE_TYPE.PARTITION,
        replicaId,
      );
      rows.push({
        ...handle,
        [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
          serviceLifecycleManager.getReplicaState(handle),
      });
    }

    return rows;
  }
}

export {SeedInfrastructurePhase};
