// Deterministic evidence harness for the
// active-gate-authoritative-repair-convergence quest: receipt declarations
// only. The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/active-gate-authoritative-repair-convergence.receipt.json).
// Each receipt re-executes a focused witness scenario rather than trusting a
// claim, so a regression that flips a witness red flips this receipt to fail
// and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern. The
// convergence-after-evidence-advances receipt is the honest RED witness: its
// proof command runs the convergence scenario, which fails today (the missing
// level-trigger / evidence-driven re-drive), so this receipt records fail
// until the real fix lands. The other eight receipts run green scenarios and
// must stay green; a fix that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/active-gate/active-gate-authoritative-repair-convergence.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

// One verbatim proof command per scenario. node --test --test-name-pattern
// selects exactly one top-level witness scenario by its anchored name, so a
// green receipt is honest (its scenario exits 0) and the red receipt is
// honest (the convergence scenario exits non-zero today).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const ANTI_STORM_COMMAND = scenarioCommand('^anti-storm');
const INVENTORY_COMMAND = scenarioCommand('^active-definitions-inventory');
const CONVERGENCE_COMMAND =
  scenarioCommand('^convergence-after-evidence-advances');

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'single-repair-admission-owner',
    command: ANTI_STORM_COMMAND,
    detail: 'the authoritative-discovery repair owner is the SOLE owner of ' +
      'repair admission: only ensureAuthoritativeDiscoveryCacheRepair admits ' +
      'repair work through the real gateway read path, and repeated caller ' +
      'requests during the backoff add zero authoritative reads (bounded ' +
      'attempt count asserted in the anti-storm scenario)',
  }),
  Object.freeze({
    id: 'single-cluster-active-owner',
    command: ANTI_STORM_COMMAND,
    detail: 'the startup active-gate owner remains the SOLE cluster-ACTIVE ' +
      'authority: the witness consumes the snapshot observation owner ' +
      '(control-plane-snapshot-owner resolveControlSnapshot) and never ' +
      'derives cluster-ACTIVE from nodes.status, publishedActive, or snapshot ' +
      'coverage counts (no second ACTIVE authority)',
  }),
  Object.freeze({
    id: 'typed-owner-interaction-contract',
    command: ANTI_STORM_COMMAND,
    detail: 'the StartupActiveGateOwner -> AuthoritativeDiscoveryRepairOwner ' +
      'boundary returns a typed disposition: the anti-storm scenario asserts ' +
      'the deferred/applied/reused shape the repair owner hands the ' +
      'active-gate owner (repaired / reused / deferred(retryAfterMs) / ' +
      'unavailable)',
  }),
  Object.freeze({
    id: 'active-definitions-inventory',
    command: INVENTORY_COMMAND,
    detail: 'architecture/active-definitions-inventory.md exists ' +
      'and classifies all four ACTIVE definitions (nodes.status=active, ' +
      'publishedActive membership, snapshot active=N/M projection, and the ' +
      'cluster-ACTIVE gate as sole authority) with producer/consumer citations',
  }),
  Object.freeze({
    id: 'convergence-after-evidence-advances',
    command: CONVERGENCE_COMMAND,
    detail: 'HONEST RED WITNESS (expected fail today): after a transient ' +
      'repair failure defers and the underlying authoritative/cache/discovery ' +
      'evidence subsequently advances, the active-gate owner must be ' +
      're-driven by that evidence and converge to a fresh/READY observation ' +
      'WITHOUT weakening the backoff and WITHOUT waiting for it to expire. ' +
      'Today red: no level-trigger invalidates the stale repair-deferred ' +
      'observation, so the rebuilt snapshot stays stale_usable',
  }),
  Object.freeze({
    id: 'anti-storm-bounded-under-persistent-failure',
    command: ANTI_STORM_COMMAND,
    detail: 'GREEN today, must stay green: under a PERSISTENT repair failure ' +
      'the e2797b6c8 anti-storm containment stays intact — bounded repair ' +
      'attempt count, no recursive/parallel amplification, and the deferred ' +
      'failure observation is the reused owner decision',
  }),
  Object.freeze({
    id: 'no-force-bypass-of-failure-backoff',
    command: ANTI_STORM_COMMAND,
    detail: 'GREEN today, must stay green: the forceAuthoritativeRepair -> ' +
      'bypassReuse:true escalation does NOT bypass the failure-deferral ' +
      'branch of resolveRecentAuthoritativeDiscoveryRepairFailure — every ' +
      'forced call during the backoff returns deferred and admits no new ' +
      'authoritative reads',
  }),
  Object.freeze({
    id: 'no-second-active-authority',
    command: INVENTORY_COMMAND,
    detail: 'the inventory classifies the cluster-ACTIVE gate as the sole ' +
      'authority and nodes.status/publishedActive/snapshot coverage as ' +
      'producer-local facts or evidence; the witness never asserts ' +
      'cluster-ACTIVE from any of them, so no second ACTIVE authority exists',
  }),
  Object.freeze({
    id: 'no-timeout-reduction-as-fix',
    command: ANTI_STORM_COMMAND,
    detail: 'the witness uses a controllable clock and asserts the repair ' +
      'owner returns a real bounded retryAfterMs that callers honor (never ' +
      'shortened to fit a deadline): the backoff is binding, so the fix ' +
      'cannot be a widened/reduced timeout or a smaller backoff',
  }),
]);

const QUEST_ID = 'active-gate-authoritative-repair-convergence';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'active-gate-authoritative-repair-convergence.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
