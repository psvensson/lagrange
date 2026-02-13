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

class DockerProvider {
  /**
   * @param {Object} config
   * @param {string} [config.socketPath] - Local Docker socket path
   * @param {string} [config.host] - Remote Docker host (tcp://host:port)
   */
  constructor(config = {}) {
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
    const network = await this._docker.createNetwork({
      Name: name,
      Driver: 'bridge',
      Labels: labels,
    });
    return {id: network.id, name};
  }

  /**
   * Build a Docker image from a Dockerfile.
   * Req 10.1, 10.3, 10.4
   * @param {string} contextPath - Build context directory
   * @param {string} tag - Image tag
   * @param {string} [dockerfile] - Dockerfile path relative to context
   * @returns {Promise<void>}
   */
  async buildImage(contextPath, tag, dockerfile = DOCKER_DEFAULTS.dockerfile) {
    let stream;
    try {
      stream = await this._docker.buildImage(
        {context: contextPath, src: ['.']},
        {t: tag, dockerfile},
      );
    } catch (err) {
      throw new Error(
        `Docker image build failed for tag "${tag}": ${err.message}`,
      );
    }
    const output = await this._collectBuildOutput(stream);
    const errorLine = output.find((line) => line.error);
    if (errorLine) {
      const buildLog = output
        .map((line) => line.stream || line.error || '')
        .join('');
      throw new Error(
        `Docker image build failed for tag "${tag}": ` +
        `${errorLine.error}\nBuild output:\n${buildLog}`,
      );
    }
  }

  /**
   * Collect build output from a Docker build stream.
   * @param {Object} stream - Docker build stream
   * @returns {Promise<Array<Object>>}
   */
  _collectBuildOutput(stream) {
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
    } = options;

    const envArray = this._buildEnvArray(env);
    const hostConfig = this._buildHostConfig(resourceLimits, network);

    const container = await this._docker.createContainer({
      name,
      Image: image,
      Env: envArray,
      Labels: labels,
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
      await container.start();
      await this._waitForRunning(containerId, startTimeout);
    } catch (err) {
      await this._cleanupFailedContainer(containerId);
      throw new Error(
        `Container "${name}" failed to start within ` +
        `${startTimeout}ms: ${err.message}`,
      );
    }

    const info = await this.inspectContainer(containerId);
    const ip = info.NetworkSettings?.Networks?.[network]?.IPAddress || '';

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
   * @returns {Object}
   */
  _buildHostConfig(resourceLimits, _network) {
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
    const container = this._docker.getContainer(containerId);
    await container.stop({t: STOP_TIMEOUT_SECONDS});
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
   * @returns {Promise<string>}
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
    return buffer.toString('utf8');
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
   * Remove a container and its associated volumes.
   * Req 1.5
   * @param {string} containerId
   */
  async removeContainer(containerId) {
    const container = this._docker.getContainer(containerId);
    await container.remove({force: true, v: true});
  }

  /**
   * Remove a network.
   * @param {string} networkId
   */
  async removeNetwork(networkId) {
    const network = this._docker.getNetwork(networkId);
    await network.remove();
  }

  /**
   * Disconnect a container from a network.
   * @param {string} networkId
   * @param {string} containerId
   */
  async disconnectFromNetwork(networkId, containerId) {
    const network = this._docker.getNetwork(networkId);
    await network.disconnect({Container: containerId, Force: true});
  }

  /**
   * Connect a container to a network.
   * @param {string} networkId
   * @param {string} containerId
   */
  async connectToNetwork(networkId, containerId) {
    const network = this._docker.getNetwork(networkId);
    await network.connect({Container: containerId});
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
   * Sleep helper.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

export {DockerProvider};
