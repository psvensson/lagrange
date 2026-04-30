/**
 * Raft Role Tracker - Tracks and updates Raft role changes in the services table.
 * Updates raft_role column when Raft state changes and propagates via CDC.
 * Requirements: 14.6, 14.7, 14.8
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  POLICY_ERROR_MSG,
  POLICY_EVENT,
  POLICY_LOG_MSG,
  POLICY_RESULT_REASON,
  POLICY_SUBSYSTEM,
  RAFT_ROLE,
  TYPEOF,
} from './policy-constants.js';

const LOCAL_STR_BACKGROUND = 'background';
const LOCAL_STR_FUNCTION = 'function';

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
    super();

    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;

    // Track registered services
    this.trackedServices = new Map();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(POLICY_SUBSYSTEM.RAFT_ROLE_TRACKER) : console;

    this.initialized = false;
  }

  /**
   * Initialize the tracker.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info(POLICY_LOG_MSG.RAFT_TRACKER_INITIALIZED);
    this.initialized = true;
  }

  /**
   * Register a service for role tracking.
   * @param {string} serviceId - Service ID.
   * @param {Object} service - Service instance with role events.
   */
  registerService(serviceId, service) {
    if (!serviceId) {
      throw new Error(POLICY_ERROR_MSG.SERVICE_ID_REQUIRED);
    }

    if (this.trackedServices.has(serviceId)) {
      this.logger.debug(POLICY_LOG_MSG.SERVICE_ALREADY_REGISTERED, {serviceId});
      return;
    }

    this.trackedServices.set(serviceId, {
      service,
      currentRole: null,
    });

    // Listen for role change events if service supports them
    if (service && typeof service.on === TYPEOF.FUNCTION) {
      service.on(POLICY_EVENT.ROLE_CHANGED, (event) => {
        this.handleRoleChange(serviceId, event.newRole, event.oldRole);
      });
    }

    this.logger.debug(POLICY_LOG_MSG.SERVICE_REGISTERED, {serviceId});
  }

  /**
   * Unregister a service from role tracking.
   * @param {string} serviceId - Service ID.
   */
  unregisterService(serviceId) {
    const tracked = this.trackedServices.get(serviceId);
    if (!tracked) {
      return;
    }

    // Remove event listener if possible
    if (tracked.service && typeof tracked.service.removeAllListeners === TYPEOF.FUNCTION) {
      tracked.service.removeAllListeners(POLICY_EVENT.ROLE_CHANGED);
    }

    this.trackedServices.delete(serviceId);
    this.logger.debug(POLICY_LOG_MSG.SERVICE_UNREGISTERED, {serviceId});
  }


  /**
   * Handle a role change event.
   * @param {string} serviceId - Service ID.
   * @param {string} newRole - New Raft role.
   * @param {string} oldRole - Previous Raft role.
   */
  async handleRoleChange(serviceId, newRole, oldRole) {
    if (!this.isValidRole(newRole)) {
      this.logger.warn(POLICY_LOG_MSG.INVALID_RAFT_ROLE, {serviceId, newRole});
      return;
    }

    const tracked = this.trackedServices.get(serviceId);
    if (tracked) {
      tracked.currentRole = newRole;
    }

    this.logger.debug(POLICY_LOG_MSG.ROLE_CHANGED, {
      serviceId,
      oldRole,
      newRole,
    });

    // Update the services table via CDC
    await this.updateServiceRole(serviceId, newRole);

    // Emit event for listeners
    this.emit(POLICY_EVENT.ROLE_CHANGED, {
      serviceId,
      oldRole,
      newRole,
      timestamp: Date.now(),
    });
  }

  /**
   * Update the raft_role in the services system table.
   * @param {string} serviceId - Service ID.
   * @param {string} role - New Raft role.
   * @return {Promise<Object>} Update result.
   */
  async updateServiceRole(serviceId, role) {
    if (!this.cdcIntegrationService) {
      this.logger.warn(POLICY_LOG_MSG.UPDATE_SKIPPED_NO_CDC, {
        serviceId,
        role,
      });
      return {success: false, reason: POLICY_RESULT_REASON.NO_CDC_SERVICE};
    }

    try {
      const updateData = {
        raft_role: role,
        updated_at: Date.now(),
      };
      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: {service_id: serviceId},
        data: updateData,
      }, {
        expectedCacheFields: updateData,
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        deliveryPriority: LOCAL_STR_BACKGROUND,
        allowPressureDefer: true,
        coalescingKey: `services:raft-role:${serviceId}`,
      });

      this.logger.info(POLICY_LOG_MSG.UPDATED_SERVICE_ROLE, {
        serviceId,
        role,
      });

      return {success: true, serviceId, role};
    } catch (error) {
      this.logger.error(POLICY_LOG_MSG.UPDATE_SERVICE_ROLE_FAILED, {
        serviceId,
        role,
        error: error.message,
      });
      throw error;
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
    if (!this.isValidRole(newRole)) {
      throw new Error(`${POLICY_ERROR_MSG.INVALID_RAFT_ROLE_PREFIX}${newRole}`);
    }

    const tracked = this.trackedServices.get(serviceId);
    const oldRole = tracked?.currentRole || null;

    if (tracked) {
      tracked.currentRole = newRole;
    }

    return this.handleRoleChange(serviceId, newRole, oldRole);
  }

  /**
   * Get the current role for a service from SystemTableCache.
   * Single read-model path — no local mirror or SQL fallback.
   * @param {string} serviceId - Service ID.
   * @return {Promise<string|null>} Current role or null.
   */
  async getServiceRole(serviceId) {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.get !== LOCAL_STR_FUNCTION) {
      return null;
    }

    const row = this.systemTableCache.get(TABLES.SERVICES, serviceId);
    return row?.raft_role || null;
  }

  /**
   * Get all services with a specific role from SystemTableCache.
   * @param {string} role - Raft role to filter by.
   * @return {Promise<Array<Object>>} Services with the specified role.
   */
  async getServicesByRole(role) {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.filter !== LOCAL_STR_FUNCTION) {
      return [];
    }

    return this.systemTableCache.filter(
      TABLES.SERVICES,
      (row) => row?.raft_role === role,
    ) || [];
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      getCdcIntegrationService: () => this.cdcIntegrationService,
      getSqlQueryEngine: () => this.sqlQueryEngine,
      getSystemTableCache: () => this.systemTableCache,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Get all leader services.
   * @return {Promise<Array<Object>>} Services that are leaders.
   */
  async getLeaders() {
    return this.getServicesByRole(RaftRole.LEADER);
  }

  /**
   * Get all follower services.
   * @return {Promise<Array<Object>>} Services that are followers.
   */
  async getFollowers() {
    return this.getServicesByRole(RaftRole.FOLLOWER);
  }

  /**
   * Check if a role is valid.
   * @param {string} role - Role to validate.
   * @return {boolean} True if valid.
   */
  isValidRole(role) {
    return Object.values(RaftRole).includes(role);
  }

  /**
   * Get all tracked services.
   * @return {Array<string>} Array of service IDs.
   */
  getTrackedServices() {
    return Array.from(this.trackedServices.keys());
  }

  /**
   * Shutdown the tracker.
   */
  shutdown() {
    // Unregister all services
    for (const serviceId of this.trackedServices.keys()) {
      this.unregisterService(serviceId);
    }

    this.removeAllListeners();
    this.logger.info(POLICY_LOG_MSG.TRACKER_SHUTDOWN);
  }
}

export {
  RaftRoleTracker,
  RaftRole,
};
