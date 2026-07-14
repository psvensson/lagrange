const TYPEOF_FUNCTION = 'function';

const ERROR_MESSAGE = Object.freeze({
  CATALOG_GATEWAY_REQUIRED:
    'service lifecycle command owner requires its catalog gateway',
  SQL_QUERY_ENGINE_REQUIRED:
    'service lifecycle command owner binding requires a SQL query engine',
});

/**
 * Bind one retained lifecycle command owner and its exact catalog gateway to
 * the SQL runtime that currently owns external query execution.
 *
 * @param {Object|null} commandOwner
 * @param {Object|null} sqlQueryEngine
 * @return {boolean} true when an owner was bound
 */
function bindServiceLifecycleCommandOwnerToSqlRuntime(
  commandOwner,
  sqlQueryEngine,
) {
  if (!commandOwner) return false;
  if (!sqlQueryEngine) {
    throw new Error(ERROR_MESSAGE.SQL_QUERY_ENGINE_REQUIRED);
  }
  const catalogGateway = commandOwner.catalogOwner?.getGateway?.() || null;
  if (typeof catalogGateway?.setSqlQueryEngine !== TYPEOF_FUNCTION) {
    throw new Error(ERROR_MESSAGE.CATALOG_GATEWAY_REQUIRED);
  }

  catalogGateway.setSqlQueryEngine(sqlQueryEngine);
  if (typeof sqlQueryEngine.setServiceLifecycleCommandOwner ===
      TYPEOF_FUNCTION) {
    sqlQueryEngine.setServiceLifecycleCommandOwner(commandOwner);
  } else {
    sqlQueryEngine.serviceLifecycleCommandOwner = commandOwner;
  }
  return true;
}

export {bindServiceLifecycleCommandOwnerToSqlRuntime};
