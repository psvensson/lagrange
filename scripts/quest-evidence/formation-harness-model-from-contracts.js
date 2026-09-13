#!/usr/bin/env node
/**
 * Receipt harness for formation-harness-model-from-contracts. Each claim is a
 * named scenario in test/distributed/harness/__tests__/owner-interaction-model.test.js.
 *
 * The four receipts separate: the checklist being derived from the registry
 * and fully hosted; each host being a real production owner with sealed
 * drive methods; every invariant owner being hosted; and the stand-in family
 * being gone. The last one is the mechanism by which the model went stale.
 */

import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'formation-harness-model-from-contracts';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS_TEST =
  'test/distributed/harness/__tests__/owner-interaction-model.test.js';
const PATH_JOINER = '/';

const RECEIPT = Object.freeze([
  ['registered-interactions-all-hosted',
    '^every registered owner interaction is hosted by the harness model$',
    'the checklist is derived from the coupled pairs and contracts in the ' +
    'registry, and every entry is accounted for by a host in the model'],
  ['hosts-are-real-owners-with-sealed-drive',
    '^every hosted interaction hosts the real owner with sealed drive methods$',
    'each host names existing production modules and seals the methods a ' +
    'stand-in would override, in the driver-host shape'],
  ['invariant-owners-hosted',
    '^every registry-bound invariant is hosted and every unbound citation is named$',
    'every invariant whose contract the registry knows binds to that ' +
    'contract\'s host, and every citation the registry does not know is ' +
    'listed in the derived model with its invariant id, so the gap is a ' +
    'reported number that formation-contracts-registration drives to zero'],
  ['seams-are-contract-bound',
    '^every seam in the model is contract-bound and points at where the owner is real$',
    'a seam is declared on its registry pair with the stand-in module, the ' +
    'contract cases both legs run, the conformance run and the real-owner ' +
    'test, all existing and the latter two witnesses of the pair'],
  ['stand-in-family-removed',
    '^no registered owner is replaced by a hand-wired stand-in$',
    'the hand-wired constructors that replaced registered owners in the ' +
    'membership-consistency helpers are gone'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testNamePattern, detail]) =>
    Object.freeze({id, testFile: WITNESS_TEST, testNamePattern, detail}))),
});
