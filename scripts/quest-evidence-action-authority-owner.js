#!/usr/bin/env node
/**
 * Receipt harness for action-authority-owner. Each claim is a named scenario
 * in test/scripts/action-authority.test.js.
 *
 * The claims fall in two halves. The first four are the decision itself: a
 * closed door by default, a signal that authorizes only what it names, an
 * unregistered action refused, and unavailable never read as permission. The
 * rest are the shape around it: every outward action this repository performs
 * asks the same owner, the record store still only remembers, and the owner
 * itself cannot act.
 */

import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'action-authority-owner';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS_TEST = 'test/scripts/action-authority.test.js';
const PATH_JOINER = '/';

const RECEIPT = Object.freeze([
  ['absent-authorization-refuses-rather-than-failing-open',
    '^absent authorization refuses rather than failing open$',
    'no registered action proceeds because nothing said no; an action that ' +
    'needs a signal and has none is refused, and the only actions that pass ' +
    'without one are those carrying a declared standing authority'],
  ['an-authorization-for-one-action-does-not-authorize-another',
    '^an authorization for one action does not authorize another$',
    'a signal names the action it authorizes and is evaluated only under that ' +
    'action\'s rule, so authority cannot be carried sideways'],
  ['an-unregistered-outward-action-refuses-by-default',
    '^an unregistered outward action refuses by default$',
    'an outward action nobody has written authorization semantics for is ' +
    'refused until they exist, so introducing one cannot open a door by ' +
    'omission'],
  ['unavailable-never-permits-an-action',
    '^unavailable never permits an action$',
    'when the authority cannot determine the answer it says so in a named ' +
    'result, and that result is not permission'],
  ['publication-consumes-the-authority-and-interprets-no-signals',
    '^publication consumes the authority and interprets no signals$',
    'the publisher asks and then acts; it no longer decides whether a ' +
    'red-branch signal is good, and no longer reads the record store'],
  ['evidence-replacement-consumes-the-authority',
    '^evidence replacement consumes the authority$',
    'replacing a shared evidence asset is irreversible and now asks'],
  ['package-release-consumes-the-authority',
    '^package release consumes the authority$',
    'publishing to a public registry cannot be taken back and now asks'],
  ['cloud-provisioning-consumes-the-authority',
    '^cloud provisioning consumes the authority$',
    'both paths that create cloud hosts ask, rather than provisioning ' +
    'because a configuration key was present'],
  ['release-tag-publication-is-registered-and-performed-nowhere',
    '^release tag publication is registered and performed nowhere$',
    'the action is registered so that code performing it must ask, and no ' +
    'code was written to perform it in order to prove that it would be ' +
    'refused'],
  ['the-record-store-decides-nothing',
    '^the record store decides nothing$',
    'the exemption store remains the persistence owner: it does not reach ' +
    'into the authority and does not name an outcome'],
  ['the-authority-performs-no-action',
    '^the authority performs no action$',
    'the owner decides and returns; it runs nothing and writes nothing, so it ' +
    'cannot become a second place an outward action happens'],
  ['every-registered-action-declares-its-signal',
    '^every registered action declares its signal$',
    'each registered action states what would authorize it, so the registry ' +
    'is a set of locks rather than a list of names'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testNamePattern, detail]) =>
    Object.freeze({id, testFile: WITNESS_TEST, testNamePattern, detail}))),
});
