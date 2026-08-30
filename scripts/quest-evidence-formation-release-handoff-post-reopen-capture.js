// Deterministic evidence harness for the
// formation-release-handoff-post-reopen-capture quest: receipt declarations
// only. The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/formation-release-handoff-post-reopen-capture.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting
// a claim, so a regression that flips a witness red flips this receipt to
// fail and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (2d0c6f6e9, before the cure) the
// post-reopen-completion-captures-successor,
// late-joiner-consumes-successor-and-releases, successor-capture-bounded,
// successor-capture-fails-closed and witness-deterministic receipts are RED
// (GCP run 2026-08-30T10-05-10.109Z: gen-1 completed at 10:08:06.455 with the
// reopen already observed, no successor generation was captured, and joiners
// n3/n4 waited 54–55 s on the raw spread predicate with no contract);
// pre-reopen-capture-unchanged, no-candidates-no-capture and
// pair-witnesses-unchanged are green and must stay green — a cure that turns
// them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/control-plane/formation-release-handoff-post-reopen-capture.test.js';
const PAIR_WITNESS_TESTS = Object.freeze([
  'test/control-plane/formation-release-handoff-closure.test.js',
  'test/control-plane/formation-release-handoff-consumer-parity.test.js',
]);
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const PAIR_WITNESS_COMMAND_PREFIX = 'npm run test:file -- ';
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
    id: 'post-reopen-completion-captures-successor',
    command: scenarioCommand('^post-reopen-completion-captures-successor'),
    detail: 'a captured generation completing while the compatible reopen ' +
      '(observedAuthorityReady=false, priority_partitions_not_spread) is ' +
      'already observed admits the successor generation for the pre-ready ' +
      'JOINING candidates on the next evaluation (complete e:1 then active ' +
      'e:2, the 09-59 two-evaluation shape) with the completed generation\'s ' +
      'authority node, boot incarnation, fence identity and publication ' +
      'epoch, non-authorizing until the durable acknowledgement',
  }),
  Object.freeze({
    id: 'late-joiner-consumes-successor-and-releases',
    command: scenarioCommand('^late-joiner-consumes-successor-and-releases'),
    detail: 'a distinct joiner process reaching the barrier after gen-1 ' +
      'completed under the reopen consumes the successor through the real ' +
      'CONSUMER validation (join-branch fence, acceptor-reply-only router ' +
      'evidence) and the real operation-ledger formation barrier releases ' +
      'ledger_spread_satisfied from it while the raw spread predicate is ' +
      'still pending; a joiner with no contract still fails closed',
  }),
  Object.freeze({
    id: 'pre-reopen-capture-unchanged',
    command: scenarioCommand('^pre-reopen-capture-unchanged'),
    detail: 'gen-1 completing with the authority READY still captures gen-2 ' +
      'on the READY path with the identical transition sequence (capture, ' +
      'acknowledgement, epoch growth, completion, successor capture, ' +
      'successor acknowledgement, retained reopen) and the late joiner ' +
      'consumes it',
  }),
  Object.freeze({
    id: 'no-candidates-no-capture',
    command: scenarioCommand('^no-candidates-no-capture'),
    detail: 'a completion under the reopen with no pre-ready candidate mints ' +
      'nothing across repeated evaluations: four transitions (capture, ' +
      'acknowledgement, reopen, completion), three durable writes, and the ' +
      'contract stays complete',
  }),
  Object.freeze({
    id: 'successor-capture-bounded',
    command: scenarioCommand('^successor-capture-bounded'),
    detail: 'repeated evaluations under the reopen after the successor ' +
      'capture mint no further generation, log no transition, issue no ' +
      'durable write, and leave the publication coordinator diagnostics ' +
      'unchanged (exactly one successor generation per completed generation)',
  }),
  Object.freeze({
    id: 'successor-capture-fails-closed',
    command: scenarioCommand('^successor-capture-fails-closed'),
    detail: 'a JOINING row whose primary connection the seed has not adopted ' +
      'is not a capturable member until it is adopted (capture rule ' +
      'unchanged); a substantive authority block between completion and the ' +
      'next evaluation closes the successor admission for good (only the READY ' +
      'path captures afterwards); a captured successor member losing its ' +
      'primary connection revokes the successor fail-closed, the late joiner ' +
      'projection is null, the revoked cohort is not re-minted under the ' +
      'reopen nor on the same epoch, and only a READY authority on a newer ' +
      'epoch mints again',
  }),
  Object.freeze({
    id: 'pair-witnesses-unchanged',
    command: PAIR_WITNESS_COMMAND_PREFIX + PAIR_WITNESS_TESTS.join(SPACE),
    detail: 'both registered witnesses of the ' +
      'formation-release-seed-contract-joiner-consumer pair stay green: the ' +
      'closure suite (capture, retention, revocation, restore, publication ' +
      'coordinator) and the consumer-parity witness (13 scenarios incl. ' +
      'seed-capture-retention-revocation-unchanged and ' +
      'budgets-and-single-owner-unchanged)',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical virtual-clock drives produce the identical ' +
      'transition sequence, successor contract and late-joiner projection, ' +
      'ending in the consumed successor generation',
  }),
]);

const QUEST_ID = 'formation-release-handoff-post-reopen-capture';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'formation-release-handoff-post-reopen-capture.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
