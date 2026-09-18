#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'lab-worker-provisioning';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PROVISION_TEST = 'test/scripts/lab-worker-provisioning.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['canary-toolchain-verbatim', PROVISION_TEST,
    '^the worker setup installs the canary toolchain as the canary does$',
    'the canary install and dataset steps are embedded line for line, and ' +
    'generation refuses a workflow without them'],
  ['every-checked-tool-provisioned', PROVISION_TEST,
    '^every tool discovery checks is provisioned$',
    'each tool the fleet probe checks has a source in the setup'],
  ['refuses-before-asking', PROVISION_TEST,
    '^the worker setup refuses a machine it cannot provision before asking for anything$',
    'a machine that is not Linux, not x86_64, has no apt-get or is root is ' +
    'refused before sudo is asked'],
  ['valid-bash-no-host', PROVISION_TEST,
    '^the worker setup is valid bash built only from what it is given$',
    'bash -n passes; the clone URL and keys are inputs, and an ssh origin ' +
    'becomes an https clone URL'],
  ['checkout-moves-only-when-nothing-lost', PROVISION_TEST,
    '^the worker setup moves a checkout to main only when nothing is lost$',
    'main fast-forwards and a contained detached HEAD follows; local changes, ' +
    'other branches and local commits are left alone'],
  ['provision-writes-and-copies', PROVISION_TEST,
    '^provision writes the setup, or copies it to a registered worker and names the command$',
    'the file is written executable; the copy uses bounded scp and never runs it'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
