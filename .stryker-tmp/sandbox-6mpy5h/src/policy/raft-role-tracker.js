/**
 * Raft Role Tracker - Tracks and updates Raft role changes in the services table.
 * Updates raft_role column when Raft state changes and propagates via CDC.
 * Requirements: 14.6, 14.7, 14.8
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
import { TABLES } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { POLICY_ERROR_MSG, POLICY_EVENT, POLICY_LOG_MSG, POLICY_RESULT_REASON, POLICY_SUBSYSTEM, RAFT_ROLE, TYPEOF } from './policy-constants.js';

/**
 * Valid Raft roles.
 */
const RaftRole = RAFT_ROLE;

/**
 * RaftRoleTracker monitors Raft role changes and updates the services system table.
 * It ensures raft_role is kept in sync and propagated via CDC.
 */
class RaftRoleTracker extends EventEmitter {
  /**
   * Create a new RaftRoleTracker.
   * @param {Object} options - Configuration options.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("107789")) {
      {}
    } else {
      stryCov_9fa48("107789");
      super();
      this.cdcIntegrationService = stryMutAct_9fa48("107792") ? options.cdcIntegrationService && null : stryMutAct_9fa48("107791") ? false : stryMutAct_9fa48("107790") ? true : (stryCov_9fa48("107790", "107791", "107792"), options.cdcIntegrationService || null);
      this.systemTableCache = stryMutAct_9fa48("107795") ? options.systemTableCache && null : stryMutAct_9fa48("107794") ? false : stryMutAct_9fa48("107793") ? true : (stryCov_9fa48("107793", "107794", "107795"), options.systemTableCache || null);
      this.sqlQueryEngine = stryMutAct_9fa48("107798") ? options.sqlQueryEngine && null : stryMutAct_9fa48("107797") ? false : stryMutAct_9fa48("107796") ? true : (stryCov_9fa48("107796", "107797", "107798"), options.sqlQueryEngine || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("107801") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("107800") ? false : stryMutAct_9fa48("107799") ? true : (stryCov_9fa48("107799", "107800", "107801"), options.controlPlaneSystemTableGateway || null);

      // Track registered services
      this.trackedServices = new Map();

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(POLICY_SUBSYSTEM.RAFT_ROLE_TRACKER) : console;
      this.initialized = stryMutAct_9fa48("107802") ? true : (stryCov_9fa48("107802"), false);
    }
  }

  /**
   * Initialize the tracker.
   */
  initialize() {
    if (stryMutAct_9fa48("107803")) {
      {}
    } else {
      stryCov_9fa48("107803");
      if (stryMutAct_9fa48("107805") ? false : stryMutAct_9fa48("107804") ? true : (stryCov_9fa48("107804", "107805"), this.initialized)) {
        if (stryMutAct_9fa48("107806")) {
          {}
        } else {
          stryCov_9fa48("107806");
          return;
        }
      }
      this.logger.info(POLICY_LOG_MSG.RAFT_TRACKER_INITIALIZED);
      this.initialized = stryMutAct_9fa48("107807") ? false : (stryCov_9fa48("107807"), true);
    }
  }

  /**
   * Register a service for role tracking.
   * @param {string} serviceId - Service ID.
   * @param {Object} service - Service instance with role events.
   */
  registerService(serviceId, service) {
    if (stryMutAct_9fa48("107808")) {
      {}
    } else {
      stryCov_9fa48("107808");
      if (stryMutAct_9fa48("107811") ? false : stryMutAct_9fa48("107810") ? true : stryMutAct_9fa48("107809") ? serviceId : (stryCov_9fa48("107809", "107810", "107811"), !serviceId)) {
        if (stryMutAct_9fa48("107812")) {
          {}
        } else {
          stryCov_9fa48("107812");
          throw new Error(POLICY_ERROR_MSG.SERVICE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("107814") ? false : stryMutAct_9fa48("107813") ? true : (stryCov_9fa48("107813", "107814"), this.trackedServices.has(serviceId))) {
        if (stryMutAct_9fa48("107815")) {
          {}
        } else {
          stryCov_9fa48("107815");
          this.logger.debug(POLICY_LOG_MSG.SERVICE_ALREADY_REGISTERED, stryMutAct_9fa48("107816") ? {} : (stryCov_9fa48("107816"), {
            serviceId
          }));
          return;
        }
      }
      this.trackedServices.set(serviceId, stryMutAct_9fa48("107817") ? {} : (stryCov_9fa48("107817"), {
        service,
        currentRole: null
      }));

      // Listen for role change events if service supports them
      if (stryMutAct_9fa48("107820") ? service || typeof service.on === TYPEOF.FUNCTION : stryMutAct_9fa48("107819") ? false : stryMutAct_9fa48("107818") ? true : (stryCov_9fa48("107818", "107819", "107820"), service && (stryMutAct_9fa48("107822") ? typeof service.on !== TYPEOF.FUNCTION : stryMutAct_9fa48("107821") ? true : (stryCov_9fa48("107821", "107822"), typeof service.on === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("107823")) {
          {}
        } else {
          stryCov_9fa48("107823");
          service.on(POLICY_EVENT.ROLE_CHANGED, event => {
            if (stryMutAct_9fa48("107824")) {
              {}
            } else {
              stryCov_9fa48("107824");
              this.handleRoleChange(serviceId, event.newRole, event.oldRole);
            }
          });
        }
      }
      this.logger.debug(POLICY_LOG_MSG.SERVICE_REGISTERED, stryMutAct_9fa48("107825") ? {} : (stryCov_9fa48("107825"), {
        serviceId
      }));
    }
  }

  /**
   * Unregister a service from role tracking.
   * @param {string} serviceId - Service ID.
   */
  unregisterService(serviceId) {
    if (stryMutAct_9fa48("107826")) {
      {}
    } else {
      stryCov_9fa48("107826");
      const tracked = this.trackedServices.get(serviceId);
      if (stryMutAct_9fa48("107829") ? false : stryMutAct_9fa48("107828") ? true : stryMutAct_9fa48("107827") ? tracked : (stryCov_9fa48("107827", "107828", "107829"), !tracked)) {
        if (stryMutAct_9fa48("107830")) {
          {}
        } else {
          stryCov_9fa48("107830");
          return;
        }
      }

      // Remove event listener if possible
      if (stryMutAct_9fa48("107833") ? tracked.service || typeof tracked.service.removeAllListeners === TYPEOF.FUNCTION : stryMutAct_9fa48("107832") ? false : stryMutAct_9fa48("107831") ? true : (stryCov_9fa48("107831", "107832", "107833"), tracked.service && (stryMutAct_9fa48("107835") ? typeof tracked.service.removeAllListeners !== TYPEOF.FUNCTION : stryMutAct_9fa48("107834") ? true : (stryCov_9fa48("107834", "107835"), typeof tracked.service.removeAllListeners === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("107836")) {
          {}
        } else {
          stryCov_9fa48("107836");
          tracked.service.removeAllListeners(POLICY_EVENT.ROLE_CHANGED);
        }
      }
      this.trackedServices.delete(serviceId);
      this.logger.debug(POLICY_LOG_MSG.SERVICE_UNREGISTERED, stryMutAct_9fa48("107837") ? {} : (stryCov_9fa48("107837"), {
        serviceId
      }));
    }
  }

  /**
   * Handle a role change event.
   * @param {string} serviceId - Service ID.
   * @param {string} newRole - New Raft role.
   * @param {string} oldRole - Previous Raft role.
   */
  async handleRoleChange(serviceId, newRole, oldRole) {
    if (stryMutAct_9fa48("107838")) {
      {}
    } else {
      stryCov_9fa48("107838");
      if (stryMutAct_9fa48("107841") ? false : stryMutAct_9fa48("107840") ? true : stryMutAct_9fa48("107839") ? this.isValidRole(newRole) : (stryCov_9fa48("107839", "107840", "107841"), !this.isValidRole(newRole))) {
        if (stryMutAct_9fa48("107842")) {
          {}
        } else {
          stryCov_9fa48("107842");
          this.logger.warn(POLICY_LOG_MSG.INVALID_RAFT_ROLE, stryMutAct_9fa48("107843") ? {} : (stryCov_9fa48("107843"), {
            serviceId,
            newRole
          }));
          return;
        }
      }
      const tracked = this.trackedServices.get(serviceId);
      if (stryMutAct_9fa48("107845") ? false : stryMutAct_9fa48("107844") ? true : (stryCov_9fa48("107844", "107845"), tracked)) {
        if (stryMutAct_9fa48("107846")) {
          {}
        } else {
          stryCov_9fa48("107846");
          tracked.currentRole = newRole;
        }
      }
      this.logger.debug(POLICY_LOG_MSG.ROLE_CHANGED, stryMutAct_9fa48("107847") ? {} : (stryCov_9fa48("107847"), {
        serviceId,
        oldRole,
        newRole
      }));

      // Update the services table via CDC
      await this.updateServiceRole(serviceId, newRole);

      // Emit event for listeners
      this.emit(POLICY_EVENT.ROLE_CHANGED, stryMutAct_9fa48("107848") ? {} : (stryCov_9fa48("107848"), {
        serviceId,
        oldRole,
        newRole,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * Update the raft_role in the services system table.
   * @param {string} serviceId - Service ID.
   * @param {string} role - New Raft role.
   * @return {Promise<Object>} Update result.
   */
  async updateServiceRole(serviceId, role) {
    if (stryMutAct_9fa48("107849")) {
      {}
    } else {
      stryCov_9fa48("107849");
      if (stryMutAct_9fa48("107852") ? false : stryMutAct_9fa48("107851") ? true : stryMutAct_9fa48("107850") ? this.cdcIntegrationService : (stryCov_9fa48("107850", "107851", "107852"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("107853")) {
          {}
        } else {
          stryCov_9fa48("107853");
          this.logger.warn(POLICY_LOG_MSG.UPDATE_SKIPPED_NO_CDC, stryMutAct_9fa48("107854") ? {} : (stryCov_9fa48("107854"), {
            serviceId,
            role
          }));
          return stryMutAct_9fa48("107855") ? {} : (stryCov_9fa48("107855"), {
            success: stryMutAct_9fa48("107856") ? true : (stryCov_9fa48("107856"), false),
            reason: POLICY_RESULT_REASON.NO_CDC_SERVICE
          });
        }
      }
      try {
        if (stryMutAct_9fa48("107857")) {
          {}
        } else {
          stryCov_9fa48("107857");
          const updateData = stryMutAct_9fa48("107858") ? {} : (stryCov_9fa48("107858"), {
            raft_role: role,
            updated_at: Date.now()
          });
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("107859") ? {} : (stryCov_9fa48("107859"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: TABLES.SERVICES,
            whereClause: stryMutAct_9fa48("107860") ? {} : (stryCov_9fa48("107860"), {
              service_id: serviceId
            }),
            data: updateData
          }), stryMutAct_9fa48("107861") ? {} : (stryCov_9fa48("107861"), {
            expectedCacheFields: updateData,
            workClass: PRESSURE_WORK_CLASS.BACKGROUND,
            deliveryPriority: stryMutAct_9fa48("107862") ? "" : (stryCov_9fa48("107862"), 'background'),
            allowPressureDefer: stryMutAct_9fa48("107863") ? false : (stryCov_9fa48("107863"), true),
            coalescingKey: stryMutAct_9fa48("107864") ? `` : (stryCov_9fa48("107864"), `services:raft-role:${serviceId}`)
          }));
          this.logger.info(POLICY_LOG_MSG.UPDATED_SERVICE_ROLE, stryMutAct_9fa48("107865") ? {} : (stryCov_9fa48("107865"), {
            serviceId,
            role
          }));
          return stryMutAct_9fa48("107866") ? {} : (stryCov_9fa48("107866"), {
            success: stryMutAct_9fa48("107867") ? false : (stryCov_9fa48("107867"), true),
            serviceId,
            role
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("107868")) {
          {}
        } else {
          stryCov_9fa48("107868");
          this.logger.error(POLICY_LOG_MSG.UPDATE_SERVICE_ROLE_FAILED, stryMutAct_9fa48("107869") ? {} : (stryCov_9fa48("107869"), {
            serviceId,
            role,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Manually update a service's role.
   * Use this when the service doesn't emit role change events.
   * @param {string} serviceId - Service ID.
   * @param {string} newRole - New Raft role.
   * @return {Promise<Object>} Update result.
   */
  async setServiceRole(serviceId, newRole) {
    if (stryMutAct_9fa48("107870")) {
      {}
    } else {
      stryCov_9fa48("107870");
      if (stryMutAct_9fa48("107873") ? false : stryMutAct_9fa48("107872") ? true : stryMutAct_9fa48("107871") ? this.isValidRole(newRole) : (stryCov_9fa48("107871", "107872", "107873"), !this.isValidRole(newRole))) {
        if (stryMutAct_9fa48("107874")) {
          {}
        } else {
          stryCov_9fa48("107874");
          throw new Error(stryMutAct_9fa48("107875") ? `` : (stryCov_9fa48("107875"), `${POLICY_ERROR_MSG.INVALID_RAFT_ROLE_PREFIX}${newRole}`));
        }
      }
      const tracked = this.trackedServices.get(serviceId);
      const oldRole = stryMutAct_9fa48("107878") ? tracked?.currentRole && null : stryMutAct_9fa48("107877") ? false : stryMutAct_9fa48("107876") ? true : (stryCov_9fa48("107876", "107877", "107878"), (stryMutAct_9fa48("107879") ? tracked.currentRole : (stryCov_9fa48("107879"), tracked?.currentRole)) || null);
      if (stryMutAct_9fa48("107881") ? false : stryMutAct_9fa48("107880") ? true : (stryCov_9fa48("107880", "107881"), tracked)) {
        if (stryMutAct_9fa48("107882")) {
          {}
        } else {
          stryCov_9fa48("107882");
          tracked.currentRole = newRole;
        }
      }
      return this.handleRoleChange(serviceId, newRole, oldRole);
    }
  }

  /**
   * Get the current role for a service from SystemTableCache.
   * Single read-model path — no local mirror or SQL fallback.
   * @param {string} serviceId - Service ID.
   * @return {Promise<string|null>} Current role or null.
   */
  async getServiceRole(serviceId) {
    if (stryMutAct_9fa48("107883")) {
      {}
    } else {
      stryCov_9fa48("107883");
      if (stryMutAct_9fa48("107886") ? !this.systemTableCache && typeof this.systemTableCache.get !== 'function' : stryMutAct_9fa48("107885") ? false : stryMutAct_9fa48("107884") ? true : (stryCov_9fa48("107884", "107885", "107886"), (stryMutAct_9fa48("107887") ? this.systemTableCache : (stryCov_9fa48("107887"), !this.systemTableCache)) || (stryMutAct_9fa48("107889") ? typeof this.systemTableCache.get === 'function' : stryMutAct_9fa48("107888") ? false : (stryCov_9fa48("107888", "107889"), typeof this.systemTableCache.get !== (stryMutAct_9fa48("107890") ? "" : (stryCov_9fa48("107890"), 'function')))))) {
        if (stryMutAct_9fa48("107891")) {
          {}
        } else {
          stryCov_9fa48("107891");
          return null;
        }
      }
      const row = this.systemTableCache.get(TABLES.SERVICES, serviceId);
      return stryMutAct_9fa48("107894") ? row?.raft_role && null : stryMutAct_9fa48("107893") ? false : stryMutAct_9fa48("107892") ? true : (stryCov_9fa48("107892", "107893", "107894"), (stryMutAct_9fa48("107895") ? row.raft_role : (stryCov_9fa48("107895"), row?.raft_role)) || null);
    }
  }

  /**
   * Get all services with a specific role from SystemTableCache.
   * @param {string} role - Raft role to filter by.
   * @return {Promise<Array<Object>>} Services with the specified role.
   */
  async getServicesByRole(role) {
    if (stryMutAct_9fa48("107896")) {
      {}
    } else {
      stryCov_9fa48("107896");
      if (stryMutAct_9fa48("107899") ? !this.systemTableCache && typeof this.systemTableCache.filter !== 'function' : stryMutAct_9fa48("107898") ? false : stryMutAct_9fa48("107897") ? true : (stryCov_9fa48("107897", "107898", "107899"), (stryMutAct_9fa48("107900") ? this.systemTableCache : (stryCov_9fa48("107900"), !this.systemTableCache)) || (stryMutAct_9fa48("107902") ? typeof this.systemTableCache.filter === 'function' : stryMutAct_9fa48("107901") ? false : (stryCov_9fa48("107901", "107902"), typeof this.systemTableCache.filter !== (stryMutAct_9fa48("107903") ? "" : (stryCov_9fa48("107903"), 'function')))))) {
        if (stryMutAct_9fa48("107904")) {
          {}
        } else {
          stryCov_9fa48("107904");
          return stryMutAct_9fa48("107905") ? ["Stryker was here"] : (stryCov_9fa48("107905"), []);
        }
      }
      return stryMutAct_9fa48("107908") ? this.systemTableCache.filter(TABLES.SERVICES, row => row?.raft_role === role) && [] : stryMutAct_9fa48("107907") ? false : stryMutAct_9fa48("107906") ? true : (stryCov_9fa48("107906", "107907", "107908"), (stryMutAct_9fa48("107909") ? this.systemTableCache : (stryCov_9fa48("107909"), this.systemTableCache.filter(TABLES.SERVICES, stryMutAct_9fa48("107910") ? () => undefined : (stryCov_9fa48("107910"), row => stryMutAct_9fa48("107913") ? row?.raft_role !== role : stryMutAct_9fa48("107912") ? false : stryMutAct_9fa48("107911") ? true : (stryCov_9fa48("107911", "107912", "107913"), (stryMutAct_9fa48("107914") ? row.raft_role : (stryCov_9fa48("107914"), row?.raft_role)) === role))))) || (stryMutAct_9fa48("107915") ? ["Stryker was here"] : (stryCov_9fa48("107915"), [])));
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("107916")) {
      {}
    } else {
      stryCov_9fa48("107916");
      if (stryMutAct_9fa48("107918") ? false : stryMutAct_9fa48("107917") ? true : (stryCov_9fa48("107917", "107918"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("107919")) {
          {}
        } else {
          stryCov_9fa48("107919");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("107920") ? {} : (stryCov_9fa48("107920"), {
        getCdcIntegrationService: stryMutAct_9fa48("107921") ? () => undefined : (stryCov_9fa48("107921"), () => this.cdcIntegrationService),
        getSqlQueryEngine: stryMutAct_9fa48("107922") ? () => undefined : (stryCov_9fa48("107922"), () => this.sqlQueryEngine),
        getSystemTableCache: stryMutAct_9fa48("107923") ? () => undefined : (stryCov_9fa48("107923"), () => this.systemTableCache)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Get all leader services.
   * @return {Promise<Array<Object>>} Services that are leaders.
   */
  async getLeaders() {
    if (stryMutAct_9fa48("107924")) {
      {}
    } else {
      stryCov_9fa48("107924");
      return this.getServicesByRole(RaftRole.LEADER);
    }
  }

  /**
   * Get all follower services.
   * @return {Promise<Array<Object>>} Services that are followers.
   */
  async getFollowers() {
    if (stryMutAct_9fa48("107925")) {
      {}
    } else {
      stryCov_9fa48("107925");
      return this.getServicesByRole(RaftRole.FOLLOWER);
    }
  }

  /**
   * Check if a role is valid.
   * @param {string} role - Role to validate.
   * @return {boolean} True if valid.
   */
  isValidRole(role) {
    if (stryMutAct_9fa48("107926")) {
      {}
    } else {
      stryCov_9fa48("107926");
      return Object.values(RaftRole).includes(role);
    }
  }

  /**
   * Get all tracked services.
   * @return {Array<string>} Array of service IDs.
   */
  getTrackedServices() {
    if (stryMutAct_9fa48("107927")) {
      {}
    } else {
      stryCov_9fa48("107927");
      return Array.from(this.trackedServices.keys());
    }
  }

  /**
   * Shutdown the tracker.
   */
  shutdown() {
    if (stryMutAct_9fa48("107928")) {
      {}
    } else {
      stryCov_9fa48("107928");
      // Unregister all services
      for (const serviceId of this.trackedServices.keys()) {
        if (stryMutAct_9fa48("107929")) {
          {}
        } else {
          stryCov_9fa48("107929");
          this.unregisterService(serviceId);
        }
      }
      this.removeAllListeners();
      this.logger.info(POLICY_LOG_MSG.TRACKER_SHUTDOWN);
    }
  }
}
export { RaftRoleTracker, RaftRole };