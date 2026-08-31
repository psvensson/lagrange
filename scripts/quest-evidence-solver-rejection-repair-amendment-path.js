// Deterministic evidence harness for the solver-rejection-repair-amendment-path
// quest: receipt declarations only. The shared runtime re-runs each recorded
// proof command and writes the test-receipt probe artifact.
//
// Receipt honesty: the witness uses raw node:test (not the repo tap shim), so
// --test-name-pattern selects exactly one anchored scenario per receipt.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST = 'test/solve/rejection-repair-amendment-path.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'rejection-binds-to-sealed-review-manifest',
    command: scenarioCommand('^rejection-binds-to-sealed-review-manifest'),
    detail: 'a verifier-rejection records against the sealed review manifest ' +
      'fingerprint on a root whose worktree bytes no current-bytes projection ' +
      'could reproduce. This is the whole point: a rejection is a claim about ' +
      'the bytes that WERE reviewed, and repairing them is what makes those ' +
      'bytes non-current, so binding the check to the worktree made the ' +
      'strengthen-after-rejection path unreachable',
  }),
  Object.freeze({
    id: 'rejection-binding-refuses-wrong-fingerprint',
    command: scenarioCommand('^rejection-binding-refuses-wrong-fingerprint'),
    detail: 'a fingerprint that does not equal the sealed manifest value is ' +
      'refused naming the review id, so review binding is a real check and ' +
      'not a way to launder an arbitrary fingerprint',
  }),
  Object.freeze({
    id: 'rejection-requires-review-when-one-exists',
    command: scenarioCommand('^rejection-requires-review-when-one-exists'),
    detail: 'once a review has been minted for the quest, an attempt-scope ' +
      'rejection without --review is refused. This closes the hole where ' +
      'attempt scope validated NOTHING: its fingerprint was accepted ' +
      'unchecked, so the one path that stayed usable after repair proved ' +
      'nothing at all',
  }),
  Object.freeze({
    id: 'receipt-bar-strengthen-needs-no-rejection-finding',
    command: scenarioCommand(
      '^receipt-bar-strengthen-needs-no-rejection-finding'),
    detail: 'adding required receipts succeeds on a quest with zero recorded ' +
      'findings, and the result passes ensureSealedGoal. Strengthening is ' +
      'monotone, so gating it behind a rejection finding was the dead end ' +
      'that forced a successor quest',
  }),
  Object.freeze({
    id: 'receipt-bar-strengthen-refuses-removal',
    command: scenarioCommand('^receipt-bar-strengthen-refuses-removal'),
    detail: 'dropping a sealed receipt is refused naming the dropped id; a ' +
      'no-op restatement is refused; DUPLICATE padding ([a,b] -> [a,b,b]) is ' +
      'refused, which a length comparison would have accepted while adding ' +
      'nothing; and non-string, null, object, empty, whitespace-only and ' +
      'whitespace-PADDED ids are refused, because such a receipt could never ' +
      'be satisfied and this kind could never drop it, so accepting one would ' +
      'brick the oracle. A refused amendment leaves the quest byte-identical. ' +
      'Mutation-verified: removing either the type/empty test or the ' +
      'duplicate test reds this scenario',
  }),
  Object.freeze({
    id: 'receipt-bar-strengthen-preserves-sibling-args',
    command: scenarioCommand(
      '^receipt-bar-strengthen-preserves-sibling-args'),
    detail: 'a sealed doneWhen arg other than requiredReceipts (minRuns) can ' +
      'be neither dropped nor rewritten: the key set must match exactly and ' +
      'every sibling value must be byte-identical. Checking only for ' +
      'UNEXPECTED keys was one-directional and let a sealed arg be weakened ' +
      'with no verifier gate at all. Also pins the intrinsics defense: with ' +
      'Object.prototype.file polluted, args that omit file are refused, ' +
      'because a plain inherited read would have accepted them and silently ' +
      'dropped the sealed key from the saved oracle. Mutation-verified: ' +
      'weakening ownValue to a plain read reds this scenario',
  }),
  Object.freeze({
    id: 'receipt-bar-strengthen-refuses-probe-or-file-change',
    command: scenarioCommand(
      '^receipt-bar-strengthen-refuses-probe-or-file-change'),
    detail: 'swapping the receipt file is refused, and smuggling any key that ' +
      'was not in the sealed args is refused: the oracle itself stays ' +
      'immutable, which is what makes the kind safe without a rejection gate',
  }),
  Object.freeze({
    id: 'receipt-bar-strengthen-updates-frontier-metric',
    command: scenarioCommand(
      '^receipt-bar-strengthen-updates-frontier-metric'),
    detail: 'the frontier sharing the doneWhen oracle is raised too, while a ' +
      'frontier on a different receipt file is untouched. The test-receipt ' +
      'probe measures ONLY requiredReceipts, so raising doneWhen alone would ' +
      'have raised a bar that nothing measures',
  }),
  Object.freeze({
    id: 'scope-validated-before-bytes',
    command: scenarioCommand('^scope-validated-before-bytes'),
    detail: 'aggregate and both on a rejection both report the actionable ' +
      'attempt|candidate message and never a bytes mismatch — asserted on a ' +
      'quest that HAS a candidate-contract attempt, which is the only shape ' +
      'that discriminates: without one the bytes branch never runs and the ' +
      'pre-change code throws the identical string, so the same assertion on ' +
      'an attempt-less fixture was a receipt that could not fail (verified by ' +
      'mutation: removing the reorder now reds exactly this scenario)',
  }),
  Object.freeze({
    id: 'amend-refusal-names-the-actionable-flags',
    command: scenarioCommand('^amend-refusal-names-the-actionable-flags'),
    detail: 'the refusal names --kind verifier-rejection, --review, ' +
      '--verification-fingerprint and points at receipt-bar-strengthen for ' +
      'pure strengthening, so a caller is not left discovering five required ' +
      'flags one refusal at a time',
  }),
  Object.freeze({
    id: 'existing-amendment-kinds-unchanged',
    command: scenarioCommand('^existing-amendment-kinds-unchanged'),
    detail: 'CONTROL — the sealed amendment vocabulary still lists the four ' +
      'prior kinds in order, class-correction still needs no verifier ' +
      'finding, and applyAmendments still projects it. Must stay green',
  }),
  Object.freeze({
    id: 'existing-rejection-flow-unchanged',
    command: scenarioCommand('^existing-rejection-flow-unchanged'),
    detail: 'CONTROL — a quest with NO minted review keeps the previous ' +
      'attempt-scope contract, so the review requirement binds exactly where ' +
      'a sealed referent exists and the existing CLI contract tests that ' +
      'model review-less quests are unaffected. Must stay green',
  }),
  Object.freeze({
    id: 'review-binding-refuses-another-quests-review',
    command: scenarioCommand(
      '^review-binding-refuses-another-quests-review'),
    detail: 'a review minted for a DIFFERENT quest cannot launder its ' +
      'fingerprint into this quest\'s log: reviewManifestSection checks ' +
      'manifest.questId, the refusal names it, and nothing is recorded. ' +
      'Without this scenario the guard had zero coverage and its deletion ' +
      'left the whole bar green',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'three runs on three fresh temp roots produce one identical ' +
      'doneWhen + frontier-args projection, so the receipt cannot pass by ' +
      'leftover state in a reused root',
  }),
]);

const QUEST_ID = 'solver-rejection-repair-amendment-path';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'solver-rejection-repair-amendment-path.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
