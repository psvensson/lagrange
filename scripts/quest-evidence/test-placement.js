#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'test-placement';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PLACEMENT_TEST = 'test/scripts/test-placement.test.js';
const FLEET_TEST = 'test/scripts/lab-fleet-discovery.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['spread-by-measured-cost', PLACEMENT_TEST,
    '^placement spreads files by measured duration and machine speed$',
    'longest file first to the machine that finishes it soonest; a machine ' +
    'that would not repay its setup is left out'],
  ['only-ready-distinct-machines', PLACEMENT_TEST,
    '^only a ready, distinct, reachable machine receives files$',
    'not ready, unreachable, the controller reached twice and a machine ' +
    'without a checkout path or shared history receive nothing'],
  ['local-when-placement-cannot-help', PLACEMENT_TEST,
    '^a small plan, a tree that is not a commit or an empty fleet runs locally$',
    'placement never probes for a plan cheaper than a setup and never sends ' +
    'a working tree'],
  ['remote-red-decided-on-controller', PLACEMENT_TEST,
    '^a file red on a lab machine is decided on the controller and routed away after$',
    'a lab machine only makes greens faster; a miss is reported and remembered'],
  ['unrunnable-shard-falls-back', PLACEMENT_TEST,
    '^a shard its machine could not run is run on the controller$',
    'setup failure, a busy machine, a lost connection and the deadline all ' +
    'fall back to the controller'],
  ['exact-commit-nothing-left-behind', PLACEMENT_TEST,
    '^a lab machine proves the exact commit in a throwaway worktree and leaves nothing behind$',
    'the bundle brings the commit, the worktree is verified at it, and the ' +
    'worktree, ref and bundle are gone afterwards'],
  ['deadline-kills-process-group', FLEET_TEST,
    '^a capture deadline kills the whole process group$',
    'a hung grandchild does not outlive the deadline'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
