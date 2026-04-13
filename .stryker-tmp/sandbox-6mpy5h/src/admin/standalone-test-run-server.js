/**
 * Standalone userland server for distributed test run administration.
 * Reuses AdminTestRunService and AdminWebSocketAPI HTTP routes while
 * disabling the legacy admin WebSocket stream.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { resolve } from 'node:path';
import { AdminWebSocketAPI } from './admin-websocket-api.js';
import { AdminTestRunService } from './admin-test-run-service.js';
import { ADMIN_STANDALONE_DEFAULT } from './admin-constants.js';
const URL_PROTOCOL = stryMutAct_9fa48("10932") ? "" : (stryCov_9fa48("10932"), 'http://');

/**
 * Parse port input with fallback.
 * @param {number|string|undefined} value
 * @param {number} fallback
 * @return {number}
 */
function parsePort(value, fallback) {
  if (stryMutAct_9fa48("10933")) {
    {}
  } else {
    stryCov_9fa48("10933");
    const parsed = Number(value);
    if (stryMutAct_9fa48("10936") ? !Number.isInteger(parsed) && parsed <= 0 : stryMutAct_9fa48("10935") ? false : stryMutAct_9fa48("10934") ? true : (stryCov_9fa48("10934", "10935", "10936"), (stryMutAct_9fa48("10937") ? Number.isInteger(parsed) : (stryCov_9fa48("10937"), !Number.isInteger(parsed))) || (stryMutAct_9fa48("10940") ? parsed > 0 : stryMutAct_9fa48("10939") ? parsed < 0 : stryMutAct_9fa48("10938") ? false : (stryCov_9fa48("10938", "10939", "10940"), parsed <= 0)))) {
      if (stryMutAct_9fa48("10941")) {
        {}
      } else {
        stryCov_9fa48("10941");
        return fallback;
      }
    }
    return parsed;
  }
}

/**
 * Build server base URL.
 * @param {string} host
 * @param {number} port
 * @return {string}
 */
function buildServerUrl(host, port) {
  if (stryMutAct_9fa48("10942")) {
    {}
  } else {
    stryCov_9fa48("10942");
    return stryMutAct_9fa48("10943") ? `` : (stryCov_9fa48("10943"), `${URL_PROTOCOL}${host}:${port}`);
  }
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
    if (stryMutAct_9fa48("10944")) {
      {}
    } else {
      stryCov_9fa48("10944");
      this.workspaceRoot = resolve(stryMutAct_9fa48("10947") ? options.workspaceRoot && process.cwd() : stryMutAct_9fa48("10946") ? false : stryMutAct_9fa48("10945") ? true : (stryCov_9fa48("10945", "10946", "10947"), options.workspaceRoot || process.cwd()));
      this.host = stryMutAct_9fa48("10950") ? options.host && ADMIN_STANDALONE_DEFAULT.HOST : stryMutAct_9fa48("10949") ? false : stryMutAct_9fa48("10948") ? true : (stryCov_9fa48("10948", "10949", "10950"), options.host || ADMIN_STANDALONE_DEFAULT.HOST);
      this.port = parsePort(options.port, ADMIN_STANDALONE_DEFAULT.PORT);
      this.nodeId = stryMutAct_9fa48("10953") ? options.nodeId && ADMIN_STANDALONE_DEFAULT.NODE_ID : stryMutAct_9fa48("10952") ? false : stryMutAct_9fa48("10951") ? true : (stryCov_9fa48("10951", "10952", "10953"), options.nodeId || ADMIN_STANDALONE_DEFAULT.NODE_ID);
      this.testRunService = stryMutAct_9fa48("10956") ? options.testRunService && new AdminTestRunService({
        workspaceRoot: this.workspaceRoot
      }) : stryMutAct_9fa48("10955") ? false : stryMutAct_9fa48("10954") ? true : (stryCov_9fa48("10954", "10955", "10956"), options.testRunService || new AdminTestRunService(stryMutAct_9fa48("10957") ? {} : (stryCov_9fa48("10957"), {
        workspaceRoot: this.workspaceRoot
      })));
      this.adminApi = stryMutAct_9fa48("10960") ? options.adminApi && new AdminWebSocketAPI({
        nodeId: this.nodeId,
        testRunService: this.testRunService,
        enableAdminStream: false
      }) : stryMutAct_9fa48("10959") ? false : stryMutAct_9fa48("10958") ? true : (stryCov_9fa48("10958", "10959", "10960"), options.adminApi || new AdminWebSocketAPI(stryMutAct_9fa48("10961") ? {} : (stryCov_9fa48("10961"), {
        nodeId: this.nodeId,
        testRunService: this.testRunService,
        enableAdminStream: stryMutAct_9fa48("10962") ? true : (stryCov_9fa48("10962"), false)
      })));
      this.started = stryMutAct_9fa48("10963") ? true : (stryCov_9fa48("10963"), false);
    }
  }

  /**
   * Start the standalone server.
   * @param {Object} [options]
   * @param {boolean} [options.listen]
   * @return {Promise<Object>}
   */
  async start(options = {}) {
    if (stryMutAct_9fa48("10964")) {
      {}
    } else {
      stryCov_9fa48("10964");
      if (stryMutAct_9fa48("10967") ? false : stryMutAct_9fa48("10966") ? true : stryMutAct_9fa48("10965") ? this.started : (stryCov_9fa48("10965", "10966", "10967"), !this.started)) {
        if (stryMutAct_9fa48("10968")) {
          {}
        } else {
          stryCov_9fa48("10968");
          await this.adminApi.initialize(this.port, stryMutAct_9fa48("10969") ? {} : (stryCov_9fa48("10969"), {
            listen: options.listen,
            host: this.host
          }));
          this.started = stryMutAct_9fa48("10970") ? false : (stryCov_9fa48("10970"), true);
        }
      }
      return this.getInfo();
    }
  }

  /**
   * Stop the standalone server.
   * @return {Promise<void>}
   */
  async stop() {
    if (stryMutAct_9fa48("10971")) {
      {}
    } else {
      stryCov_9fa48("10971");
      await this.adminApi.shutdown();
      this.started = stryMutAct_9fa48("10972") ? true : (stryCov_9fa48("10972"), false);
    }
  }

  /**
   * Get server info.
   * @return {Object}
   */
  getInfo() {
    if (stryMutAct_9fa48("10973")) {
      {}
    } else {
      stryCov_9fa48("10973");
      return stryMutAct_9fa48("10974") ? {} : (stryCov_9fa48("10974"), {
        host: this.host,
        port: this.port,
        workspaceRoot: this.workspaceRoot,
        url: buildServerUrl(this.host, this.port),
        dashboardUrl: stryMutAct_9fa48("10975") ? `` : (stryCov_9fa48("10975"), `${buildServerUrl(this.host, this.port)}/`),
        started: this.started
      });
    }
  }

  /**
   * Expose Fastify instance.
   * @return {Object}
   */
  getFastify() {
    if (stryMutAct_9fa48("10976")) {
      {}
    } else {
      stryCov_9fa48("10976");
      return this.adminApi.getFastify();
    }
  }
}

/**
 * Factory helper.
 * @param {Object} [options]
 * @return {StandaloneTestRunServer}
 */
function createStandaloneTestRunServer(options = {}) {
  if (stryMutAct_9fa48("10977")) {
    {}
  } else {
    stryCov_9fa48("10977");
    return new StandaloneTestRunServer(options);
  }
}
export { StandaloneTestRunServer, createStandaloneTestRunServer, parsePort, buildServerUrl };