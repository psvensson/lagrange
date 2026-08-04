/**
 * Fixture-local stand-in for the future guest-safe authoring library
 * (solve/epics/code-first-service-compiler.md, rung 1). Descriptor
 * factories only: deep-frozen plain objects, identities from explicit
 * object keys — never Function.name — and no Node-only imports, so the
 * module is safe to execute inside ComponentizeJS wizening.
 */
const DESCRIPTOR_KIND = Object.freeze({
  DISTRIBUTED: 'distributed',
  HTTP: 'http',
});
const HTTP_METHOD = Object.freeze({
  GET: 'GET',
  POST: 'POST',
});
const SQL_INTERPOLATION_MESSAGE =
  'sql template interpolations are not supported by the spike stub';

// Freeze BEFORE recursing: descriptor graphs contain reference cycles
// (a function's prototype.constructor points back at the function), and
// the already-frozen check is what terminates them.
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

// Statement authoring surface: a template tag that returns the raw SQL
// text. Interpolations are rejected until the real library defines their
// (parameterized) meaning — never string-spliced.
function sql(strings, ...interpolations) {
  if (interpolations.length > 0) {
    throw new Error(SQL_INTERPOLATION_MESSAGE);
  }
  return strings.join('');
}

function distributed({statement, run, reduce}) {
  return deepFreeze({
    kind: DESCRIPTOR_KIND.DISTRIBUTED,
    reduce,
    run,
    statement,
  });
}

function httpRoute(method, path, {calls = [], handle}) {
  return deepFreeze({
    calls,
    handle,
    kind: DESCRIPTOR_KIND.HTTP,
    method,
    path,
  });
}

const http = deepFreeze({
  get(path, descriptor) {
    return httpRoute(HTTP_METHOD.GET, path, descriptor);
  },
  post(path, descriptor) {
    return httpRoute(HTTP_METHOD.POST, path, descriptor);
  },
});

function defineService({name, version, operations, handlers}) {
  return deepFreeze({
    handlers,
    name,
    operations,
    version,
  });
}

export {DESCRIPTOR_KIND, defineService, distributed, http, sql};
