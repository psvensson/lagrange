/**
 * Standalone userland server for distributed test run administration.
 * Reuses AdminTestRunService and AdminWebSocketAPI HTTP routes while
 * disabling the legacy admin WebSocket stream.
 */

import {resolve} from 'node:path';
import {AdminWebSocketAPI} from './admin-websocket-api.js';
import {AdminTestRunService} from './admin-test-run-service.js';
import {ADMIN_STANDALONE_DEFAULT} from './admin-constants.js';

const LOCAL_NUM_ZERO = 0;

const URL_PROTOCOL = 'http://';

/**
 * Parse port input with fallback.
 * @param {number|string|undefined} value
 * @param {number} fallback
 * @return {number}
 */
function parsePort(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= LOCAL_NUM_ZERO) {
    return fallback;
  }
  return parsed;
}

/**
 * Build server base URL.
 * @param {string} host
 * @param {number} port
 * @return {string}
 */
function buildServerUrl(host, port) {
  return `${URL_PROTOCOL}${host}:${port}`;
}

/**
 * Standalone test-run server wrapper.
 */
class StandaloneTestRunServer {
  /**
   * @param {Object} [options]
   * @param {string} [options.workspaceRoot]
   * @param {string} [options.host]
   * @param {number|string} [options.port]
   * @param {string} [options.nodeId]
   * @param {AdminTestRunService} [options.testRunService]
   * @param {AdminWebSocketAPI} [options.adminApi]
   */
  constructor(options = {}) {
    this.workspaceRoot = resolve(options.workspaceRoot || process.cwd());
    this.host = options.host || ADMIN_STANDALONE_DEFAULT.HOST;
    this.port = parsePort(options.port, ADMIN_STANDALONE_DEFAULT.PORT);
    this.nodeId = options.nodeId || ADMIN_STANDALONE_DEFAULT.NODE_ID;

    this.testRunService = options.testRunService || new AdminTestRunService({
      workspaceRoot: this.workspaceRoot,
    });
    this.adminApi = options.adminApi || new AdminWebSocketAPI({
      nodeId: this.nodeId,
      testRunService: this.testRunService,
      enableAdminStream: false,
    });
    this.started = false;
  }

  /**
   * Start the standalone server.
   * @param {Object} [options]
   * @param {boolean} [options.listen]
   * @return {Promise<Object>}
   */
  async start(options = {}) {
    if (!this.started) {
      await this.adminApi.initialize(this.port, {
        listen: options.listen,
        host: this.host,
      });
      this.started = true;
    }
    return this.getInfo();
  }

  /**
   * Stop the standalone server.
   * @return {Promise<void>}
   */
  async stop() {
    await this.adminApi.shutdown();
    this.started = false;
  }

  /**
   * Get server info.
   * @return {Object}
   */
  getInfo() {
    return {
      host: this.host,
      port: this.port,
      workspaceRoot: this.workspaceRoot,
      url: buildServerUrl(this.host, this.port),
      dashboardUrl: `${buildServerUrl(this.host, this.port)}/`,
      started: this.started,
    };
  }

  /**
   * Expose Fastify instance.
   * @return {Object}
   */
  getFastify() {
    return this.adminApi.getFastify();
  }
}

/**
 * Factory helper.
 * @param {Object} [options]
 * @return {StandaloneTestRunServer}
 */
function createStandaloneTestRunServer(options = {}) {
  return new StandaloneTestRunServer(options);
}

export {
  StandaloneTestRunServer,
  createStandaloneTestRunServer,
  parsePort,
  buildServerUrl,
};
