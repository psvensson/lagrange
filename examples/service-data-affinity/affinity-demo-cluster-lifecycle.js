import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {
  LOCAL_PROCESS_DATA_DISPOSITION,
  LOCAL_PROCESS_ENVIRONMENT_NAME,
  LOCAL_PROCESS_RESTART_DECISION,
  createLocalProcessCluster,
} from './cluster-harness.js';
import {collectFormationVerdict} from './formation-verdict.js';
import {startGcpAffinityCluster} from './gcp-cluster-provider.js';
import {collectHostSchedulingEvidence} from './host-scheduling-evidence.js';
import {
  CLUSTER_DATA_ROOT,
  DEMO_CONSTANTS,
  FORMATION_ONLY_ENV,
  FORMATION_ONLY_FLAG,
  GCP_MODE_ENV,
  GCP_MODE_FLAG,
  NODE_COUNT,
  NODE_STATUS_ACTIVE,
  PARTITION_EVAL_INTERVAL_MS,
} from './affinity-demo-run-constants.js';

const MAX_JOIN_RESTARTS = 5;
const ARCHIVE_ROOT = `${CLUSTER_DATA_ROOT}-archive`;
const ARCHIVE_RETENTION = 3;
const AUTO_ARCHIVE_NAME_PATTERN = /^run-\d{4}-\d{2}-\d{2}T.*\.tar\.gz$/;
const execFileAsync = promisify(execFile);

function resolveFormationOnly() {
  return process.argv.includes(FORMATION_ONLY_FLAG) ||
    process.env[FORMATION_ONLY_ENV] === DEMO_CONSTANTS.ENABLED_VALUE;
}

function resolveClusterMode() {
  return process.argv.includes(GCP_MODE_FLAG) ||
    process.env[GCP_MODE_ENV] === DEMO_CONSTANTS.ENABLED_VALUE ?
    DEMO_CONSTANTS.GCP_MODE :
    DEMO_CONSTANTS.LOCAL_MODE;
}

async function waitForAffinityAdmin(waitFor, queryRows, deadlineMs) {
  await waitFor(DEMO_CONSTANTS.ADMIN_WAIT_LABEL, async () => {
    await queryRows(DEMO_CONSTANTS.ADMIN_HEALTH_QUERY);
    return true;
  }, Math.max(0, deadlineMs - Date.now()));
}

async function restartExitedLocalNode(
  cluster, node, restartCounts, deadlineMs,
) {
  const restartCount = (restartCounts.get(node.nodeId) || 0) + 1;
  if (restartCount > MAX_JOIN_RESTARTS) {
    throw new Error(
      `node-${node.index} exceeded ${MAX_JOIN_RESTARTS} join restarts`);
  }
  console.log(
    `      node-${node.index} exited before joining ` +
    `(exit=${node.process.exitCode}); respawning ` +
    `(attempt ${restartCount}/${MAX_JOIN_RESTARTS})...`);
  const successor = await cluster.restartNode(node, {
    decision: LOCAL_PROCESS_RESTART_DECISION.ACCEPT_EARLY_EXIT,
    dataDisposition: LOCAL_PROCESS_DATA_DISPOSITION.RESET,
    deadlineMs,
  });
  restartCounts.set(node.nodeId, restartCount);
  return successor;
}

async function waitForActiveLocalNodes(expectedCount, cluster, waitFor,
  queryRows, deadlineMs) {
  const restartCounts = new Map();
  await waitFor(`${expectedCount} active nodes`, async () => {
    for (const node of cluster.nodes) {
      if (node.process.exitCode === null && node.process.signalCode === null) {
        continue;
      }
      await restartExitedLocalNode(
        cluster, node, restartCounts, deadlineMs);
    }
    const rows = await queryRows('SELECT node_id, status FROM nodes');
    const active = rows.filter((row) => row.status === NODE_STATUS_ACTIVE);
    return active.length >= expectedCount ? true : null;
  }, Math.max(0, deadlineMs - Date.now()));
}

async function waitForActiveGcpNodes(
  expectedCount, waitFor, queryRows, deadlineMs,
) {
  await waitFor(`${expectedCount} active nodes`, async () => {
    const rows = await queryRows('SELECT node_id, status FROM nodes');
    const active = rows.filter((row) => row.status === NODE_STATUS_ACTIVE);
    return active.length >= expectedCount ? true : null;
  }, Math.max(0, deadlineMs - Date.now()));
}

async function startAffinityDemoCluster(mode, dataRoot) {
  if (mode === DEMO_CONSTANTS.GCP_MODE) {
    console.log(DEMO_CONSTANTS.GCP_START_MESSAGE);
    const gcp = await startGcpAffinityCluster({
      verbose: true,
      outputDir: dataRoot,
    });
    return {
      cluster: gcp.cluster,
      provisioner: gcp.provisioner,
      target: gcp.target,
      loadTarget: `${gcp.target}?lane=load`,
      stop: gcp.stop,
    };
  }
  const cluster = createLocalProcessCluster({
    dataRoot,
    logRoot: dataRoot,
    environmentOverrides: {
      [LOCAL_PROCESS_ENVIRONMENT_NAME.PARTITION_EVALUATION_INTERVAL_MS]:
        String(PARTITION_EVAL_INTERVAL_MS),
    },
  });
  return {
    cluster,
    stop: cluster.stop,
    harvestLogs: async () => null,
  };
}

async function archivePreviousAffinityRun() {
  if (!existsSync(CLUSTER_DATA_ROOT)) return;
  await mkdir(ARCHIVE_ROOT, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = resolve(ARCHIVE_ROOT, `run-${stamp}.tar.gz`);
  try {
    await execFileAsync(DEMO_CONSTANTS.ARCHIVE_COMMAND, [
      DEMO_CONSTANTS.ARCHIVE_CREATE_FLAG, archivePath,
      DEMO_CONSTANTS.ARCHIVE_DIRECTORY_FLAG,
      resolve(CLUSTER_DATA_ROOT, DEMO_CONSTANTS.PARENT_DIRECTORY),
      CLUSTER_DATA_ROOT.split(DEMO_CONSTANTS.PATH_SEPARATOR).pop(),
    ]);
    console.log(`      Archived previous run state to ${archivePath}`);
  } catch (error) {
    console.log(
      `      (previous-run archive failed: ${error.message} - proceeding)`);
    return;
  }
  const archiveNames = (await readdir(ARCHIVE_ROOT))
    .filter((name) => AUTO_ARCHIVE_NAME_PATTERN.test(name));
  const entries = await Promise.all(archiveNames.map(async (name) => ({
    name,
    mtimeMs: (await stat(resolve(ARCHIVE_ROOT, name))).mtimeMs,
  })));
  entries.sort((left, right) => left.mtimeMs - right.mtimeMs);
  while (entries.length > ARCHIVE_RETENTION) {
    await rm(resolve(ARCHIVE_ROOT, entries.shift().name), {force: true});
  }
}

function cleanupFailureEvidence(stage, error) {
  return Object.freeze({
    stage,
    code: error?.code || 'AFFINITY_DEMO_CLEANUP_STEP_FAILURE',
    message: error?.message || String(error),
  });
}

async function attemptCleanupStage(failures, stage, operation) {
  try {
    return await operation();
  } catch (error) {
    failures.push({stage, error});
    return null;
  }
}

function attemptOwnedCleanupStage(failures, stage, owner, methodName) {
  const operation = owner?.[methodName];
  return typeof operation === 'function' ?
    attemptCleanupStage(failures, stage, () => operation.call(owner)) :
    Promise.resolve(null);
}

async function materializeRemoteLogs(remoteLogs, dataRoot, writeLog) {
  for (let index = 0; index < remoteLogs.length; index += 1) {
    await writeLog(
      resolve(dataRoot, `node-${index}.log`),
      remoteLogs[index].text || DEMO_CONSTANTS.EMPTY_STRING,
    );
  }
}

async function finalizeAffinityDemoRun({
  clusterHandle,
  phaseEvidence,
  formation,
  dataRoot = CLUSTER_DATA_ROOT,
  nodeCount = NODE_COUNT,
  collectHostScheduling = collectHostSchedulingEvidence,
  collectVerdict = collectFormationVerdict,
  writeLog = writeFile,
}) {
  const failures = [];
  const remoteLogs = await attemptOwnedCleanupStage(
    failures, 'harvest_logs', clusterHandle, 'harvestLogs');
  await attemptOwnedCleanupStage(
    failures, 'stop_cluster', clusterHandle, 'stop');
  if (remoteLogs) {
    await attemptCleanupStage(
      failures, 'materialize_logs',
      () => materializeRemoteLogs(remoteLogs, dataRoot, writeLog));
  }
  const hostScheduling = await attemptCleanupStage(
    failures, 'host_scheduling_evidence',
    () => collectHostScheduling(dataRoot, nodeCount));
  if (hostScheduling) phaseEvidence.hostScheduling = hostScheduling;
  const formationVerdict = await attemptCleanupStage(
    failures, 'formation_verdict',
    () => collectVerdict(dataRoot, {
      schemaAdmission: phaseEvidence.schemaAdmission,
      formation,
    }));
  if (formationVerdict) phaseEvidence.formationVerdict = formationVerdict;
  const evidence = Object.freeze(failures.map(({stage, error}) =>
    cleanupFailureEvidence(stage, error)));
  phaseEvidence.cleanupFailures = evidence;
  return {failures, evidence};
}

function createAffinityDemoCleanupError(cleanup) {
  const error = new AggregateError(
    cleanup.failures.map(({error: cause}) => cause),
    `Affinity demo cleanup failed (${cleanup.failures.length})`,
  );
  error.code = 'AFFINITY_DEMO_CLEANUP_FAILURE';
  error.details = Object.freeze({failures: cleanup.evidence});
  return error;
}

function completeAffinityDemoRun(bodyFailed, primaryError, result, cleanup) {
  if (bodyFailed) throw primaryError;
  if (cleanup.failures.length > 0) {
    throw createAffinityDemoCleanupError(cleanup);
  }
  return result;
}

async function settleAffinityDemoCleanup(context) {
  try {
    return await finalizeAffinityDemoRun(context);
  } catch (error) {
    const failures = [{stage: 'cleanup_owner', error}];
    const evidence = Object.freeze([
      cleanupFailureEvidence('cleanup_owner', error),
    ]);
    try {
      context.phaseEvidence.cleanupFailures = evidence;
    } catch {
      // Evidence publication is secondary to preserving the body error.
    }
    return {failures, evidence};
  }
}

function retainPrimarySchemaAdmission(phaseEvidence, error) {
  try {
    if (error?.schemaAdmission && !phaseEvidence.schemaAdmission) {
      phaseEvidence.schemaAdmission = error.schemaAdmission;
    }
  } catch {
    // Evidence retention cannot replace the exact body error.
  }
}

async function withAffinityDemoCleanup(context, operation) {
  let bodyFailed = false;
  let primaryError;
  let result = null;
  let cleanup = null;
  try {
    result = await operation();
  } catch (error) {
    bodyFailed = true;
    retainPrimarySchemaAdmission(context.phaseEvidence, error);
    primaryError = error;
  } finally {
    try {
      console.log(DEMO_CONSTANTS.STOP_MESSAGE);
    } catch {
      // A diagnostic sink cannot prevent resource cleanup.
    }
    cleanup = await settleAffinityDemoCleanup(context);
  }
  return completeAffinityDemoRun(bodyFailed, primaryError, result, cleanup);
}

export {
  archivePreviousAffinityRun,
  completeAffinityDemoRun,
  finalizeAffinityDemoRun,
  resolveClusterMode,
  resolveFormationOnly,
  restartExitedLocalNode,
  startAffinityDemoCluster,
  waitForActiveGcpNodes,
  waitForActiveLocalNodes,
  waitForAffinityAdmin,
  withAffinityDemoCleanup,
};
