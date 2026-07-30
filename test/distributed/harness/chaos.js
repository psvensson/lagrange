/**
 * Chaos Primitives — fault injection operations for distributed testing.
 * Each primitive delegates to the Docker Provider for container/network ops.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import {NETWORK} from './constants.js';
import {posix as pathPosix} from 'node:path';

const arrayMap = Function.call.bind(Array.prototype.map);
const NETEM_DEVICE = 'eth0';
const NETEM_QDISC_ROOT = 'root';
const TC_COMMAND = 'tc';
const DD_COMMAND = 'dd';
const DD_BLOCK_SIZE = '1024';
const DD_BLOCK_COUNT = '1';
const DD_BLOCK_SIZE_MEGABYTE = '1M';
const MKDIR_COMMAND = 'mkdir';
const MKDIR_PARENTS_FLAG = '-p';
const REMOVE_COMMAND = 'rm';
const REMOVE_FORCE_FLAG = '-f';
const REMOVE_RECURSIVE_FORCE_FLAG = '-rf';
const SYNC_COMMAND = 'sync';
// In-container data layout (DATA_DIR is /data in the container env; see
// cluster-class-lifecycle-base.js env[DATA_DIR]=DATA_DIR_PATH='/data') and the
// storage path grammar (src/storage/data-directory-manager.js getPartitionDbPath
// = {dataDir}/partitions/{pid}/{rid}.db; src/raft/snapshot-install.js checkpoints
// root = {partitionDir}/checkpoints/{rid}). Kept as local constants — matching the
// existing DISK_PRESSURE_DIR local-constant style — to wipe a replica's durable
// state so a restarted node must rebuild it via snapshot transfer.
const CONTAINER_DATA_DIR = '/data';
const PARTITIONS_DIRNAME = 'partitions';
const CHECKPOINTS_DIRNAME = 'checkpoints';
const REPLICA_DB_EXT = '.db';
const REPLICA_DB_WAL_SUFFIX = '-wal';
const REPLICA_DB_SHM_SUFFIX = '-shm';
const NETEM_ACTION_REPLACE = 'replace';
const DISK_PRESSURE_DEFAULT_SIZE_MB = 256;
const DISK_PRESSURE_MIN_SIZE_MB = 1;
const DISK_PRESSURE_DIR = '/tmp/lagrange-chaos';
const DISK_PRESSURE_FILE_PREFIX = 'disk-pressure';
const CONTAINER_RUNNING_STATE = 'running';
const RESTART_RUNNING_TIMEOUT_MS = 30000;
const RESTART_POLL_INTERVAL_MS = 250;
const NODE_ADDRESS_ENV_KEY = 'NODE_ADDRESS';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readInspectEnvValue(inspect, key) {
  const envList = Array.isArray(inspect?.Config?.Env) ?
    inspect.Config.Env :
    [];
  const prefix = String(key || '') + '=';
  for (const entry of envList) {
    if (typeof entry === 'string' && entry.startsWith(prefix)) {
      return entry.slice(prefix.length);
    }
  }
  return null;
}

function normalizeContainerName(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
}

function extractNodeHostname(nodeAddress) {
  if (typeof nodeAddress !== 'string') {
    return null;
  }
  const trimmed = nodeAddress.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const normalized = trimmed.replace(/^[a-z]+:\/\//i, '');
  if (normalized.startsWith('[')) {
    const bracketClose = normalized.indexOf(']');
    return bracketClose > 1 ? normalized.slice(1, bracketClose) : null;
  }
  const lastColon = normalized.lastIndexOf(':');
  if (lastColon > 0 && normalized.indexOf(':') === lastColon) {
    return normalized.slice(0, lastColon);
  }
  return normalized;
}

function resolveExpectedAlias(inspect) {
  return extractNodeHostname(
    readInspectEnvValue(inspect, NODE_ADDRESS_ENV_KEY),
  ) || normalizeContainerName(inspect?.Name);
}

function findNetworkEndpoint(inspect, networkId) {
  const networks = inspect?.NetworkSettings?.Networks;
  if (!networks || typeof networks !== 'object') {
    return null;
  }
  for (const endpoint of Object.values(networks)) {
    if (endpoint?.NetworkID === networkId) {
      return endpoint;
    }
  }
  return null;
}

function hasNetworkAlias(endpointSettings, expectedAlias) {
  if (!endpointSettings || typeof endpointSettings !== 'object') {
    return false;
  }
  if (typeof expectedAlias !== 'string' || expectedAlias.length === 0) {
    return true;
  }
  const aliases = Array.isArray(endpointSettings.Aliases) ?
    endpointSettings.Aliases :
    [];
  return aliases.includes(expectedAlias);
}

class ChaosPrimitives {
  /**
   * @param {Object} dockerProvider - DockerProvider instance
   * @param {Map<string, Object>} nodes - Map of nodeId → NodeHandle
   * @param {string} networkId - Main cluster network ID
   */
  constructor(dockerProvider, nodes, networkId) {
    // Primary provider (host of node 0). Used only for network-wide resources
    // that live on one daemon (the isolation networks). Node-targeted ops must
    // resolve the node's OWN provider — see _providerForNode — otherwise
    // kill/stop/start/restart on a multi-host cluster silently target the wrong
    // Docker daemon.
    this._dockerProvider = dockerProvider;
    this._nodes = nodes;
    this._networkId = networkId;
    this._isolationState = null;
    this._diskPressureFileByNodeId = new Map();
  }

  /**
   * Look up a node's handle by nodeId.
   * @param {string} nodeId
   * @returns {Object} node handle
   */
  _getNode(nodeId) {
    const node = this._nodes.get(nodeId);
    if (!node) {
      throw new Error(
        `Node "${nodeId}" not found in cluster. ` +
        `Available nodes: ${[...this._nodes.keys()].join(', ')}`,
      );
    }
    return node;
  }

  /**
   * Look up a node's container ID by nodeId.
   * @param {string} nodeId
   * @returns {string} containerId
   */
  _getContainerId(nodeId) {
    return this._getNode(nodeId).containerId;
  }

  /**
   * Resolve the Docker provider that actually hosts a node. Each node handle
   * carries the provider that created its container (per-host on a multi-host
   * cluster); fall back to the primary provider when a handle lacks one.
   * @param {string} nodeId
   * @returns {Object} DockerProvider
   */
  _providerForNode(nodeId) {
    return this._getNode(nodeId)?._dockerProvider || this._dockerProvider;
  }

  /**
   * Resolve one disk-pressure file path for a node.
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @return {string}
   * @private
   */
  _resolveDiskPressureFilePath(nodeId, options = {}) {
    if (typeof options.filePath === 'string' &&
        options.filePath.trim().length > 0) {
      return options.filePath.trim();
    }
    return `${DISK_PRESSURE_DIR}/` +
      `${DISK_PRESSURE_FILE_PREFIX}-${nodeId}.bin`;
  }

  /**
   * Resolve one disk-pressure payload size.
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  _resolveDiskPressureSizeMb(options = {}) {
    const parsedSize = Number(options.sizeMb);
    if (!Number.isFinite(parsedSize)) {
      return DISK_PRESSURE_DEFAULT_SIZE_MB;
    }
    const normalizedSize = Math.floor(parsedSize);
    if (normalizedSize < DISK_PRESSURE_MIN_SIZE_MB) {
      return DISK_PRESSURE_MIN_SIZE_MB;
    }
    return normalizedSize;
  }

  /**
   * Kill a node (SIGKILL). Req 4.1
   * @param {string} nodeId
   */
  async killNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._providerForNode(nodeId).killContainer(containerId);
  }

  /**
   * Stop a node gracefully (SIGTERM). Req 4.2
   * @param {string} nodeId
   */
  async stopNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._providerForNode(nodeId).stopContainer(containerId);
  }

  /**
   * Pause a node (SIGSTOP). Req 4.3
   * @param {string} nodeId
   */
  async pauseNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._providerForNode(nodeId).pauseContainer(containerId);
  }

  /**
   * Unpause a node (SIGCONT). Req 4.3
   * @param {string} nodeId
   */
  async unpauseNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._providerForNode(nodeId).unpauseContainer(containerId);
  }

  /**
   * Restart a node, preserving its data volume. Req 4.4
   * @param {string} nodeId
   */
  async restartNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._providerForNode(nodeId).restartContainer(containerId);
    await this._restoreRestartedNodeNetworkIdentity(nodeId, containerId);
  }

  /**
   * Start a previously stopped node and restore its canonical network identity.
   * @param {string} nodeId
   */
  async startNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._providerForNode(nodeId).startContainer(containerId);
    await this._restoreRestartedNodeNetworkIdentity(nodeId, containerId);
  }

  /**
   * Restore main-network alias and node IP after one restart/start cycle.
   * @param {string} nodeId
   * @param {string} containerId
   * @return {Promise<void>}
   * @private
   */
  async _restoreRestartedNodeNetworkIdentity(nodeId, containerId) {
    // Host-network mode: there is no bridge network and node.ip is the host's
    // external IP, which does not change across a container restart. Nothing
    // to restore — return early rather than matching a null _networkId.
    if (!this._networkId) {
      return;
    }
    const node = this._nodes.get(nodeId);
    const provider = this._providerForNode(nodeId);
    if (typeof provider.inspectContainer !== 'function') {
      return;
    }

    const inspect = await this._waitForRestartRunning(nodeId, containerId);
    const expectedAlias = resolveExpectedAlias(inspect);
    const mainEndpoint = findNetworkEndpoint(inspect, this._networkId);

    if (mainEndpoint?.IPAddress && node) {
      node.ip = mainEndpoint.IPAddress;
    }

    if (!this._networkId ||
        this._isolationState ||
        typeof provider.connectToNetwork !== 'function' ||
        !containerId) {
      return;
    }

    if (hasNetworkAlias(mainEndpoint, expectedAlias)) {
      return;
    }

    if (mainEndpoint &&
        typeof provider.disconnectFromNetwork === 'function') {
      await provider.disconnectFromNetwork(
        this._networkId,
        containerId,
      );
    }

    await provider.connectToNetwork(
      this._networkId,
      containerId,
      expectedAlias ? [expectedAlias] : [],
    );

    if (typeof provider.inspectContainer === 'function') {
      const refreshedInspect = await provider.inspectContainer(containerId);
      const refreshedMainEndpoint = findNetworkEndpoint(
        refreshedInspect,
        this._networkId,
      );
      if (refreshedMainEndpoint?.IPAddress && node) {
        node.ip = refreshedMainEndpoint.IPAddress;
      }
      if (!hasNetworkAlias(refreshedMainEndpoint, expectedAlias)) {
        throw new Error(
          'Restarted node failed to restore main-network alias: ' +
          String(expectedAlias || containerId),
        );
      }
    }
  }

  /**
   * Throw when a partition would span more than one Docker host. Bridge
   * networks are local to a single daemon, so partitionNetwork/healPartition
   * only make sense when every affected node lives on the same host.
   * @param {Array<string>} nodeIds
   * @private
   */
  _assertSingleHostPartition(nodeIds) {
    const providers = new Set(
      arrayMap(nodeIds, (nodeId) => this._providerForNode(nodeId)),
    );
    if (providers.size > 1) {
      throw new Error(
        'partitionNetwork/healPartition is not supported across multiple ' +
        'Docker hosts: bridge networks are per-daemon and cannot span ' +
        'hosts. Run partition scenarios on a single-host cluster, or place ' +
        'all affected nodes on one host.',
      );
    }
  }

  /**
   * Partition network into two isolated groups. Req 4.5
   * Creates secondary isolation networks, disconnects all nodes from
   * the main network, and connects each group to its own isolation net.
   * @param {Array<string>} groupA - Node IDs for group A
   * @param {Array<string>} groupB - Node IDs for group B
   */
  async partitionNetwork(groupA, groupB) {
    // Bridge networks are per-daemon and cannot span Docker hosts, so a
    // cross-host partition via bridge isolation networks is semantically
    // meaningless: isolation networks minted on the primary daemon would be
    // "network not found" on every other host, leaving a half-partitioned
    // cluster. Fail loudly instead of corrupting the topology.
    this._assertSingleHostPartition([...groupA, ...groupB]);
    const isoNetA = await this._dockerProvider.createNetwork(
      `${NETWORK.ISOLATION_PREFIX}-a-${Date.now()}`,
    );
    const isoNetB = await this._dockerProvider.createNetwork(
      `${NETWORK.ISOLATION_PREFIX}-b-${Date.now()}`,
    );

    const allNodeIds = [...groupA, ...groupB];
    const containerIds = allNodeIds.map((id) => ({
      nodeId: id,
      containerId: this._getContainerId(id),
    }));

    for (const {nodeId, containerId} of containerIds) {
      await this._providerForNode(nodeId).disconnectFromNetwork(
        this._networkId, containerId,
      );
    }

    for (const nodeId of groupA) {
      const containerId = this._getContainerId(nodeId);
      await this._providerForNode(nodeId).connectToNetwork(
        isoNetA.id, containerId,
      );
    }

    for (const nodeId of groupB) {
      const containerId = this._getContainerId(nodeId);
      await this._providerForNode(nodeId).connectToNetwork(
        isoNetB.id, containerId,
      );
    }

    this._isolationState = {
      isoNetA,
      isoNetB,
      groupA,
      groupB,
    };
  }

  /**
   * Restore full network connectivity after a partition. Req 4.6
   * Disconnects all nodes from isolation networks, reconnects them
   * to the main network, and removes isolation networks.
   */
  async healPartition() {
    if (!this._isolationState) {
      return;
    }

    const {isoNetA, isoNetB, groupA, groupB} = this._isolationState;

    for (const nodeId of groupA) {
      const containerId = this._getContainerId(nodeId);
      await this._providerForNode(nodeId).disconnectFromNetwork(
        isoNetA.id, containerId,
      );
    }

    for (const nodeId of groupB) {
      const containerId = this._getContainerId(nodeId);
      await this._providerForNode(nodeId).disconnectFromNetwork(
        isoNetB.id, containerId,
      );
    }

    const allNodeIds = [...groupA, ...groupB];
    for (const nodeId of allNodeIds) {
      const containerId = this._getContainerId(nodeId);
      await this._providerForNode(nodeId).connectToNetwork(
        this._networkId, containerId,
      );
    }

    await this._dockerProvider.removeNetwork(isoNetA.id);
    await this._dockerProvider.removeNetwork(isoNetB.id);

    this._isolationState = null;
  }

  /**
   * Add network delay via tc qdisc netem. Req 4.7
   * @param {string} nodeId
   * @param {Object} options
   * @param {number} options.latency - Delay in milliseconds
   * @param {number} options.jitter - Jitter in milliseconds
   */
  async slowNetwork(nodeId, {latency, jitter}) {
    const containerId = this._getContainerId(nodeId);
    await this._providerForNode(nodeId).execInContainer(containerId, [
      TC_COMMAND, 'qdisc', NETEM_ACTION_REPLACE, 'dev', NETEM_DEVICE,
      NETEM_QDISC_ROOT, 'netem', 'delay',
      `${latency}ms`, `${jitter}ms`,
    ]);
  }

  /**
   * Clear previously injected network delay for one node.
   * @param {string} nodeId
   */
  async clearNetworkSlowdown(nodeId) {
    const containerId = this._getContainerId(nodeId);
    try {
      await this._providerForNode(nodeId).execInContainer(containerId, [
        TC_COMMAND, 'qdisc', 'del', 'dev', NETEM_DEVICE,
        NETEM_QDISC_ROOT,
      ]);
    } catch (_error) {
      // Clearing delay is best-effort so scenarios can recover idempotently.
    }
  }

  /**
   * Corrupt a file inside the container. Req 4.8
   * @param {string} nodeId
   * @param {string} filePath - Path inside the container to corrupt
   */
  async corruptDisk(nodeId, filePath) {
    const containerId = this._getContainerId(nodeId);
    await this._providerForNode(nodeId).execInContainer(containerId, [
      DD_COMMAND,
      'if=/dev/urandom',
      `of=${filePath}`,
      `bs=${DD_BLOCK_SIZE}`,
      `count=${DD_BLOCK_COUNT}`,
      'conv=notrunc',
    ]);
  }

  /**
   * Fill disk space on one node by writing a bounded payload file.
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @param {number} [options.sizeMb]
   * @param {string} [options.filePath]
   */
  async fillDisk(nodeId, options = {}) {
    const containerId = this._getContainerId(nodeId);
    const provider = this._providerForNode(nodeId);
    const filePath = this._resolveDiskPressureFilePath(nodeId, options);
    const sizeMb = this._resolveDiskPressureSizeMb(options);
    const parentDir = pathPosix.dirname(filePath);

    await provider.execInContainer(containerId, [
      MKDIR_COMMAND,
      MKDIR_PARENTS_FLAG,
      parentDir,
    ]);
    await provider.execInContainer(containerId, [
      DD_COMMAND,
      'if=/dev/zero',
      `of=${filePath}`,
      `bs=${DD_BLOCK_SIZE_MEGABYTE}`,
      `count=${sizeMb}`,
      'conv=fsync',
    ]);
    this._diskPressureFileByNodeId.set(nodeId, filePath);
  }

  /**
   * Release previously injected disk pressure on one node.
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @param {string} [options.filePath]
   */
  async releaseDiskPressure(nodeId, options = {}) {
    const containerId = this._getContainerId(nodeId);
    const provider = this._providerForNode(nodeId);
    const filePath = this._resolveDiskPressureFilePath(nodeId, {
      filePath: options.filePath ||
        this._diskPressureFileByNodeId.get(nodeId) ||
        null,
    });
    await provider.execInContainer(containerId, [
      REMOVE_COMMAND,
      REMOVE_FORCE_FLAG,
      filePath,
    ]);
    await provider.execInContainer(containerId, [
      SYNC_COMMAND,
    ]);
    this._diskPressureFileByNodeId.delete(nodeId);
  }

  /**
   * Wipe one replica's durable on-disk state inside a container so a restarted
   * node must rebuild the replica from a leader snapshot transfer (S6 live
   * rebuild). Removes the replica database, its SQLite WAL/SHM sidecars, and the
   * replica's checkpoints directory. The node MUST be stopped first — there must
   * be no open database handle when the files are removed.
   *
   * dockerode exec has no shell, so every path is passed as an explicit argv
   * element (no globs). Paths follow the in-container data layout:
   *   {data}/partitions/{pid}/{rid}.db(-wal|-shm)
   *   {data}/partitions/{pid}/checkpoints/{rid}/
   *
   * @param {string} nodeId
   * @param {Object} options
   * @param {string} options.partitionId
   * @param {string} options.replicaId
   * @return {Promise<{dbPath: string, walPath: string, shmPath: string,
   *   checkpointsDir: string}>}
   */
  async wipeReplicaData(nodeId, options = {}) {
    const partitionId =
      typeof options?.partitionId === 'string' ? options.partitionId.trim() : '';
    const replicaId =
      typeof options?.replicaId === 'string' ? options.replicaId.trim() : '';
    if (!partitionId || partitionId.length === 0) {
      throw new Error(
        'wipeReplicaData requires a non-empty partitionId for node ' + nodeId,
      );
    }
    if (!replicaId || replicaId.length === 0) {
      throw new Error(
        'wipeReplicaData requires a non-empty replicaId for node ' + nodeId,
      );
    }
    const containerId = this._getContainerId(nodeId);
    const provider = this._providerForNode(nodeId);
    const partitionDir = pathPosix.join(
      CONTAINER_DATA_DIR,
      PARTITIONS_DIRNAME,
      partitionId,
    );
    const dbPath = pathPosix.join(partitionDir, replicaId + REPLICA_DB_EXT);
    const walPath = dbPath + REPLICA_DB_WAL_SUFFIX;
    const shmPath = dbPath + REPLICA_DB_SHM_SUFFIX;
    const checkpointsDir = pathPosix.join(
      partitionDir,
      CHECKPOINTS_DIRNAME,
      replicaId,
    );

    await provider.execInContainer(containerId, [
      REMOVE_COMMAND,
      REMOVE_FORCE_FLAG,
      dbPath,
      walPath,
      shmPath,
    ]);
    await provider.execInContainer(containerId, [
      REMOVE_COMMAND,
      REMOVE_RECURSIVE_FORCE_FLAG,
      checkpointsDir,
    ]);
    await provider.execInContainer(containerId, [
      SYNC_COMMAND,
    ]);
    return {dbPath, walPath, shmPath, checkpointsDir};
  }

  /**
   * Wait until a restarted container reports running state.
   * @param {string} nodeId
   * @param {string} containerId
   * @return {Promise<Object>}
   * @private
   */
  async _waitForRestartRunning(nodeId, containerId) {
    const provider = this._providerForNode(nodeId);
    const deadline = Date.now() + RESTART_RUNNING_TIMEOUT_MS;
    let lastInspect = null;

    while (Date.now() < deadline) {
      lastInspect = await provider.inspectContainer(containerId);
      if (String(lastInspect?.State?.Status || '').toLowerCase() ===
          CONTAINER_RUNNING_STATE) {
        return lastInspect;
      }
      await sleep(RESTART_POLL_INTERVAL_MS);
    }

    return lastInspect || await provider.inspectContainer(containerId);
  }
}

export {ChaosPrimitives};
