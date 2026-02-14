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
import {PlaybackRecorder} from './playback-recorder.js';
import {
  PORTS,
  TIMEOUTS,
  LABELS,
  CONTAINER_ENV_KEYS,
  NETWORK,
  NODE_ROLES,
  PLAYBACK_EVENT_TYPE,
} from './constants.js';

const BOOTSTRAP_POLL_INTERVAL_MS = 500;
const ACTIVE_POLL_INTERVAL_MS = 1000;
const ACTIVE_STATE = 'ACTIVE';
const DATA_DIR_PATH = '/data';
const HTTP_OK_LOWER = 200;
const HTTP_OK_UPPER = 299;
const FETCH_TIMEOUT_MS = 1000;
const ADMIN_QUERY_TIMEOUT_MS = 5000;
const LOG_TAIL_LINES = 50;
const BOOTSTRAP_HEALTH_PATH = '/health';
const WS_HOST_ENV_KEY = 'TRANSPORT_WS_HOST';
const WS_BIND_ALL_HOST = '0.0.0.0';
const QUERY_MESSAGE_TYPE = 'query';
const QUERY_RESULT_MESSAGE_TYPE = 'query_result';
const CDC_EVENT_MESSAGE_TYPE = 'cdc_event';
const LIVE_QUERY_EVENT_MESSAGE_TYPE = 'live_query_event';
const LIVE_QUERY_INITIAL_MESSAGE_TYPE = 'live_query_initial';
const LOGS_TABLE_NAME = 'logs';
const STATUS_ACTIVE_LOWER = ACTIVE_STATE.toLowerCase();
const WS_READY_STATE_OPEN = 1;
const PLAYBACK_SCOPE_CLUSTER = 'cluster';
const PLAYBACK_SCOPE_NODE = 'node';
const PLAYBACK_SCOPE_CHAOS = 'chaos';
const PLAYBACK_SCOPE_LOAD = 'load';
const PLAYBACK_ENTITY_CLUSTER = 'cluster';
const LOAD_RUN_ENTITY = 'load-run';
const LOAD_PROGRESS_INTERVAL_MS = 1000;
const CLUSTER_STAGE_SETUP_NETWORK_CREATING = 'setup.network.creating';
const CLUSTER_STAGE_SETUP_NETWORK_CREATED = 'setup.network.created';
const CLUSTER_STAGE_SETUP_SEED_STARTING = 'setup.seed.starting';
const CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING =
  'setup.seed.bootstrap.waiting';
const CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_READY =
  'setup.seed.bootstrap.ready';
const CLUSTER_STAGE_SETUP_JOINER_STARTING = 'setup.joiner.starting';
const CLUSTER_STAGE_SETUP_JOINER_STARTED = 'setup.joiner.started';
const CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE =
  'setup.cluster.waiting-active';
const CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE = 'setup.cluster.active';
const CLUSTER_STAGE_SETUP_LOG_SUB_STARTING = 'setup.logs.subscription.starting';
const CLUSTER_STAGE_SETUP_LOG_SUB_READY = 'setup.logs.subscription.ready';
const CLUSTER_STAGE_SETUP_LOG_SUB_FAILED = 'setup.logs.subscription.failed';
const CLUSTER_STAGE_TEARDOWN_STARTING = 'teardown.starting';
const CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVING = 'teardown.network.removing';
const CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVED = 'teardown.network.removed';
const CLUSTER_STAGE_TEARDOWN_CAPTURE_FINALIZING =
  'teardown.capture.finalizing';
const CLUSTER_STAGE_TEARDOWN_COMPLETE = 'teardown.complete';
const CLUSTER_CONFIG_DOCKER_OPERATION_SINK = 'dockerOperationSink';

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
  constructor(
    id,
    containerId,
    ip,
    role,
    dockerProvider,
    adminApiPort = PORTS.ADMIN_API,
  ) {
    this.id = id;
    this.containerId = containerId;
    this.ip = ip;
    this.role = role;
    this._dockerProvider = dockerProvider;
    this._adminApiPort = adminApiPort;
    this._adminSocket = null;
    this._adminSocketReady = null;
    this._pendingQueries = new Map();
    this._logStreamListeners = new Set();
  }

  /**
   * Query the Admin API via WebSocket.
   * Connects to ws://{ip}:8081/api/admin/stream, sends SQL,
   * returns results.
   */
  async query(sql) {
    const ws = await this._getAdminSocket();
    const queryId = 'q-' + Date.now() + '-' +
      Math.random().toString(36).slice(2);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pendingQueries.delete(queryId);
        reject(new Error(
          'Admin API query timed out for node ' + this.id +
          ' after ' + ADMIN_QUERY_TIMEOUT_MS + 'ms',
        ));
      }, ADMIN_QUERY_TIMEOUT_MS);

      this._pendingQueries.set(queryId, {
        resolve,
        reject,
        timeout,
      });

      try {
        ws.send(JSON.stringify({
          type: QUERY_MESSAGE_TYPE,
          queryId,
          sql,
        }));
      } catch (err) {
        this._pendingQueries.delete(queryId);
        clearTimeout(timeout);
        this._resetAdminSocket();
        try {
          ws.close();
        } catch (_closeErr) {
          // Best-effort cleanup
        }
        reject(new Error(
          'Admin API query failed for node ' +
          this.id + ': ' + err.message,
        ));
      }
    });
  }

  /**
   * Close the long-lived Admin API WebSocket connection.
   */
  closeQueryConnection() {
    this._rejectPendingQueries(
      'Admin API query connection closed for node ' +
      this.id,
    );
    this._logStreamListeners.clear();
    if (this._adminSocket) {
      try {
        this._adminSocket.close();
      } catch (_err) {
        // Best-effort cleanup
      }
    }
    this._resetAdminSocket();
  }

  /**
   * Subscribe to streamed logs delivered on the Admin API socket.
   * Listener receives log rows from cdc_event/live_query frames.
   * Returns an unsubscribe callback.
   * @param {Function} listener
   * @returns {Promise<Function>}
   */
  async subscribeLogStream(listener) {
    if (typeof listener !== 'function') {
      throw new Error(
        'Log stream listener must be a function for node ' +
        this.id,
      );
    }
    this._logStreamListeners.add(listener);
    try {
      await this._getAdminSocket();
    } catch (err) {
      this._logStreamListeners.delete(listener);
      throw err;
    }
    return () => {
      this._logStreamListeners.delete(listener);
    };
  }

  async _getAdminSocket() {
    if (this._adminSocket &&
        this._adminSocket.readyState === WS_READY_STATE_OPEN) {
      return this._adminSocket;
    }
    if (this._adminSocketReady) {
      return this._adminSocketReady;
    }

    const {default: WebSocket} = await import('ws');
    const url =
      'ws://' + this.ip + ':' + this._adminApiPort +
      '/api/admin/stream';

    this._adminSocketReady = new Promise((resolve, reject) => {
      const ws = new WebSocket(url);

      const onOpen = () => {
        ws.off('error', onOpenError);
        this._bindAdminSocketHandlers(ws);
        this._adminSocket = ws;
        resolve(ws);
      };

      const onOpenError = (err) => {
        ws.off('open', onOpen);
        this._resetAdminSocket();
        reject(new Error(
          'Admin API query failed for node ' +
          this.id + ': ' + err.message,
        ));
      };

      ws.once('open', onOpen);
      ws.once('error', onOpenError);
    });

    try {
      return await this._adminSocketReady;
    } catch (err) {
      this._resetAdminSocket();
      throw err;
    }
  }

  _bindAdminSocketHandlers(ws) {
    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        this._handleAdminSocketMessage(parsed);
      } catch (_err) {
        // Ignore malformed frames and continue.
      }
    });

    ws.on('error', (err) => {
      this._rejectPendingQueries(
        'Admin API query failed for node ' +
        this.id + ': ' + err.message,
      );
      this._resetAdminSocket();
    });

    ws.on('close', () => {
      this._rejectPendingQueries(
        'Admin API query connection closed before response ' +
        'for node ' + this.id,
      );
      this._resetAdminSocket();
    });
  }

  _handleAdminSocketMessage(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    if (parsed.type === QUERY_RESULT_MESSAGE_TYPE) {
      this._resolvePendingQuery(parsed);
      return;
    }
    this._handleStreamedLogMessage(parsed);
  }

  _resolvePendingQuery(parsed) {
    const queryId = parsed.queryId;
    if (!queryId) {
      return;
    }

    const pending = this._pendingQueries.get(queryId);
    if (!pending) {
      return;
    }
    this._pendingQueries.delete(queryId);
    clearTimeout(pending.timeout);

    if (parsed.error) {
      pending.reject(new Error(
        'Admin API query failed for node ' +
        this.id + ': ' + parsed.error,
      ));
      return;
    }

    pending.resolve({
      rows: Array.isArray(parsed.results) ?
        parsed.results :
        [],
      count: parsed.count,
      partitions: parsed.partitions,
      tableName: parsed.tableName,
      operation: parsed.operation,
      affectedRows: parsed.affectedRows,
      warning: parsed.warning,
    });
  }

  _handleStreamedLogMessage(parsed) {
    if (this._logStreamListeners.size === 0) {
      return;
    }

    if (parsed.type === CDC_EVENT_MESSAGE_TYPE) {
      if (parsed.table !== LOGS_TABLE_NAME || !parsed.record) {
        return;
      }
      this._emitLogStreamEntry(parsed.record);
      return;
    }

    if (parsed.type === LIVE_QUERY_INITIAL_MESSAGE_TYPE) {
      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      for (const row of rows) {
        this._emitLogStreamEntry(row);
      }
      return;
    }

    if (parsed.type !== LIVE_QUERY_EVENT_MESSAGE_TYPE) {
      return;
    }

    const payload = parsed.record || parsed.row ||
      parsed.data || parsed.new || parsed.old || null;

    if (Array.isArray(payload)) {
      for (const row of payload) {
        this._emitLogStreamEntry(row);
      }
      return;
    }

    this._emitLogStreamEntry(payload);
  }

  _emitLogStreamEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    for (const listener of this._logStreamListeners) {
      try {
        listener(entry);
      } catch (_err) {
        // Best-effort log streaming callback isolation.
      }
    }
  }

  _rejectPendingQueries(message) {
    for (const pending of this._pendingQueries.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this._pendingQueries.clear();
  }

  _resetAdminSocket() {
    this._adminSocket = null;
    this._adminSocketReady = null;
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
      'http://' + this.ip + ':' + PORTS.REST + BOOTSTRAP_HEALTH_PATH;
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
    this._scenarioName = config.scenarioName || 'unknown-scenario';
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
    this._playbackRecorder = new PlaybackRecorder({
      outputDir: config.outputDir,
    });
    this._playbackManifest = null;
    this._playbackStartWarning = null;
  }

  /**
   * Start the cluster: create network, start seed, wait for
   * bootstrap API, start joiners sequentially, wait for ACTIVE.
   */
  async start() {
    try {
      await this._playbackRecorder.start({
        scenarioName: this._scenarioName,
        cluster: this,
        skipInitialCapture: true,
      });
      this._playbackStartWarning = null;
    } catch (_err) {
      // Playback capture is best-effort.
      this._playbackStartWarning = 'Failed to initialize playback capture';
    }

    const provider = this._providers[this._hostAssignment[0]];
    this._networkName =
      NETWORK.NAME_PREFIX + '-' + this._clusterId.slice(0, 8);
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_NETWORK_CREATING,
      {
        networkName: this._networkName,
      },
    );
    const networkLabels = {
      [LABELS.CLUSTER]: this._clusterId,
    };
    const net = await provider.createNetwork(
      this._networkName,
      networkLabels,
    );
    this._networkId = net.id;
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_NETWORK_CREATED,
      {
        networkName: this._networkName,
        networkId: this._networkId,
      },
    );

    const seedId = uuidv4();
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_STARTING,
      {
        nodeId: seedId,
      },
    );
    const seedNode = await this._startNode(
      seedId,
      NODE_ROLES.SEED,
      null,
      0,
    );
    this._nodes.set(seedId, seedNode);
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.NODE_CREATED,
      PLAYBACK_SCOPE_NODE,
      seedId,
      {
        role: NODE_ROLES.SEED,
        ip: seedNode.ip,
        containerId: seedNode.containerId,
      },
    );
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.NODE_STARTED,
      PLAYBACK_SCOPE_NODE,
      seedId,
      {
        role: NODE_ROLES.SEED,
      },
    );

    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING,
      {
        nodeId: seedId,
      },
    );
    await this._waitForBootstrapApi(seedNode);
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_READY,
      {
        nodeId: seedId,
      },
    );

    for (let i = 1; i < this._config.size; i++) {
      const joinerId = uuidv4();
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_JOINER_STARTING,
        {
          nodeId: joinerId,
          ordinal: i,
        },
      );
      const joinerNode = await this._startNode(
        joinerId,
        NODE_ROLES.JOINER,
        seedNode.ip,
        i,
      );
      this._nodes.set(joinerId, joinerNode);
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_CREATED,
        PLAYBACK_SCOPE_NODE,
        joinerId,
        {
          role: NODE_ROLES.JOINER,
          ip: joinerNode.ip,
          containerId: joinerNode.containerId,
        },
      );
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_STARTED,
        PLAYBACK_SCOPE_NODE,
        joinerId,
        {
          role: NODE_ROLES.JOINER,
          seedIp: seedNode.ip,
        },
      );
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_JOINER_STARTED,
        {
          nodeId: joinerId,
          ordinal: i,
        },
      );
    }

    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
      {
        expectedNodeCount: this._config.size,
      },
    );
    await this._waitForAllActive();
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE,
      {
        nodeCount: this._nodes.size,
      },
    );
    this._started = true;
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CLUSTER_READY,
      PLAYBACK_SCOPE_CLUSTER,
      PLAYBACK_ENTITY_CLUSTER,
      {
        nodeCount: this._nodes.size,
      },
    );

    // Initialize chaos primitives now that nodes and network exist
    const primaryProvider =
      this._providers[this._hostAssignment[0]];
    this._chaos = new ChaosPrimitives(
      primaryProvider,
      this._nodes,
      this._networkId,
    );

    // Start live log subscription on the seed node
    this._recordClusterStage(
      CLUSTER_STAGE_SETUP_LOG_SUB_STARTING,
      {
        nodeId: seedId,
      },
    );
    try {
      await this._logCollector.startLiveSubscription(seedNode);
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_LOG_SUB_READY,
        {
          nodeId: seedId,
        },
      );
    } catch (_err) {
      this._recordClusterStage(
        CLUSTER_STAGE_SETUP_LOG_SUB_FAILED,
        {
          nodeId: seedId,
        },
      );
      // Log collection is best-effort; cluster still usable
    }
  }

  /** Stop and remove all containers, networks, volumes. */
  async stop() {
    const errors = [];
    this._playbackRecorder.suspendPolling();
    this._recordClusterStage(
      CLUSTER_STAGE_TEARDOWN_STARTING,
      {
        nodeCount: this._nodes.size,
      },
    );

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
        node.closeQueryConnection();
      } catch (_err) {
        // Best-effort stop
      }
      try {
        await node._dockerProvider.stopContainer(
          node.containerId,
        );
        this._recordPlaybackEvent(
          PLAYBACK_EVENT_TYPE.NODE_STOPPED,
          PLAYBACK_SCOPE_NODE,
          nodeId,
          {
            containerId: node.containerId,
          },
        );
      } catch (_err) {
        // Best-effort stop
      }
      try {
        await node._dockerProvider.removeContainer(
          node.containerId,
        );
        this._recordPlaybackEvent(
          PLAYBACK_EVENT_TYPE.NODE_REMOVED,
          PLAYBACK_SCOPE_NODE,
          nodeId,
          {
            containerId: node.containerId,
          },
        );
      } catch (err) {
        errors.push(
          'Failed to remove container for ' +
          nodeId + ': ' + err.message,
        );
      }
    }

    if (this._networkId) {
      try {
        const provider =
          this._providers[this._hostAssignment[0]];
        this._recordClusterStage(
          CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVING,
          {
            networkId: this._networkId,
            networkName: this._networkName,
          },
        );
        await provider.removeNetwork(this._networkId);
        this._recordClusterStage(
          CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVED,
          {
            networkId: this._networkId,
            networkName: this._networkName,
          },
        );
      } catch (err) {
        errors.push(
          'Failed to remove network: ' + err.message,
        );
      }
      this._networkId = null;
    }

    try {
      this._recordClusterStage(
        CLUSTER_STAGE_TEARDOWN_COMPLETE,
        {
          nodeCount: this._nodes.size,
        },
      );
      this._recordClusterStage(
        CLUSTER_STAGE_TEARDOWN_CAPTURE_FINALIZING,
        {},
      );
      this._playbackManifest = await this._playbackRecorder.stop({
        clusterId: this._clusterId,
        nodeCount: this._nodes.size,
      }, {
        skipFinalCapture: true,
      });
      if (this._playbackStartWarning && this._playbackManifest) {
        this._playbackManifest.warning = this._playbackStartWarning;
      } else if (this._playbackStartWarning &&
                 !this._playbackManifest) {
        this._playbackManifest = {
          warning: this._playbackStartWarning,
        };
      }
    } catch (err) {
      errors.push(
        'Failed to finalize playback artifacts: ' + err.message,
      );
    }

    this._nodes.clear();

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
    return this._runChaosAction('killNode', id, null, () =>
      this._chaos.killNode(id),
    );
  }

  async stopNode(id) {
    return this._runChaosAction('stopNode', id, null, () =>
      this._chaos.stopNode(id),
    );
  }

  async pauseNode(id) {
    return this._runChaosAction('pauseNode', id, null, () =>
      this._chaos.pauseNode(id),
    );
  }

  async unpauseNode(id) {
    return this._runChaosAction('unpauseNode', id, null, () =>
      this._chaos.unpauseNode(id),
    );
  }

  async restartNode(id) {
    return this._runChaosAction('restartNode', id, null, () =>
      this._chaos.restartNode(id),
    );
  }

  async partitionNetwork(groupA, groupB) {
    return this._runChaosAction(
      'partitionNetwork',
      'network',
      {groupA, groupB},
      () => this._chaos.partitionNetwork(groupA, groupB),
    );
  }

  async healPartition() {
    return this._runChaosAction('healPartition', 'network', null, () =>
      this._chaos.healPartition(),
    );
  }

  async slowNetwork(nodeId, options) {
    return this._runChaosAction('slowNetwork', nodeId, options, () =>
      this._chaos.slowNetwork(nodeId, options),
    );
  }

  async corruptDisk(nodeId, path) {
    return this._runChaosAction(
      'corruptDisk',
      nodeId,
      {path},
      () => this._chaos.corruptDisk(nodeId, path),
    );
  }

  startLoad(options) {
    const nodes = Array.from(this._nodes.values());
    const generator = new LoadGenerator(nodes, options);
    const run = generator.start();
    let stopped = false;
    let cancelled = false;
    let progressTimer = null;
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.LOAD_STARTED,
      PLAYBACK_SCOPE_LOAD,
      LOAD_RUN_ENTITY,
      {
        options: options || {},
      },
    );

    const clearProgressTimer = () => {
      if (progressTimer !== null) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    };

    const recordProgress = () => {
      if (stopped || typeof run.getMetrics !== 'function') {
        return;
      }
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.LOAD_PROGRESS,
        PLAYBACK_SCOPE_LOAD,
        LOAD_RUN_ENTITY,
        {
          metrics: run.getMetrics(),
          cancelled,
        },
      );
    };

    const finalize = (details) => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearProgressTimer();
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.LOAD_COMPLETED,
        PLAYBACK_SCOPE_LOAD,
        LOAD_RUN_ENTITY,
        details,
      );
    };

    recordProgress();
    progressTimer = setInterval(
      recordProgress,
      LOAD_PROGRESS_INTERVAL_MS,
    );

    const waitComplete = run.waitComplete.bind(run);
    const completionPromise = waitComplete()
      .then((metrics) => {
        finalize({
          metrics,
          cancelled,
        });
        return metrics;
      })
      .catch((error) => {
        finalize({
          cancelled,
          error: error?.message || 'load-run-failed',
        });
        throw error;
      });

    run.waitComplete = async () => completionPromise;

    if (typeof run.cancel === 'function') {
      const cancel = run.cancel.bind(run);
      run.cancel = () => {
        cancelled = true;
        clearProgressTimer();
        return cancel();
      };
    }

    completionPromise.catch(() => {
      // Prevent unhandled rejection when waitComplete is not awaited.
    });

    return run;
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

  /**
   * Set scenario context for capture artifacts.
   * @param {string} scenarioName
   */
  setScenarioName(scenarioName) {
    if (typeof scenarioName !== 'string' ||
        scenarioName.length === 0) {
      return;
    }
    this._scenarioName = scenarioName;
  }

  /**
   * Get finalized playback manifest generated on stop().
   * @returns {Object|null}
   */
  getPlaybackManifest() {
    return this._playbackManifest;
  }

  // --- Internal helpers ---

  _recordPlaybackEvent(type, scope, entityId, details) {
    try {
      this._playbackRecorder.recordEvent({
        type,
        scope,
        entityId,
        details,
      });
    } catch (_err) {
      // Best-effort playback recording
    }
  }

  _recordClusterStage(stage, details = {}) {
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CLUSTER_STAGE,
      PLAYBACK_SCOPE_CLUSTER,
      PLAYBACK_ENTITY_CLUSTER,
      {
        stage,
        ...details,
      },
    );
  }

  async _runChaosAction(action, entityId, details, operation) {
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CHAOS_ACTION_STARTED,
      PLAYBACK_SCOPE_CHAOS,
      entityId,
      {
        action,
        details: details || {},
      },
    );
    const result = await operation();
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CHAOS_ACTION_COMPLETED,
      PLAYBACK_SCOPE_CHAOS,
      entityId,
      {
        action,
        details: details || {},
      },
    );
    return result;
  }

  async _startNode(nodeId, role, seedIp, nodeIndex) {
    const providerIdx = this._hostAssignment[nodeIndex];
    const provider = this._providers[providerIdx];
    const containerName =
      'ddb-test-' + this._clusterId.slice(0, 8) + '-' + nodeId;

    const env = {};
    env[CONTAINER_ENV_KEYS.NODE_ID] = nodeId;
    env[CONTAINER_ENV_KEYS.DATA_DIR] = DATA_DIR_PATH;
    env[CONTAINER_ENV_KEYS.NODE_ADDRESS] =
      containerName + ':' + PORTS.REST;
    env[WS_HOST_ENV_KEY] = WS_BIND_ALL_HOST;

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
      'http://' + seedNode.ip + ':' + PORTS.REST + BOOTSTRAP_HEALTH_PATH;

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
      return this._isActiveValue(status.rows[0].status) ||
        this._isActiveValue(status.rows[0].state);
    }
    if (this._isActiveValue(status.status)) return true;
    if (this._isActiveValue(status.state)) return true;
    return false;
  }

  _isActiveValue(value) {
    if (typeof value !== 'string') {
      return false;
    }
    return value.toLowerCase() === STATUS_ACTIVE_LOWER;
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
  const dockerOperationSink =
    typeof config?.[CLUSTER_CONFIG_DOCKER_OPERATION_SINK] === 'function' ?
      config[CLUSTER_CONFIG_DOCKER_OPERATION_SINK] :
      null;

  if (config.docker.hosts && config.docker.hosts.length > 0) {
    providers = config.docker.hosts.map(
      (host) => new DockerProvider({
        host,
        operationSink: dockerOperationSink,
      }),
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
      operationSink: dockerOperationSink,
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
