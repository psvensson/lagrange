/**
 * Chaos Primitives — fault injection operations for distributed testing.
 * Each primitive delegates to the Docker Provider for container/network ops.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import {NETWORK} from './constants.js';
import {posix as pathPosix} from 'node:path';

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
const SYNC_COMMAND = 'sync';
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
    this._dockerProvider = dockerProvider;
    this._nodes = nodes;
    this._networkId = networkId;
    this._isolationState = null;
    this._diskPressureFileByNodeId = new Map();
  }

  /**
   * Look up a node's container ID by nodeId.
   * @param {string} nodeId
   * @returns {string} containerId
   */
  _getContainerId(nodeId) {
    const node = this._nodes.get(nodeId);
    if (!node) {
      throw new Error(
        `Node "${nodeId}" not found in cluster. ` +
        `Available nodes: ${[...this._nodes.keys()].join(', ')}`,
      );
    }
    return node.containerId;
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
    await this._dockerProvider.killContainer(containerId);
  }

  /**
   * Stop a node gracefully (SIGTERM). Req 4.2
   * @param {string} nodeId
   */
  async stopNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._dockerProvider.stopContainer(containerId);
  }

  /**
   * Pause a node (SIGSTOP). Req 4.3
   * @param {string} nodeId
   */
  async pauseNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._dockerProvider.pauseContainer(containerId);
  }

  /**
   * Unpause a node (SIGCONT). Req 4.3
   * @param {string} nodeId
   */
  async unpauseNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._dockerProvider.unpauseContainer(containerId);
  }

  /**
   * Restart a node, preserving its data volume. Req 4.4
   * @param {string} nodeId
   */
  async restartNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._dockerProvider.restartContainer(containerId);
    await this._restoreRestartedNodeNetworkIdentity(nodeId, containerId);
  }

  /**
   * Start a previously stopped node and restore its canonical network identity.
   * @param {string} nodeId
   */
  async startNode(nodeId) {
    const containerId = this._getContainerId(nodeId);
    await this._dockerProvider.startContainer(containerId);
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
    const node = this._nodes.get(nodeId);
    if (typeof this._dockerProvider.inspectContainer !== 'function') {
      return;
    }

    const inspect = await this._waitForRestartRunning(containerId);
    const expectedAlias = resolveExpectedAlias(inspect);
    const mainEndpoint = findNetworkEndpoint(inspect, this._networkId);

    if (mainEndpoint?.IPAddress && node) {
      node.ip = mainEndpoint.IPAddress;
    }

    if (!this._networkId ||
        this._isolationState ||
        typeof this._dockerProvider.connectToNetwork !== 'function' ||
        !containerId) {
      return;
    }

    if (hasNetworkAlias(mainEndpoint, expectedAlias)) {
      return;
    }

    if (mainEndpoint &&
        typeof this._dockerProvider.disconnectFromNetwork === 'function') {
      await this._dockerProvider.disconnectFromNetwork(
        this._networkId,
        containerId,
      );
    }

    await this._dockerProvider.connectToNetwork(
      this._networkId,
      containerId,
      expectedAlias ? [expectedAlias] : [],
    );

    if (typeof this._dockerProvider.inspectContainer === 'function') {
      const refreshedInspect = await this._dockerProvider.inspectContainer(containerId);
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
   * Partition network into two isolated groups. Req 4.5
   * Creates secondary isolation networks, disconnects all nodes from
   * the main network, and connects each group to its own isolation net.
   * @param {Array<string>} groupA - Node IDs for group A
   * @param {Array<string>} groupB - Node IDs for group B
   */
  async partitionNetwork(groupA, groupB) {
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

    for (const {containerId} of containerIds) {
      await this._dockerProvider.disconnectFromNetwork(
        this._networkId, containerId,
      );
    }

    for (const nodeId of groupA) {
      const containerId = this._getContainerId(nodeId);
      await this._dockerProvider.connectToNetwork(
        isoNetA.id, containerId,
      );
    }

    for (const nodeId of groupB) {
      const containerId = this._getContainerId(nodeId);
      await this._dockerProvider.connectToNetwork(
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
      await this._dockerProvider.disconnectFromNetwork(
        isoNetA.id, containerId,
      );
    }

    for (const nodeId of groupB) {
      const containerId = this._getContainerId(nodeId);
      await this._dockerProvider.disconnectFromNetwork(
        isoNetB.id, containerId,
      );
    }

    const allNodeIds = [...groupA, ...groupB];
    for (const nodeId of allNodeIds) {
      const containerId = this._getContainerId(nodeId);
      await this._dockerProvider.connectToNetwork(
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
    await this._dockerProvider.execInContainer(containerId, [
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
      await this._dockerProvider.execInContainer(containerId, [
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
    await this._dockerProvider.execInContainer(containerId, [
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
    const filePath = this._resolveDiskPressureFilePath(nodeId, options);
    const sizeMb = this._resolveDiskPressureSizeMb(options);
    const parentDir = pathPosix.dirname(filePath);

    await this._dockerProvider.execInContainer(containerId, [
      MKDIR_COMMAND,
      MKDIR_PARENTS_FLAG,
      parentDir,
    ]);
    await this._dockerProvider.execInContainer(containerId, [
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
    const filePath = this._resolveDiskPressureFilePath(nodeId, {
      filePath: options.filePath ||
        this._diskPressureFileByNodeId.get(nodeId) ||
        null,
    });
    await this._dockerProvider.execInContainer(containerId, [
      REMOVE_COMMAND,
      REMOVE_FORCE_FLAG,
      filePath,
    ]);
    await this._dockerProvider.execInContainer(containerId, [
      SYNC_COMMAND,
    ]);
    this._diskPressureFileByNodeId.delete(nodeId);
  }

  /**
   * Wait until a restarted container reports running state.
   * @param {string} containerId
   * @return {Promise<Object>}
   * @private
   */
  async _waitForRestartRunning(containerId) {
    const deadline = Date.now() + RESTART_RUNNING_TIMEOUT_MS;
    let lastInspect = null;

    while (Date.now() < deadline) {
      lastInspect = await this._dockerProvider.inspectContainer(containerId);
      if (String(lastInspect?.State?.Status || '').toLowerCase() ===
          CONTAINER_RUNNING_STATE) {
        return lastInspect;
      }
      await sleep(RESTART_POLL_INTERVAL_MS);
    }

    return lastInspect || await this._dockerProvider.inspectContainer(containerId);
  }
}

export {ChaosPrimitives};
