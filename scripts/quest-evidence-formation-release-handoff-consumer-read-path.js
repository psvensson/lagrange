// Deterministic evidence harness for the
// formation-release-handoff-consumer-read-path quest: receipt declarations
// only. The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/formation-release-handoff-consumer-read-path.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (dae475a3b, before the cure) the
// non-hosting-joiner-reads-authority-publication-during-recovery,
// no-contract-sentinel-is-typed-absent, cached-authority-row-fallback-validated,
// consumer-validation-predicates-unchanged,
// barrier-releases-within-retained-generation and witness-deterministic
// receipts are RED (a joiner hosting no control_plane_publications replica
// has no routable candidate for the consumer durable read while every replica
// host is recovery-pending, and the projection treats the truthy no-contract
// token as a row, so the cached authority row is never consumed);
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
    id: 'non-hosting-joiner-reads-authority-publication-during-recovery',
    command: scenarioCommand(
      '^non-hosting-joiner-reads-authority-publication-during-recovery',
    ),
    detail: 'a joiner hosting no control_plane_publications replica reads ' +
      'the authority publication through the real owner read options, the ' +
      'real frozen read-authority token and the real priority-recovery ' +
      'bootstrap routing grace while every replica host is ' +
      'recovery-pending (no cached row), projects the retained generation ' +
      'active with releaseAuthorized true; an ordinary publication read of ' +
      'the same row on the same host is still refused, the publications ' +
      'owner defaults every read to the eligible-only lane, and the seed\'s ' +
      'own durable readbacks carry no lane',
  }),
  Object.freeze({
    id: 'no-contract-sentinel-is-typed-absent',
    command: scenarioCommand('^no-contract-sentinel-is-typed-absent'),
    detail: 'a refused durable read reports the typed no-contract token; ' +
      'the publication module\'s selectFormationReleaseHandoffContractSource ' +
      'yields {source: cache} for it and for null when the cache holds the ' +
      'row, {source: none} when neither source holds a row, and ' +
      '{source: durable} when the durable read holds one; the projection ' +
      'consumes the cached row as active',
  }),
  Object.freeze({
    id: 'cached-authority-row-fallback-validated',
    command: scenarioCommand('^cached-authority-row-fallback-validated'),
    detail: 'the cached row is consumed only through the CONSUMER ' +
      'validation (authority-published fence identity), while a cached row ' +
      'of a different authority incarnation, against a regressed epoch, ' +
      'with a tampered projection, or of a revoked generation stays null',
  }),
  Object.freeze({
    id: 'consumer-validation-predicates-unchanged',
    command: scenarioCommand('^consumer-validation-predicates-unchanged'),
    detail: 'through both the bootstrap-lane durable read and the cached ' +
      'fallback the non-hosting joiner consumes the retained generation ' +
      '(with and without a local fence) while a different authority ' +
      'incarnation, a regressed epoch, an incompatible topology, a ' +
      'restarted joiner incarnation, a disallowed local fence, a ' +
      'substantive block and a revoked generation each still fail closed',
  }),
  Object.freeze({
    id: 'barrier-releases-within-retained-generation',
    command: scenarioCommand('^barrier-releases-within-retained-generation'),
    detail: 'the real awaitOperationLedgerFormationBarrier loop of a ' +
      'non-hosting joiner resolves ledger_spread_satisfied from the retained ' +
      'generation through the bootstrap-lane durable read and through the ' +
      'cached fallback while the raw spread predicate is still pending; ' +
      'with a refused read and no cached row it stays ' +
      'waiting_for_startup_authority and times out',
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
    id: 'budgets-and-single-owner-unchanged',
    command: scenarioCommand('^budgets-and-single-owner-unchanged'),
    detail: 'the 60 s certification window and the 120 s internal barrier ' +
      'timeout are the HEAD values, the joiner binds the seed as the sole ' +
      'formation-release authority, exactly one durable write (on the seed) ' +
      'mints the generation, and the seed\'s durable readbacks carry no ' +
      'recovery-routing lane',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical drives produce the identical seed transition ' +
      'sequence and the identical hosting, non-hosting routed and ' +
      'non-hosting cached joiner projections',
  }),
]);

const QUEST_ID = 'formation-release-handoff-consumer-read-path';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'formation-release-handoff-consumer-read-path.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
