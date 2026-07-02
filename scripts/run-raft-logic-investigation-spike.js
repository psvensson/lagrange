#!/usr/bin/env node

/**
 * Execute contained raft-logic investigation scenarios and write reports.
 */

import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {RaftLogicSpikeCluster} from '../src/raft/spike/raft-logic-spike-cluster.js';
import {isRaftLogicSpikeEnabled} from '../src/raft/spike/raft-provider-control.js';
import {
  RAFT_PROVIDER_CONTROL,
  RAFT_LOGIC_SPIKE_TIME,
} from '../src/raft/spike/raft-logic-spike-constants.js';

const LOCAL_STR_REPORT_DIR = '--report-dir';
const LOCAL_STR_IDLE_SOAK_MS = '--idle-soak-ms';
const LOCAL_STR_SAMPLE_INTERVAL_MS = '--sample-interval-ms';
const LOCAL_STR_LOAD_WRITES = '--load-writes';
const LOCAL_STR_1 = '1';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_REPLICA_1 = 'replica-1';
const LOCAL_STR_SINGLE_NODE_SHOULD_ELECT_ITSELF = 'single node should elect itself';
const LOCAL_STR_SINGLE_NODE_LEADERSHIP = 'single_node_leadership';
const LOCAL_STR_THREE_NODE_LEADER_ELECTION = 'three_node_leader_election';
const LOCAL_STR_A_FOLLOWER_REPLICA_SHOULD_EXIST = 'a follower replica should exist';
const LOCAL_STR_FOLLOWER_WRITE_FORWARDING = 'follower_write_forwarding';
const LOCAL_STR_COMMIT_DELIVERY = 'commit_delivery';
const LOCAL_NUM_THREE = 3;
const LOCAL_STR_COMMIT_ENTRY_SHOULD_APPLY_ON_ALL_REPLICA = 'commit entry should apply on all replicas';
const LOCAL_STR_COMMIT_DELIVERY_AND_APPLY = 'commit_delivery_and_apply';
const LOCAL_STR_LOAD_WRITE = 'load_write';
const LOCAL_STR_LEADER_FAILOVER_AND_RE_ELECTION = 'leader_failover_and_re_election';
const LOCAL_STR_CORRECTNESS_SUITE = 'correctness_suite';
const LOCAL_NUM_FIVE = 5;
const LOCAL_STR_TRANSPORT_MESSAGE_FLOW = 'transport_message_flow';
const LOCAL_STR_SQLITE_RESTART_SINGLE_REPLICA_RECOVERY = 'sqlite_restart_single_replica_recovery';
const LOCAL_STR_SINGLE_BEFORE_RESTART = 'single_before_restart';
const LOCAL_STR_V1 = 'v1';
const LOCAL_STR_SQLITE_RESTART_ROLLING_RECOVERY = 'sqlite_restart_rolling_recovery';
const LOCAL_STR_ROLLING_RESTART_SHOULD_PROCESS_ALL_REPLI = 'rolling restart should process all replicas';
const LOCAL_STR_SQLITE_RESTART_LEADER_RECOVERY = 'sqlite_restart_leader_recovery';
const LOCAL_STR_LEADER_RESTART_SHOULD_TARGET_CURRENT_STA = 'leader restart should target current stable leader';
const LOCAL_STR_SQLITE_RESTART_CRASH_RECOVERY = 'sqlite_restart_crash_recovery';
const LOCAL_STR_TRANSPORT_STORAGE_SUITE = 'transport_storage_suite';
const LOCAL_STR_RESOURCE_WRITE = 'resource_write';
const LOCAL_STR_BLOCKER = 'blocker';
const LOCAL_STR_CORRECTNESS = 'correctness';
const LOCAL_STR_CORRECTNESS_CHECKS_DID_NOT_PASS = 'Correctness checks did not pass.';
const LOCAL_STR_TRANSPORT_STORAGE = 'transport_storage';
const LOCAL_STR_TRANSPORT_STORAGE_CHECKS_DID_NOT_PASS = 'Transport/storage checks did not pass.';
const LOCAL_STR_HIGH = 'high';
const LOCAL_STR_RESOURCE = 'resource';
const LOCAL_STR_RESOURCE_VIABILITY_CHECKS_DID_NOT_COMPLE = 'Resource viability checks did not complete successfully.';
const LOCAL_STR_GO_CANDIDATE = 'go_candidate';
const LOCAL_STR_NO_GO = 'no_go';
const LOCAL_STR_RAFT_LOGIC_SPIKE_FINAL_REPORT = '# Raft-Logic Spike Final Report';
const LOCAL_STR_CORRECTNESS_CHECKS = '## Correctness Checks';
const LOCAL_STR_TRANSPORT_AND_STORAGE_CHECKS = '## Transport and Storage Checks';
const LOCAL_STR_RESOURCE_SUMMARY = '## Resource Summary';
const LOCAL_STR_IDLE_SOAK_UNAVAILABLE = '- idle soak: unavailable';
const LOCAL_STR_ISSUES = '## Issues';
const LOCAL_STR_NONE = '- none';
const LOCAL_STR_NEXT_ACTION = '## Next Action';
const LOCAL_STR_PROCEED_TO_PHASE_2_MIGRATION_DESIGN_WITH = '- Proceed to phase-2 migration design with scoped integration hardening.';
const LOCAL_STR_NO_GO_FOR_MIGRATION_KEEP_LIFERAFT_AS_DEF = '- No-go for migration; keep liferaft as default and address blockers first.';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_STR_TO_RUN_THE_CONTAINED_SPIKE = ' to run the contained spike.';

const REPORT_DEFAULT = Object.freeze({
  REPORT_DIR: '_legacy_work/specs-archive/raft-logic-investigation/reports',
  IDLE_SOAK_MS: 2 * RAFT_LOGIC_SPIKE_TIME.MINUTE_MS,
  SAMPLE_INTERVAL_MS: 10 * RAFT_LOGIC_SPIKE_TIME.SECOND_MS,
  LOAD_WRITES: 20,
});

const REPORT_FILE = Object.freeze({
  CORRECTNESS: 'correctness-report.json',
  TRANSPORT_STORAGE: 'transport-storage-report.json',
  RESOURCE: 'resource-viability-report.json',
  SUMMARY: 'final-spike-report.json',
  SUMMARY_MD: 'final-spike-report.md',
});

const SPIKE_LOG_CONTROL = Object.freeze({
  VERBOSE_COMMIT_LOGS_ENV: 'RAFT_LOGIC_SPIKE_VERBOSE_COMMIT_LOGS',
  SUPPRESSED_PREFIXES: Object.freeze([
    '[raft-worker-controller] waitForCommit start',
    '[raft-worker-controller] waitForCommit resolved',
  ]),
});

const STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
});

/**
 * Parse command line options.
 * @param {Array<string>} argv
 * @return {{reportDir: string, idleSoakMs: number, sampleIntervalMs: number, loadWrites: number}}
 */
function parseArgs(argv) {
  const args = {
    reportDir: REPORT_DEFAULT.REPORT_DIR,
    idleSoakMs: REPORT_DEFAULT.IDLE_SOAK_MS,
    sampleIntervalMs: REPORT_DEFAULT.SAMPLE_INTERVAL_MS,
    loadWrites: REPORT_DEFAULT.LOAD_WRITES,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === LOCAL_STR_REPORT_DIR && i + 1 < argv.length) {
      args.reportDir = String(argv[++i]);
    } else if (arg === LOCAL_STR_IDLE_SOAK_MS && i + 1 < argv.length) {
      args.idleSoakMs = Number.parseInt(argv[++i], 10);
    } else if (arg === LOCAL_STR_SAMPLE_INTERVAL_MS && i + 1 < argv.length) {
      args.sampleIntervalMs = Number.parseInt(argv[++i], 10);
    } else if (arg === LOCAL_STR_LOAD_WRITES && i + 1 < argv.length) {
      args.loadWrites = Number.parseInt(argv[++i], 10);
    }
  }

  return args;
}

/**
 * Suppress extremely verbose raft-worker commit logs unless explicitly enabled.
 * @param {Object<string, string|undefined>} [env=process.env]
 * @return {Function} restore hook
 */
function installNoisyCommitLogFilter(env = process.env) {
  if (env[SPIKE_LOG_CONTROL.VERBOSE_COMMIT_LOGS_ENV] === LOCAL_STR_1) {
    return () => {};
  }

  const originalLog = console.log;
  console.log = (...args) => {
    const firstArg = args[0];
    if (typeof firstArg === LOCAL_STR_STRING) {
      for (const prefix of SPIKE_LOG_CONTROL.SUPPRESSED_PREFIXES) {
        if (firstArg.startsWith(prefix)) {
          return;
        }
      }
    }
    originalLog(...args);
  };

  return () => {
    console.log = originalLog;
  };
}

/**
 * Load optional JSON report.
 * @param {string} filePath
 * @return {Promise<Object|null>}
 */
async function readJsonIfExists(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

/**
 * Build benchmark baseline snapshot from existing harness reports.
 * @return {Promise<Object>}
 */
async function collectBaselineSnapshot() {
  const baseline3Node = await readJsonIfExists(
    'test-output/reports/benchmark-3node.json',
  );
  const baseline5Node = await readJsonIfExists(
    'test-output/reports/latest-benchmark.json',
  );

  function extractComparison(report) {
    const scenario = report?.scenarios && Array.isArray(report.scenarios) ?
      report.scenarios[0] :
      null;
    return scenario?.details?.details?.comparison || null;
  }

  return {
    collectedAt: new Date().toISOString(),
    baseline3Node: extractComparison(baseline3Node),
    baseline5Node: extractComparison(baseline5Node),
  };
}

/**
 * Run focused correctness scenarios.
 * @param {Object} options
 * @param {number} options.loadWrites
 * @return {Promise<Object>}
 */
async function runCorrectnessChecks(options) {
  const results = [];
  const cluster = new RaftLogicSpikeCluster({size: 3});

  try {
    const singleNode = new RaftLogicSpikeCluster({size: 1});
    try {
      await singleNode.start();
      const leaderId = await singleNode.waitForStableLeader();
      assert.equal(
        leaderId,
        LOCAL_STR_REPLICA_1,
        LOCAL_STR_SINGLE_NODE_SHOULD_ELECT_ITSELF,
      );
      results.push({
        check: LOCAL_STR_SINGLE_NODE_LEADERSHIP,
        status: STATUS.PASS,
        evidence: {leaderId},
      });
    } finally {
      await singleNode.stop();
    }

    await cluster.start();
    const leaderId = await cluster.waitForStableLeader();
    const statusSnapshots = await cluster.getStatusSnapshots();
    results.push({
      check: LOCAL_STR_THREE_NODE_LEADER_ELECTION,
      status: STATUS.PASS,
      evidence: {leaderId, statusSnapshots},
    });

    const follower = statusSnapshots.find((snapshot) =>
      snapshot.replicaId !== leaderId,
    );
    assert.ok(follower, LOCAL_STR_A_FOLLOWER_REPLICA_SHOULD_EXIST);
    const forwardedResult = await cluster.proposeFromReplica(
      follower.replicaId,
      {type: 'forwarded_write', value: 'follower-forward'},
      {autoForward: true},
    );
    results.push({
      check: LOCAL_STR_FOLLOWER_WRITE_FORWARDING,
      status: STATUS.PASS,
      evidence: {
        followerId: follower.replicaId,
        forwardedResult,
      },
    });

    const commitResult = await cluster.proposeFromLeader({
      type: 'commit_delivery',
      value: 'apply-check',
    });
    const commitDeliveryTimeoutMs = 5000;
    const commitDeliveryPollMs = 100;
    const commitDeliveryDeadline = Date.now() + commitDeliveryTimeoutMs;
    let appliedReplicas = new Set();
    while (Date.now() < commitDeliveryDeadline) {
      const commitRecords = cluster.getAllCommitRecords();
      appliedReplicas = new Set(
        commitRecords
          .filter((record) => record?.command?.type === LOCAL_STR_COMMIT_DELIVERY)
          .map((record) => String(record.replicaId)),
      );
      if (appliedReplicas.size === LOCAL_NUM_THREE) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, commitDeliveryPollMs));
    }
    assert.equal(
      appliedReplicas.size,
      LOCAL_NUM_THREE,
      LOCAL_STR_COMMIT_ENTRY_SHOULD_APPLY_ON_ALL_REPLICA,
    );
    results.push({
      check: LOCAL_STR_COMMIT_DELIVERY_AND_APPLY,
      status: STATUS.PASS,
      evidence: {
        commitResult,
        appliedReplicaCount: appliedReplicas.size,
      },
    });

    for (let i = 0; i < options.loadWrites; i++) {
      await cluster.proposeFromLeader({
        type: LOCAL_STR_LOAD_WRITE,
        value: i,
      });
    }

    const failoverResult = await cluster.triggerLeaderFailover();
    results.push({
      check: LOCAL_STR_LEADER_FAILOVER_AND_RE_ELECTION,
      status: STATUS.PASS,
      evidence: failoverResult,
    });
  } catch (error) {
    results.push({
      check: LOCAL_STR_CORRECTNESS_SUITE,
      status: STATUS.FAIL,
      error: error.message,
      stack: error.stack,
    });
  } finally {
    await cluster.stop();
  }

  return {
    generatedAt: new Date().toISOString(),
    checks: results,
    passed: results.every((item) => item.status === STATUS.PASS),
  };
}

/**
 * Wait until a command type appears committed on all replicas.
 * @param {RaftLogicSpikeCluster} cluster
 * @param {string} commandType
 * @param {Object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.pollMs]
 * @return {Promise<Object>}
 */
async function waitForCommandAppliedOnAllReplicas(
  cluster,
  commandType,
  options = {},
) {
  const timeoutMs = Number.isInteger(options.timeoutMs) ?
    options.timeoutMs :
    5000;
  const pollMs = Number.isInteger(options.pollMs) ?
    options.pollMs :
    100;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const appliedReplicaIds = new Set(
      cluster.getAllCommitRecords()
        .filter((record) => record?.command?.type === commandType)
        .map((record) => String(record.replicaId)),
    );
    if (appliedReplicaIds.size >= cluster.replicaIds.length) {
      return {
        commandType,
        appliedReplicaCount: appliedReplicaIds.size,
        appliedReplicaIds: [...appliedReplicaIds],
      };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `Timed out waiting for command ${commandType} on all replicas`,
  );
}

/**
 * Wait until replica status satisfies predicate.
 * @param {RaftLogicSpikeCluster} cluster
 * @param {string} replicaId
 * @param {Function} predicate
 * @param {Object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.pollMs]
 * @return {Promise<Object>}
 */
async function waitForReplicaStatus(
  cluster,
  replicaId,
  predicate,
  options = {},
) {
  const timeoutMs = Number.isInteger(options.timeoutMs) ?
    options.timeoutMs :
    5000;
  const pollMs = Number.isInteger(options.pollMs) ?
    options.pollMs :
    100;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const adapter = cluster.getAdapter(replicaId);
    const status = adapter ? await adapter.refreshStatus() : null;
    if (status && predicate(status)) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `Timed out waiting for healthy status from replica ${replicaId}`,
  );
}

/**
 * Collect structured evidence for restart/storage failures.
 * @param {RaftLogicSpikeCluster} cluster
 * @param {Object} context
 * @return {Promise<Object>}
 */
async function captureRestartAnomalyArtifact(cluster, context = {}) {
  const commitTailByReplica = {};
  for (const replicaId of cluster.replicaIds) {
    commitTailByReplica[replicaId] = cluster.getReplicaCommitLog(replicaId)
      .slice(-LOCAL_NUM_FIVE);
  }

  let statusSnapshots = [];
  try {
    statusSnapshots = await cluster.getStatusSnapshots();
  } catch (error) {
    statusSnapshots = [{error: error.message}];
  }

  return {
    capturedAt: new Date().toISOString(),
    context,
    statusSnapshots,
    commitTailByReplica,
  };
}

/**
 * Validate transport semantics and restart/storage assumptions.
 * @param {string} reportDir
 * @return {Promise<Object>}
 */
async function runTransportStorageChecks(reportDir) {
  const sqliteDir = join(reportDir, 'sqlite-storage');
  const cluster = new RaftLogicSpikeCluster({
    size: 3,
    storageKind: 'sqlite',
    storageDir: sqliteDir,
  });
  const checks = [];

  try {
    await cluster.start();
    const runCheck = async (checkName, checkFn) => {
      try {
        const evidence = await checkFn();
        checks.push({
          check: checkName,
          status: STATUS.PASS,
          evidence,
        });
      } catch (error) {
        const artifact = await captureRestartAnomalyArtifact(cluster, {
          check: checkName,
        });
        checks.push({
          check: checkName,
          status: STATUS.FAIL,
          error: error.message,
          stack: error.stack,
          artifact,
        });
      }
    };

    await runCheck(LOCAL_STR_TRANSPORT_MESSAGE_FLOW, async () => {
      const stableLeader = await cluster.waitForStableLeader();
      return {stableLeader};
    });

    await runCheck(LOCAL_STR_SQLITE_RESTART_SINGLE_REPLICA_RECOVERY, async () => {
      await cluster.proposeFromLeader({
        type: LOCAL_STR_SINGLE_BEFORE_RESTART,
        value: LOCAL_STR_V1,
      });

      const restartTarget = cluster.replicaIds[1] || cluster.replicaIds[0];
      const restartResult = await cluster.restartReplica(restartTarget, {
        graceful: true,
      });
      await cluster.waitForStableLeader();
      const status = await waitForReplicaStatus(
        cluster,
        restartTarget,
        (snapshot) => Boolean(snapshot.leaderId) && snapshot.term >= 1,
      );
      const proposal = await cluster.proposeFromLeader({
        type: 'single_after_restart',
        value: 'v2',
      });
      const commitEvidence = await waitForCommandAppliedOnAllReplicas(
        cluster,
        'single_after_restart',
      );

      return {
        restartTarget,
        restartResult,
        restartedStatus: status,
        proposal,
        commitEvidence,
      };
    });

    await runCheck(LOCAL_STR_SQLITE_RESTART_ROLLING_RECOVERY, async () => {
      const rolling = await cluster.rollingRestart({graceful: true});
      assert.equal(
        rolling.steps.length,
        cluster.replicaIds.length,
        LOCAL_STR_ROLLING_RESTART_SHOULD_PROCESS_ALL_REPLI,
      );

      const proposal = await cluster.proposeFromLeader({
        type: 'rolling_after_restart',
        value: 'v3',
      });
      const commitEvidence = await waitForCommandAppliedOnAllReplicas(
        cluster,
        'rolling_after_restart',
      );

      return {
        rolling,
        proposal,
        commitEvidence,
      };
    });

    await runCheck(LOCAL_STR_SQLITE_RESTART_LEADER_RECOVERY, async () => {
      const expectedLeader = await cluster.waitForStableLeader();
      const leaderRestart = await cluster.restartLeader({graceful: true});
      assert.equal(
        leaderRestart.previousLeaderId,
        expectedLeader,
        LOCAL_STR_LEADER_RESTART_SHOULD_TARGET_CURRENT_STA,
      );
      const restartedLeaderStatus = await waitForReplicaStatus(
        cluster,
        leaderRestart.previousLeaderId,
        (snapshot) => Boolean(snapshot.leaderId) && snapshot.term >= 1,
      );

      const proposal = await cluster.proposeFromLeader({
        type: 'leader_after_restart',
        value: 'v4',
      });
      const commitEvidence = await waitForCommandAppliedOnAllReplicas(
        cluster,
        'leader_after_restart',
      );

      return {
        leaderRestart,
        restartedLeaderStatus,
        proposal,
        commitEvidence,
      };
    });

    await runCheck(LOCAL_STR_SQLITE_RESTART_CRASH_RECOVERY, async () => {
      const crashTarget = cluster.replicaIds[cluster.replicaIds.length - 1];
      const crashRecovery = await cluster.restartReplica(crashTarget, {
        graceful: false,
      });
      await cluster.waitForStableLeader();
      const status = await waitForReplicaStatus(
        cluster,
        crashTarget,
        (snapshot) => Boolean(snapshot.leaderId) && snapshot.term >= 1,
      );

      const proposal = await cluster.proposeFromLeader({
        type: 'crash_after_restart',
        value: 'v5',
      });
      const commitEvidence = await waitForCommandAppliedOnAllReplicas(
        cluster,
        'crash_after_restart',
      );

      return {
        crashTarget,
        crashRecovery,
        restartedStatus: status,
        proposal,
        commitEvidence,
      };
    });
  } catch (error) {
    checks.push({
      check: LOCAL_STR_TRANSPORT_STORAGE_SUITE,
      status: STATUS.FAIL,
      error: error.message,
      stack: error.stack,
      artifact: await captureRestartAnomalyArtifact(cluster, {
        check: LOCAL_STR_TRANSPORT_STORAGE_SUITE,
      }),
    });
  } finally {
    await cluster.stop();
  }

  return {
    generatedAt: new Date().toISOString(),
    checks,
    passed: checks.every((item) => item.status === STATUS.PASS),
  };
}

/**
 * Run resource and performance viability checks.
 * @param {Object} options
 * @param {number} options.idleSoakMs
 * @param {number} options.sampleIntervalMs
 * @return {Promise<Object>}
 */
async function runResourceChecks(options) {
  const cluster = new RaftLogicSpikeCluster({size: 3});
  const result = {
    generatedAt: new Date().toISOString(),
    idleSoak: null,
    writeLoad: null,
    passed: false,
  };

  try {
    await cluster.start();
    await cluster.waitForStableLeader();

    const idleSoak = await cluster.runIdleSoak(
      options.idleSoakMs,
      options.sampleIntervalMs,
    );
    result.idleSoak = idleSoak;

    const startMs = Date.now();
    for (let i = 0; i < options.loadWrites; i++) {
      await cluster.proposeFromLeader({type: LOCAL_STR_RESOURCE_WRITE, value: i});
    }
    const durationMs = Date.now() - startMs;
    const writesPerSecond = durationMs > 0 ?
      (options.loadWrites / durationMs) * RAFT_LOGIC_SPIKE_TIME.SECOND_MS :
      0;

    result.writeLoad = {
      operations: options.loadWrites,
      durationMs,
      writesPerSecond,
    };
    result.passed = true;
  } catch (error) {
    result.error = error.message;
    result.stack = error.stack;
  } finally {
    await cluster.stop();
  }

  return result;
}

/**
 * Build final recommendation gates.
 * @param {Object} reports
 * @param {Object} reports.correctness
 * @param {Object} reports.transportStorage
 * @param {Object} reports.resource
 * @param {Object} reports.baseline
 * @return {Object}
 */
function buildFinalRecommendation(reports) {
  const issues = [];
  let goCandidate = true;

  if (!reports.correctness.passed) {
    goCandidate = false;
    issues.push({
      severity: LOCAL_STR_BLOCKER,
      component: LOCAL_STR_CORRECTNESS,
      message: LOCAL_STR_CORRECTNESS_CHECKS_DID_NOT_PASS,
    });
  }

  if (!reports.transportStorage.passed) {
    goCandidate = false;
    issues.push({
      severity: LOCAL_STR_BLOCKER,
      component: LOCAL_STR_TRANSPORT_STORAGE,
      message: LOCAL_STR_TRANSPORT_STORAGE_CHECKS_DID_NOT_PASS,
    });
  }

  if (!reports.resource.passed) {
    goCandidate = false;
    issues.push({
      severity: LOCAL_STR_HIGH,
      component: LOCAL_STR_RESOURCE,
      message: LOCAL_STR_RESOURCE_VIABILITY_CHECKS_DID_NOT_COMPLE,
    });
  }

  const idleSummary = reports.resource?.idleSoak?.summary || null;
  if (idleSummary) {
    const cpuThreshold = 20;
    if (idleSummary.cpuPercent > cpuThreshold) {
      goCandidate = false;
      issues.push({
        severity: LOCAL_STR_HIGH,
        component: LOCAL_STR_RESOURCE,
        message:
          `Idle CPU ${idleSummary.cpuPercent.toFixed(2)}% exceeds ` +
          `${cpuThreshold}% threshold.`,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    recommendation: goCandidate ? LOCAL_STR_GO_CANDIDATE : LOCAL_STR_NO_GO,
    goCandidate,
    issues,
    baselineSnapshot: reports.baseline,
    correctnessPassed: reports.correctness.passed,
    transportStoragePassed: reports.transportStorage.passed,
    resourcePassed: reports.resource.passed,
  };
}

/**
 * Build markdown summary for fast human review.
 * @param {Object} summary
 * @param {Object} correctness
 * @param {Object} transportStorage
 * @param {Object} resource
 * @return {string}
 */
function buildMarkdownSummary(summary, correctness, transportStorage, resource) {
  const lines = [];
  lines.push(LOCAL_STR_RAFT_LOGIC_SPIKE_FINAL_REPORT);
  lines.push('');
  lines.push(`- generatedAt: ${summary.generatedAt}`);
  lines.push(`- recommendation: ${summary.recommendation}`);
  lines.push(`- correctnessPassed: ${String(summary.correctnessPassed)}`);
  lines.push(
    `- transportStoragePassed: ${String(summary.transportStoragePassed)}`,
  );
  lines.push(`- resourcePassed: ${String(summary.resourcePassed)}`);
  lines.push('');
  lines.push(LOCAL_STR_CORRECTNESS_CHECKS);
  for (const check of correctness.checks) {
    lines.push(`- ${check.check}: ${check.status}`);
  }
  lines.push('');
  lines.push(LOCAL_STR_TRANSPORT_AND_STORAGE_CHECKS);
  for (const check of transportStorage.checks) {
    lines.push(`- ${check.check}: ${check.status}`);
  }
  lines.push('');
  lines.push(LOCAL_STR_RESOURCE_SUMMARY);
  if (resource.idleSoak && resource.idleSoak.summary) {
    const idle = resource.idleSoak.summary;
    lines.push(`- idleCpuPercent: ${idle.cpuPercent.toFixed(2)}`);
    lines.push(`- rssGrowthBytes: ${idle.rssGrowthBytes}`);
    lines.push(`- writeBytesPerSec: ${idle.writeBytesPerSec.toFixed(2)}`);
  } else {
    lines.push(LOCAL_STR_IDLE_SOAK_UNAVAILABLE);
  }
  if (resource.writeLoad) {
    lines.push(`- writeOpsPerSecond: ${resource.writeLoad.writesPerSecond.toFixed(2)}`);
  }
  lines.push('');
  lines.push(LOCAL_STR_ISSUES);
  if (summary.issues.length === 0) {
    lines.push(LOCAL_STR_NONE);
  } else {
    for (const issue of summary.issues) {
      lines.push(`- [${issue.severity}] ${issue.component}: ${issue.message}`);
    }
  }
  lines.push('');
  lines.push(LOCAL_STR_NEXT_ACTION);
  if (summary.goCandidate) {
    lines.push(LOCAL_STR_PROCEED_TO_PHASE_2_MIGRATION_DESIGN_WITH);
  } else {
    lines.push(LOCAL_STR_NO_GO_FOR_MIGRATION_KEEP_LIFERAFT_AS_DEF);
  }
  return lines.join(LOCAL_STR_NEWLINE);
}

/**
 * Main execution entrypoint.
 * @return {Promise<void>}
 */
async function main() {
  const restoreNoisyLogFilter = installNoisyCommitLogFilter(process.env);

  try {
    const args = parseArgs(process.argv.slice(2));
    if (!isRaftLogicSpikeEnabled(process.env)) {
      throw new Error(
        `Set ${RAFT_PROVIDER_CONTROL.ENV_KEY}=${RAFT_PROVIDER_CONTROL.RAFT_LOGIC_SPIKE}` +
      LOCAL_STR_TO_RUN_THE_CONTAINED_SPIKE,
      );
    }

    await mkdir(args.reportDir, {recursive: true});

    const correctness = await runCorrectnessChecks({
      loadWrites: args.loadWrites,
    });
    const transportStorage = await runTransportStorageChecks(args.reportDir);
    const resource = await runResourceChecks({
      idleSoakMs: args.idleSoakMs,
      sampleIntervalMs: args.sampleIntervalMs,
      loadWrites: args.loadWrites,
    });
    const baseline = await collectBaselineSnapshot();
    const summary = buildFinalRecommendation({
      correctness,
      transportStorage,
      resource,
      baseline,
    });

    await writeFile(
      join(args.reportDir, REPORT_FILE.CORRECTNESS),
      JSON.stringify(correctness, null, 2),
    );
    await writeFile(
      join(args.reportDir, REPORT_FILE.TRANSPORT_STORAGE),
      JSON.stringify(transportStorage, null, 2),
    );
    await writeFile(
      join(args.reportDir, REPORT_FILE.RESOURCE),
      JSON.stringify(resource, null, 2),
    );
    await writeFile(
      join(args.reportDir, REPORT_FILE.SUMMARY),
      JSON.stringify(summary, null, 2),
    );
    await writeFile(
      join(args.reportDir, REPORT_FILE.SUMMARY_MD),
      buildMarkdownSummary(summary, correctness, transportStorage, resource),
    );
  } finally {
    restoreNoisyLogFilter();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
