/**
 * Chaos Primitives — fault injection operations for distributed testing.
 * Each primitive delegates to the Docker Provider for container/network ops.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import {NETWORK} from './constants.js';

const NETEM_DEVICE = 'eth0';
const NETEM_QDISC_ROOT = 'root';
const TC_COMMAND = 'tc';
const DD_COMMAND = 'dd';
const DD_BLOCK_SIZE = '1024';
const DD_BLOCK_COUNT = '1';

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
        `Available nodes: ${[...this._nodes.keys()].join(', ')}`
      );
    }
    return node.containerId;
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
      TC_COMMAND, 'qdisc', 'add', 'dev', NETEM_DEVICE,
      NETEM_QDISC_ROOT, 'netem', 'delay',
      `${latency}ms`, `${jitter}ms`,
    ]);
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
}

export {ChaosPrimitives};
