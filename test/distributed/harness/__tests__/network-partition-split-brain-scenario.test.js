import {test} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/network-partition-split-brain.js';
import {attemptDiagnosticMarker} from '../../scenarios/network-partition-marker.js';
import {diagnosticMarkerLogId} from
  '../../../../src/control-plane/owners/log-diagnostic-marker-contract.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

function fixture(minorityAnswer = {success: false, errorCode: 'ADMIN_OWNER_NOT_READY'},
  completeUnknownAfterHeal = false) {
  let healed = false;
  const calls = [];
  const rows = new Map();
  let unknownIntent = null;
  const nodes = arrayMap(['seed-1', 'joiner-1', 'joiner-2'], (id) => ({id,
    async query(sql, params) {
      assert.ok(stringStartsWith(sql, 'SELECT'), 'fault callers cannot write SQL');
      if (stringIncludes(sql, 'FROM services')) {
        return [{service_id: `logs-p1-${id}`,
          service_type: 'partition', node_id: id, partition_id: 'logs-p1',
          raft_role: id === 'seed-1' ? 'leader' : 'follower', status: 'active',
          address: id + ':8080'}];
      }
      return rows.has(params[0]) ? [{log_id: params[0]}] : [];
    },
    async appendDiagnosticMarker(marker) {
      assert.equal(healed, false, 'all original marker attempts occur during the held fault');
      const logId = diagnosticMarkerLogId(marker.markerId);
      calls.push({nodeId: id, marker});
      if (id === 'joiner-2') {
        unknownIntent = logId;
        return minorityAnswer;
      }
      rows.set(logId, marker);
      return {success: true, markerState: 'recorded', logId, nodeId: id};
    }}));
  return {calls, cluster: {getNodes: () => nodes,
    partitionNetwork: async () => calls.push('partition'),
    healPartition: async () => {
      healed = true;
      calls.push('heal');
      if (completeUnknownAfterHeal) rows.set(unknownIntent, {});
    },
    waitForConvergence: async () => ({settledAfterMs: 1}),
    waitForConsistencyConvergence: async () => calls.push('consistency')},
  };
}
const OPTIONS = {partitionHoldMs: 0, postHealConvergenceTimeoutMs: 1000,
  consistencyTimeoutMs: 20, consistencyPollIntervalMs: 0};

test('fault scenario retains explicit refusal and post-heal system-log checks', async () => {
  const f = fixture();
  const result = await run(f.cluster, OPTIONS);
  assert.deepEqual(result.groupB, ['joiner-2']);
  assert.equal(result.minorityWriteAttempts[0].status, 'refused');
  assert.ok(arrayIncludes(f.calls, 'heal'));
  assert.ok(arrayIncludes(f.calls, 'consistency'));
  assert.equal(arrayFilter(f.calls, (call) => call.marker).length, 2);
});

test('UNKNOWN completion after heal is inconclusive about cut-time commit, not a safety failure',
  async () => {
    const f = fixture({success: false, errorCode: 'LOG_MARKER_OUTCOME_UNCONFIRMED'}, true);
    await assert.rejects(run(f.cluster, OPTIONS), (error) => {
      assert.equal(error.code, 'SPLIT_BRAIN_NO_COMMIT_INCONCLUSIVE');
      assert.equal(error.classification, error.code);
      assert.equal(error.diagnostics.partialResult.noCommitDuringCut, 'inconclusive');
      assert.equal(error.diagnostics.partialResult.minorityWriteAttempts[0].status, 'unknown');
      assert.ok(arrayEvery(
        error.diagnostics.partialResult.postHealUnknownObservations[0].observations,
        (observation) => observation.count === 1));
      return true;
    });
    assert.ok(arrayIncludes(f.calls, 'consistency'));
  });

test('a cut-phase minority ACK fails and still retires the harness-owned fault', async () => {
  const f = fixture({success: true, markerState: 'recorded'});
  await assert.rejects(run(f.cluster, OPTIONS), /must not be acknowledged/u);
  assert.ok(arrayIncludes(f.calls, 'heal'));
});

test('missing local capability is UNKNOWN, never a fabricated refusal or successful query', async () => {
  const attempt = await attemptDiagnosticMarker({id: 'absent'}, 'missing');
  assert.equal(attempt.status, 'unknown');
  const f = fixture();
  f.cluster.getNodes = () => [{id: 'a'}, {id: 'b'}, {id: 'c'}];
  await assert.rejects(run(f.cluster, OPTIONS), /local_query_failed/u);
  assert.ok(arrayIncludes(f.calls, 'heal'));
});

test('Docker marker goes through isolated localhost ingress and retains its exact body', async () => {
  let command;
  const markerId = 'docker-local-marker';
  const node = {id: 'minority-node', containerId: 'isolated-container',
    appendDiagnosticMarker() {
      throw new Error('external route must not be used');
    },
    _dockerProvider: {async execInContainer(containerId, argv) {
      assert.equal(containerId, 'isolated-container');
      command = argv;
      return {exitCode: 0, stdout: JSON.stringify({type: 'diagnostic_marker_result',
        answer: {success: false, errorCode: 'LOG_MARKER_OUTCOME_UNCONFIRMED', status: 503}})};
    }}};
  const attempt = await attemptDiagnosticMarker(node, markerId);
  assert.equal(attempt.status, 'unknown');
  assert.deepEqual(command.slice(0, 3), ['node', '--input-type=module', '-e']);
  assert.ok(stringIncludes(command[3], 'http://localhost:8081/api/admin/logs/markers'));
  assert.ok(stringIncludes(command[3], JSON.stringify(attempt.marker)));
  assert.ok(!stringIncludes(command[3], 'INSERT'));
});
