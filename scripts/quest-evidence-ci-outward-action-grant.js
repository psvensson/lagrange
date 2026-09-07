#!/usr/bin/env node
/**
 * Receipt harness for ci-outward-action-grant. Each claim is a named scenario
 * in test/scripts/action-grant.test.js, except the last, which reads the
 * workflow itself: a grant nothing requires would prove nothing.
 */

import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'ci-outward-action-grant';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS_TEST = 'test/scripts/action-grant.test.js';
const WORKFLOW_WITNESS = 'test/scripts/release-workflow-grant.test.js';
const PATH_JOINER = '/';

const RECEIPT = Object.freeze([
  ['an-executor-cannot-proceed-without-a-grant', WITNESS_TEST,
    '^an executor cannot proceed without a grant$',
    'the default is refusal: with no decision recorded, the step cannot run'],
  ['the-authority-decides-and-the-grant-records-it', WITNESS_TEST,
    '^the authority decides, and a grant records that it did$',
    'the decision happens before the noninteractive executor, and the grant is ' +
    'its record'],
  ['a-grant-for-one-subject-authorizes-no-other', WITNESS_TEST,
    '^a grant for one subject authorizes no other$',
    'authority cannot be carried from one release to another'],
  ['a-grant-for-one-action-authorizes-no-other', WITNESS_TEST,
    '^a grant for one action authorizes no other$',
    'authorizing an image push does not authorize creating a release'],
  ['a-grant-does-not-survive-its-head', WITNESS_TEST,
    '^a grant does not survive the head it was issued for$',
    'the decision was about a tree; moving the tree invalidates it rather than ' +
    'carrying it forward silently'],
  ['a-forged-grant-is-not-an-authorization', WITNESS_TEST,
    '^a forged grant is not an authorization$',
    'the load-bearing one: requiring a grant re-asks the authority, so a file ' +
    'naming an unregistered action authorizes nothing'],
  ['an-unreadable-grant-is-a-refusal', WITNESS_TEST,
    '^an unreadable grant is a refusal, not an absence of one$',
    'not being able to read the decision is not the same as there being none ' +
    'to make'],
  ['the-authority-refuses-to-issue-what-it-would-not-permit', WITNESS_TEST,
    '^the authority refuses to issue what it would not permit$',
    'issuing is asking; a refusal writes nothing'],
  ['the-workflow-cannot-act-without-requiring-its-grant', WORKFLOW_WITNESS,
    '^every outward workflow step requires its grant before it acts$',
    'the grant is required on the path, ahead of the command that acts, rather ' +
    'than issued and ignored'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
