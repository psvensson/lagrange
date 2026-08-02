/**
 * Docker Provider — wraps dockerode for container lifecycle management.
 * Supports both local (Unix socket) and remote (TCP) Docker daemon connections.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1, 10.3, 10.4
 */

import Docker from 'dockerode';
import {createWriteStream, readdirSync} from 'node:fs';
import path from 'node:path';
import {Writable} from 'node:stream';
import {
  PORTS,
  TIMEOUTS,
  DOCKER_DEFAULTS,
  RESOURCE_DEFAULTS,
  CONTAINER_LOG_TAIL_LINES,
} from './constants.js';
const localText = Object.freeze({
  HTTP: 'http',
  HTTPS: 'https',
  STARTING: 'starting',
  COMPLETED: 'completed',
  REUSED: 'reused',
  FAILED: 'failed',
  END: 'end',
  UTF8: 'utf8',
  ERROR: 'error',
  FINISH: 'finish',
  DATA: 'data',
  NEWLINE: '\n',
  READ: 'read',
  WRITE: 'write',
  CONTAINER_STORAGE_USAGE_INVALID:
    'Container storage usage was not a safe byte count',
});


const CONTAINER_RUNNING_STATE = 'running';
const START_POLL_INTERVAL_MS = 250;
// CL-030: docker's SIGTERM->SIGKILL grace MUST exceed the app's graceful-drain
// budget (READINESS_DRAIN_DEADLINE_MS = 10s, src/constants/entrypoint.js) plus the
// worst-case shutdown await chain, or a clean drain races the kill and the node
// force-exits 1 (classified as unexpected_node_exit). Measured clean-drain timings
// (Shutdown step timing logs) are normally <600ms but the two control-plane writes
// publishNodeShutdownStatus (~5.5s) and shutdownLogsTablePersistence (~6.8s) can
// stack to ~12s under rolling-restart churn. 25s gives comfortable headroom while
// staying bounded — docker stop returns the instant the process exits, so fast
// drains pay nothing; only a slow drain uses the extra grace.
const STOP_TIMEOUT_SECONDS = 25;
const PERCENT_MULTIPLIER = 100;
const MIN_CPU_COUNT = 1;
const ZERO = 0;
const DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH =
  'docker-container-writable-layer';
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
const CONTAINER_LOG_ERROR_STRING_TOO_LONG = 'ERR_STRING_TOO_LONG';
const UTF8_ENCODING = 'utf8';
const NETWORK_EXISTS_ERROR_PATTERN = 'already exists';
const NETWORK_LIST_FILTER_NAME = 'name';
const DOCKER_NOT_FOUND_STATUS = 404;
const STORAGE_USAGE_COMMAND = 'du';
const STORAGE_USAGE_BYTES_FLAG = '-sb';
const STORAGE_USAGE_ARGUMENT_SEPARATOR = '--';
const STORAGE_USAGE_FIELD_SEPARATOR = '\t';
const STORAGE_USAGE_BYTE_COUNT_PATTERN = /^(?:0|[1-9]\d*)$/u;
const STORAGE_LIMIT_PATTERN = /(?:^|,)size=(\d+)(?:,|$)/u;
const BUILD_SOURCE_DIRECTORY = 'src';
const CONTAINER_COMMAND_FIELD = 'Cmd';
const CONTAINER_ENTRYPOINT_FIELD = 'Entrypoint';
const HOST_NETWORK_MODE = 'host';
// dockerode already receives an explicit allowlist. Sending .dockerignore in
// that tar makes its broad `**` rule remove the recursively requested src
// directory before the daemon can apply the later negations.
const BUILD_CONTEXT_STATIC_ENTRIES = Object.freeze([
  'package-lock.json',
  'package.json',
]);

function appendBuildContextDirectoryFiles(entries, contextPath, relativePath) {
  const directory = path.join(contextPath, relativePath);
  let directoryEntries;
  try {
    directoryEntries = readdirSync(directory, {withFileTypes: true});
  } catch {
    entries.push(relativePath);
    return;
  }
  for (let index = 0; index < directoryEntries.length; index += 1) {
    const entry = directoryEntries[index];
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      appendBuildContextDirectoryFiles(entries, contextPath, child);
    } else {
      entries.push(child);
    }
  }
}

function buildImageContext(contextPath, dockerfile) {
  const requested = [
    ...BUILD_CONTEXT_STATIC_ENTRIES,
    dockerfile,
  ];
  appendBuildContextDirectoryFiles(
    requested,
    contextPath,
    BUILD_SOURCE_DIRECTORY,
  );
  const entries = Array.from(new Set(
    requested.filter(
      (entry) => typeof entry === 'string' && entry.length > ZERO,
    ),
  ))
    .sort();

  return {
    context: contextPath,
    src: entries,
  };
}

function normalizeContainerOptions(options) {
  return {
    name: options.name,
    image: options.image,
    network: options.network,
    env: options.env ?? {},
    labels: options.labels ?? {},
    resourceLimits: options.resourceLimits ?? {},
    startTimeout: options.startTimeout ?? TIMEOUTS.NODE_STARTUP,
    command: options.command ?? null,
    entrypoint: options.entrypoint ?? null,
    hostConfigExtras: options.hostConfigExtras ?? null,
    hostNetwork: options.hostNetwork === true,
  };
}

function optionalContainerArray(value, key) {
  return Array.isArray(value) && value.length > ZERO ?
    {[key]: value} :
    {};
}

function containerAliases(name) {
  return typeof name === 'string' && name.length > ZERO ? [name] : [];
}

function containerCreateOptions(options, envArray, hostConfig) {
  if (options.hostNetwork) {
    // Host-network mode: the container shares the host's network namespace.
    // There is no per-container bridge, so ExposedPorts and NetworkingConfig
    // (bridge endpoints, DNS aliases) do not apply and must be omitted.
    return {
      name: options.name,
      Image: options.image,
      Env: envArray,
      Labels: options.labels,
      ...optionalContainerArray(
        options.entrypoint,
        CONTAINER_ENTRYPOINT_FIELD,
      ),
      ...optionalContainerArray(options.command, CONTAINER_COMMAND_FIELD),
      HostConfig: {
        ...hostConfig,
        NetworkMode: HOST_NETWORK_MODE,
      },
    };
  }
  return {
    name: options.name,
    Image: options.image,
    Env: envArray,
    Labels: options.labels,
    ...optionalContainerArray(
      options.entrypoint,
      CONTAINER_ENTRYPOINT_FIELD,
    ),
    ...optionalContainerArray(options.command, CONTAINER_COMMAND_FIELD),
    ExposedPorts: {
      [`${PORTS.REST}/tcp`]: {},
      [`${PORTS.ADMIN_API}/tcp`]: {},
      [`${PORTS.WS_TRANSPORT}/tcp`]: {},
    },
    HostConfig: hostConfig,
    NetworkingConfig: {
      EndpointsConfig: {
        [options.network]: {
          Aliases: containerAliases(options.name),
        },
      },
    },
  };
}

function normalizeContainerLogOptions(options) {
  const hasTailOverride =
    options.tail !== undefined &&
    options.tail !== null;
  const normalizedTail = hasTailOverride ?
    String(Math.max(ZERO, Math.floor(Number(options.tail) || ZERO))) :
    null;
  const logOptions = {
    stdout: true,
    stderr: true,
    follow: false,
  };
  if (normalizedTail !== null) logOptions.tail = normalizedTail;
  if (options.timestamps) logOptions.timestamps = true;
  if (options.since) logOptions.since = options.since;
  return {logOptions, normalizedTail};
}

class DockerProvider {
  /**
   * @param {Object} config
   * @param {string} [config.socketPath] - Local Docker socket path
   * @param {string} [config.host] - Remote Docker host (tcp://host:port)
   * @param {{ca: string, cert: string, key: string}} [config.tls] - Client
   *   TLS material for mutual-auth daemons. When present the connection uses
   *   HTTPS and presents the client certificate; when absent it uses plain
   *   HTTP (only acceptable against daemons that themselves accept it).
   */
  constructor(config = {}) {
    this._operationSink = typeof config.operationSink === TYPEOF_FUNCTION ?
      config.operationSink :
      null;
    if (config.host) {
      const {hostname, port} = this._parseTcpHost(config.host);
      const tls = config.tls;
      // Fail fast on a partially-specified TLS object rather than silently
      // downgrading to plain HTTP (which a tlsverify daemon would refuse with
      // an opaque ECONNRESET long after the misconfiguration was made).
      if (tls && !(tls.ca && tls.cert && tls.key)) {
        throw new Error(
          'DockerProvider config.tls requires ca, cert, and key; got a ' +
          'partial TLS object',
        );
      }
      const useTls = Boolean(tls);
      this._docker = new Docker({
        host: hostname,
        port: port,
        protocol: useTls ? localText.HTTPS : localText.HTTP,
        ...(useTls ? {ca: tls.ca, cert: tls.cert, key: tls.key} : {}),
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
      stage: localText.STARTING,
      name,
      labels,
    });
    const network = await this._docker.createNetwork({
      Name: name,
      Driver: 'bridge',
      Labels: labels,
    });
    this._emitOperation(DOCKER_OP_CREATE_NETWORK, {
      stage: localText.COMPLETED,
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
        stage: localText.REUSED,
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
      stage: localText.STARTING,
      contextPath,
      tag,
      dockerfile,
      labels,
    });
    let stream;
    try {
      stream = await this._docker.buildImage(
        buildImageContext(contextPath, dockerfile),
        {t: tag, dockerfile, labels},
      );
    } catch (err) {
      this._emitOperation(DOCKER_OP_BUILD_IMAGE, {
        stage: localText.FAILED,
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
        stage: localText.FAILED,
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
      stage: localText.COMPLETED,
      contextPath,
      tag,
      dockerfile,
      labels,
    });
  }

  /**
   * Export an image as a tarball to a local file path (docker save).
   * @param {string} tag - Image tag to export
   * @param {string} destinationPath - Local file path to write the tarball to
   * @returns {Promise<void>}
   */
  async saveImage(tag, destinationPath) {
    const stream = await this._docker.getImage(tag).get();
    await new Promise((resolvePromise, rejectPromise) => {
      const file = createWriteStream(destinationPath);
      stream.pipe(file);
      stream.on(localText.ERROR, rejectPromise);
      file.on(localText.ERROR, rejectPromise);
      file.on(localText.FINISH, resolvePromise);
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
    const normalized = normalizeContainerOptions(options);
    const {
      name,
      image,
      network,
      startTimeout,
    } = normalized;

    this._emitOperation(DOCKER_OP_CREATE_CONTAINER, {
      stage: localText.STARTING,
      name,
      image,
      network,
      startTimeout,
    });
    const envArray = this._buildEnvArray(normalized.env);
    const hostConfig = this._buildHostConfig(
      normalized.resourceLimits,
      network,
      normalized.hostConfigExtras,
    );

    const container = await this._docker.createContainer(
      containerCreateOptions(normalized, envArray, hostConfig),
    );

    const containerId = container.id;
    await this._startCreatedContainer({
      container,
      containerId,
      name,
      startTimeout,
    });
    return this._createdContainerResult({
      containerId,
      name,
      image,
      network,
      hostNetwork: normalized.hostNetwork,
    });
  }

  async _startCreatedContainer({
    container,
    containerId,
    name,
    startTimeout,
  }) {
    try {
      this._emitOperation(DOCKER_OP_START_CONTAINER, {
        stage: localText.STARTING,
        name,
        containerId,
        startTimeout,
      });
      await container.start();
      await this._waitForRunning(containerId, startTimeout);
      this._emitOperation(DOCKER_OP_START_CONTAINER, {
        stage: localText.COMPLETED,
        name,
        containerId,
      });
    } catch (err) {
      await this._cleanupFailedContainer(containerId);
      this._emitOperation(DOCKER_OP_START_CONTAINER, {
        stage: localText.FAILED,
        name,
        containerId,
        error: err.message,
      });
      throw new Error(
        `Container "${name}" failed to start within ` +
        `${startTimeout}ms: ${err.message}`,
      );
    }
  }

  async _createdContainerResult({
    containerId,
    name,
    image,
    network,
    hostNetwork,
  }) {
    const info = await this.inspectContainer(containerId);
    const networks = info.NetworkSettings?.Networks || {};
    const namedEndpoint = networks[network];
    const firstEndpoint = Object.values(networks)[ZERO];
    // Host-network containers have no bridge IP; the caller substitutes the
    // host's reachable address instead.
    const ip = hostNetwork ?
      '' :
      (namedEndpoint?.IPAddress || firstEndpoint?.IPAddress || '');

    this._emitOperation(DOCKER_OP_CREATE_CONTAINER, {
      stage: localText.COMPLETED,
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
        tail: CONTAINER_LOG_TAIL_LINES,
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
      stage: localText.STARTING,
      containerId,
    });
    const container = this._docker.getContainer(containerId);
    await container.stop({t: STOP_TIMEOUT_SECONDS});
    this._emitOperation(DOCKER_OP_STOP_CONTAINER, {
      stage: localText.COMPLETED,
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
      stage: localText.STARTING,
      containerId,
      startTimeout,
    });
    const container = this._docker.getContainer(containerId);
    await container.start();
    await this._waitForRunning(containerId, startTimeout);
    this._emitOperation(DOCKER_OP_START_CONTAINER, {
      stage: localText.COMPLETED,
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
      stream.on(localText.END, () => {
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString(localText.UTF8),
          stderr: Buffer.concat(stderrChunks).toString(localText.UTF8),
        });
      });
      stream.on(localText.ERROR, reject);
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
    const {logOptions, normalizedTail} =
      normalizeContainerLogOptions(options);
    const buffer = await this._readContainerLogs({
      container,
      containerId,
      options,
      logOptions,
      normalizedTail,
    });
    if (options[CONTAINER_LOG_OPTION_RAW_BUFFER] === true) return buffer;
    return buffer.toString(UTF8_ENCODING);
  }

  async _readContainerLogs({
    container,
    containerId,
    options,
    logOptions,
    normalizedTail,
  }) {
    let buffer;
    try {
      buffer = await container.logs(logOptions);
    } catch (error) {
      const isStringTooLongError = error?.code ===
        CONTAINER_LOG_ERROR_STRING_TOO_LONG;
      if (isStringTooLongError && normalizedTail === null) {
        return this.getContainerLogs(containerId, {
          ...options,
          tail: CONTAINER_LOG_TAIL_LINES,
        });
      }
      throw error;
    }
    return buffer;
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
      stream.on(localText.DATA, (chunk) => {
        callback(chunk.toString(localText.UTF8));
      });
      stream.on(localText.ERROR, (_err) => {
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
   * Follow a container's logs as a demultiplexed, line-oriented stream with
   * Docker-side timestamps. Unlike the one-shot getContainerLogs (which can only
   * return what the json-file driver retained — and that driver stalls under a
   * busy writer), a live follower continuously DRAINS the container's stdout pipe,
   * which is what prevents the daemon-side stall that silently truncates busy
   * nodes. timestamps:true prefixes every line with an RFC3339Nano time, giving
   * the caller both a `since` cursor for clean re-attach (across container
   * restarts) and a last-activity signal for completeness checks.
   *
   * @param {string} containerId
   * @param {Object} opts
   * @param {number|string} [opts.since] Unix-second/duration `since` cursor.
   * @param {(rfc3339: string, payload: string) => void} opts.onLine Per decoded
   *   line: the leading Docker timestamp and the remaining payload (the raw app
   *   log line, e.g. a pino JSON object).
   * @param {() => void} [opts.onEnd] Stream ended (container stopped/restarted).
   * @param {(err: Error) => void} [opts.onError]
   * @return {{stop: () => void}}
   */
  followContainerLogStream(containerId, opts = {}) {
    const container = this._docker.getContainer(containerId);
    const onLine = typeof opts.onLine === 'function' ? opts.onLine : () => {};
    let stream = null;
    let stopped = false;
    let pending = '';

    const emitLine = (rawLine) => {
      if (rawLine.length === 0) {
        return;
      }
      const spaceIdx = rawLine.indexOf(' ');
      if (spaceIdx <= 0) {
        onLine('', rawLine);
        return;
      }
      onLine(rawLine.slice(0, spaceIdx), rawLine.slice(spaceIdx + 1));
    };
    const sink = new Writable({
      write(chunk, _enc, cb) {
        pending += chunk.toString('utf8');
        let nlIdx = pending.indexOf(localText.NEWLINE);
        while (nlIdx !== -1) {
          emitLine(pending.slice(0, nlIdx));
          pending = pending.slice(nlIdx + 1);
          nlIdx = pending.indexOf('\n');
        }
        cb();
      },
    });
    const flushPending = () => {
      if (pending.length > 0) {
        emitLine(pending);
        pending = '';
      }
    };

    const logOpts = {
      follow: true,
      stdout: true,
      stderr: true,
      timestamps: true,
    };
    if (opts.since) {
      logOpts.since = opts.since;
    }
    container
      .logs(logOpts)
      .then((s) => {
        if (stopped) {
          s.destroy();
          return;
        }
        stream = s;
        this._docker.modem.demuxStream(stream, sink, sink);
        stream.on(localText.END, () => {
          flushPending();
          if (!stopped && typeof opts.onEnd === 'function') {
            opts.onEnd();
          }
        });
        stream.on(localText.ERROR, (err) => {
          // Preserve any final partial line before the capture owner writes an
          // incarnation boundary in response to this detach edge.
          flushPending();
          if (!stopped && typeof opts.onError === 'function') {
            opts.onError(err);
          }
        });
      })
      .catch((err) => {
        if (!stopped && typeof opts.onError === 'function') {
          opts.onError(err);
        }
      });

    return {
      stop: () => {
        stopped = true;
        flushPending();
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
   * Capture cumulative runtime counters, enforced limits, and storage usage.
   * @param {string} containerId
   * @param {string|null} storagePath
   * @returns {Promise<Object>}
   */
  async getContainerResourceSnapshot(containerId, storagePath = null) {
    const container = this._docker.getContainer(containerId);
    const stats = await container.stats({stream: false});
    const inspect = await container.inspect({size: true});
    const storageUsageBytes =
      storagePath === null ||
      storagePath === DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH ?
        safeNumber(inspect?.SizeRw) :
        await this._getContainerPathUsage(containerId, storagePath);
    return {
      ...parseContainerStats(stats),
      cpuLimitNanoCpus: safeNumber(inspect?.HostConfig?.NanoCpus),
      storageLimitBytes: parseTmpfsStorageLimit(
        inspect?.HostConfig?.Tmpfs,
        storagePath,
      ),
      storageUsageBytes,
    };
  }

  async _getContainerPathUsage(containerId, storagePath) {
    const result = await this.execInContainer(containerId, [
      STORAGE_USAGE_COMMAND,
      STORAGE_USAGE_BYTES_FLAG,
      STORAGE_USAGE_ARGUMENT_SEPARATOR,
      storagePath,
    ]);
    if (result.exitCode !== ZERO) {
      throw new Error(`Container storage usage failed: ${result.stderr}`);
    }
    const output = result.stdout;
    const record = typeof output === 'string' &&
      output.endsWith(localText.NEWLINE) ?
      output.slice(ZERO, -1) :
      '';
    const separatorIndex = record.indexOf(STORAGE_USAGE_FIELD_SEPARATOR);
    const reportedPath = separatorIndex === -1 ?
      '' :
      record.slice(separatorIndex + 1);
    const numericText = separatorIndex === -1 ?
      '' :
      record.slice(ZERO, separatorIndex);
    const usage = Number(numericText);
    if (
      record.includes(localText.NEWLINE) ||
      reportedPath !== storagePath ||
      !STORAGE_USAGE_BYTE_COUNT_PATTERN.test(numericText) ||
      !Number.isSafeInteger(usage) ||
      usage < ZERO
    ) {
      throw new Error(localText.CONTAINER_STORAGE_USAGE_INVALID);
    }
    return usage;
  }

  /**
   * Remove a container and its associated volumes.
   * Req 1.5
   * @param {string} containerId
   */
  async removeContainer(containerId) {
    this._emitOperation(DOCKER_OP_REMOVE_CONTAINER, {
      stage: localText.STARTING,
      containerId,
    });
    const container = this._docker.getContainer(containerId);
    await container.remove({force: true, v: true});
    this._emitOperation(DOCKER_OP_REMOVE_CONTAINER, {
      stage: localText.COMPLETED,
      containerId,
    });
  }

  /**
   * Remove a network.
   * @param {string} networkId
   */
  async removeNetwork(networkId) {
    this._emitOperation(DOCKER_OP_REMOVE_NETWORK, {
      stage: localText.STARTING,
      networkId,
    });
    const network = this._docker.getNetwork(networkId);
    await network.remove();
    this._emitOperation(DOCKER_OP_REMOVE_NETWORK, {
      stage: localText.COMPLETED,
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
      stage: localText.STARTING,
      networkId,
      containerId,
    });
    const network = this._docker.getNetwork(networkId);
    await network.disconnect({Container: containerId, Force: true});
    this._emitOperation(DOCKER_OP_DISCONNECT_NETWORK, {
      stage: localText.COMPLETED,
      networkId,
      containerId,
    });
  }

  /**
   * Connect a container to a network.
   * @param {string} networkId
   * @param {string} containerId
   * @param {Array<string>} [aliases]
   */
  async connectToNetwork(networkId, containerId, aliases = []) {
    this._emitOperation(DOCKER_OP_CONNECT_NETWORK, {
      stage: localText.STARTING,
      networkId,
      containerId,
      aliases,
    });
    const network = this._docker.getNetwork(networkId);
    const normalizedAliases = Array.isArray(aliases) ?
      aliases.filter((alias) => typeof alias === 'string' && alias.length > ZERO) :
      [];
    await network.connect({
      Container: containerId,
      ...(normalizedAliases.length > ZERO ?
        {
          EndpointConfig: {
            Aliases: normalizedAliases,
          },
        } :
        {}),
    });
    this._emitOperation(DOCKER_OP_CONNECT_NETWORK, {
      stage: localText.COMPLETED,
      networkId,
      containerId,
      aliases: normalizedAliases,
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
    } catch (error) {
      const statusCode =
        error?.statusCode ?? error?.response?.statusCode ?? null;
      if (statusCode === DOCKER_NOT_FOUND_STATUS) return null;
      throw error;
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

function parseTmpfsStorageLimit(tmpfs, storagePath) {
  if (
    storagePath === null ||
    !tmpfs ||
    typeof tmpfs !== 'object' ||
    typeof tmpfs[storagePath] !== 'string'
  ) {
    return ZERO;
  }
  const match = STORAGE_LIMIT_PATTERN.exec(tmpfs[storagePath]);
  return match ? safeNumber(match[1]) : ZERO;
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

function parseRecursiveIoEntries(entries) {
  const result = {read: ZERO, write: ZERO};
  if (!Array.isArray(entries)) return result;
  for (const entry of entries) {
    const operation =
      typeof entry?.op === 'string' ? entry.op.toLowerCase() : '';
    if (operation === localText.READ) {
      result.read += safeNumber(entry.value);
    } else if (operation === localText.WRITE) {
      result.write += safeNumber(entry.value);
    }
  }
  return result;
}

function parseBlockIo(stats) {
  const blockIo = stats?.blkio_stats || {};
  const bytes = parseRecursiveIoEntries(
    blockIo.io_service_bytes_recursive,
  );
  const operations = parseRecursiveIoEntries(
    blockIo.io_serviced_recursive,
  );
  return {
    blockReadBytes: bytes.read,
    blockWriteBytes: bytes.write,
    blockReadOperations: operations.read,
    blockWriteOperations: operations.write,
  };
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
  const blockIo = parseBlockIo(stats);
  return {
    timestamp: parseTimestamp(stats?.read),
    cpuPercent: parseCpuPercent(stats),
    cpuUsageNanoseconds:
      safeNumber(stats?.cpu_stats?.cpu_usage?.total_usage),
    memoryUsageBytes: safeNumber(stats?.memory_stats?.usage),
    memoryLimitBytes: safeNumber(stats?.memory_stats?.limit),
    pids: safeNumber(stats?.pids_stats?.current),
    rxBytes,
    txBytes,
    ...blockIo,
  };
}

export {
  DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
  DockerProvider,
  parseContainerStats,
};
