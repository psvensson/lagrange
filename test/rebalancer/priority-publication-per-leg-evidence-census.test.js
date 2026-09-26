// Static census (fix-f1, the evidence record section 9 "the dead per-leg
// evidence maps"): the per-leg priority-publication handoff evidence - the
// source-leader handoff and replacement-election evidence maps, the stall
// anchor and its escalation, the continuation snapshot, and the four leg
// states - is deleted from production and from every test. A partition
// REPLACE's leadership is decided by its named-target handoff (the REPLACE
// owner). PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE stays: the user-table
// leader-placement cure reads its retry interval.
//
// A symbol that comes back turns this census red; re-adding one needs an
// owner decision, not an edit here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../../src/rebalancer/operation-workflow-owner-shared.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url))
  .split(path.sep).join('/');

const DELETED_SYMBOLS = Object.freeze([
  'getPriorityPublicationLeaderHandoffEvidenceMap',
  'getPriorityPublicationLeaderHandoffEvidence',
  'getPriorityPublicationReplacementLeaderElectionEvidenceMap',
  'getPriorityPublicationReplacementLeaderElectionEvidence',
  'getFreshPriorityPublicationReplacementLeaderElectionEvidence',
  'getPriorityPublicationSourceLeaderHandoffRequestedAtMap',
  'recordPriorityPublicationSourceLeaderHandoffRequested',
  'getPriorityPublicationSourceLeaderHandoffStallMs',
  'recordPriorityPublicationLeaderHandoffEvidence',
  'recordPriorityPublicationReplacementLeaderElectionEvidence',
  'isPriorityPublicationLeaderHandoffRetrySuppressed',
  'priorityPublicationLeaderHandoffEvidenceByOperationId',
  'priorityPublicationReplacementLeaderElectionEvidenceByOperationId',
  'priorityPublicationSourceLeaderHandoffRequestedAtByOperationId',
  'PRIORITY_PUBLICATION_SOURCE_LEADER_HANDOFF_STALL_TTL_MS',
  'PRIORITY_PUBLICATION_SOURCE_HANDOFF_ESCALATE_AFTER_MS',
  'buildRemoveSafetyHandoffContinuationSnapshot',
  'decideRemoveSafetyHandoffContinuation',
  'resolveRemoveSafetyHandoffContinuationState',
  'REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE',
  'REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION',
  'REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION_BY_STATE',
  'REQUEST_SOURCE_LEADER_HANDOFF',
  'REQUEST_REPLACEMENT_LEADER_ELECTION',
  'FAIL_REPLACEMENT_REPLICA_NOT_FOUND',
  'WAIT_REPLACEMENT_LEADER_OWNERSHIP',
]);

const DELETED_LEG_STATES = Object.freeze([
  'REQUEST_SOURCE_LEADER_HANDOFF',
  'REQUEST_REPLACEMENT_LEADER_ELECTION',
  'FAIL_REPLACEMENT_REPLICA_NOT_FOUND',
  'WAIT_REPLACEMENT_LEADER_OWNERSHIP',
]);

function jsFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return jsFiles(resolved);
    }
    return entry.isFile() && /\.(?:m?js)$/u.test(entry.name) ? [resolved] : [];
  });
}

// Source text without comments, so a mention in prose is no use.
function codeOf(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:'"`])\/\/.*$/gmu, '$1');
}

const FILES = ['src', 'test', 'scripts'].flatMap((directory) =>
  jsFiles(path.join(ROOT, directory)))
  .map((file) => ({
    relative: path.relative(ROOT, file).split(path.sep).join('/'),
    code: codeOf(file),
  }))
  .filter(({relative}) => relative !== SELF);

test('the per-leg handoff evidence symbols are gone from src, test and ' +
  'scripts', () => {
  const found = [];
  for (const symbol of DELETED_SYMBOLS) {
    const pattern = new RegExp(`\\b${symbol}\\b`, 'u');
    for (const {relative, code} of FILES) {
      if (pattern.test(code)) {
        found.push(`${symbol} in ${relative}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

test('the leader-remove-safety states hold no per-leg state', () => {
  const states = Object.keys(
    OPERATION_WORKFLOW_OWNER_SHARED.PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE);
  assert.deepEqual(
    DELETED_LEG_STATES.filter((state) => states.includes(state)), []);
});

test('PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE stays, read by the ' +
  'user-table leader-placement cure only', () => {
  assert.ok(Number.isFinite(OPERATION_WORKFLOW_OWNER_SHARED
    .PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE.REQUEST_RETRY_AFTER_MS));
  const readers = FILES.filter(({relative, code}) =>
    relative.startsWith('src/') &&
    /PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE\.\w/u.test(code))
    .map(({relative}) => relative);
  assert.deepEqual(readers, ['src/rebalancer/user-table-leader-placement-cure.js']);
});
