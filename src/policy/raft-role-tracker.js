/**
 * Raft Role Tracker - Tracks and updates Raft role changes in the services table.
 * Updates raft_role column when Raft state changes and propagates via CDC.
 * Requirements: 14.6, 14.7, 14.8
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';

/**
 * Valid Raft roles.
 */
const RaftRole = {
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
};

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

    // Track registered services
    this.trackedServices = new Map();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('raft-role-tracker') : console;

    this.initialized = false;
  }

  /**
   * Initialize the tracker.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info('RaftRoleTracker initialized');
    this.initialized = true;
  }

  /**
   * Register a service for role tracking.
   * @param {string} serviceId - Service ID.
   * @param {Object} service - Service instance with role events.
   */
  registerService(serviceId, service) {
    if (!serviceId) {
      throw new Error('serviceId is required');
    }

    if (this.trackedServices.has(serviceId)) {
      this.logger.debug('Service already registered', {serviceId});
      return;
    }

    this.trackedServices.set(serviceId, {
      service,
      currentRole: null,
    });

    // Listen for role change events if service supports them
    if (service && typeof service.on === 'function') {
      service.on('roleChanged', (event) => {
        this.handleRoleChange(serviceId, event.newRole, event.oldRole);
      });
    }

    this.logger.debug('Service registered for role tracking', {serviceId});
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
    if (tracked.service && typeof tracked.service.removeAllListeners === 'function') {
      tracked.service.removeAllListeners('roleChanged');
    }

    this.trackedServices.delete(serviceId);
    this.logger.debug('Service unregistered from role tracking', {serviceId});
  }


  /**
   * Handle a role change event.
   * @param {string} serviceId - Service ID.
   * @param {string} newRole - New Raft role.
   * @param {string} oldRole - Previous Raft role.
   */
  async handleRoleChange(serviceId, newRole, oldRole) {
    if (!this.isValidRole(newRole)) {
      this.logger.warn('Invalid Raft role', {serviceId, newRole});
      return;
    }

    const tracked = this.trackedServices.get(serviceId);
    if (tracked) {
      tracked.currentRole = newRole;
    }

    this.logger.debug('Raft role changed', {
      serviceId,
      oldRole,
      newRole,
    });

    // Update the services table via CDC
    await this.updateServiceRole(serviceId, newRole);

    // Emit event for listeners
    this.emit('roleChanged', {
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
      this.logger.warn('CDC integration service not available, skipping role update', {
        serviceId,
        role,
      });
      return {success: false, reason: 'no_cdc_service'};
    }

    try {
      await this.cdcIntegrationService.updateSystemTableRow('services', serviceId, {
        raft_role: role,
        updated_at: Date.now(),
      });

      this.logger.info('Updated service Raft role', {
        serviceId,
        role,
      });

      return {success: true, serviceId, role};
    } catch (error) {
      this.logger.error('Failed to update service Raft role', {
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
      throw new Error(`Invalid Raft role: ${newRole}`);
    }

    const tracked = this.trackedServices.get(serviceId);
    const oldRole = tracked?.currentRole || null;

    if (tracked) {
      tracked.currentRole = newRole;
    }

    return this.handleRoleChange(serviceId, newRole, oldRole);
  }

  /**
   * Get the current role for a service.
   * @param {string} serviceId - Service ID.
   * @return {string|null} Current role or null if not tracked.
   */
  getServiceRole(serviceId) {
    // First check tracked services
    const tracked = this.trackedServices.get(serviceId);
    if (tracked && tracked.currentRole) {
      return tracked.currentRole;
    }

    // Fall back to system table cache
    if (this.systemTableCache) {
      const service = this.systemTableCache.get('services', serviceId);
      if (service && service.raft_role) {
        return service.raft_role;
      }
    }

    return null;
  }

  /**
   * Get all services with a specific role.
   * @param {string} role - Raft role to filter by.
   * @return {Array<Object>} Services with the specified role.
   */
  getServicesByRole(role) {
    if (!this.systemTableCache) {
      return [];
    }

    return this.systemTableCache.filter('services', (service) => {
      return service.raft_role === role;
    });
  }

  /**
   * Get all leader services.
   * @return {Array<Object>} Services that are leaders.
   */
  getLeaders() {
    return this.getServicesByRole(RaftRole.LEADER);
  }

  /**
   * Get all follower services.
   * @return {Array<Object>} Services that are followers.
   */
  getFollowers() {
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
    this.logger.info('RaftRoleTracker shutdown');
  }
}

export {
  RaftRoleTracker,
  RaftRole,
};
