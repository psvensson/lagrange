/**
 * Write executor for sys-wasm-meta commands.
 * Ensures all writes flow through SQL/CDC paths.
 * No direct partition writes or fallback paths.
 *
 * Requirements: 12.1, 12.2
 */

const META_WRITE_ERROR_MSG = Object.freeze({
  ENGINE_REQUIRED: 'SQL query engine is required',
  COMMAND_FAILED: 'Command validation failed',
  EXECUTION_FAILED: 'SQL execution failed',
});

/**
 * Execute a write command through the SQL query engine.
 * @param {Object} sqlQueryEngine - SQL query engine instance.
 * @param {Object} commandResult - Result from a command handler.
 * @return {Promise<Object>} Execution result.
 */
async function executeMetaWrite(sqlQueryEngine, commandResult) {
  if (!sqlQueryEngine) {
    throw new Error(META_WRITE_ERROR_MSG.ENGINE_REQUIRED);
  }

  if (!commandResult.success) {
    return {success: false, errors: commandResult.errors};
  }

  try {
    const result = await sqlQueryEngine.executeQuery(
      commandResult.sql,
      commandResult.params,
    );
    const {sql: _sql, params: _params, ...rest} = commandResult;
    return {success: true, result, ...rest};
  } catch (err) {
    return {
      success: false,
      error: `${META_WRITE_ERROR_MSG.EXECUTION_FAILED}: ${err.message}`,
    };
  }
}

/**
 * Execute a read command through the SQL query engine.
 * @param {Object} sqlQueryEngine - SQL query engine instance.
 * @param {Object} commandResult - Result from a command handler.
 * @return {Promise<Object>} Execution result with rows.
 */
async function executeMetaRead(sqlQueryEngine, commandResult) {
  if (!sqlQueryEngine) {
    throw new Error(META_WRITE_ERROR_MSG.ENGINE_REQUIRED);
  }

  if (!commandResult.success) {
    return {success: false, errors: commandResult.errors};
  }

  try {
    const result = await sqlQueryEngine.executeQuery(
      commandResult.sql,
      commandResult.params,
    );
    return {success: true, rows: result.rows || []};
  } catch (err) {
    return {
      success: false,
      error: `${META_WRITE_ERROR_MSG.EXECUTION_FAILED}: ${err.message}`,
    };
  }
}

export {
  META_WRITE_ERROR_MSG,
  executeMetaWrite,
  executeMetaRead,
};
