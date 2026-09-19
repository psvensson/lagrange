// Witness for the lease-liveness-watermark-observed quest, receipt 5.
// Raw node:test so the anchored receipt runner selects exactly one scenario.
//
// SCOPE. The quest adds observation and nothing else. The witness is a
// DIFFERENTIAL AGAINST MAIN, not a restatement of the new code: the golden
// file beside the grid module was produced by running that module against
// f9d388499 before any source change existed, and this test re-evaluates the
// same grid and requires byte equality after removing exactly the fields the
// quest adds. The grid covers the stale watermark and its ready-lease
// witness, how often the nodes rows are read per evaluation, the
// authoritative repair trigger and the table set it selects, the snapshot
// observation state and its reason codes, the lease sweeper's skip and
// disconnect decisions over four sweeps of six transport scenarios, and the
// admission observer's classification and transition history.
//
// The comparison is run twice: once with no logger (the shape main has) and
// once with the logger the quest injects. The second run must emit watermark
// transition lines, or the neutrality it witnesses would be vacuous.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CONTROL_SNAPSHOT_STALE_WATERMARK_LOG_MSG,
  CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION,
} from '../../src/admin/admin-control-snapshot-stale-watermark-record.js';
import {
  buildLeaseLivenessDecisionGrid,
} from './lease-liveness-decision-grid.js';

const GOLDEN_FILE_URL = new URL(
  './lease-liveness-decision-grid.golden.json',
  import.meta.url,
);
const UTF8 = 'utf8';
const ADDED_TRANSITION_FIELDS = Object.freeze([
  'readyLeaseWitness',
  'latestReadyLeaseWitness',
  'readyLeaseWitnessChangeCount',
]);
const ADDED_SKIP_FIELDS = Object.freeze([
  'skippedNodeId',
  'leaseExpiredForMs',
  'skippedForMs',
]);

function readGolden() {
  return JSON.parse(fs.readFileSync(GOLDEN_FILE_URL, UTF8));
}

function stripAddedSkipFields(grid, counters) {
  for (const scenario of grid.leaseSweeps) {
    for (const sweep of scenario.sweeps) {
      for (const line of sweep.skipLines) {
        counters.skipLines += 1;
        for (const field of ADDED_SKIP_FIELDS) {
          if (Object.hasOwn(line.fields, field)) {
            counters.strippedSkipFields += 1;
            delete line.fields[field];
          }
        }
      }
    }
  }
}

function stripAddedTransitionFields(grid, counters) {
  for (const transition of grid.observer.transitions) {
    counters.transitions += 1;
    for (const field of ADDED_TRANSITION_FIELDS) {
      if (Object.hasOwn(transition, field)) {
        counters.strippedWitnesses += 1;
        delete transition[field];
      }
    }
  }
}

function stripAddedFields(grid) {
  const counters = {
    skipLines: 0,
    strippedSkipFields: 0,
    transitions: 0,
    strippedWitnesses: 0,
  };
  stripAddedSkipFields(grid, counters);
  stripAddedTransitionFields(grid, counters);
  return counters;
}

function buildCapturingLogger(lines) {
  return {
    info(message, fields) {
      lines.push({message, fields});
    },
  };
}

test('every decision on the grid matches the differential against main',
  async () => {
    const golden = readGolden();

    const silentGrid = await buildLeaseLivenessDecisionGrid();
    const silentCounters = stripAddedFields(silentGrid);
    assert.deepEqual(silentGrid, golden,
      'with no logger injected, every decision is main\'s decision');

    const lines = [];
    const observedGrid = await buildLeaseLivenessDecisionGrid({
      logger: buildCapturingLogger(lines),
    });
    const observedCounters = stripAddedFields(observedGrid);
    assert.deepEqual(observedGrid, golden,
      'with the logger injected, every decision is still main\'s decision');

    assert.ok(observedCounters.skipLines > 0,
      'the grid exercised the skipped-lease-disconnect line');
    assert.equal(
      observedCounters.strippedSkipFields,
      observedCounters.skipLines * ADDED_SKIP_FIELDS.length,
      'every skip line carried exactly the two added fields');
    assert.ok(observedCounters.transitions > 0,
      'the grid exercised the admission observer transition history');
    assert.equal(
      observedCounters.strippedWitnesses,
      observedCounters.transitions * ADDED_TRANSITION_FIELDS.length,
      'every observer transition carried every added witness field');
    assert.deepEqual(silentCounters, observedCounters,
      'injecting the logger changes neither line nor transition counts');

    assert.ok(observedGrid.hostileLoggers.length > 1,
      'the grid drove both call paths through hostile logger shapes');
    for (const outcome of observedGrid.hostileLoggers) {
      assert.equal(outcome.thrown, null,
        `a logger shape must never reach the caller: ${outcome.name}`);
    }
    const capturedAtSeries = observedGrid.outOfOrder.map(
      (entry) => entry.capturedAt);
    assert.ok(
      capturedAtSeries.some((value, index) =>
        index > 0 && value < capturedAtSeries[index - 1]),
      'the grid evaluated observations that arrived out of order');

    const transitionLines = lines.filter((line) =>
      line.message === CONTROL_SNAPSHOT_STALE_WATERMARK_LOG_MSG.TRANSITION);
    assert.ok(transitionLines.length > 0,
      'the observing run observed, so the comparison is not vacuous');
    assert.ok(
      transitionLines.some((line) =>
        line.fields.transition ===
          CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.SET),
      'the observing run recorded at least one watermark set transition');
  });
