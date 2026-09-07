/**
 * A certification verdict is decided by the gate that runs the window. These
 * scenarios pin the one thing the projector adds - making that verdict
 * observable - and, more importantly, pin what it must never do: recompute the
 * verdict, or let a window the sealed population does not admit read as
 * certified.
 *
 * The fixtures are real aggregates in the shape the stat gate writes, so a
 * change to that shape breaks these rather than passing silently.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {certificationShortfalls} from '../../scripts/checks/certification-verdict.js';

const SCENARIO = 'rolling-restart';
const SEALED_BAR = 0.357;
const SEALED_RUNS = 15;
const REPORTS = 'test-output/reports';

function certifiedAggregate(overrides = {}) {
  const verdict = {
    verdict: 'ABOVE_BAR',
    passes: 13,
    runs: SEALED_RUNS,
    wilson: {lowerBound: 0.6, upperBound: 0.98, pointEstimate: 0.87, confidence: 0.95},
    safetyCounts: {corrupt: 0, nodeExit: 0, oracleBlind: 0, staleSource: 0,
      acknowledgedWriteLoss: 0, acknowledgedWriteUnverified: 0},
    safetyClean: true,
    sealedBar: SEALED_BAR,
    ...overrides.gateVerdict,
  };
  return {
    scenario: SCENARIO,
    certificationMode: true,
    workingTreeClean: true,
    sourceCommit: 'b8ee3a0556e81b5917c72a2dbea3441fef3b8cc0',
    srcFingerprint: 'd6f8ba107ba2045c',
    staleSourceRuns: 0,
    runs: SEALED_RUNS,
    nodeCount: 5,
    hardwareClass: 'calibrated-local-container-v1',
    workloadIdentity: 'rolling-restart-acknowledged-write-load-v1',
    failureScheduleIdentity: 'sequential-non-seed-rolling-restart-v1',
    calibration: {machineFactor: 1},
    classTally: {CONVERGED: 13, STALLED: 2},
    wallSeconds: {p50: 370, p95: 454},
    contributingReports: Array.from({length: SEALED_RUNS},
      (_unused, index) => `${REPORTS}/stat-gate-run${index + 1}.report.json`),
    ...overrides,
    gateVerdict: verdict,
  };
}

// A repository root carrying one aggregate and the real sealed-bar file.
function rootWith(aggregate) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'certification-'));
  const reports = path.join(root, REPORTS);
  fs.mkdirSync(reports, {recursive: true});
  fs.writeFileSync(path.join(reports, 'stat-gate-20260907T000000Z.json'),
    JSON.stringify(aggregate));
  const config = path.join(root, 'test/distributed/config');
  fs.mkdirSync(config, {recursive: true});
  fs.copyFileSync('test/distributed/config/convergence-sealed-bars.json',
    path.join(config, 'convergence-sealed-bars.json'));
  return root;
}

function shortfalls(aggregate) {
  return certificationShortfalls({root: rootWith(aggregate), scenario: SCENARIO});
}

test('a certified window projects as satisfied', () => {
  assert.deepEqual(shortfalls(certifiedAggregate()), []);
});

test('the projector reads the owner verdict rather than deciding for itself', () => {
  // The pass rate here would clear the bar on any recalculation, and the
  // interval says so, but the owner classified the window below the bar. The
  // owner's answer is the answer.
  const disagreeing = certifiedAggregate({gateVerdict: {verdict: 'BELOW_BAR'}});
  assert.deepEqual(shortfalls(disagreeing),
    ['the window does not carry the owner\'s verdict above the bar']);
});

test('a lowered bar is refused rather than met', () => {
  // The gate recorded a bar the sealed file does not seal. The projector
  // compares the two and refuses; it never adopts the number in the aggregate.
  const lowered = certifiedAggregate({gateVerdict: {sealedBar: 0.1,
    wilson: {lowerBound: 0.2, upperBound: 0.5, pointEstimate: 0.3, confidence: 0.95}}});
  const found = shortfalls(lowered);
  assert.ok(found.includes('the window does not carry the bar the file seals'));
  assert.ok(found.includes(
    'the window does not carry a reported bound at or above the bar'));
});

test('a safety breach is not outweighed by the statistics', () => {
  const breached = certifiedAggregate({gateVerdict: {safetyClean: false}});
  assert.deepEqual(shortfalls(breached),
    ['the window does not carry every safety counter at zero']);
});

test('a window the sealed population does not admit is refused', () => {
  for (const [field, value, missing] of [
    ['runs', 9, 'the sealed run count'],
    ['nodeCount', 3, 'the sealed node count'],
    ['hardwareClass', 'somebody-elses-laptop', 'the sealed hardware class'],
    ['workloadIdentity', 'a-different-workload', 'the sealed workload'],
    ['failureScheduleIdentity', 'a-different-schedule', 'the sealed failure schedule'],
    ['certificationMode', false, 'certification mode'],
    ['workingTreeClean', false, 'clean working tree'],
    ['staleSourceRuns', 2, 'no stale-source runs'],
    ['srcFingerprint', '', 'one source fingerprint'],
  ]) {
    const found = shortfalls(certifiedAggregate({[field]: value}));
    assert.ok(found.includes(`the window does not carry ${missing}`),
      `${field}=${value} was admitted: ${found.join('; ')}`);
  }
});

test('a window missing one contributing report is refused', () => {
  const short = certifiedAggregate();
  short.contributingReports = short.contributingReports.slice(1);
  assert.ok(shortfalls(short).includes(
    'the window does not carry one contributing report per run'));
});

test('an absent window is not a satisfied one', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'certification-empty-'));
  const config = path.join(root, 'test/distributed/config');
  fs.mkdirSync(config, {recursive: true});
  fs.copyFileSync('test/distributed/config/convergence-sealed-bars.json',
    path.join(config, 'convergence-sealed-bars.json'));
  assert.deepEqual(certificationShortfalls({root, scenario: SCENARIO}),
    ['rolling-restart has no certification window']);
});

test('the projector is generic over the scenario', () => {
  // A second certification must not mean a second checker: any scenario the
  // sealed-bar file carries is projected by naming it.
  const other = 'snapshot-live-rebuild';
  assert.deepEqual(
    certificationShortfalls({root: rootWith(certifiedAggregate()), scenario: other}),
    [`${other} has no certification window`],
    'the projector answered about a scenario it was not asked about');
  assert.deepEqual(
    certificationShortfalls({root: rootWith(certifiedAggregate()),
      scenario: 'a-scenario-nobody-sealed'}),
    ['a-scenario-nobody-sealed has no sealed bar']);
});
