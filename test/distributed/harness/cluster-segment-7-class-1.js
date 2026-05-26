import {CLUSTER_SEGMENT_7_CLASS_SHARED} from './cluster-segment-7-class-shared.js';
import {acquireReusableClusterLease, isReusableClusterLeaseTimeoutError, registerClusterCleanup} from './cluster-runtime-helpers.js';

const {
  ACTIVE_POLL_INTERVAL_MS,
  CLUSTER_STAGE_SETUP_JOINER_STARTED,
  CLUSTER_STAGE_SETUP_JOINER_STARTING,
  CLUSTER_STAGE_SETUP_LOG_SUB_FAILED,
  CLUSTER_STAGE_SETUP_LOG_SUB_READY,
  CLUSTER_STAGE_SETUP_LOG_SUB_STARTING,
  CLUSTER_STAGE_SETUP_NETWORK_CREATED,
  CLUSTER_STAGE_SETUP_NETWORK_CREATING,
  CLUSTER_STAGE_SETUP_SEED_STARTING,
  CLUSTER_STAGE_TEARDOWN_CAPTURE_FINALIZING,
  CLUSTER_STAGE_TEARDOWN_COMPLETE,
  CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVED,
  CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVING,
  CLUSTER_STAGE_TEARDOWN_STARTING,
  CONTAINER_ENV_KEYS,
  CONTAINER_RUNNING_STATUS,
  ChaosPrimitives,
  DATA_DIR_PATH,
  HEAP_SNAPSHOT_NEAR_LIMIT_DEFAULT_COUNT,
  HEAP_SNAPSHOT_NEAR_LIMIT_MIN_COUNT,
  JOINING_HTTP_TIMEOUT_DEFAULT_MS,
  JOINING_HTTP_TIMEOUT_ENV_KEY,
  JOINING_LEADERSHIP_WAIT_TIMEOUT_DEFAULT_MS,
  JOINING_LEADERSHIP_WAIT_TIMEOUT_ENV_KEY,
  LABELS,
  LogAnalyzer,
  LogCollector,
  NETWORK,
  NODE_OPTIONS_ENV_KEY,
  NODE_OPTION_HEAP_PROF,
  NODE_OPTION_HEAP_SNAPSHOT_NEAR_LIMIT_PREFIX,
  NODE_ROLES,
  PARTITION_ENV_KEYS,
  PLAYBACK_ENTITY_CLUSTER,
  PLAYBACK_EVENT_TYPE,
  PLAYBACK_SCOPE_CLUSTER,
  PLAYBACK_SCOPE_NODE,
  PORTS,
  PlaybackRecorder,
  RAFT_PROVIDER_DEFAULTS,
  RAFT_PROVIDER_ENV_KEY,
  REUSE_CONTAINER_NAME_PREFIX,
  REUSE_CONTROL_DIRNAME,
  REUSE_CONTROL_MOUNT_PATH,
  REUSE_ENTRYPOINT,
  REUSE_LEASE_DIRNAME,
  REUSE_LEASE_FILE_PREFIX,
  REUSE_LEASE_MIN_TIMEOUT_MS,
  REUSE_LEASE_POLL_INTERVAL_MS,
  REUSE_NETWORK_NAME_SUFFIX,
  REUSE_NODE_ID_NAMESPACE,
  REUSE_NODE_ID_PREFIX,
  REUSE_RESET_FLAG_FILENAME,
  REUSE_START_COMMAND_ARGS,
  StartupGate,
  TIMEOUTS,
  TraceArtifactRecorder,
  WS_BIND_ALL_HOST,
  WS_HOST_ENV_KEY,
  ZERO,
  assertConsistency,
  assertDataIntegrity,
  fs,
  httpGet,
  httpRequest,
  isIgnorableContainerStopError,
  readContainerInspectEnvValue,
  resolvePath,
  resolvePositiveTimeoutMs,
  uuidv4,
  uuidv5,
  waitForConsistencyConvergence,
  waitForConvergence,
} = CLUSTER_SEGMENT_7_CLASS_SHARED;

const TEARDOWN_WARNING_PLAYBACK_BEGIN =
  'Failed to begin playback shutdown';
const TEARDOWN_WARNING_STAGE_START =
  'Failed to record teardown start';
const TEARDOWN_WARNING_LOAD_CANCEL =
  'Failed to cancel active load runs';
const TEARDOWN_WARNING_STOP_CONTAINER_PREFIX =
  'Failed to stop container for ';
const TEARDOWN_WARNING_RECORD_STOPPED_PREFIX =
  'Failed to record stopped container for ';
const TEARDOWN_WARNING_SEPARATOR = ': ';

class Cluster1 {
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
    this._logCollector = new LogCollector(config.outputDir);
    this._logAnalyzer = new LogAnalyzer(config.outputDir);
    this._playbackRecorder = new PlaybackRecorder({
      outputDir: config.outputDir,
    });
    this._playbackManifest = null;
    this._playbackStartWarning = null;
    this._traceRecorder = null;
    this._traceManifest = null;
    this._traceStartWarning = null;
    this._cleanupUnregister = null;
    this._reuseLeaseRelease = null;
    this._reuseLeasePath = null;
    this._reuseContainersEnabledOverride = null;
    this._reuseLeaseFallbackWarning = null;
    this._httpGet = httpGet;
    this._httpRequest = httpRequest;
    this._activeLoadRuns = new Set();
  }

  _isContainerReuseEnabled() {
    if (typeof this._reuseContainersEnabledOverride === 'boolean') {
      return this._reuseContainersEnabledOverride;
    }
    const dockerConfig =
      this._config && typeof this._config.docker === 'object' ?
        this._config.docker :
        {};
    const hasRemoteHosts =
      Array.isArray(dockerConfig.hosts) && dockerConfig.hosts.length > 0;
    return !hasRemoteHosts && dockerConfig.reuseContainers === true;
  }

  _buildReusableNetworkName() {
    return (
      NETWORK.NAME_PREFIX +
      '-' +
      REUSE_NETWORK_NAME_SUFFIX +
      '-' +
      String(this._config.size)
    );
  }

  _resolveReusableLeasePath() {
    return resolvePath(
      process.cwd(),
      REUSE_LEASE_DIRNAME,
      REUSE_LEASE_FILE_PREFIX + '-' + String(this._config.size) + '.lock',
    );
  }

  _resolveReusableLeaseTimeoutMs() {
    const startupTimeout =
      this._config.timeouts?.nodeStartup || TIMEOUTS.NODE_STARTUP;
    return Math.max(REUSE_LEASE_MIN_TIMEOUT_MS, startupTimeout);
  }

  async _acquireReusableClusterLease() {
    if (
      !this._isContainerReuseEnabled() ||
      typeof this._reuseLeaseRelease === 'function'
    ) {
      return;
    }

    const lease = await acquireReusableClusterLease({
      lockPath: this._resolveReusableLeasePath(),
      metadata: {
        pid: process.pid,
        clusterId: this._clusterId,
        scenarioName: this._scenarioName,
        clusterSize: this._config.size,
        networkName: this._buildReusableNetworkName(),
        cwd: process.cwd(),
        acquiredAtMs: Date.now(),
      },
      timeoutMs: this._resolveReusableLeaseTimeoutMs(),
      pollIntervalMs: REUSE_LEASE_POLL_INTERVAL_MS,
      sleep: (ms) => this._sleep(ms),
    });
    this._reuseLeaseRelease = lease.release;
    this._reuseLeasePath = lease.lockPath;
  }

  async _prepareReusableClusterLeaseForStart() {
    if (!this._isContainerReuseEnabled()) {
      return;
    }
    try {
      await this._acquireReusableClusterLease();
      this._reuseLeaseFallbackWarning = null;
    } catch (error) {
      if (!isReusableClusterLeaseTimeoutError(error)) {
        throw error;
      }
      this._reuseContainersEnabledOverride = false;
      this._reuseLeaseFallbackWarning =
        error?.message || 'Reusable cluster lease timeout';
    }
  }

  async _releaseReusableClusterLease() {
    if (typeof this._reuseLeaseRelease !== 'function') {
      this._reuseLeasePath = null;
      return;
    }

    const release = this._reuseLeaseRelease;
    this._reuseLeaseRelease = null;
    this._reuseLeasePath = null;
    await release();
  }

  _buildNodeId(nodeIndex) {
    if (this._isContainerReuseEnabled()) {
      return uuidv5(
        REUSE_NODE_ID_PREFIX + String(nodeIndex + 1),
        REUSE_NODE_ID_NAMESPACE,
      );
    }
    return uuidv4();
  }

  _buildContainerName(nodeId, nodeIndex) {
    if (this._isContainerReuseEnabled()) {
      return (
        REUSE_CONTAINER_NAME_PREFIX +
        '-' +
        String(this._config.size) +
        '-' +
        String(nodeIndex + 1)
      );
    }
    return 'ddb-test-' + this._clusterId.slice(0, 8) + '-' + nodeId;
  }

  _buildNodeEnv(nodeId, containerName, seedIp) {
    const env = {};
    const partitionConfig =
      this._config?.partition && typeof this._config.partition === 'object' ?
        this._config.partition :
        null;
    env[CONTAINER_ENV_KEYS.NODE_ID] = nodeId;
    env[CONTAINER_ENV_KEYS.DATA_DIR] = DATA_DIR_PATH;
    env[CONTAINER_ENV_KEYS.NODE_ADDRESS] = containerName + ':' + PORTS.REST;
    env[WS_HOST_ENV_KEY] = WS_BIND_ALL_HOST;
    env[RAFT_PROVIDER_ENV_KEY] = String(
      this._config.raftProvider || RAFT_PROVIDER_DEFAULTS.provider,
    );
    if (this._config?.memoryLeak?.captureHeapArtifacts === true) {
      const nearLimitCount =
        Number.isInteger(
          this._config?.memoryLeak?.heapSnapshotNearLimitCount,
        ) &&
        this._config.memoryLeak.heapSnapshotNearLimitCount >=
          HEAP_SNAPSHOT_NEAR_LIMIT_MIN_COUNT ?
          this._config.memoryLeak.heapSnapshotNearLimitCount :
          HEAP_SNAPSHOT_NEAR_LIMIT_DEFAULT_COUNT;
      const existingNodeOptions = String(
        env[NODE_OPTIONS_ENV_KEY] || '',
      ).trim();
      const leakNodeOptions = [
        NODE_OPTION_HEAP_PROF,
        NODE_OPTION_HEAP_SNAPSHOT_NEAR_LIMIT_PREFIX + nearLimitCount,
      ].join(' ');
      env[NODE_OPTIONS_ENV_KEY] = existingNodeOptions ?
        existingNodeOptions + ' ' + leakNodeOptions :
        leakNodeOptions;
    }

    if (seedIp) {
      env[CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS] = seedIp + ':' + PORTS.REST;
      env[JOINING_HTTP_TIMEOUT_ENV_KEY] = String(
        resolvePositiveTimeoutMs(
          this._config?.timeouts?.joiningHttpTimeoutMs,
          JOINING_HTTP_TIMEOUT_DEFAULT_MS,
        ),
      );
      env[JOINING_LEADERSHIP_WAIT_TIMEOUT_ENV_KEY] = String(
        resolvePositiveTimeoutMs(
          this._config?.timeouts?.joiningLeadershipWaitTimeoutMs,
          JOINING_LEADERSHIP_WAIT_TIMEOUT_DEFAULT_MS,
        ),
      );
    }

    if (
      Number.isInteger(partitionConfig?.splitThresholdBytes) &&
      partitionConfig.splitThresholdBytes > ZERO
    ) {
      env[PARTITION_ENV_KEYS.SPLIT_THRESHOLD_BYTES] = String(
        partitionConfig.splitThresholdBytes,
      );
    }
    if (
      Number.isInteger(partitionConfig?.splitThresholdQpm) &&
      partitionConfig.splitThresholdQpm > ZERO
    ) {
      env[PARTITION_ENV_KEYS.SPLIT_THRESHOLD_QPM] = String(
        partitionConfig.splitThresholdQpm,
      );
    }
    if (
      Number.isInteger(partitionConfig?.mergeThresholdBytes) &&
      partitionConfig.mergeThresholdBytes > ZERO
    ) {
      env[PARTITION_ENV_KEYS.MERGE_THRESHOLD_BYTES] = String(
        partitionConfig.mergeThresholdBytes,
      );
    }
    if (
      Number.isInteger(partitionConfig?.mergeThresholdQpm) &&
      partitionConfig.mergeThresholdQpm > ZERO
    ) {
      env[PARTITION_ENV_KEYS.MERGE_THRESHOLD_QPM] = String(
        partitionConfig.mergeThresholdQpm,
      );
    }
    if (
      Number.isInteger(partitionConfig?.evaluationIntervalMs) &&
      partitionConfig.evaluationIntervalMs > ZERO
    ) {
      env[PARTITION_ENV_KEYS.EVALUATION_INTERVAL_MS] = String(
        partitionConfig.evaluationIntervalMs,
      );
    }
    return env;
  }

  _shouldRecreateReusableContainer(inspect, expectedEnv = {}) {
    if (!inspect || typeof inspect !== 'object') {
      return true;
    }
    for (const [key, value] of Object.entries(expectedEnv)) {
      const currentValue = readContainerInspectEnvValue(inspect, key);
      if (String(currentValue || '') !== String(value)) {
        return true;
      }
    }

    const entrypoint = Array.isArray(inspect?.Config?.Entrypoint) ?
      inspect.Config.Entrypoint :
      [];
    if (
      entrypoint.length !== REUSE_ENTRYPOINT.length ||
      entrypoint[0] !== REUSE_ENTRYPOINT[0] ||
      entrypoint[1] !== REUSE_ENTRYPOINT[1]
    ) {
      return true;
    }

    const cmd = Array.isArray(inspect?.Config?.Cmd) ? inspect.Config.Cmd : [];
    if (
      cmd.length !== REUSE_START_COMMAND_ARGS.length ||
      cmd[0] !== REUSE_START_COMMAND_ARGS[0]
    ) {
      return true;
    }

    return false;
  }

  _getReusableControlDir(containerName) {
    return resolvePath(
      REUSE_LEASE_DIRNAME,
      REUSE_CONTROL_DIRNAME,
      containerName,
    );
  }

  _getReusableControlBind(containerName) {
    return (
      this._getReusableControlDir(containerName) +
      ':' +
      REUSE_CONTROL_MOUNT_PATH
    );
  }

  async _markReusableContainerForDataReset(containerName) {
    const controlDir = this._getReusableControlDir(containerName);
    await fs.mkdir(controlDir, {recursive: true});
    await fs.writeFile(
      resolvePath(controlDir, REUSE_RESET_FLAG_FILENAME),
      '',
      'utf8',
    );
  }

  async _quiesceReusableContainers() {
    if (!this._isContainerReuseEnabled()) {
      return;
    }
    const provider = this._providers[this._hostAssignment[0]];
    const reusableContainerNames = [];
    const reusableContainerNameSet = new Set();
    const addContainerName = (containerName) => {
      if (typeof containerName !== 'string' || containerName.length === 0) {
        return;
      }
      if (reusableContainerNameSet.has(containerName)) {
        return;
      }
      reusableContainerNameSet.add(containerName);
      reusableContainerNames.push(containerName);
    };

    for (let index = 0; index < this._config.size; index++) {
      const nodeId = this._buildNodeId(index);
      addContainerName(this._buildContainerName(nodeId, index));
    }

    if (typeof provider.listContainers === 'function') {
      const reusePrefix =
        REUSE_CONTAINER_NAME_PREFIX + '-' + String(this._config.size) + '-';
      let containers = [];
      try {
        containers = await provider.listContainers();
      } catch (_listErr) {
        containers = [];
      }
      for (const container of containers) {
        const names = Array.isArray(container?.Names) ? container.Names : [];
        for (const rawName of names) {
          const normalizedName =
            typeof rawName === 'string' ? rawName.replace(/^\/+/, '') : '';
          if (!normalizedName.startsWith(reusePrefix)) {
            continue;
          }
          addContainerName(normalizedName);
        }
      }
    }

    for (const containerName of reusableContainerNames) {
      let inspect = null;
      try {
        inspect = await provider.inspectContainerIfExists(containerName);
      } catch (_inspectErr) {
        inspect = null;
      }
      if (!inspect) {
        continue;
      }
      const containerId = inspect.Id || inspect.id || containerName;
      const status = String(inspect?.State?.Status || '').toLowerCase();
      if (status !== CONTAINER_RUNNING_STATUS) {
        continue;
      }
      try {
        await provider.stopContainer(containerId);
      } catch (error) {
        if (!isIgnorableContainerStopError(error)) {
          throw error;
        }
      }
    }
  }

  /**
   * Start the cluster: create network, start seed, wait for
   * bootstrap API, start joiners sequentially, wait for ACTIVE.
   */
  async start() {
    if (!this._cleanupUnregister) {
      this._cleanupUnregister = registerClusterCleanup(
        this._providers[this._hostAssignment[0]],
        this._clusterId,
      );
    }
    await this._prepareReusableClusterLeaseForStart();

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
    const reuseContainers = this._isContainerReuseEnabled();
    this._networkName = reuseContainers ?
      this._buildReusableNetworkName() :
      NETWORK.NAME_PREFIX + '-' + this._clusterId.slice(0, 8);
    this._recordClusterStage(CLUSTER_STAGE_SETUP_NETWORK_CREATING, {
      networkName: this._networkName,
    });
    const networkLabels = {
      [LABELS.CLUSTER]: this._clusterId,
    };
    const net = reuseContainers ?
      await provider.ensureNetwork(this._networkName, networkLabels) :
      await provider.createNetwork(this._networkName, networkLabels);
    this._networkId = net.id;
    this._recordClusterStage(CLUSTER_STAGE_SETUP_NETWORK_CREATED, {
      networkName: this._networkName,
      networkId: this._networkId,
    });
    if (reuseContainers) {
      await this._quiesceReusableContainers();
    }

    const seedId = this._buildNodeId(0);
    this._recordClusterStage(CLUSTER_STAGE_SETUP_SEED_STARTING, {
      nodeId: seedId,
    });
    const seedNode = await this._startNode(seedId, NODE_ROLES.SEED, null, 0);
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

    const startupGate = new StartupGate(this, seedNode, seedId);
    await startupGate.waitForSeedJoinReady();

    for (let i = 1; i < this._config.size; i++) {
      const joinerId = this._buildNodeId(i);
      this._recordClusterStage(CLUSTER_STAGE_SETUP_JOINER_STARTING, {
        nodeId: joinerId,
        ordinal: i,
      });
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
      this._recordClusterStage(CLUSTER_STAGE_SETUP_JOINER_STARTED, {
        nodeId: joinerId,
        ordinal: i,
      });
    }

    await startupGate.waitForClusterActive(this._config.size);
    this._started = true;
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CLUSTER_READY,
      PLAYBACK_SCOPE_CLUSTER,
      PLAYBACK_ENTITY_CLUSTER,
      {
        nodeCount: this._nodes.size,
      },
    );

    if (this._config.debugTrace && this._config.debugTrace.enabled === true) {
      try {
        this._traceRecorder = new TraceArtifactRecorder({
          outputDir: this._config.outputDir,
        });
        await this._traceRecorder.start({
          scenarioName: this._scenarioName,
          node: seedNode,
          debugTrace: this._config.debugTrace,
        });
        this._traceManifest = null;
        this._traceStartWarning = null;
      } catch (error) {
        this._traceStartWarning =
          'Failed to initialize trace capture: ' + error.message;
      }
    }

    // Initialize chaos primitives now that nodes and network exist
    const primaryProvider = this._providers[this._hostAssignment[0]];
    this._chaos = new ChaosPrimitives(
      primaryProvider,
      this._nodes,
      this._networkId,
    );

    // Start live log subscription on the seed node
    this._recordClusterStage(CLUSTER_STAGE_SETUP_LOG_SUB_STARTING, {
      nodeId: seedId,
    });
    try {
      await this._logCollector.startLiveSubscription(seedNode);
      this._recordClusterStage(CLUSTER_STAGE_SETUP_LOG_SUB_READY, {
        nodeId: seedId,
      });
    } catch (_err) {
      this._recordClusterStage(CLUSTER_STAGE_SETUP_LOG_SUB_FAILED, {
        nodeId: seedId,
      });
      // Log collection is best-effort; cluster still usable
    }
  }

  /** Stop and remove all containers, networks, volumes. */
  async stop() {
    const errors = [];
    const reuseContainers = this._isContainerReuseEnabled();
    try {
      await this._runTeardownStep(
        TEARDOWN_WARNING_PLAYBACK_BEGIN,
        errors,
        async () => {
          if (typeof this._playbackRecorder.beginShutdown === 'function') {
            await this._playbackRecorder.beginShutdown({
              awaitInFlightCaptures: true,
            });
          } else {
            this._playbackRecorder.suspendPolling();
          }
        },
      );
      await this._runTeardownStep(
        TEARDOWN_WARNING_STAGE_START,
        errors,
        async () => {
          this._recordClusterStage(CLUSTER_STAGE_TEARDOWN_STARTING, {
            nodeCount: this._nodes.size,
          });
        },
      );
      await this._runTeardownStep(
        TEARDOWN_WARNING_LOAD_CANCEL,
        errors,
        async () => {
          await this._cancelActiveLoadRuns();
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

      if (this._traceRecorder) {
        try {
          this._traceManifest = await this._traceRecorder.stop();
        } catch (err) {
          this._traceManifest = {
            warning: 'Failed to finalize trace artifacts: ' + err.message,
          };
        }
      }

      for (const [nodeId, node] of this._nodes) {
        try {
          node.closeQueryConnection();
        } catch (_err) {
          // Best-effort stop
        }
        try {
          await this._stopNodeContainerForTeardown(nodeId, node, errors);
        } catch (err) {
          errors.push(
            TEARDOWN_WARNING_STOP_CONTAINER_PREFIX + nodeId +
              TEARDOWN_WARNING_SEPARATOR +
              String(err?.message || err),
          );
        }
        if (!reuseContainers) {
          try {
            await node._dockerProvider.removeContainer(node.containerId);
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
              'Failed to remove container for ' + nodeId + ': ' + err.message,
            );
          }
        }
      }

      if (this._networkId && !reuseContainers) {
        try {
          const provider = this._providers[this._hostAssignment[0]];
          this._recordClusterStage(CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVING, {
            networkId: this._networkId,
            networkName: this._networkName,
          });
          await provider.removeNetwork(this._networkId);
          this._recordClusterStage(CLUSTER_STAGE_TEARDOWN_NETWORK_REMOVED, {
            networkId: this._networkId,
            networkName: this._networkName,
          });
        } catch (err) {
          errors.push('Failed to remove network: ' + err.message);
        }
        this._networkId = null;
      } else if (this._networkId && reuseContainers) {
        this._networkId = null;
      }

      try {
        this._recordClusterStage(CLUSTER_STAGE_TEARDOWN_COMPLETE, {
          nodeCount: this._nodes.size,
        });
        this._recordClusterStage(CLUSTER_STAGE_TEARDOWN_CAPTURE_FINALIZING, {});
        this._playbackManifest = await this._playbackRecorder.stop(
          {
            clusterId: this._clusterId,
            nodeCount: this._nodes.size,
          },
          {
            skipFinalCapture: true,
          },
        );
        if (this._traceManifest && this._playbackManifest) {
          this._playbackManifest.trace = this._traceManifest;
        }
        if (this._playbackStartWarning && this._playbackManifest) {
          this._playbackManifest.warning = this._playbackStartWarning;
        } else if (this._playbackStartWarning && !this._playbackManifest) {
          this._playbackManifest = {
            warning: this._playbackStartWarning,
          };
        }
        if (this._traceStartWarning && this._playbackManifest) {
          this._playbackManifest.traceWarning = this._traceStartWarning;
        }
      } catch (err) {
        errors.push('Failed to finalize playback artifacts: ' + err.message);
      }

      this._nodes.clear();

      this._started = false;
      this._unregisterCleanup();
    } finally {
      try {
        await this._releaseReusableClusterLease();
      } catch (error) {
        errors.push(
          'Failed to release reusable cluster lease: ' +
            String(error?.message || error),
        );
      }
      if (errors.length > 0) {
        process.stderr.write(
          'Cluster stop warnings:\n' + errors.join('\n') + '\n',
        );
      }
    }
  }

  async _runTeardownStep(warning, errors, action) {
    try {
      await action();
    } catch (error) {
      errors.push(
        warning + TEARDOWN_WARNING_SEPARATOR +
          String(error?.message || error),
      );
    }
  }

  async _stopNodeContainerForTeardown(nodeId, node, errors) {
    const provider = node?._dockerProvider;
    const containerId = node?.containerId;
    if (
      !provider ||
      typeof containerId !== 'string' ||
      containerId.length === ZERO
    ) {
      return;
    }

    let stopped = false;
    try {
      await provider.stopContainer(containerId);
      stopped = true;
    } catch (error) {
      if (isIgnorableContainerStopError(error)) {
        stopped = true;
      } else if (typeof provider.killContainer === 'function') {
        try {
          await provider.killContainer(containerId);
          stopped = true;
        } catch (killError) {
          const stopMessage = String(error?.message || error);
          const killMessage = String(killError?.message || killError);
          errors.push(
            'Failed to stop container for ' +
              nodeId +
              ': ' +
              stopMessage +
              '; kill fallback failed: ' +
              killMessage,
          );
        }
      } else {
        errors.push(
          'Failed to stop container for ' +
            nodeId +
            ': ' +
            String(error?.message || error),
        );
      }
    }

    if (!stopped) {
      return;
    }

    try {
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_STOPPED,
        PLAYBACK_SCOPE_NODE,
        nodeId,
        {
          containerId,
        },
      );
    } catch (error) {
      errors.push(
        TEARDOWN_WARNING_RECORD_STOPPED_PREFIX + nodeId +
          TEARDOWN_WARNING_SEPARATOR +
          String(error?.message || error),
      );
    }
  }

  async _cancelActiveLoadRuns() {
    if (this._activeLoadRuns.size === 0) {
      return;
    }

    const activeRuns = Array.from(this._activeLoadRuns.values());
    this._activeLoadRuns.clear();

    for (const run of activeRuns) {
      if (typeof run?.cancel !== 'function') {
        continue;
      }
      try {
        run.cancel();
      } catch (_err) {
        // Best-effort cancellation
      }
    }

    await Promise.all(
      activeRuns.map(async (run) => {
        if (typeof run?.waitComplete !== 'function') {
          return;
        }
        try {
          await run.waitComplete();
        } catch (_err) {
          // Best-effort completion wait
        }
      }),
    );
  }

  _unregisterCleanup() {
    if (typeof this._cleanupUnregister === 'function') {
      this._cleanupUnregister();
      this._cleanupUnregister = null;
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

  /** Add one joiner node to an already running cluster. */
  async addNode(options = {}) {
    if (!this._started) {
      throw new Error('Cluster must be started before adding nodes');
    }
    const seedNode =
      Array.from(this._nodes.values()).find(
        (node) => node.role === NODE_ROLES.SEED,
      ) || this._nodes.values().next().value;
    if (!seedNode) {
      throw new Error('Cannot add node: seed node is unavailable');
    }

    const nodeIndex = this._nodes.size;
    const joinerId = this._buildNodeId(nodeIndex);
    this._recordClusterStage(CLUSTER_STAGE_SETUP_JOINER_STARTING, {
      nodeId: joinerId,
      ordinal: nodeIndex,
    });
    const joinerNode = await this._startNode(
      joinerId,
      NODE_ROLES.JOINER,
      seedNode.ip,
      nodeIndex,
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
    this._recordClusterStage(CLUSTER_STAGE_SETUP_JOINER_STARTED, {
      nodeId: joinerId,
      ordinal: nodeIndex,
    });
    if (options.waitForActive !== false) {
      await this._waitForAllActive();
    }
    return joinerNode;
  }

  /** Pick a random non-seed node ID. */
  randomNonSeed() {
    const joiners = Array.from(this._nodes.values()).filter(
      (n) => n.role === NODE_ROLES.JOINER,
    );
    if (joiners.length === 0) {
      throw new Error('No non-seed nodes in cluster');
    }
    const idx = Math.floor(Math.random() * joiners.length);
    return joiners[idx].id;
  }

  // --- Delegated component methods ---

  async waitForConvergence(options) {
    const nodes = Array.from(this._nodes.values());
    const controlQueryTimeoutMs = this._config?.benchmark?.controlQueryTimeoutMs;
    const snapshotTimeoutMs =
      Number.isInteger(controlQueryTimeoutMs) && controlQueryTimeoutMs > 0 ?
        controlQueryTimeoutMs :
        undefined;
    return waitForConvergence(nodes, {
      ignoreStaleInFlightReplicaOperations: true,
      ...(snapshotTimeoutMs !== undefined ? {snapshotTimeoutMs} : {}),
      ...(options || {}),
    });
  }

  async waitForAllActive(options = {}) {
    return this._waitForAllActive(options);
  }

  async assertConsistency(options) {
    const nodes = Array.from(this._nodes.values());
    const controlQueryTimeoutMs = this._config?.benchmark?.controlQueryTimeoutMs;
    const snapshotTimeoutMs =
      Number.isInteger(controlQueryTimeoutMs) && controlQueryTimeoutMs > 0 ?
        controlQueryTimeoutMs :
        undefined;
    return assertConsistency(nodes, {
      ...(snapshotTimeoutMs !== undefined ? {snapshotTimeoutMs} : {}),
      ...(options || {}),
    });
  }

  async waitForConsistencyConvergence(options) {
    const nodes = Array.from(this._nodes.values());
    const controlQueryTimeoutMs = this._config?.benchmark?.controlQueryTimeoutMs;
    const snapshotTimeoutMs =
      Number.isInteger(controlQueryTimeoutMs) && controlQueryTimeoutMs > 0 ?
        controlQueryTimeoutMs :
        undefined;
    return waitForConsistencyConvergence(nodes, {
      ...(snapshotTimeoutMs !== undefined ? {snapshotTimeoutMs} : {}),
      ...(options || {}),
    });
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

  async restartNode(id, options = {}) {
    return this._runChaosAction('restartNode', id, options, () =>
      this._restartNodeWithObservation(id, options),
    );
  }

  async _restartNodeWithObservation(id, options = {}) {
    const node = this._nodes.get(id) || null;
    if (typeof node?.closeQueryConnection === 'function') {
      node.closeQueryConnection();
    }
    await this._recordRestartBoundarySnapshot(id, 'before_stop');
    try {
      await this._chaos.stopNode(id);
    } catch (error) {
      if (!isIgnorableContainerStopError(error)) {
        throw error;
      }
    }
    await this._waitForRestartShutdownBoundary(id);
    await this._chaos.startNode(id);
    if (typeof node?.closeQueryConnection === 'function') {
      node.closeQueryConnection();
    }
    await this._waitForNodeAdminReadiness(id, options);
    await this._recordRestartBoundarySnapshot(id, 'after_ready');
  }

  _resolveRestartShutdownObservationTimeoutMs() {
    const startupTimeout =
      this._config.timeouts?.nodeStartup || TIMEOUTS.NODE_STARTUP;
    return Math.max(startupTimeout, ACTIVE_POLL_INTERVAL_MS * 2);
  }

  _resolveRestartAdminReadinessTimeoutMs() {
    return this._config.timeouts?.nodeStartup || TIMEOUTS.NODE_STARTUP;
  }
}

export {Cluster1};
