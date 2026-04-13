/**
 * Connect WebSocket Phase — handles MessageRouter initialization,
 * seed node WebSocket connection, and full mesh connectivity during
 * the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
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
import { assertCritical } from '../../utils/assert.js';
import { MessageRouterSetup } from '../shared/message-router-setup.js';
import { JOINING_ERROR_MSG, JOINING_LOG_MSG, JOINING_UNIFIED_RECONCILE } from '../node-joining-constants.js';
import { ADDRESS, NUM, PROTOCOL, STATE, TYPEOF } from '../../constants/index.js';
import { ENTRYPOINT_DEFAULT } from '../../constants/entrypoint.js';
import { CONNECTION_STATE } from '../../constants/transport.js';
import { NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE, resolveNodeWebSocketAddress } from '../../transport/node-address-resolution.js';
const OWNER_MESSAGE_ROUTER_SETUP = stryMutAct_9fa48("24425") ? "" : (stryCov_9fa48("24425"), 'MessageRouterSetup');
const ERR_MISSING_WS_ENDPOINT = stryMutAct_9fa48("24426") ? "" : (stryCov_9fa48("24426"), 'Missing canonical node_endpoints websocket address');
const LOG_SEED_WS_FALLBACK = stryMutAct_9fa48("24427") ? "" : (stryCov_9fa48("24427"), '[JOIN-DEBUG] Proceeding with peer mesh after seed websocket retry exhaustion');
const MESH_CONNECTED_OR_IN_FLIGHT_STATES = new Set(stryMutAct_9fa48("24428") ? [] : (stryCov_9fa48("24428"), [CONNECTION_STATE.CONNECTED, CONNECTION_STATE.CONNECTING, CONNECTION_STATE.RECONNECTING]));
function resolveQueryTransportSelection(getSelection) {
  if (stryMutAct_9fa48("24429")) {
    {}
  } else {
    stryCov_9fa48("24429");
    if (stryMutAct_9fa48("24432") ? typeof getSelection === TYPEOF.FUNCTION : stryMutAct_9fa48("24431") ? false : stryMutAct_9fa48("24430") ? true : (stryCov_9fa48("24430", "24431", "24432"), typeof getSelection !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("24433")) {
        {}
      } else {
        stryCov_9fa48("24433");
        return null;
      }
    }
    const selection = getSelection();
    if (stryMutAct_9fa48("24436") ? selection || typeof selection.sendMessage === TYPEOF.FUNCTION : stryMutAct_9fa48("24435") ? false : stryMutAct_9fa48("24434") ? true : (stryCov_9fa48("24434", "24435", "24436"), selection && (stryMutAct_9fa48("24438") ? typeof selection.sendMessage !== TYPEOF.FUNCTION : stryMutAct_9fa48("24437") ? true : (stryCov_9fa48("24437", "24438"), typeof selection.sendMessage === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("24439")) {
        {}
      } else {
        stryCov_9fa48("24439");
        return (stryMutAct_9fa48("24442") ? selection.initialized !== true : stryMutAct_9fa48("24441") ? false : stryMutAct_9fa48("24440") ? true : (stryCov_9fa48("24440", "24441", "24442"), selection.initialized === (stryMutAct_9fa48("24443") ? false : (stryCov_9fa48("24443"), true)))) ? selection : null;
      }
    }
    if (stryMutAct_9fa48("24446") ? !selection && typeof selection !== TYPEOF.OBJECT : stryMutAct_9fa48("24445") ? false : stryMutAct_9fa48("24444") ? true : (stryCov_9fa48("24444", "24445", "24446"), (stryMutAct_9fa48("24447") ? selection : (stryCov_9fa48("24447"), !selection)) || (stryMutAct_9fa48("24449") ? typeof selection === TYPEOF.OBJECT : stryMutAct_9fa48("24448") ? false : (stryCov_9fa48("24448", "24449"), typeof selection !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("24450")) {
        {}
      } else {
        stryCov_9fa48("24450");
        return null;
      }
    }
    const service = selection.service;
    if (stryMutAct_9fa48("24453") ? service && typeof service.sendMessage === TYPEOF.FUNCTION || service.initialized === true : stryMutAct_9fa48("24452") ? false : stryMutAct_9fa48("24451") ? true : (stryCov_9fa48("24451", "24452", "24453"), (stryMutAct_9fa48("24455") ? service || typeof service.sendMessage === TYPEOF.FUNCTION : stryMutAct_9fa48("24454") ? true : (stryCov_9fa48("24454", "24455"), service && (stryMutAct_9fa48("24457") ? typeof service.sendMessage !== TYPEOF.FUNCTION : stryMutAct_9fa48("24456") ? true : (stryCov_9fa48("24456", "24457"), typeof service.sendMessage === TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("24459") ? service.initialized !== true : stryMutAct_9fa48("24458") ? true : (stryCov_9fa48("24458", "24459"), service.initialized === (stryMutAct_9fa48("24460") ? false : (stryCov_9fa48("24460"), true)))))) {
      if (stryMutAct_9fa48("24461")) {
        {}
      } else {
        stryCov_9fa48("24461");
        return stryMutAct_9fa48("24462") ? {} : (stryCov_9fa48("24462"), {
          ...selection,
          service
        });
      }
    }
    return stryMutAct_9fa48("24463") ? {} : (stryCov_9fa48("24463"), {
      service: null,
      reason: (stryMutAct_9fa48("24466") ? typeof selection.reason === TYPEOF.STRING || selection.reason.length > NUM.ZERO : stryMutAct_9fa48("24465") ? false : stryMutAct_9fa48("24464") ? true : (stryCov_9fa48("24464", "24465", "24466"), (stryMutAct_9fa48("24468") ? typeof selection.reason !== TYPEOF.STRING : stryMutAct_9fa48("24467") ? true : (stryCov_9fa48("24467", "24468"), typeof selection.reason === TYPEOF.STRING)) && (stryMutAct_9fa48("24471") ? selection.reason.length <= NUM.ZERO : stryMutAct_9fa48("24470") ? selection.reason.length >= NUM.ZERO : stryMutAct_9fa48("24469") ? true : (stryCov_9fa48("24469", "24470", "24471"), selection.reason.length > NUM.ZERO)))) ? selection.reason : null,
      retryAfterMs: (stryMutAct_9fa48("24474") ? Number.isFinite(selection.retryAfterMs) || selection.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("24473") ? false : stryMutAct_9fa48("24472") ? true : (stryCov_9fa48("24472", "24473", "24474"), Number.isFinite(selection.retryAfterMs) && (stryMutAct_9fa48("24477") ? selection.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("24476") ? selection.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("24475") ? true : (stryCov_9fa48("24475", "24476", "24477"), selection.retryAfterMs > NUM.ZERO)))) ? Math.floor(selection.retryAfterMs) : NUM.ZERO
    });
  }
}
function getConnectedPeerNodeIds(messageRouter, localNodeId) {
  if (stryMutAct_9fa48("24478")) {
    {}
  } else {
    stryCov_9fa48("24478");
    if (stryMutAct_9fa48("24481") ? !messageRouter && typeof messageRouter !== TYPEOF.OBJECT : stryMutAct_9fa48("24480") ? false : stryMutAct_9fa48("24479") ? true : (stryCov_9fa48("24479", "24480", "24481"), (stryMutAct_9fa48("24482") ? messageRouter : (stryCov_9fa48("24482"), !messageRouter)) || (stryMutAct_9fa48("24484") ? typeof messageRouter === TYPEOF.OBJECT : stryMutAct_9fa48("24483") ? false : (stryCov_9fa48("24483", "24484"), typeof messageRouter !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("24485")) {
        {}
      } else {
        stryCov_9fa48("24485");
        return stryMutAct_9fa48("24486") ? ["Stryker was here"] : (stryCov_9fa48("24486"), []);
      }
    }
    const connectedNodeIds = (stryMutAct_9fa48("24489") ? typeof messageRouter.getConnectedNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("24488") ? false : stryMutAct_9fa48("24487") ? true : (stryCov_9fa48("24487", "24488", "24489"), typeof messageRouter.getConnectedNodes === TYPEOF.FUNCTION)) ? messageRouter.getConnectedNodes() : stryMutAct_9fa48("24490") ? Array.from(messageRouter.nodeConnections?.entries?.() || []).map(([nodeId]) => nodeId) : (stryCov_9fa48("24490"), Array.from(stryMutAct_9fa48("24493") ? messageRouter.nodeConnections?.entries?.() && [] : stryMutAct_9fa48("24492") ? false : stryMutAct_9fa48("24491") ? true : (stryCov_9fa48("24491", "24492", "24493"), (stryMutAct_9fa48("24495") ? messageRouter.nodeConnections.entries?.() : stryMutAct_9fa48("24494") ? messageRouter.nodeConnections?.entries() : (stryCov_9fa48("24494", "24495"), messageRouter.nodeConnections?.entries?.())) || (stryMutAct_9fa48("24496") ? ["Stryker was here"] : (stryCov_9fa48("24496"), [])))).filter(stryMutAct_9fa48("24497") ? () => undefined : (stryCov_9fa48("24497"), ([, connection]) => stryMutAct_9fa48("24500") ? connection?.state !== STATE.CONNECTED : stryMutAct_9fa48("24499") ? false : stryMutAct_9fa48("24498") ? true : (stryCov_9fa48("24498", "24499", "24500"), (stryMutAct_9fa48("24501") ? connection.state : (stryCov_9fa48("24501"), connection?.state)) === STATE.CONNECTED))).map(stryMutAct_9fa48("24502") ? () => undefined : (stryCov_9fa48("24502"), ([nodeId]) => nodeId)));
    return stryMutAct_9fa48("24503") ? connectedNodeIds : (stryCov_9fa48("24503"), connectedNodeIds.filter(nodeId => {
      if (stryMutAct_9fa48("24504")) {
        {}
      } else {
        stryCov_9fa48("24504");
        return stryMutAct_9fa48("24507") ? typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO || nodeId !== localNodeId : stryMutAct_9fa48("24506") ? false : stryMutAct_9fa48("24505") ? true : (stryCov_9fa48("24505", "24506", "24507"), (stryMutAct_9fa48("24509") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("24508") ? true : (stryCov_9fa48("24508", "24509"), (stryMutAct_9fa48("24511") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("24510") ? true : (stryCov_9fa48("24510", "24511"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("24514") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("24513") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("24512") ? true : (stryCov_9fa48("24512", "24513", "24514"), nodeId.length > NUM.ZERO)))) && (stryMutAct_9fa48("24516") ? nodeId === localNodeId : stryMutAct_9fa48("24515") ? true : (stryCov_9fa48("24515", "24516"), nodeId !== localNodeId)));
      }
    }));
  }
}

/**
 * Handles the connect-websocket phase of the join process.
 */
class ConnectWebSocketPhase {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("24517")) {
      {}
    } else {
      stryCov_9fa48("24517");
      this.nodeId = options.nodeId;
      this.delegates = stryMutAct_9fa48("24520") ? options.delegates && {} : stryMutAct_9fa48("24519") ? false : stryMutAct_9fa48("24518") ? true : (stryCov_9fa48("24518", "24519", "24520"), options.delegates || {});
    }
  }

  /**
   * Initialize MessageRouter, connect to seed node via WebSocket,
   * then establish full mesh connectivity with all cluster nodes.
   * @return {Promise<void>}
   */
  async phaseConnectWebSocket() {
    if (stryMutAct_9fa48("24521")) {
      {}
    } else {
      stryCov_9fa48("24521");
      const wsPort = this.delegates.getWsPort();
      const identifyPayload = this.delegates.getIdentifyPayload();
      const nodeAddress = this.delegates.getNodeAddress();
      const advertisedNodeWsAddress = stryMutAct_9fa48("24524") ? this.delegates.getAdvertisedNodeWsAddress?.() && null : stryMutAct_9fa48("24523") ? false : stryMutAct_9fa48("24522") ? true : (stryCov_9fa48("24522", "24523", "24524"), (stryMutAct_9fa48("24525") ? this.delegates.getAdvertisedNodeWsAddress() : (stryCov_9fa48("24525"), this.delegates.getAdvertisedNodeWsAddress?.())) || null);
      const logger = this.delegates.getLogger();

      // Route message-router setup through the shared owner.
      let messageRouter;
      try {
        if (stryMutAct_9fa48("24526")) {
          {}
        } else {
          stryCov_9fa48("24526");
          messageRouter = await MessageRouterSetup.create(stryMutAct_9fa48("24527") ? {} : (stryCov_9fa48("24527"), {
            nodeId: this.nodeId,
            nodeAddress,
            advertisedNodeWsAddress,
            wsPort: wsPort,
            identifyPayload,
            externalAdmissionEnabled: stryMutAct_9fa48("24528") ? true : (stryCov_9fa48("24528"), false)
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("24529")) {
          {}
        } else {
          stryCov_9fa48("24529");
          logger.error(JOINING_LOG_MSG.ROUTER_INIT_FAILED, stryMutAct_9fa48("24530") ? {} : (stryCov_9fa48("24530"), {
            nodeId: this.nodeId,
            wsPort: wsPort,
            error: error.message,
            stack: error.stack
          }));
          const routerInitFailed = JOINING_ERROR_MSG.routerInitFailed;
          throw new Error(routerInitFailed(error.message));
        }
      }
      this.delegates.setMessageRouter(messageRouter);

      // Use MessageRouter directly for all services
      // MessageRouter handles both local and remote message delivery
      if (stryMutAct_9fa48("24533") ? typeof messageRouter.setQueryMessageGroupServiceResolver !== TYPEOF.FUNCTION : stryMutAct_9fa48("24532") ? false : stryMutAct_9fa48("24531") ? true : (stryCov_9fa48("24531", "24532", "24533"), typeof messageRouter.setQueryMessageGroupServiceResolver === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("24534")) {
          {}
        } else {
          stryCov_9fa48("24534");
          messageRouter.setQueryMessageGroupServiceResolver(stryMutAct_9fa48("24535") ? () => undefined : (stryCov_9fa48("24535"), () => resolveQueryTransportSelection(stryMutAct_9fa48("24536") ? () => undefined : (stryCov_9fa48("24536"), () => (stryMutAct_9fa48("24539") ? typeof this.delegates.resolveQueryTransportMessageGroupSelection !== TYPEOF.FUNCTION : stryMutAct_9fa48("24538") ? false : stryMutAct_9fa48("24537") ? true : (stryCov_9fa48("24537", "24538", "24539"), typeof this.delegates.resolveQueryTransportMessageGroupSelection === TYPEOF.FUNCTION)) ? this.delegates.resolveQueryTransportMessageGroupSelection() : this.delegates.getLeaderMessageGroupService()))));
        }
      }
      this.delegates.setTransport(messageRouter);
      await this.delegates.initializeJoiningLifecycleOwners();
      await this.delegates.triggerJoinReconciler(JOINING_UNIFIED_RECONCILE.INFRA_READY_REASON);
      if (stryMutAct_9fa48("24542") ? typeof this.delegates.ensureBootstrapSnapshotHydrated !== TYPEOF.FUNCTION : stryMutAct_9fa48("24541") ? false : stryMutAct_9fa48("24540") ? true : (stryCov_9fa48("24540", "24541", "24542"), typeof this.delegates.ensureBootstrapSnapshotHydrated === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("24543")) {
          {}
        } else {
          stryCov_9fa48("24543");
          await this.delegates.ensureBootstrapSnapshotHydrated();
        }
      }

      // Get seed node WebSocket address from bootstrap response or options
      const seedWsAddress = assertCritical(this.delegates.getSeedNodeWsAddress(), JOINING_ERROR_MSG.SEED_WS_ADDRESS_REQUIRED);
      const seedNodeId = assertCritical(this.delegates.getSeedNodeId(), JOINING_ERROR_MSG.SEED_NODE_ID_REQUIRED);
      logger.info(JOINING_LOG_MSG.SEED_WS_CONNECTING, stryMutAct_9fa48("24544") ? {} : (stryCov_9fa48("24544"), {
        nodeId: this.nodeId,
        seedWsAddress,
        seedNodeId
      }));
      let seedConnectionError = null;
      try {
        if (stryMutAct_9fa48("24545")) {
          {}
        } else {
          stryCov_9fa48("24545");
          await this.connectToSeedNode(messageRouter, seedNodeId, seedWsAddress);
          logger.info(JOINING_LOG_MSG.SEED_WS_CONNECTED, stryMutAct_9fa48("24546") ? {} : (stryCov_9fa48("24546"), {
            nodeId: this.nodeId,
            seedNodeId,
            seedWsAddress,
            connectedNodes: stryMutAct_9fa48("24549") ? messageRouter.getConnectedNodes?.() && Array.from(messageRouter.nodeConnections?.keys() || []) : stryMutAct_9fa48("24548") ? false : stryMutAct_9fa48("24547") ? true : (stryCov_9fa48("24547", "24548", "24549"), (stryMutAct_9fa48("24550") ? messageRouter.getConnectedNodes() : (stryCov_9fa48("24550"), messageRouter.getConnectedNodes?.())) || Array.from(stryMutAct_9fa48("24553") ? messageRouter.nodeConnections?.keys() && [] : stryMutAct_9fa48("24552") ? false : stryMutAct_9fa48("24551") ? true : (stryCov_9fa48("24551", "24552", "24553"), (stryMutAct_9fa48("24554") ? messageRouter.nodeConnections.keys() : (stryCov_9fa48("24554"), messageRouter.nodeConnections?.keys())) || (stryMutAct_9fa48("24555") ? ["Stryker was here"] : (stryCov_9fa48("24555"), [])))))
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("24556")) {
          {}
        } else {
          stryCov_9fa48("24556");
          seedConnectionError = error;
        }
      }

      // Connect to all cluster nodes for full mesh connectivity
      // This ensures Raft messages can flow between all nodes
      await this.connectToClusterNodes();
      const connectedPeerNodeIds = getConnectedPeerNodeIds(messageRouter, this.nodeId);
      if (stryMutAct_9fa48("24559") ? seedConnectionError || connectedPeerNodeIds.length === NUM.ZERO : stryMutAct_9fa48("24558") ? false : stryMutAct_9fa48("24557") ? true : (stryCov_9fa48("24557", "24558", "24559"), seedConnectionError && (stryMutAct_9fa48("24561") ? connectedPeerNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("24560") ? true : (stryCov_9fa48("24560", "24561"), connectedPeerNodeIds.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("24562")) {
          {}
        } else {
          stryCov_9fa48("24562");
          logger.error(JOINING_LOG_MSG.SEED_WS_CONNECT_FAILED, stryMutAct_9fa48("24563") ? {} : (stryCov_9fa48("24563"), {
            nodeId: this.nodeId,
            seedWsAddress,
            seedNodeId,
            error: seedConnectionError.message,
            stack: seedConnectionError.stack
          }));
          throw seedConnectionError;
        }
      }
      if (stryMutAct_9fa48("24565") ? false : stryMutAct_9fa48("24564") ? true : (stryCov_9fa48("24564", "24565"), seedConnectionError)) {
        if (stryMutAct_9fa48("24566")) {
          {}
        } else {
          stryCov_9fa48("24566");
          logger.warn(LOG_SEED_WS_FALLBACK, stryMutAct_9fa48("24567") ? {} : (stryCov_9fa48("24567"), {
            nodeId: this.nodeId,
            seedNodeId,
            seedWsAddress,
            connectedPeerNodeIds,
            error: seedConnectionError.message
          }));
        }
      }
      try {
        if (stryMutAct_9fa48("24568")) {
          {}
        } else {
          stryCov_9fa48("24568");
          await this.delegates.sendControlPlaneNodeStateUpdate(stryMutAct_9fa48("24569") ? {} : (stryCov_9fa48("24569"), {
            state: STATE.CONNECTED,
            capabilities: this.delegates.getNodeCapabilities()
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("24570")) {
          {}
        } else {
          stryCov_9fa48("24570");
          const cause = stryMutAct_9fa48("24573") ? error?.cause && error : stryMutAct_9fa48("24572") ? false : stryMutAct_9fa48("24571") ? true : (stryCov_9fa48("24571", "24572", "24573"), (stryMutAct_9fa48("24574") ? error.cause : (stryCov_9fa48("24574"), error?.cause)) || error);
          const shouldDeferConnectedPublication = stryMutAct_9fa48("24577") ? typeof this.delegates.shouldRetryControlPlaneNodeStateUpdate === TYPEOF.FUNCTION || this.delegates.shouldRetryControlPlaneNodeStateUpdate(cause) : stryMutAct_9fa48("24576") ? false : stryMutAct_9fa48("24575") ? true : (stryCov_9fa48("24575", "24576", "24577"), (stryMutAct_9fa48("24579") ? typeof this.delegates.shouldRetryControlPlaneNodeStateUpdate !== TYPEOF.FUNCTION : stryMutAct_9fa48("24578") ? true : (stryCov_9fa48("24578", "24579"), typeof this.delegates.shouldRetryControlPlaneNodeStateUpdate === TYPEOF.FUNCTION)) && this.delegates.shouldRetryControlPlaneNodeStateUpdate(cause));
          if (stryMutAct_9fa48("24582") ? false : stryMutAct_9fa48("24581") ? true : stryMutAct_9fa48("24580") ? shouldDeferConnectedPublication : (stryCov_9fa48("24580", "24581", "24582"), !shouldDeferConnectedPublication)) {
            if (stryMutAct_9fa48("24583")) {
              {}
            } else {
              stryCov_9fa48("24583");
              throw error;
            }
          }
          logger.warn(JOINING_LOG_MSG.CONNECTED_STATE_UPDATE_DEFERRED, stryMutAct_9fa48("24584") ? {} : (stryCov_9fa48("24584"), {
            nodeId: this.nodeId,
            seedNodeId,
            error: error.message
          }));
        }
      }
      logger.debug(JOINING_LOG_MSG.WS_INFRA_READY, stryMutAct_9fa48("24585") ? {} : (stryCov_9fa48("24585"), {
        nodeId: this.nodeId,
        nodeAddress,
        wsPort: wsPort,
        hasMessageRouter: stryMutAct_9fa48("24586") ? !messageRouter : (stryCov_9fa48("24586"), !(stryMutAct_9fa48("24587") ? messageRouter : (stryCov_9fa48("24587"), !messageRouter))),
        hasSelfConnection: wsPort ? messageRouter.hasSelfConnection() : stryMutAct_9fa48("24588") ? true : (stryCov_9fa48("24588"), false),
        owner: OWNER_MESSAGE_ROUTER_SETUP
      }));
    }
  }

  /**
   * Connect to the seed node with bounded retry semantics.
   * Rolling restarts can temporarily make the seed WebSocket unavailable even
   * after bootstrap HTTP is reachable, so a single timeout should not abort
   * the full join while the existing join retry window still has budget left.
   * @param {Object} messageRouter
   * @param {string} seedNodeId
   * @param {string} seedWsAddress
   * @return {Promise<void>}
   * @private
   */
  async connectToSeedNode(messageRouter, seedNodeId, seedWsAddress) {
    if (stryMutAct_9fa48("24589")) {
      {}
    } else {
      stryCov_9fa48("24589");
      const logger = this.delegates.getLogger();
      const now = (stryMutAct_9fa48("24592") ? typeof this.delegates.getNow !== TYPEOF.FUNCTION : stryMutAct_9fa48("24591") ? false : stryMutAct_9fa48("24590") ? true : (stryCov_9fa48("24590", "24591", "24592"), typeof this.delegates.getNow === TYPEOF.FUNCTION)) ? this.delegates.getNow() : stryMutAct_9fa48("24593") ? () => undefined : (stryCov_9fa48("24593"), () => Date.now());
      const sleep = (stryMutAct_9fa48("24596") ? typeof this.delegates.getSleep !== TYPEOF.FUNCTION : stryMutAct_9fa48("24595") ? false : stryMutAct_9fa48("24594") ? true : (stryCov_9fa48("24594", "24595", "24596"), typeof this.delegates.getSleep === TYPEOF.FUNCTION)) ? this.delegates.getSleep() : stryMutAct_9fa48("24597") ? () => undefined : (stryCov_9fa48("24597"), delayMs => new Promise(stryMutAct_9fa48("24598") ? () => undefined : (stryCov_9fa48("24598"), resolve => setTimeout(resolve, delayMs))));
      const computeRetryDelayMs = (stryMutAct_9fa48("24601") ? typeof this.delegates.computeSeedContactRetryDelayMs !== TYPEOF.FUNCTION : stryMutAct_9fa48("24600") ? false : stryMutAct_9fa48("24599") ? true : (stryCov_9fa48("24599", "24600", "24601"), typeof this.delegates.computeSeedContactRetryDelayMs === TYPEOF.FUNCTION)) ? this.delegates.computeSeedContactRetryDelayMs : null;
      if (stryMutAct_9fa48("24604") ? typeof sleep === TYPEOF.FUNCTION : stryMutAct_9fa48("24603") ? false : stryMutAct_9fa48("24602") ? true : (stryCov_9fa48("24602", "24603", "24604"), typeof sleep !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("24605")) {
          {}
        } else {
          stryCov_9fa48("24605");
          await messageRouter.connectToNode(seedNodeId, seedWsAddress);
          return;
        }
      }
      const retryPolicy = this.resolveSeedWebSocketRetryPolicy();
      const retryTimeoutMs = Number.isFinite(stryMutAct_9fa48("24606") ? retryPolicy.retryTimeoutMs : (stryCov_9fa48("24606"), retryPolicy?.retryTimeoutMs)) ? stryMutAct_9fa48("24607") ? Math.min(NUM.ONE, Math.floor(retryPolicy.retryTimeoutMs)) : (stryCov_9fa48("24607"), Math.max(NUM.ONE, Math.floor(retryPolicy.retryTimeoutMs))) : NUM.ZERO;
      const initialDelayMs = Number.isFinite(stryMutAct_9fa48("24608") ? retryPolicy.initialDelayMs : (stryCov_9fa48("24608"), retryPolicy?.initialDelayMs)) ? stryMutAct_9fa48("24609") ? Math.min(NUM.ONE, Math.floor(retryPolicy.initialDelayMs)) : (stryCov_9fa48("24609"), Math.max(NUM.ONE, Math.floor(retryPolicy.initialDelayMs))) : NUM.HUNDRED;
      const maxDelayMs = Number.isFinite(stryMutAct_9fa48("24610") ? retryPolicy.maxDelayMs : (stryCov_9fa48("24610"), retryPolicy?.maxDelayMs)) ? stryMutAct_9fa48("24611") ? Math.min(initialDelayMs, Math.floor(retryPolicy.maxDelayMs)) : (stryCov_9fa48("24611"), Math.max(initialDelayMs, Math.floor(retryPolicy.maxDelayMs))) : initialDelayMs;
      const backoffMultiplier = (stryMutAct_9fa48("24614") ? Number.isFinite(retryPolicy?.backoffMultiplier) || retryPolicy.backoffMultiplier > NUM.ONE : stryMutAct_9fa48("24613") ? false : stryMutAct_9fa48("24612") ? true : (stryCov_9fa48("24612", "24613", "24614"), Number.isFinite(stryMutAct_9fa48("24615") ? retryPolicy.backoffMultiplier : (stryCov_9fa48("24615"), retryPolicy?.backoffMultiplier)) && (stryMutAct_9fa48("24618") ? retryPolicy.backoffMultiplier <= NUM.ONE : stryMutAct_9fa48("24617") ? retryPolicy.backoffMultiplier >= NUM.ONE : stryMutAct_9fa48("24616") ? true : (stryCov_9fa48("24616", "24617", "24618"), retryPolicy.backoffMultiplier > NUM.ONE)))) ? retryPolicy.backoffMultiplier : NUM.TWO;
      if (stryMutAct_9fa48("24622") ? retryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("24621") ? retryTimeoutMs < NUM.ZERO : stryMutAct_9fa48("24620") ? false : stryMutAct_9fa48("24619") ? true : (stryCov_9fa48("24619", "24620", "24621", "24622"), retryTimeoutMs <= NUM.ZERO)) {
        if (stryMutAct_9fa48("24623")) {
          {}
        } else {
          stryCov_9fa48("24623");
          await messageRouter.connectToNode(seedNodeId, seedWsAddress);
          return;
        }
      }
      const startMs = now();
      const deadlineMs = stryMutAct_9fa48("24624") ? startMs - retryTimeoutMs : (stryCov_9fa48("24624"), startMs + retryTimeoutMs);
      let baseDelayMs = initialDelayMs;
      let attempt = NUM.ZERO;
      let lastError = null;
      while (stryMutAct_9fa48("24626") ? false : stryMutAct_9fa48("24625") ? false : (stryCov_9fa48("24625", "24626"), true)) {
        if (stryMutAct_9fa48("24627")) {
          {}
        } else {
          stryCov_9fa48("24627");
          stryMutAct_9fa48("24628") ? attempt -= NUM.ONE : (stryCov_9fa48("24628"), attempt += NUM.ONE);
          try {
            if (stryMutAct_9fa48("24629")) {
              {}
            } else {
              stryCov_9fa48("24629");
              await messageRouter.connectToNode(seedNodeId, seedWsAddress);
              return;
            }
          } catch (error) {
            if (stryMutAct_9fa48("24630")) {
              {}
            } else {
              stryCov_9fa48("24630");
              lastError = error;
              const elapsedMs = stryMutAct_9fa48("24631") ? Math.min(NUM.ZERO, now() - startMs) : (stryCov_9fa48("24631"), Math.max(NUM.ZERO, stryMutAct_9fa48("24632") ? now() + startMs : (stryCov_9fa48("24632"), now() - startMs)));
              const remainingMs = stryMutAct_9fa48("24633") ? deadlineMs + now() : (stryCov_9fa48("24633"), deadlineMs - now());
              if (stryMutAct_9fa48("24636") ? getConnectedPeerNodeIds(messageRouter, this.nodeId).length !== NUM.ZERO : stryMutAct_9fa48("24635") ? false : stryMutAct_9fa48("24634") ? true : (stryCov_9fa48("24634", "24635", "24636"), getConnectedPeerNodeIds(messageRouter, this.nodeId).length === NUM.ZERO)) {
                if (stryMutAct_9fa48("24637")) {
                  {}
                } else {
                  stryCov_9fa48("24637");
                  await this.connectToClusterNodes();
                }
              }
              if (stryMutAct_9fa48("24641") ? getConnectedPeerNodeIds(messageRouter, this.nodeId).length <= NUM.ZERO : stryMutAct_9fa48("24640") ? getConnectedPeerNodeIds(messageRouter, this.nodeId).length >= NUM.ZERO : stryMutAct_9fa48("24639") ? false : stryMutAct_9fa48("24638") ? true : (stryCov_9fa48("24638", "24639", "24640", "24641"), getConnectedPeerNodeIds(messageRouter, this.nodeId).length > NUM.ZERO)) {
                if (stryMutAct_9fa48("24642")) {
                  {}
                } else {
                  stryCov_9fa48("24642");
                  break;
                }
              }
              if (stryMutAct_9fa48("24646") ? remainingMs > NUM.ZERO : stryMutAct_9fa48("24645") ? remainingMs < NUM.ZERO : stryMutAct_9fa48("24644") ? false : stryMutAct_9fa48("24643") ? true : (stryCov_9fa48("24643", "24644", "24645", "24646"), remainingMs <= NUM.ZERO)) {
                if (stryMutAct_9fa48("24647")) {
                  {}
                } else {
                  stryCov_9fa48("24647");
                  break;
                }
              }
              const nextDelayMs = computeRetryDelayMs ? computeRetryDelayMs(stryMutAct_9fa48("24648") ? {} : (stryCov_9fa48("24648"), {
                baseDelayMs,
                maxDelayMs,
                retryAfterMs: null
              })) : stryMutAct_9fa48("24649") ? Math.max(baseDelayMs, maxDelayMs) : (stryCov_9fa48("24649"), Math.min(baseDelayMs, maxDelayMs));
              const boundedDelayMs = stryMutAct_9fa48("24650") ? Math.min(NUM.ONE, Math.min(remainingMs, nextDelayMs)) : (stryCov_9fa48("24650"), Math.max(NUM.ONE, stryMutAct_9fa48("24651") ? Math.max(remainingMs, nextDelayMs) : (stryCov_9fa48("24651"), Math.min(remainingMs, nextDelayMs))));
              logger.warn(JOINING_LOG_MSG.SEED_WS_RETRYING, stryMutAct_9fa48("24652") ? {} : (stryCov_9fa48("24652"), {
                nodeId: this.nodeId,
                seedNodeId,
                seedWsAddress,
                attempt,
                elapsedMs,
                nextDelayMs: boundedDelayMs,
                error: error.message
              }));
              await sleep(boundedDelayMs);
              baseDelayMs = stryMutAct_9fa48("24653") ? Math.max(Math.max(NUM.ONE, Math.floor(baseDelayMs * backoffMultiplier)), maxDelayMs) : (stryCov_9fa48("24653"), Math.min(stryMutAct_9fa48("24654") ? Math.min(NUM.ONE, Math.floor(baseDelayMs * backoffMultiplier)) : (stryCov_9fa48("24654"), Math.max(NUM.ONE, Math.floor(stryMutAct_9fa48("24655") ? baseDelayMs / backoffMultiplier : (stryCov_9fa48("24655"), baseDelayMs * backoffMultiplier)))), maxDelayMs));
            }
          }
        }
      }
      throw lastError;
    }
  }

  /**
   * Resolve bounded retry policy for seed websocket connectivity.
   * Keep this independent from HTTP seed-contact timeout so mocked
   * or fast-fail join paths do not inherit the full HTTP retry budget.
   * @return {Object}
   * @private
   */
  resolveSeedWebSocketRetryPolicy() {
    if (stryMutAct_9fa48("24656")) {
      {}
    } else {
      stryCov_9fa48("24656");
      const config = (stryMutAct_9fa48("24659") ? typeof this.delegates.getConfig !== TYPEOF.FUNCTION : stryMutAct_9fa48("24658") ? false : stryMutAct_9fa48("24657") ? true : (stryCov_9fa48("24657", "24658", "24659"), typeof this.delegates.getConfig === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("24662") ? this.delegates.getConfig() && {} : stryMutAct_9fa48("24661") ? false : stryMutAct_9fa48("24660") ? true : (stryCov_9fa48("24660", "24661", "24662"), this.delegates.getConfig() || {}) : {};
      const retryTimeoutMs = Number.isFinite(config.leadershipWaitTimeoutMs) ? stryMutAct_9fa48("24663") ? Math.min(NUM.ONE, Math.floor(config.leadershipWaitTimeoutMs)) : (stryCov_9fa48("24663"), Math.max(NUM.ONE, Math.floor(config.leadershipWaitTimeoutMs))) : NUM.ZERO;
      const initialDelayMs = Number.isFinite(config.leadershipWaitInitialDelayMs) ? stryMutAct_9fa48("24664") ? Math.min(NUM.TEN, Math.floor(config.leadershipWaitInitialDelayMs)) : (stryCov_9fa48("24664"), Math.max(NUM.TEN, Math.floor(config.leadershipWaitInitialDelayMs))) : NUM.HUNDRED;
      const maxDelayMs = Number.isFinite(config.leadershipWaitMaxDelayMs) ? stryMutAct_9fa48("24665") ? Math.min(initialDelayMs, Math.floor(config.leadershipWaitMaxDelayMs)) : (stryCov_9fa48("24665"), Math.max(initialDelayMs, Math.floor(config.leadershipWaitMaxDelayMs))) : initialDelayMs;
      const backoffMultiplier = (stryMutAct_9fa48("24668") ? Number.isFinite(config.leadershipWaitBackoffMultiplier) || config.leadershipWaitBackoffMultiplier > NUM.ONE : stryMutAct_9fa48("24667") ? false : stryMutAct_9fa48("24666") ? true : (stryCov_9fa48("24666", "24667", "24668"), Number.isFinite(config.leadershipWaitBackoffMultiplier) && (stryMutAct_9fa48("24671") ? config.leadershipWaitBackoffMultiplier <= NUM.ONE : stryMutAct_9fa48("24670") ? config.leadershipWaitBackoffMultiplier >= NUM.ONE : stryMutAct_9fa48("24669") ? true : (stryCov_9fa48("24669", "24670", "24671"), config.leadershipWaitBackoffMultiplier > NUM.ONE)))) ? config.leadershipWaitBackoffMultiplier : NUM.TWO;
      return stryMutAct_9fa48("24672") ? {} : (stryCov_9fa48("24672"), {
        retryTimeoutMs,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier
      });
    }
  }

  /**
   * Attempt peer mesh connectivity for one resolved node snapshot.
   * @param {Object} options
   * @param {Array<Object>} options.otherNodes
   * @param {Object|null} options.bootstrapResponse
   * @param {Object|null} options.systemTableCache
   * @param {Object} options.messageRouter
   * @param {Object} options.logger
   * @return {Promise<{missingEndpointNodeIds: string[]}>}
   * @private
   */
  async connectToClusterNodesFromSnapshot(options = {}) {
    if (stryMutAct_9fa48("24673")) {
      {}
    } else {
      stryCov_9fa48("24673");
      const otherNodes = Array.isArray(options.otherNodes) ? options.otherNodes : stryMutAct_9fa48("24674") ? ["Stryker was here"] : (stryCov_9fa48("24674"), []);
      const messageRouter = options.messageRouter;
      const bootstrapResponse = stryMutAct_9fa48("24677") ? options.bootstrapResponse && null : stryMutAct_9fa48("24676") ? false : stryMutAct_9fa48("24675") ? true : (stryCov_9fa48("24675", "24676", "24677"), options.bootstrapResponse || null);
      const systemTableCache = stryMutAct_9fa48("24680") ? options.systemTableCache && null : stryMutAct_9fa48("24679") ? false : stryMutAct_9fa48("24678") ? true : (stryCov_9fa48("24678", "24679", "24680"), options.systemTableCache || null);
      const logger = options.logger;
      const missingEndpointNodeIds = stryMutAct_9fa48("24681") ? ["Stryker was here"] : (stryCov_9fa48("24681"), []);
      const connectionResults = await Promise.all(otherNodes.map(async node => {
        if (stryMutAct_9fa48("24682")) {
          {}
        } else {
          stryCov_9fa48("24682");
          const targetNodeId = node.node_id;
          const nodeAddress = node.node_address;
          const connectionState = (stryMutAct_9fa48("24685") ? typeof messageRouter.getConnectionState !== TYPEOF.FUNCTION : stryMutAct_9fa48("24684") ? false : stryMutAct_9fa48("24683") ? true : (stryCov_9fa48("24683", "24684", "24685"), typeof messageRouter.getConnectionState === TYPEOF.FUNCTION)) ? messageRouter.getConnectionState(targetNodeId) : stryMutAct_9fa48("24688") ? messageRouter.nodeConnections?.get(targetNodeId)?.state && null : stryMutAct_9fa48("24687") ? false : stryMutAct_9fa48("24686") ? true : (stryCov_9fa48("24686", "24687", "24688"), (stryMutAct_9fa48("24690") ? messageRouter.nodeConnections.get(targetNodeId)?.state : stryMutAct_9fa48("24689") ? messageRouter.nodeConnections?.get(targetNodeId).state : (stryCov_9fa48("24689", "24690"), messageRouter.nodeConnections?.get(targetNodeId)?.state)) || null);
          if (stryMutAct_9fa48("24692") ? false : stryMutAct_9fa48("24691") ? true : (stryCov_9fa48("24691", "24692"), MESH_CONNECTED_OR_IN_FLIGHT_STATES.has(connectionState))) {
            if (stryMutAct_9fa48("24693")) {
              {}
            } else {
              stryCov_9fa48("24693");
              return null;
            }
          }
          const wsAddressResolution = resolveNodeWebSocketAddress(stryMutAct_9fa48("24694") ? {} : (stryCov_9fa48("24694"), {
            targetNodeId,
            bootstrapResponse,
            systemTableCache
          }));
          if (stryMutAct_9fa48("24697") ? wsAddressResolution.state === NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED : stryMutAct_9fa48("24696") ? false : stryMutAct_9fa48("24695") ? true : (stryCov_9fa48("24695", "24696", "24697"), wsAddressResolution.state !== NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE.RESOLVED)) {
            if (stryMutAct_9fa48("24698")) {
              {}
            } else {
              stryCov_9fa48("24698");
              logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, stryMutAct_9fa48("24699") ? {} : (stryCov_9fa48("24699"), {
                nodeId: this.nodeId,
                targetNodeId,
                nodeAddress,
                error: ERR_MISSING_WS_ENDPOINT
              }));
              return stryMutAct_9fa48("24700") ? {} : (stryCov_9fa48("24700"), {
                targetNodeId,
                missingEndpoint: stryMutAct_9fa48("24701") ? false : (stryCov_9fa48("24701"), true)
              });
            }
          }
          const wsAddress = wsAddressResolution.address;
          try {
            if (stryMutAct_9fa48("24702")) {
              {}
            } else {
              stryCov_9fa48("24702");
              await messageRouter.connectToNode(targetNodeId, wsAddress);
              logger.info(JOINING_LOG_MSG.CLUSTER_NODE_CONNECTED, stryMutAct_9fa48("24703") ? {} : (stryCov_9fa48("24703"), {
                nodeId: this.nodeId,
                targetNodeId,
                wsAddress
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("24704")) {
              {}
            } else {
              stryCov_9fa48("24704");
              logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, stryMutAct_9fa48("24705") ? {} : (stryCov_9fa48("24705"), {
                nodeId: this.nodeId,
                targetNodeId,
                wsAddress,
                error: error.message
              }));
            }
          }
          return null;
        }
      }));
      for (const result of connectionResults) {
        if (stryMutAct_9fa48("24706")) {
          {}
        } else {
          stryCov_9fa48("24706");
          if (stryMutAct_9fa48("24709") ? result?.missingEndpoint === true && typeof result.targetNodeId === TYPEOF.STRING || result.targetNodeId.length > NUM.ZERO : stryMutAct_9fa48("24708") ? false : stryMutAct_9fa48("24707") ? true : (stryCov_9fa48("24707", "24708", "24709"), (stryMutAct_9fa48("24711") ? result?.missingEndpoint === true || typeof result.targetNodeId === TYPEOF.STRING : stryMutAct_9fa48("24710") ? true : (stryCov_9fa48("24710", "24711"), (stryMutAct_9fa48("24713") ? result?.missingEndpoint !== true : stryMutAct_9fa48("24712") ? true : (stryCov_9fa48("24712", "24713"), (stryMutAct_9fa48("24714") ? result.missingEndpoint : (stryCov_9fa48("24714"), result?.missingEndpoint)) === (stryMutAct_9fa48("24715") ? false : (stryCov_9fa48("24715"), true)))) && (stryMutAct_9fa48("24717") ? typeof result.targetNodeId !== TYPEOF.STRING : stryMutAct_9fa48("24716") ? true : (stryCov_9fa48("24716", "24717"), typeof result.targetNodeId === TYPEOF.STRING)))) && (stryMutAct_9fa48("24720") ? result.targetNodeId.length <= NUM.ZERO : stryMutAct_9fa48("24719") ? result.targetNodeId.length >= NUM.ZERO : stryMutAct_9fa48("24718") ? true : (stryCov_9fa48("24718", "24719", "24720"), result.targetNodeId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("24721")) {
              {}
            } else {
              stryCov_9fa48("24721");
              missingEndpointNodeIds.push(result.targetNodeId);
            }
          }
        }
      }
      return stryMutAct_9fa48("24722") ? {} : (stryCov_9fa48("24722"), {
        missingEndpointNodeIds
      });
    }
  }

  /**
   * Refresh mesh-connectivity authority when endpoint rows are missing.
   * @param {string[]} missingEndpointNodeIds
   * @return {Promise<boolean>}
   * @private
   */
  async repairMeshConnectivityAuthority(missingEndpointNodeIds) {
    if (stryMutAct_9fa48("24723")) {
      {}
    } else {
      stryCov_9fa48("24723");
      if (stryMutAct_9fa48("24726") ? typeof this.delegates.repairMeshConnectivityAuthorityIfNeeded === TYPEOF.FUNCTION : stryMutAct_9fa48("24725") ? false : stryMutAct_9fa48("24724") ? true : (stryCov_9fa48("24724", "24725", "24726"), typeof this.delegates.repairMeshConnectivityAuthorityIfNeeded !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("24727")) {
          {}
        } else {
          stryCov_9fa48("24727");
          return stryMutAct_9fa48("24728") ? true : (stryCov_9fa48("24728"), false);
        }
      }
      return this.delegates.repairMeshConnectivityAuthorityIfNeeded(missingEndpointNodeIds);
    }
  }

  /**
   * Connect to all cluster nodes for full mesh connectivity.
   * Skips nodes we're already connected to (checked via messageRouter).
   * All nodes are equal peers - no special treatment for any node.
   * @return {Promise<void>}
   */
  async connectToClusterNodes() {
    if (stryMutAct_9fa48("24729")) {
      {}
    } else {
      stryCov_9fa48("24729");
      const logger = this.delegates.getLogger();
      const messageRouter = this.delegates.getMessageRouter();
      const bootstrapResponse = stryMutAct_9fa48("24732") ? this.delegates.getBootstrapResponse?.() && null : stryMutAct_9fa48("24731") ? false : stryMutAct_9fa48("24730") ? true : (stryCov_9fa48("24730", "24731", "24732"), (stryMutAct_9fa48("24733") ? this.delegates.getBootstrapResponse() : (stryCov_9fa48("24733"), this.delegates.getBootstrapResponse?.())) || null);
      const systemTableCache = stryMutAct_9fa48("24736") ? this.delegates.getSystemTableCache?.() && null : stryMutAct_9fa48("24735") ? false : stryMutAct_9fa48("24734") ? true : (stryCov_9fa48("24734", "24735", "24736"), (stryMutAct_9fa48("24737") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("24737"), this.delegates.getSystemTableCache?.())) || null);
      let attemptedAuthorityRepair = stryMutAct_9fa48("24738") ? true : (stryCov_9fa48("24738"), false);
      while (stryMutAct_9fa48("24740") ? false : stryMutAct_9fa48("24739") ? false : (stryCov_9fa48("24739", "24740"), true)) {
        if (stryMutAct_9fa48("24741")) {
          {}
        } else {
          stryCov_9fa48("24741");
          const {
            source: nodeSource,
            rows: nodesSnapshot
          } = this.delegates.resolveMeshConnectivityNodeRows();
          const addressBootstrapResponse = (stryMutAct_9fa48("24744") ? nodeSource !== 'bootstrap_snapshot' : stryMutAct_9fa48("24743") ? false : stryMutAct_9fa48("24742") ? true : (stryCov_9fa48("24742", "24743", "24744"), nodeSource === (stryMutAct_9fa48("24745") ? "" : (stryCov_9fa48("24745"), 'bootstrap_snapshot')))) ? bootstrapResponse : null;
          if (stryMutAct_9fa48("24748") ? !Array.isArray(nodesSnapshot) && nodesSnapshot.length === NUM.ZERO : stryMutAct_9fa48("24747") ? false : stryMutAct_9fa48("24746") ? true : (stryCov_9fa48("24746", "24747", "24748"), (stryMutAct_9fa48("24749") ? Array.isArray(nodesSnapshot) : (stryCov_9fa48("24749"), !Array.isArray(nodesSnapshot))) || (stryMutAct_9fa48("24751") ? nodesSnapshot.length !== NUM.ZERO : stryMutAct_9fa48("24750") ? false : (stryCov_9fa48("24750", "24751"), nodesSnapshot.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("24752")) {
              {}
            } else {
              stryCov_9fa48("24752");
              return;
            }
          }
          this.delegates.setLastClusterMeshSignature(this.delegates.buildClusterMeshSignature(nodesSnapshot));
          const otherNodes = stryMutAct_9fa48("24753") ? nodesSnapshot : (stryCov_9fa48("24753"), nodesSnapshot.filter(node => {
            if (stryMutAct_9fa48("24754")) {
              {}
            } else {
              stryCov_9fa48("24754");
              const nodeId = stryMutAct_9fa48("24755") ? node.node_id : (stryCov_9fa48("24755"), node?.node_id);
              return stryMutAct_9fa48("24758") ? nodeId || nodeId !== this.nodeId : stryMutAct_9fa48("24757") ? false : stryMutAct_9fa48("24756") ? true : (stryCov_9fa48("24756", "24757", "24758"), nodeId && (stryMutAct_9fa48("24760") ? nodeId === this.nodeId : stryMutAct_9fa48("24759") ? true : (stryCov_9fa48("24759", "24760"), nodeId !== this.nodeId)));
            }
          }));
          if (stryMutAct_9fa48("24763") ? otherNodes.length !== NUM.ZERO : stryMutAct_9fa48("24762") ? false : stryMutAct_9fa48("24761") ? true : (stryCov_9fa48("24761", "24762", "24763"), otherNodes.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("24764")) {
              {}
            } else {
              stryCov_9fa48("24764");
              return;
            }
          }
          logger.info(JOINING_LOG_MSG.CONNECTING_TO_CLUSTER_NODES, stryMutAct_9fa48("24765") ? {} : (stryCov_9fa48("24765"), {
            nodeId: this.nodeId,
            nodeSource,
            otherNodeCount: otherNodes.length,
            otherNodeIds: otherNodes.map(stryMutAct_9fa48("24766") ? () => undefined : (stryCov_9fa48("24766"), n => n.node_id))
          }));
          const {
            missingEndpointNodeIds
          } = await this.connectToClusterNodesFromSnapshot(stryMutAct_9fa48("24767") ? {} : (stryCov_9fa48("24767"), {
            otherNodes,
            bootstrapResponse: addressBootstrapResponse,
            systemTableCache,
            messageRouter,
            logger
          }));
          if (stryMutAct_9fa48("24770") ? !attemptedAuthorityRepair && missingEndpointNodeIds.length > NUM.ZERO || (await this.repairMeshConnectivityAuthority(missingEndpointNodeIds)) : stryMutAct_9fa48("24769") ? false : stryMutAct_9fa48("24768") ? true : (stryCov_9fa48("24768", "24769", "24770"), (stryMutAct_9fa48("24772") ? !attemptedAuthorityRepair || missingEndpointNodeIds.length > NUM.ZERO : stryMutAct_9fa48("24771") ? true : (stryCov_9fa48("24771", "24772"), (stryMutAct_9fa48("24773") ? attemptedAuthorityRepair : (stryCov_9fa48("24773"), !attemptedAuthorityRepair)) && (stryMutAct_9fa48("24776") ? missingEndpointNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("24775") ? missingEndpointNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("24774") ? true : (stryCov_9fa48("24774", "24775", "24776"), missingEndpointNodeIds.length > NUM.ZERO)))) && (await this.repairMeshConnectivityAuthority(missingEndpointNodeIds)))) {
            if (stryMutAct_9fa48("24777")) {
              {}
            } else {
              stryCov_9fa48("24777");
              attemptedAuthorityRepair = stryMutAct_9fa48("24778") ? false : (stryCov_9fa48("24778"), true);
              continue;
            }
          }
          logger.info(JOINING_LOG_MSG.CLUSTER_CONNECTIONS_COMPLETE, stryMutAct_9fa48("24779") ? {} : (stryCov_9fa48("24779"), {
            nodeId: this.nodeId,
            connectedNodes: stryMutAct_9fa48("24782") ? messageRouter.getConnectedNodes?.() && Array.from(messageRouter.nodeConnections?.keys() || []) : stryMutAct_9fa48("24781") ? false : stryMutAct_9fa48("24780") ? true : (stryCov_9fa48("24780", "24781", "24782"), (stryMutAct_9fa48("24783") ? messageRouter.getConnectedNodes() : (stryCov_9fa48("24783"), messageRouter.getConnectedNodes?.())) || Array.from(stryMutAct_9fa48("24786") ? messageRouter.nodeConnections?.keys() && [] : stryMutAct_9fa48("24785") ? false : stryMutAct_9fa48("24784") ? true : (stryCov_9fa48("24784", "24785", "24786"), (stryMutAct_9fa48("24787") ? messageRouter.nodeConnections.keys() : (stryCov_9fa48("24787"), messageRouter.nodeConnections?.keys())) || (stryMutAct_9fa48("24788") ? ["Stryker was here"] : (stryCov_9fa48("24788"), [])))))
          }));
          return;
        }
      }
    }
  }
}

/**
 * Derive WebSocket address from node REST address.
 * Pure function — no instance state needed.
 * @param {string} nodeAddress - Node address in format "hostname:port".
 * @return {string|null} WebSocket address or null if cannot derive.
 */
function deriveWsAddressFromNodeAddress(nodeAddress) {
  if (stryMutAct_9fa48("24789")) {
    {}
  } else {
    stryCov_9fa48("24789");
    if (stryMutAct_9fa48("24792") ? !nodeAddress && typeof nodeAddress !== TYPEOF.STRING : stryMutAct_9fa48("24791") ? false : stryMutAct_9fa48("24790") ? true : (stryCov_9fa48("24790", "24791", "24792"), (stryMutAct_9fa48("24793") ? nodeAddress : (stryCov_9fa48("24793"), !nodeAddress)) || (stryMutAct_9fa48("24795") ? typeof nodeAddress === TYPEOF.STRING : stryMutAct_9fa48("24794") ? false : (stryCov_9fa48("24794", "24795"), typeof nodeAddress !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("24796")) {
        {}
      } else {
        stryCov_9fa48("24796");
        return null;
      }
    }
    let hostname;
    let restPort;

    // Check if address is already a full WebSocket URL (ws:// or wss://)
    if (stryMutAct_9fa48("24799") ? nodeAddress.startsWith(PROTOCOL.WS) && nodeAddress.startsWith(PROTOCOL.WSS) : stryMutAct_9fa48("24798") ? false : stryMutAct_9fa48("24797") ? true : (stryCov_9fa48("24797", "24798", "24799"), (stryMutAct_9fa48("24800") ? nodeAddress.endsWith(PROTOCOL.WS) : (stryCov_9fa48("24800"), nodeAddress.startsWith(PROTOCOL.WS))) || (stryMutAct_9fa48("24801") ? nodeAddress.endsWith(PROTOCOL.WSS) : (stryCov_9fa48("24801"), nodeAddress.startsWith(PROTOCOL.WSS))))) {
      if (stryMutAct_9fa48("24802")) {
        {}
      } else {
        stryCov_9fa48("24802");
        // Parse URL format: ws://hostname:port or wss://hostname:port
        const isSecure = stryMutAct_9fa48("24803") ? nodeAddress.endsWith(PROTOCOL.WSS) : (stryCov_9fa48("24803"), nodeAddress.startsWith(PROTOCOL.WSS));
        const protocolPrefix = isSecure ? PROTOCOL.WSS : PROTOCOL.WS;
        const withoutProtocol = stryMutAct_9fa48("24804") ? nodeAddress : (stryCov_9fa48("24804"), nodeAddress.substring(protocolPrefix.length));
        const colonIndex = withoutProtocol.lastIndexOf(ADDRESS.PORT_SEPARATOR);
        if (stryMutAct_9fa48("24807") ? colonIndex === NUM.NEGATIVE_ONE && colonIndex === NUM.ZERO : stryMutAct_9fa48("24806") ? false : stryMutAct_9fa48("24805") ? true : (stryCov_9fa48("24805", "24806", "24807"), (stryMutAct_9fa48("24809") ? colonIndex !== NUM.NEGATIVE_ONE : stryMutAct_9fa48("24808") ? false : (stryCov_9fa48("24808", "24809"), colonIndex === NUM.NEGATIVE_ONE)) || (stryMutAct_9fa48("24811") ? colonIndex !== NUM.ZERO : stryMutAct_9fa48("24810") ? false : (stryCov_9fa48("24810", "24811"), colonIndex === NUM.ZERO)))) {
          if (stryMutAct_9fa48("24812")) {
            {}
          } else {
            stryCov_9fa48("24812");
            return null;
          }
        }
        hostname = stryMutAct_9fa48("24813") ? withoutProtocol : (stryCov_9fa48("24813"), withoutProtocol.substring(NUM.ZERO, colonIndex));
        const portStr = stryMutAct_9fa48("24814") ? withoutProtocol : (stryCov_9fa48("24814"), withoutProtocol.substring(stryMutAct_9fa48("24815") ? colonIndex - NUM.ONE : (stryCov_9fa48("24815"), colonIndex + NUM.ONE)));
        restPort = parseInt(portStr, NUM.TEN);
        if (stryMutAct_9fa48("24818") ? !hostname && hostname.length === NUM.ZERO : stryMutAct_9fa48("24817") ? false : stryMutAct_9fa48("24816") ? true : (stryCov_9fa48("24816", "24817", "24818"), (stryMutAct_9fa48("24819") ? hostname : (stryCov_9fa48("24819"), !hostname)) || (stryMutAct_9fa48("24821") ? hostname.length !== NUM.ZERO : stryMutAct_9fa48("24820") ? false : (stryCov_9fa48("24820", "24821"), hostname.length === NUM.ZERO)))) {
          if (stryMutAct_9fa48("24822")) {
            {}
          } else {
            stryCov_9fa48("24822");
            return null;
          }
        }
        if (stryMutAct_9fa48("24825") ? !Number.isFinite(restPort) && restPort <= NUM.ZERO : stryMutAct_9fa48("24824") ? false : stryMutAct_9fa48("24823") ? true : (stryCov_9fa48("24823", "24824", "24825"), (stryMutAct_9fa48("24826") ? Number.isFinite(restPort) : (stryCov_9fa48("24826"), !Number.isFinite(restPort))) || (stryMutAct_9fa48("24829") ? restPort > NUM.ZERO : stryMutAct_9fa48("24828") ? restPort < NUM.ZERO : stryMutAct_9fa48("24827") ? false : (stryCov_9fa48("24827", "24828", "24829"), restPort <= NUM.ZERO)))) {
          if (stryMutAct_9fa48("24830")) {
            {}
          } else {
            stryCov_9fa48("24830");
            return null;
          }
        }

        // For WebSocket URLs, the port is already the WS port, return as-is
        return nodeAddress;
      }
    }

    // Parse hostname:port format (REST API address)
    const colonIndex = nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
    if (stryMutAct_9fa48("24833") ? colonIndex === NUM.NEGATIVE_ONE && colonIndex === NUM.ZERO : stryMutAct_9fa48("24832") ? false : stryMutAct_9fa48("24831") ? true : (stryCov_9fa48("24831", "24832", "24833"), (stryMutAct_9fa48("24835") ? colonIndex !== NUM.NEGATIVE_ONE : stryMutAct_9fa48("24834") ? false : (stryCov_9fa48("24834", "24835"), colonIndex === NUM.NEGATIVE_ONE)) || (stryMutAct_9fa48("24837") ? colonIndex !== NUM.ZERO : stryMutAct_9fa48("24836") ? false : (stryCov_9fa48("24836", "24837"), colonIndex === NUM.ZERO)))) {
      if (stryMutAct_9fa48("24838")) {
        {}
      } else {
        stryCov_9fa48("24838");
        // No colon found or colon at start (empty hostname)
        return null;
      }
    }
    hostname = stryMutAct_9fa48("24839") ? nodeAddress : (stryCov_9fa48("24839"), nodeAddress.substring(NUM.ZERO, colonIndex));
    if (stryMutAct_9fa48("24842") ? !hostname && hostname.length === NUM.ZERO : stryMutAct_9fa48("24841") ? false : stryMutAct_9fa48("24840") ? true : (stryCov_9fa48("24840", "24841", "24842"), (stryMutAct_9fa48("24843") ? hostname : (stryCov_9fa48("24843"), !hostname)) || (stryMutAct_9fa48("24845") ? hostname.length !== NUM.ZERO : stryMutAct_9fa48("24844") ? false : (stryCov_9fa48("24844", "24845"), hostname.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("24846")) {
        {}
      } else {
        stryCov_9fa48("24846");
        return null;
      }
    }
    const portStr = stryMutAct_9fa48("24847") ? nodeAddress : (stryCov_9fa48("24847"), nodeAddress.substring(stryMutAct_9fa48("24848") ? colonIndex - NUM.ONE : (stryCov_9fa48("24848"), colonIndex + NUM.ONE)));
    restPort = parseInt(portStr, NUM.TEN);
    if (stryMutAct_9fa48("24851") ? !Number.isFinite(restPort) && restPort <= NUM.ZERO : stryMutAct_9fa48("24850") ? false : stryMutAct_9fa48("24849") ? true : (stryCov_9fa48("24849", "24850", "24851"), (stryMutAct_9fa48("24852") ? Number.isFinite(restPort) : (stryCov_9fa48("24852"), !Number.isFinite(restPort))) || (stryMutAct_9fa48("24855") ? restPort > NUM.ZERO : stryMutAct_9fa48("24854") ? restPort < NUM.ZERO : stryMutAct_9fa48("24853") ? false : (stryCov_9fa48("24853", "24854", "24855"), restPort <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("24856")) {
        {}
      } else {
        stryCov_9fa48("24856");
        return null;
      }
    }

    // WebSocket port = REST port + WS_PORT_OFFSET
    const wsPort = stryMutAct_9fa48("24857") ? restPort - ENTRYPOINT_DEFAULT.WS_PORT_OFFSET : (stryCov_9fa48("24857"), restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET);
    return stryMutAct_9fa48("24858") ? `` : (stryCov_9fa48("24858"), `${PROTOCOL.WS}${hostname}${ADDRESS.PORT_SEPARATOR}${wsPort}`);
  }
}
export { ConnectWebSocketPhase, deriveWsAddressFromNodeAddress };