#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'artifact-retention-routine';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PRUNE_TEST = 'test/scripts/prune-test-output.test.js';
const PUBLISH_UNIT_TEST = 'test/scripts/publish-head-workspace-links.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['age-is-newest-content', PRUNE_TEST,
    '^keeps a directory whose own mtime is old when its contents are fresh$',
    'a directory rewritten in place is judged by what it contains, while a ' +
    'directory old inside and out is still pruned'],
  ['worktree-parents-never-pruned', PRUNE_TEST,
    '^never age-prunes the parent of a registered git worktree$',
    'rm -rf on a registered worktree would leave a registration pointing at ' +
    'nothing, so those parents are reserved'],
  ['harness-history-survives', PRUNE_TEST,
    '^keeps the newest harness reports even when newer model reports exist$',
    'the report floor is spent on the reports the harness history reads, ' +
    'not on model reports rewritten in place'],
  ['deep-activity-counts', PRUNE_TEST,
    '^keeps a tree whose only recent activity is a directory deep inside it$',
    'a directory date anywhere in the tree counts as activity'],
  ['future-dates-do-not-pin', PRUNE_TEST,
    '^does not let a future-dated file pin a stale tree$',
    'a timestamp in the future is not freshness'],
  ['bad-entry-never-stops-retention', PRUNE_TEST,
    '^one entry it cannot measure never stops the rest of the prune$',
    'an unmeasurable entry is kept and the prune proceeds'],
  ['live-test-results-kept', PRUNE_TEST,
    '^keeps an old result for a test that exists and drops one for a test that does not$',
    'the dispatch history survives; only results of deleted tests age out'],
  ['written-during-the-walk-counts', PRUNE_TEST,
    '^keeps a tree written a moment ahead of the clock$',
    'each date is judged against the clock when it is read, with a tolerance, ' +
    'so a live tree is never mistaken for an abandoned one'],
  ['far-future-is-no-freshness', PRUNE_TEST,
    '^a far-future date is no freshness for any entry$',
    'top-level files, directory dates and reports obey the same rule'],
  ['playback-folders-by-content', PRUNE_TEST,
    '^judges a playback folder by its newest content$',
    'playback folders are aged by what they contain'],
  ['unreadable-kept-and-named', PRUNE_TEST,
    '^keeps and names what it cannot read, and prunes the rest$',
    'what cannot be read is kept, named on the line the publisher prints, ' +
    'and the prune goes on'],
  ['failed-delete-does-not-stop', PRUNE_TEST,
    '^a delete that fails is reported and the others still happen$',
    'a delete that fails is reported and every later category still prunes'],
  ['unknown-test-file-kept', PRUNE_TEST,
    '^drops a result whose path runs through a file and keeps one it may not check$',
    'only a definite absence ages a test result out'],
  ['retention-never-fails-a-publish', PUBLISH_UNIT_TEST,
    '^retention is bounded and never fails a finished publish$',
    'a failed or throwing prune is reported and the publish stands'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
