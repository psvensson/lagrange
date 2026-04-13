/**
 * Function Query Executor - Internal API for programmatic query execution.
 * Used by function executors to run queries on behalf of user functions.
 * Requirements: 34.6, 34.7, 34.8, 34.9
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
import { ConfigurationManager } from '../config/configuration-manager.js';
import { FUNCTION_CONFIG_KEY, FUNCTION_DEFAULT, FUNCTION_ERROR_MSG, FUNCTION_LOG_LIMIT, FUNCTION_LOG_MSG, FUNCTION_SUBSYSTEM, TYPEOF } from './function-constants.js';

/**
 * FunctionQueryExecutor provides programmatic query execution for
 * internal services and future function executors.
 */
class FunctionQueryExecutor {
  /**
   * Create a new FunctionQueryExecutor.
   * @param {Object} options - Configuration options.
   * @param {Object} options.sqlQueryEngine - SQL query engine for execution.
   * @param {Object} options.functionRegistry - Function registry for invocations.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("79598")) {
      {}
    } else {
      stryCov_9fa48("79598");
      this.sqlQueryEngine = stryMutAct_9fa48("79601") ? options.sqlQueryEngine && null : stryMutAct_9fa48("79600") ? false : stryMutAct_9fa48("79599") ? true : (stryCov_9fa48("79599", "79600", "79601"), options.sqlQueryEngine || null);
      this.functionRegistry = stryMutAct_9fa48("79604") ? options.functionRegistry && null : stryMutAct_9fa48("79603") ? false : stryMutAct_9fa48("79602") ? true : (stryCov_9fa48("79602", "79603", "79604"), options.functionRegistry || null);
      this.logger = this.initLogger();

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.defaultTimeoutMs = stryMutAct_9fa48("79607") ? config.get(FUNCTION_CONFIG_KEY.QUERY_TIMEOUT_MS) && FUNCTION_DEFAULT.QUERY_TIMEOUT_MS : stryMutAct_9fa48("79606") ? false : stryMutAct_9fa48("79605") ? true : (stryCov_9fa48("79605", "79606", "79607"), config.get(FUNCTION_CONFIG_KEY.QUERY_TIMEOUT_MS) || FUNCTION_DEFAULT.QUERY_TIMEOUT_MS);
      this.defaultBatchSize = stryMutAct_9fa48("79610") ? config.get(FUNCTION_CONFIG_KEY.QUERY_BATCH_SIZE) && FUNCTION_DEFAULT.QUERY_BATCH_SIZE : stryMutAct_9fa48("79609") ? false : stryMutAct_9fa48("79608") ? true : (stryCov_9fa48("79608", "79609", "79610"), config.get(FUNCTION_CONFIG_KEY.QUERY_BATCH_SIZE) || FUNCTION_DEFAULT.QUERY_BATCH_SIZE);
      this.initialized = stryMutAct_9fa48("79611") ? true : (stryCov_9fa48("79611"), false);
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("79612")) {
      {}
    } else {
      stryCov_9fa48("79612");
      try {
        if (stryMutAct_9fa48("79613")) {
          {}
        } else {
          stryCov_9fa48("79613");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("79615") ? false : stryMutAct_9fa48("79614") ? true : (stryCov_9fa48("79614", "79615"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("79616")) {
              {}
            } else {
              stryCov_9fa48("79616");
              return loggingService.forSubsystem(FUNCTION_SUBSYSTEM.QUERY_EXECUTOR);
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
   * Initialize the query executor.
   * @param {Object} options - Initialization options.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Object} options.functionRegistry - Function registry.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("79617")) {
      {}
    } else {
      stryCov_9fa48("79617");
      if (stryMutAct_9fa48("79619") ? false : stryMutAct_9fa48("79618") ? true : (stryCov_9fa48("79618", "79619"), options.sqlQueryEngine)) {
        if (stryMutAct_9fa48("79620")) {
          {}
        } else {
          stryCov_9fa48("79620");
          this.sqlQueryEngine = options.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("79622") ? false : stryMutAct_9fa48("79621") ? true : (stryCov_9fa48("79621", "79622"), options.functionRegistry)) {
        if (stryMutAct_9fa48("79623")) {
          {}
        } else {
          stryCov_9fa48("79623");
          this.functionRegistry = options.functionRegistry;
        }
      }
      this.initialized = stryMutAct_9fa48("79624") ? false : (stryCov_9fa48("79624"), true);
      this.logger.info(FUNCTION_LOG_MSG.QUERY_EXECUTOR_INITIALIZED);
    }
  }

  /**
   * Execute a query and return results directly.
   * @param {string} sql - SQL statement to execute.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @param {number} options.timeout - Query timeout in milliseconds.
   * @return {Promise<Object>} Query result with rows, affectedRows, partitions.
   */
  async executeQuery(sql, params = stryMutAct_9fa48("79625") ? ["Stryker was here"] : (stryCov_9fa48("79625"), []), options = {}) {
    if (stryMutAct_9fa48("79626")) {
      {}
    } else {
      stryCov_9fa48("79626");
      if (stryMutAct_9fa48("79629") ? false : stryMutAct_9fa48("79628") ? true : stryMutAct_9fa48("79627") ? this.sqlQueryEngine : (stryCov_9fa48("79627", "79628", "79629"), !this.sqlQueryEngine)) {
        if (stryMutAct_9fa48("79630")) {
          {}
        } else {
          stryCov_9fa48("79630");
          throw new Error(FUNCTION_ERROR_MSG.SQL_ENGINE_UNAVAILABLE);
        }
      }
      const timeout = stryMutAct_9fa48("79633") ? options.timeout && this.defaultTimeoutMs : stryMutAct_9fa48("79632") ? false : stryMutAct_9fa48("79631") ? true : (stryCov_9fa48("79631", "79632", "79633"), options.timeout || this.defaultTimeoutMs);
      const startTime = Date.now();
      this.logger.debug(FUNCTION_LOG_MSG.QUERY_EXECUTE_START, stryMutAct_9fa48("79634") ? {} : (stryCov_9fa48("79634"), {
        sql: stryMutAct_9fa48("79635") ? sql : (stryCov_9fa48("79635"), sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH)),
        paramCount: params.length,
        timeout
      }));
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        if (stryMutAct_9fa48("79636")) {
          {}
        } else {
          stryCov_9fa48("79636");
          timeoutId = setTimeout(stryMutAct_9fa48("79637") ? () => undefined : (stryCov_9fa48("79637"), () => reject(new Error((stryMutAct_9fa48("79638") ? `` : (stryCov_9fa48("79638"), `${FUNCTION_ERROR_MSG.QUERY_TIMEOUT_PREFIX}${timeout}`)) + (stryMutAct_9fa48("79639") ? `` : (stryCov_9fa48("79639"), `${FUNCTION_ERROR_MSG.QUERY_TIMEOUT_SUFFIX}`))))), timeout);
        }
      });
      try {
        if (stryMutAct_9fa48("79640")) {
          {}
        } else {
          stryCov_9fa48("79640");
          const result = await Promise.race(stryMutAct_9fa48("79641") ? [] : (stryCov_9fa48("79641"), [this.sqlQueryEngine.executeQuery(sql, params), timeoutPromise]));
          const duration = stryMutAct_9fa48("79642") ? Date.now() + startTime : (stryCov_9fa48("79642"), Date.now() - startTime);
          this.logger.debug(FUNCTION_LOG_MSG.QUERY_EXECUTE_SUCCESS, stryMutAct_9fa48("79643") ? {} : (stryCov_9fa48("79643"), {
            sql: stryMutAct_9fa48("79644") ? sql : (stryCov_9fa48("79644"), sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH)),
            rowCount: stryMutAct_9fa48("79647") ? (result.results?.length || result.rows?.length) && 0 : stryMutAct_9fa48("79646") ? false : stryMutAct_9fa48("79645") ? true : (stryCov_9fa48("79645", "79646", "79647"), (stryMutAct_9fa48("79649") ? result.results?.length && result.rows?.length : stryMutAct_9fa48("79648") ? false : (stryCov_9fa48("79648", "79649"), (stryMutAct_9fa48("79650") ? result.results.length : (stryCov_9fa48("79650"), result.results?.length)) || (stryMutAct_9fa48("79651") ? result.rows.length : (stryCov_9fa48("79651"), result.rows?.length)))) || 0),
            affectedRows: stryMutAct_9fa48("79654") ? result.affectedRows && 0 : stryMutAct_9fa48("79653") ? false : stryMutAct_9fa48("79652") ? true : (stryCov_9fa48("79652", "79653", "79654"), result.affectedRows || 0),
            durationMs: duration
          }));
          return stryMutAct_9fa48("79655") ? {} : (stryCov_9fa48("79655"), {
            rows: stryMutAct_9fa48("79658") ? (result.results || result.rows) && [] : stryMutAct_9fa48("79657") ? false : stryMutAct_9fa48("79656") ? true : (stryCov_9fa48("79656", "79657", "79658"), (stryMutAct_9fa48("79660") ? result.results && result.rows : stryMutAct_9fa48("79659") ? false : (stryCov_9fa48("79659", "79660"), result.results || result.rows)) || (stryMutAct_9fa48("79661") ? ["Stryker was here"] : (stryCov_9fa48("79661"), []))),
            affectedRows: stryMutAct_9fa48("79664") ? result.affectedRows && 0 : stryMutAct_9fa48("79663") ? false : stryMutAct_9fa48("79662") ? true : (stryCov_9fa48("79662", "79663", "79664"), result.affectedRows || 0),
            partitions: stryMutAct_9fa48("79667") ? result.partitions && [] : stryMutAct_9fa48("79666") ? false : stryMutAct_9fa48("79665") ? true : (stryCov_9fa48("79665", "79666", "79667"), result.partitions || (stryMutAct_9fa48("79668") ? ["Stryker was here"] : (stryCov_9fa48("79668"), []))),
            success: stryMutAct_9fa48("79669") ? false : (stryCov_9fa48("79669"), true)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("79670")) {
          {}
        } else {
          stryCov_9fa48("79670");
          this.logger.error(FUNCTION_LOG_MSG.QUERY_EXECUTE_FAILURE, stryMutAct_9fa48("79671") ? {} : (stryCov_9fa48("79671"), {
            sql: stryMutAct_9fa48("79672") ? sql : (stryCov_9fa48("79672"), sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH)),
            error: error.message
          }));
          throw error;
        }
      } finally {
        if (stryMutAct_9fa48("79673")) {
          {}
        } else {
          stryCov_9fa48("79673");
          clearTimeout(timeoutId);
        }
      }
    }
  }

  /**
   * Execute a query with streaming callback for large result sets.
   * @param {string} sql - SQL statement to execute.
   * @param {Array} params - Query parameters.
   * @param {Function} callback - Called for each batch of rows.
   * @param {Object} options - Execution options.
   * @param {number} options.batchSize - Number of rows per batch.
   * @return {Promise<Object>} Completion result with total row count.
   */
  async executeQueryWithCallback(sql, params, callback, options = {}) {
    if (stryMutAct_9fa48("79674")) {
      {}
    } else {
      stryCov_9fa48("79674");
      if (stryMutAct_9fa48("79677") ? false : stryMutAct_9fa48("79676") ? true : stryMutAct_9fa48("79675") ? this.sqlQueryEngine : (stryCov_9fa48("79675", "79676", "79677"), !this.sqlQueryEngine)) {
        if (stryMutAct_9fa48("79678")) {
          {}
        } else {
          stryCov_9fa48("79678");
          throw new Error(FUNCTION_ERROR_MSG.SQL_ENGINE_UNAVAILABLE);
        }
      }
      if (stryMutAct_9fa48("79681") ? typeof callback === TYPEOF.FUNCTION : stryMutAct_9fa48("79680") ? false : stryMutAct_9fa48("79679") ? true : (stryCov_9fa48("79679", "79680", "79681"), typeof callback !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("79682")) {
          {}
        } else {
          stryCov_9fa48("79682");
          throw new Error(FUNCTION_ERROR_MSG.CALLBACK_MUST_BE_FUNCTION);
        }
      }
      const batchSize = stryMutAct_9fa48("79685") ? options.batchSize && this.defaultBatchSize : stryMutAct_9fa48("79684") ? false : stryMutAct_9fa48("79683") ? true : (stryCov_9fa48("79683", "79684", "79685"), options.batchSize || this.defaultBatchSize);
      const startTime = Date.now();
      this.logger.debug(FUNCTION_LOG_MSG.STREAMING_EXECUTE_START, stryMutAct_9fa48("79686") ? {} : (stryCov_9fa48("79686"), {
        sql: stryMutAct_9fa48("79687") ? sql : (stryCov_9fa48("79687"), sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH)),
        batchSize
      }));

      // Check if engine supports streaming
      if (stryMutAct_9fa48("79690") ? typeof this.sqlQueryEngine.executeStreaming !== TYPEOF.FUNCTION : stryMutAct_9fa48("79689") ? false : stryMutAct_9fa48("79688") ? true : (stryCov_9fa48("79688", "79689", "79690"), typeof this.sqlQueryEngine.executeStreaming === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("79691")) {
          {}
        } else {
          stryCov_9fa48("79691");
          let totalRows = 0;
          await this.sqlQueryEngine.executeStreaming(sql, params, async rows => {
            if (stryMutAct_9fa48("79692")) {
              {}
            } else {
              stryCov_9fa48("79692");
              stryMutAct_9fa48("79693") ? totalRows -= rows.length : (stryCov_9fa48("79693"), totalRows += rows.length);
              await callback(rows);
            }
          }, stryMutAct_9fa48("79694") ? {} : (stryCov_9fa48("79694"), {
            batchSize
          }));
          const duration = stryMutAct_9fa48("79695") ? Date.now() + startTime : (stryCov_9fa48("79695"), Date.now() - startTime);
          this.logger.debug(FUNCTION_LOG_MSG.STREAMING_EXECUTE_COMPLETE, stryMutAct_9fa48("79696") ? {} : (stryCov_9fa48("79696"), {
            sql: stryMutAct_9fa48("79697") ? sql : (stryCov_9fa48("79697"), sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH)),
            totalRows,
            durationMs: duration
          }));
          return stryMutAct_9fa48("79698") ? {} : (stryCov_9fa48("79698"), {
            totalRows,
            success: stryMutAct_9fa48("79699") ? false : (stryCov_9fa48("79699"), true)
          });
        }
      }

      // Fallback: execute full query and batch results
      const result = await this.executeQuery(sql, params, options);
      const rows = stryMutAct_9fa48("79702") ? result.rows && [] : stryMutAct_9fa48("79701") ? false : stryMutAct_9fa48("79700") ? true : (stryCov_9fa48("79700", "79701", "79702"), result.rows || (stryMutAct_9fa48("79703") ? ["Stryker was here"] : (stryCov_9fa48("79703"), [])));
      let totalRows = 0;
      for (let i = 0; stryMutAct_9fa48("79706") ? i >= rows.length : stryMutAct_9fa48("79705") ? i <= rows.length : stryMutAct_9fa48("79704") ? false : (stryCov_9fa48("79704", "79705", "79706"), i < rows.length); stryMutAct_9fa48("79707") ? i -= batchSize : (stryCov_9fa48("79707"), i += batchSize)) {
        if (stryMutAct_9fa48("79708")) {
          {}
        } else {
          stryCov_9fa48("79708");
          const batch = stryMutAct_9fa48("79709") ? rows : (stryCov_9fa48("79709"), rows.slice(i, stryMutAct_9fa48("79710") ? i - batchSize : (stryCov_9fa48("79710"), i + batchSize)));
          stryMutAct_9fa48("79711") ? totalRows -= batch.length : (stryCov_9fa48("79711"), totalRows += batch.length);
          await callback(batch);
        }
      }
      const duration = stryMutAct_9fa48("79712") ? Date.now() + startTime : (stryCov_9fa48("79712"), Date.now() - startTime);
      this.logger.debug(FUNCTION_LOG_MSG.BATCHED_EXECUTE_COMPLETE, stryMutAct_9fa48("79713") ? {} : (stryCov_9fa48("79713"), {
        sql: stryMutAct_9fa48("79714") ? sql : (stryCov_9fa48("79714"), sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH)),
        totalRows,
        durationMs: duration
      }));
      return stryMutAct_9fa48("79715") ? {} : (stryCov_9fa48("79715"), {
        totalRows,
        success: stryMutAct_9fa48("79716") ? false : (stryCov_9fa48("79716"), true)
      });
    }
  }

  /**
   * Execute a query and invoke a function with the results.
   * This is the continuation-passing pattern for async workflows.
   * @param {string} sql - SQL statement to execute.
   * @param {Array} params - Query parameters.
   * @param {string} nextFunctionId - Function to invoke with results.
   * @param {Object} nextFunctionContext - Context to pass to next function.
   * @return {Promise<Object>} Result with invocationId.
   */
  async executeQueryThenInvoke(sql, params, nextFunctionId, nextFunctionContext = {}) {
    if (stryMutAct_9fa48("79717")) {
      {}
    } else {
      stryCov_9fa48("79717");
      if (stryMutAct_9fa48("79720") ? false : stryMutAct_9fa48("79719") ? true : stryMutAct_9fa48("79718") ? this.functionRegistry : (stryCov_9fa48("79718", "79719", "79720"), !this.functionRegistry)) {
        if (stryMutAct_9fa48("79721")) {
          {}
        } else {
          stryCov_9fa48("79721");
          throw new Error(FUNCTION_ERROR_MSG.FUNCTION_REGISTRY_UNAVAILABLE);
        }
      }
      const invocationId = uuidv4();
      const startTime = Date.now();
      this.logger.info(FUNCTION_LOG_MSG.QUERY_INVOKE_START, stryMutAct_9fa48("79722") ? {} : (stryCov_9fa48("79722"), {
        invocationId,
        sql: stryMutAct_9fa48("79723") ? sql : (stryCov_9fa48("79723"), sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH)),
        nextFunctionId
      }));

      // Execute query
      const result = await this.executeQuery(sql, params);

      // Invoke the next function with query results
      try {
        if (stryMutAct_9fa48("79724")) {
          {}
        } else {
          stryCov_9fa48("79724");
          await this.functionRegistry.invoke(nextFunctionId, stryMutAct_9fa48("79725") ? {} : (stryCov_9fa48("79725"), {
            ...nextFunctionContext,
            queryResult: result,
            invocationId
          }));
          const duration = stryMutAct_9fa48("79726") ? Date.now() + startTime : (stryCov_9fa48("79726"), Date.now() - startTime);
          this.logger.info(FUNCTION_LOG_MSG.QUERY_INVOKE_SUCCESS, stryMutAct_9fa48("79727") ? {} : (stryCov_9fa48("79727"), {
            invocationId,
            nextFunctionId,
            rowCount: stryMutAct_9fa48("79730") ? result.rows?.length && 0 : stryMutAct_9fa48("79729") ? false : stryMutAct_9fa48("79728") ? true : (stryCov_9fa48("79728", "79729", "79730"), (stryMutAct_9fa48("79731") ? result.rows.length : (stryCov_9fa48("79731"), result.rows?.length)) || 0),
            durationMs: duration
          }));
          return stryMutAct_9fa48("79732") ? {} : (stryCov_9fa48("79732"), {
            invocationId,
            queryResult: result,
            functionInvoked: stryMutAct_9fa48("79733") ? false : (stryCov_9fa48("79733"), true),
            success: stryMutAct_9fa48("79734") ? false : (stryCov_9fa48("79734"), true)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("79735")) {
          {}
        } else {
          stryCov_9fa48("79735");
          this.logger.error(FUNCTION_LOG_MSG.QUERY_INVOKE_FAILURE, stryMutAct_9fa48("79736") ? {} : (stryCov_9fa48("79736"), {
            invocationId,
            nextFunctionId,
            error: error.message
          }));
          return stryMutAct_9fa48("79737") ? {} : (stryCov_9fa48("79737"), {
            invocationId,
            queryResult: result,
            functionInvoked: stryMutAct_9fa48("79738") ? true : (stryCov_9fa48("79738"), false),
            success: stryMutAct_9fa48("79739") ? true : (stryCov_9fa48("79739"), false),
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Check if executor is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("79740")) {
      {}
    } else {
      stryCov_9fa48("79740");
      return this.initialized;
    }
  }
}
export { FunctionQueryExecutor };