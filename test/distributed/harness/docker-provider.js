/**
 * Docker Provider — wraps dockerode for container lifecycle management.
 * Supports both local (Unix socket) and remote (TCP) Docker daemon connections.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1, 10.3, 10.4
 */

import Docker from 'dockerode';
import {
  PORTS,
  TIMEOUTS,
  DOCKER_DEFAULTS,
  RESOURCE_DEFAULTS,
} from './constants.js';

const CONTAINER_RUNNING_STATE = 'running';
const START_POLL_INTERVAL_MS = 250;
const LOG_TAIL_ON_FAILURE = 50;
const STOP_TIMEOUT_SECONDS = 10;
const PERCENT_MULTIPLIER = 100;
const MIN_CPU_COUNT = 1;
const ZERO = 0;
const TYPEOF_FUNCTION = 'function';
const DOCKER_OP_CREATE_NETWORK = 'network.create';
const DOCKER_OP_REMOVE_NETWORK = 'network.remove';
const DOCKER_OP_BUILD_IMAGE = 'image.build';
const DOCKER_OP_CREATE_CONTAINER = 'container.create';
const DOCKER_OP_START_CONTAINER = 'container.start';
const DOCKER_OP_STOP_CONTAINER = 'container.stop';
const DOCKER_OP_REMOVE_CONTAINER = 'container.remove';
const DOCKER_OP_CONNECT_NETWORK = 'network.connect';
const DOCKER_OP_DISCONNECT_NETWORK = 'network.disconnect';
const DEFAULT_BUILD_LABELS = Object.freeze({});
const CONTAINER_LOG_OPTION_RAW_BUFFER = 'rawBuffer';
const UTF8_ENCODING = 'utf8';
const NETWORK_EXISTS_ERROR_PATTERN = 'already exists';
const NETWORK_LIST_FILTER_NAME = 'name';

class DockerProvider {
  /**
   * @param {Object} config
   * @param {string} [config.socketPath] - Local Docker socket path
   * @param {string} [config.host] - Remote Docker host (tcp://host:port)
   */
  constructor(config = {}) {
    this._operationSink = typeof config.operationSink === TYPEOF_FUNCTION ?
      config.operationSink :
      null;
    if (config.host) {
      const {hostname, port} = this._parseTcpHost(config.host);
      this._docker = new Docker({
        host: hostname,
        port: port,
        protocol: 'http',
      });
    } else {
      this._docker = new Docker({
        socketPath: config.socketPath || DOCKER_DEFAULTS.socketPath,
      });
    }
  }

  /**
   * Create a Docker bridge network for the cluster.
   * @param {string} name - Network name
   * @param {Object} [labels] - Labels to attach
   * @returns {Promise<{id: string, name: string}>}
   */
  async createNetwork(name, labels = {}) {
    this._emitOperation(DOCKER_OP_CREATE_NETWORK, {
      stage: 'starting',
      name,
      labels,
    });
    const network = await this._docker.createNetwork({
      Name: name,
      Driver: 'bridge',
      Labels: labels,
    });
    this._emitOperation(DOCKER_OP_CREATE_NETWORK, {
      stage: 'completed',
      name,
      networkId: network.id,
    });
    return {id: network.id, name};
  }

  /**
   * Ensure a Docker bridge network exists, reusing by name when present.
   * @param {string} name
   * @param {Object} [labels]
   * @returns {Promise<{id: string, name: string, reused?: boolean}>}
   */
  async ensureNetwork(name, labels = {}) {
    try {
      return await this.createNetwork(name, labels);
    } catch (err) {
      const message = String(err?.message || '').toLowerCase();
      if (!message.includes(NETWORK_EXISTS_ERROR_PATTERN)) {
        throw err;
      }
      const existing = await this.getNetworkByName(name);
      if (!existing) {
        throw err;
      }
      this._emitOperation(DOCKER_OP_CREATE_NETWORK, {
        stage: 'reused',
        name,
        networkId: existing.id,
      });
      return {
        id: existing.id,
        name: existing.name,
        reused: true,
      };
    }
  }

  /**
   * Resolve an existing Docker network by name.
   * @param {string} name
   * @returns {Promise<{id: string, name: string}|null>}
   */
  async getNetworkByName(name) {
    const networks = await this._docker.listNetworks({
      filters: JSON.stringify({
        [NETWORK_LIST_FILTER_NAME]: [name],
      }),
    });
    if (!Array.isArray(networks) || networks.length === ZERO) {
      return null;
    }
    const match = networks.find((network) => network.Name === name) ||
      networks[0];
    if (!match) {
      return null;
    }
    return {
      id: match.Id,
      name: match.Name || name,
    };
  }

  /**
   * Build a Docker image from a Dockerfile.
   * Req 10.1, 10.3, 10.4
   * @param {string} contextPath - Build context directory
   * @param {string} tag - Image tag
   * @param {string} [dockerfile] - Dockerfile path relative to context
   * @param {Object} [labels] - Image labels to embed at build time
   * @returns {Promise<void>}
   */
  async buildImage(
    contextPath,
    tag,
    dockerfile = DOCKER_DEFAULTS.dockerfile,
    onProgress = null,
    labels = DEFAULT_BUILD_LABELS,
  ) {
    this._emitOperation(DOCKER_OP_BUILD_IMAGE, {
      stage: 'starting',
      contextPath,
      tag,
      dockerfile,
      labels,
    });
    let stream;
    try {
      stream = await this._docker.buildImage(
        {context: contextPath, src: ['.']},
        {t: tag, dockerfile, labels},
      );
    } catch (err) {
      this._emitOperation(DOCKER_OP_BUILD_IMAGE, {
        stage: 'failed',
        contextPath,
        tag,
        dockerfile,
        error: err.message,
      });
      throw new Error(
        `Docker image build failed for tag "${tag}": ${err.message}`,
      );
    }
    const output = await this._collectBuildOutput(stream, onProgress);
    const errorLine = output.find((line) => line.error);
    if (errorLine) {
      const buildLog = output
        .map((line) => line.stream || line.error || '')
        .join('');
      this._emitOperation(DOCKER_OP_BUILD_IMAGE, {
        stage: 'failed',
        contextPath,
        tag,
        dockerfile,
        error: errorLine.error,
      });
      throw new Error(
        `Docker image build failed for tag "${tag}": ` +
        `${errorLine.error}\nBuild output:\n${buildLog}`,
      );
    }
    this._emitOperation(DOCKER_OP_BUILD_IMAGE, {
      stage: 'completed',
      contextPath,
      tag,
      dockerfile,
      labels,
    });
  }

  /**
   * Inspect an image by tag.
   * @param {string} tag
   * @returns {Promise<Object|null>} Image inspect result, or null if missing.
   */
  async inspectImage(tag) {
    try {
      return await this._docker.getImage(tag).inspect();
    } catch (_err) {
      return null;
    }
  }

  /**
   * Check whether an image tag exists locally.
   * @param {string} tag
   * @returns {Promise<boolean>}
   */
  async imageExists(tag) {
    const inspect = await this.inspectImage(tag);
    return !!inspect;
  }

  /**
   * Read an image label value by key.
   * @param {string} tag
   * @param {string} labelKey
   * @returns {Promise<string|null>}
   */
  async getImageLabel(tag, labelKey) {
    if (!tag || !labelKey) {
      return null;
    }
    const inspect = await this.inspectImage(tag);
    const labels = inspect?.Config?.Labels;
    if (!labels || typeof labels !== 'object') {
      return null;
    }
    const value = labels[labelKey];
    if (typeof value !== 'string' || value.length === ZERO) {
      return null;
    }
    return value;
  }

  /**
   * Collect build output from a Docker build stream.
   * @param {Object} stream - Docker build stream
   * @returns {Promise<Array<Object>>}
   */
  _collectBuildOutput(stream, onProgress = null) {
    return new Promise((resolve, reject) => {
      const output = [];
      this._docker.modem.followProgress(
        stream,
        (err, res) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(res || output);
        },
        (event) => {
          output.push(event);
          if (typeof onProgress === TYPEOF_FUNCTION) {
            try {
              onProgress(event);
            } catch (_err) {
              // Best-effort progress callback isolation.
            }
          }
        },
      );
    });
  }

  /**
   * Create and start a container. Waits for it to reach running state.
   * Req 1.1, 1.2, 1.3, 1.4
   * @param {Object} options
   * @param {string} options.name - Container name
   * @param {string} options.image - Docker image
   * @param {string} options.network - Network name or ID
   * @param {Object} [options.env] - Environment variables
   * @param {Object} [options.labels] - Container labels
   * @param {Object} [options.resourceLimits] - {memory, cpus}
   * @param {Object} [options.hostConfigExtras] - Extra HostConfig fields
   * @param {number} [options.startTimeout] - Start timeout in ms
   * @returns {Promise<{containerId: string, ip: string, name: string}>}
   */
  async createContainer(options) {
    const {
      name,
      image,
      network,
      env = {},
      labels = {},
      resourceLimits = {},
      startTimeout = TIMEOUTS.NODE_STARTUP,
      command = null,
      entrypoint = null,
      hostConfigExtras = null,
    } = options;

    this._emitOperation(DOCKER_OP_CREATE_CONTAINER, {
      stage: 'starting',
      name,
      image,
      network,
      startTimeout,
    });
    const envArray = this._buildEnvArray(env);
    const hostConfig = this._buildHostConfig(
      resourceLimits,
      network,
      hostConfigExtras,
    );

    const container = await this._docker.createContainer({
      name,
      Image: image,
      Env: envArray,
      Labels: labels,
      ...(Array.isArray(entrypoint) && entrypoint.length > ZERO ?
        {Entrypoint: entrypoint} :
        {}),
      ...(Array.isArray(command) && command.length > ZERO ?
        {Cmd: command} :
        {}),
      ExposedPorts: {
        [`${PORTS.REST}/tcp`]: {},
        [`${PORTS.ADMIN_API}/tcp`]: {},
        [`${PORTS.WS_TRANSPORT}/tcp`]: {},
      },
      HostConfig: hostConfig,
      NetworkingConfig: {
        EndpointsConfig: {
          [network]: {},
        },
      },
    });

    const containerId = container.id;
    try {
      this._emitOperation(DOCKER_OP_START_CONTAINER, {
        stage: 'starting',
        name,
        containerId,
        startTimeout,
      });
      await container.start();
      await this._waitForRunning(containerId, startTimeout);
      this._emitOperation(DOCKER_OP_START_CONTAINER, {
        stage: 'completed',
        name,
        containerId,
      });
    } catch (err) {
      await this._cleanupFailedContainer(containerId);
      this._emitOperation(DOCKER_OP_START_CONTAINER, {
        stage: 'failed',
        name,
        containerId,
        error: err.message,
      });
      throw new Error(
        `Container "${name}" failed to start within ` +
        `${startTimeout}ms: ${err.message}`,
      );
    }

    const info = await this.inspectContainer(containerId);
    const ip = info.NetworkSettings?.Networks?.[network]?.IPAddress || '';

    this._emitOperation(DOCKER_OP_CREATE_CONTAINER, {
      stage: 'completed',
      name,
      image,
      network,
      containerId,
      ip,
    });
    return {containerId, ip, name};
  }

  /**
   * Build environment variable array from key-value object.
   * @param {Object} env
   * @returns {Array<string>}
   */
  _buildEnvArray(env) {
    return Object.entries(env).map(([key, value]) => `${key}=${value}`);
  }

  /**
   * Build HostConfig for container creation.
   * @param {Object} resourceLimits
   * @param {string} network
   * @param {Object|null} hostConfigExtras
   * @returns {Object}
   */
  _buildHostConfig(resourceLimits, _network, hostConfigExtras = null) {
    const config = {};
    const memory = resourceLimits.memory || RESOURCE_DEFAULTS.memory;
    const cpus = resourceLimits.cpus || RESOURCE_DEFAULTS.cpus;

    const memoryBytes = this._parseMemoryLimit(memory);
    if (memoryBytes) {
      config.Memory = memoryBytes;
    }

    const nanoCpus = Math.floor(parseFloat(cpus) * 1e9);
    if (nanoCpus > 0) {
      config.NanoCpus = nanoCpus;
    }

    if (hostConfigExtras && typeof hostConfigExtras === 'object') {
      Object.assign(config, hostConfigExtras);
    }

    return config;
  }

  /**
   * Parse a memory limit string (e.g. '512m') to bytes.
   * @param {string} limit
   * @returns {number}
   */
  _parseMemoryLimit(limit) {
    const match = String(limit).match(/^(\d+)([kmg]?)$/i);
    if (!match) return 0;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers = {k: 1024, m: 1024 ** 2, g: 1024 ** 3};
    return value * (multipliers[unit] || 1);
  }

  /**
   * Wait for a container to reach running state.
   * Req 1.4
   * @param {string} containerId
   * @param {number} timeoutMs
   */
  async _waitForRunning(containerId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const info = await this.inspectContainer(containerId);
      if (info.State?.Status === CONTAINER_RUNNING_STATE) {
        return;
      }
      await this._sleep(START_POLL_INTERVAL_MS);
    }
    throw new Error(`Container ${containerId} did not reach running state`);
  }

  /**
   * Clean up a failed container: collect logs, then remove.
   * Req 1.4
   * @param {string} containerId
   */
  async _cleanupFailedContainer(containerId) {
    try {
      const logs = await this.getContainerLogs(containerId, {
        tail: LOG_TAIL_ON_FAILURE,
      });
      if (logs) {
        process.stderr.write(
          `Logs from failed container ${containerId}:\n${logs}\n`,
        );
      }
    } catch (_logErr) {
      // Best-effort log collection
    }
    try {
      await this.removeContainer(containerId);
    } catch (_removeErr) {
      // Best-effort cleanup
    }
  }

  /**
   * Stop a container gracefully (SIGTERM).
   * @param {string} containerId
   */
  async stopContainer(containerId) {
    this._emitOperation(DOCKER_OP_STOP_CONTAINER, {
      stage: 'starting',
      containerId,
    });
    const container = this._docker.getContainer(containerId);
    await container.stop({t: STOP_TIMEOUT_SECONDS});
    this._emitOperation(DOCKER_OP_STOP_CONTAINER, {
      stage: 'completed',
      containerId,
    });
  }

  /**
   * Kill a container (SIGKILL).
   * @param {string} containerId
   */
  async killContainer(containerId) {
    const container = this._docker.getContainer(containerId);
    await container.kill();
  }

  /**
   * Pause a container (SIGSTOP).
   * @param {string} containerId
   */
  async pauseContainer(containerId) {
    const container = this._docker.getContainer(containerId);
    await container.pause();
  }

  /**
   * Unpause a container (SIGCONT).
   * @param {string} containerId
   */
  async unpauseContainer(containerId) {
    const container = this._docker.getContainer(containerId);
    await container.unpause();
  }

  /**
   * Restart a container, preserving its data volume.
   * @param {string} containerId
   */
  async restartContainer(containerId) {
    const container = this._docker.getContainer(containerId);
    await container.restart({t: STOP_TIMEOUT_SECONDS});
  }

  /**
   * Start an existing container and wait for running state.
   * @param {string} containerId
   * @param {number} [startTimeout]
   */
  async startContainer(containerId, startTimeout = TIMEOUTS.NODE_STARTUP) {
    this._emitOperation(DOCKER_OP_START_CONTAINER, {
      stage: 'starting',
      containerId,
      startTimeout,
    });
    const container = this._docker.getContainer(containerId);
    await container.start();
    await this._waitForRunning(containerId, startTimeout);
    this._emitOperation(DOCKER_OP_START_CONTAINER, {
      stage: 'completed',
      containerId,
    });
  }

  /**
   * Execute a command inside a running container.
   * @param {string} containerId
   * @param {Array<string>} cmd - Command and arguments
   * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
   */
  async execInContainer(containerId, cmd) {
    const container = this._docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({Detach: false, Tty: false});
    const {stdout, stderr} = await this._demuxStream(stream);
    const inspectResult = await exec.inspect();
    return {
      exitCode: inspectResult.ExitCode,
      stdout,
      stderr,
    };
  }

  /**
   * Demux a Docker multiplexed stream into stdout and stderr.
   * @param {Object} stream
   * @returns {Promise<{stdout: string, stderr: string}>}
   */
  _demuxStream(stream) {
    return new Promise((resolve, reject) => {
      const stdoutChunks = [];
      const stderrChunks = [];
      this._docker.modem.demuxStream(
        stream,
        {write: (chunk) => stdoutChunks.push(chunk)},
        {write: (chunk) => stderrChunks.push(chunk)},
      );
      stream.on('end', () => {
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
        });
      });
      stream.on('error', reject);
    });
  }

  /**
   * Get container logs (stdout + stderr).
   * @param {string} containerId
   * @param {Object} [options]
   * @param {number} [options.tail] - Number of lines from end
   * @param {boolean} [options.timestamps] - Include timestamps
   * @param {string} [options.since] - Logs since timestamp
   * @param {boolean} [options.rawBuffer] - Return raw Docker log buffer
   * @returns {Promise<string|Buffer>}
   */
  async getContainerLogs(containerId, options = {}) {
    const container = this._docker.getContainer(containerId);
    const logOpts = {
      stdout: true,
      stderr: true,
      follow: false,
    };
    if (options.tail !== undefined) {
      logOpts.tail = options.tail;
    }
    if (options.timestamps) {
      logOpts.timestamps = true;
    }
    if (options.since) {
      logOpts.since = options.since;
    }
    const buffer = await container.logs(logOpts);
    if (options[CONTAINER_LOG_OPTION_RAW_BUFFER] === true) {
      return buffer;
    }
    return buffer.toString(UTF8_ENCODING);
  }

  /**
   * Stream container logs in real-time.
   * @param {string} containerId
   * @param {Function} callback - Called with each log chunk
   * @returns {{stop: Function}} Handle to stop streaming
   */
  streamContainerLogs(containerId, callback) {
    const container = this._docker.getContainer(containerId);
    let stream = null;
    let stopped = false;

    container.logs({
      stdout: true,
      stderr: true,
      follow: true,
    }).then((s) => {
      if (stopped) {
        s.destroy();
        return;
      }
      stream = s;
      stream.on('data', (chunk) => {
        callback(chunk.toString('utf8'));
      });
      stream.on('error', (_err) => {
        // Stream errors are expected on container stop
      });
    }).catch((_err) => {
      // Ignore errors if already stopped
    });

    return {
      stop: () => {
        stopped = true;
        if (stream) {
          stream.destroy();
        }
      },
    };
  }

  /**
   * Read one-shot container stats and normalize metrics.
   * @param {string} containerId
   * @returns {Promise<Object>}
   */
  async getContainerStats(containerId) {
    const container = this._docker.getContainer(containerId);
    const raw = await container.stats({stream: false});
    return parseContainerStats(raw);
  }

  /**
   * Remove a container and its associated volumes.
   * Req 1.5
   * @param {string} containerId
   */
  async removeContainer(containerId) {
    this._emitOperation(DOCKER_OP_REMOVE_CONTAINER, {
      stage: 'starting',
      containerId,
    });
    const container = this._docker.getContainer(containerId);
    await container.remove({force: true, v: true});
    this._emitOperation(DOCKER_OP_REMOVE_CONTAINER, {
      stage: 'completed',
      containerId,
    });
  }

  /**
   * Remove a network.
   * @param {string} networkId
   */
  async removeNetwork(networkId) {
    this._emitOperation(DOCKER_OP_REMOVE_NETWORK, {
      stage: 'starting',
      networkId,
    });
    const network = this._docker.getNetwork(networkId);
    await network.remove();
    this._emitOperation(DOCKER_OP_REMOVE_NETWORK, {
      stage: 'completed',
      networkId,
    });
  }

  /**
   * Disconnect a container from a network.
   * @param {string} networkId
   * @param {string} containerId
   */
  async disconnectFromNetwork(networkId, containerId) {
    this._emitOperation(DOCKER_OP_DISCONNECT_NETWORK, {
      stage: 'starting',
      networkId,
      containerId,
    });
    const network = this._docker.getNetwork(networkId);
    await network.disconnect({Container: containerId, Force: true});
    this._emitOperation(DOCKER_OP_DISCONNECT_NETWORK, {
      stage: 'completed',
      networkId,
      containerId,
    });
  }

  /**
   * Connect a container to a network.
   * @param {string} networkId
   * @param {string} containerId
   */
  async connectToNetwork(networkId, containerId) {
    this._emitOperation(DOCKER_OP_CONNECT_NETWORK, {
      stage: 'starting',
      networkId,
      containerId,
    });
    const network = this._docker.getNetwork(networkId);
    await network.connect({Container: containerId});
    this._emitOperation(DOCKER_OP_CONNECT_NETWORK, {
      stage: 'completed',
      networkId,
      containerId,
    });
  }

  /**
   * List containers by label filter.
   * @param {Object} [labels] - Label key-value pairs to filter by
   * @returns {Promise<Array<Object>>}
   */
  async listContainers(labels = {}) {
    const filters = {};
    const labelFilters = Object.entries(labels)
      .map(([key, value]) => `${key}=${value}`);
    if (labelFilters.length > 0) {
      filters.label = labelFilters;
    }
    return this._docker.listContainers({
      all: true,
      filters: JSON.stringify(filters),
    });
  }

  /**
   * Get container inspect info (IP address, state, etc.).
   * @param {string} containerId
   * @returns {Promise<Object>}
   */
  async inspectContainer(containerId) {
    const container = this._docker.getContainer(containerId);
    return container.inspect();
  }

  /**
   * Inspect a container by ID or name, returning null if missing.
   * @param {string} containerId
   * @returns {Promise<Object|null>}
   */
  async inspectContainerIfExists(containerId) {
    try {
      return await this.inspectContainer(containerId);
    } catch (_err) {
      return null;
    }
  }

  /**
   * Sleep helper.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Emit structured docker operation log entry.
   * @param {string} operation
   * @param {Object} details
   * @private
   */
  _emitOperation(operation, details) {
    if (typeof this._operationSink !== TYPEOF_FUNCTION) {
      return;
    }
    try {
      this._operationSink({
        timestamp: Date.now(),
        operation,
        ...(details || {}),
      });
    } catch (_err) {
      // Best-effort operation callback isolation.
    }
  }

  /**
   * Parse a tcp://host:port string into hostname and port.
   * @param {string} hostStr - e.g. 'tcp://192.168.1.1:2376'
   * @returns {{hostname: string, port: number}}
   */
  _parseTcpHost(hostStr) {
    const stripped = hostStr.replace(/^tcp:\/\//, '');
    const colonIdx = stripped.lastIndexOf(':');
    if (colonIdx === -1) {
      return {
        hostname: stripped,
        port: DOCKER_DEFAULTS.remotePort,
      };
    }
    return {
      hostname: stripped.slice(0, colonIdx),
      port: parseInt(stripped.slice(colonIdx + 1), 10) ||
        DOCKER_DEFAULTS.remotePort,
    };
  }
}

function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : ZERO;
}

function parseCpuPercent(stats) {
  const cpuStats = stats?.cpu_stats || {};
  const preCpuStats = stats?.precpu_stats || {};
  const cpuTotal = safeNumber(cpuStats.cpu_usage?.total_usage);
  const preCpuTotal = safeNumber(preCpuStats.cpu_usage?.total_usage);
  const systemTotal = safeNumber(cpuStats.system_cpu_usage);
  const preSystemTotal = safeNumber(preCpuStats.system_cpu_usage);

  const cpuDelta = cpuTotal - preCpuTotal;
  const systemDelta = systemTotal - preSystemTotal;
  if (cpuDelta <= ZERO || systemDelta <= ZERO) {
    return ZERO;
  }

  const percpuUsage = cpuStats.cpu_usage?.percpu_usage;
  const cpuCount = safeNumber(cpuStats.online_cpus) ||
    (Array.isArray(percpuUsage) ? percpuUsage.length : MIN_CPU_COUNT);
  const normalizedCount = Math.max(cpuCount, MIN_CPU_COUNT);

  return (cpuDelta / systemDelta) * normalizedCount * PERCENT_MULTIPLIER;
}

function parseNetworks(stats) {
  const networks = stats?.networks;
  if (!networks || typeof networks !== 'object') {
    return {rxBytes: ZERO, txBytes: ZERO};
  }

  let rxBytes = ZERO;
  let txBytes = ZERO;
  for (const networkStats of Object.values(networks)) {
    rxBytes += safeNumber(networkStats?.rx_bytes);
    txBytes += safeNumber(networkStats?.tx_bytes);
  }
  return {rxBytes, txBytes};
}

function parseTimestamp(readValue) {
  if (typeof readValue !== 'string' || readValue.length === ZERO) {
    return Date.now();
  }
  const parsed = Date.parse(readValue);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return Date.now();
}

function parseContainerStats(stats) {
  const {rxBytes, txBytes} = parseNetworks(stats);
  return {
    timestamp: parseTimestamp(stats?.read),
    cpuPercent: parseCpuPercent(stats),
    memoryUsageBytes: safeNumber(stats?.memory_stats?.usage),
    memoryLimitBytes: safeNumber(stats?.memory_stats?.limit),
    rxBytes,
    txBytes,
  };
}

export {DockerProvider, parseContainerStats};
