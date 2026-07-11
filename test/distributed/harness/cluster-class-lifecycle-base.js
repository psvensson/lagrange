import {CLUSTER_CLASS_SHARED_CONTEXT} from './cluster-class-shared-context.js';
import {acquireReusableClusterLease, isReusableClusterLeaseTimeoutError, registerClusterCleanup} from './cluster-runtime-helpers.js';
import {waitForState} from './wait-for-state.js';
import {SOURCE_FINGERPRINT_ENV_VAR} from '../../../src/diagnostics/source-fingerprint.js';
import {
  createNodeLogStreamer,
  assessCaptureCompleteness,
  finalizeFileBasedCapture,
  fullLogDestPath,
  nodeLogHostDir,
  nodeLogHostFile,
  nodeLogContainerFilePath,
  INCARNATION_BOUNDARY_EVENT,
  NODE_LOG_FILE_ENV_VAR,
  NODE_LOG_DIR_CONTAINER,
} from './full-node-log-capture.js';
import {createReadStream, mkdirSync} from 'node:fs';
import {appendFile} from 'node:fs/promises';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {sweepUnexpectedNodeExits} from './unexpected-node-exit.js';

// Container target of the fast-local live-src bind mount (run.js
// FAST_LOCAL_SOURCE_CONTAINER_PATH). Used only to detect, defensively, that a
// reuse run is bind-mounting live src yet lacks the fingerprint that protects it
// from the stale-code trap.
const FAST_LOCAL_SOURCE_BIND_TARGET = '/app/src';
const ADMIN_WEBSOCKET_HOST_ENV_KEY = 'ADMIN_WEBSOCKET_HOST';
const ADMIN_ALLOW_INSECURE_EXTERNAL_BIND_ENV_KEY =
  'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND';
const DOCKER_BIND_SEPARATOR = ':';
const LEGACY_REUSE_SHELL_ENTRYPOINTS = Object.freeze(['sh', 'bash']);
const LEGACY_REUSE_SHELL_ARG = '-lc';
const LEGACY_REUSE_CONTROL_PATH = '/harness-control';
const LEGACY_REUSE_RESET_FLAG = 'reset-data-on-start';

function parseDockerBind(bind) {
  if (typeof bind !== 'string' || bind.length === 0) {
    return null;
  }
  const parts = bind.split(DOCKER_BIND_SEPARATOR);
  if (parts.length < 2) {
    return null;
  }
  return Object.freeze({
    source: parts[0],
    target: parts[1],
  });
}

function inspectHasExpectedBind(inspect, expectedBind) {
  const binds = Array.isArray(inspect?.HostConfig?.Binds) ?
    inspect.HostConfig.Binds :
    [];
  const expected = parseDockerBind(expectedBind);
  if (!expected) {
    return false;
  }
  return binds.some((bind) => {
    const current = parseDockerBind(bind);
    return Boolean(
      current &&
      current.source === expected.source &&
      current.target === expected.target,
    );
  });
}

function normalizeEntrypointPart(value) {
  const normalized = String(value || '').trim();
  const slashIndex = normalized.lastIndexOf('/');
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

function inspectHasLegacyReusableShellLaunch(inspect) {
  const entrypoint = Array.isArray(inspect?.Config?.Entrypoint) ?
    inspect.Config.Entrypoint :
    [];
  const entrypointParts = entrypoint.map(normalizeEntrypointPart);
  if (
    entrypointParts.some((part) =>
      LEGACY_REUSE_SHELL_ENTRYPOINTS.includes(part),
    ) ||
    entrypoint.includes(LEGACY_REUSE_SHELL_ARG)
  ) {
    return true;
  }

  const cmd = Array.isArray(inspect?.Config?.Cmd) ? inspect.Config.Cmd : [];
  return cmd.some((part) => {
    const value = String(part || '');
    return (
      value.includes(LEGACY_REUSE_CONTROL_PATH) ||
      value.includes(LEGACY_REUSE_RESET_FLAG)
    );
  });
}

function readContainerInspectLabelValue(inspect, labelName) {
  const configLabels = inspect?.Config?.Labels;
  if (
    configLabels &&
    typeof configLabels === 'object' &&
    Object.hasOwn(configLabels, labelName)
  ) {
    return configLabels[labelName];
  }
  const labels = inspect?.Labels;
  if (
    labels &&
    typeof labels === 'object' &&
    Object.hasOwn(labels, labelName)
  ) {
    return labels[labelName];
  }
  return '';
}

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
  REUSE_DATA_DIRNAME,
  REUSE_LEASE_DIRNAME,
  REUSE_LEASE_FILE_PREFIX,
  REUSE_LEASE_MIN_TIMEOUT_MS,
  REUSE_LEASE_POLL_INTERVAL_MS,
  REUSE_NETWORK_NAME_SUFFIX,
  REUSE_NODE_ID_NAMESPACE,
  REUSE_NODE_ID_PREFIX,
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
} = CLUSTER_CLASS_SHARED_CONTEXT;

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

class ClusterLifecycleBase {
  constructor(config, providers, hostAssignment) {
    this._config = config;
    this._providers = providers;
    this._hostAssignment = hostAssignment;
    this._clusterId = uuidv4();
    this._scenarioName = config.scenarioName || 'unknown-scenario';
    this._networkId = null;
    this._networkName = null;
    this._nodes = new Map();
    this._nodeLogStreamers = new Map();
    // Per-node boot generation, 1 at first start, incremented on each observed
    // restart. Stamps the synthetic incarnation-boundary marker so a restarted
    // node's post-restart log lines are filterable (see _markNodeIncarnationBoundary).
    this._nodeIncarnations = new Map();
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
    // The harness reaches Admin over the container's isolated bridge address.
    // Production remains loopback-only by default; live test containers opt in
    // explicitly so readiness and query probes exercise the real Admin boundary.
    env[ADMIN_WEBSOCKET_HOST_ENV_KEY] = WS_BIND_ALL_HOST;
    env[ADMIN_ALLOW_INSECURE_EXTERNAL_BIND_ENV_KEY] = 'true';
    this._applySourceFingerprintEnv(env);
    if (this._isFileLoggingEnabled()) {
      // Route node logs to a bind-mounted file instead of stdout — see
      // _isFileLoggingEnabled. Setting this env also changes the container env,
      // which forces the reuse recreate so the matching bind is picked up.
      env[NODE_LOG_FILE_ENV_VAR] = nodeLogContainerFilePath();
    }
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
    // Forward opt-in LAGRANGE_* feature-flag env vars from the host so per-run
    // flag experiments (e.g. LAGRANGE_JOIN_DISTRIBUTION_ADMISSION) reach the node
    // containers. Scoped to the LAGRANGE_ prefix; changing these recreates the
    // reusable container via _shouldRecreateReusableContainer.
    for (const [key, value] of Object.entries(process.env)) {
      if (
        key.startsWith('LAGRANGE_') &&
        typeof value === 'string' &&
        value.length > ZERO
      ) {
        env[key] = value;
      }
    }
    return env;
  }

  _hasLiveSourceBind() {
    const binds = Array.isArray(this._config?.docker?.binds) ?
      this._config.docker.binds :
      [];
    return binds.some(
      (entry) =>
        typeof entry === 'string' &&
        entry.includes(':' + FAST_LOCAL_SOURCE_BIND_TARGET),
    );
  }

  // Carry the harness-computed src fingerprint into the node env. Because the
  // fingerprint is one of the env entries _shouldRecreateReusableContainer
  // compares, a changed src forces a container recreate (fresh process → fresh
  // import) while unchanged src keeps the fast warm-reuse path. Fail loud if a
  // live-src reuse run lacks the fingerprint — that silently reopens the
  // stale-code trap, and a silent regression here is exactly what cost the
  // original investigation days.
  _applySourceFingerprintEnv(env) {
    const srcFingerprint = this._config?.docker?.srcFingerprint;
    if (srcFingerprint) {
      env[SOURCE_FINGERPRINT_ENV_VAR] = String(srcFingerprint);
      return;
    }
    if (this._isContainerReuseEnabled() && this._hasLiveSourceBind()) {
      this._srcFingerprintMissingWarning =
        'Container reuse is bind-mounting live src but no src fingerprint was ' +
        'computed — stale code may run silently. Expected ' +
        'runConfig.docker.srcFingerprint from applyFastLocalConfig.';
      process.stderr.write(
        '[harness] WARNING: ' + this._srcFingerprintMissingWarning + '\n',
      );
    }
  }

  // File-based logging is enabled for observable (--debug-logs) reuse/local runs.
  // High debug volume over stdout backs up the pipe to the Docker daemon and can
  // stall/hang a busy node — the very failure such runs try to observe. Writing
  // to a bind-mounted file instead removes that observer effect. Gated to local
  // reuse (where the bind reaches the harness host) and to runs that actually
  // turn the volume up.
  _isFileLoggingEnabled() {
    const requested =
      process.env.LAGRANGE_DEBUG_LOGS === 'true' ||
      process.env.LAGRANGE_CAPTURE_LOGS === 'true';
    return (
      requested &&
      this._isContainerReuseEnabled() &&
      Boolean(this._config?.outputDir)
    );
  }

  // Bind for file-based logging: host {outputDir}/.full-logs/{scenario}/{nodeId}
  // → container /harness-logs. mkdir'd here (mode 0777 so the container's uid can
  // write regardless of host/container uid mismatch, as the reuse-control bind
  // already relies on).
  _buildFileLoggingBind(nodeId) {
    // Docker requires an ABSOLUTE host path for a bind source; outputDir is
    // typically relative (test-output/...), so resolve it.
    const hostDir = resolvePath(
      nodeLogHostDir(this._config.outputDir, this._scenarioName, nodeId),
    );
    mkdirSync(hostDir, {recursive: true, mode: 0o777});
    return hostDir + ':' + NODE_LOG_DIR_CONTAINER;
  }

  _shouldRecreateReusableContainer(inspect, expectedEnv = {}, expected = {}) {
    if (!inspect || typeof inspect !== 'object') {
      return true;
    }
    for (const [key, value] of Object.entries(expectedEnv)) {
      const currentValue = readContainerInspectEnvValue(inspect, key);
      if (String(currentValue || '') !== String(value)) {
        return true;
      }
    }

    if (inspectHasLegacyReusableShellLaunch(inspect)) {
      return true;
    }

    if (!inspectHasExpectedBind(inspect, expected.dataBind)) {
      return true;
    }

    if (
      String(readContainerInspectLabelValue(inspect, LABELS.REUSE_ABI) || '') !==
      String(expected.reuseAbiVersion || '')
    ) {
      return true;
    }

    if (
      typeof expected.imageId === 'string' &&
      expected.imageId.length > ZERO &&
      String(inspect?.Image || '') !== expected.imageId
    ) {
      return true;
    }

    return false;
  }

  async _resolveReusableImageId(provider) {
    if (typeof provider?.inspectImage !== 'function') {
      return '';
    }
    try {
      const imageInspect = await provider.inspectImage(this._config.image);
      return String(imageInspect?.Id || imageInspect?.ID || '');
    } catch (_err) {
      return '';
    }
  }

  _getReusableDataDir(containerName) {
    return resolvePath(
      REUSE_LEASE_DIRNAME,
      REUSE_DATA_DIRNAME,
      containerName,
    );
  }

  _getReusableDataBind(containerName) {
    return (
      this._getReusableDataDir(containerName) +
      DOCKER_BIND_SEPARATOR +
      DATA_DIR_PATH
    );
  }

  async _resetReusableDataDir(containerName) {
    const dataDir = this._getReusableDataDir(containerName);
    await fs.rm(dataDir, {recursive: true, force: true});
    await fs.mkdir(dataDir, {recursive: true, mode: 0o777});
    await fs.chmod(dataDir, 0o777);
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
    this._beginNodeLogStream(seedId, seedNode);
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
      this._beginNodeLogStream(joinerId, joinerNode);
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

      const teardownNodes = Array.from(this._nodes.entries());
      this._closeNodeQueryConnectionsForTeardown(teardownNodes);
      await this._stopNodeContainersForTeardown(teardownNodes, errors);
      // Finalize the per-node log STREAMS (started at node startup, draining the
      // pipe continuously to avoid the daemon stall). Done AFTER stopping the
      // containers so the streamers capture shutdown-log lines as they flow, then
      // flush/close and assess completeness — before the conditional removal.
      await this._finalizeFullNodeLogStreams(teardownNodes, errors);
      if (!reuseContainers) {
        await this._removeNodeContainersForTeardown(teardownNodes, errors);
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

  _closeNodeQueryConnectionsForTeardown(nodes) {
    for (const [, node] of nodes) {
      try {
        node.closeQueryConnection();
      } catch (_err) {
        // Best-effort stop
      }
    }
  }

  async _stopNodeContainersForTeardown(nodes, errors) {
    await Promise.all(
      nodes.map(async ([nodeId, node]) => {
        try {
          await this._stopNodeContainerForTeardown(nodeId, node, errors);
        } catch (err) {
          errors.push(
            TEARDOWN_WARNING_STOP_CONTAINER_PREFIX + nodeId +
              TEARDOWN_WARNING_SEPARATOR +
              String(err?.message || err),
          );
        }
      }),
    );
  }

  // Start continuously streaming a node's logs to its gzip file. Draining the
  // pipe for the node's whole life is what keeps the Docker json-file driver from
  // stalling on a busy node and silently truncating its log. Best-effort: a
  // streamer that fails to start must never block node startup. No-op without an
  // outputDir (unit-test clusters).
  _beginNodeLogStream(nodeId, node) {
    const outputDir = this._config?.outputDir;
    if (!outputDir || !node?._dockerProvider || !node?.containerId) {
      return;
    }
    // In file-logging mode the node writes pino directly to the bind-mounted
    // host file (its stdout is empty), so there is no docker-logs stream to
    // follow — finalize reads the file instead.
    if (this._isFileLoggingEnabled()) {
      return;
    }
    if (this._nodeLogStreamers.has(nodeId)) {
      return;
    }
    try {
      const streamer = createNodeLogStreamer({
        provider: node._dockerProvider,
        containerId: node.containerId,
        destPath: fullLogDestPath(outputDir, this._scenarioName, nodeId),
      });
      this._nodeLogStreamers.set(nodeId, streamer);
    } catch (_err) {
      // Best-effort: capture must never break the run.
    }
  }

  // Record that a node just re-booted so its post-restart output is filterable in
  // the capture. In streaming mode we inject a synthetic boundary line into the
  // node's gzip stream; in file-logging mode we append the same marker to the
  // bind-mounted host NDJSON file. Best-effort: a failed marker must never break
  // the restart path. No-op without an outputDir (unit-test clusters).
  async _markNodeIncarnationBoundary(nodeId) {
    const outputDir = this._config?.outputDir;
    if (!outputDir) {
      return;
    }
    const incarnation = (this._nodeIncarnations.get(nodeId) || 1) + 1;
    this._nodeIncarnations.set(nodeId, incarnation);
    try {
      if (this._isFileLoggingEnabled()) {
        const line = JSON.stringify({
          nodeId,
          harnessEvent: INCARNATION_BOUNDARY_EVENT,
          incarnation,
          wallMs: Date.now(),
        });
        await appendFile(
          nodeLogHostFile(outputDir, this._scenarioName, nodeId),
          line + '\n',
        );
        return;
      }
      const streamer = this._nodeLogStreamers.get(nodeId);
      streamer?.markIncarnationBoundary?.(incarnation, {nodeId});
    } catch (_err) {
      // Best-effort: capture instrumentation must never break the run.
    }
  }

  // Stop all per-node log streamers and assess whether each capture is complete.
  // Replaces the old one-shot `docker logs` at teardown (which could only return
  // what the stalled daemon retained). Surfaces TWO loud warnings: stale source
  // (node booted code != working tree) and incomplete capture (node went quiet
  // long before teardown — the streaming reader stopped draining). A measurement
  // run that drew on incomplete logs is exactly the trap this guards.
  async _finalizeFullNodeLogStreams(nodes, errors) {
    const outputDir = this._config?.outputDir;
    const fileLogging = this._isFileLoggingEnabled();
    if (!outputDir || (!fileLogging && this._nodeLogStreamers.size === ZERO)) {
      return;
    }
    const teardownWallMs = Date.now();
    const staleNodeIds = [];
    const incompleteNodes = [];
    await Promise.all(
      nodes.map(async ([nodeId]) => {
        try {
          const finalized = fileLogging ?
            await this._finalizeFileLoggedNode(nodeId, outputDir, teardownWallMs) :
            await this._finalizeStreamedNode(nodeId, outputDir, teardownWallMs);
          if (!finalized) {
            return;
          }
          if (!finalized.completeness.complete) {
            incompleteNodes.push(
              nodeId + ' (' + finalized.completeness.reason + ')',
            );
          }
          if (finalized.provenance?.srcFingerprintMatches === false) {
            staleNodeIds.push(nodeId);
          }
        } catch (err) {
          errors.push(
            'Failed to finalize full log for ' +
              nodeId +
              ': ' +
              String(err?.message || err),
          );
        }
      }),
    );
    this._nodeLogStreamers.clear();
    if (staleNodeIds.length > ZERO) {
      this._staleSourceWarning =
        'Stale source detected: node(s) ' +
        staleNodeIds.join(', ') +
        ' booted a source fingerprint that does not match the harness ' +
        'working tree. This run executed STALE CODE — do not trust its results.';
      process.stderr.write('[harness] WARNING: ' + this._staleSourceWarning + '\n');
    }
    if (incompleteNodes.length > ZERO) {
      this._incompleteCaptureWarning =
        'Incomplete log capture for node(s) ' +
        incompleteNodes.join(', ') +
        '. The capture stopped draining before teardown — DO NOT trust ' +
        'attribution from these logs (they may be silently truncated).';
      process.stderr.write(
        '[harness] WARNING: ' + this._incompleteCaptureWarning + '\n',
      );
    }
  }

  // File-logging mode: the node wrote NDJSON directly to the bind-mounted host
  // file; gzip it to the standard dest and assess completeness against the app's
  // own timestamps (no docker-receipt lag blind spot).
  async _finalizeFileLoggedNode(nodeId, outputDir, teardownWallMs) {
    const result = await finalizeFileBasedCapture({
      hostFilePath: nodeLogHostFile(outputDir, this._scenarioName, nodeId),
      destGzPath: fullLogDestPath(outputDir, this._scenarioName, nodeId),
      teardownWallMs,
    });
    return {
      completeness: result.completeness,
      provenance: result.bootSourceProvenance,
    };
  }

  // Streaming mode: stop the per-node follow streamer, assess completeness from
  // its status, and scan the gz it wrote for boot provenance.
  async _finalizeStreamedNode(nodeId, outputDir, teardownWallMs) {
    const streamer = this._nodeLogStreamers.get(nodeId);
    if (!streamer) {
      return null;
    }
    const status = await streamer.stop();
    return {
      completeness: assessCaptureCompleteness({
        lastLineWallMs: status.lastLineWallMs,
        teardownWallMs,
        lineCount: status.lineCount,
      }),
      provenance: await this._scanBootProvenance(
        fullLogDestPath(outputDir, this._scenarioName, nodeId),
      ),
    };
  }

  // Stream a gzipped node log line-by-line (O(1) memory) and return the LAST
  // boot-provenance record (the running incarnation after any restart).
  async _scanBootProvenance(gzPath) {
    let provenance = null;
    const source = createReadStream(gzPath);
    const rl = createInterface({
      input: source.pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    try {
      for await (const line of rl) {
        let parsed = null;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (
          parsed &&
          typeof parsed === 'object' &&
          Object.prototype.hasOwnProperty.call(parsed, 'srcFingerprintMatches')
        ) {
          provenance = {
            srcFingerprintMatches: parsed.srcFingerprintMatches,
            bootedSrcFingerprint: parsed.bootedSrcFingerprint ?? null,
            expectedSrcFingerprint: parsed.expectedSrcFingerprint ?? null,
          };
        }
      }
    } catch {
      // Partial/corrupt gz (e.g. an incomplete capture) — return what we found.
    } finally {
      rl.close();
      source.destroy();
    }
    return provenance;
  }

  async _removeNodeContainersForTeardown(nodes, errors) {
    await Promise.all(
      nodes.map(async ([nodeId, node]) => {
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
            'Failed to remove container for ' +
              nodeId +
              ': ' +
              String(err?.message || err),
          );
        }
      }),
    );
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
    this._beginNodeLogStream(joinerId, joinerNode);
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
      noProgressTimeoutMs: TIMEOUTS.CONVERGENCE_NO_PROGRESS,
      ...(snapshotTimeoutMs !== undefined ? {snapshotTimeoutMs} : {}),
      ...(options || {}),
    });
  }

  async waitForAllActive(options = {}) {
    return this._waitForAllActive(options);
  }

  // DT1 directed-chaos primitive: block until an arbitrary observed predicate
  // holds, then the scenario perturbs (restart/partition/kill) on that STATE
  // rather than on a wall-clock timer. `predicate(cluster) => boolean|Promise`.
  async waitForState(predicate, options = {}) {
    return waitForState(this, predicate, options);
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

  // CL-030: nodes the SCENARIO took down (kill/stop/pause/mid-restart) are
  // EXPECTED down; any other node whose container has exited at scenario-
  // failure time is an unexpected death the failure must be attributed to.
  _markNodeExpectedDown(id, action) {
    (this._expectedDownNodesById ||= new Map()).set(String(id), {
      action,
      sinceMs: Date.now(),
    });
  }

  _clearNodeExpectedDown(id) {
    this._expectedDownNodesById?.delete(String(id));
  }

  _isNodeExpectedDown(id) {
    return this._expectedDownNodesById?.has(String(id)) === true;
  }

  /**
   * CL-030 failure-time sweep: report non-expected-down nodes whose
   * container has exited, with exit evidence (stdout tail + fatal lines).
   * Best-effort — never throws.
   */
  async sweepUnexpectedNodeExits() {
    try {
      return await sweepUnexpectedNodeExits(
        this._nodes.values(),
        (id) => this._isNodeExpectedDown(id),
      );
    } catch (_error) {
      return [];
    }
  }

  async killNode(id) {
    this._markNodeExpectedDown(id, 'killNode');
    return this._runChaosAction('killNode', id, null, () =>
      this._chaos.killNode(id),
    );
  }

  async stopNode(id) {
    this._markNodeExpectedDown(id, 'stopNode');
    return this._runChaosAction('stopNode', id, null, () =>
      this._chaos.stopNode(id),
    );
  }

  async pauseNode(id) {
    this._markNodeExpectedDown(id, 'pauseNode');
    return this._runChaosAction('pauseNode', id, null, () =>
      this._chaos.pauseNode(id),
    );
  }

  async unpauseNode(id) {
    const result = await this._runChaosAction('unpauseNode', id, null, () =>
      this._chaos.unpauseNode(id),
    );
    this._clearNodeExpectedDown(id);
    return result;
  }

  async restartNode(id, options = {}) {
    // Marked for the whole stop->start->ready window; cleared only on a
    // SUCCESSFUL restart — a failed restart leaves the node expected-down
    // (its death is already attributed to the restart action by CL-025).
    this._markNodeExpectedDown(id, 'restartNode');
    const result = await this._runChaosAction('restartNode', id, options, () =>
      this._restartNodeWithObservation(id, options),
    );
    this._clearNodeExpectedDown(id);
    return result;
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
    // Mark the boot boundary now (before readiness wait) so the marker lands
    // ahead of the new incarnation's app logs in the capture.
    await this._markNodeIncarnationBoundary(id);
    if (typeof node?.closeQueryConnection === 'function') {
      node.closeQueryConnection();
    }
    await this._waitForNodeAdminReadiness(id, options);
    await this._recordRestartBoundarySnapshot(id, 'after_ready');
    await this._assertRestartedNodeRecoveryHeld(id, options);
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

export {ClusterLifecycleBase};
