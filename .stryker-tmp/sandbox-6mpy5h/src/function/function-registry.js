/**
 * Function Registry - Plugin registry for function executors.
 * External projects (e.g., WASM) register their executors here.
 * Requirements: 34.10, 34.11, 34.12, 34.13
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
import { LoggingService } from '../logging/logging-service.js';
import { TABLES } from '../constants/index.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { createSystemMetadataGatewayRequiredError } from '../control-plane/system-metadata-access-error.js';
import { FUNCTION_ERROR_MSG, FUNCTION_LOG_MSG, FUNCTION_SUBSYSTEM, FUNCTION_DEFAULT_VALUE, TYPEOF } from './function-constants.js';

/**
 * FunctionRegistry provides a plugin architecture for registering
 * function executors by type (e.g., 'wasm', 'javascript').
 */
class FunctionRegistry {
  /**
   * Create a new FunctionRegistry.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - System table cache for function lookup.
   * @param {Object} options.cdcIntegrationService - CDC service for writes.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("79741")) {
      {}
    } else {
      stryCov_9fa48("79741");
      this.systemTableCache = stryMutAct_9fa48("79744") ? options.systemTableCache && null : stryMutAct_9fa48("79743") ? false : stryMutAct_9fa48("79742") ? true : (stryCov_9fa48("79742", "79743", "79744"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("79747") ? options.cdcIntegrationService && null : stryMutAct_9fa48("79746") ? false : stryMutAct_9fa48("79745") ? true : (stryCov_9fa48("79745", "79746", "79747"), options.cdcIntegrationService || null);
      this.sqlQueryEngine = stryMutAct_9fa48("79750") ? options.sqlQueryEngine && null : stryMutAct_9fa48("79749") ? false : stryMutAct_9fa48("79748") ? true : (stryCov_9fa48("79748", "79749", "79750"), options.sqlQueryEngine || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("79753") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("79752") ? false : stryMutAct_9fa48("79751") ? true : (stryCov_9fa48("79751", "79752", "79753"), options.controlPlaneSystemTableGateway || null);
      this.executors = new Map(); // executorType → executor
      this.logger = this.initLogger();
      this.initialized = stryMutAct_9fa48("79754") ? true : (stryCov_9fa48("79754"), false);
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("79755")) {
      {}
    } else {
      stryCov_9fa48("79755");
      try {
        if (stryMutAct_9fa48("79756")) {
          {}
        } else {
          stryCov_9fa48("79756");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("79758") ? false : stryMutAct_9fa48("79757") ? true : (stryCov_9fa48("79757", "79758"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("79759")) {
              {}
            } else {
              stryCov_9fa48("79759");
              return loggingService.forSubsystem(FUNCTION_SUBSYSTEM.REGISTRY);
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
   * Initialize the function registry.
   * @param {Object} options - Initialization options.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("79760")) {
      {}
    } else {
      stryCov_9fa48("79760");
      if (stryMutAct_9fa48("79762") ? false : stryMutAct_9fa48("79761") ? true : (stryCov_9fa48("79761", "79762"), options.systemTableCache)) {
        if (stryMutAct_9fa48("79763")) {
          {}
        } else {
          stryCov_9fa48("79763");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("79765") ? false : stryMutAct_9fa48("79764") ? true : (stryCov_9fa48("79764", "79765"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("79766")) {
          {}
        } else {
          stryCov_9fa48("79766");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("79768") ? false : stryMutAct_9fa48("79767") ? true : (stryCov_9fa48("79767", "79768"), options.sqlQueryEngine)) {
        if (stryMutAct_9fa48("79769")) {
          {}
        } else {
          stryCov_9fa48("79769");
          this.sqlQueryEngine = options.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("79771") ? false : stryMutAct_9fa48("79770") ? true : (stryCov_9fa48("79770", "79771"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("79772")) {
          {}
        } else {
          stryCov_9fa48("79772");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      this.initialized = stryMutAct_9fa48("79773") ? false : (stryCov_9fa48("79773"), true);
      this.logger.info(FUNCTION_LOG_MSG.REGISTRY_INITIALIZED, stryMutAct_9fa48("79774") ? {} : (stryCov_9fa48("79774"), {
        registeredExecutors: this.getRegisteredExecutorTypes()
      }));
    }
  }

  /**
   * Register a function executor for a given type.
   * @param {string} executorType - Type identifier (e.g., 'wasm', 'javascript').
   * @param {Object} executor - Executor with execute(func, context, args) method.
   * @throws {Error} If executor is invalid.
   */
  registerExecutor(executorType, executor) {
    if (stryMutAct_9fa48("79775")) {
      {}
    } else {
      stryCov_9fa48("79775");
      if (stryMutAct_9fa48("79778") ? !executorType && typeof executorType !== TYPEOF.STRING : stryMutAct_9fa48("79777") ? false : stryMutAct_9fa48("79776") ? true : (stryCov_9fa48("79776", "79777", "79778"), (stryMutAct_9fa48("79779") ? executorType : (stryCov_9fa48("79779"), !executorType)) || (stryMutAct_9fa48("79781") ? typeof executorType === TYPEOF.STRING : stryMutAct_9fa48("79780") ? false : (stryCov_9fa48("79780", "79781"), typeof executorType !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("79782")) {
          {}
        } else {
          stryCov_9fa48("79782");
          throw new Error(FUNCTION_ERROR_MSG.EXECUTOR_TYPE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("79785") ? !executor && typeof executor.execute !== TYPEOF.FUNCTION : stryMutAct_9fa48("79784") ? false : stryMutAct_9fa48("79783") ? true : (stryCov_9fa48("79783", "79784", "79785"), (stryMutAct_9fa48("79786") ? executor : (stryCov_9fa48("79786"), !executor)) || (stryMutAct_9fa48("79788") ? typeof executor.execute === TYPEOF.FUNCTION : stryMutAct_9fa48("79787") ? false : (stryCov_9fa48("79787", "79788"), typeof executor.execute !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("79789")) {
          {}
        } else {
          stryCov_9fa48("79789");
          throw new Error(FUNCTION_ERROR_MSG.EXECUTOR_METHOD_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("79791") ? false : stryMutAct_9fa48("79790") ? true : (stryCov_9fa48("79790", "79791"), this.executors.has(executorType))) {
        if (stryMutAct_9fa48("79792")) {
          {}
        } else {
          stryCov_9fa48("79792");
          this.logger.warn(FUNCTION_LOG_MSG.EXECUTOR_OVERWRITE, stryMutAct_9fa48("79793") ? {} : (stryCov_9fa48("79793"), {
            executorType
          }));
        }
      }
      this.executors.set(executorType, executor);
      this.logger.info(FUNCTION_LOG_MSG.EXECUTOR_REGISTERED, stryMutAct_9fa48("79794") ? {} : (stryCov_9fa48("79794"), {
        executorType,
        executorName: stryMutAct_9fa48("79797") ? executor.name && FUNCTION_DEFAULT_VALUE.EXECUTOR_NAME_FALLBACK : stryMutAct_9fa48("79796") ? false : stryMutAct_9fa48("79795") ? true : (stryCov_9fa48("79795", "79796", "79797"), executor.name || FUNCTION_DEFAULT_VALUE.EXECUTOR_NAME_FALLBACK)
      }));
    }
  }

  /**
   * Unregister a function executor.
   * @param {string} executorType - Type identifier to unregister.
   * @return {boolean} True if executor was removed.
   */
  unregisterExecutor(executorType) {
    if (stryMutAct_9fa48("79798")) {
      {}
    } else {
      stryCov_9fa48("79798");
      const existed = this.executors.has(executorType);
      this.executors.delete(executorType);
      if (stryMutAct_9fa48("79800") ? false : stryMutAct_9fa48("79799") ? true : (stryCov_9fa48("79799", "79800"), existed)) {
        if (stryMutAct_9fa48("79801")) {
          {}
        } else {
          stryCov_9fa48("79801");
          this.logger.info(FUNCTION_LOG_MSG.EXECUTOR_UNREGISTERED, stryMutAct_9fa48("79802") ? {} : (stryCov_9fa48("79802"), {
            executorType
          }));
        }
      }
      return existed;
    }
  }

  /**
   * Invoke a function by ID.
   * @param {string} functionId - ID of function to invoke.
   * @param {Object} context - Execution context.
   * @param {Object} args - Arguments to pass to function.
   * @return {Promise<*>} Function result.
   */
  async invoke(functionId, context = {}, args = {}) {
    if (stryMutAct_9fa48("79803")) {
      {}
    } else {
      stryCov_9fa48("79803");
      // Look up function definition from code table
      const func = await this.getFunction(functionId);
      if (stryMutAct_9fa48("79806") ? false : stryMutAct_9fa48("79805") ? true : stryMutAct_9fa48("79804") ? func : (stryCov_9fa48("79804", "79805", "79806"), !func)) {
        if (stryMutAct_9fa48("79807")) {
          {}
        } else {
          stryCov_9fa48("79807");
          throw new Error(stryMutAct_9fa48("79808") ? `` : (stryCov_9fa48("79808"), `${FUNCTION_ERROR_MSG.FUNCTION_NOT_FOUND_PREFIX}${functionId}`));
        }
      }

      // Get executor for this function type
      const executor = this.executors.get(func.executor_type);
      if (stryMutAct_9fa48("79811") ? false : stryMutAct_9fa48("79810") ? true : stryMutAct_9fa48("79809") ? executor : (stryCov_9fa48("79809", "79810", "79811"), !executor)) {
        if (stryMutAct_9fa48("79812")) {
          {}
        } else {
          stryCov_9fa48("79812");
          const availableTypes = this.getRegisteredExecutorTypes();
          const availableStr = (stryMutAct_9fa48("79816") ? availableTypes.length <= 0 : stryMutAct_9fa48("79815") ? availableTypes.length >= 0 : stryMutAct_9fa48("79814") ? false : stryMutAct_9fa48("79813") ? true : (stryCov_9fa48("79813", "79814", "79815", "79816"), availableTypes.length > 0)) ? availableTypes.join(stryMutAct_9fa48("79817") ? "" : (stryCov_9fa48("79817"), ', ')) : FUNCTION_ERROR_MSG.EXECUTOR_AVAILABLE_NONE;
          throw new Error((stryMutAct_9fa48("79818") ? `` : (stryCov_9fa48("79818"), `${FUNCTION_ERROR_MSG.EXECUTOR_NOT_FOUND_PREFIX}`)) + (stryMutAct_9fa48("79819") ? `` : (stryCov_9fa48("79819"), `'${func.executor_type}'`)) + (stryMutAct_9fa48("79820") ? `` : (stryCov_9fa48("79820"), `${FUNCTION_ERROR_MSG.EXECUTOR_NOT_FOUND_SUFFIX} `)) + (stryMutAct_9fa48("79821") ? `` : (stryCov_9fa48("79821"), `${FUNCTION_ERROR_MSG.EXECUTOR_AVAILABLE_PREFIX}${availableStr}`)));
        }
      }
      this.logger.debug(FUNCTION_LOG_MSG.INVOKING_FUNCTION, stryMutAct_9fa48("79822") ? {} : (stryCov_9fa48("79822"), {
        functionId,
        functionName: func.function_name,
        executorType: func.executor_type
      }));

      // Execute the function
      const result = await executor.execute(func, context, args);
      this.logger.debug(FUNCTION_LOG_MSG.FUNCTION_COMPLETED, stryMutAct_9fa48("79823") ? {} : (stryCov_9fa48("79823"), {
        functionId,
        hasResult: stryMutAct_9fa48("79826") ? result === undefined : stryMutAct_9fa48("79825") ? false : stryMutAct_9fa48("79824") ? true : (stryCov_9fa48("79824", "79825", "79826"), result !== undefined)
      }));
      return result;
    }
  }

  /**
   * Invoke a function by name (convenience method).
   * @param {string} functionName - Name of function to invoke.
   * @param {Object} context - Execution context.
   * @param {Object} args - Arguments to pass to function.
   * @return {Promise<*>} Function result.
   */
  async invokeByName(functionName, context = {}, args = {}) {
    if (stryMutAct_9fa48("79827")) {
      {}
    } else {
      stryCov_9fa48("79827");
      const func = await this.getFunctionByName(functionName);
      if (stryMutAct_9fa48("79830") ? false : stryMutAct_9fa48("79829") ? true : stryMutAct_9fa48("79828") ? func : (stryCov_9fa48("79828", "79829", "79830"), !func)) {
        if (stryMutAct_9fa48("79831")) {
          {}
        } else {
          stryCov_9fa48("79831");
          throw new Error(stryMutAct_9fa48("79832") ? `` : (stryCov_9fa48("79832"), `${FUNCTION_ERROR_MSG.FUNCTION_NOT_FOUND_PREFIX}${functionName}`));
        }
      }
      return this.invoke(func.function_id, context, args);
    }
  }

  /**
   * Get a function by ID from the code table.
   * @param {string} functionId - Function ID.
   * @return {Promise<Object|null>} Function definition or null.
   */
  async getFunction(functionId) {
    if (stryMutAct_9fa48("79833")) {
      {}
    } else {
      stryCov_9fa48("79833");
      const gateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("79836") ? false : stryMutAct_9fa48("79835") ? true : stryMutAct_9fa48("79834") ? gateway : (stryCov_9fa48("79834", "79835", "79836"), !gateway)) {
        if (stryMutAct_9fa48("79837")) {
          {}
        } else {
          stryCov_9fa48("79837");
          throw createSystemMetadataGatewayRequiredError(stryMutAct_9fa48("79838") ? {} : (stryCov_9fa48("79838"), {
            serviceName: stryMutAct_9fa48("79839") ? "" : (stryCov_9fa48("79839"), 'FunctionRegistry'),
            tableName: TABLES.CODE,
            operation: stryMutAct_9fa48("79840") ? "" : (stryCov_9fa48("79840"), 'read')
          }));
        }
      }
      const result = await gateway.readRows(TABLES.CODE, stryMutAct_9fa48("79841") ? "" : (stryCov_9fa48("79841"), 'SELECT * FROM code WHERE code_id = ? OR function_id = ? LIMIT 1'), stryMutAct_9fa48("79842") ? [] : (stryCov_9fa48("79842"), [functionId, functionId]), stryMutAct_9fa48("79843") ? {} : (stryCov_9fa48("79843"), {
        coalescingKey: stryMutAct_9fa48("79844") ? `` : (stryCov_9fa48("79844"), `function:${functionId}`)
      }));
      return stryMutAct_9fa48("79847") ? result.rows?.[0] && null : stryMutAct_9fa48("79846") ? false : stryMutAct_9fa48("79845") ? true : (stryCov_9fa48("79845", "79846", "79847"), (stryMutAct_9fa48("79848") ? result.rows[0] : (stryCov_9fa48("79848"), result.rows?.[0])) || null);
    }
  }

  /**
   * Get a function by name from the code table.
   * @param {string} functionName - Function name.
   * @return {Promise<Object|null>} Function definition or null.
   */
  async getFunctionByName(functionName) {
    if (stryMutAct_9fa48("79849")) {
      {}
    } else {
      stryCov_9fa48("79849");
      const gateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("79852") ? false : stryMutAct_9fa48("79851") ? true : stryMutAct_9fa48("79850") ? gateway : (stryCov_9fa48("79850", "79851", "79852"), !gateway)) {
        if (stryMutAct_9fa48("79853")) {
          {}
        } else {
          stryCov_9fa48("79853");
          throw createSystemMetadataGatewayRequiredError(stryMutAct_9fa48("79854") ? {} : (stryCov_9fa48("79854"), {
            serviceName: stryMutAct_9fa48("79855") ? "" : (stryCov_9fa48("79855"), 'FunctionRegistry'),
            tableName: TABLES.CODE,
            operation: stryMutAct_9fa48("79856") ? "" : (stryCov_9fa48("79856"), 'read')
          }));
        }
      }
      const result = await gateway.readRows(TABLES.CODE, stryMutAct_9fa48("79857") ? "" : (stryCov_9fa48("79857"), 'SELECT * FROM code WHERE function_name = ?'), stryMutAct_9fa48("79858") ? [] : (stryCov_9fa48("79858"), [functionName]), stryMutAct_9fa48("79859") ? {} : (stryCov_9fa48("79859"), {
        coalescingKey: stryMutAct_9fa48("79860") ? `` : (stryCov_9fa48("79860"), `function-name:${functionName}`)
      }));
      return stryMutAct_9fa48("79863") ? result.rows?.[0] && null : stryMutAct_9fa48("79862") ? false : stryMutAct_9fa48("79861") ? true : (stryCov_9fa48("79861", "79862", "79863"), (stryMutAct_9fa48("79864") ? result.rows[0] : (stryCov_9fa48("79864"), result.rows?.[0])) || null);
    }
  }

  /**
   * List all registered executor types.
   * @return {Array<string>} Array of executor type names.
   */
  getRegisteredExecutorTypes() {
    if (stryMutAct_9fa48("79865")) {
      {}
    } else {
      stryCov_9fa48("79865");
      return Array.from(this.executors.keys());
    }
  }

  /**
   * Check if an executor is registered for a type.
   * @param {string} executorType - Executor type to check.
   * @return {boolean} True if registered.
   */
  hasExecutor(executorType) {
    if (stryMutAct_9fa48("79866")) {
      {}
    } else {
      stryCov_9fa48("79866");
      return this.executors.has(executorType);
    }
  }

  /**
   * Get the count of registered executors.
   * @return {number} Number of registered executors.
   */
  getExecutorCount() {
    if (stryMutAct_9fa48("79867")) {
      {}
    } else {
      stryCov_9fa48("79867");
      return this.executors.size;
    }
  }

  /**
   * Check if registry is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("79868")) {
      {}
    } else {
      stryCov_9fa48("79868");
      return this.initialized;
    }
  }

  /**
   * @return {ControlPlaneSystemTableGateway|null}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("79869")) {
      {}
    } else {
      stryCov_9fa48("79869");
      if (stryMutAct_9fa48("79871") ? false : stryMutAct_9fa48("79870") ? true : (stryCov_9fa48("79870", "79871"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("79872")) {
          {}
        } else {
          stryCov_9fa48("79872");
          return this.controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("79875") ? !this.sqlQueryEngine && !this.cdcIntegrationService || !this.systemTableCache : stryMutAct_9fa48("79874") ? false : stryMutAct_9fa48("79873") ? true : (stryCov_9fa48("79873", "79874", "79875"), (stryMutAct_9fa48("79877") ? !this.sqlQueryEngine || !this.cdcIntegrationService : stryMutAct_9fa48("79876") ? true : (stryCov_9fa48("79876", "79877"), (stryMutAct_9fa48("79878") ? this.sqlQueryEngine : (stryCov_9fa48("79878"), !this.sqlQueryEngine)) && (stryMutAct_9fa48("79879") ? this.cdcIntegrationService : (stryCov_9fa48("79879"), !this.cdcIntegrationService)))) && (stryMutAct_9fa48("79880") ? this.systemTableCache : (stryCov_9fa48("79880"), !this.systemTableCache)))) {
        if (stryMutAct_9fa48("79881")) {
          {}
        } else {
          stryCov_9fa48("79881");
          return null;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("79882") ? {} : (stryCov_9fa48("79882"), {
        getSqlQueryEngine: stryMutAct_9fa48("79883") ? () => undefined : (stryCov_9fa48("79883"), () => this.sqlQueryEngine),
        getCdcIntegrationService: stryMutAct_9fa48("79884") ? () => undefined : (stryCov_9fa48("79884"), () => this.cdcIntegrationService),
        getSystemTableCache: stryMutAct_9fa48("79885") ? () => undefined : (stryCov_9fa48("79885"), () => this.systemTableCache)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }
}
export { FunctionRegistry };