/**
 * Context Manager - Manages function state storage via contexts table.
 * All writes go through CDC for cluster-wide consistency.
 * Requirements: 34.1, 34.3, 34.17
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
import { LoggingService } from '../logging/logging-service.js';
import { TABLES } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { FUNCTION_CONTEXT_TYPE, FUNCTION_ERROR_MSG, FUNCTION_LOG_MSG, FUNCTION_SUBSYSTEM } from './function-constants.js';

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
    if (stryMutAct_9fa48("79312")) {
      {}
    } else {
      stryCov_9fa48("79312");
      this.systemTableCache = stryMutAct_9fa48("79315") ? options.systemTableCache && null : stryMutAct_9fa48("79314") ? false : stryMutAct_9fa48("79313") ? true : (stryCov_9fa48("79313", "79314", "79315"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("79318") ? options.cdcIntegrationService && null : stryMutAct_9fa48("79317") ? false : stryMutAct_9fa48("79316") ? true : (stryCov_9fa48("79316", "79317", "79318"), options.cdcIntegrationService || null);
      this.sqlQueryEngine = stryMutAct_9fa48("79321") ? options.sqlQueryEngine && null : stryMutAct_9fa48("79320") ? false : stryMutAct_9fa48("79319") ? true : (stryCov_9fa48("79319", "79320", "79321"), options.sqlQueryEngine || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("79324") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("79323") ? false : stryMutAct_9fa48("79322") ? true : (stryCov_9fa48("79322", "79323", "79324"), options.controlPlaneSystemTableGateway || null);
      this.logger = this.initLogger();
      this.initialized = stryMutAct_9fa48("79325") ? true : (stryCov_9fa48("79325"), false);
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("79326")) {
      {}
    } else {
      stryCov_9fa48("79326");
      try {
        if (stryMutAct_9fa48("79327")) {
          {}
        } else {
          stryCov_9fa48("79327");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("79329") ? false : stryMutAct_9fa48("79328") ? true : (stryCov_9fa48("79328", "79329"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("79330")) {
              {}
            } else {
              stryCov_9fa48("79330");
              return loggingService.forSubsystem(FUNCTION_SUBSYSTEM.CONTEXT_MANAGER);
            }
          }
        }
      } catch {
        // Logging not available
      }
      return console;
    }
  }

  /**
   * Initialize the context manager.
   * @param {Object} options - Initialization options.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("79331")) {
      {}
    } else {
      stryCov_9fa48("79331");
      if (stryMutAct_9fa48("79333") ? false : stryMutAct_9fa48("79332") ? true : (stryCov_9fa48("79332", "79333"), options.systemTableCache)) {
        if (stryMutAct_9fa48("79334")) {
          {}
        } else {
          stryCov_9fa48("79334");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("79336") ? false : stryMutAct_9fa48("79335") ? true : (stryCov_9fa48("79335", "79336"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("79337")) {
          {}
        } else {
          stryCov_9fa48("79337");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("79339") ? false : stryMutAct_9fa48("79338") ? true : (stryCov_9fa48("79338", "79339"), options.sqlQueryEngine)) {
        if (stryMutAct_9fa48("79340")) {
          {}
        } else {
          stryCov_9fa48("79340");
          this.sqlQueryEngine = options.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("79342") ? false : stryMutAct_9fa48("79341") ? true : (stryCov_9fa48("79341", "79342"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("79343")) {
          {}
        } else {
          stryCov_9fa48("79343");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      this.initialized = stryMutAct_9fa48("79344") ? false : (stryCov_9fa48("79344"), true);
      this.logger.info(FUNCTION_LOG_MSG.CONTEXT_MANAGER_INITIALIZED);
    }
  }

  /**
   * Validate context type.
   * @param {string} contextType - Context type to validate.
   * @throws {Error} If context type is invalid.
   * @private
   */
  validateContextType(contextType) {
    if (stryMutAct_9fa48("79345")) {
      {}
    } else {
      stryCov_9fa48("79345");
      const validTypes = Object.values(ContextType);
      if (stryMutAct_9fa48("79348") ? false : stryMutAct_9fa48("79347") ? true : stryMutAct_9fa48("79346") ? validTypes.includes(contextType) : (stryCov_9fa48("79346", "79347", "79348"), !validTypes.includes(contextType))) {
        if (stryMutAct_9fa48("79349")) {
          {}
        } else {
          stryCov_9fa48("79349");
          throw new Error((stryMutAct_9fa48("79350") ? `` : (stryCov_9fa48("79350"), `${FUNCTION_ERROR_MSG.INVALID_CONTEXT_TYPE_PREFIX}${contextType}. `)) + (stryMutAct_9fa48("79351") ? `` : (stryCov_9fa48("79351"), `${FUNCTION_ERROR_MSG.VALID_CONTEXT_TYPE_PREFIX}${validTypes.join(stryMutAct_9fa48("79352") ? "" : (stryCov_9fa48("79352"), ', '))}`)));
        }
      }
    }
  }

  /**
   * Get a context by type and name.
   * @param {string} contextType - Type of context ('function', 'service', 'user').
   * @param {string} contextName - Name of the context.
   * @return {Promise<Object|null>} Context data or null if not found.
   */
  async getContext(contextType, contextName) {
    if (stryMutAct_9fa48("79353")) {
      {}
    } else {
      stryCov_9fa48("79353");
      this.validateContextType(contextType);
      try {
        if (stryMutAct_9fa48("79354")) {
          {}
        } else {
          stryCov_9fa48("79354");
          let contexts = stryMutAct_9fa48("79355") ? ["Stryker was here"] : (stryCov_9fa48("79355"), []);
          if (stryMutAct_9fa48("79357") ? false : stryMutAct_9fa48("79356") ? true : (stryCov_9fa48("79356", "79357"), this.canReadContexts())) {
            if (stryMutAct_9fa48("79358")) {
              {}
            } else {
              stryCov_9fa48("79358");
              const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.CONTEXTS, (stryMutAct_9fa48("79359") ? "" : (stryCov_9fa48("79359"), 'SELECT * FROM contexts WHERE context_type = ?')) + (stryMutAct_9fa48("79360") ? "" : (stryCov_9fa48("79360"), ' AND context_name = ?')), stryMutAct_9fa48("79361") ? [] : (stryCov_9fa48("79361"), [contextType, contextName]));
              contexts = stryMutAct_9fa48("79364") ? result.rows && [] : stryMutAct_9fa48("79363") ? false : stryMutAct_9fa48("79362") ? true : (stryCov_9fa48("79362", "79363", "79364"), result.rows || (stryMutAct_9fa48("79365") ? ["Stryker was here"] : (stryCov_9fa48("79365"), [])));
            }
          }
          if (stryMutAct_9fa48("79368") ? contexts.length !== 0 : stryMutAct_9fa48("79367") ? false : stryMutAct_9fa48("79366") ? true : (stryCov_9fa48("79366", "79367", "79368"), contexts.length === 0)) {
            if (stryMutAct_9fa48("79369")) {
              {}
            } else {
              stryCov_9fa48("79369");
              return null;
            }
          }
          const context = contexts[0];
          return stryMutAct_9fa48("79370") ? {} : (stryCov_9fa48("79370"), {
            contextId: context.context_id,
            contextType: context.context_type,
            contextName: context.context_name,
            data: JSON.parse(context.context_data),
            ownerId: context.owner_id,
            createdAt: context.created_at,
            updatedAt: context.updated_at
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("79371")) {
          {}
        } else {
          stryCov_9fa48("79371");
          this.logger.error(FUNCTION_LOG_MSG.CONTEXT_LOOKUP_FAILED, stryMutAct_9fa48("79372") ? {} : (stryCov_9fa48("79372"), {
            contextType,
            contextName,
            error: error.message
          }));
          throw error;
        }
      }
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
    if (stryMutAct_9fa48("79373")) {
      {}
    } else {
      stryCov_9fa48("79373");
      this.validateContextType(contextType);
      if (stryMutAct_9fa48("79376") ? !this.cdcIntegrationService || !this.controlPlaneSystemTableGateway : stryMutAct_9fa48("79375") ? false : stryMutAct_9fa48("79374") ? true : (stryCov_9fa48("79374", "79375", "79376"), (stryMutAct_9fa48("79377") ? this.cdcIntegrationService : (stryCov_9fa48("79377"), !this.cdcIntegrationService)) && (stryMutAct_9fa48("79378") ? this.controlPlaneSystemTableGateway : (stryCov_9fa48("79378"), !this.controlPlaneSystemTableGateway)))) {
        if (stryMutAct_9fa48("79379")) {
          {}
        } else {
          stryCov_9fa48("79379");
          throw new Error(FUNCTION_ERROR_MSG.CDC_INTEGRATION_REQUIRED);
        }
      }
      const now = Date.now();

      // Check if context already exists
      let existing = null;
      if (stryMutAct_9fa48("79381") ? false : stryMutAct_9fa48("79380") ? true : (stryCov_9fa48("79380", "79381"), this.canReadContexts())) {
        if (stryMutAct_9fa48("79382")) {
          {}
        } else {
          stryCov_9fa48("79382");
          const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.CONTEXTS, (stryMutAct_9fa48("79383") ? "" : (stryCov_9fa48("79383"), 'SELECT * FROM contexts WHERE context_type = ?')) + (stryMutAct_9fa48("79384") ? "" : (stryCov_9fa48("79384"), ' AND context_name = ?')), stryMutAct_9fa48("79385") ? [] : (stryCov_9fa48("79385"), [contextType, contextName]));
          existing = stryMutAct_9fa48("79388") ? result.rows?.[0] && null : stryMutAct_9fa48("79387") ? false : stryMutAct_9fa48("79386") ? true : (stryCov_9fa48("79386", "79387", "79388"), (stryMutAct_9fa48("79389") ? result.rows[0] : (stryCov_9fa48("79389"), result.rows?.[0])) || null);
        }
      }
      const contextId = stryMutAct_9fa48("79392") ? existing?.context_id && uuidv4() : stryMutAct_9fa48("79391") ? false : stryMutAct_9fa48("79390") ? true : (stryCov_9fa48("79390", "79391", "79392"), (stryMutAct_9fa48("79393") ? existing.context_id : (stryCov_9fa48("79393"), existing?.context_id)) || uuidv4());
      if (stryMutAct_9fa48("79395") ? false : stryMutAct_9fa48("79394") ? true : (stryCov_9fa48("79394", "79395"), existing)) {
        if (stryMutAct_9fa48("79396")) {
          {}
        } else {
          stryCov_9fa48("79396");
          // Update existing context
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("79397") ? {} : (stryCov_9fa48("79397"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: TABLES.CONTEXTS,
            whereClause: stryMutAct_9fa48("79398") ? {} : (stryCov_9fa48("79398"), {
              context_id: contextId
            }),
            data: stryMutAct_9fa48("79399") ? {} : (stryCov_9fa48("79399"), {
              context_data: JSON.stringify(contextData),
              owner_id: ownerId,
              updated_at: now
            })
          }), stryMutAct_9fa48("79400") ? {} : (stryCov_9fa48("79400"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("79401") ? "" : (stryCov_9fa48("79401"), 'critical')
          }));
          this.logger.info(FUNCTION_LOG_MSG.CONTEXT_UPDATED, stryMutAct_9fa48("79402") ? {} : (stryCov_9fa48("79402"), {
            contextId,
            contextType,
            contextName,
            ownerId
          }));
        }
      } else {
        if (stryMutAct_9fa48("79403")) {
          {}
        } else {
          stryCov_9fa48("79403");
          // Insert new context
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("79404") ? {} : (stryCov_9fa48("79404"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
            tableName: TABLES.CONTEXTS,
            row: stryMutAct_9fa48("79405") ? {} : (stryCov_9fa48("79405"), {
              context_id: contextId,
              id: contextId,
              context_type: contextType,
              context_name: contextName,
              context_data: JSON.stringify(contextData),
              owner_id: ownerId,
              created_at: now,
              updated_at: now
            })
          }), stryMutAct_9fa48("79406") ? {} : (stryCov_9fa48("79406"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("79407") ? "" : (stryCov_9fa48("79407"), 'critical')
          }));
          this.logger.info(FUNCTION_LOG_MSG.CONTEXT_CREATED, stryMutAct_9fa48("79408") ? {} : (stryCov_9fa48("79408"), {
            contextId,
            contextType,
            contextName,
            ownerId
          }));
        }
      }
      return stryMutAct_9fa48("79409") ? {} : (stryCov_9fa48("79409"), {
        contextId,
        contextType,
        contextName,
        isNew: stryMutAct_9fa48("79410") ? existing : (stryCov_9fa48("79410"), !existing)
      });
    }
  }

  /**
   * Delete a context.
   * @param {string} contextType - Type of context.
   * @param {string} contextName - Name of the context.
   * @return {Promise<boolean>} True if deleted, false if not found.
   */
  async deleteContext(contextType, contextName) {
    if (stryMutAct_9fa48("79411")) {
      {}
    } else {
      stryCov_9fa48("79411");
      this.validateContextType(contextType);
      if (stryMutAct_9fa48("79414") ? !this.cdcIntegrationService || !this.controlPlaneSystemTableGateway : stryMutAct_9fa48("79413") ? false : stryMutAct_9fa48("79412") ? true : (stryCov_9fa48("79412", "79413", "79414"), (stryMutAct_9fa48("79415") ? this.cdcIntegrationService : (stryCov_9fa48("79415"), !this.cdcIntegrationService)) && (stryMutAct_9fa48("79416") ? this.controlPlaneSystemTableGateway : (stryCov_9fa48("79416"), !this.controlPlaneSystemTableGateway)))) {
        if (stryMutAct_9fa48("79417")) {
          {}
        } else {
          stryCov_9fa48("79417");
          throw new Error(FUNCTION_ERROR_MSG.CDC_INTEGRATION_REQUIRED);
        }
      }
      let existing = null;
      if (stryMutAct_9fa48("79419") ? false : stryMutAct_9fa48("79418") ? true : (stryCov_9fa48("79418", "79419"), this.canReadContexts())) {
        if (stryMutAct_9fa48("79420")) {
          {}
        } else {
          stryCov_9fa48("79420");
          const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.CONTEXTS, (stryMutAct_9fa48("79421") ? "" : (stryCov_9fa48("79421"), 'SELECT * FROM contexts WHERE context_type = ?')) + (stryMutAct_9fa48("79422") ? "" : (stryCov_9fa48("79422"), ' AND context_name = ?')), stryMutAct_9fa48("79423") ? [] : (stryCov_9fa48("79423"), [contextType, contextName]));
          existing = stryMutAct_9fa48("79426") ? result.rows?.[0] && null : stryMutAct_9fa48("79425") ? false : stryMutAct_9fa48("79424") ? true : (stryCov_9fa48("79424", "79425", "79426"), (stryMutAct_9fa48("79427") ? result.rows[0] : (stryCov_9fa48("79427"), result.rows?.[0])) || null);
        }
      }
      if (stryMutAct_9fa48("79430") ? false : stryMutAct_9fa48("79429") ? true : stryMutAct_9fa48("79428") ? existing : (stryCov_9fa48("79428", "79429", "79430"), !existing)) {
        if (stryMutAct_9fa48("79431")) {
          {}
        } else {
          stryCov_9fa48("79431");
          this.logger.debug(FUNCTION_LOG_MSG.CONTEXT_DELETE_NOT_FOUND, stryMutAct_9fa48("79432") ? {} : (stryCov_9fa48("79432"), {
            contextType,
            contextName
          }));
          return stryMutAct_9fa48("79433") ? true : (stryCov_9fa48("79433"), false);
        }
      }
      await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("79434") ? {} : (stryCov_9fa48("79434"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
        tableName: TABLES.CONTEXTS,
        whereClause: stryMutAct_9fa48("79435") ? {} : (stryCov_9fa48("79435"), {
          context_id: existing.context_id
        })
      }), stryMutAct_9fa48("79436") ? {} : (stryCov_9fa48("79436"), {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: stryMutAct_9fa48("79437") ? "" : (stryCov_9fa48("79437"), 'critical')
      }));
      this.logger.info(FUNCTION_LOG_MSG.CONTEXT_DELETED, stryMutAct_9fa48("79438") ? {} : (stryCov_9fa48("79438"), {
        contextId: existing.context_id,
        contextType,
        contextName
      }));
      return stryMutAct_9fa48("79439") ? false : (stryCov_9fa48("79439"), true);
    }
  }

  /**
   * List all contexts for an owner.
   * @param {string} ownerId - Owner ID to filter by.
   * @return {Promise<Array>} List of contexts.
   */
  async getContextsByOwner(ownerId) {
    if (stryMutAct_9fa48("79440")) {
      {}
    } else {
      stryCov_9fa48("79440");
      try {
        if (stryMutAct_9fa48("79441")) {
          {}
        } else {
          stryCov_9fa48("79441");
          let contexts = stryMutAct_9fa48("79442") ? ["Stryker was here"] : (stryCov_9fa48("79442"), []);
          if (stryMutAct_9fa48("79444") ? false : stryMutAct_9fa48("79443") ? true : (stryCov_9fa48("79443", "79444"), this.canReadContexts())) {
            if (stryMutAct_9fa48("79445")) {
              {}
            } else {
              stryCov_9fa48("79445");
              const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.CONTEXTS, stryMutAct_9fa48("79446") ? "" : (stryCov_9fa48("79446"), 'SELECT * FROM contexts WHERE owner_id = ?'), stryMutAct_9fa48("79447") ? [] : (stryCov_9fa48("79447"), [ownerId]));
              contexts = stryMutAct_9fa48("79450") ? result.rows && [] : stryMutAct_9fa48("79449") ? false : stryMutAct_9fa48("79448") ? true : (stryCov_9fa48("79448", "79449", "79450"), result.rows || (stryMutAct_9fa48("79451") ? ["Stryker was here"] : (stryCov_9fa48("79451"), [])));
            }
          }
          return contexts.map(stryMutAct_9fa48("79452") ? () => undefined : (stryCov_9fa48("79452"), c => stryMutAct_9fa48("79453") ? {} : (stryCov_9fa48("79453"), {
            contextId: c.context_id,
            contextType: c.context_type,
            contextName: c.context_name,
            data: JSON.parse(c.context_data),
            ownerId: c.owner_id,
            createdAt: c.created_at,
            updatedAt: c.updated_at
          })));
        }
      } catch (error) {
        if (stryMutAct_9fa48("79454")) {
          {}
        } else {
          stryCov_9fa48("79454");
          this.logger.error(FUNCTION_LOG_MSG.CONTEXTS_BY_OWNER_FAILED, stryMutAct_9fa48("79455") ? {} : (stryCov_9fa48("79455"), {
            ownerId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Get all contexts of a specific type.
   * @param {string} contextType - Context type to filter by.
   * @return {Promise<Array>} List of contexts.
   */
  async getContextsByType(contextType) {
    if (stryMutAct_9fa48("79456")) {
      {}
    } else {
      stryCov_9fa48("79456");
      this.validateContextType(contextType);
      try {
        if (stryMutAct_9fa48("79457")) {
          {}
        } else {
          stryCov_9fa48("79457");
          let contexts = stryMutAct_9fa48("79458") ? ["Stryker was here"] : (stryCov_9fa48("79458"), []);
          if (stryMutAct_9fa48("79460") ? false : stryMutAct_9fa48("79459") ? true : (stryCov_9fa48("79459", "79460"), this.canReadContexts())) {
            if (stryMutAct_9fa48("79461")) {
              {}
            } else {
              stryCov_9fa48("79461");
              const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.CONTEXTS, stryMutAct_9fa48("79462") ? "" : (stryCov_9fa48("79462"), 'SELECT * FROM contexts WHERE context_type = ?'), stryMutAct_9fa48("79463") ? [] : (stryCov_9fa48("79463"), [contextType]));
              contexts = stryMutAct_9fa48("79466") ? result.rows && [] : stryMutAct_9fa48("79465") ? false : stryMutAct_9fa48("79464") ? true : (stryCov_9fa48("79464", "79465", "79466"), result.rows || (stryMutAct_9fa48("79467") ? ["Stryker was here"] : (stryCov_9fa48("79467"), [])));
            }
          }
          return contexts.map(stryMutAct_9fa48("79468") ? () => undefined : (stryCov_9fa48("79468"), c => stryMutAct_9fa48("79469") ? {} : (stryCov_9fa48("79469"), {
            contextId: c.context_id,
            contextType: c.context_type,
            contextName: c.context_name,
            data: JSON.parse(c.context_data),
            ownerId: c.owner_id,
            createdAt: c.created_at,
            updatedAt: c.updated_at
          })));
        }
      } catch (error) {
        if (stryMutAct_9fa48("79470")) {
          {}
        } else {
          stryCov_9fa48("79470");
          this.logger.error(FUNCTION_LOG_MSG.CONTEXTS_BY_TYPE_FAILED, stryMutAct_9fa48("79471") ? {} : (stryCov_9fa48("79471"), {
            contextType,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Check if manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("79472")) {
      {}
    } else {
      stryCov_9fa48("79472");
      return this.initialized;
    }
  }
  canReadContexts() {
    if (stryMutAct_9fa48("79473")) {
      {}
    } else {
      stryCov_9fa48("79473");
      return Boolean(stryMutAct_9fa48("79476") ? (this.controlPlaneSystemTableGateway || this.sqlQueryEngine) && this.cdcIntegrationService : stryMutAct_9fa48("79475") ? false : stryMutAct_9fa48("79474") ? true : (stryCov_9fa48("79474", "79475", "79476"), (stryMutAct_9fa48("79478") ? this.controlPlaneSystemTableGateway && this.sqlQueryEngine : stryMutAct_9fa48("79477") ? false : (stryCov_9fa48("79477", "79478"), this.controlPlaneSystemTableGateway || this.sqlQueryEngine)) || this.cdcIntegrationService));
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("79479")) {
      {}
    } else {
      stryCov_9fa48("79479");
      if (stryMutAct_9fa48("79481") ? false : stryMutAct_9fa48("79480") ? true : (stryCov_9fa48("79480", "79481"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("79482")) {
          {}
        } else {
          stryCov_9fa48("79482");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("79483") ? {} : (stryCov_9fa48("79483"), {
        getCdcIntegrationService: stryMutAct_9fa48("79484") ? () => undefined : (stryCov_9fa48("79484"), () => this.cdcIntegrationService),
        getSqlQueryEngine: stryMutAct_9fa48("79485") ? () => undefined : (stryCov_9fa48("79485"), () => this.sqlQueryEngine),
        getSystemTableCache: stryMutAct_9fa48("79486") ? () => undefined : (stryCov_9fa48("79486"), () => this.systemTableCache)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }
}
export { ContextManager, ContextType };