/**
 * Seed Infrastructure Phase — handles Phase 1 of seed bootstrap:
 * node service initialization, message router setup, and unified
 * lifecycle owner creation.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
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
import { v4 as uuidv4 } from 'uuid';
import { ConfigurationManager } from '../../config/configuration-manager.js';
import { NodeService } from '../../node/node-service.js';
import { MessageRouterSetup } from '../shared/message-router-setup.js';
import { StartupServiceLifecycleOwner } from '../shared/startup-service-lifecycle-owner.js';
import { assertCritical } from '../../utils/assert.js';
import { BOOTSTRAP_ERROR, BOOTSTRAP_LOG_MSG, BOOTSTRAP_UNIFIED_RECONCILE } from '../bootstrap-constants.js';
import { NODE_CONFIG_KEY } from '../../node/node-constants.js';
import { NUM, SERVICE_DESCRIPTOR_FIELD, TYPEOF, UNIFIED_SERVICE_TYPE } from '../../constants/index.js';
import { ControlPlaneMessageType, getControlPlaneMessageRequiredTables } from '../../control-plane/control-plane-constants.js';
const MESSAGE_ROUTER_SETUP_OWNER = stryMutAct_9fa48("26647") ? "" : (stryCov_9fa48("26647"), 'MessageRouterSetup');
const RECONCILER_INIT_REQUIRED = stryMutAct_9fa48("26648") ? "" : (stryCov_9fa48("26648"), 'Bootstrap reconciler must be initialized before reconciliation');
const QUERY_TRANSPORT_REQUIRED_TABLES = Object.freeze(getControlPlaneMessageRequiredTables(ControlPlaneMessageType.NODE_STATE_UPDATE));
function resolveInitializedQueryMessageGroupService(getService) {
  if (stryMutAct_9fa48("26649")) {
    {}
  } else {
    stryCov_9fa48("26649");
    if (stryMutAct_9fa48("26652") ? typeof getService === TYPEOF.FUNCTION : stryMutAct_9fa48("26651") ? false : stryMutAct_9fa48("26650") ? true : (stryCov_9fa48("26650", "26651", "26652"), typeof getService !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("26653")) {
        {}
      } else {
        stryCov_9fa48("26653");
        return null;
      }
    }
    const service = getService();
    return (stryMutAct_9fa48("26656") ? service?.initialized !== true : stryMutAct_9fa48("26655") ? false : stryMutAct_9fa48("26654") ? true : (stryCov_9fa48("26654", "26655", "26656"), (stryMutAct_9fa48("26657") ? service.initialized : (stryCov_9fa48("26657"), service?.initialized)) === (stryMutAct_9fa48("26658") ? false : (stryCov_9fa48("26658"), true)))) ? service : null;
  }
}

/**
 * Format bootstrap replica options mismatch message.
 * @param {string} serviceId
 * @return {string}
 */
const formatMissingReplicaOptions = stryMutAct_9fa48("26659") ? () => undefined : (stryCov_9fa48("26659"), (() => {
  const formatMissingReplicaOptions = serviceId => stryMutAct_9fa48("26660") ? `` : (stryCov_9fa48("26660"), `Missing bootstrap replica options for service ${serviceId}`);
  return formatMissingReplicaOptions;
})());

/**
 * Format bootstrap service type mismatch message.
 * @param {string} serviceId
 * @param {string} serviceType
 * @return {string}
 */
const formatServiceTypeMismatch = stryMutAct_9fa48("26661") ? () => undefined : (stryCov_9fa48("26661"), (() => {
  const formatServiceTypeMismatch = (serviceId, serviceType) => (stryMutAct_9fa48("26662") ? `` : (stryCov_9fa48("26662"), `Bootstrap service type mismatch for ${serviceId}: `)) + (stryMutAct_9fa48("26663") ? `` : (stryCov_9fa48("26663"), `expected ${serviceType}`));
  return formatServiceTypeMismatch;
})());

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
    if (stryMutAct_9fa48("26664")) {
      {}
    } else {
      stryCov_9fa48("26664");
      this.delegates = stryMutAct_9fa48("26667") ? options.delegates && {} : stryMutAct_9fa48("26666") ? false : stryMutAct_9fa48("26665") ? true : (stryCov_9fa48("26665", "26666", "26667"), options.delegates || {});
      this.startupServiceLifecycleOwner = new StartupServiceLifecycleOwner(stryMutAct_9fa48("26668") ? {} : (stryCov_9fa48("26668"), {
        delegates: stryMutAct_9fa48("26669") ? {} : (stryCov_9fa48("26669"), {
          getNodeId: stryMutAct_9fa48("26670") ? () => undefined : (stryCov_9fa48("26670"), () => this.delegates.getNodeId()),
          getPhase: stryMutAct_9fa48("26671") ? () => undefined : (stryCov_9fa48("26671"), () => this.delegates.getPhase()),
          getServiceLifecycleManager: stryMutAct_9fa48("26672") ? () => undefined : (stryCov_9fa48("26672"), () => this.delegates.getServiceLifecycleManager()),
          setServiceLifecycleManager: stryMutAct_9fa48("26673") ? () => undefined : (stryCov_9fa48("26673"), value => this.delegates.setServiceLifecycleManager(value)),
          getServiceReconciler: stryMutAct_9fa48("26674") ? () => undefined : (stryCov_9fa48("26674"), () => this.delegates.getServiceReconciler()),
          setServiceReconciler: stryMutAct_9fa48("26675") ? () => undefined : (stryCov_9fa48("26675"), value => this.delegates.setServiceReconciler(value)),
          createMessageGroupReplica: stryMutAct_9fa48("26676") ? () => undefined : (stryCov_9fa48("26676"), context => this.delegates.createBootstrapMessageGroupReplica(context)),
          startMessageGroupReplica: stryMutAct_9fa48("26677") ? () => undefined : (stryCov_9fa48("26677"), (replicaHandle, context) => this.delegates.startBootstrapMessageGroupReplica(replicaHandle, context)),
          stopMessageGroupReplica: stryMutAct_9fa48("26678") ? () => undefined : (stryCov_9fa48("26678"), (replicaHandle, context) => this.delegates.stopBootstrapMessageGroupReplica(replicaHandle, context)),
          createPartitionReplica: stryMutAct_9fa48("26679") ? () => undefined : (stryCov_9fa48("26679"), context => this.delegates.createBootstrapPartitionReplica(context)),
          startPartitionReplica: stryMutAct_9fa48("26680") ? () => undefined : (stryCov_9fa48("26680"), (replicaHandle, context) => this.delegates.startBootstrapPartitionReplica(replicaHandle, context)),
          stopPartitionReplica: stryMutAct_9fa48("26681") ? () => undefined : (stryCov_9fa48("26681"), (replicaHandle, context) => this.delegates.stopBootstrapPartitionReplica(replicaHandle, context)),
          getServiceRuntimeLifecycle: stryMutAct_9fa48("26682") ? () => undefined : (stryCov_9fa48("26682"), () => this.delegates.getServiceRuntimeLifecycle()),
          readDesiredState: stryMutAct_9fa48("26683") ? () => undefined : (stryCov_9fa48("26683"), () => stryMutAct_9fa48("26684") ? [] : (stryCov_9fa48("26684"), [...this.delegates.getBootstrapDesiredServiceDefinitions().values()])),
          readActualState: stryMutAct_9fa48("26685") ? () => undefined : (stryCov_9fa48("26685"), async () => this.buildBootstrapActualStateRows()),
          getCheckIntervalMs: stryMutAct_9fa48("26686") ? () => undefined : (stryCov_9fa48("26686"), () => BOOTSTRAP_UNIFIED_RECONCILE.CHECK_INTERVAL_MS),
          getMaxConcurrentServiceActions: stryMutAct_9fa48("26687") ? () => undefined : (stryCov_9fa48("26687"), () => this.delegates.getConfig().maxConcurrentServiceActions),
          clearDesiredState: () => {
            if (stryMutAct_9fa48("26688")) {
              {}
            } else {
              stryCov_9fa48("26688");
              this.delegates.getBootstrapDesiredServiceDefinitions().clear();
              this.delegates.getBootstrapReplicaOptionsByServiceId().clear();
            }
          }
        }),
        reconcilerRequiredError: RECONCILER_INIT_REQUIRED
      }));
    }
  }

  /**
   * Phase 1: Infrastructure setup.
   * Initialize node service and transport.
   * @return {Promise<void>}
   */
  async phaseInfrastructure() {
    if (stryMutAct_9fa48("26689")) {
      {}
    } else {
      stryCov_9fa48("26689");
      const d = this.delegates;
      const logger = d.getLogger();
      const nodeId = d.getNodeId();
      const config = d.getConfig();

      // Initialize configuration if not already done
      const configManager = ConfigurationManager.getInstance();
      if (stryMutAct_9fa48("26692") ? false : stryMutAct_9fa48("26691") ? true : stryMutAct_9fa48("26690") ? configManager.isInitialized() : (stryCov_9fa48("26690", "26691", "26692"), !configManager.isInitialized())) {
        if (stryMutAct_9fa48("26693")) {
          {}
        } else {
          stryCov_9fa48("26693");
          configManager.initialize(stryMutAct_9fa48("26694") ? {} : (stryCov_9fa48("26694"), {
            node: stryMutAct_9fa48("26695") ? {} : (stryCov_9fa48("26695"), {
              id: nodeId
            })
          }));
        }
      }

      // Get or generate node ID
      const resolvedNodeId = stryMutAct_9fa48("26698") ? (nodeId || configManager.get(NODE_CONFIG_KEY.ID)) && uuidv4() : stryMutAct_9fa48("26697") ? false : stryMutAct_9fa48("26696") ? true : (stryCov_9fa48("26696", "26697", "26698"), (stryMutAct_9fa48("26700") ? nodeId && configManager.get(NODE_CONFIG_KEY.ID) : stryMutAct_9fa48("26699") ? false : (stryCov_9fa48("26699", "26700"), nodeId || configManager.get(NODE_CONFIG_KEY.ID))) || uuidv4());
      d.setNodeId(resolvedNodeId);

      // Initialize node service
      const nodeService = NodeService.getInstance();
      if (stryMutAct_9fa48("26703") ? false : stryMutAct_9fa48("26702") ? true : stryMutAct_9fa48("26701") ? nodeService.isInitialized() : (stryCov_9fa48("26701", "26702", "26703"), !nodeService.isInitialized())) {
        if (stryMutAct_9fa48("26704")) {
          {}
        } else {
          stryCov_9fa48("26704");
          nodeService.initialize(stryMutAct_9fa48("26705") ? {} : (stryCov_9fa48("26705"), {
            nodeId: resolvedNodeId,
            nodeAddress: d.getNodeAddress()
          }));
        }
      }
      d.setNodeId(nodeService.getNodeId());
      d.setNodeAddress(nodeService.getNodeAddress());

      // Determine WebSocket port from config or options
      const wsPort = stryMutAct_9fa48("26708") ? d.getWsPort() && config.wsPort : stryMutAct_9fa48("26707") ? false : stryMutAct_9fa48("26706") ? true : (stryCov_9fa48("26706", "26707", "26708"), d.getWsPort() || config.wsPort);

      // Route message-router setup through the shared owner.
      let messageRouter;
      try {
        if (stryMutAct_9fa48("26709")) {
          {}
        } else {
          stryCov_9fa48("26709");
          messageRouter = await MessageRouterSetup.create(stryMutAct_9fa48("26710") ? {} : (stryCov_9fa48("26710"), {
            nodeId: d.getNodeId(),
            nodeAddress: d.getNodeAddress(),
            advertisedNodeWsAddress: stryMutAct_9fa48("26713") ? d.getAdvertisedNodeWsAddress?.() && null : stryMutAct_9fa48("26712") ? false : stryMutAct_9fa48("26711") ? true : (stryCov_9fa48("26711", "26712", "26713"), (stryMutAct_9fa48("26714") ? d.getAdvertisedNodeWsAddress() : (stryCov_9fa48("26714"), d.getAdvertisedNodeWsAddress?.())) || null),
            wsPort: wsPort,
            externalAdmissionEnabled: stryMutAct_9fa48("26715") ? true : (stryCov_9fa48("26715"), false)
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("26716")) {
          {}
        } else {
          stryCov_9fa48("26716");
          logger.error(BOOTSTRAP_LOG_MSG.ROUTER_INIT_FAILED, stryMutAct_9fa48("26717") ? {} : (stryCov_9fa48("26717"), {
            nodeId: d.getNodeId(),
            wsPort: wsPort,
            error: error.message,
            stack: error.stack
          }));
          throw new Error(BOOTSTRAP_ERROR.routerInitFailed(error.message));
        }
      }
      if (stryMutAct_9fa48("26720") ? typeof messageRouter.setQueryMessageGroupServiceResolver !== TYPEOF.FUNCTION : stryMutAct_9fa48("26719") ? false : stryMutAct_9fa48("26718") ? true : (stryCov_9fa48("26718", "26719", "26720"), typeof messageRouter.setQueryMessageGroupServiceResolver === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("26721")) {
          {}
        } else {
          stryCov_9fa48("26721");
          messageRouter.setQueryMessageGroupServiceResolver(stryMutAct_9fa48("26722") ? () => undefined : (stryCov_9fa48("26722"), () => resolveInitializedQueryMessageGroupService(stryMutAct_9fa48("26723") ? () => undefined : (stryCov_9fa48("26723"), () => d.getLeaderMessageGroupService(stryMutAct_9fa48("26724") ? {} : (stryCov_9fa48("26724"), {
            requiredTables: QUERY_TRANSPORT_REQUIRED_TABLES
          }))))));
        }
      }
      d.setMessageRouter(messageRouter);
      d.setTransport(messageRouter);
      logger.debug(BOOTSTRAP_LOG_MSG.INFRA_READY, stryMutAct_9fa48("26725") ? {} : (stryCov_9fa48("26725"), {
        nodeId: d.getNodeId(),
        nodeAddress: d.getNodeAddress(),
        wsPort: wsPort,
        hasMessageRouter: stryMutAct_9fa48("26726") ? !messageRouter : (stryCov_9fa48("26726"), !(stryMutAct_9fa48("26727") ? messageRouter : (stryCov_9fa48("26727"), !messageRouter))),
        hasSelfConnection: wsPort ? messageRouter.hasSelfConnection() : stryMutAct_9fa48("26728") ? true : (stryCov_9fa48("26728"), false),
        owner: MESSAGE_ROUTER_SETUP_OWNER
      }));
      await this.initializeUnifiedLifecycleOwners();
      await this.triggerBootstrapReconciler(BOOTSTRAP_UNIFIED_RECONCILE.INFRA_READY_REASON);
    }
  }

  /**
   * Initialize unified lifecycle owners for bootstrap orchestration.
   * @return {Promise<void>}
   */
  async initializeUnifiedLifecycleOwners() {
    if (stryMutAct_9fa48("26729")) {
      {}
    } else {
      stryCov_9fa48("26729");
      await this.startupServiceLifecycleOwner.ensureOwners();
    }
  }

  /**
   * Trigger one bootstrap reconciliation cycle.
   * @param {string} reason
   * @return {Promise<void>}
   */
  async triggerBootstrapReconciler(reason) {
    if (stryMutAct_9fa48("26730")) {
      {}
    } else {
      stryCov_9fa48("26730");
      await this.startupServiceLifecycleOwner.triggerReconciler(reason);
    }
  }

  /**
   * Stop unified lifecycle owners and clear bootstrap desired-state
   * catalogs.
   * @return {void}
   */
  stopUnifiedLifecycleOwners() {
    if (stryMutAct_9fa48("26731")) {
      {}
    } else {
      stryCov_9fa48("26731");
      this.startupServiceLifecycleOwner.stopOwners();
    }
  }

  /**
   * Build a canonical unified descriptor for bootstrap-managed
   * replicas.
   * @param {string} serviceType
   * @param {string} serviceId
   * @return {Object}
   */
  createBootstrapServiceDescriptor(serviceType, serviceId) {
    if (stryMutAct_9fa48("26732")) {
      {}
    } else {
      stryCov_9fa48("26732");
      const d = this.delegates;
      return stryMutAct_9fa48("26733") ? {} : (stryCov_9fa48("26733"), {
        [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
        [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: serviceType,
        [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: d.getNodeId(),
        [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: serviceId,
        [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: NUM.ONE,
        [SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]: BOOTSTRAP_UNIFIED_RECONCILE.RUNTIME_KIND,
        [SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF]: null,
        [SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]: null
      });
    }
  }

  /**
   * Queue a bootstrap replica in desired state and option catalogs.
   * @param {Object} descriptor
   * @param {Object} options
   * @return {void}
   */
  queueBootstrapServiceReplica(descriptor, options) {
    if (stryMutAct_9fa48("26734")) {
      {}
    } else {
      stryCov_9fa48("26734");
      const d = this.delegates;
      const serviceId = descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
      d.getBootstrapDesiredServiceDefinitions().set(serviceId, descriptor);
      d.getBootstrapReplicaOptionsByServiceId().set(serviceId, options);
    }
  }

  /**
   * Resolve bootstrap replica options for one serviceId.
   * @param {string} serviceId
   * @param {string} serviceType
   * @return {Object}
   */
  resolveBootstrapReplicaOptions(serviceId, serviceType) {
    if (stryMutAct_9fa48("26735")) {
      {}
    } else {
      stryCov_9fa48("26735");
      const d = this.delegates;
      const options = stryMutAct_9fa48("26738") ? d.getBootstrapReplicaOptionsByServiceId().get(serviceId) && null : stryMutAct_9fa48("26737") ? false : stryMutAct_9fa48("26736") ? true : (stryCov_9fa48("26736", "26737", "26738"), d.getBootstrapReplicaOptionsByServiceId().get(serviceId) || null);
      assertCritical(options, formatMissingReplicaOptions(serviceId));
      assertCritical(stryMutAct_9fa48("26741") ? options.serviceType !== serviceType : stryMutAct_9fa48("26740") ? false : stryMutAct_9fa48("26739") ? true : (stryCov_9fa48("26739", "26740", "26741"), options.serviceType === serviceType), formatServiceTypeMismatch(serviceId, serviceType));
      return options;
    }
  }

  /**
   * Build local actual-state rows for bootstrap service
   * reconciliation.
   * @return {Object[]}
   */
  buildBootstrapActualStateRows() {
    if (stryMutAct_9fa48("26742")) {
      {}
    } else {
      stryCov_9fa48("26742");
      const d = this.delegates;
      const serviceLifecycleManager = d.getServiceLifecycleManager();
      if (stryMutAct_9fa48("26745") ? false : stryMutAct_9fa48("26744") ? true : stryMutAct_9fa48("26743") ? serviceLifecycleManager : (stryCov_9fa48("26743", "26744", "26745"), !serviceLifecycleManager)) {
        if (stryMutAct_9fa48("26746")) {
          {}
        } else {
          stryCov_9fa48("26746");
          return stryMutAct_9fa48("26747") ? ["Stryker was here"] : (stryCov_9fa48("26747"), []);
        }
      }
      const rows = stryMutAct_9fa48("26748") ? ["Stryker was here"] : (stryCov_9fa48("26748"), []);
      for (const replicaId of d.getMessageGroupServices().keys()) {
        if (stryMutAct_9fa48("26749")) {
          {}
        } else {
          stryCov_9fa48("26749");
          const handle = this.createBootstrapServiceDescriptor(UNIFIED_SERVICE_TYPE.MESSAGE_GROUP, replicaId);
          rows.push(stryMutAct_9fa48("26750") ? {} : (stryCov_9fa48("26750"), {
            ...handle,
            [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]: serviceLifecycleManager.getReplicaState(handle)
          }));
        }
      }
      for (const replicaId of d.getPartitionServices().keys()) {
        if (stryMutAct_9fa48("26751")) {
          {}
        } else {
          stryCov_9fa48("26751");
          const handle = this.createBootstrapServiceDescriptor(UNIFIED_SERVICE_TYPE.PARTITION, replicaId);
          rows.push(stryMutAct_9fa48("26752") ? {} : (stryCov_9fa48("26752"), {
            ...handle,
            [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]: serviceLifecycleManager.getReplicaState(handle)
          }));
        }
      }
      return rows;
    }
  }
}
export { SeedInfrastructurePhase };