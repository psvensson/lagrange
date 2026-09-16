// How an unattributed turn is classified, and by what proof.
//
// The proof is the SOURCE LINE at the site that created the turn, read at
// classification time. A file is not a proof and a directory is not a proof:
// a turn created by a different line of an already-listed file is not covered
// by that file's other lines, and has to earn its own classification.
//
// Line numbers move when code moves, and that is deliberate. A moved line is
// re-proved against its new text rather than inheriting a verdict.
import {readFileSync} from 'node:fs';

const ZERO = 0;
const ONE = 1;
const REPO_ROOT = new URL('../../', import.meta.url);
const SITE_SEPARATOR = ':';
const LINE_SEPARATOR = '\n';
const TEXT_ENCODING = 'utf8';

const OUTSIDE_DOMAIN_REASON = Object.freeze({
  // One macrotask offered to the closure authority, calling no production
  // code: a promise created and resolved on setImmediate.
  SCENARIO_SCHEDULER_TURN: 'scenario_scheduler_turn',
  // The closure authority awaiting each owner-idle contract and resuming its
  // own loop.
  CLOSURE_OWNER_IDLE_AWAIT: 'closure_owner_idle_await',
  // The scenario drive loop resuming itself between instants.
  DRIVE_LOOP_AWAIT: 'drive_loop_await',
  // The continuation of the call that ENTERS an owner. An entry boundary
  // cannot put its own return inside the owner it enters.
  OWNER_BOUNDARY_RETURN: 'owner_boundary_return',
  // A resource that already existed when the formation window opened: the
  // process's own startup. It predates formation and carries no formation
  // lineage. That is a fact about causality, and it needs no repository
  // frame - a V8 promise continuation may have none at all.
  PRE_WINDOW_RESOURCE: 'pre_window_resource',
});

// Every shape that may stand for a reason, as the source line reads, paired
// with the file it was proved in. Both halves are required: a shape alone
// could match a production line that merely looks similar, and a file alone
// is what let a whole file inherit one line's verdict.
const SEED_HOST = 'test/simulation/formation-sim-production-seed-host.js';
const QUIESCENCE = 'test/simulation/formation-sim-quiescence.js';
const PIPELINE_RUNNER = 'src/bootstrap/pipeline/startup-pipeline-runner.js';
const REASON = OUTSIDE_DOMAIN_REASON;
const OUTSIDE_DOMAIN_SHAPE = Object.freeze([
  // One macrotask offered to the closure authority.
  ['new Promise((resolve) => setImmediate(resolve))', SEED_HOST,
    REASON.SCENARIO_SCHEDULER_TURN],
  // The closure authority awaiting each owner-idle contract.
  ['for (const owner of owners) await owner();', QUIESCENCE,
    REASON.CLOSURE_OWNER_IDLE_AWAIT],
  // The caller's return from a call that ENTERS an owner - production's own
  // entry, and the host awaiting that entry.
  ['await runBootstrapActivity(', PIPELINE_RUNNER, REASON.OWNER_BOUNDARY_RETURN],
  ['await runSeedPhase(', SEED_HOST, REASON.OWNER_BOUNDARY_RETURN],
  // The scenario drive loop resuming itself between instants, and the
  // settlement watcher that tells it when a phase has finished.
  ['await closeInstant(', SEED_HOST, REASON.DRIVE_LOOP_AWAIT],
  ['const at = await advanceToNextInstant(', SEED_HOST, REASON.DRIVE_LOOP_AWAIT],
  ['await host.settleCausalConsequences(', SEED_HOST, REASON.DRIVE_LOOP_AWAIT],
  ['await host.driveUntilSettled(', SEED_HOST, REASON.DRIVE_LOOP_AWAIT],
  ['runOnSimulationGenerationRoot(generation, () =>', SEED_HOST,
    REASON.DRIVE_LOOP_AWAIT],
  ['async driveUntilSettled(promise,', SEED_HOST, REASON.DRIVE_LOOP_AWAIT],
  ['const watched = promise.then(', SEED_HOST, REASON.DRIVE_LOOP_AWAIT],
  ['watched.catch(() => undefined);', SEED_HOST, REASON.DRIVE_LOOP_AWAIT],
  ['await closeCurrentInstant({network, owners});', QUIESCENCE,
    REASON.DRIVE_LOOP_AWAIT],
].map((entry) => Object.freeze({shape: entry[0], file: entry[1],
  reason: entry[2]})));

const CLASSIFICATION = Object.freeze({
  OUTSIDE_DOMAIN: 'OUTSIDE_DOMAIN',
  PRODUCTION_UNOWNED: 'PRODUCTION_UNOWNED',
  UNKNOWN: 'UNKNOWN',
});

const sourceLines = new Map();

/**
 * The source line at a `path:line` site, or null when there is none.
 * @param {string} site
 * @return {string|null}
 */
function lineAt(site) {
  const cut = site.lastIndexOf(SITE_SEPARATOR);
  if (cut < ZERO) return null;
  const file = site.slice(ZERO, cut);
  const number = Number(site.slice(cut + ONE));
  if (!Number.isInteger(number) || number < ONE) return null;
  if (!sourceLines.has(file)) {
    try {
      sourceLines.set(file,
        readFileSync(new URL(file, REPO_ROOT), TEXT_ENCODING)
          .split(LINE_SEPARATOR));
    } catch {
      sourceLines.set(file, null);
    }
  }
  const lines = sourceLines.get(file);
  return lines === null ? null : lines[number - ONE] ?? null;
}

/**
 * @param {string} site - `path:line` of the code that created the turn.
 * @param {boolean} [createdInWindow] - false when the resource already
 *   existed when the window opened.
 * @return {{classification: string, reason: (string|null), line: (string|null)}}
 */
function classifyUnownedTurn(site, createdInWindow = true) {
  if (!createdInWindow) {
    return {
      classification: CLASSIFICATION.OUTSIDE_DOMAIN,
      reason: OUTSIDE_DOMAIN_REASON.PRE_WINDOW_RESOURCE,
      line: null,
    };
  }
  const line = lineAt(site);
  if (line === null) {
    return {classification: CLASSIFICATION.UNKNOWN, reason: null, line: null};
  }
  const file = site.slice(ZERO, site.lastIndexOf(SITE_SEPARATOR));
  for (const candidate of OUTSIDE_DOMAIN_SHAPE) {
    if (candidate.file === file && line.includes(candidate.shape)) {
      return {
        classification: CLASSIFICATION.OUTSIDE_DOMAIN,
        reason: candidate.reason,
        line,
      };
    }
  }
  return {
    classification: CLASSIFICATION.PRODUCTION_UNOWNED,
    reason: null,
    line,
  };
}

export {
  CLASSIFICATION,
  OUTSIDE_DOMAIN_REASON,
  OUTSIDE_DOMAIN_SHAPE,
  classifyUnownedTurn,
};
