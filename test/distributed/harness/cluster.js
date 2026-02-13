/**
 * Cluster abstraction for the distributed testing framework.
 * Provides unified cluster lifecycle management over Docker containers.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4
 */

import {v4 as uuidv4} from 'uuid';
import http from 'node:http';
import {DockerProvider} from './docker-provider.js';
import {ChaosPrimitives} from './chaos.js';
import {LoadGenerator} from './load-generator.js';
import {
  waitForConvergence,
  assertConsistency,
  assertDataIntegrity,
} from './assertions.js';
import {LogCollector} from './log-collector.js';
import {LogAnalyzer} from './log-analyzer.js';
import {
  PORTS,
  TIMEOUTS,
  LABELS,
  CONTAINER_ENV_KEYS,
  NETWORK,
  NODE_ROLES,
} from './constants.js';

const BOOTSTRAP_POLL_INTERVAL_MS = 500;
const ACTIVE_POLL_INTERVAL_MS = 1000;
const ACTIVE_STATE = 'ACTIVE';
const DATA_DIR_PATH = '/data';
const HTTP_OK_LOWER = 200;
const HTTP_OK_UPPER = 299;
const FETCH_TIMEOUT_MS = 1000;
const LOG_TAIL_LINES = 50;

/**
 * Simple HTTP GET with timeout using node:http.
 * Returns the status code, or -1 on error/timeout.
 */
function httpGet(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, {timeout: timeoutMs}, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(-1));
    req.on('timeout', () => {
      req.destroy();
      resolve(-1);
    });
  });
}

/**
 * Lightweight handle for interacting with a single cluster node.
 */
class NodeHandle {
  constructor(id, containerId, ip, role, dockerProvider) {
    this.id = id;
    this.containerId = containerId;
    this.ip = ip;
    this.role = role;
    this._dockerProvider = dockerProvider;
  }

  /**
   * Query the Admin API via WebSocket.
   * Connects to ws://{ip}:8081/api/admin/stream, sends SQL,
   * returns results.
   */
  async query(sql) {
    const {default: WebSocket} = await import('ws');
    const url =
      'ws://' + this.ip + ':' + PORTS.ADMIN_API +
      '/api/admin/stream';
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.on('open', () => {
        ws.send(JSON.stringify({type: 'query', sql}));
      });
      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          ws.close();
          resolve(parsed);
        } catch (err) {
          ws.close();
          reject(err);
        }
      });
      ws.on('error', (err) => {
        const msg = 'Admin API query failed for node ' +
          this.id + ': ' + err.message;
        reject(new Error(msg));
      });
    });
  }

  /** Get node status from Admin API. */
  async getStatus() {
    const sql = 'SELECT * FROM nodes WHERE node_id = \'' +
      this.id + '\'';
    return this.query(sql);
  }

  /** Get container logs. */
  async getLogs(options = {}) {
    return this._dockerProvider.getContainerLogs(
      this.containerId,
      options,
    );
  }

  /** Check if node is reachable via HTTP GET to REST port. */
  async isReachable() {
    const url =
      'http://' + this.ip + ':' + PORTS.REST + '/bootstrap';
    const status = await httpGet(url, FETCH_TIMEOUT_MS);
    return status >= HTTP_OK_LOWER && status <= HTTP_OK_UPPER;
  }
}

/**
 * Distribute node indices across Docker hosts in round-robin
 * fashion, respecting the nodesPerHost limit.
 */
function distributeNodes(size, providers, nodesPerHost) {
  const hostCount = providers.length;
  const perHostCount = new Array(hostCount).fill(0);
  const assignment = [];

  let hostIdx = 0;
  for (let i = 0; i < size; i++) {
    let assigned = false;
    for (let attempt = 0; attempt < hostCount; attempt++) {
      const candidate = (hostIdx + attempt) % hostCount;
      if (perHostCount[candidate] < nodesPerHost) {
        assignment.push(candidate);
        perHostCount[candidate]++;
        hostIdx = (candidate + 1) % hostCount;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      break;
    }
  }

  return assignment;
}

/**
 * Unified cluster abstraction.
 * Scenarios interact exclusively with this interface.
 */
class Cluster {
  constructor(config, providers, hostAssignment) {
    this._config = config;
    this._providers = providers;
    this._hostAssignment = hostAssignment;
    this._clusterId = uuidv4();
    this._networkId = null;
    this._networkName = null;
    this._nodes = new Map();
    this._started = false;
    this._chaos = null;
    this._logCollector = new LogCollector(
      config.outputDir,
    );
    this._logAnalyzer = new LogAnalyzer(
      config.outputDir,
    );
  }

  /**
   * Start the cluster: create network, start seed, wait for
   * bootstrap API, start joiners sequentially, wait for ACTIVE.
   */
  async start() {
    const provider = this._providers[this._hostAssignment[0]];
    this._networkName =
      NETWORK.NAME_PREFIX + '-' + this._clusterId.slice(0, 8);
    const networkLabels = {
      [LABELS.CLUSTER]: this._clusterId,
    };
    const net = await provider.createNetwork(
      this._networkName,
      networkLabels,
    );
    this._networkId = net.id;

    const seedId = 'node-' + uuidv4().slice(0, 8);
    const seedNode = await this._startNode(
      seedId,
      NODE_ROLES.SEED,
      null,
      0,
    );
    this._nodes.set(seedId, seedNode);

    await this._waitForBootstrapApi(seedNode);

    for (let i = 1; i < this._config.size; i++) {
      const joinerId = 'node-' + uuidv4().slice(0, 8);
      const joinerNode = await this._startNode(
        joinerId,
        NODE_ROLES.JOINER,
        seedNode.ip,
        i,
      );
      this._nodes.set(joinerId, joinerNode);
    }

    await this._waitForAllActive();
    this._started = true;

    // Initialize chaos primitives now that nodes and network exist
    const primaryProvider =
      this._providers[this._hostAssignment[0]];
    this._chaos = new ChaosPrimitives(
      primaryProvider,
      this._nodes,
      this._networkId,
    );

    // Start live log subscription on the seed node
    try {
      await this._logCollector.startLiveSubscription(seedNode);
    } catch (_err) {
      // Log collection is best-effort; cluster still usable
    }
  }

  /** Stop and remove all containers, networks, volumes. */
  async stop() {
    const errors = [];

    // Collect final log snapshot and run analysis before teardown
    try {
      const seedNode = this._nodes.values().next().value;
      if (seedNode) {
        await this._logCollector.collectFinalSnapshot(seedNode);
      }
    } catch (_err) {
      // Best-effort log collection
    }

    try {
      await this._logCollector.stopSubscription();
    } catch (_err) {
      // Best-effort cleanup
    }

    for (const [nodeId, node] of this._nodes) {
      try {
        await node._dockerProvider.stopContainer(
          node.containerId,
        );
      } catch (_err) {
        // Best-effort stop
      }
      try {
        await node._dockerProvider.removeContainer(
          node.containerId,
        );
      } catch (err) {
        errors.push(
          'Failed to remove container for ' +
          nodeId + ': ' + err.message,
        );
      }
    }
    this._nodes.clear();

    if (this._networkId) {
      try {
        const provider =
          this._providers[this._hostAssignment[0]];
        await provider.removeNetwork(this._networkId);
      } catch (err) {
        errors.push(
          'Failed to remove network: ' + err.message,
        );
      }
      this._networkId = null;
    }

    this._started = false;
    if (errors.length > 0) {
      process.stderr.write(
        'Cluster stop warnings:\n' +
        errors.join('\n') + '\n',
      );
    }
  }

  /** Get a node handle by ID. */
  getNode(id) {
    const node = this._nodes.get(id);
    if (!node) {
      throw new Error('Node "' + id + '" not found in cluster');
    }
    return node;
  }

  /** Get all node handles. */
  getNodes() {
    return Array.from(this._nodes.values());
  }

  /** Pick a random non-seed node ID. */
  randomNonSeed() {
    const joiners = Array.from(this._nodes.values())
      .filter((n) => n.role === NODE_ROLES.JOINER);
    if (joiners.length === 0) {
      throw new Error('No non-seed nodes in cluster');
    }
    const idx = Math.floor(Math.random() * joiners.length);
    return joiners[idx].id;
  }

  // --- Delegated component methods ---

  async waitForConvergence(options) {
    const nodes = Array.from(this._nodes.values());
    return waitForConvergence(nodes, options);
  }

  async assertConsistency() {
    const nodes = Array.from(this._nodes.values());
    return assertConsistency(nodes);
  }

  async assertDataIntegrity(table, expectedRows) {
    const nodes = Array.from(this._nodes.values());
    return assertDataIntegrity(nodes, table, expectedRows);
  }

  async killNode(id) {
    return this._chaos.killNode(id);
  }

  async stopNode(id) {
    return this._chaos.stopNode(id);
  }

  async pauseNode(id) {
    return this._chaos.pauseNode(id);
  }

  async unpauseNode(id) {
    return this._chaos.unpauseNode(id);
  }

  async restartNode(id) {
    return this._chaos.restartNode(id);
  }

  async partitionNetwork(groupA, groupB) {
    return this._chaos.partitionNetwork(groupA, groupB);
  }

  async healPartition() {
    return this._chaos.healPartition();
  }

  async slowNetwork(nodeId, options) {
    return this._chaos.slowNetwork(nodeId, options);
  }

  async corruptDisk(nodeId, path) {
    return this._chaos.corruptDisk(nodeId, path);
  }

  startLoad(options) {
    const nodes = Array.from(this._nodes.values());
    const generator = new LoadGenerator(nodes, options);
    return generator.start();
  }

  /**
   * Get the LogCollector instance for direct access.
   * @returns {LogCollector}
   */
  getLogCollector() {
    return this._logCollector;
  }

  /**
   * Get the LogAnalyzer instance for direct access.
   * @returns {LogAnalyzer}
   */
  getLogAnalyzer() {
    return this._logAnalyzer;
  }

  // --- Internal helpers ---

  async _startNode(nodeId, role, seedIp, nodeIndex) {
    const providerIdx = this._hostAssignment[nodeIndex];
    const provider = this._providers[providerIdx];
    const containerName =
      'ddb-test-' + this._clusterId.slice(0, 8) + '-' + nodeId;

    const env = {};
    env[CONTAINER_ENV_KEYS.NODE_ID] = nodeId;
    env[CONTAINER_ENV_KEYS.DATA_DIR] = DATA_DIR_PATH;
    env[CONTAINER_ENV_KEYS.NODE_ADDRESS] = nodeId;

    if (seedIp) {
      env[CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS] =
        seedIp + ':' + PORTS.REST;
    }

    const labels = {
      [LABELS.CLUSTER]: this._clusterId,
      [LABELS.NODE_ID]: nodeId,
      [LABELS.ROLE]: role,
    };

    let result;
    try {
      result = await provider.createContainer({
        name: containerName,
        image: this._config.image,
        network: this._networkName,
        env,
        labels,
        resourceLimits: this._config.resourceLimits || {},
        startTimeout: this._config.timeouts?.nodeStartup ||
          TIMEOUTS.NODE_STARTUP,
      });
    } catch (err) {
      await this._collectFailureLogs();
      throw new Error(
        'Node "' + nodeId + '" (' + role +
        ') failed to start: ' + err.message,
      );
    }

    return new NodeHandle(
      nodeId,
      result.containerId,
      result.ip,
      role,
      provider,
    );
  }

  async _waitForBootstrapApi(seedNode) {
    const timeout = this._config.timeouts?.nodeStartup ||
      TIMEOUTS.NODE_STARTUP;
    const deadline = Date.now() + timeout;
    const url =
      'http://' + seedNode.ip + ':' + PORTS.REST + '/bootstrap';

    while (Date.now() < deadline) {
      const status = await httpGet(url, FETCH_TIMEOUT_MS);
      if (status >= HTTP_OK_LOWER && status <= HTTP_OK_UPPER) {
        return;
      }
      await this._sleep(BOOTSTRAP_POLL_INTERVAL_MS);
    }

    await this._collectFailureLogs();
    throw new Error(
      'Seed node bootstrap API did not become available ' +
      'within ' + timeout + 'ms',
    );
  }

  async _waitForAllActive() {
    const timeout = this._config.timeouts?.convergence ||
      TIMEOUTS.CONVERGENCE;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      let allActive = true;
      for (const node of this._nodes.values()) {
        try {
          const status = await node.getStatus();
          if (!this._isNodeActive(status)) {
            allActive = false;
            break;
          }
        } catch (_err) {
          allActive = false;
          break;
        }
      }
      if (allActive) {
        return;
      }
      await this._sleep(ACTIVE_POLL_INTERVAL_MS);
    }

    await this._collectFailureLogs();
    throw new Error(
      'Not all nodes reached ' + ACTIVE_STATE +
      ' state within ' + timeout + 'ms',
    );
  }

  _isNodeActive(status) {
    if (!status) return false;
    if (status.rows && status.rows.length > 0) {
      return status.rows[0].status === ACTIVE_STATE ||
        status.rows[0].state === ACTIVE_STATE;
    }
    if (status.status === ACTIVE_STATE) return true;
    if (status.state === ACTIVE_STATE) return true;
    return false;
  }

  async _collectFailureLogs() {
    for (const node of this._nodes.values()) {
      try {
        const logs = await node.getLogs({tail: LOG_TAIL_LINES});
        process.stderr.write(
          '--- Logs from ' + node.id +
          ' (' + node.role + ') ---\n' + logs + '\n',
        );
      } catch (_err) {
        // Best-effort log collection
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Best-effort cleanup of Docker resources on unexpected exit.
 * Lists containers by cluster label and removes them.
 * Req 2.6
 */
async function bestEffortCleanup(provider, clusterId) {
  try {
    const containers = await provider.listContainers({
      [LABELS.CLUSTER]: clusterId,
    });
    for (const container of containers) {
      try {
        await provider.removeContainer(container.Id);
      } catch (_err) {
        // Best-effort
      }
    }
  } catch (_err) {
    // Best-effort
  }
}

/**
 * Create a cluster.
 * Req 2.1, 2.2, 2.3
 *
 * @param {Object} config - Parsed cluster configuration
 * @returns {Cluster}
 */
function createCluster(config) {
  let providers;
  let hostAssignment;

  if (config.docker.hosts && config.docker.hosts.length > 0) {
    providers = config.docker.hosts.map(
      (host) => new DockerProvider({host}),
    );
    const nodesPerHost = config.nodesPerHost || config.size;
    hostAssignment = distributeNodes(
      config.size,
      providers,
      nodesPerHost,
    );
  } else {
    providers = [new DockerProvider({
      socketPath: config.docker.socketPath,
    })];
    hostAssignment = new Array(config.size).fill(0);
  }

  const cluster = new Cluster(config, providers, hostAssignment);

  // Register best-effort cleanup on unexpected exit (Req 2.6)
  const cleanupHandler = () => {
    const provider = providers[0];
    bestEffortCleanup(provider, cluster._clusterId)
      .catch(() => {});
  };
  process.on('exit', cleanupHandler);
  process.on('SIGINT', cleanupHandler);
  process.on('SIGTERM', cleanupHandler);
  process.on('uncaughtException', cleanupHandler);

  return cluster;
}

export {createCluster, Cluster, NodeHandle, distributeNodes};
