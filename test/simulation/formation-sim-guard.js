// Deterministic-mode guard: while tagged production execution runs, an
// ambient clock read or timer scheduling call throws nondeterministic_owner_seam.
// The harness outside tagged production keeps the real globals so it can drive
// virtual time; the guard is proven by mutation in the runner test.
//
// The boundary is an ASYNC CONTEXT, not a synchronous window. It used to be
// the latter: the guard swapped the globals, called the body, and restored
// them in `finally` - but every dispatch body is async, so it returned a
// promise immediately and the guard was gone before a single continuation
// ran. A "proven" guard and 812 ambient clock reads in one scenario coexisted
// for exactly that reason. The replacements are now installed once and decide
// per async context, which is what makes them survive an await.
import {AsyncLocalStorage} from 'node:async_hooks';

import {
  currentFormationExecutionContext,
} from '../../src/diagnostics/formation-turn-attribution.js';

const NONDETERMINISTIC_OWNER_SEAM = 'nondeterministic_owner_seam';
const GUARDED_GLOBALS = Object.freeze(['setTimeout', 'setInterval', 'setImmediate']);
const DATE_NOW = 'now';
const DISCOVERY_RESOLVER_REQUIRED =
  'ambient seam discovery needs the simulator\'s node-clock resolver';
const PERFORMANCE_NOW = 'now';

class NondeterministicOwnerSeam extends Error {
  constructor(what, owner) {
    super(`${NONDETERMINISTIC_OWNER_SEAM}: ${what} read inside ${owner} dispatch`);
    this.code = NONDETERMINISTIC_OWNER_SEAM;
    this.owner = owner;
  }
}

// STRICT is the contract. DISCOVER exists only so that migration diagnosis
// does not have to abort at the first defect, which was never the same concern
// as failing the proof. In DISCOVER an attempted ambient Date.now() is still
// recorded and the host value is still never consumed: the substitute comes
// from the clock that already belongs to that simulated node, so host
// execution speed stays out of production behaviour. Every other forbidden
// intrinsic keeps recording and throwing, because none of them has an equally
// unambiguous deterministic substitute.
const AMBIENT_SEAM_MODE = Object.freeze({
  STRICT: 'strict',
  DISCOVER: 'discover',
});
let ambientSeamMode = AMBIENT_SEAM_MODE.STRICT;
let executionNodeTimeSourceResolver = null;
let substitutionCount = 0;

// THE AUTHORITY: is this code executing as part of a simulated production
// process? One question, one answer, read from the formation execution
// context that already carries generation and execution-node identity.
//
// There used to be a second answer - a production tag established by
// guardedDispatch - and the two disagreed. Construction, seeding and any
// continuation released outside a dispatch carried the node frame without the
// tag, so 240 of 241 ambient reads executing ON a simulated node were treated
// as harness work. Owner attribution stays orthogonal: production running
// with a generation and a node and no owner at all is still production.
const guardedOwnerContext = new AsyncLocalStorage();
let installed = false;

// The node's own already-authoritative clock, or null when there is none to
// borrow - in which case the strict refusal stands. Ambient time is never the
// answer here.
function discoverySubstituteNow(context) {
  if (ambientSeamMode !== AMBIENT_SEAM_MODE.DISCOVER ||
    executionNodeTimeSourceResolver === null) {
    return null;
  }
  const timeSource = executionNodeTimeSourceResolver(context.executionNodeId);
  if (!timeSource || typeof timeSource.now !== 'function') {
    return null;
  }
  substitutionCount += 1;
  return timeSource.now();
}

function hostedProductionContext() {
  const context = currentFormationExecutionContext();
  if (context.generationId === null || context.executionNodeId === null) {
    return null;
  }
  return context;
}

// THE VIOLATION LEDGER, and why throwing is not enough.
//
// Production catches exceptions. A refusal raised inside a tagged production
// dispatch is caught by an ordinary retry or error path and the scenario
// completes, so the throw alone cannot decide whether a run was
// deterministic: it only stops the illegal value from being consumed. The
// ledger owns the verdict instead. Every ambient access is RECORDED before it
// is thrown, and a run with a non-zero count is refused however many of the
// individual exceptions production swallowed.
const MAX_RETAINED_SAMPLES = 32;
const violationLedger = {
  count: 0,
  samples: [],
  byPrimitive: new Map(),
};

function recordViolation(primitive, owner, context) {
  violationLedger.count += 1;
  violationLedger.byPrimitive.set(
    primitive, (violationLedger.byPrimitive.get(primitive) || 0) + 1);
  // Samples are bounded; the total never is.
  if (violationLedger.samples.length < MAX_RETAINED_SAMPLES) {
    violationLedger.samples.push(Object.freeze({
      primitive,
      owner: owner === undefined ? null : owner,
      generationId: context.generationId,
      executionNodeId: context.executionNodeId,
      callsite: new Error(primitive).stack,
    }));
  }
}

/**
 * The deterministic-proof verdict for the run so far.
 * @return {Object} {count, byPrimitive, samples}
 */
/**
 * Enter discovery mode for migration diagnosis.
 *
 * The resolver is the simulator composition's OWN node-clock lookup; nothing
 * here constructs a clock, and the execution context stays pure identity.
 * @param {Object} options
 * @param {Function} options.resolveExecutionNodeTimeSource
 * @return {void}
 */
function beginAmbientSeamDiscovery({resolveExecutionNodeTimeSource}) {
  if (typeof resolveExecutionNodeTimeSource !== 'function') {
    throw new Error(DISCOVERY_RESOLVER_REQUIRED);
  }
  ambientSeamMode = AMBIENT_SEAM_MODE.DISCOVER;
  executionNodeTimeSourceResolver = resolveExecutionNodeTimeSource;
}

/**
 * Return to the strict contract.
 * @return {void}
 */
function endAmbientSeamDiscovery() {
  ambientSeamMode = AMBIENT_SEAM_MODE.STRICT;
  executionNodeTimeSourceResolver = null;
}

/**
 * Whether this run may contribute deterministic proof at all.
 *
 * Structural, not conventional: a discovery run can never be eligible, and
 * neither can a strict run that recorded a violation.
 * @return {Object}
 */
function deterministicProofEligibility() {
  return Object.freeze({
    ambientSeamMode,
    ambientSeamViolationCount: violationLedger.count,
    ambientSeamSubstitutionCount: substitutionCount,
    deterministicProofEligible:
      ambientSeamMode === AMBIENT_SEAM_MODE.STRICT &&
      violationLedger.count === 0,
  });
}

function nondeterministicOwnerSeamLedger() {
  return Object.freeze({
    count: violationLedger.count,
    byPrimitive: new Map(violationLedger.byPrimitive),
    samples: [...violationLedger.samples],
  });
}

/**
 * Begin a fresh ledger for one generation.
 * @return {void}
 */
function resetNondeterministicOwnerSeamLedger() {
  substitutionCount = 0;
  violationLedger.count = 0;
  violationLedger.samples = [];
  violationLedger.byPrimitive = new Map();
}

/**
 * Refuse a deterministic proof whose generation recorded any ambient access.
 * @param {string} generationId
 * @return {void}
 */
function assertNoNondeterministicOwnerSeam(generationId) {
  if (violationLedger.count === 0) return;
  const primitives = [...violationLedger.byPrimitive.entries()]
    .map(([primitive, count]) => `${primitive} x${count}`).join(', ');
  const [first] = violationLedger.samples;
  const error = new NondeterministicOwnerSeam(
    `${violationLedger.count} ambient access(es) [${primitives}]`,
    first ? first.owner : generationId);
  error.ledger = nondeterministicOwnerSeamLedger();
  throw error;
}

// The owner name for a violation record. Diagnostics only: it never decides
// admission, so an unattributed segment is refused exactly like a named one.
function guardedOwner() {
  return guardedOwnerContext.getStore();
}

// One replacement per guarded intrinsic: refuse inside tagged production,
// delegate to the real one everywhere else. The vocabulary is unchanged; only
// the boundary it applies across is wider.
function install() {
  if (installed) return;
  installed = true;
  const realDateNow = Date.now;
  Date.now = function() {
    const context = hostedProductionContext();
    if (context !== null) {
      const owner = guardedOwner();
      recordViolation(`Date.${DATE_NOW}`, owner, context);
      const substitute = discoverySubstituteNow(context);
      if (substitute !== null) return substitute;
      throw new NondeterministicOwnerSeam(`Date.${DATE_NOW}`, owner);
    }
    return realDateNow();
  };
  if (globalThis.performance) {
    const realPerformanceNow = globalThis.performance.now.bind(
      globalThis.performance);
    globalThis.performance.now = function() {
      const context = hostedProductionContext();
      if (context !== null) {
        const owner = guardedOwner();
        recordViolation(`performance.${PERFORMANCE_NOW}`, owner, context);
        throw new NondeterministicOwnerSeam(
          `performance.${PERFORMANCE_NOW}`, owner);
      }
      return realPerformanceNow();
    };
  }
  for (const name of GUARDED_GLOBALS) {
    const real = globalThis[name];
    globalThis[name] = function(...args) {
      const context = hostedProductionContext();
      if (context !== null) {
        const owner = guardedOwner();
        recordViolation(name, owner, context);
        throw new NondeterministicOwnerSeam(name, owner);
      }
      return real(...args);
    };
  }
}

/**
 * Install the deterministic intrinsic wrappers.
 *
 * Idempotent, and separate from any dispatch: admission is decided by the
 * formation execution context, so the wrappers must already be in place
 * before the first node executes, whether or not a dispatch ever happens.
 * @return {void}
 */
function installDeterministicOwnerGuard() {
  install();
}

/**
 * Run one owner dispatch. This installs the deterministic intrinsic wrappers
 * and names the owner for violation records; it no longer decides whether the
 * body is production. Deleting the owner name cannot change what the guard
 * admits - the node/generation frame is the sole authority - which is what
 * the "old predicate" mutation witness proves.
 * @param {string} owner FORMATION_OWNER value
 * @param {Function} body
 * @returns {*} the body's return value, awaits included
 */
function guardedDispatch(owner, body) {
  install();
  return guardedOwnerContext.run(owner, body);
}

/**
 * Run a body OUTSIDE tagged production execution, for harness work that
 * legitimately reads the wall clock while nested inside a dispatch (driving
 * virtual time, measuring, reporting).
 * @param {Function} body
 * @returns {*} the body's return value
 */
function unguardedHarnessWork(body) {
  return guardedOwnerContext.run(undefined, body);
}

export {
  AMBIENT_SEAM_MODE,
  NONDETERMINISTIC_OWNER_SEAM,
  NondeterministicOwnerSeam,
  assertNoNondeterministicOwnerSeam,
  beginAmbientSeamDiscovery,
  deterministicProofEligibility,
  endAmbientSeamDiscovery,
  guardedDispatch,
  installDeterministicOwnerGuard,
  nondeterministicOwnerSeamLedger,
  resetNondeterministicOwnerSeamLedger,
  unguardedHarnessWork,
};
