#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'fleet-capability-discovery';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const FLEET_TEST = 'test/scripts/lab-fleet-discovery.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['transcript-to-capability', FLEET_TEST,
    '^a probe transcript becomes a capability record$',
    'one probe transcript per machine becomes a typed capability record'],
  ['unknown-is-not-capable', FLEET_TEST,
    '^an unreported fact is unknown, never a capability the machine was not shown to have$',
    'a missing fact reads as unknown, never as present or absent'],
  ['readiness-names-every-reason', FLEET_TEST,
    '^readiness names every reason a machine cannot run the corpus$',
    'node floor, repository, lockfile and dependencies disqualify; ' +
    'partial tools and the dataset are gaps for placement'],
  ['one-machine-reached-twice', FLEET_TEST,
    '^discovery probes every machine and recognises one reached twice$',
    'the controller listed in the inventory is one machine, and an ' +
    'unreachable one is reported, never assumed ready'],
  ['controller-probed-like-a-node', FLEET_TEST,
    '^the controller is probed by the same script it sends to a lab node$',
    'one script for every machine, with the remote path quoted for the ' +
    'remote shell'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
