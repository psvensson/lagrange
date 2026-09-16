// How an unattributed turn is classified, and by what proof.
//
// The key is the site that created the turn; the PROOF is the reason, which
// names the code shape at that site. A directory is never a proof, so the
// witness for this module reads the source at each site and checks that the
// shape the reason claims is the shape that is there.
const OUTSIDE_DOMAIN_REASON = Object.freeze({
  // () => new Promise((resolve) => setImmediate(resolve)) - one macrotask
  // offered to the closure authority, calling no production code.
  SCENARIO_SCHEDULER_TURN: 'scenario_scheduler_turn',
  // for (const owner of owners) await owner() - the closure authority
  // awaiting each owner-idle contract and resuming its own loop.
  CLOSURE_OWNER_IDLE_AWAIT: 'closure_owner_idle_await',
  // await advanceToNextInstant(...) / await closeCurrentInstant(...) - the
  // scenario drive loop resuming itself.
  DRIVE_LOOP_AWAIT: 'drive_loop_await',
  // The continuation of the call that ENTERS an owner. An entry boundary
  // cannot put its own return inside the owner it enters.
  OWNER_BOUNDARY_RETURN: 'owner_boundary_return',
  // A resource that already existed when the formation window opened: the
  // process's own startup. It predates formation, so it carries no formation
  // lineage, and that is a fact about causality rather than about where any
  // file lives. A V8 promise continuation may have no repository frame at
  // all, so this is decided by lineage and never by stack availability.
  PRE_WINDOW_RESOURCE: 'pre_window_resource',
});

// Site -> proven reason. Every entry was established causally in F3 by
// reading the code at the site, not by where the file lives.
const OUTSIDE_DOMAIN_SITE = Object.freeze({
  'test/simulation/formation-sim-production-seed-host.js':
    OUTSIDE_DOMAIN_REASON.SCENARIO_SCHEDULER_TURN,
  'test/simulation/formation-sim-quiescence.js':
    OUTSIDE_DOMAIN_REASON.CLOSURE_OWNER_IDLE_AWAIT,
  'test/simulation/formation-sim-production-node-environment.js':
    OUTSIDE_DOMAIN_REASON.DRIVE_LOOP_AWAIT,
  'test/distributed/harness/virtual-network.js':
    OUTSIDE_DOMAIN_REASON.DRIVE_LOOP_AWAIT,
  'test/distributed/harness/virtual-connection-environment.js':
    OUTSIDE_DOMAIN_REASON.DRIVE_LOOP_AWAIT,
  'src/bootstrap/pipeline/startup-pipeline-runner.js':
    OUTSIDE_DOMAIN_REASON.OWNER_BOUNDARY_RETURN,
});

const CLASSIFICATION = Object.freeze({
  OUTSIDE_DOMAIN: 'OUTSIDE_DOMAIN',
  PRODUCTION_UNOWNED: 'PRODUCTION_UNOWNED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * @param {string} file - the file that created the turn.
 * @param {boolean} [createdInWindow] - false when the resource already
 *   existed when the window opened.
 * @return {{classification: string, reason: (string|null)}}
 */
function classifyUnownedTurn(file, createdInWindow = true) {
  if (!createdInWindow) {
    return {
      classification: CLASSIFICATION.OUTSIDE_DOMAIN,
      reason: OUTSIDE_DOMAIN_REASON.PRE_WINDOW_RESOURCE,
    };
  }
  const reason = Object.hasOwn(OUTSIDE_DOMAIN_SITE, file) ?
    OUTSIDE_DOMAIN_SITE[file] : null;
  if (reason !== null) {
    return {classification: CLASSIFICATION.OUTSIDE_DOMAIN, reason};
  }
  if (file === 'native' || file === 'node_modules') {
    return {classification: CLASSIFICATION.UNKNOWN, reason: null};
  }
  return {classification: CLASSIFICATION.PRODUCTION_UNOWNED, reason: null};
}

export {
  CLASSIFICATION,
  OUTSIDE_DOMAIN_REASON,
  OUTSIDE_DOMAIN_SITE,
  classifyUnownedTurn,
};
