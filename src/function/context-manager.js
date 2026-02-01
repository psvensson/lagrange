/**
 * Context Manager - Manages function state storage via contexts table.
 * All writes go through CDC for cluster-wide consistency.
 * Requirements: 34.1, 34.3, 34.17
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {TABLES} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  FUNCTION_CONTEXT_TYPE,
  FUNCTION_ERROR_MSG,
  FUNCTION_LOG_MSG,
  FUNCTION_SUBSYSTEM,
} from './function-constants.js';

/**
 * Valid context types.
 */
const ContextType = FUNCTION_CONTEXT_TYPE;

/**
 * ContextManager provides state storage for external function executors.
 * All writes go through CDC to maintain cluster-wide consistency.
 */
class ContextManager {
  /**
   * Create a new ContextManager.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - System table cache for reads.
   * @param {Object} options.cdcIntegrationService - CDC service for writes.
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.logger = this.initLogger();
    this.initialized = false;
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(FUNCTION_SUBSYSTEM.CONTEXT_MANAGER);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Initialize the context manager.
   * @param {Object} options - Initialization options.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   */
  initialize(options = {}) {
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }

    this.initialized = true;

    this.logger.info(FUNCTION_LOG_MSG.CONTEXT_MANAGER_INITIALIZED);
  }

  /**
   * Validate context type.
   * @param {string} contextType - Context type to validate.
   * @throws {Error} If context type is invalid.
   * @private
   */
  validateContextType(contextType) {
    const validTypes = Object.values(ContextType);
    if (!validTypes.includes(contextType)) {
      throw new Error(
        `${FUNCTION_ERROR_MSG.INVALID_CONTEXT_TYPE_PREFIX}${contextType}. ` +
        `${FUNCTION_ERROR_MSG.VALID_CONTEXT_TYPE_PREFIX}${validTypes.join(', ')}`,
      );
    }
  }

  /**
   * Get a context by type and name.
   * @param {string} contextType - Type of context ('function', 'service', 'user').
   * @param {string} contextName - Name of the context.
   * @return {Object|null} Context data or null if not found.
   */
  getContext(contextType, contextName) {
    this.validateContextType(contextType);

    const systemTableCache = assertCritical(
      this.systemTableCache,
      FUNCTION_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    try {
      const contexts = systemTableCache.filter(TABLES.CONTEXTS, (c) =>
        c.context_type === contextType && c.context_name === contextName,
      );

      if (contexts.length === 0) {
        return null;
      }

      const context = contexts[0];
      return {
        contextId: context.context_id,
        contextType: context.context_type,
        contextName: context.context_name,
        data: JSON.parse(context.context_data),
        ownerId: context.owner_id,
        createdAt: context.created_at,
        updatedAt: context.updated_at,
      };
    } catch (error) {
      this.logger.error(FUNCTION_LOG_MSG.CONTEXT_LOOKUP_FAILED, {
        contextType,
        contextName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Set a context (creates or updates).
   * Goes through CDC for cluster-wide consistency.
   * @param {string} contextType - Type of context.
   * @param {string} contextName - Name of the context.
   * @param {Object} contextData - Data to store (will be JSON serialized).
   * @param {string} ownerId - Optional owner ID (function_id, service_id, etc.).
   * @return {Promise<Object>} Result with context_id.
   */
  async setContext(contextType, contextName, contextData, ownerId = null) {
    this.validateContextType(contextType);

    if (!this.cdcIntegrationService) {
      throw new Error(FUNCTION_ERROR_MSG.CDC_INTEGRATION_REQUIRED);
    }

    const systemTableCache = assertCritical(
      this.systemTableCache,
      FUNCTION_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    const now = Date.now();

    // Check if context already exists
    const existing = systemTableCache.find(TABLES.CONTEXTS, (c) =>
      c.context_type === contextType && c.context_name === contextName,
    );

    const contextId = existing?.context_id || uuidv4();

    if (existing) {
      // Update existing context
      await this.cdcIntegrationService.updateSystemTableRow(
        TABLES.CONTEXTS,
        {context_id: contextId},
        {
          context_data: JSON.stringify(contextData),
          owner_id: ownerId,
          updated_at: now,
        },
      );

      this.logger.info(FUNCTION_LOG_MSG.CONTEXT_UPDATED, {
        contextId,
        contextType,
        contextName,
        ownerId,
      });
    } else {
      // Insert new context
      await this.cdcIntegrationService.insertSystemTableRow(TABLES.CONTEXTS, {
        context_id: contextId,
        id: contextId, // For cache compatibility
        context_type: contextType,
        context_name: contextName,
        context_data: JSON.stringify(contextData),
        owner_id: ownerId,
        created_at: now,
        updated_at: now,
      });

      this.logger.info(FUNCTION_LOG_MSG.CONTEXT_CREATED, {
        contextId,
        contextType,
        contextName,
        ownerId,
      });
    }

    return {
      contextId,
      contextType,
      contextName,
      isNew: !existing,
    };
  }

  /**
   * Delete a context.
   * @param {string} contextType - Type of context.
   * @param {string} contextName - Name of the context.
   * @return {Promise<boolean>} True if deleted, false if not found.
   */
  async deleteContext(contextType, contextName) {
    this.validateContextType(contextType);

    if (!this.cdcIntegrationService) {
      throw new Error(FUNCTION_ERROR_MSG.CDC_INTEGRATION_REQUIRED);
    }

    const systemTableCache = assertCritical(
      this.systemTableCache,
      FUNCTION_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    const existing = systemTableCache.find(TABLES.CONTEXTS, (c) =>
      c.context_type === contextType && c.context_name === contextName,
    );

    if (!existing) {
      this.logger.debug(FUNCTION_LOG_MSG.CONTEXT_DELETE_NOT_FOUND, {
        contextType,
        contextName,
      });
      return false;
    }

    await this.cdcIntegrationService.deleteSystemTableRow(TABLES.CONTEXTS, {
      context_id: existing.context_id,
    });

    this.logger.info(FUNCTION_LOG_MSG.CONTEXT_DELETED, {
      contextId: existing.context_id,
      contextType,
      contextName,
    });

    return true;
  }

  /**
   * List all contexts for an owner.
   * @param {string} ownerId - Owner ID to filter by.
   * @return {Array} List of contexts.
   */
  getContextsByOwner(ownerId) {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      FUNCTION_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    try {
      const contexts = systemTableCache.filter(TABLES.CONTEXTS, (c) =>
        c.owner_id === ownerId,
      );

      return contexts.map((c) => ({
        contextId: c.context_id,
        contextType: c.context_type,
        contextName: c.context_name,
        data: JSON.parse(c.context_data),
        ownerId: c.owner_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));
    } catch (error) {
      this.logger.error(FUNCTION_LOG_MSG.CONTEXTS_BY_OWNER_FAILED, {
        ownerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all contexts of a specific type.
   * @param {string} contextType - Context type to filter by.
   * @return {Array} List of contexts.
   */
  getContextsByType(contextType) {
    this.validateContextType(contextType);

    const systemTableCache = assertCritical(
      this.systemTableCache,
      FUNCTION_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    try {
      const contexts = systemTableCache.filter(TABLES.CONTEXTS, (c) =>
        c.context_type === contextType,
      );

      return contexts.map((c) => ({
        contextId: c.context_id,
        contextType: c.context_type,
        contextName: c.context_name,
        data: JSON.parse(c.context_data),
        ownerId: c.owner_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));
    } catch (error) {
      this.logger.error(FUNCTION_LOG_MSG.CONTEXTS_BY_TYPE_FAILED, {
        contextType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }
}

export {ContextManager, ContextType};
