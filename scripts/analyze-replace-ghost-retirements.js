#!/usr/bin/env node

// CL-023 stable witness: per priority partition, the intersection of
// {sourceReplicaId of REPLACE ops with workflow_step=REMOVED} with
// {replica_id of ACTIVE services rows} must be EMPTY in the final snapshot.
// A non-zero count means a REPLACE terminalized as REMOVED while its source
// replica is still alive (ghost retirement); the planner's retirement
// projection then filters live replicas out of planning.
//
// The snapshot intersection alone false-positives on LEGIT completions whose
// services-row DELETE hasn't reached the snapshot node's view (the CL-014
// remote-DELETE propagation residual). When the run's .full-logs are present
// each hit is corroborated against the source node's 'Replica removal
// completed' log line; only uncorroborated hits count as ghosts.
//
// Usage:
//   node scripts/analyze-replace-ghost-retirements.js <snapshots.ndjson | run-dir>
// Exit code 0 when the witness holds (no uncorroborated hits), 1 otherwise.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  isPriorityControlPlanePartition,
} from '../src/bootstrap/system-partition-classification.js';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const SNAPSHOTS_FILENAME = 'snapshots.ndjson';
const WORKFLOW_STEP_REMOVED = 'REMOVED';
const OPERATION_TYPE_REPLACE = 'REPLACE';
const SERVICE_STATUS_ACTIVE = 'active';
const JSON_INDENT_SPACES = 2;
const HELP_TEXT = [
  'Usage:',
  '  node scripts/analyze-replace-ghost-retirements.js ' +
    '<snapshots.ndjson | run-dir>',
  '',
  'Computes the CL-023 ghost-retirement witness from the final snapshot:',
  'per priority partition, |{REMOVED-REPLACE source replica ids} INTERSECT',
  '{ACTIVE services replica ids}|. Healthy value: 0 everywhere.',
].join('\n');

function resolveSnapshotsPath(inputPath) {
  const stats = fs.statSync(inputPath);
  if (stats.isFile()) {
    return inputPath;
  }
  const direct = path.join(inputPath, SNAPSHOTS_FILENAME);
  if (fs.existsSync(direct)) {
    return direct;
  }
  for (const entry of fs.readdirSync(inputPath)) {
    const candidate = path.join(inputPath, entry, SNAPSHOTS_FILENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No ${SNAPSHOTS_FILENAME} under ${inputPath}`);
}

const REMOVAL_COMPLETED_LOG_LINE = 'Replica removal completed';
const FULL_LOGS_DIRNAME = '.full-logs';
const NODE_LOG_FILENAME = 'node.ndjson';

function collectRemovalCompletedReplicaIds(snapshotsPath) {
  const runDir = path.dirname(path.dirname(snapshotsPath));
  const fullLogsRoot = path.join(runDir, FULL_LOGS_DIRNAME);
  if (!fs.existsSync(fullLogsRoot)) {
    return null;
  }
  const removedReplicaIds = new Set();
  for (const scenario of fs.readdirSync(fullLogsRoot)) {
    const scenarioDir = path.join(fullLogsRoot, scenario);
    if (!fs.statSync(scenarioDir).isDirectory()) {
      continue;
    }
    for (const node of fs.readdirSync(scenarioDir)) {
      const logPath = path.join(scenarioDir, node, NODE_LOG_FILENAME);
      if (!fs.existsSync(logPath)) {
        continue;
      }
      for (const line of fs.readFileSync(logPath, 'utf8').split('\n')) {
        if (!line.includes(REMOVAL_COMPLETED_LOG_LINE)) {
          continue;
        }
        try {
          const entry = JSON.parse(line);
          const replicaId = String(entry.replicaId || '').trim();
          if (replicaId.length > 0) {
            removedReplicaIds.add(replicaId);
          }
        } catch {
          // skip unparseable lines
        }
      }
    }
  }
  return removedReplicaIds;
}

function readFinalSnapshot(snapshotsPath) {
  const lines = fs
    .readFileSync(snapshotsPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error(`Empty snapshots file: ${snapshotsPath}`);
  }
  return JSON.parse(lines[lines.length - 1]);
}

function resolveReplaceSourceReplicaId(operation) {
  let history = operation.steps_history ?? operation.stepsHistory;
  if (typeof history === 'string') {
    try {
      history = JSON.parse(history);
    } catch {
      history = [];
    }
  }
  if (!Array.isArray(history)) {
    history = [];
  }
  for (const entry of history) {
    const sourceReplicaId = String(entry?.sourceReplicaId || '').trim();
    if (sourceReplicaId.length > 0) {
      return sourceReplicaId;
    }
  }
  return null;
}

function computeGhostRetirementWitness(snapshot, removalCompletedReplicaIds) {
  const operations = Array.isArray(snapshot.replicaOperations) ?
    snapshot.replicaOperations :
    [];
  const services = Array.isArray(snapshot.services) ? snapshot.services : [];
  const activeReplicaIdsByPartition = new Map();
  for (const service of services) {
    const partitionId = String(service?.partition_id || '').trim();
    const replicaId = String(
      service?.replica_id || service?.service_id || '',
    ).trim();
    const status = String(service?.status || '').toLowerCase();
    if (!partitionId || !replicaId || status !== SERVICE_STATUS_ACTIVE) {
      continue;
    }
    if (!activeReplicaIdsByPartition.has(partitionId)) {
      activeReplicaIdsByPartition.set(partitionId, new Set());
    }
    activeReplicaIdsByPartition.get(partitionId).add(replicaId);
  }

  const byPartition = new Map();
  for (const operation of operations) {
    const partitionId = String(operation?.partition_id || '').trim();
    if (
      !partitionId ||
      !isPriorityControlPlanePartition({partitionId}) ||
      String(operation?.type || '').toUpperCase() !== OPERATION_TYPE_REPLACE ||
      String(operation?.workflow_step || '').toUpperCase() !==
        WORKFLOW_STEP_REMOVED
    ) {
      continue;
    }
    const sourceReplicaId = resolveReplaceSourceReplicaId(operation);
    if (!sourceReplicaId) {
      continue;
    }
    const activeIds =
      activeReplicaIdsByPartition.get(partitionId) || new Set();
    if (!byPartition.has(partitionId)) {
      byPartition.set(partitionId, {
        partitionId,
        removedReplaceCount: 0,
        ghostRetiredSourceReplicaIds: [],
        corroboratedRemovalSourceReplicaIds: [],
      });
    }
    const entry = byPartition.get(partitionId);
    entry.removedReplaceCount += 1;
    if (!activeIds.has(sourceReplicaId)) {
      continue;
    }
    if (removalCompletedReplicaIds?.has(sourceReplicaId)) {
      entry.corroboratedRemovalSourceReplicaIds.push(sourceReplicaId);
    } else {
      entry.ghostRetiredSourceReplicaIds.push(sourceReplicaId);
    }
  }

  const partitions = [...byPartition.values()].map((entry) => ({
    ...entry,
    ghostRetirementCount: entry.ghostRetiredSourceReplicaIds.length,
    staleSnapshotRowCount: entry.corroboratedRemovalSourceReplicaIds.length,
  }));
  const totalGhostRetirements = partitions.reduce(
    (sum, entry) => sum + entry.ghostRetirementCount,
    0,
  );
  return {
    witness: 'cl-023-replace-ghost-retirements',
    snapshotTimestamp: snapshot.timestamp ?? null,
    corroboration: removalCompletedReplicaIds ?
      'full-logs-removal-completed' :
      'none-snapshot-only',
    totalGhostRetirements,
    healthy: totalGhostRetirements === 0,
    partitions,
  };
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath || inputPath === '--help' || inputPath === '-h') {
    console.log(HELP_TEXT);
    process.exit(inputPath ? EXIT_SUCCESS : EXIT_FAILURE);
  }
  const snapshotsPath = resolveSnapshotsPath(inputPath);
  const snapshot = readFinalSnapshot(snapshotsPath);
  const removalCompletedReplicaIds =
    collectRemovalCompletedReplicaIds(snapshotsPath);
  const witness = computeGhostRetirementWitness(
    snapshot,
    removalCompletedReplicaIds,
  );
  console.log(JSON.stringify(witness, null, JSON_INDENT_SPACES));
  process.exit(witness.healthy ? EXIT_SUCCESS : EXIT_FAILURE);
}

main();
