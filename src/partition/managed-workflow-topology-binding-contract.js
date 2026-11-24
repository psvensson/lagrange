const MISSING_ENGINE_SUFFIX = ' requires options.sqlQueryEngine';
const MISSING_ENGINE_METHOD_INFIX = ' requires sqlQueryEngine.';
const MISSING_ENGINE_METHOD_SUFFIX = '()';
const MISSING_TOPOLOGY_BINDING_INFIX = ' requires topology binding: ';

/**
 * Validate that a topology adapter receives a sqlQueryEngine object exposing
 * every required method at construction time.
 * @param {string} adapterName - Adapter class name for error diagnostics.
 * @param {Object} options - Adapter constructor options.
 * @param {ReadonlyArray<string>} requiredMethods - Required method names.
 * @return {Object} Validated sqlQueryEngine instance.
 */
function validateSqlQueryEngineTopologyAdapter(
  adapterName,
  options,
  requiredMethods,
) {
  const sqlQueryEngine = options?.sqlQueryEngine;
  if (!sqlQueryEngine || typeof sqlQueryEngine !== 'object') {
    throw new TypeError(`${adapterName}${MISSING_ENGINE_SUFFIX}`);
  }
  for (const methodName of requiredMethods) {
    const candidate = sqlQueryEngine[methodName];
    if (typeof candidate !== 'function') {
      throw new TypeError(
        `${adapterName}${MISSING_ENGINE_METHOD_INFIX}` +
        `${methodName}${MISSING_ENGINE_METHOD_SUFFIX}`,
      );
    }
  }
  return sqlQueryEngine;
}

/**
 * Bind a topology adapter method when the adapter provides it.
 * @param {?Object} topologyAdapter - Wired topology adapter, when present.
 * @param {string} methodName - Adapter method name to bind.
 * @return {?Function} Bound adapter method, or null when absent.
 */
function bindTopologyMethod(topologyAdapter, methodName) {
  if (!topologyAdapter) {
    return null;
  }
  const candidate = topologyAdapter[methodName];
  if (typeof candidate !== 'function') {
    return null;
  }
  return candidate.bind(topologyAdapter);
}

function resolveTopologyBinding(workflow, options, spec, workflowName) {
  const {property, required, inertBinding} = spec;
  const explicitOption = options[property];
  if (
    explicitOption !== undefined &&
    explicitOption !== null &&
    typeof explicitOption !== 'function'
  ) {
    throw new TypeError(
      `${workflowName}${MISSING_TOPOLOGY_BINDING_INFIX}${property}`,
    );
  }
  const bound = bindTopologyMethod(workflow.topologyAdapter, property) ||
    explicitOption || null;
  if (required && !bound) {
    throw new TypeError(
      `${workflowName}${MISSING_TOPOLOGY_BINDING_INFIX}${property}`,
    );
  }
  return bound || inertBinding(options, workflow);
}

/**
 * Bind and validate workflow topology collaborators from the wired adapter or
 * explicit options using one shared validation contract.
 * @param {Object} workflow - Workflow owner instance.
 * @param {Object} options - Constructor options.
 * @param {ReadonlyArray<Object>} bindingSpecs - Declared collaborator specs.
 * @param {string} workflowName - Workflow class name for diagnostics.
 * @return {void}
 */
function applyWorkflowTopologyBindings(
  workflow,
  options,
  bindingSpecs,
  workflowName,
) {
  for (const spec of bindingSpecs) {
    workflow[spec.property] =
      resolveTopologyBinding(workflow, options, spec, workflowName);
  }
}

export {
  applyWorkflowTopologyBindings,
  validateSqlQueryEngineTopologyAdapter,
};
