/**
 * Admin test run service.
 * Owns distributed scenario discovery, run lifecycle control, and
 * saved-run inventory for HTTP admin ingress.
 */

import {spawn as spawnChildProcess, execFile as execFileNode} from 'node:child_process';
import {lookup as lookupDns} from 'node:dns/promises';
import {readdir, readFile, stat} from 'node:fs/promises';
import {basename, extname, join, resolve} from 'node:path';
import {URL} from 'node:url';
import {
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_RUN_PATH,
} from './admin-constants.js';
import {
  getContentType,
  resolveOutputAssetPath,
} from './admin-test-run-paths.js';
import {adminTestRunInventoryMethods} from './admin-test-run-inventory-methods.js';
import {adminTestRunLifecycleMethods} from './admin-test-run-lifecycle-methods.js';
import {buildAdminTestRunServiceHelpers} from './admin-test-run-service-helpers.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_128KJ = ', ';

const FILE_ENCODING = 'utf8';
const EMPTY_STRING = '';
const RUN_CONFIG_MODE = Object.freeze({LOCAL: 'local', REMOTE: 'remote'});
const CONFIG_PRECHECK_STATE = Object.freeze({
  INVALID_DOCKER_HOST: 'invalid_docker_host',
  LOCAL_READY: 'local_ready',
  REMOTE_HOST_RESOLVED: 'remote_host_resolved',
  REMOTE_READY: 'remote_ready',
  REMOTE_HOST_UNRESOLVABLE: 'remote_host_unresolvable',
});
const CONFIG_PRECHECK_ERROR_PREFIX =
  `${ADMIN_TEST_ERROR_MSG.CONFIG_PREFLIGHT_FAILED}: `;
const DOCKER_HOST_PROTOCOL_SEPARATOR = '://';
const DOCKER_HOST_PATH_SEPARATOR = '/';
const DOCKER_HOST_PORT_SEPARATOR = ':';
const DOCKER_HOST_IPV6_PREFIX = '[';
const DOCKER_HOST_IPV6_SUFFIX = ']';

const {
  buildConfigPrecheckOutcome,
  buildLocalConfigPrecheck,
  resolveConfigPrecheckState,
} = buildAdminTestRunServiceHelpers({
  ADMIN_TEST_ERROR_MSG,
  CONFIG_PRECHECK_STATE,
  FILE_ENCODING,
  RUN_CONFIG_MODE,
  readFile,
});

function defineAdminTestRunServiceMethods(targetPrototype, methodGroups) {
  for (const methods of methodGroups) {
    for (const [methodName, method] of Object.entries(methods)) {
      Object.defineProperty(targetPrototype, methodName, {
        configurable: true,
        value: method,
        writable: true,
      });
    }
  }
}

/**
 * Admin test run service.
 */
class AdminTestRunService {
  /**
   * @param {Object} [options]
   * @param {string} [options.workspaceRoot]
   * @param {Function} [options.spawnRunner]
   * @param {Function} [options.execFile]
   * @param {Function} [options.resolveHost]
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    this.workspaceRoot = resolve(options.workspaceRoot || process.cwd());
    this.spawnRunner = options.spawnRunner || spawnChildProcess;
    this.execFile = options.execFile || execFileNode;
    this.resolveHost = options.resolveHost || lookupDns;
    this.now = options.now || (() => Date.now());

    this.scenariosDir = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.SCENARIOS_DIR,
    );
    this.configDir = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.CONFIG_DIR,
    );
    this.runScript = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.RUNNER_SCRIPT,
    );
    this.outputDir = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.OUTPUT_DIR,
    );
    this.metadataDir = resolve(
      this.outputDir,
      ADMIN_TEST_RUN_PATH.METADATA_DIR,
    );
    this.dashboardPath = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.DASHBOARD_PAGE,
    );
    this.playbackViewerPath = resolve(
      this.workspaceRoot,
      ADMIN_TEST_RUN_PATH.PLAYBACK_VIEWER,
    );

    /** @type {Map<string, Object>} */
    this.runs = new Map();
  }

  /**
   * List available distributed scenarios.
   * @return {Promise<Array<Object>>}
   */
  async listAvailableTests() {
    const entries = await this.tryReadDirectory(this.scenariosDir);
    return entries
      .filter((entry) => entry.isFile() &&
        extname(entry.name) === ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION)
      .map((entry) => ({
        id: basename(entry.name, ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION),
        file: join(
          ADMIN_TEST_RUN_PATH.SCENARIOS_DIR,
          entry.name,
        ),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * List available test config files.
   * @return {Promise<Array<Object>>}
   */
  async listAvailableConfigs() {
    const entries = await this.tryReadDirectory(this.configDir);
    return entries
      .filter((entry) => entry.isFile() &&
        extname(entry.name) === ADMIN_TEST_DEFAULT.CONFIG_EXTENSION)
      .map((entry) => ({
        id: entry.name,
        file: join(
          ADMIN_TEST_RUN_PATH.CONFIG_DIR,
          entry.name,
        ),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Parse one config JSON file under distributed config directory.
   * @param {string} configName
   * @return {Promise<Object>}
   * @private
   */
  async readConfigPayload(configName) {
    const configPath = resolve(this.configDir, configName);
    let raw = EMPTY_STRING;
    try {
      raw = await readFile(configPath, FILE_ENCODING);
    } catch (error) {
      throw new Error(
        `${CONFIG_PRECHECK_ERROR_PREFIX}` +
        `unable to read config "${configName}": ${error.message}`,
      );
    }

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === LOCAL_STR_OBJECT ? parsed : {};
    } catch (error) {
      throw new Error(
        `${CONFIG_PRECHECK_ERROR_PREFIX}` +
        `config "${configName}" is not valid JSON: ${error.message}`,
      );
    }
  }

  /**
   * Parse hostname from docker host target.
   * @param {string} dockerHost
   * @return {string|null}
   * @private
   */
  parseDockerHostname(dockerHost) {
    const value = String(dockerHost || EMPTY_STRING).trim();
    if (!value) {
      return null;
    }

    if (value.includes(DOCKER_HOST_PROTOCOL_SEPARATOR)) {
      try {
        const parsed = new URL(value);
        return parsed.hostname || null;
      } catch (_error) {
        return null;
      }
    }

    const firstSegment = value.split(DOCKER_HOST_PATH_SEPARATOR, 1)[0];
    if (!firstSegment) {
      return null;
    }
    if (firstSegment.startsWith(DOCKER_HOST_IPV6_PREFIX)) {
      const suffixIndex = firstSegment.indexOf(DOCKER_HOST_IPV6_SUFFIX);
      if (suffixIndex > LOCAL_NUM_ONE) {
        return firstSegment.slice(LOCAL_NUM_ONE, suffixIndex);
      }
      return null;
    }

    const firstSeparator = firstSegment.indexOf(DOCKER_HOST_PORT_SEPARATOR);
    const lastSeparator = firstSegment.lastIndexOf(DOCKER_HOST_PORT_SEPARATOR);
    if (firstSeparator >= LOCAL_NUM_ZERO && firstSeparator === lastSeparator) {
      return firstSegment.slice(LOCAL_NUM_ZERO, lastSeparator) || null;
    }
    return firstSegment;
  }

  /**
   * Run config precheck and resolve Docker target summary.
   * @param {string} configName
   * @return {Promise<Object>}
   * @private
   */
  async precheckConfig(configName) {
    const config = await this.readConfigPayload(configName);
    const docker = config?.docker || {};
    const hosts = Array.isArray(docker.hosts) ?
      docker.hosts
        .map((entry) => String(entry || EMPTY_STRING).trim())
        .filter((entry) => Boolean(entry)) :
      [];

    if (hosts.length === LOCAL_NUM_ZERO) {
      return buildLocalConfigPrecheck(
        String(docker.socketPath || EMPTY_STRING).trim() || null,
      );
    }

    const observations = [];
    for (const host of hosts) {
      observations.push(await this.resolveRemoteDockerHostObservation(host));
    }

    const precheckState = resolveConfigPrecheckState(observations);
    const outcome = buildConfigPrecheckOutcome({
      configName,
      hosts,
      observations,
      precheckState,
    });
    if (outcome.error) {
      throw outcome.error;
    }
    return outcome.precheck;
  }

  /**
   * Resolve one remote docker-host observation for config precheck.
   * @param {string} host
   * @return {Promise<Object>}
   * @private
   */
  async resolveRemoteDockerHostObservation(host) {
    const hostname = this.parseDockerHostname(host);
    if (!hostname) {
      return Object.freeze({
        state: CONFIG_PRECHECK_STATE.INVALID_DOCKER_HOST,
        host,
      });
    }
    try {
      await this.resolveHost(hostname);
      return Object.freeze({
        state: CONFIG_PRECHECK_STATE.REMOTE_HOST_RESOLVED,
        host,
        hostname,
      });
    } catch (error) {
      return Object.freeze({
        state: CONFIG_PRECHECK_STATE.REMOTE_HOST_UNRESOLVABLE,
        host,
        hostname,
        message: error.message,
      });
    }
  }

  /**
   * Render config precheck summary line for run logs.
   * @param {Object} precheck
   * @param {string} configName
   * @return {string}
   * @private
   */
  formatPrecheckSummary(precheck, configName) {
    if (precheck?.mode === RUN_CONFIG_MODE.REMOTE) {
      return `[preflight] config "${configName}" resolved ` +
        `${precheck.hosts.length} docker host(s): ${precheck.hosts.join(LOCAL_STR_128KJ)}`;
    }
    const socketPath = precheck?.socketPath || 'default docker socket';
    return `[preflight] config "${configName}" using local socket "${socketPath}"`;
  }

  /**
   * Read dashboard HTML page.
   * @return {Promise<string>}
   */
  async readDashboardPage() {
    return readFile(this.dashboardPath, FILE_ENCODING);
  }

  /**
   * Read playback viewer HTML.
   * @return {Promise<string>}
   */
  async readPlaybackViewer() {
    return readFile(this.playbackViewerPath, FILE_ENCODING);
  }

  /**
   * Resolve a relative path inside test-output.
   * @param {string} wildcardPath
   * @return {string|null}
   */
  resolveOutputAssetPath(wildcardPath) {
    return resolveOutputAssetPath(wildcardPath, this.outputDir);
  }

  /**
   * Guess HTTP content type by filename extension.
   * @param {string} filePath
   * @return {string}
   */
  getContentType(filePath) {
    return getContentType(filePath);
  }

  /**
   * Read and return an output file payload.
   * @param {string} wildcardPath
   * @return {Promise<{contentType: string, body: Buffer}|null>}
   */
  async readOutputAsset(wildcardPath) {
    const filePath = this.resolveOutputAssetPath(wildcardPath);
    if (!filePath) {
      return null;
    }

    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        return null;
      }
      const body = await readFile(filePath);
      return {
        contentType: this.getContentType(filePath),
        body,
      };
    } catch {
      return null;
    }
  }

  /**
   * Safely read directory entries.
   * @param {string} dirPath
   * @return {Promise<Array<import('node:fs').Dirent>>}
   * @private
   */
  async tryReadDirectory(dirPath) {
    try {
      return await readdir(dirPath, {withFileTypes: true});
    } catch {
      return [];
    }
  }
}

defineAdminTestRunServiceMethods(AdminTestRunService.prototype, [
  adminTestRunInventoryMethods,
  adminTestRunLifecycleMethods,
]);

export {AdminTestRunService};
