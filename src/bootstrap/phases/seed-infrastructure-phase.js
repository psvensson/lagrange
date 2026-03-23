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
import {assertCritical} from '../../utils/assert.js';
import {
  BOOTSTRAP_ERROR,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_UNIFIED_RECONCILE,
} from '../bootstrap-constants.js';
import {NODE_CONFIG_KEY} from '../../node/node-constants.js';
import {
  NUM,
  SERVICE_DESCRIPTOR_FIELD,
  TYPEOF,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';
import {
  MessageGroupServiceAdapter,
  PartitionServiceAdapter,
  RuntimeServiceAdapter,
  ServiceLifecycleManager,
  ServiceReconciler,
} from '../../service/index.js';
import {
  ControlPlaneMessageType,
  getControlPlaneMessageRequiredTables,
} from '../../control-plane/control-plane-constants.js';

const MESSAGE_ROUTER_SETUP_OWNER = 'MessageRouterSetup';
const RECONCILER_INIT_REQUIRED =
  'Bootstrap reconciler must be initialized before reconciliation';
const QUERY_TRANSPORT_REQUIRED_TABLES = Object.freeze(
  getControlPlaneMessageRequiredTables(
    ControlPlaneMessageType.NODE_STATE_UPDATE,
  ),
);

function resolveInitializedQueryMessageGroupService(getService) {
  if (typeof getService !== TYPEOF.FUNCTION) {
    return null;
  }
  const service = getService();
  return service?.initialized === true ? service : null;
}

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
    let messageRouter;
    try {
      messageRouter = await MessageRouterSetup.create({
        nodeId: d.getNodeId(),
        nodeAddress: d.getNodeAddress(),
        advertisedNodeWsAddress: d.getAdvertisedNodeWsAddress?.() || null,
        wsPort: wsPort,
      });
    } catch (error) {
      logger.error(BOOTSTRAP_LOG_MSG.ROUTER_INIT_FAILED, {
        nodeId: d.getNodeId(),
        wsPort: wsPort,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(BOOTSTRAP_ERROR.routerInitFailed(error.message));
    }

    if (typeof messageRouter.setQueryMessageGroupServiceResolver ===
        TYPEOF.FUNCTION) {
      messageRouter.setQueryMessageGroupServiceResolver(() =>
        resolveInitializedQueryMessageGroupService(
          () => d.getLeaderMessageGroupService({
            requiredTables: QUERY_TRANSPORT_REQUIRED_TABLES,
          }),
        ),
      );
    }
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
   * Initialize unified lifecycle owners for bootstrap orchestration.
   * @return {Promise<void>}
   */
  async initializeUnifiedLifecycleOwners() {
    const d = this.delegates;
    if (d.getServiceLifecycleManager() && d.getServiceReconciler()) {
      return;
    }

    const serviceLifecycleManager = new ServiceLifecycleManager();
    serviceLifecycleManager.registerAdapter(
      new MessageGroupServiceAdapter({
        createReplica: (context) =>
          d.createBootstrapMessageGroupReplica(context),
        startReplica: (replicaHandle, context) =>
          d.startBootstrapMessageGroupReplica(replicaHandle, context),
        stopReplica: (replicaHandle, context) =>
          d.stopBootstrapMessageGroupReplica(replicaHandle, context),
      }),
    );
    serviceLifecycleManager.registerAdapter(
      new PartitionServiceAdapter({
        createReplica: (context) =>
          d.createBootstrapPartitionReplica(context),
        startReplica: (replicaHandle, context) =>
          d.startBootstrapPartitionReplica(replicaHandle, context),
        stopReplica: (replicaHandle, context) =>
          d.stopBootstrapPartitionReplica(replicaHandle, context),
      }),
    );
    serviceLifecycleManager.registerAdapter(
      new RuntimeServiceAdapter({
        serviceRuntimeLifecycle: d.getServiceRuntimeLifecycle(),
      }),
    );
    d.setServiceLifecycleManager(serviceLifecycleManager);

    const config = d.getConfig();
    const serviceReconciler = new ServiceReconciler({
      lifecycleManager: serviceLifecycleManager,
      desiredStateReader: async () =>
        [...d.getBootstrapDesiredServiceDefinitions().values()],
      actualStateReader: async () =>
        this.buildBootstrapActualStateRows(),
      checkIntervalMs: BOOTSTRAP_UNIFIED_RECONCILE.CHECK_INTERVAL_MS,
      maxConcurrentServiceActions:
        config.maxConcurrentServiceActions,
    });

    await serviceReconciler.start();
    d.setServiceReconciler(serviceReconciler);
  }

  /**
   * Trigger one bootstrap reconciliation cycle.
   * @param {string} reason
   * @return {Promise<void>}
   */
  async triggerBootstrapReconciler(reason) {
    const d = this.delegates;
    const serviceReconciler = d.getServiceReconciler();
    assertCritical(
      serviceReconciler,
      RECONCILER_INIT_REQUIRED,
    );
    await serviceReconciler.trigger(reason, {
      nodeId: d.getNodeId(),
      phase: d.getPhase(),
    });
  }

  /**
   * Stop unified lifecycle owners and clear bootstrap desired-state
   * catalogs.
   * @return {void}
   */
  stopUnifiedLifecycleOwners() {
    const d = this.delegates;
    const serviceReconciler = d.getServiceReconciler();
    if (serviceReconciler) {
      serviceReconciler.stop();
      d.setServiceReconciler(null);
    }
    d.setServiceLifecycleManager(null);
    d.getBootstrapDesiredServiceDefinitions().clear();
    d.getBootstrapReplicaOptionsByServiceId().clear();
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
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: NUM.ONE,
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
