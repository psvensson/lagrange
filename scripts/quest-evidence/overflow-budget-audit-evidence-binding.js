#!/usr/bin/env node
// The successor quest's evidence harness. The audit it inherits was upheld on
// content and rejected on three ordinary defects (D1 hand-written finding and
// external-artifact truth, D2 receipts that are pointers rather than
// bindings, D3 two hand-off rows carrying does_not_depend together with
// explicit-authority-required). These fifteen receipts are the whole of the
// successor: the D3 correction and its derived gate consequence, the row-bound
// evidence, the derived finding and artifact truth, the monotonic gate, the
// pin on everything inherited, and the freeze that waits for an approving
// verification.
//
// The closed audit's twelve receipts are NOT re-declared here: the receipt
// `inherited-audit-receipts-still-green` re-runs them from the closed quest's
// own receipt record, so that record is read and never rewritten.
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'overflow-budget-audit-evidence-binding';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const D3_TEST = 'test/rebalancer/overflow-budget-d3-correction.test.js';
const BINDING_TEST = 'test/rebalancer/overflow-budget-evidence-binding.test.js';
const DERIVED_TEST = 'test/rebalancer/overflow-budget-derived-truth.test.js';
const PIN_TEST = 'test/rebalancer/overflow-budget-round3-pin.test.js';
const INHERITED_TEST =
  'test/rebalancer/overflow-budget-inherited-receipts.test.js';
const FREEZE_TEST = 'test/rebalancer/overflow-budget-audit-freeze.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['d3-handoff-rows-corrected-with-domain-qualification', D3_TEST,
    '^the two hand-off rows carry the disposition that fits a measured does_not_depend$',
    'both hand-off rows leave explicit-authority-required for the existing ' +
      'disposition that fits, with a structured domain qualification whose ' +
      'subject is a budget-dependent authority requirement and never the ' +
      'relocation; the spread-recovery finding and the repair group stay ' +
      'and no ledger authority appears'],
  ['gate-item-3-follows-from-the-corrected-rows-by-derivation', D3_TEST,
    '^gate item 3 selects the corrected rows and derives its own status$',
    'item 3 selects by disposition, so the corrected rows leave its support ' +
      'by selection; its selection minimum is re-pinned as the recorded ' +
      'mechanical consequence and its status comes out of deriveGateStatus'],
  ['inherited-round-3-content-unchanged-except-d3', PIN_TEST,
    '^every inherited round-3 value is pinned and unchanged except the D3 correction$',
    'a digest of each upheld row and of every other inherited section at its ' +
      'round-3 content, minus the named representational fields the ' +
      'successor replaces; the exclusion list is declared in the pin itself'],
  ['every-dependency-receipt-is-row-field-value-domain-bound', BINDING_TEST,
    '^every dependency receipt binds the row, the field, the value and the domain$',
    'each row resolves its dependency receipt by id and the validator ' +
      'compares the bound row id, kind, classification field, expected ' +
      'value, domain id and witness identity against the row\'s own values'],
  ['every-producer-reachability-receipt-is-row-and-producer-bound', BINDING_TEST,
    '^every producer-reachability receipt binds the row and the producer it drove$',
    'a producerReachable yes resolves a real-chain receipt naming this row ' +
      'and one of this row\'s producers, carrying the producer and ' +
      'transition facts the drive established'],
  ['measuring-tests-emit-the-receipts-they-are-cited-for', BINDING_TEST,
    '^the committed receipts are the ones the measuring tests emit$',
    'the measuring tests emit their receipts and the committed receipt file ' +
      'is compared to that emission byte for byte, so it cannot be hand-written'],
  ['receipt-binding-mutants-all-fail-structurally', BINDING_TEST,
    '^every receipt-binding mutant fails structurally$',
    'swap a receipt between rows, change the row id, change the expected ' +
      'value, cite a valid unrelated differential, cite a real-chain ' +
      'receipt for another producer, remove the binding, change the domain, ' +
      'point at an unknown receipt - each run against the real validator'],
  ['finding-resolution-derives-from-resolution-artifacts', DERIVED_TEST,
    '^a finding is resolved only by a resolution artifact that names it$',
    'a gate-blocking finding carries no open flag; it is resolved only by a ' +
      'resolution artifact that exists, parses, names the finding and ' +
      'carries a compatible result'],
  ['external-artifacts-are-observed-from-repository-state', DERIVED_TEST,
    '^a required external artifact is observed from repository state$',
    'no exists flag: the observation reads the repository from a given root ' +
      '- the artifact is present, is of the required kind, names the gate ' +
      'requirement and, for a quest, is sealed and approved'],
  ['gate-item-8-stays-not-yet-under-any-audit-metadata-edit', DERIVED_TEST,
    '^gate item 8 stays not-yet under every audit metadata edit$',
    'the round-3 attack (open false, unlink, exists true) and its variants ' +
      'run against the real validator and derivation; item 8 never reaches ' +
      'demonstrated'],
  ['gate-derivation-is-monotonic-under-removal-corruption-and-substitution',
    DERIVED_TEST,
    '^gate derivation is monotonic under removal, corruption and substitution$',
    'the six inherited monotonicity mutants plus the D1 and D2 cases: ' +
      'removing a row, a receipt, a binding, an artifact or a finding, ' +
      'falsely closing a finding, falsely presenting an artifact and ' +
      'substituting another row\'s or another requirement\'s evidence'],
  ['the-three-round-3-attacks-no-longer-work', DERIVED_TEST,
    '^the three round-3 attacks no longer work$',
    'the verifier\'s own three attacks, literally: item 8 (and items 6 and ' +
      '7) demonstrated by metadata; a flipped dependency citing an ' +
      'unrelated test and a producerReachable yes citing a file that only ' +
      'declares itself real-chain; and the D3 combination itself'],
  ['inherited-audit-receipts-still-green', INHERITED_TEST,
    '^the twelve inherited audit receipts are re-run and green$',
    'the closed audit\'s own receipt record is read, and each of its twelve ' +
      'recorded proof commands is re-run against this worktree; the closed ' +
      'record itself is never rewritten'],
  ['no-production-file-changed', PIN_TEST,
    '^no production file changed in this quest\'s worktree$',
    'the worktree carries no change under src, examples, .github or ' +
      '.githooks, committed or uncommitted'],
  ['freeze-manifest-names-an-approving-verification-and-matches-the-frozen-bytes',
    FREEZE_TEST,
    '^the freeze manifest names an approving verification and matches the frozen bytes$',
    'the manifest digests the matrix, the gate document, the evidence ' +
      'bindings and the epoch inventory, names the approving verification in ' +
      'this quest\'s log, and is refused while that verification is absent ' +
      'or followed by a rejection'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
