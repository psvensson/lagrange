/**
 * Characterization of the completed copy stages that bounded admin
 * replica-operation summaries report per ADD/REPLACE row: only an adjacent
 * pair linked by previousStep, owned by the row's operation and ordered in
 * time is a completed visit, and the most recent visit of a stage is kept.
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {compactReplicaOperationSummary} from
  '../../src/admin/admin-replica-operation-summary-compaction.js';

const OPERATION_ID = 'op-copy-stages';

function stagesOf(stepsHistory, type = 'ADD') {
  const {rows} = compactReplicaOperationSummary({
    livenessSummary: {rows: [{
      operationId: OPERATION_ID, type, workflowStep: 'ACTIVE', stepsHistory,
    }]},
    livenessOptions: {},
  });
  assert.equal(rows.length, 1);
  return rows[0].completedCopyStages;
}

test('an adjacent owned and ordered handoff is one completed copy stage', () => {
  assert.deepEqual(stagesOf([
    {step: 'SYNCING', timestamp: 1000, ownerKey: OPERATION_ID},
    {step: 'ACTIVE', previousStep: 'SYNCING', timestamp: 1600},
  ]), {SYNCING: {startedAtMs: 1000, endedAtMs: 1600, nextStep: 'ACTIVE', durationMs: 600}});
});

test('an entry owned by another operation is not a completed stage of this one', () => {
  assert.equal(stagesOf([
    {step: 'SYNCING', timestamp: 1000, ownerKey: 'op-other'},
    {step: 'ACTIVE', previousStep: 'SYNCING', timestamp: 1600},
  ]), null, 'a foreign owner on the start entry');
  assert.equal(stagesOf([
    {step: 'SYNCING', timestamp: 1000},
    {step: 'ACTIVE', previousStep: 'SYNCING', timestamp: 1600, ownerKey: 'op-other'},
  ]), null, 'a foreign owner on the end entry');
});

test('unordered or non-finite timestamps never yield a duration', () => {
  assert.equal(stagesOf([
    {step: 'CREATING', timestamp: 2000},
    {step: 'SYNCING', previousStep: 'CREATING', timestamp: 1000},
  ]), null, 'the end precedes the start');
  assert.equal(stagesOf([
    {step: 'CREATING', timestamp: Number.NaN},
    {step: 'SYNCING', previousStep: 'CREATING', timestamp: 1000},
  ]), null, 'a non-finite start');
});

test('only a linked step change out of a copy phase counts', () => {
  assert.equal(stagesOf([
    {step: 'CREATING', timestamp: 1000},
    {step: 'SYNCING', previousStep: 'PENDING', timestamp: 1500},
  ]), null, 'previousStep names another step');
  assert.equal(stagesOf([
    {step: 'SYNCING', timestamp: 1000},
    {step: 'SYNCING', previousStep: 'SYNCING', timestamp: 1500},
  ]), null, 'a repeated step is not a handoff');
  assert.equal(stagesOf([
    {step: 'ACTIVE', timestamp: 1000},
    {step: 'STOPPING', previousStep: 'ACTIVE', timestamp: 1500},
  ]), null, 'ACTIVE is not a copy phase');
});

test('the most recent visit of a stage is the one reported', () => {
  assert.deepEqual(stagesOf([
    {step: 'CREATING', timestamp: 100},
    {step: 'SYNCING', previousStep: 'CREATING', timestamp: 200},
    {step: 'CREATING', previousStep: 'SYNCING', timestamp: 300},
    {step: 'SYNCING', previousStep: 'CREATING', timestamp: 450},
  ]), {
    CREATING: {startedAtMs: 300, endedAtMs: 450, nextStep: 'SYNCING', durationMs: 150},
    SYNCING: {startedAtMs: 200, endedAtMs: 300, nextStep: 'CREATING', durationMs: 100},
  });
});

test('a REMOVE is not a copy and reports no stages', () => {
  assert.equal(stagesOf([
    {step: 'SYNCING', timestamp: 1000},
    {step: 'ACTIVE', previousStep: 'SYNCING', timestamp: 1600},
  ], 'REMOVE'), null);
});
