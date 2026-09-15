// Deterministic-mode guard: while a tagged owner dispatch runs, an ambient
// clock read or timer scheduling call throws nondeterministic_owner_seam.
// The harness outside a dispatch keeps the real globals so it can drive
// virtual time; the guard is proven by mutation in the runner test.

const NONDETERMINISTIC_OWNER_SEAM = 'nondeterministic_owner_seam';
const GUARDED_GLOBALS = Object.freeze(['setTimeout', 'setInterval', 'setImmediate']);
const DATE_NOW = 'now';
const PERFORMANCE_NOW = 'now';

class NondeterministicOwnerSeam extends Error {
  constructor(what, owner) {
    super(`${NONDETERMINISTIC_OWNER_SEAM}: ${what} read inside ${owner} dispatch`);
    this.code = NONDETERMINISTIC_OWNER_SEAM;
    this.owner = owner;
  }
}

let depth = 0;

function thrower(what, owner) {
  return () => {
    throw new NondeterministicOwnerSeam(what, owner);
  };
}

/**
 * Run one owner dispatch under the guard. Re-entrant: nested dispatches keep
 * the guard of the outermost one.
 * @param {string} owner FORMATION_OWNER value
 * @param {Function} body
 * @returns {*} the body's return value
 */
function guardedDispatch(owner, body) {
  if (depth > 0) return body();
  const saved = {
    dateNow: Date.now,
    performanceNow: globalThis.performance?.now,
    globals: Object.fromEntries(GUARDED_GLOBALS.map((name) => [name, globalThis[name]])),
  };
  depth += 1;
  Date.now = thrower(`Date.${DATE_NOW}`, owner);
  if (globalThis.performance) {
    globalThis.performance.now = thrower(`performance.${PERFORMANCE_NOW}`, owner);
  }
  for (const name of GUARDED_GLOBALS) globalThis[name] = thrower(name, owner);
  try {
    return body();
  } finally {
    Date.now = saved.dateNow;
    if (globalThis.performance) globalThis.performance.now = saved.performanceNow;
    for (const name of GUARDED_GLOBALS) globalThis[name] = saved.globals[name];
    depth -= 1;
  }
}

export {NONDETERMINISTIC_OWNER_SEAM, NondeterministicOwnerSeam, guardedDispatch};
