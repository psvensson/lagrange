/**
 * Guest-safe authoring root: the service-definition descriptor factory,
 * the descriptor kind discriminators, and the cycle-safe deep freezer
 * shared by every authoring module. Pure ESM with no Node-only imports,
 * so the module executes cleanly inside a wizened guest. Descriptors are
 * declarative data plus the authored functions; identity never comes
 * from Function.name — the service definition assigns ids from explicit
 * object keys, and src/service/service-source-contract.js owns turning
 * a definition into an IR.
 */
const AUTHORING_DESCRIPTOR_KIND = Object.freeze({
  DISTRIBUTED_OPERATION: 'distributed_operation',
  REQUEST_HANDLER: 'request_handler',
  SERVICE_DEFINITION: 'service_definition',
  SQL_STATEMENT: 'sql_statement',
});

// Freeze BEFORE recursing: descriptor graphs contain reference cycles (a
// function's prototype.constructor points back at the function), and the
// already-frozen check is what terminates the recursion.
function deepFreeze(value) {
  if (value === null ||
      (typeof value !== 'object' && typeof value !== 'function') ||
      Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze(value[key]);
  }
  return value;
}

function defineService({name, version, operations, handlers}) {
  return deepFreeze({
    handlers,
    kind: AUTHORING_DESCRIPTOR_KIND.SERVICE_DEFINITION,
    name,
    operations,
    version,
  });
}

export {AUTHORING_DESCRIPTOR_KIND, deepFreeze, defineService};
