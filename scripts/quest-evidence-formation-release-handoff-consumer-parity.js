// Deterministic evidence harness for the
// formation-release-handoff-consumer-parity quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/formation-release-handoff-consumer-parity.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (ce0e4942d, before the cure) the
// joiner-projects-active-handoff-from-seed-contract,
// joiner-fence-identity-is-authority-published,
// joiner-release-authorized-across-spread-reopen,
// barrier-resolves-ledger-spread-satisfied-from-authority and
// witness-deterministic receipts are RED (the joiner consumer projection nulls
// the seed-owned retained generation because it compares the reader's own
// admission-fence hash against the authority-published fence, and demands a
// bound connection to every other cohort member), and
// analyzer-teardown-revocation-not-stranded is RED (a teardown-time valid
// disconnect revocation was classified stranded);
// seed-capture-retention-revocation-unchanged and
// budgets-and-single-owner-unchanged are green and must stay green — a cure
// that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/control-plane/formation-release-handoff-consumer-parity.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

// One verbatim proof command per scenario. node --test --test-name-pattern
// selects exactly one top-level witness scenario by its anchored name, so a
// green receipt is honest (its scenario exits 0) and a red receipt is honest
// (its scenario exits non-zero).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'joiner-projects-active-handoff-from-seed-contract',
    command: scenarioCommand(
      '^joiner-projects-active-handoff-from-seed-contract',
    ),
    detail: 'a distinct joiner process (join-branch admission ' +
      'cluster-incarnation-fence states, router evidence from the acceptor ' +
      'IDENTIFY reply only) projects the seed-owned durable generation as ' +
      'formationReleaseHandoff.state active with releaseAuthorized true and ' +
      'startupAuthorityReady true while its local owner stays idle and ' +
      'never publishes',
  }),
  Object.freeze({
    id: 'joiner-fence-identity-is-authority-published',
    command: scenarioCommand('^joiner-fence-identity-is-authority-published'),
    detail: 'the consumed contract carries the authority-published fence ' +
      'identity (provably different from the joiner admission-fence hash, ' +
      'and consumed with no local fence at all) while a different authority ' +
      'incarnation, a regressed epoch, an incompatible topology, a restarted ' +
      'joiner incarnation, a disallowed local fence, a substantive block, ' +
      'and a revoked generation each still fail closed',
  }),
  Object.freeze({
    id: 'joiner-release-authorized-across-spread-reopen',
    command: scenarioCommand('^joiner-release-authorized-across-spread-reopen'),
    detail: 'the joiner holds the same authorized generation before the ' +
      'priority-spread reopen, during it (its own view recovery_pending with ' +
      'priority_partitions_not_spread), and after the spread recovers',
  }),
  Object.freeze({
    id: 'barrier-resolves-ledger-spread-satisfied-from-authority',
    command: scenarioCommand(
      '^barrier-resolves-ledger-spread-satisfied-from-authority',
    ),
    detail: 'the real awaitOperationLedgerFormationBarrier loop resolves ' +
      'ledger_spread_satisfied from the whole-plane authority answer ' +
      '(startupAuthorityReady true, handoff active) while the raw spread ' +
      'predicate is still pending; without the seed-owned durable contract ' +
      'the same barrier stays waiting_for_startup_authority and times out',
  }),
  Object.freeze({
    id: 'seed-capture-retention-revocation-unchanged',
    command: scenarioCommand('^seed-capture-retention-revocation-unchanged'),
    detail: 'the seed closure suite ' +
      '(test/control-plane/formation-release-handoff-closure.test.js) still ' +
      'passes 136/136 and the seed owner still captures non-authorizing, ' +
      'authorizes on durable acknowledgement, retains across the reopen, ' +
      'and revokes captured_cohort_member_ineligible on a member disconnect',
  }),
  Object.freeze({
    id: 'analyzer-teardown-revocation-not-stranded',
    command: scenarioCommand('^analyzer-teardown-revocation-not-stranded'),
    detail: 'with the run\'s real event shapes, a captured generation ' +
      'revoked captured_cohort_member_ineligible after the authority\'s ' +
      '"Bootstrap readiness marked draining" event is classified ' +
      'teardown_truncated (not stranded, retained across the reopen), the ' +
      'same revocation before draining stays stranded, and a ' +
      'startup_authority_incompatible revocation stays invalid',
  }),
  Object.freeze({
    id: 'budgets-and-single-owner-unchanged',
    command: scenarioCommand('^budgets-and-single-owner-unchanged'),
    detail: 'the 60 s certification window and the 120 s internal barrier ' +
      'timeout are the HEAD values, the joiner binds the seed as the sole ' +
      'formation-release authority, and exactly one durable write (on the ' +
      'seed) mints the generation',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical drives produce the identical seed transition ' +
      'sequence and joiner projection',
  }),
]);

const QUEST_ID = 'formation-release-handoff-consumer-parity';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'formation-release-handoff-consumer-parity.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
