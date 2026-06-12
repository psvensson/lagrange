/**
 * CL-031 step (c): oracle snapshot-query transport failures must classify as
 * oracle_blind — naming the transport error — never as a cluster
 * stall/timeout. Covers the shared blindness tracker/classifier and the
 * settle oracle (waitForConvergence) wiring end-to-end against stub nodes
 * whose snapshot lane always fails (the 'Max payload size exceeded' shape
 * from gate 20260612T173105Z).
 */

import {test} from '../../../../src/test-helpers/tap.js';
import {
  ORACLE_BLIND_CLASSIFICATION,
  buildOracleBlindFailureMessage,
  createOracleBlindnessTracker,
  markOracleBlindError,
  resolveActiveWaitOracleBlindness,
  resolveSnapshotCoverageBlindness,
} from '../oracle-blindness.js';
import {ASSERTIONS_SEGMENT_2} from '../assertions-segment-2.js';

const {waitForConvergence} = ASSERTIONS_SEGMENT_2;

const TRANSPORT_ERROR =
  'Admin API query failed for node seed on lane snapshot: ' +
  'Max payload size exceeded';

test('tracker: all polls blind => blind at decision', async (t) => {
  const tracker = createOracleBlindnessTracker();
  tracker.recordBlindPoll(TRANSPORT_ERROR, 1000);
  t.equal(tracker.isBlindAtDecision(), true,
    'a single blind poll with no sighted polls is blind');
  const summary = tracker.summarize(2000);
  t.equal(summary.classification, ORACLE_BLIND_CLASSIFICATION);
  t.equal(summary.blindPolls, 1);
  t.equal(summary.totalPolls, 1);
  t.equal(summary.lastBlindError, TRANSPORT_ERROR);
  t.equal(summary.lastReadableEvidenceAgeMs, null,
    'never-sighted oracle has no readable-evidence age');
});

test('tracker: a single trailing blind poll after sighted polls does NOT ' +
  'flip the verdict; two do', async (t) => {
  const tracker = createOracleBlindnessTracker();
  tracker.recordSightedPoll(1000);
  tracker.recordSightedPoll(2000);
  tracker.recordBlindPoll(TRANSPORT_ERROR, 3000);
  t.equal(tracker.isBlindAtDecision(), false,
    'one trailing transport hiccup keeps the genuine verdict');
  tracker.recordBlindPoll(TRANSPORT_ERROR, 4000);
  t.equal(tracker.isBlindAtDecision(), true,
    'a sustained trailing blind streak is blind at decision');
  const summary = tracker.summarize(5000);
  t.equal(summary.trailingBlindPolls, 2);
  t.equal(summary.lastSightedAtMs, 2000);
  t.equal(summary.lastReadableEvidenceAgeMs, 3000);
});

test('tracker: a sighted poll resets the trailing blind streak', async (t) => {
  const tracker = createOracleBlindnessTracker();
  tracker.recordBlindPoll(TRANSPORT_ERROR, 1000);
  tracker.recordBlindPoll(TRANSPORT_ERROR, 2000);
  tracker.recordSightedPoll(3000);
  t.equal(tracker.isBlindAtDecision(), false,
    'readable evidence at decision time means not blind');
});

test('blind failure message names the classification and transport error, ' +
  'and never claims a cluster stall/timeout', async (t) => {
  const tracker = createOracleBlindnessTracker();
  tracker.recordBlindPoll(TRANSPORT_ERROR, 1000);
  const message = buildOracleBlindFailureMessage({
    oracleName: 'Convergence settle',
    summary: tracker.summarize(2000),
    budgetMs: 300000,
    elapsedMs: 12345,
  });
  t.match(message, /classification=oracle_blind/);
  t.match(message, /Max payload size exceeded/);
  t.match(message, /NOT adjudicable/);
  t.notMatch(message, /stalled after/i);
});

test('markOracleBlindError stamps classification and diagnostics', async (t) => {
  const tracker = createOracleBlindnessTracker();
  tracker.recordBlindPoll(TRANSPORT_ERROR, 1000);
  const summary = tracker.summarize(2000);
  const bare = markOracleBlindError(new Error('x'), summary);
  t.equal(bare.classification, ORACLE_BLIND_CLASSIFICATION);
  t.same(bare.diagnostics.oracleBlind, summary);
  const withDiagnostics = new Error('y');
  withDiagnostics.diagnostics = {existing: true};
  markOracleBlindError(withDiagnostics, summary);
  t.equal(withDiagnostics.diagnostics.existing, true,
    'existing diagnostics preserved');
  t.same(withDiagnostics.diagnostics.oracleBlind, summary);
});

test('resolveSnapshotCoverageBlindness: blind only when every probe ' +
  'witness failed', async (t) => {
  t.same(resolveSnapshotCoverageBlindness(null),
    {blind: false, transportError: null},
    'no coverage probe = not blind (nothing was attempted)');
  t.same(resolveSnapshotCoverageBlindness({probeWitnesses: []}),
    {blind: false, transportError: null});
  t.equal(resolveSnapshotCoverageBlindness({
    probeWitnesses: [
      {nodeId: 'a', snapshotQuerySucceeded: false, error: TRANSPORT_ERROR},
      {nodeId: 'b', snapshotQuerySucceeded: true, error: null},
    ],
  }).blind, false, 'one sighted witness = not blind');
  const allFailed = resolveSnapshotCoverageBlindness({
    selectedError: TRANSPORT_ERROR,
    probeWitnesses: [
      {nodeId: 'a', snapshotQuerySucceeded: false, error: TRANSPORT_ERROR},
      {nodeId: 'b', snapshotQuerySucceeded: false, error: TRANSPORT_ERROR},
    ],
  });
  t.equal(allFailed.blind, true);
  t.equal(allFailed.transportError, TRANSPORT_ERROR);
});

test('resolveActiveWaitOracleBlindness: readable node-level inactivity ' +
  'evidence outranks snapshot blindness', async (t) => {
  const blindCoverage = {
    selectedError: TRANSPORT_ERROR,
    probeWitnesses: [
      {nodeId: 'a', snapshotQuerySucceeded: false, error: TRANSPORT_ERROR},
    ],
  };
  t.equal(resolveActiveWaitOracleBlindness({
    snapshotCoverage: blindCoverage,
    nodeDiagnostics: [
      {nodeId: 'a', active: true},
      {nodeId: 'b', active: false, error: 'Node status probe timed out'},
    ],
  }).blind, false,
  'a non-active node is a readable cluster-facing fact — not blind');
  const allHealthy = resolveActiveWaitOracleBlindness({
    snapshotCoverage: blindCoverage,
    nodeDiagnostics: [
      {nodeId: 'a', active: true},
      {nodeId: 'b', active: true},
    ],
  });
  t.equal(allHealthy.blind, true,
    'nodes all active + gate evidence unreadable = the 173105Z blind shape');
  t.equal(allHealthy.transportError, TRANSPORT_ERROR);
  t.equal(resolveActiveWaitOracleBlindness({
    snapshotCoverage: {probeWitnesses: [
      {nodeId: 'a', snapshotQuerySucceeded: true, error: null},
    ]},
    nodeDiagnostics: [{nodeId: 'a', active: true}],
  }).blind, false, 'sighted coverage is never blind');
});

function buildBlindStubNode(id) {
  return {
    id,
    getReachabilityDiagnostics: async () => ({
      nodeId: id,
      reachable: true,
      adminReady: true,
      reachableBy: 'stub',
      lastError: null,
    }),
    getControlSnapshot: async () => {
      throw new Error(TRANSPORT_ERROR);
    },
  };
}

test('settle oracle (waitForConvergence) fails as oracle_blind when every ' +
  'snapshot read fails on both lanes', async (t) => {
  const nodes = [buildBlindStubNode('seed'), buildBlindStubNode('joiner-1')];
  let thrown = null;
  try {
    await waitForConvergence(nodes, {
      settleTimeoutMs: 400,
      quietWindowMs: 50,
      sampleIntervalMs: 25,
      snapshotTimeoutMs: 50,
      reachabilityTimeoutMs: 50,
      maxSustainedOverTargetMs: 1000,
      targetVoterCount: 3,
    });
  } catch (error) {
    thrown = error;
  }
  t.ok(thrown, 'must fail (no evidence could be read)');
  t.equal(thrown.classification, ORACLE_BLIND_CLASSIFICATION,
    'error carries the oracle_blind classification (red on wiring revert)');
  t.match(thrown.message, /oracle blind/i,
    'message leads with the blind verdict');
  t.match(thrown.message, /Max payload size exceeded/,
    'message names the snapshot transport error');
  t.notMatch(thrown.message, /^Convergence stalled/,
    'must not report a cluster stall');
  t.notMatch(thrown.message, /^Convergence timeout/,
    'must not report a cluster timeout');
  t.equal(thrown.diagnostics.reason, ORACLE_BLIND_CLASSIFICATION,
    'diagnostics reason is the classification');
  t.ok(thrown.diagnostics.oracleBlind.blindPolls > 0,
    'blindness stats ride along in diagnostics');
  t.equal(thrown.diagnostics.oracleBlind.blindPolls,
    thrown.diagnostics.oracleBlind.totalPolls,
    'every poll was blind in this scenario');
});

test('settle oracle keeps the genuine stall/timeout verdict when evidence ' +
  'was readable at decision time', async (t) => {
  // Sighted stub: snapshot reads succeed but show a permanently
  // over-target partition, so the wait genuinely times out.
  const sightedNode = {
    id: 'seed',
    getReachabilityDiagnostics: async () => ({
      nodeId: 'seed',
      reachable: true,
      adminReady: true,
      reachableBy: 'stub',
      lastError: null,
    }),
    getControlSnapshot: async () => ({
      rows: [{
        nodes: ['seed'],
        partitions: ['p1'],
        voterCounts: {p1: 5},
        leaders: {p1: 'seed-addr'},
        services: [],
        replicaOperations: {rows: [], inFlightCount: 1},
      }],
    }),
  };
  let thrown = null;
  try {
    await waitForConvergence([sightedNode], {
      settleTimeoutMs: 300,
      quietWindowMs: 50,
      sampleIntervalMs: 25,
      snapshotTimeoutMs: 50,
      reachabilityTimeoutMs: 50,
      maxSustainedOverTargetMs: 1000,
      targetVoterCount: 3,
    });
  } catch (error) {
    thrown = error;
  }
  t.ok(thrown, 'must fail (in-flight operation never drains)');
  t.not(thrown.classification, ORACLE_BLIND_CLASSIFICATION,
    'sighted failures keep their genuine classification');
  t.match(thrown.message, /^Convergence (stalled|timeout)/,
    'genuine verdict preserved');
  t.equal(thrown.diagnostics.oracleBlind.blindPolls, 0,
    'blindness stats still recorded for sighted runs');
});
