/**
 * LeaseService - Lease-based readiness tracking and lease sweeping.
 * Extracted from ControlPlaneService.
 * Requirements: 8.3, 8.6
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
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { NUM, SERVICE_STATUS, STATE, STRING, TABLES, TYPEOF } from '../constants/index.js';
import { emitInvariant } from '../invariants/invariant-emitter.js';
import { INVARIANT_ID } from '../invariants/invariant-catalog.js';
import { assertCritical } from '../utils/assert.js';
import { createControlPlaneRuntimeBundle } from './control-plane-runtime-bundle.js';
import { readAuthoritativeControlPlaneRows } from './control-plane-system-table-gateway.js';
import { LEASE_CONFIG_KEY, LEASE_DEFAULT_OPTIONS, LEASE_EMPTY_QUERY_PARAMS, LEASE_DEFAULT, LEASE_ERROR_MSG, LEASE_EVENT, LEASE_LOG_MSG, LEASE_NOW, LEASE_SQL, LEASE_STATE, LEASE_SUBSYSTEM } from './lease-service-constants.js';
const createDefaultMessageGroupServices = stryMutAct_9fa48("66761") ? () => undefined : (stryCov_9fa48("66761"), (() => {
  const createDefaultMessageGroupServices = () => new Set();
  return createDefaultMessageGroupServices;
})());
class LeaseService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.nodeLeaseOwner - Canonical owner for node lease
   *   state mutations.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Array<Object>} [options.messageGroupServices] - MG services.
   */
  constructor(options = LEASE_DEFAULT_OPTIONS) {
    if (stryMutAct_9fa48("66762")) {
      {}
    } else {
      stryCov_9fa48("66762");
      super();
      this.nodeId = options.nodeId;
      this.nodeLeaseOwner = stryMutAct_9fa48("66765") ? options.nodeLeaseOwner && null : stryMutAct_9fa48("66764") ? false : stryMutAct_9fa48("66763") ? true : (stryCov_9fa48("66763", "66764", "66765"), options.nodeLeaseOwner || null);
      this.systemTableCache = options.systemTableCache;
      this.sqlQueryEngine = options.sqlQueryEngine;
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("66768") ? options.controlPlaneSystemTableGateway && (options.sqlQueryEngine || options.systemTableCache || options.messageRouter ? createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        sqlQueryEngine: this.sqlQueryEngine || null,
        systemTableCache: this.systemTableCache,
        messageRouter: options.messageRouter || null
      }).controlPlaneSystemTableGateway : null) : stryMutAct_9fa48("66767") ? false : stryMutAct_9fa48("66766") ? true : (stryCov_9fa48("66766", "66767", "66768"), options.controlPlaneSystemTableGateway || ((stryMutAct_9fa48("66771") ? (options.sqlQueryEngine || options.systemTableCache) && options.messageRouter : stryMutAct_9fa48("66770") ? false : stryMutAct_9fa48("66769") ? true : (stryCov_9fa48("66769", "66770", "66771"), (stryMutAct_9fa48("66773") ? options.sqlQueryEngine && options.systemTableCache : stryMutAct_9fa48("66772") ? false : (stryCov_9fa48("66772", "66773"), options.sqlQueryEngine || options.systemTableCache)) || options.messageRouter)) ? createControlPlaneRuntimeBundle(stryMutAct_9fa48("66774") ? {} : (stryCov_9fa48("66774"), {
        nodeId: this.nodeId,
        sqlQueryEngine: stryMutAct_9fa48("66777") ? this.sqlQueryEngine && null : stryMutAct_9fa48("66776") ? false : stryMutAct_9fa48("66775") ? true : (stryCov_9fa48("66775", "66776", "66777"), this.sqlQueryEngine || null),
        systemTableCache: this.systemTableCache,
        messageRouter: stryMutAct_9fa48("66780") ? options.messageRouter && null : stryMutAct_9fa48("66779") ? false : stryMutAct_9fa48("66778") ? true : (stryCov_9fa48("66778", "66779", "66780"), options.messageRouter || null)
      })).controlPlaneSystemTableGateway : null));
      this.messageGroupServices = stryMutAct_9fa48("66781") ? options.messageGroupServices && createDefaultMessageGroupServices() : (stryCov_9fa48("66781"), options.messageGroupServices ?? createDefaultMessageGroupServices());
      this.messageRouter = stryMutAct_9fa48("66784") ? options.messageRouter && null : stryMutAct_9fa48("66783") ? false : stryMutAct_9fa48("66782") ? true : (stryCov_9fa48("66782", "66783", "66784"), options.messageRouter || null);
      this.now = (stryMutAct_9fa48("66787") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("66786") ? false : stryMutAct_9fa48("66785") ? true : (stryCov_9fa48("66785", "66786", "66787"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : LEASE_NOW;
      this.setIntervalFn = (stryMutAct_9fa48("66790") ? typeof options.setIntervalFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("66789") ? false : stryMutAct_9fa48("66788") ? true : (stryCov_9fa48("66788", "66789", "66790"), typeof options.setIntervalFn === TYPEOF.FUNCTION)) ? options.setIntervalFn : setInterval;
      this.clearIntervalFn = (stryMutAct_9fa48("66793") ? typeof options.clearIntervalFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("66792") ? false : stryMutAct_9fa48("66791") ? true : (stryCov_9fa48("66791", "66792", "66793"), typeof options.clearIntervalFn === TYPEOF.FUNCTION)) ? options.clearIntervalFn : clearInterval;
      const config = ConfigurationManager.getInstance();
      this.readyLeaseMs = stryMutAct_9fa48("66796") ? config.get(LEASE_CONFIG_KEY.READY_LEASE_MS) && LEASE_DEFAULT.READY_LEASE_MS : stryMutAct_9fa48("66795") ? false : stryMutAct_9fa48("66794") ? true : (stryCov_9fa48("66794", "66795", "66796"), config.get(LEASE_CONFIG_KEY.READY_LEASE_MS) || LEASE_DEFAULT.READY_LEASE_MS);
      this.sweepIntervalMs = stryMutAct_9fa48("66799") ? config.get(LEASE_CONFIG_KEY.SWEEP_INTERVAL_MS) && LEASE_DEFAULT.SWEEP_INTERVAL_MS : stryMutAct_9fa48("66798") ? false : stryMutAct_9fa48("66797") ? true : (stryCov_9fa48("66797", "66798", "66799"), config.get(LEASE_CONFIG_KEY.SWEEP_INTERVAL_MS) || LEASE_DEFAULT.SWEEP_INTERVAL_MS);
      this.sweepTimer = null;
      this.sweepInFlight = stryMutAct_9fa48("66800") ? true : (stryCov_9fa48("66800"), false);
      this.state = LEASE_STATE.CREATED;
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(LEASE_SUBSYSTEM);
    }
  }

  /**
   * Initialize the lease service.
   * Transitions: CREATED → INITIALIZED
   */
  initialize() {
    if (stryMutAct_9fa48("66801")) {
      {}
    } else {
      stryCov_9fa48("66801");
      assertCritical(this.nodeId, LEASE_ERROR_MSG.MISSING_NODE_ID);
      assertCritical(this.nodeLeaseOwner, LEASE_ERROR_MSG.MISSING_NODE_LEASE_OWNER);
      assertCritical(this.systemTableCache, LEASE_ERROR_MSG.MISSING_CACHE);
      this.state = LEASE_STATE.INITIALIZED;
      this.logger.info(LEASE_LOG_MSG.INITIALIZED, stryMutAct_9fa48("66802") ? {} : (stryCov_9fa48("66802"), {
        nodeId: this.nodeId,
        sweepIntervalMs: this.sweepIntervalMs
      }));
    }
  }

  /**
   * Start periodic lease sweeps.
   * Transitions: INITIALIZED → RUNNING
   */
  start() {
    if (stryMutAct_9fa48("66803")) {
      {}
    } else {
      stryCov_9fa48("66803");
      if (stryMutAct_9fa48("66806") ? this.state === LEASE_STATE.INITIALIZED : stryMutAct_9fa48("66805") ? false : stryMutAct_9fa48("66804") ? true : (stryCov_9fa48("66804", "66805", "66806"), this.state !== LEASE_STATE.INITIALIZED)) {
        if (stryMutAct_9fa48("66807")) {
          {}
        } else {
          stryCov_9fa48("66807");
          throw new Error(LEASE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("66809") ? false : stryMutAct_9fa48("66808") ? true : (stryCov_9fa48("66808", "66809"), this.sweepTimer)) {
        if (stryMutAct_9fa48("66810")) {
          {}
        } else {
          stryCov_9fa48("66810");
          return;
        }
      }
      this.state = LEASE_STATE.RUNNING;
      this.sweepTimer = this.setIntervalFn(() => {
        if (stryMutAct_9fa48("66811")) {
          {}
        } else {
          stryCov_9fa48("66811");
          if (stryMutAct_9fa48("66814") ? this.state !== LEASE_STATE.RUNNING && this.sweepInFlight : stryMutAct_9fa48("66813") ? false : stryMutAct_9fa48("66812") ? true : (stryCov_9fa48("66812", "66813", "66814"), (stryMutAct_9fa48("66816") ? this.state === LEASE_STATE.RUNNING : stryMutAct_9fa48("66815") ? false : (stryCov_9fa48("66815", "66816"), this.state !== LEASE_STATE.RUNNING)) || this.sweepInFlight)) {
            if (stryMutAct_9fa48("66817")) {
              {}
            } else {
              stryCov_9fa48("66817");
              return;
            }
          }
          this.sweepInFlight = stryMutAct_9fa48("66818") ? false : (stryCov_9fa48("66818"), true);
          this.sweepExpiredLeases().catch(error => {
            if (stryMutAct_9fa48("66819")) {
              {}
            } else {
              stryCov_9fa48("66819");
              this.logger.error(LEASE_LOG_MSG.SWEEP_FAILED, stryMutAct_9fa48("66820") ? {} : (stryCov_9fa48("66820"), {
                error: error.message
              }));
              this.emit(LEASE_EVENT.SWEEP_ERROR, stryMutAct_9fa48("66821") ? {} : (stryCov_9fa48("66821"), {
                nodeId: this.nodeId,
                error
              }));
            }
          }).finally(() => {
            if (stryMutAct_9fa48("66822")) {
              {}
            } else {
              stryCov_9fa48("66822");
              this.sweepInFlight = stryMutAct_9fa48("66823") ? true : (stryCov_9fa48("66823"), false);
            }
          });
        }
      }, this.sweepIntervalMs);
      if (stryMutAct_9fa48("66826") ? typeof this.sweepTimer?.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("66825") ? false : stryMutAct_9fa48("66824") ? true : (stryCov_9fa48("66824", "66825", "66826"), typeof (stryMutAct_9fa48("66827") ? this.sweepTimer.unref : (stryCov_9fa48("66827"), this.sweepTimer?.unref)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("66828")) {
          {}
        } else {
          stryCov_9fa48("66828");
          this.sweepTimer.unref();
        }
      }
      this.logger.info(LEASE_LOG_MSG.STARTED, stryMutAct_9fa48("66829") ? {} : (stryCov_9fa48("66829"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Stop periodic lease sweeps.
   * Transitions: RUNNING → STOPPED
   */
  stop() {
    if (stryMutAct_9fa48("66830")) {
      {}
    } else {
      stryCov_9fa48("66830");
      if (stryMutAct_9fa48("66832") ? false : stryMutAct_9fa48("66831") ? true : (stryCov_9fa48("66831", "66832"), this.sweepTimer)) {
        if (stryMutAct_9fa48("66833")) {
          {}
        } else {
          stryCov_9fa48("66833");
          this.clearIntervalFn(this.sweepTimer);
          this.sweepTimer = null;
        }
      }
      this.sweepInFlight = stryMutAct_9fa48("66834") ? true : (stryCov_9fa48("66834"), false);
      this.state = LEASE_STATE.STOPPED;
      this.logger.info(LEASE_LOG_MSG.STOPPED, stryMutAct_9fa48("66835") ? {} : (stryCov_9fa48("66835"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Sweep expired readiness leases.
   * Only runs on the leader replica.
   * @return {Promise<Array>} Expired node IDs.
   */
  async sweepExpiredLeases() {
    if (stryMutAct_9fa48("66836")) {
      {}
    } else {
      stryCov_9fa48("66836");
      const hasLeader = stryMutAct_9fa48("66837") ? Array.from(this.messageGroupServices.values()).every(svc => svc.isLeaderReplica && svc.isLeaderReplica()) : (stryCov_9fa48("66837"), Array.from(this.messageGroupServices.values()).some(stryMutAct_9fa48("66838") ? () => undefined : (stryCov_9fa48("66838"), svc => stryMutAct_9fa48("66841") ? svc.isLeaderReplica || svc.isLeaderReplica() : stryMutAct_9fa48("66840") ? false : stryMutAct_9fa48("66839") ? true : (stryCov_9fa48("66839", "66840", "66841"), svc.isLeaderReplica && svc.isLeaderReplica()))));
      if (stryMutAct_9fa48("66844") ? false : stryMutAct_9fa48("66843") ? true : stryMutAct_9fa48("66842") ? hasLeader : (stryCov_9fa48("66842", "66843", "66844"), !hasLeader)) {
        if (stryMutAct_9fa48("66845")) {
          {}
        } else {
          stryCov_9fa48("66845");
          return stryMutAct_9fa48("66846") ? ["Stryker was here"] : (stryCov_9fa48("66846"), []);
        }
      }
      const now = this.now();
      const result = await readAuthoritativeControlPlaneRows(this.getControlPlaneSystemTableGateway(), TABLES.NODES, LEASE_SQL.SELECT_ALL_NODES, LEASE_EMPTY_QUERY_PARAMS);
      const nodes = stryMutAct_9fa48("66849") ? result.rows && [] : stryMutAct_9fa48("66848") ? false : stryMutAct_9fa48("66847") ? true : (stryCov_9fa48("66847", "66848", "66849"), result.rows || (stryMutAct_9fa48("66850") ? ["Stryker was here"] : (stryCov_9fa48("66850"), [])));
      const expired = stryMutAct_9fa48("66851") ? nodes : (stryCov_9fa48("66851"), nodes.filter(node => {
        if (stryMutAct_9fa48("66852")) {
          {}
        } else {
          stryCov_9fa48("66852");
          const leaseExpiry = Number(node.ready_lease_expires_at);
          return stryMutAct_9fa48("66855") ? Number.isFinite(leaseExpiry) || leaseExpiry <= now : stryMutAct_9fa48("66854") ? false : stryMutAct_9fa48("66853") ? true : (stryCov_9fa48("66853", "66854", "66855"), Number.isFinite(leaseExpiry) && (stryMutAct_9fa48("66858") ? leaseExpiry > now : stryMutAct_9fa48("66857") ? leaseExpiry < now : stryMutAct_9fa48("66856") ? true : (stryCov_9fa48("66856", "66857", "66858"), leaseExpiry <= now)));
        }
      }));
      const expiredIds = stryMutAct_9fa48("66859") ? ["Stryker was here"] : (stryCov_9fa48("66859"), []);
      for (const node of expired) {
        if (stryMutAct_9fa48("66860")) {
          {}
        } else {
          stryCov_9fa48("66860");
          if (stryMutAct_9fa48("66862") ? false : stryMutAct_9fa48("66861") ? true : (stryCov_9fa48("66861", "66862"), this.isNodeTransportConnected(node.node_id))) {
            if (stryMutAct_9fa48("66863")) {
              {}
            } else {
              stryCov_9fa48("66863");
              this.logger.info(LEASE_LOG_MSG.SWEEP_SKIPPED_TRANSPORT_CONNECTED, stryMutAct_9fa48("66864") ? {} : (stryCov_9fa48("66864"), {
                nodeId: node.node_id
              }));
              continue;
            }
          }
          const updateResult = await this.nodeLeaseOwner.disconnectNodeDueToLeaseExpiry(node, now);
          const affectedRows = Number(stryMutAct_9fa48("66866") ? updateResult.partitionResult?.affectedRows : stryMutAct_9fa48("66865") ? updateResult?.partitionResult.affectedRows : (stryCov_9fa48("66865", "66866"), updateResult?.partitionResult?.affectedRows));
          if (stryMutAct_9fa48("66869") ? false : stryMutAct_9fa48("66868") ? true : stryMutAct_9fa48("66867") ? affectedRows > NUM.ZERO : (stryCov_9fa48("66867", "66868", "66869"), !(stryMutAct_9fa48("66873") ? affectedRows <= NUM.ZERO : stryMutAct_9fa48("66872") ? affectedRows >= NUM.ZERO : stryMutAct_9fa48("66871") ? false : stryMutAct_9fa48("66870") ? true : (stryCov_9fa48("66870", "66871", "66872", "66873"), affectedRows > NUM.ZERO)))) {
            if (stryMutAct_9fa48("66874")) {
              {}
            } else {
              stryCov_9fa48("66874");
              emitInvariant(this, stryMutAct_9fa48("66875") ? {} : (stryCov_9fa48("66875"), {
                invariantId: INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
                passed: stryMutAct_9fa48("66876") ? false : (stryCov_9fa48("66876"), true),
                entityId: node.node_id,
                owningSubsystem: LEASE_SUBSYSTEM,
                observed: stryMutAct_9fa48("66877") ? {} : (stryCov_9fa48("66877"), {
                  guardedWriteApplied: stryMutAct_9fa48("66878") ? true : (stryCov_9fa48("66878"), false),
                  readyLeaseExpiresAt: stryMutAct_9fa48("66879") ? node.ready_lease_expires_at && null : (stryCov_9fa48("66879"), node.ready_lease_expires_at ?? null),
                  lastHeartbeat: stryMutAct_9fa48("66880") ? node.last_heartbeat && null : (stryCov_9fa48("66880"), node.last_heartbeat ?? null)
                })
              }));
              continue;
            }
          }
          expiredIds.push(node.node_id);
          emitInvariant(this, stryMutAct_9fa48("66881") ? {} : (stryCov_9fa48("66881"), {
            invariantId: INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
            passed: stryMutAct_9fa48("66882") ? false : (stryCov_9fa48("66882"), true),
            entityId: node.node_id,
            owningSubsystem: LEASE_SUBSYSTEM,
            observed: stryMutAct_9fa48("66883") ? {} : (stryCov_9fa48("66883"), {
              guardedWriteApplied: stryMutAct_9fa48("66884") ? false : (stryCov_9fa48("66884"), true),
              readyLeaseExpiresAt: stryMutAct_9fa48("66885") ? node.ready_lease_expires_at && null : (stryCov_9fa48("66885"), node.ready_lease_expires_at ?? null),
              lastHeartbeat: stryMutAct_9fa48("66886") ? node.last_heartbeat && null : (stryCov_9fa48("66886"), node.last_heartbeat ?? null),
              nextConnectionState: STATE.DISCONNECTED
            })
          }));
          this.emit(LEASE_EVENT.LEASE_EXPIRED, stryMutAct_9fa48("66887") ? {} : (stryCov_9fa48("66887"), {
            nodeId: node.node_id
          }));
        }
      }
      if (stryMutAct_9fa48("66891") ? expiredIds.length <= NUM.ZERO : stryMutAct_9fa48("66890") ? expiredIds.length >= NUM.ZERO : stryMutAct_9fa48("66889") ? false : stryMutAct_9fa48("66888") ? true : (stryCov_9fa48("66888", "66889", "66890", "66891"), expiredIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("66892")) {
          {}
        } else {
          stryCov_9fa48("66892");
          this.logger.info(LEASE_LOG_MSG.SWEEP_EXPIRED, stryMutAct_9fa48("66893") ? {} : (stryCov_9fa48("66893"), {
            count: expiredIds.length,
            nodeIds: expiredIds
          }));
        }
      }
      this.emit(LEASE_EVENT.SWEEP_COMPLETE, stryMutAct_9fa48("66894") ? {} : (stryCov_9fa48("66894"), {
        expired: expiredIds.length
      }));
      return expiredIds;
    }
  }

  /**
   * Get the current state.
   * @return {string} Current lifecycle state.
   */
  getState() {
    if (stryMutAct_9fa48("66895")) {
      {}
    } else {
      stryCov_9fa48("66895");
      return this.state;
    }
  }

  /**
   * §1.4.12: Check whether the message router reports a node as
   * transport-connected. When the router reports connected or ready,
   * the node is reachable and the expired lease is likely caused by
   * CDC propagation delay, not actual node failure.
   * @param {string} nodeId - Node ID to check.
   * @return {boolean} True when the router reports the node connected.
   */
  isNodeTransportConnected(nodeId) {
    if (stryMutAct_9fa48("66896")) {
      {}
    } else {
      stryCov_9fa48("66896");
      if (stryMutAct_9fa48("66899") ? !this.messageRouter && typeof this.messageRouter.getConnectionState !== TYPEOF.FUNCTION : stryMutAct_9fa48("66898") ? false : stryMutAct_9fa48("66897") ? true : (stryCov_9fa48("66897", "66898", "66899"), (stryMutAct_9fa48("66900") ? this.messageRouter : (stryCov_9fa48("66900"), !this.messageRouter)) || (stryMutAct_9fa48("66902") ? typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION : stryMutAct_9fa48("66901") ? false : (stryCov_9fa48("66901", "66902"), typeof this.messageRouter.getConnectionState !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("66903")) {
          {}
        } else {
          stryCov_9fa48("66903");
          return stryMutAct_9fa48("66904") ? true : (stryCov_9fa48("66904"), false);
        }
      }
      const routerState = stryMutAct_9fa48("66905") ? String(this.messageRouter.getConnectionState(nodeId) || '').toUpperCase() : (stryCov_9fa48("66905"), String(stryMutAct_9fa48("66908") ? this.messageRouter.getConnectionState(nodeId) && '' : stryMutAct_9fa48("66907") ? false : stryMutAct_9fa48("66906") ? true : (stryCov_9fa48("66906", "66907", "66908"), this.messageRouter.getConnectionState(nodeId) || (stryMutAct_9fa48("66909") ? "Stryker was here!" : (stryCov_9fa48("66909"), '')))).toLowerCase());
      return stryMutAct_9fa48("66912") ? routerState === STATE.CONNECTED && routerState === STATE.READY : stryMutAct_9fa48("66911") ? false : stryMutAct_9fa48("66910") ? true : (stryCov_9fa48("66910", "66911", "66912"), (stryMutAct_9fa48("66914") ? routerState !== STATE.CONNECTED : stryMutAct_9fa48("66913") ? false : (stryCov_9fa48("66913", "66914"), routerState === STATE.CONNECTED)) || (stryMutAct_9fa48("66916") ? routerState !== STATE.READY : stryMutAct_9fa48("66915") ? false : (stryCov_9fa48("66915", "66916"), routerState === STATE.READY)));
    }
  }

  /**
   * Resolve the canonical system-table gateway for lease sweeps.
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("66917")) {
      {}
    } else {
      stryCov_9fa48("66917");
      assertCritical(this.controlPlaneSystemTableGateway, stryMutAct_9fa48("66918") ? "" : (stryCov_9fa48("66918"), 'LeaseService requires controlPlaneSystemTableGateway'));
      return this.controlPlaneSystemTableGateway;
    }
  }
}
export { LeaseService };