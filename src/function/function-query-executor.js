/**
 * Function Query Executor - Internal API for programmatic query execution.
 * Used by function executors to run queries on behalf of user functions.
 * Requirements: 34.6, 34.7, 34.8, 34.9
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  FUNCTION_CONFIG_KEY,
  FUNCTION_DEFAULT,
  FUNCTION_ERROR_MSG,
  FUNCTION_LOG_LIMIT,
  FUNCTION_LOG_MSG,
  FUNCTION_SUBSYSTEM,
  TYPEOF,
} from './function-constants.js';

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
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.functionRegistry = options.functionRegistry || null;
    this.logger = this.initLogger();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultTimeoutMs =
      config.get(FUNCTION_CONFIG_KEY.QUERY_TIMEOUT_MS) || FUNCTION_DEFAULT.QUERY_TIMEOUT_MS;
    this.defaultBatchSize =
      config.get(FUNCTION_CONFIG_KEY.QUERY_BATCH_SIZE) || FUNCTION_DEFAULT.QUERY_BATCH_SIZE;

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
        return loggingService.forSubsystem(FUNCTION_SUBSYSTEM.QUERY_EXECUTOR);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Initialize the query executor.
   * @param {Object} options - Initialization options.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Object} options.functionRegistry - Function registry.
   */
  initialize(options = {}) {
    if (options.sqlQueryEngine) {
      this.sqlQueryEngine = options.sqlQueryEngine;
    }
    if (options.functionRegistry) {
      this.functionRegistry = options.functionRegistry;
    }

    this.initialized = true;

    this.logger.info(FUNCTION_LOG_MSG.QUERY_EXECUTOR_INITIALIZED);
  }

  /**
   * Execute a query and return results directly.
   * @param {string} sql - SQL statement to execute.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @param {number} options.timeout - Query timeout in milliseconds.
   * @return {Promise<Object>} Query result with rows, affectedRows, partitions.
   */
  async executeQuery(sql, params = [], options = {}) {
    if (!this.sqlQueryEngine) {
      throw new Error(FUNCTION_ERROR_MSG.SQL_ENGINE_UNAVAILABLE);
    }

    const timeout = options.timeout || this.defaultTimeoutMs;
    const startTime = Date.now();

    this.logger.debug(FUNCTION_LOG_MSG.QUERY_EXECUTE_START, {
      sql: sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH),
      paramCount: params.length,
      timeout,
    });

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(
          `${FUNCTION_ERROR_MSG.QUERY_TIMEOUT_PREFIX}${timeout}` +
          `${FUNCTION_ERROR_MSG.QUERY_TIMEOUT_SUFFIX}`,
        )),
        timeout,
      );
    });

    try {
      const result = await Promise.race([
        this.sqlQueryEngine.executeQuery(sql, params),
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;

      this.logger.debug(FUNCTION_LOG_MSG.QUERY_EXECUTE_SUCCESS, {
        sql: sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH),
        rowCount: result.results?.length || result.rows?.length || 0,
        affectedRows: result.affectedRows || 0,
        durationMs: duration,
      });

      return {
        rows: result.results || result.rows || [],
        affectedRows: result.affectedRows || 0,
        partitions: result.partitions || [],
        success: true,
      };
    } catch (error) {
      this.logger.error(FUNCTION_LOG_MSG.QUERY_EXECUTE_FAILURE, {
        sql: sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH),
        error: error.message,
      });
      throw error;
    } finally {
      clearTimeout(timeoutId);
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
    if (!this.sqlQueryEngine) {
      throw new Error(FUNCTION_ERROR_MSG.SQL_ENGINE_UNAVAILABLE);
    }

    if (typeof callback !== TYPEOF.FUNCTION) {
      throw new Error(FUNCTION_ERROR_MSG.CALLBACK_MUST_BE_FUNCTION);
    }

    const batchSize = options.batchSize || this.defaultBatchSize;
    const startTime = Date.now();

    this.logger.debug(FUNCTION_LOG_MSG.STREAMING_EXECUTE_START, {
      sql: sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH),
      batchSize,
    });

    // Check if engine supports streaming
    if (typeof this.sqlQueryEngine.executeStreaming === TYPEOF.FUNCTION) {
      let totalRows = 0;

      await this.sqlQueryEngine.executeStreaming(sql, params, async (rows) => {
        totalRows += rows.length;
        await callback(rows);
      }, {batchSize});

      const duration = Date.now() - startTime;

      this.logger.debug(FUNCTION_LOG_MSG.STREAMING_EXECUTE_COMPLETE, {
        sql: sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH),
        totalRows,
        durationMs: duration,
      });

      return {
        totalRows,
        success: true,
      };
    }

    // Fallback: execute full query and batch results
    const result = await this.executeQuery(sql, params, options);
    const rows = result.rows || [];

    let totalRows = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      totalRows += batch.length;
      await callback(batch);
    }

    const duration = Date.now() - startTime;

    this.logger.debug(FUNCTION_LOG_MSG.BATCHED_EXECUTE_COMPLETE, {
      sql: sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH),
      totalRows,
      durationMs: duration,
    });

    return {
      totalRows,
      success: true,
    };
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
    if (!this.functionRegistry) {
      throw new Error(FUNCTION_ERROR_MSG.FUNCTION_REGISTRY_UNAVAILABLE);
    }

    const invocationId = uuidv4();
    const startTime = Date.now();

    this.logger.info(FUNCTION_LOG_MSG.QUERY_INVOKE_START, {
      invocationId,
      sql: sql.substring(0, FUNCTION_LOG_LIMIT.SQL_SNIPPET_LENGTH),
      nextFunctionId,
    });

    // Execute query
    const result = await this.executeQuery(sql, params);

    // Invoke the next function with query results
    try {
      await this.functionRegistry.invoke(nextFunctionId, {
        ...nextFunctionContext,
        queryResult: result,
        invocationId,
      });

      const duration = Date.now() - startTime;

      this.logger.info(FUNCTION_LOG_MSG.QUERY_INVOKE_SUCCESS, {
        invocationId,
        nextFunctionId,
        rowCount: result.rows?.length || 0,
        durationMs: duration,
      });

      return {
        invocationId,
        queryResult: result,
        functionInvoked: true,
        success: true,
      };
    } catch (error) {
      this.logger.error(FUNCTION_LOG_MSG.QUERY_INVOKE_FAILURE, {
        invocationId,
        nextFunctionId,
        error: error.message,
      });
      return {
        invocationId,
        queryResult: result,
        functionInvoked: false,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check if executor is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }
}

export {FunctionQueryExecutor};
