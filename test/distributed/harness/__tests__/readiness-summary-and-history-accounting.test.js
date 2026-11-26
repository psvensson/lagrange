import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  extractReadinessDenial,
  readinessDenialOf,
} from '../benchmark-readiness-denial.js';
import {
  formatCell,
  formatReadinessDenial,
} from '../comparative-landing-tables.js';
import {
  NOV_2026_HISTORY_RECONCILIATION_SPECS,
  buildCanonicalHistoryTransactionsFromWorkload,
  buildLab3NodeProgressionEntryFromReceipt,
  createComparisonHistoryRecord,
  normalizeTransactions,
  parseComparisonHistoryNdjson,
  reconcileNov2026ComparisonHistoryToDisk,
  validateVersionedProgressionRecord,
} from '../oltp-comparison-history-store.js';
import {deriveRunMetrics} from '../raw-observation-metrics.js';
import {
  arrayFilter,
  arrayIncludes,
  arrayJoin,
  arrayMap,
  stringIncludes,
  stringSplit,
  stringStartsWith,
  stringTrim,
} from '../real-product-captured-intrinsics.js';

const arraySlice = Function.call.bind(Array.prototype.slice);
import {describeExhaustedDeployment} from '../real-product-exhausted-deployment.js';
import {
  clusterReady,
  membershipReady,
  nodeReady,
  probeWriteReadback,
} from '../real-product-lagrange-observations.js';

const R001_887007107_DIAGNOSTIC = Object.freeze({
  component: 'lagrange-system-tables',
  attempts: 49,
  attempt: 49,
  completedAttempts: 49,
  readyAttempts: 2,
  deniedAttempts: 47,
  productProbeFailureAttempts: 0,
  observerInfraAttempts: 0,
  maxAttempts: 120,
  stablePolls: 3,
  elapsedMs: 156738,
  deadlineMs: 240000,
  deadlineAtMs: 1795502998650,
  aborted: false,
  deadlineExpired: true,
  observerInfrastructure: false,
  lastCompletedReady: true,
  lastDeniedObservation: Object.freeze({
    denials: Object.freeze([
      'partition_under_replicated:wasm_operations-p1',
      'replica_operations_in_flight:00000000-0000-4000-8000-000000000001:1',
      'replica_operations_in_flight:00000000-0000-4000-8000-000000000003:1',
      'replica_operations_in_flight:00000000-0000-4000-8000-000000000002:1',
    ]),
    nodes: 3,
    partitions: 46,
    spreadSummary: Object.freeze({
      rf3Partitions: 45,
      rf2Partitions: 0,
      rf1Partitions: 1,
      twoHostPartitionIds: Object.freeze([]),
    }),
    tableTimeToRoutableMs: Object.freeze({}),
  }),
  last: Object.freeze({
    denials: Object.freeze([]),
    nodes: 3,
    partitions: 46,
    spreadSummary: Object.freeze({
      rf3Partitions: 46,
      rf2Partitions: 0,
      rf1Partitions: 0,
      twoHostPartitionIds: Object.freeze([]),
    }),
    tableTimeToRoutableMs: Object.freeze({}),
  }),
  lastObservation: Object.freeze({
    denials: Object.freeze([]),
    nodes: 3,
    partitions: 46,
    spreadSummary: Object.freeze({
      rf3Partitions: 46,
      rf2Partitions: 0,
      rf1Partitions: 0,
      twoHostPartitionIds: Object.freeze([]),
    }),
    tableTimeToRoutableMs: Object.freeze({}),
  }),
  lastCompletedObservation: Object.freeze({
    denials: Object.freeze([]),
    nodes: 3,
    partitions: 46,
    spreadSummary: Object.freeze({
      rf3Partitions: 46,
      rf2Partitions: 0,
      rf1Partitions: 0,
      twoHostPartitionIds: Object.freeze([]),
    }),
    tableTimeToRoutableMs: Object.freeze({}),
  }),
  lastProbeError: null,
  lastObserverInfraError: null,
});

function createSystemTableQueryStub(nowMs) {
  const nodeIds = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ];
  const partitionIds = [
    'control_plane_publications-p1',
    'replica_operations-p1',
    'schema_operations-p1',
    'sql_transaction_participants-p1',
    'sql_transactions-p1',
    'sql_write_operations-p1',
  ];
  return async (sqlText) => {
    if (stringIncludes(sqlText, 'FROM nodes')) {
      return arrayMap(nodeIds, (id) => ({
        node_id: id,
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: String(nowMs() + 10000),
        last_heartbeat: String(nowMs() - 500),
      }));
    }
    if (stringIncludes(sqlText, 'FROM service_endpoints')) {
      return [{
        service_id: 'sys-postgres-wire',
        node_id: nodeIds[0],
        protocol: 'postgresql',
        port: '5432',
        health_status: 'healthy',
      }];
    }
    if (stringIncludes(sqlText, 'FROM partitions')) {
      return arrayMap(partitionIds, (partitionId) => ({
        partition_id: partitionId,
        table_name: partitionId.slice(0, -3),
        replica_count: '3',
        leader_node_id: nodeIds[0],
      }));
    }
    if (stringIncludes(sqlText, 'FROM services')) {
      const rows = [];
      for (const partitionId of partitionIds) {
        for (let idx = 0; idx < nodeIds.length; idx += 1) {
          rows.push({
            partition_id: partitionId,
            node_id: nodeIds[idx],
            status: 'active',
            raft_role: idx === 0 ? 'leader' : 'follower',
          });
        }
      }
      return rows;
    }
    return [];
  };
}

function createStageObservationContext({inFlightCount = () => 0} = {}) {
  let clockMs = 1000000;
  const now = () => clockMs;
  const advance = (ms) => {
    clockMs += ms;
  };
  const readinessByNodeId = Object.fromEntries(
    arrayMap([1, 2, 3], (n) => [
      `00000000-0000-4000-8000-00000000000${n}`,
      {dimensions: {serveEligible: true}, reasons: []},
    ]),
  );
  const sshRun = async (_host, _opts, command) => {
    advance(250);
    if (stringIncludes(command, '/readyz')) {
      return '{"ready":true,"phase":"ready","state":"ready","reasons":[]}\nhttp_status=200';
    }
    if (stringIncludes(command, '/management/v1/facts')) {
      return JSON.stringify({
        facts: {
          topology: {state: 'observed', readyNodeCount: 3, underReplicatedPartitionCount: 0},
          cluster: {formation: {state: 'FORMED', declaredHostCount: 3}},
          release: {version: '0.4.0'},
        },
      }) + '\nhttp_status=200';
    }
    if (stringIncludes(command, '/api/admin/control-snapshot')) {
      return JSON.stringify({
        controlPlaneDiagnostics: {readinessByNodeId},
        replicaOperations: {inFlightCount: inFlightCount()},
      }) + '\nhttp_status=200';
    }
    if (stringIncludes(command, 'docker inspect')) {
      return JSON.stringify([{
        Id: 'sha256:' + 'a'.repeat(64),
        Config: {Image: 'lagrange:0.4.0', Labels: {}},
        Mounts: [],
      }]);
    }
    return 'http_status=200';
  };
  const ctx = {
    sshRun,
    opts: {},
    clientIp: '10.166.0.10',
    sleep: async (ms) => advance(ms),
    now,
    signal: null,
    deadlineAtMs: clockMs + 240000,
    deadlineMs: 240000,
    budget: {attempts: 3, intervalMs: 100, stablePolls: 2},
    connection: {user: 'u', password: 'p', database: 'd'},
  };
  return {ctx, now, advance, sshRun};
}

describe('readiness summary and canonical history outcome accounting', () => {
  it('distinguishes terminal reason, last completed observation, and last negative observation ' +
    'on 887007107 r001', () => {
    const run = {
      deployment: {
        readiness: {
          state: 'exhausted',
          evidence: {
            failure: 'lagrange-system-tables did not report ready before 240000ms ' +
              'formation deadline after 49 attempts',
            diagnostic: R001_887007107_DIAGNOSTIC,
          },
        },
      },
    };
    const denial = extractReadinessDenial(run);
    assert.deepEqual(denial, readinessDenialOf(run));
    assert.equal(denial.component, 'lagrange-system-tables');
    assert.equal(denial.attempts, 49);
    assert.equal(denial.state, 'deadline-expired');
    assert.equal(denial.terminalReason,
      'readyAttempts 2 of stablePolls 3 before 240000ms deadline');
    assert.equal(arrayIncludes(denial.reasons,
      'readyAttempts 2 of stablePolls 3 before 240000ms deadline'), true);
    assert.equal(denial.lastCompletedObservation.ready, true);
    assert.deepEqual(denial.lastCompletedObservation.denials, []);
    assert.equal(denial.lastCompletedObservation.readyAttempts, 2);
    assert.equal(denial.lastCompletedObservation.stablePolls, 3);
    assert.equal(denial.lastCompletedObservation.summary,
      'ready (46/46 RF3, denials: [], readyAttempts 2/3)');
    assert.equal(denial.lastDeniedObservation.phase, 'cluster-readiness');
    assert.equal(denial.lastDeniedObservation.state, 'denied');
    assert.equal(arrayIncludes(denial.lastDeniedObservation.reasons,
      'partition_under_replicated:wasm_operations-p1'), true);

    const formatted = formatReadinessDenial(denial);
    assert.equal(stringIncludes(formatted,
      'readiness terminal reason of lagrange-system-tables: ' +
      'readyAttempts 2 of stablePolls 3 before 240000ms deadline, after 49 attempts'), true);
    assert.equal(stringIncludes(formatted,
      'last completed observation: ready (46/46 RF3, denials: [], readyAttempts 2/3)'), true);
    assert.equal(stringIncludes(formatted,
      'last negative observation: cluster-readiness (denied), reasons ' +
      'partition_under_replicated:wasm_operations-p1'), true);
    assert.equal(stringIncludes(formatted, 'last readiness answer'), false);

    const cellText = formatCell({
      status: 'product-failure',
      reasons: ['no-committed-operations', 'readiness-exhausted'],
      metrics: {
        profileClass: 'smoke',
        accounting: {
          offered: 100,
          issued: 0,
          committed: 0,
          conflictExhausted: 0,
          terminalFailures: {
            product_error: 0,
            correctness_failure: 0,
            transport_failure: 0,
            harness_fault: 0,
          },
          unresolved: 0,
          unissued: 100,
        },
        setupFailures: [{
          runId: 'bench-gcp-3sys-smoke-887007107-20261124-r001',
          failureClass: 'product_error',
          sqlState: null,
          code: 'readiness_exhausted',
          message: 'lagrange-system-tables did not report ready before 240000ms ' +
            'formation deadline after 49 attempts',
          readinessDenial: denial,
        }],
        capacity: null,
      },
    });
    assert.equal(stringIncludes(cellText, 'last completed observation: ready (46/46 RF3'), true);
    assert.equal(stringIncludes(cellText, 'last negative observation: cluster-readiness'), true);
    assert.equal(stringIncludes(cellText, 'last readiness answer'), false);
  });

  it('requires fresh SQL and consecutive healthy serve lanes after facts suppress a refresh',
    async () => {
      let attempt = 1;
      const {ctx, now, sshRun} = createStageObservationContext({
        inFlightCount: () => attempt === 5 ? 1 : 0,
      });
      const roles = arrayMap([1, 2, 3], (n) => ({
        host: `10.166.0.1${n}`,
        nodeId: `00000000-0000-4000-8000-00000000000${n}`,
      }));
      const sqlAttempts = [];
      const factsAttempts = [];
      const laneAttempts = [];
      ctx.budget.attempts = 7;
      ctx.sleep = async () => { attempt++; };
      ctx.sshRun = async (host, opts, command, timeoutMs) => {
        if (stringIncludes(command, '/management/v1/facts')) {
          factsAttempts.push(attempt);
          if (attempt === 2) return '{"facts":{"topology":{}}}\nhttp_status=200';
          if (attempt === 3) return '{}\nhttp_status=503';
          const count = attempt === 4 ? 1 : 0;
          return JSON.stringify({facts: {topology: {
            state: 'observed', underReplicatedPartitionCount: count,
          }}}) + '\nhttp_status=200';
        }
        if (stringIncludes(command, '/api/admin/control-snapshot')) {
          laneAttempts.push(attempt);
        }
        return sshRun(host, opts, command, timeoutMs);
      };
      const healthyQuery = createSystemTableQueryStub(now);
      const ready = await clusterReady(ctx, 'lagrange-system-tables', async (sql) => {
        sqlAttempts.push(attempt);
        if (attempt === 1 && stringIncludes(sql, 'FROM services')) return [];
        return healthyQuery(sql);
      }, roles);
      assert.equal(ready.attempts, 7);
      assert.deepEqual(factsAttempts, [2, 3, 4, 5]);
      assert.deepEqual(sqlAttempts, [1, 5, 6, 7].flatMap((n) => Array(4).fill(n)));
      assert.deepEqual(laneAttempts, [1, 5, 6, 7].flatMap((n) => Array(3).fill(n)));
      assert.equal(ready.evidence.sampling.sqlBatches, 4);
      assert.equal(ready.evidence.sampling.factsChecks, 4);
    });

  it('retains the observed under-replication and probe costs on facts exhaustion', async () => {
    const {ctx, now, sshRun} = createStageObservationContext();
    let attempt = 1;
    ctx.budget.attempts = 3;
    ctx.sleep = async () => { attempt++; };
    ctx.sshRun = async (host, opts, command, timeoutMs) => {
      if (!stringIncludes(command, '/management/v1/facts')) {
        return sshRun(host, opts, command, timeoutMs);
      }
      const topology = attempt === 2 ?
        {state: 'observed', underReplicatedPartitionCount: 4} : {state: 'unknown'};
      return JSON.stringify({facts: {topology}}) + '\nhttp_status=200';
    };
    const roles = arrayMap([1, 2, 3], (n) => ({
      host: `10.166.0.1${n}`,
      nodeId: `00000000-0000-4000-8000-00000000000${n}`,
    }));
    const healthyQuery = createSystemTableQueryStub(now);
    await assert.rejects(clusterReady(ctx, 'lagrange-system-tables', (sql) =>
      stringIncludes(sql, 'FROM services') ? [] : healthyQuery(sql), roles), (error) => {
      const {lastDeniedObservation, lastProbeError} = error.diagnostic;
      assert.deepEqual(lastDeniedObservation.denials, ['under_replicated_partitions']);
      assert.equal(lastDeniedObservation.underReplicatedPartitionCount, 4);
      assert.equal(lastProbeError.reason, 'replication_topology_unavailable');
      assert.equal(lastProbeError.sampling.factsChecks, 2);
      assert.equal(lastProbeError.sampling.sqlBatches, 1);
      return true;
    });
  });

  it('retains completed nodes, membership, and systemTables timeToReadyMs evidence when ' +
    'probeWriteReadback fails', async () => {
    const {ctx, now, advance, sshRun} = createStageObservationContext();
    const hosts = ['10.166.0.11', '10.166.0.12', '10.166.0.13'];
    const nodeRoles = arrayMap(hosts, (host, index) => ({
      role: 'lagrange-node',
      host,
      containerId: `c${index + 1}`,
      nodeId: `00000000-0000-4000-8000-00000000000${index + 1}`,
    }));
    for (const host of hosts) {
      const readyNode = await nodeReady(ctx, host);
      assert.ok(readyNode.timeToReadyMs > 0);
    }
    const readyMembership = await membershipReady(ctx, hosts[0], 3);
    assert.ok(readyMembership.timeToReadyMs > 0);
    const query = createSystemTableQueryStub(now);
    const readySystemTables = await clusterReady(
      ctx,
      'lagrange-system-tables',
      query,
      nodeRoles,
    );
    assert.ok(readySystemTables.timeToReadyMs > 0);

    const failingSql = {
      statement: async () => {
        advance(500);
        throw Object.assign(
          new Error('psql timed out waiting for bench_readiness_probe CREATE TABLE'),
          {timedOut: true, deadlineExpired: true},
        );
      },
      query: async () => [],
    };

    let caughtError = null;
    await assert.rejects(
      probeWriteReadback(ctx, failingSql, 'bench-gcp-887007107-r2', {
        status: 'single-listener',
        readFrom: [nodeRoles[0].nodeId],
        notReadFrom: [nodeRoles[1].nodeId, nodeRoles[2].nodeId],
      }),
      (error) => {
        caughtError = error;
        return true;
      },
    );
    assert.ok(caughtError);
    assert.equal(caughtError.diagnostic.component, 'lagrange-probe-write-readback');
    assert.equal(caughtError.diagnostic.nodes.length, 3);
    assert.equal(caughtError.diagnostic.membership.component, 'lagrange-membership');
    assert.equal(caughtError.diagnostic.membership.timeToReadyMs, readyMembership.timeToReadyMs);
    assert.equal(caughtError.diagnostic.systemTables.component, 'lagrange-system-tables');
    assert.equal(
      caughtError.diagnostic.systemTables.timeToReadyMs,
      readySystemTables.timeToReadyMs,
    );

    const exhaustedDeployment = await describeExhaustedDeployment({
      targetId: 'lagrange',
      topology: {description: '3 nodes', clientPath: 'public-pg-wire'},
      sshRun,
      opts: {},
      roles: [],
      endpoint: {
        protocol: 'postgresql',
        serviceId: 'sys-postgres-wire',
        host: hosts[0],
        port: 5432,
        containerId: 'c1',
        binding: null,
      },
      dataDir: '/data',
      readVersions: async (products) => products,
      failure: caughtError,
      now,
    });
    const diag = exhaustedDeployment.readiness.evidence.diagnostic;
    assert.equal(diag.nodes.length, 3);
    assert.ok(diag.nodes[0].timeToReadyMs > 0);
    assert.equal(diag.membership.timeToReadyMs, readyMembership.timeToReadyMs);
    assert.equal(diag.systemTables.timeToReadyMs, readySystemTables.timeToReadyMs);

    const denial = extractReadinessDenial({deployment: exhaustedDeployment});
    assert.equal(denial.completedStages.nodes.length, 3);
    assert.equal(denial.completedStages.membership.timeToReadyMs, readyMembership.timeToReadyMs);
    assert.equal(
      denial.completedStages.systemTables.timeToReadyMs,
      readySystemTables.timeToReadyMs,
    );
  });

  it('derives and enforces canonical history outcome accounting for 613b120ac, 887007107 r001, ' +
    'local 887007107, and GCP b1e097b09', () => {
    const tx613b = buildCanonicalHistoryTransactionsFromWorkload({
      offered: 100,
      issued: 100,
      unissued: 0,
      attempts: 140,
      committed: 95,
      conflicts: 44,
      conflictExhausted: 4,
      terminalFailures: {
        product_error: 1,
        correctness_failure: 0,
        transport_failure: 0,
        harness_fault: 0,
      },
      unresolved: 0,
    });
    assert.equal(tx613b.offered, 100);
    assert.equal(tx613b.issued, 100);
    assert.equal(tx613b.attempted, 100);
    assert.equal(tx613b.succeeded, 95);
    assert.equal(tx613b.failed, 5);
    assert.equal(tx613b.conflictExhausted, 4);
    assert.equal(tx613b.terminalFailures, 1);
    assert.equal(tx613b.retries, 40);
    assert.equal(tx613b.conflicts, 44);
    assert.throws(
      () => normalizeTransactions({
        offered: 100,
        issued: 100,
        unissued: 0,
        attempts: 140,
        committed: 95,
        failed: 4,
        conflictExhausted: 4,
        terminalFailures: {product_error: 1},
        retries: 40,
      }),
      /failed \(4\) !== conflictExhausted \(4\) \+ terminalFailures \(1\)/u,
    );

    const tx887007107R001 = buildCanonicalHistoryTransactionsFromWorkload({
      offered: 100,
      issued: 0,
      unissued: 100,
      attempts: 0,
      committed: 0,
      conflicts: 0,
      conflictExhausted: 0,
      terminalFailures: {
        product_error: 0,
        correctness_failure: 0,
        transport_failure: 0,
        harness_fault: 0,
      },
      unresolved: 0,
    });
    assert.equal(tx887007107R001.offered, 100);
    assert.equal(tx887007107R001.issued, 0);
    assert.equal(tx887007107R001.unissued, 100);
    assert.equal(tx887007107R001.attempted, 0);
    assert.equal(tx887007107R001.measuredAttempted, 0);
    assert.equal(tx887007107R001.succeeded, 0);
    assert.equal(tx887007107R001.failed, 0);
    assert.equal(tx887007107R001.retries, 0);
    assert.throws(
      () => normalizeTransactions({
        offered: 100,
        issued: 0,
        unissued: 100,
        measuredAttempted: 100,
        measuredSucceeded: 0,
        failed: 0,
        retries: 0,
      }),
      /measuredAttempted \(100\) !== issued \(0\)/u,
    );

    const txLocal887007107 = buildCanonicalHistoryTransactionsFromWorkload({
      offered: 100,
      issued: 100,
      unissued: 0,
      attempts: 128,
      committed: 98,
      conflicts: 30,
      conflictExhausted: 2,
      terminalFailures: 0,
      unresolved: 0,
    });
    assert.equal(txLocal887007107.retries, 28);
    assert.equal(txLocal887007107.conflicts, 30);
    assert.equal(txLocal887007107.failed, 2);
    assert.throws(
      () => normalizeTransactions({
        offered: 100,
        issued: 100,
        unissued: 0,
        attempts: 128,
        committed: 98,
        failed: 2,
        conflicts: 30,
        retries: 30,
      }),
      /retries \(30\) !== Math\.max\(0, attempts \(128\) - issued \(100\)\) \(28\)/u,
    );

    const txGcpB1e097b09 = buildCanonicalHistoryTransactionsFromWorkload({
      offered: 100,
      issued: 100,
      unissued: 0,
      attempts: 143,
      committed: 98,
      conflicts: 45,
      conflictExhausted: 2,
      terminalFailures: 0,
      unresolved: 0,
    });
    assert.equal(txGcpB1e097b09.retries, 43);
    assert.equal(txGcpB1e097b09.conflicts, 45);
    assert.equal(txGcpB1e097b09.failed, 2);
    assert.throws(
      () => normalizeTransactions({
        offered: 100,
        issued: 100,
        unissued: 0,
        attempts: 143,
        committed: 98,
        failed: 2,
        conflicts: 45,
        retries: 45,
      }),
      /retries \(45\) !== Math\.max\(0, attempts \(143\) - issued \(100\)\) \(43\)/u,
    );

    // Summary-only transaction inputs (without offered/issued) must also satisfy canonical
    // accounting invariants (succeeded + failed === attempted, non-negative integer counts,
    // retries === 0 when attempted === 0):
    assert.deepEqual(
      normalizeTransactions({attempted: 100, succeeded: 95, failed: 5, retries: 12}),
      {attempted: 100, succeeded: 95, failed: 5, retries: 12},
    );
    assert.throws(
      () => normalizeTransactions({attempted: 100, succeeded: 95, failed: 4, retries: 44}),
      /succeeded \(95\) \+ failed \(4\) !== attempted \(100\)/u,
    );
    assert.throws(
      () => normalizeTransactions({
        measuredAttempted: 100, measuredSucceeded: 0, failed: 0, retries: 0,
      }),
      /succeeded \(0\) \+ failed \(0\) !== attempted \(100\)/u,
    );
    assert.throws(
      () => normalizeTransactions({attempted: 160, failed: 0, retries: 0}),
      /Expected succeeded to be a non-negative integer/u,
    );
    assert.throws(
      () => normalizeTransactions({attempted: 0, succeeded: 0, failed: 0, retries: 2}),
      /attempts \(2\) must be 0 when issued is 0/u,
    );
  });

  it('reconciles Nov 2026 history records with distinct per-run receipt.json artifactSha256 ' +
    'digests and append-only invalidation of lines 21-43, and is pre-validated, idempotent, ' +
    'and resumable', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nov2026-history-reconcile-'));
    try {
      const rawHistory = await fs.readFile('data/tidb-comparison/history.ndjson', 'utf8');
      const rawLedger = await fs.readFile('data/tidb-comparison/invalidations.ndjson', 'utf8');
      const historyLines = arrayFilter(
        stringSplit(rawHistory, '\n'),
        (line) => stringTrim(line).length > 0,
      );
      const ledgerLines = arrayFilter(
        stringSplit(rawLedger, '\n'),
        (line) => stringTrim(line).length > 0 && !stringIncludes(line, '"id":"inv-0026"'),
      );
      const preHistory = `${arrayJoin(arraySlice(historyLines, 0, 43), '\n')}\n`;
      const preLedger = `${arrayJoin(arraySlice(ledgerLines, 0, 25), '\n')}\n`;
      const ndjsonPath = path.join(tmpDir, 'history.ndjson');
      const ledgerPath = path.join(tmpDir, 'invalidations.ndjson');
      const summaryPath = path.join(tmpDir, 'progress-summary.json');
      await fs.writeFile(ndjsonPath, preHistory, 'utf8');
      await fs.writeFile(ledgerPath, preLedger, 'utf8');

      // Pre-validation before touching disk: an invalid extraRecord fails in memory without
      // mutating either invalidations.ndjson or history.ndjson:
      const invalidExtra = {
        ...JSON.parse(historyLines[0]),
        recordedAt: '2026-11-24T12:00:00.000Z',
        metrics: {
          lagrange: {
            opsPerSec: 10,
            latencyMs: {p50: 1, p95: 2, p99: 3},
            transactions: {attempted: 100, succeeded: 90, failed: 5, retries: 0},
            semanticProofs: {passedCount: 33},
          },
          tidbTikv: null,
        },
      };
      await assert.rejects(
        reconcileNov2026ComparisonHistoryToDisk({
          ndjsonPath,
          ledgerPath,
          summaryPath,
          recordedAt: '2026-11-24T12:00:00.000Z',
          recordedBy: 'evidence-report-owner-test',
          extraRecords: [invalidExtra],
        }),
        /succeeded \(90\) \+ failed \(5\) !== attempted \(100\)/u,
      );
      assert.equal(await fs.readFile(ndjsonPath, 'utf8'), preHistory);
      assert.equal(await fs.readFile(ledgerPath, 'utf8'), preLedger);

      const result = await reconcileNov2026ComparisonHistoryToDisk({
        ndjsonPath,
        ledgerPath,
        summaryPath,
        recordedAt: '2026-11-24T12:00:00.000Z',
        recordedBy: 'evidence-report-owner-test',
      });

      const afterHistory = await fs.readFile(ndjsonPath, 'utf8');
      const afterLedger = await fs.readFile(ledgerPath, 'utf8');
      assert.equal(stringStartsWith(afterHistory, preHistory), true);
      assert.equal(stringStartsWith(afterLedger, preLedger), true);
      assert.equal(result.applied, true);
      assert.equal(result.alreadyReconciled, false);
      assert.equal(result.resumed, false);
      assert.equal(result.appendedInvalidationCount, 1);
      assert.equal(result.appendedHistoryCount, 23);
      assert.equal(result.invalidationEntry.id, 'inv-0026');
      assert.equal(result.invalidationEntry.scope.receiptIds.length, 23);
      assert.equal(result.appendedRecords.length, 23);

      // Idempotency witness: running reconcileNov2026ComparisonHistoryToDisk a second time in a
      // row succeeds as an explicit no-op and leaves both .ndjson files byte-identical:
      const secondResult = await reconcileNov2026ComparisonHistoryToDisk({
        ndjsonPath,
        ledgerPath,
        summaryPath,
        recordedAt: '2026-11-24T12:05:00.000Z',
        recordedBy: 'evidence-report-owner-test',
      });
      assert.equal(secondResult.applied, false);
      assert.equal(secondResult.alreadyReconciled, true);
      assert.equal(secondResult.resumed, false);
      assert.equal(secondResult.appendedInvalidationCount, 0);
      assert.equal(secondResult.appendedHistoryCount, 0);
      assert.equal(secondResult.appendedRecords.length, 0);
      assert.equal(await fs.readFile(ndjsonPath, 'utf8'), afterHistory);
      assert.equal(await fs.readFile(ledgerPath, 'utf8'), afterLedger);

      // Summary-repair witness: simulating a crash right before writeSummary (missing,
      // corrupt JSON, or stale JSON summaryPath while ndjson + ledger are already complete)
      // heals summaryPath and reports alreadyReconciled: false, then returns to no-op:
      const canonicalSummaryText = await fs.readFile(summaryPath, 'utf8');
      for (const [label, corrupt] of [
        ['missing summary', async () => fs.rm(summaryPath, {force: true})],
        ['invalid JSON summary', async () => fs.writeFile(summaryPath, '{truncated', 'utf8')],
        ['stale JSON summary', async () => fs.writeFile(summaryPath, '{"stale":true}\n', 'utf8')],
      ]) {
        await corrupt();
        const repaired = await reconcileNov2026ComparisonHistoryToDisk({
          ndjsonPath,
          ledgerPath,
          summaryPath,
          recordedAt: '2026-11-24T12:07:00.000Z',
          recordedBy: 'evidence-report-owner-test',
        });
        assert.equal(repaired.applied, true, label);
        assert.equal(repaired.alreadyReconciled, false, label);
        assert.equal(repaired.resumed, true, label);
        assert.equal(repaired.appendedInvalidationCount, 0, label);
        assert.equal(repaired.appendedHistoryCount, 0, label);
        assert.equal(await fs.readFile(summaryPath, 'utf8'), canonicalSummaryText, label);
        assert.equal(await fs.readFile(ndjsonPath, 'utf8'), afterHistory, label);
        assert.equal(await fs.readFile(ledgerPath, 'utf8'), afterLedger, label);
        const postRepairNoop = await reconcileNov2026ComparisonHistoryToDisk({
          ndjsonPath,
          ledgerPath,
          summaryPath,
          recordedAt: '2026-11-24T12:08:00.000Z',
          recordedBy: 'evidence-report-owner-test',
        });
        assert.equal(postRepairNoop.alreadyReconciled, true, `${label} post-repair`);
        assert.equal(postRepairNoop.applied, false, `${label} post-repair`);
      }

      // Resumability witness: simulating an interrupted reconciliation (inv-0026 + first 5
      // replacement history records on disk) and calling reconcileNov2026ComparisonHistoryToDisk
      // resumes and writes only the remaining 18 records without duplicating inv-0026 or any
      // history record:
      const afterHistoryLines = arrayFilter(
        stringSplit(afterHistory, '\n'),
        (line) => stringTrim(line).length > 0,
      );
      const partialHistory = `${arrayJoin(arraySlice(afterHistoryLines, 0, 48), '\n')}\n`;
      await fs.writeFile(ndjsonPath, partialHistory, 'utf8');
      await fs.writeFile(ledgerPath, afterLedger, 'utf8');

      const resumedResult = await reconcileNov2026ComparisonHistoryToDisk({
        ndjsonPath,
        ledgerPath,
        summaryPath,
        recordedAt: '2026-11-24T12:10:00.000Z',
        recordedBy: 'evidence-report-owner-test',
      });
      assert.equal(resumedResult.applied, true);
      assert.equal(resumedResult.alreadyReconciled, false);
      assert.equal(resumedResult.resumed, true);
      assert.equal(resumedResult.appendedInvalidationCount, 0);
      assert.equal(resumedResult.appendedHistoryCount, 18);
      assert.equal(resumedResult.appendedRecords.length, 18);
      assert.equal(await fs.readFile(ndjsonPath, 'utf8'), afterHistory);
      assert.equal(await fs.readFile(ledgerPath, 'utf8'), afterLedger);

      const allParsed = parseComparisonHistoryNdjson(afterHistory);
      assert.equal(allParsed.length, 66);

      const appendedByRunId = new Map(
        arrayMap(result.appendedRecords, (r) => [r.evidenceSource.runId, r]),
      );
      const r613b = appendedByRunId.get('tv-dator-3node-smoke-613b120ac');
      assert.equal(r613b.metrics.lagrange.transactions.failed, 5);
      assert.equal(r613b.metrics.lagrange.transactions.conflictExhausted, 4);
      assert.equal(r613b.metrics.lagrange.transactions.terminalFailures, 1);
      assert.equal(r613b.metrics.lagrange.transactions.retries, 40);
      assert.equal(r613b.metrics.lagrange.transactions.conflicts, 44);
      assert.equal(r613b.evidenceSource.artifactKind, 'lab-tv-dator-receipt-json');
      assert.ok(stringIncludes(r613b.evidenceSource.sourcePath, 'lab-bench-613b120ac'));

      const rGcp887 = appendedByRunId.get('bench-gcp-3sys-smoke-887007107-20261124-r001');
      assert.equal(rGcp887.metrics.lagrange.transactions.offered, 100);
      assert.equal(rGcp887.metrics.lagrange.transactions.issued, 0);
      assert.equal(rGcp887.metrics.lagrange.transactions.unissued, 100);
      assert.equal(rGcp887.metrics.lagrange.transactions.attempted, 0);
      assert.equal(rGcp887.metrics.lagrange.transactions.measuredAttempted, 0);

      const rLocal887 = appendedByRunId.get('tv-dator-3node-smoke-887007107');
      assert.equal(rLocal887.metrics.lagrange.transactions.retries, 28);
      assert.equal(rLocal887.metrics.lagrange.transactions.conflicts, 30);

      const rGcpB1e = appendedByRunId.get('bench-gcp-lagrange-smoke-b1e097b09-20261124-r001');
      assert.equal(rGcpB1e.metrics.lagrange.transactions.retries, 43);
      assert.equal(rGcpB1e.metrics.lagrange.transactions.conflicts, 45);

      const artifactShas = arrayMap(
        result.appendedRecords,
        (r) => r.evidenceSource.artifactSha256,
      );
      assert.equal(artifactShas.length, 23);
      assert.equal(new Set(artifactShas).size, 23,
        'every reconciled 2026-11-23..24 history record must bind a distinct artifactSha256');
      assert.equal(Object.keys(NOV_2026_HISTORY_RECONCILIATION_SPECS).length, 23);
      assert.ok(createComparisonHistoryRecord(r613b).recordSha256 === r613b.recordSha256);

      const liveParsed = parseComparisonHistoryNdjson(rawHistory);
      assert.ok(liveParsed.length >= 43);
      if (stringIncludes(rawLedger, '"id":"inv-0026"')) {
        assert.ok(liveParsed.length >= 66);
        const liveAppended = arraySlice(liveParsed, 43);
        for (const rec of liveAppended) {
          assert.ok(typeof rec.evidenceSource.artifactSha256 === 'string');
          assert.equal(rec.evidenceSource.artifactSha256.length, 64);
        }
      }
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });

  it('extracts and strictly validates lab 3-node progression entries from bound receipts', async () => {
    const baseReceipt = {
      commit: 'a23d0dfc00170dd5e317aa0463b3e8f66c981e41',
      passed: true,
      formation: {elapsedMs: 133507},
      semanticGate: {status: 'passed', passedCount: 33},
      extraJoinerDurability: {passed: true},
      workload: {
        metrics: {
          window: {scheduledMs: 20000, drainMs: 118394.976237},
          accounting: {
            offered: 100,
            issued: 100,
            unissued: 0,
            attempts: 140,
            committed: 97,
            conflicts: 43,
            conflictExhausted: 3,
            terminalFailures: {
              product_error: 0,
              correctness_failure: 0,
              transport_failure: 0,
              harness_fault: 0,
            },
            unresolved: 0,
            ambiguousCommits: 0,
          },
          latency: {
            count: 97,
            p50: 40640.058131,
            p95: 96546.786549,
            p99: 98678.84007,
          },
        },
      },
    };
    const built = buildLab3NodeProgressionEntryFromReceipt(baseReceipt);
    assert.equal(built.formationSec, 133.51);
    assert.equal(built.extraJoinerDurabilityPassed, true);
    assert.equal(built.workload.opsPerSec, 0.819);
    assert.deepEqual(built.workload.latencyMs, {
      samples: 97,
      p50: 40640.058,
      p95: 96546.787,
      p99: 98678.84,
    });

    // Rejects passed: true when any required field is zeroed or missing:
    for (const [label, mutate, expected] of [
      ['zero formationSec', (r) => {
        r.formation = {elapsedMs: 0};
      }, /formationSec <= 0/u],
      ['zero issued', (r) => {
        r.workload.metrics.accounting.issued = 0;
        r.workload.metrics.accounting.committed = 0;
        r.workload.opsPerSec = 1;
      }, /issued <= 0/u],
      ['zero committed', (r) => {
        r.workload.metrics.accounting.committed = 0;
        r.workload.opsPerSec = 1;
      }, /committed <= 0/u],
      ['zero opsPerSec', (r) => {
        r.workload.opsPerSec = 0;
      }, /opsPerSec <= 0/u],
      ['null latencyMs', (r) => {
        r.workload.metrics.latency = null;
      }, /null or invalid latencyMs/u],
      ['extraJoinerDurabilityPassed !== true', (r) => {
        r.extraJoinerDurability.passed = false;
      }, /extraJoinerDurabilityPassed === true/u],
    ]) {
      const broken = JSON.parse(JSON.stringify(baseReceipt));
      mutate(broken);
      assert.throws(() => buildLab3NodeProgressionEntryFromReceipt(broken), expected, label);
    }

    const progressionText = await fs.readFile(
      'data/tidb-comparison/versioned-progression-20261123-20261124.json',
      'utf8',
    );
    const progression = JSON.parse(progressionText);
    assert.equal(validateVersionedProgressionRecord(progression), progression);
    assert.throws(
      () => validateVersionedProgressionRecord({
        lab3NodeRuns: [{...built, formationSec: 0}],
      }),
      /formationSec <= 0/u,
    );
  });

  it('separates single-txn execution time from end-to-end request latency and aligns ' +
    'derivePartsSec intervals with dataset-reset events', () => {
    const run = {
      runId: 'metrics-alignment-check',
      plan: {offeredRatePerSec: 5, repetition: 1},
      execution: {
        startedAt: '2026-11-24T20:24:45.000Z',
        endedAt: '2026-11-24T20:36:11.000Z',
      },
      deployment: {readiness: {observedAt: '2026-11-24T20:28:42.000Z'}},
      harnessEvents: [
        {kind: 'dataset-reset', caseId: 'visibility', at: '2026-11-24T20:29:52.000Z'},
        {kind: 'dataset-reset', caseId: 'payment', at: '2026-11-24T20:29:55.000Z'},
        {kind: 'dataset-reset', caseId: 'order-status', at: '2026-11-24T20:30:01.000Z'},
        {kind: 'dataset-reset', caseId: 'delivery', at: '2026-11-24T20:30:11.000Z'},
        {kind: 'dataset-reset', caseId: 'stock-level', at: '2026-11-24T20:30:17.000Z'},
        {kind: 'dataset-reset', caseId: 'failure-atomicity', at: '2026-11-24T20:30:22.000Z'},
        {kind: 'dataset-reset', caseId: 'retryable-conflict', at: '2026-11-24T20:30:27.000Z'},
        {kind: 'dataset-reset', caseId: 'durability', at: '2026-11-24T20:30:31.000Z'},
      ],
      observations: {
        runStatus: 'completed',
        window: {
          scheduledMs: 20000,
          drainMs: 241960,
          drainOverrunMs: 221960,
          startedAt: '2026-11-24T20:32:09.000Z',
          endedAt: '2026-11-24T20:36:11.000Z',
        },
        warmup: {
          records: [{issuedAtMs: 1000, completedAtMs: 22000}],
        },
        accounting: {
          offered: 2,
          issued: 2,
          unissued: 0,
          attempts: 5,
          committed: 2,
          conflicts: 3,
          conflictExhausted: 0,
          terminalFailures: {
            product_error: 0,
            correctness_failure: 0,
            transport_failure: 0,
            harness_fault: 0,
          },
          unresolved: 0,
        },
        requests: [
          {outcome: 'committed', executionElapsedMs: 14496, latencyMs: 143043},
          {outcome: 'committed', executionElapsedMs: 3212, latencyMs: 222242},
        ],
      },
    };
    const metrics = deriveRunMetrics(run);
    assert.equal(metrics.timingsSec.maxSingleTxnExecutionSec, 14.496);
    assert.equal(metrics.timingsSec.maxSingleRequestSec, 222.242);
    assert.deepEqual(metrics.timingsSec.partsSec, {
      loadAndCases1To2Sec: 70,
      case3PaymentSec: 3,
      case4OrderStatusSec: 6,
      case5DeliverySec: 10,
      case6StockLevelSec: 6,
      case7FailureAtomicitySec: 5,
      case8RetryableConflictSec: 5,
      case9aDurabilityPreRestartSec: 4,
      case9bDurabilityRestartReloadSec: 77,
    });

    const badOrder = structuredClone(run);
    badOrder.harnessEvents[0].caseId = 'new-order-contention';
    assert.equal(deriveRunMetrics(badOrder).timingsSec.partsSec, null);
  });
});
