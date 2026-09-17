/**
 * Storage footprint of the in-process cluster at one instant: bytes on disk
 * under the run directory, the SQLite Raft logs of every partition service
 * this process can reach, the in-memory message-group Raft logs, and the
 * process memory. Every figure is a plain number; the report owner
 * (scripts/checks/storage-load-report.js) says which ones are required.
 */
import {readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const RAFT_LOG_STATS_SQL =
  'SELECT COUNT(*) AS entries, COALESCE(SUM(LENGTH(command)), 0) AS bytes ' +
  'FROM _raft_log';
const MESSAGE_GROUP_SAMPLE_LIMIT = 50;
const TYPE_FUNCTION = 'function';

function walkBytes(directory, byTopLevel, depth) {
  let total = 0;
  let entries = [];
  try {
    entries = readdirSync(directory, {withFileTypes: true});
  } catch {
    return total;
  }
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      const below = walkBytes(entryPath, byTopLevel, depth + 1);
      if (depth === 0) byTopLevel[entry.name] = below;
      total += below;
    } else if (entry.isFile()) {
      try {
        total += statSync(entryPath).size;
      } catch {
        // A file removed between readdir and stat (a rotated WAL) is not a
        // footprint; the next snapshot sees the directory again.
      }
    }
  }
  return total;
}

/**
 * Bytes under the run's data directory, split by top-level node directory.
 * @param {string} dataDir
 * @return {{diskBytes: number, byNodeDir: Object<string, number>}}
 */
function measureDisk(dataDir) {
  const byNodeDir = {};
  const diskBytes = walkBytes(dataDir, byNodeDir, 0);
  return {diskBytes, byNodeDir};
}

function reachablePartitionServices(node) {
  const services = new Map();
  const maps = [
    node.bootstrapResult?.partitionServices,
    node.service?.partitionServices,
    node.bootstrapService?.replicaHandler?.localServices,
    node.service?.replicaHandler?.localServices,
  ];
  for (const map of maps) {
    if (!(map instanceof Map)) continue;
    for (const [replicaId, service] of map) {
      if (service && !services.has(replicaId)) services.set(replicaId, service);
    }
  }
  return services;
}

function raftLogStats(service) {
  const database = service?.db;
  if (!database || typeof database.prepare !== TYPE_FUNCTION) return null;
  try {
    const row = database.prepare(RAFT_LOG_STATS_SQL).get();
    return {
      entries: Number(row?.entries || 0),
      bytes: Number(row?.bytes || 0),
    };
  } catch {
    return null;
  }
}

/**
 * SQLite Raft log entries and command bytes across every reachable partition
 * service on every node.
 * @param {Object[]} nodes
 * @return {{raftLogEntries: number, raftLogCommandBytes: number,
 *   partitionsMeasured: number, partitionsSkipped: number}}
 */
function measureRaftLogs(nodes) {
  let raftLogEntries = 0;
  let raftLogCommandBytes = 0;
  let partitionsMeasured = 0;
  let partitionsSkipped = 0;
  for (const node of nodes) {
    for (const service of reachablePartitionServices(node).values()) {
      const stats = raftLogStats(service);
      if (stats === null) {
        partitionsSkipped += 1;
        continue;
      }
      partitionsMeasured += 1;
      raftLogEntries += stats.entries;
      raftLogCommandBytes += stats.bytes;
    }
  }
  return {raftLogEntries, raftLogCommandBytes, partitionsMeasured,
    partitionsSkipped};
}

function messageGroupServices(node) {
  const maps = [
    node.bootstrapResult?.messageGroupServices,
    node.joinResult?.messageGroupServices,
    node.service?.messageGroupServices,
  ];
  const services = new Set();
  for (const map of maps) {
    if (!(map instanceof Map)) continue;
    for (const service of map.values()) if (service) services.add(service);
  }
  return services;
}

function inMemoryLogFigures(log) {
  const entries = log?.entries;
  if (!(entries instanceof Map)) return null;
  let sampled = 0;
  let sampledBytes = 0;
  for (const entry of entries.values()) {
    if (sampled >= MESSAGE_GROUP_SAMPLE_LIMIT) break;
    sampled += 1;
    try {
      sampledBytes += JSON.stringify(entry).length;
    } catch {
      // An entry that cannot serialise still counts as one entry.
    }
  }
  const meanBytes = sampled > 0 ? sampledBytes / sampled : 0;
  return {entries: entries.size, approxBytes: Math.round(entries.size * meanBytes)};
}

/**
 * In-memory message-group Raft log entries across every message-group service
 * on every node (the never-compacted log the log-bound quest targets).
 * @param {Object[]} nodes
 * @return {{messageGroupLogEntries: number, messageGroupLogApproxBytes: number,
 *   messageGroupsMeasured: number}}
 */
function measureMessageGroupLogs(nodes) {
  let messageGroupLogEntries = 0;
  let messageGroupLogApproxBytes = 0;
  let messageGroupsMeasured = 0;
  for (const node of nodes) {
    for (const service of messageGroupServices(node)) {
      const figures = inMemoryLogFigures(service?.raft?.log);
      if (figures === null) continue;
      messageGroupsMeasured += 1;
      messageGroupLogEntries += figures.entries;
      messageGroupLogApproxBytes += figures.approxBytes;
    }
  }
  return {messageGroupLogEntries, messageGroupLogApproxBytes,
    messageGroupsMeasured};
}

/**
 * One storage footprint sample.
 * @param {Object} options
 * @param {string} options.dataDir - The run's data directory.
 * @param {Object[]} options.nodes - Cluster node handles.
 * @return {Object} Storage figures for one snapshot.
 */
function collectStorageFootprint({dataDir, nodes}) {
  const memory = process.memoryUsage();
  return {
    ...measureDisk(dataDir),
    ...measureRaftLogs(nodes),
    ...measureMessageGroupLogs(nodes),
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
  };
}

export {collectStorageFootprint};
