/**
 * Admin test run service.
 * Owns distributed scenario discovery, run lifecycle control, and
 * saved-run inventory for HTTP admin ingress.
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
import { spawn as spawnChildProcess, execFile as execFileNode } from 'node:child_process';
import { lookup as lookupDns } from 'node:dns/promises';
import { mkdir, open as openFile, readdir, readFile, rm as removePath, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { URL } from 'node:url';
import { ADMIN_TEST_DEFAULT, ADMIN_TEST_ERROR_MSG, ADMIN_TEST_LOG_STREAM, ADMIN_TEST_RUN_PATH, ADMIN_TEST_RUN_STATUS, ADMIN_TEST_STREAM_EVENT } from './admin-constants.js';
import { buildArchivedTimelineCandidates, buildLivePlaybackViewerUrl, buildPlaybackViewerUrl, buildRunPlaybackOutputDir, buildScenarioOutputDir, buildScenarioPlaybackPaths, getContentType, isPathInside, normalizeWorkspaceRelativePath, resolveOutputAssetPath, toOutputWebPath } from './admin-test-run-paths.js';
import { inferProgressFromLog, RUN_PROGRESS_PERCENT, RUN_PROGRESS_PHASE } from './admin-test-run-progress.js';
import { extractReportSummary, isRunStatusActive, mergeRunRecord, serializeRun } from './admin-test-run-report.js';
const FILE_ENCODING = stryMutAct_9fa48("7806") ? "" : (stryCov_9fa48("7806"), 'utf8');
const REPORT_TIMESTAMP_FALLBACK_MS = 0;
const PROCESS_EXIT_SUCCESS = 0;
const METADATA_FILE_EXTENSION = stryMutAct_9fa48("7807") ? "" : (stryCov_9fa48("7807"), '.json');
const CLEAN_LINE_BREAK_REGEX = stryMutAct_9fa48("7808") ? /\r\n/ : (stryCov_9fa48("7808"), /\r?\n/);
const TRIM_CRLF_REGEX = stryMutAct_9fa48("7809") ? /\r/ : (stryCov_9fa48("7809"), /\r$/);
const FIRST_SPACE_REGEX = stryMutAct_9fa48("7811") ? /\S+/ : stryMutAct_9fa48("7810") ? /\s/ : (stryCov_9fa48("7810", "7811"), /\s+/);
const ISO_TIMESTAMP_PREFIX_REGEX = stryMutAct_9fa48("7818") ? /^\d{4}-\d{2}-\D{2}T/ : stryMutAct_9fa48("7817") ? /^\d{4}-\d{2}-\dT/ : stryMutAct_9fa48("7816") ? /^\d{4}-\D{2}-\d{2}T/ : stryMutAct_9fa48("7815") ? /^\d{4}-\d-\d{2}T/ : stryMutAct_9fa48("7814") ? /^\D{4}-\d{2}-\d{2}T/ : stryMutAct_9fa48("7813") ? /^\d-\d{2}-\d{2}T/ : stryMutAct_9fa48("7812") ? /\d{4}-\d{2}-\d{2}T/ : (stryCov_9fa48("7812", "7813", "7814", "7815", "7816", "7817", "7818"), /^\d{4}-\d{2}-\d{2}T/);
const RUN_ID_SANITIZE_REGEX = stryMutAct_9fa48("7819") ? /[a-zA-Z0-9._-]/g : (stryCov_9fa48("7819"), /[^a-zA-Z0-9._-]/g);
const RUN_TIMESTAMP_CHAR_REGEX = stryMutAct_9fa48("7820") ? /[^-:.]/g : (stryCov_9fa48("7820"), /[-:.]/g);
const RUN_TIMESTAMP_REPLACEMENT = stryMutAct_9fa48("7821") ? "Stryker was here!" : (stryCov_9fa48("7821"), '');
const METADATA_FILENAME_PREFIX = stryMutAct_9fa48("7822") ? "" : (stryCov_9fa48("7822"), 'run-');
const METADATA_SCHEMA_VERSION = 1;
const GIT_HASH_COMMAND = stryMutAct_9fa48("7823") ? "" : (stryCov_9fa48("7823"), 'git');
const GIT_HASH_ARGS = Object.freeze(stryMutAct_9fa48("7824") ? [] : (stryCov_9fa48("7824"), [stryMutAct_9fa48("7825") ? "" : (stryCov_9fa48("7825"), 'rev-parse'), stryMutAct_9fa48("7826") ? "" : (stryCov_9fa48("7826"), '--short'), stryMutAct_9fa48("7827") ? "" : (stryCov_9fa48("7827"), 'HEAD')]));
const GIT_HASH_FALLBACK = ADMIN_TEST_DEFAULT.GIT_HASH_UNKNOWN;
const EMPTY_STRING = stryMutAct_9fa48("7828") ? "Stryker was here!" : (stryCov_9fa48("7828"), '');
const DEFAULT_STDIO = stryMutAct_9fa48("7829") ? "" : (stryCov_9fa48("7829"), 'pipe');
const SIGNAL_STOP = ADMIN_TEST_DEFAULT.SIGNAL_TERM;
const FILE_READ_BYTES_PER_CHUNK = 65536;
const BUFFER_ENCODING = stryMutAct_9fa48("7830") ? "" : (stryCov_9fa48("7830"), 'utf8');
const RUN_CONFIG_MODE = Object.freeze(stryMutAct_9fa48("7831") ? {} : (stryCov_9fa48("7831"), {
  LOCAL: stryMutAct_9fa48("7832") ? "" : (stryCov_9fa48("7832"), 'local'),
  REMOTE: stryMutAct_9fa48("7833") ? "" : (stryCov_9fa48("7833"), 'remote')
}));
const CONFIG_PRECHECK_STATE = Object.freeze(stryMutAct_9fa48("7834") ? {} : (stryCov_9fa48("7834"), {
  INVALID_DOCKER_HOST: stryMutAct_9fa48("7835") ? "" : (stryCov_9fa48("7835"), 'invalid_docker_host'),
  LOCAL_READY: stryMutAct_9fa48("7836") ? "" : (stryCov_9fa48("7836"), 'local_ready'),
  REMOTE_HOST_RESOLVED: stryMutAct_9fa48("7837") ? "" : (stryCov_9fa48("7837"), 'remote_host_resolved'),
  REMOTE_READY: stryMutAct_9fa48("7838") ? "" : (stryCov_9fa48("7838"), 'remote_ready'),
  REMOTE_HOST_UNRESOLVABLE: stryMutAct_9fa48("7839") ? "" : (stryCov_9fa48("7839"), 'remote_host_unresolvable')
}));
const RUN_FINALIZATION_STATE = Object.freeze(stryMutAct_9fa48("7840") ? {} : (stryCov_9fa48("7840"), {
  STOPPED: stryMutAct_9fa48("7841") ? "" : (stryCov_9fa48("7841"), 'stopped'),
  PASSED: stryMutAct_9fa48("7842") ? "" : (stryCov_9fa48("7842"), 'passed'),
  FAILED: stryMutAct_9fa48("7843") ? "" : (stryCov_9fa48("7843"), 'failed')
}));
const CONFIG_PRECHECK_ERROR_PREFIX = stryMutAct_9fa48("7844") ? `` : (stryCov_9fa48("7844"), `${ADMIN_TEST_ERROR_MSG.CONFIG_PREFLIGHT_FAILED}: `);
const DOCKER_HOST_PROTOCOL_SEPARATOR = stryMutAct_9fa48("7845") ? "" : (stryCov_9fa48("7845"), '://');
const DOCKER_HOST_PATH_SEPARATOR = stryMutAct_9fa48("7846") ? "" : (stryCov_9fa48("7846"), '/');
const DOCKER_HOST_PORT_SEPARATOR = stryMutAct_9fa48("7847") ? "" : (stryCov_9fa48("7847"), ':');
const DOCKER_HOST_IPV6_PREFIX = stryMutAct_9fa48("7848") ? "" : (stryCov_9fa48("7848"), '[');
const DOCKER_HOST_IPV6_SUFFIX = stryMutAct_9fa48("7849") ? "" : (stryCov_9fa48("7849"), ']');
function buildLocalConfigPrecheck(socketPath) {
  if (stryMutAct_9fa48("7850")) {
    {}
  } else {
    stryCov_9fa48("7850");
    return Object.freeze(stryMutAct_9fa48("7851") ? {} : (stryCov_9fa48("7851"), {
      state: CONFIG_PRECHECK_STATE.LOCAL_READY,
      mode: RUN_CONFIG_MODE.LOCAL,
      socketPath,
      hosts: stryMutAct_9fa48("7852") ? ["Stryker was here"] : (stryCov_9fa48("7852"), [])
    }));
  }
}
function buildRemoteConfigPrecheck(hosts) {
  if (stryMutAct_9fa48("7853")) {
    {}
  } else {
    stryCov_9fa48("7853");
    return Object.freeze(stryMutAct_9fa48("7854") ? {} : (stryCov_9fa48("7854"), {
      state: CONFIG_PRECHECK_STATE.REMOTE_READY,
      mode: RUN_CONFIG_MODE.REMOTE,
      socketPath: null,
      hosts
    }));
  }
}
function resolveConfigPrecheckState(observations) {
  if (stryMutAct_9fa48("7855")) {
    {}
  } else {
    stryCov_9fa48("7855");
    const blockingObservation = observations.find(stryMutAct_9fa48("7856") ? () => undefined : (stryCov_9fa48("7856"), observation => stryMutAct_9fa48("7859") ? observation.state === CONFIG_PRECHECK_STATE.REMOTE_HOST_RESOLVED : stryMutAct_9fa48("7858") ? false : stryMutAct_9fa48("7857") ? true : (stryCov_9fa48("7857", "7858", "7859"), observation.state !== CONFIG_PRECHECK_STATE.REMOTE_HOST_RESOLVED)));
    return stryMutAct_9fa48("7862") ? blockingObservation?.state && CONFIG_PRECHECK_STATE.REMOTE_READY : stryMutAct_9fa48("7861") ? false : stryMutAct_9fa48("7860") ? true : (stryCov_9fa48("7860", "7861", "7862"), (stryMutAct_9fa48("7863") ? blockingObservation.state : (stryCov_9fa48("7863"), blockingObservation?.state)) || CONFIG_PRECHECK_STATE.REMOTE_READY);
  }
}
function buildConfigPrecheckOutcome({
  configName,
  hosts,
  observations,
  precheckState
}) {
  if (stryMutAct_9fa48("7864")) {
    {}
  } else {
    stryCov_9fa48("7864");
    const blockingObservation = observations.find(stryMutAct_9fa48("7865") ? () => undefined : (stryCov_9fa48("7865"), observation => stryMutAct_9fa48("7868") ? observation.state !== precheckState : stryMutAct_9fa48("7867") ? false : stryMutAct_9fa48("7866") ? true : (stryCov_9fa48("7866", "7867", "7868"), observation.state === precheckState)));
    switch (precheckState) {
      case CONFIG_PRECHECK_STATE.INVALID_DOCKER_HOST:
        if (stryMutAct_9fa48("7869")) {} else {
          stryCov_9fa48("7869");
          return Object.freeze(stryMutAct_9fa48("7870") ? {} : (stryCov_9fa48("7870"), {
            state: precheckState,
            error: new Error((stryMutAct_9fa48("7871") ? `` : (stryCov_9fa48("7871"), `${CONFIG_PRECHECK_ERROR_PREFIX}`)) + (stryMutAct_9fa48("7872") ? `` : (stryCov_9fa48("7872"), `invalid docker host "${blockingObservation.host}" in config "${configName}"`)))
          }));
        }
      case CONFIG_PRECHECK_STATE.REMOTE_HOST_UNRESOLVABLE:
        if (stryMutAct_9fa48("7873")) {} else {
          stryCov_9fa48("7873");
          return Object.freeze(stryMutAct_9fa48("7874") ? {} : (stryCov_9fa48("7874"), {
            state: precheckState,
            error: new Error((stryMutAct_9fa48("7875") ? `` : (stryCov_9fa48("7875"), `${CONFIG_PRECHECK_ERROR_PREFIX}`)) + (stryMutAct_9fa48("7876") ? `` : (stryCov_9fa48("7876"), `docker host "${blockingObservation.host}" from config "${configName}"`)) + (stryMutAct_9fa48("7877") ? `` : (stryCov_9fa48("7877"), ` is not resolvable: ${blockingObservation.message}`)))
          }));
        }
      case CONFIG_PRECHECK_STATE.REMOTE_READY:
        if (stryMutAct_9fa48("7878")) {} else {
          stryCov_9fa48("7878");
          return Object.freeze(stryMutAct_9fa48("7879") ? {} : (stryCov_9fa48("7879"), {
            state: precheckState,
            precheck: buildRemoteConfigPrecheck(hosts)
          }));
        }
      default:
        if (stryMutAct_9fa48("7880")) {} else {
          stryCov_9fa48("7880");
          return Object.freeze(stryMutAct_9fa48("7881") ? {} : (stryCov_9fa48("7881"), {
            state: precheckState,
            error: new Error((stryMutAct_9fa48("7882") ? `` : (stryCov_9fa48("7882"), `${CONFIG_PRECHECK_ERROR_PREFIX}`)) + (stryMutAct_9fa48("7883") ? `` : (stryCov_9fa48("7883"), `unsupported config precheck state "${precheckState}" for config "${configName}"`)))
          }));
        }
    }
  }
}
function buildRunFinalizationSnapshot(run, exitCode) {
  if (stryMutAct_9fa48("7884")) {
    {}
  } else {
    stryCov_9fa48("7884");
    return Object.freeze(stryMutAct_9fa48("7885") ? {} : (stryCov_9fa48("7885"), {
      priorStatus: run.status,
      exitCode
    }));
  }
}
function resolveRunFinalizationState(snapshot) {
  if (stryMutAct_9fa48("7886")) {
    {}
  } else {
    stryCov_9fa48("7886");
    if (stryMutAct_9fa48("7889") ? snapshot.priorStatus !== ADMIN_TEST_RUN_STATUS.STOPPING : stryMutAct_9fa48("7888") ? false : stryMutAct_9fa48("7887") ? true : (stryCov_9fa48("7887", "7888", "7889"), snapshot.priorStatus === ADMIN_TEST_RUN_STATUS.STOPPING)) {
      if (stryMutAct_9fa48("7890")) {
        {}
      } else {
        stryCov_9fa48("7890");
        return RUN_FINALIZATION_STATE.STOPPED;
      }
    }
    if (stryMutAct_9fa48("7893") ? snapshot.exitCode !== PROCESS_EXIT_SUCCESS : stryMutAct_9fa48("7892") ? false : stryMutAct_9fa48("7891") ? true : (stryCov_9fa48("7891", "7892", "7893"), snapshot.exitCode === PROCESS_EXIT_SUCCESS)) {
      if (stryMutAct_9fa48("7894")) {
        {}
      } else {
        stryCov_9fa48("7894");
        return RUN_FINALIZATION_STATE.PASSED;
      }
    }
    return RUN_FINALIZATION_STATE.FAILED;
  }
}
function buildRunFinalizationOutcome(finalizationState) {
  if (stryMutAct_9fa48("7895")) {
    {}
  } else {
    stryCov_9fa48("7895");
    switch (finalizationState) {
      case RUN_FINALIZATION_STATE.STOPPED:
        if (stryMutAct_9fa48("7896")) {} else {
          stryCov_9fa48("7896");
          return Object.freeze(stryMutAct_9fa48("7897") ? {} : (stryCov_9fa48("7897"), {
            state: finalizationState,
            status: ADMIN_TEST_RUN_STATUS.STOPPED,
            progress: Object.freeze(stryMutAct_9fa48("7898") ? {} : (stryCov_9fa48("7898"), {
              phase: RUN_PROGRESS_PHASE.STOPPED,
              message: stryMutAct_9fa48("7899") ? "" : (stryCov_9fa48("7899"), 'Run stopped'),
              percent: 100
            }))
          }));
        }
      case RUN_FINALIZATION_STATE.PASSED:
        if (stryMutAct_9fa48("7900")) {} else {
          stryCov_9fa48("7900");
          return Object.freeze(stryMutAct_9fa48("7901") ? {} : (stryCov_9fa48("7901"), {
            state: finalizationState,
            status: ADMIN_TEST_RUN_STATUS.PASSED,
            progress: Object.freeze(stryMutAct_9fa48("7902") ? {} : (stryCov_9fa48("7902"), {
              phase: RUN_PROGRESS_PHASE.COMPLETED,
              message: stryMutAct_9fa48("7903") ? "" : (stryCov_9fa48("7903"), 'Run completed successfully'),
              percent: 100
            }))
          }));
        }
      case RUN_FINALIZATION_STATE.FAILED:
        if (stryMutAct_9fa48("7904")) {} else {
          stryCov_9fa48("7904");
          return Object.freeze(stryMutAct_9fa48("7905") ? {} : (stryCov_9fa48("7905"), {
            state: finalizationState,
            status: ADMIN_TEST_RUN_STATUS.FAILED,
            progress: Object.freeze(stryMutAct_9fa48("7906") ? {} : (stryCov_9fa48("7906"), {
              phase: RUN_PROGRESS_PHASE.FAILED,
              message: stryMutAct_9fa48("7907") ? "" : (stryCov_9fa48("7907"), 'Run failed'),
              percent: 100
            }))
          }));
        }
      default:
        if (stryMutAct_9fa48("7908")) {} else {
          stryCov_9fa48("7908");
          return Object.freeze(stryMutAct_9fa48("7909") ? {} : (stryCov_9fa48("7909"), {
            state: finalizationState,
            status: ADMIN_TEST_RUN_STATUS.FAILED,
            progress: Object.freeze(stryMutAct_9fa48("7910") ? {} : (stryCov_9fa48("7910"), {
              phase: RUN_PROGRESS_PHASE.FAILED,
              message: stryMutAct_9fa48("7911") ? "" : (stryCov_9fa48("7911"), 'Run failed'),
              percent: 100
            }))
          }));
        }
    }
  }
}

/**
 * Build a stable run identifier.
 * @param {string} scenario
 * @param {number} epochMs
 * @param {string} gitHash
 * @return {string}
 */
function buildRunId(scenario, epochMs, gitHash) {
  if (stryMutAct_9fa48("7912")) {
    {}
  } else {
    stryCov_9fa48("7912");
    const safeScenario = String(scenario).replace(RUN_ID_SANITIZE_REGEX, stryMutAct_9fa48("7913") ? "" : (stryCov_9fa48("7913"), '_'));
    const timestamp = new Date(epochMs).toISOString().replace(RUN_TIMESTAMP_CHAR_REGEX, RUN_TIMESTAMP_REPLACEMENT);
    const safeGitHash = String(stryMutAct_9fa48("7916") ? gitHash && GIT_HASH_FALLBACK : stryMutAct_9fa48("7915") ? false : stryMutAct_9fa48("7914") ? true : (stryCov_9fa48("7914", "7915", "7916"), gitHash || GIT_HASH_FALLBACK)).replace(RUN_ID_SANITIZE_REGEX, stryMutAct_9fa48("7917") ? "" : (stryCov_9fa48("7917"), '_'));
    return stryMutAct_9fa48("7918") ? `` : (stryCov_9fa48("7918"), `${safeScenario}-${timestamp}-${safeGitHash}`);
  }
}

/**
 * Return JSON parse result or null for unreadable files.
 * @param {string} filePath
 * @return {Promise<Object|null>}
 */
async function tryReadJson(filePath) {
  if (stryMutAct_9fa48("7919")) {
    {}
  } else {
    stryCov_9fa48("7919");
    try {
      if (stryMutAct_9fa48("7920")) {
        {}
      } else {
        stryCov_9fa48("7920");
        const raw = await readFile(filePath, FILE_ENCODING);
        return JSON.parse(raw);
      }
    } catch {
      if (stryMutAct_9fa48("7921")) {
        {}
      } else {
        stryCov_9fa48("7921");
        return null;
      }
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
    if (stryMutAct_9fa48("7922")) {
      {}
    } else {
      stryCov_9fa48("7922");
      this.workspaceRoot = resolve(stryMutAct_9fa48("7925") ? options.workspaceRoot && process.cwd() : stryMutAct_9fa48("7924") ? false : stryMutAct_9fa48("7923") ? true : (stryCov_9fa48("7923", "7924", "7925"), options.workspaceRoot || process.cwd()));
      this.spawnRunner = stryMutAct_9fa48("7928") ? options.spawnRunner && spawnChildProcess : stryMutAct_9fa48("7927") ? false : stryMutAct_9fa48("7926") ? true : (stryCov_9fa48("7926", "7927", "7928"), options.spawnRunner || spawnChildProcess);
      this.execFile = stryMutAct_9fa48("7931") ? options.execFile && execFileNode : stryMutAct_9fa48("7930") ? false : stryMutAct_9fa48("7929") ? true : (stryCov_9fa48("7929", "7930", "7931"), options.execFile || execFileNode);
      this.resolveHost = stryMutAct_9fa48("7934") ? options.resolveHost && lookupDns : stryMutAct_9fa48("7933") ? false : stryMutAct_9fa48("7932") ? true : (stryCov_9fa48("7932", "7933", "7934"), options.resolveHost || lookupDns);
      this.now = stryMutAct_9fa48("7937") ? options.now && (() => Date.now()) : stryMutAct_9fa48("7936") ? false : stryMutAct_9fa48("7935") ? true : (stryCov_9fa48("7935", "7936", "7937"), options.now || (stryMutAct_9fa48("7938") ? () => undefined : (stryCov_9fa48("7938"), () => Date.now())));
      this.scenariosDir = resolve(this.workspaceRoot, ADMIN_TEST_RUN_PATH.SCENARIOS_DIR);
      this.configDir = resolve(this.workspaceRoot, ADMIN_TEST_RUN_PATH.CONFIG_DIR);
      this.runScript = resolve(this.workspaceRoot, ADMIN_TEST_RUN_PATH.RUNNER_SCRIPT);
      this.outputDir = resolve(this.workspaceRoot, ADMIN_TEST_RUN_PATH.OUTPUT_DIR);
      this.metadataDir = resolve(this.outputDir, ADMIN_TEST_RUN_PATH.METADATA_DIR);
      this.dashboardPath = resolve(this.workspaceRoot, ADMIN_TEST_RUN_PATH.DASHBOARD_PAGE);
      this.playbackViewerPath = resolve(this.workspaceRoot, ADMIN_TEST_RUN_PATH.PLAYBACK_VIEWER);

      /** @type {Map<string, Object>} */
      this.runs = new Map();
    }
  }

  /**
   * List available distributed scenarios.
   * @return {Promise<Array<Object>>}
   */
  async listAvailableTests() {
    if (stryMutAct_9fa48("7939")) {
      {}
    } else {
      stryCov_9fa48("7939");
      const entries = await this.tryReadDirectory(this.scenariosDir);
      return stryMutAct_9fa48("7941") ? entries.map(entry => ({
        id: basename(entry.name, ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION),
        file: join(ADMIN_TEST_RUN_PATH.SCENARIOS_DIR, entry.name)
      })).sort((a, b) => a.id.localeCompare(b.id)) : stryMutAct_9fa48("7940") ? entries.filter(entry => entry.isFile() && extname(entry.name) === ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION).map(entry => ({
        id: basename(entry.name, ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION),
        file: join(ADMIN_TEST_RUN_PATH.SCENARIOS_DIR, entry.name)
      })) : (stryCov_9fa48("7940", "7941"), entries.filter(stryMutAct_9fa48("7942") ? () => undefined : (stryCov_9fa48("7942"), entry => stryMutAct_9fa48("7945") ? entry.isFile() || extname(entry.name) === ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION : stryMutAct_9fa48("7944") ? false : stryMutAct_9fa48("7943") ? true : (stryCov_9fa48("7943", "7944", "7945"), entry.isFile() && (stryMutAct_9fa48("7947") ? extname(entry.name) !== ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION : stryMutAct_9fa48("7946") ? true : (stryCov_9fa48("7946", "7947"), extname(entry.name) === ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION))))).map(stryMutAct_9fa48("7948") ? () => undefined : (stryCov_9fa48("7948"), entry => stryMutAct_9fa48("7949") ? {} : (stryCov_9fa48("7949"), {
        id: basename(entry.name, ADMIN_TEST_DEFAULT.SCENARIO_EXTENSION),
        file: join(ADMIN_TEST_RUN_PATH.SCENARIOS_DIR, entry.name)
      }))).sort(stryMutAct_9fa48("7950") ? () => undefined : (stryCov_9fa48("7950"), (a, b) => a.id.localeCompare(b.id))));
    }
  }

  /**
   * List available test config files.
   * @return {Promise<Array<Object>>}
   */
  async listAvailableConfigs() {
    if (stryMutAct_9fa48("7951")) {
      {}
    } else {
      stryCov_9fa48("7951");
      const entries = await this.tryReadDirectory(this.configDir);
      return stryMutAct_9fa48("7953") ? entries.map(entry => ({
        id: entry.name,
        file: join(ADMIN_TEST_RUN_PATH.CONFIG_DIR, entry.name)
      })).sort((a, b) => a.id.localeCompare(b.id)) : stryMutAct_9fa48("7952") ? entries.filter(entry => entry.isFile() && extname(entry.name) === ADMIN_TEST_DEFAULT.CONFIG_EXTENSION).map(entry => ({
        id: entry.name,
        file: join(ADMIN_TEST_RUN_PATH.CONFIG_DIR, entry.name)
      })) : (stryCov_9fa48("7952", "7953"), entries.filter(stryMutAct_9fa48("7954") ? () => undefined : (stryCov_9fa48("7954"), entry => stryMutAct_9fa48("7957") ? entry.isFile() || extname(entry.name) === ADMIN_TEST_DEFAULT.CONFIG_EXTENSION : stryMutAct_9fa48("7956") ? false : stryMutAct_9fa48("7955") ? true : (stryCov_9fa48("7955", "7956", "7957"), entry.isFile() && (stryMutAct_9fa48("7959") ? extname(entry.name) !== ADMIN_TEST_DEFAULT.CONFIG_EXTENSION : stryMutAct_9fa48("7958") ? true : (stryCov_9fa48("7958", "7959"), extname(entry.name) === ADMIN_TEST_DEFAULT.CONFIG_EXTENSION))))).map(stryMutAct_9fa48("7960") ? () => undefined : (stryCov_9fa48("7960"), entry => stryMutAct_9fa48("7961") ? {} : (stryCov_9fa48("7961"), {
        id: entry.name,
        file: join(ADMIN_TEST_RUN_PATH.CONFIG_DIR, entry.name)
      }))).sort(stryMutAct_9fa48("7962") ? () => undefined : (stryCov_9fa48("7962"), (a, b) => a.id.localeCompare(b.id))));
    }
  }

  /**
   * Parse one config JSON file under distributed config directory.
   * @param {string} configName
   * @return {Promise<Object>}
   * @private
   */
  async readConfigPayload(configName) {
    if (stryMutAct_9fa48("7963")) {
      {}
    } else {
      stryCov_9fa48("7963");
      const configPath = resolve(this.configDir, configName);
      let raw = EMPTY_STRING;
      try {
        if (stryMutAct_9fa48("7964")) {
          {}
        } else {
          stryCov_9fa48("7964");
          raw = await readFile(configPath, FILE_ENCODING);
        }
      } catch (error) {
        if (stryMutAct_9fa48("7965")) {
          {}
        } else {
          stryCov_9fa48("7965");
          throw new Error((stryMutAct_9fa48("7966") ? `` : (stryCov_9fa48("7966"), `${CONFIG_PRECHECK_ERROR_PREFIX}`)) + (stryMutAct_9fa48("7967") ? `` : (stryCov_9fa48("7967"), `unable to read config "${configName}": ${error.message}`)));
        }
      }
      try {
        if (stryMutAct_9fa48("7968")) {
          {}
        } else {
          stryCov_9fa48("7968");
          const parsed = JSON.parse(raw);
          return (stryMutAct_9fa48("7971") ? parsed || typeof parsed === 'object' : stryMutAct_9fa48("7970") ? false : stryMutAct_9fa48("7969") ? true : (stryCov_9fa48("7969", "7970", "7971"), parsed && (stryMutAct_9fa48("7973") ? typeof parsed !== 'object' : stryMutAct_9fa48("7972") ? true : (stryCov_9fa48("7972", "7973"), typeof parsed === (stryMutAct_9fa48("7974") ? "" : (stryCov_9fa48("7974"), 'object')))))) ? parsed : {};
        }
      } catch (error) {
        if (stryMutAct_9fa48("7975")) {
          {}
        } else {
          stryCov_9fa48("7975");
          throw new Error((stryMutAct_9fa48("7976") ? `` : (stryCov_9fa48("7976"), `${CONFIG_PRECHECK_ERROR_PREFIX}`)) + (stryMutAct_9fa48("7977") ? `` : (stryCov_9fa48("7977"), `config "${configName}" is not valid JSON: ${error.message}`)));
        }
      }
    }
  }

  /**
   * Parse hostname from docker host target.
   * @param {string} dockerHost
   * @return {string|null}
   * @private
   */
  parseDockerHostname(dockerHost) {
    if (stryMutAct_9fa48("7978")) {
      {}
    } else {
      stryCov_9fa48("7978");
      const value = stryMutAct_9fa48("7979") ? String(dockerHost || EMPTY_STRING) : (stryCov_9fa48("7979"), String(stryMutAct_9fa48("7982") ? dockerHost && EMPTY_STRING : stryMutAct_9fa48("7981") ? false : stryMutAct_9fa48("7980") ? true : (stryCov_9fa48("7980", "7981", "7982"), dockerHost || EMPTY_STRING)).trim());
      if (stryMutAct_9fa48("7985") ? false : stryMutAct_9fa48("7984") ? true : stryMutAct_9fa48("7983") ? value : (stryCov_9fa48("7983", "7984", "7985"), !value)) {
        if (stryMutAct_9fa48("7986")) {
          {}
        } else {
          stryCov_9fa48("7986");
          return null;
        }
      }
      if (stryMutAct_9fa48("7988") ? false : stryMutAct_9fa48("7987") ? true : (stryCov_9fa48("7987", "7988"), value.includes(DOCKER_HOST_PROTOCOL_SEPARATOR))) {
        if (stryMutAct_9fa48("7989")) {
          {}
        } else {
          stryCov_9fa48("7989");
          try {
            if (stryMutAct_9fa48("7990")) {
              {}
            } else {
              stryCov_9fa48("7990");
              const parsed = new URL(value);
              return stryMutAct_9fa48("7993") ? parsed.hostname && null : stryMutAct_9fa48("7992") ? false : stryMutAct_9fa48("7991") ? true : (stryCov_9fa48("7991", "7992", "7993"), parsed.hostname || null);
            }
          } catch (_error) {
            if (stryMutAct_9fa48("7994")) {
              {}
            } else {
              stryCov_9fa48("7994");
              return null;
            }
          }
        }
      }
      const firstSegment = value.split(DOCKER_HOST_PATH_SEPARATOR, 1)[0];
      if (stryMutAct_9fa48("7997") ? false : stryMutAct_9fa48("7996") ? true : stryMutAct_9fa48("7995") ? firstSegment : (stryCov_9fa48("7995", "7996", "7997"), !firstSegment)) {
        if (stryMutAct_9fa48("7998")) {
          {}
        } else {
          stryCov_9fa48("7998");
          return null;
        }
      }
      if (stryMutAct_9fa48("8001") ? firstSegment.endsWith(DOCKER_HOST_IPV6_PREFIX) : stryMutAct_9fa48("8000") ? false : stryMutAct_9fa48("7999") ? true : (stryCov_9fa48("7999", "8000", "8001"), firstSegment.startsWith(DOCKER_HOST_IPV6_PREFIX))) {
        if (stryMutAct_9fa48("8002")) {
          {}
        } else {
          stryCov_9fa48("8002");
          const suffixIndex = firstSegment.indexOf(DOCKER_HOST_IPV6_SUFFIX);
          if (stryMutAct_9fa48("8006") ? suffixIndex <= 1 : stryMutAct_9fa48("8005") ? suffixIndex >= 1 : stryMutAct_9fa48("8004") ? false : stryMutAct_9fa48("8003") ? true : (stryCov_9fa48("8003", "8004", "8005", "8006"), suffixIndex > 1)) {
            if (stryMutAct_9fa48("8007")) {
              {}
            } else {
              stryCov_9fa48("8007");
              return stryMutAct_9fa48("8008") ? firstSegment : (stryCov_9fa48("8008"), firstSegment.slice(1, suffixIndex));
            }
          }
          return null;
        }
      }
      const firstSeparator = firstSegment.indexOf(DOCKER_HOST_PORT_SEPARATOR);
      const lastSeparator = firstSegment.lastIndexOf(DOCKER_HOST_PORT_SEPARATOR);
      if (stryMutAct_9fa48("8011") ? firstSeparator >= 0 || firstSeparator === lastSeparator : stryMutAct_9fa48("8010") ? false : stryMutAct_9fa48("8009") ? true : (stryCov_9fa48("8009", "8010", "8011"), (stryMutAct_9fa48("8014") ? firstSeparator < 0 : stryMutAct_9fa48("8013") ? firstSeparator > 0 : stryMutAct_9fa48("8012") ? true : (stryCov_9fa48("8012", "8013", "8014"), firstSeparator >= 0)) && (stryMutAct_9fa48("8016") ? firstSeparator !== lastSeparator : stryMutAct_9fa48("8015") ? true : (stryCov_9fa48("8015", "8016"), firstSeparator === lastSeparator)))) {
        if (stryMutAct_9fa48("8017")) {
          {}
        } else {
          stryCov_9fa48("8017");
          return stryMutAct_9fa48("8020") ? firstSegment.slice(0, lastSeparator) && null : stryMutAct_9fa48("8019") ? false : stryMutAct_9fa48("8018") ? true : (stryCov_9fa48("8018", "8019", "8020"), (stryMutAct_9fa48("8021") ? firstSegment : (stryCov_9fa48("8021"), firstSegment.slice(0, lastSeparator))) || null);
        }
      }
      return firstSegment;
    }
  }

  /**
   * Run config precheck and resolve Docker target summary.
   * @param {string} configName
   * @return {Promise<Object>}
   * @private
   */
  async precheckConfig(configName) {
    if (stryMutAct_9fa48("8022")) {
      {}
    } else {
      stryCov_9fa48("8022");
      const config = await this.readConfigPayload(configName);
      const docker = stryMutAct_9fa48("8025") ? config?.docker && {} : stryMutAct_9fa48("8024") ? false : stryMutAct_9fa48("8023") ? true : (stryCov_9fa48("8023", "8024", "8025"), (stryMutAct_9fa48("8026") ? config.docker : (stryCov_9fa48("8026"), config?.docker)) || {});
      const hosts = Array.isArray(docker.hosts) ? stryMutAct_9fa48("8027") ? docker.hosts.map(entry => String(entry || EMPTY_STRING).trim()) : (stryCov_9fa48("8027"), docker.hosts.map(stryMutAct_9fa48("8028") ? () => undefined : (stryCov_9fa48("8028"), entry => stryMutAct_9fa48("8029") ? String(entry || EMPTY_STRING) : (stryCov_9fa48("8029"), String(stryMutAct_9fa48("8032") ? entry && EMPTY_STRING : stryMutAct_9fa48("8031") ? false : stryMutAct_9fa48("8030") ? true : (stryCov_9fa48("8030", "8031", "8032"), entry || EMPTY_STRING)).trim()))).filter(stryMutAct_9fa48("8033") ? () => undefined : (stryCov_9fa48("8033"), entry => Boolean(entry)))) : stryMutAct_9fa48("8034") ? ["Stryker was here"] : (stryCov_9fa48("8034"), []);
      if (stryMutAct_9fa48("8037") ? hosts.length !== 0 : stryMutAct_9fa48("8036") ? false : stryMutAct_9fa48("8035") ? true : (stryCov_9fa48("8035", "8036", "8037"), hosts.length === 0)) {
        if (stryMutAct_9fa48("8038")) {
          {}
        } else {
          stryCov_9fa48("8038");
          return buildLocalConfigPrecheck(stryMutAct_9fa48("8041") ? String(docker.socketPath || EMPTY_STRING).trim() && null : stryMutAct_9fa48("8040") ? false : stryMutAct_9fa48("8039") ? true : (stryCov_9fa48("8039", "8040", "8041"), (stryMutAct_9fa48("8042") ? String(docker.socketPath || EMPTY_STRING) : (stryCov_9fa48("8042"), String(stryMutAct_9fa48("8045") ? docker.socketPath && EMPTY_STRING : stryMutAct_9fa48("8044") ? false : stryMutAct_9fa48("8043") ? true : (stryCov_9fa48("8043", "8044", "8045"), docker.socketPath || EMPTY_STRING)).trim())) || null));
        }
      }
      const observations = stryMutAct_9fa48("8046") ? ["Stryker was here"] : (stryCov_9fa48("8046"), []);
      for (const host of hosts) {
        if (stryMutAct_9fa48("8047")) {
          {}
        } else {
          stryCov_9fa48("8047");
          observations.push(await this.resolveRemoteDockerHostObservation(host));
        }
      }
      const precheckState = resolveConfigPrecheckState(observations);
      const outcome = buildConfigPrecheckOutcome(stryMutAct_9fa48("8048") ? {} : (stryCov_9fa48("8048"), {
        configName,
        hosts,
        observations,
        precheckState
      }));
      if (stryMutAct_9fa48("8050") ? false : stryMutAct_9fa48("8049") ? true : (stryCov_9fa48("8049", "8050"), outcome.error)) {
        if (stryMutAct_9fa48("8051")) {
          {}
        } else {
          stryCov_9fa48("8051");
          throw outcome.error;
        }
      }
      return outcome.precheck;
    }
  }

  /**
   * Resolve one remote docker-host observation for config precheck.
   * @param {string} host
   * @return {Promise<Object>}
   * @private
   */
  async resolveRemoteDockerHostObservation(host) {
    if (stryMutAct_9fa48("8052")) {
      {}
    } else {
      stryCov_9fa48("8052");
      const hostname = this.parseDockerHostname(host);
      if (stryMutAct_9fa48("8055") ? false : stryMutAct_9fa48("8054") ? true : stryMutAct_9fa48("8053") ? hostname : (stryCov_9fa48("8053", "8054", "8055"), !hostname)) {
        if (stryMutAct_9fa48("8056")) {
          {}
        } else {
          stryCov_9fa48("8056");
          return Object.freeze(stryMutAct_9fa48("8057") ? {} : (stryCov_9fa48("8057"), {
            state: CONFIG_PRECHECK_STATE.INVALID_DOCKER_HOST,
            host
          }));
        }
      }
      try {
        if (stryMutAct_9fa48("8058")) {
          {}
        } else {
          stryCov_9fa48("8058");
          await this.resolveHost(hostname);
          return Object.freeze(stryMutAct_9fa48("8059") ? {} : (stryCov_9fa48("8059"), {
            state: CONFIG_PRECHECK_STATE.REMOTE_HOST_RESOLVED,
            host,
            hostname
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("8060")) {
          {}
        } else {
          stryCov_9fa48("8060");
          return Object.freeze(stryMutAct_9fa48("8061") ? {} : (stryCov_9fa48("8061"), {
            state: CONFIG_PRECHECK_STATE.REMOTE_HOST_UNRESOLVABLE,
            host,
            hostname,
            message: error.message
          }));
        }
      }
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
    if (stryMutAct_9fa48("8062")) {
      {}
    } else {
      stryCov_9fa48("8062");
      if (stryMutAct_9fa48("8065") ? precheck?.mode !== RUN_CONFIG_MODE.REMOTE : stryMutAct_9fa48("8064") ? false : stryMutAct_9fa48("8063") ? true : (stryCov_9fa48("8063", "8064", "8065"), (stryMutAct_9fa48("8066") ? precheck.mode : (stryCov_9fa48("8066"), precheck?.mode)) === RUN_CONFIG_MODE.REMOTE)) {
        if (stryMutAct_9fa48("8067")) {
          {}
        } else {
          stryCov_9fa48("8067");
          return (stryMutAct_9fa48("8068") ? `` : (stryCov_9fa48("8068"), `[preflight] config "${configName}" resolved `)) + (stryMutAct_9fa48("8069") ? `` : (stryCov_9fa48("8069"), `${precheck.hosts.length} docker host(s): ${precheck.hosts.join(stryMutAct_9fa48("8070") ? "" : (stryCov_9fa48("8070"), ', '))}`));
        }
      }
      const socketPath = stryMutAct_9fa48("8073") ? precheck?.socketPath && 'default docker socket' : stryMutAct_9fa48("8072") ? false : stryMutAct_9fa48("8071") ? true : (stryCov_9fa48("8071", "8072", "8073"), (stryMutAct_9fa48("8074") ? precheck.socketPath : (stryCov_9fa48("8074"), precheck?.socketPath)) || (stryMutAct_9fa48("8075") ? "" : (stryCov_9fa48("8075"), 'default docker socket')));
      return stryMutAct_9fa48("8076") ? `` : (stryCov_9fa48("8076"), `[preflight] config "${configName}" using local socket "${socketPath}"`);
    }
  }

  /**
   * List historical and active runs.
   * @return {Promise<Array<Object>>}
   */
  async listSavedRuns() {
    if (stryMutAct_9fa48("8077")) {
      {}
    } else {
      stryCov_9fa48("8077");
      const runsById = new Map();
      const reportRuns = await this.listRunsFromReports();
      for (const reportRun of reportRuns) {
        if (stryMutAct_9fa48("8078")) {
          {}
        } else {
          stryCov_9fa48("8078");
          runsById.set(reportRun.runId, reportRun);
        }
      }
      const metadataRuns = await this.listRunsFromMetadata();
      for (const metadataRun of metadataRuns) {
        if (stryMutAct_9fa48("8079")) {
          {}
        } else {
          stryCov_9fa48("8079");
          const existing = stryMutAct_9fa48("8082") ? runsById.get(metadataRun.runId) && {} : stryMutAct_9fa48("8081") ? false : stryMutAct_9fa48("8080") ? true : (stryCov_9fa48("8080", "8081", "8082"), runsById.get(metadataRun.runId) || {});
          runsById.set(metadataRun.runId, this.mergeRunRecord(existing, metadataRun));
        }
      }
      for (const activeRun of this.runs.values()) {
        if (stryMutAct_9fa48("8083")) {
          {}
        } else {
          stryCov_9fa48("8083");
          const existing = stryMutAct_9fa48("8086") ? runsById.get(activeRun.runId) && {} : stryMutAct_9fa48("8085") ? false : stryMutAct_9fa48("8084") ? true : (stryCov_9fa48("8084", "8085", "8086"), runsById.get(activeRun.runId) || {});
          runsById.set(activeRun.runId, this.mergeRunRecord(existing, this.serializeRun(activeRun)));
        }
      }
      return stryMutAct_9fa48("8087") ? Array.from(runsById.values()) : (stryCov_9fa48("8087"), Array.from(runsById.values()).sort((a, b) => {
        if (stryMutAct_9fa48("8088")) {
          {}
        } else {
          stryCov_9fa48("8088");
          const aValue = stryMutAct_9fa48("8091") ? Date.parse(a.startedAt || EMPTY_STRING) && REPORT_TIMESTAMP_FALLBACK_MS : stryMutAct_9fa48("8090") ? false : stryMutAct_9fa48("8089") ? true : (stryCov_9fa48("8089", "8090", "8091"), Date.parse(stryMutAct_9fa48("8094") ? a.startedAt && EMPTY_STRING : stryMutAct_9fa48("8093") ? false : stryMutAct_9fa48("8092") ? true : (stryCov_9fa48("8092", "8093", "8094"), a.startedAt || EMPTY_STRING)) || REPORT_TIMESTAMP_FALLBACK_MS);
          const bValue = stryMutAct_9fa48("8097") ? Date.parse(b.startedAt || EMPTY_STRING) && REPORT_TIMESTAMP_FALLBACK_MS : stryMutAct_9fa48("8096") ? false : stryMutAct_9fa48("8095") ? true : (stryCov_9fa48("8095", "8096", "8097"), Date.parse(stryMutAct_9fa48("8100") ? b.startedAt && EMPTY_STRING : stryMutAct_9fa48("8099") ? false : stryMutAct_9fa48("8098") ? true : (stryCov_9fa48("8098", "8099", "8100"), b.startedAt || EMPTY_STRING)) || REPORT_TIMESTAMP_FALLBACK_MS);
          return stryMutAct_9fa48("8101") ? bValue + aValue : (stryCov_9fa48("8101"), bValue - aValue);
        }
      }));
    }
  }

  /**
   * Return one run by id.
   * @param {string} runId
   * @return {Promise<Object|null>}
   */
  async getRun(runId) {
    if (stryMutAct_9fa48("8102")) {
      {}
    } else {
      stryCov_9fa48("8102");
      const activeRun = this.runs.get(runId);
      if (stryMutAct_9fa48("8104") ? false : stryMutAct_9fa48("8103") ? true : (stryCov_9fa48("8103", "8104"), activeRun)) {
        if (stryMutAct_9fa48("8105")) {
          {}
        } else {
          stryCov_9fa48("8105");
          return this.serializeRun(activeRun, stryMutAct_9fa48("8106") ? {} : (stryCov_9fa48("8106"), {
            includeLogs: stryMutAct_9fa48("8107") ? false : (stryCov_9fa48("8107"), true)
          }));
        }
      }
      const metadataFile = this.resolveMetadataFilePath(runId);
      const metadata = await tryReadJson(metadataFile);
      if (stryMutAct_9fa48("8109") ? false : stryMutAct_9fa48("8108") ? true : (stryCov_9fa48("8108", "8109"), metadata)) {
        if (stryMutAct_9fa48("8110")) {
          {}
        } else {
          stryCov_9fa48("8110");
          const reportData = await this.getReportSummary(stryMutAct_9fa48("8113") ? metadata.outputReportPath && null : stryMutAct_9fa48("8112") ? false : stryMutAct_9fa48("8111") ? true : (stryCov_9fa48("8111", "8112", "8113"), metadata.outputReportPath || null), metadata.runId);
          const runRecord = this.mergeRunRecord(metadata, reportData);
          runRecord.logs = await this.loadArchivedLogs(runRecord);
          return runRecord;
        }
      }
      const reportOnlyRun = await this.getReportOnlyRun(runId);
      if (stryMutAct_9fa48("8116") ? false : stryMutAct_9fa48("8115") ? true : stryMutAct_9fa48("8114") ? reportOnlyRun : (stryCov_9fa48("8114", "8115", "8116"), !reportOnlyRun)) {
        if (stryMutAct_9fa48("8117")) {
          {}
        } else {
          stryCov_9fa48("8117");
          return null;
        }
      }
      const runRecord = stryMutAct_9fa48("8118") ? {} : (stryCov_9fa48("8118"), {
        ...reportOnlyRun
      });
      runRecord.logs = await this.loadArchivedLogs(runRecord);
      return runRecord;
    }
  }

  /**
   * Start a distributed test run.
   * @param {Object} payload
   * @param {string} payload.scenario
   * @param {string} [payload.config]
   * @param {boolean} [payload.verbose]
   * @return {Promise<Object>}
   */
  async startRun(payload) {
    if (stryMutAct_9fa48("8119")) {
      {}
    } else {
      stryCov_9fa48("8119");
      const scenario = stryMutAct_9fa48("8120") ? String(payload?.scenario || EMPTY_STRING) : (stryCov_9fa48("8120"), String(stryMutAct_9fa48("8123") ? payload?.scenario && EMPTY_STRING : stryMutAct_9fa48("8122") ? false : stryMutAct_9fa48("8121") ? true : (stryCov_9fa48("8121", "8122", "8123"), (stryMutAct_9fa48("8124") ? payload.scenario : (stryCov_9fa48("8124"), payload?.scenario)) || EMPTY_STRING)).trim());
      if (stryMutAct_9fa48("8127") ? false : stryMutAct_9fa48("8126") ? true : stryMutAct_9fa48("8125") ? scenario : (stryCov_9fa48("8125", "8126", "8127"), !scenario)) {
        if (stryMutAct_9fa48("8128")) {
          {}
        } else {
          stryCov_9fa48("8128");
          throw new Error(ADMIN_TEST_ERROR_MSG.SCENARIO_REQUIRED);
        }
      }
      const availableScenarios = await this.listAvailableTests();
      if (stryMutAct_9fa48("8131") ? false : stryMutAct_9fa48("8130") ? true : stryMutAct_9fa48("8129") ? availableScenarios.find(entry => entry.id === scenario) : (stryCov_9fa48("8129", "8130", "8131"), !availableScenarios.find(stryMutAct_9fa48("8132") ? () => undefined : (stryCov_9fa48("8132"), entry => stryMutAct_9fa48("8135") ? entry.id !== scenario : stryMutAct_9fa48("8134") ? false : stryMutAct_9fa48("8133") ? true : (stryCov_9fa48("8133", "8134", "8135"), entry.id === scenario))))) {
        if (stryMutAct_9fa48("8136")) {
          {}
        } else {
          stryCov_9fa48("8136");
          throw new Error(ADMIN_TEST_ERROR_MSG.SCENARIO_NOT_FOUND);
        }
      }
      const requestedConfig = stryMutAct_9fa48("8137") ? String(payload?.config || ADMIN_TEST_DEFAULT.CONFIG_FILE) : (stryCov_9fa48("8137"), String(stryMutAct_9fa48("8140") ? payload?.config && ADMIN_TEST_DEFAULT.CONFIG_FILE : stryMutAct_9fa48("8139") ? false : stryMutAct_9fa48("8138") ? true : (stryCov_9fa48("8138", "8139", "8140"), (stryMutAct_9fa48("8141") ? payload.config : (stryCov_9fa48("8141"), payload?.config)) || ADMIN_TEST_DEFAULT.CONFIG_FILE)).trim());
      const configName = stryMutAct_9fa48("8144") ? requestedConfig && ADMIN_TEST_DEFAULT.CONFIG_FILE : stryMutAct_9fa48("8143") ? false : stryMutAct_9fa48("8142") ? true : (stryCov_9fa48("8142", "8143", "8144"), requestedConfig || ADMIN_TEST_DEFAULT.CONFIG_FILE);
      const availableConfigs = await this.listAvailableConfigs();
      if (stryMutAct_9fa48("8147") ? false : stryMutAct_9fa48("8146") ? true : stryMutAct_9fa48("8145") ? availableConfigs.find(entry => entry.id === configName) : (stryCov_9fa48("8145", "8146", "8147"), !availableConfigs.find(stryMutAct_9fa48("8148") ? () => undefined : (stryCov_9fa48("8148"), entry => stryMutAct_9fa48("8151") ? entry.id !== configName : stryMutAct_9fa48("8150") ? false : stryMutAct_9fa48("8149") ? true : (stryCov_9fa48("8149", "8150", "8151"), entry.id === configName))))) {
        if (stryMutAct_9fa48("8152")) {
          {}
        } else {
          stryCov_9fa48("8152");
          throw new Error(ADMIN_TEST_ERROR_MSG.CONFIG_NOT_FOUND);
        }
      }
      const configPrecheck = await this.precheckConfig(configName);
      const gitHash = await this.resolveGitHash();
      const startedAtMs = this.now();
      const runId = buildRunId(scenario, startedAtMs, gitHash);
      const outputReportPath = join(ADMIN_TEST_RUN_PATH.OUTPUT_DIR, stryMutAct_9fa48("8153") ? `` : (stryCov_9fa48("8153"), `${runId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`));
      const playbackPaths = this.buildScenarioPlaybackPaths(scenario, runId);
      const playbackManifestPath = stryMutAct_9fa48("8156") ? playbackPaths?.manifestPath && null : stryMutAct_9fa48("8155") ? false : stryMutAct_9fa48("8154") ? true : (stryCov_9fa48("8154", "8155", "8156"), (stryMutAct_9fa48("8157") ? playbackPaths.manifestPath : (stryCov_9fa48("8157"), playbackPaths?.manifestPath)) || null);
      const playbackManifestUrl = this.toOutputWebPath(playbackManifestPath);
      const playbackEventsUrl = this.toOutputWebPath(stryMutAct_9fa48("8160") ? playbackPaths?.eventsPath && null : stryMutAct_9fa48("8159") ? false : stryMutAct_9fa48("8158") ? true : (stryCov_9fa48("8158", "8159", "8160"), (stryMutAct_9fa48("8161") ? playbackPaths.eventsPath : (stryCov_9fa48("8161"), playbackPaths?.eventsPath)) || null));
      const playbackSamplesUrl = this.toOutputWebPath(stryMutAct_9fa48("8164") ? playbackPaths?.samplesPath && null : stryMutAct_9fa48("8163") ? false : stryMutAct_9fa48("8162") ? true : (stryCov_9fa48("8162", "8163", "8164"), (stryMutAct_9fa48("8165") ? playbackPaths.samplesPath : (stryCov_9fa48("8165"), playbackPaths?.samplesPath)) || null));
      const playbackSnapshotsUrl = this.toOutputWebPath(stryMutAct_9fa48("8168") ? playbackPaths?.snapshotsPath && null : stryMutAct_9fa48("8167") ? false : stryMutAct_9fa48("8166") ? true : (stryCov_9fa48("8166", "8167", "8168"), (stryMutAct_9fa48("8169") ? playbackPaths.snapshotsPath : (stryCov_9fa48("8169"), playbackPaths?.snapshotsPath)) || null));
      const livePlaybackViewerUrl = this.buildLivePlaybackViewerUrl(stryMutAct_9fa48("8170") ? {} : (stryCov_9fa48("8170"), {
        eventsUrl: playbackEventsUrl,
        samplesUrl: playbackSamplesUrl,
        snapshotsUrl: playbackSnapshotsUrl
      }), stryMutAct_9fa48("8171") ? {} : (stryCov_9fa48("8171"), {
        follow: stryMutAct_9fa48("8172") ? false : (stryCov_9fa48("8172"), true),
        autoplay: stryMutAct_9fa48("8173") ? false : (stryCov_9fa48("8173"), true),
        runId,
        runStartMs: startedAtMs
      }));
      await mkdir(this.outputDir, stryMutAct_9fa48("8174") ? {} : (stryCov_9fa48("8174"), {
        recursive: stryMutAct_9fa48("8175") ? false : (stryCov_9fa48("8175"), true)
      }));
      await mkdir(this.metadataDir, stryMutAct_9fa48("8176") ? {} : (stryCov_9fa48("8176"), {
        recursive: stryMutAct_9fa48("8177") ? false : (stryCov_9fa48("8177"), true)
      }));
      const configPath = join(ADMIN_TEST_RUN_PATH.CONFIG_DIR, configName);
      const args = stryMutAct_9fa48("8178") ? [] : (stryCov_9fa48("8178"), [this.runScript, stryMutAct_9fa48("8179") ? "" : (stryCov_9fa48("8179"), '--config'), configPath, stryMutAct_9fa48("8180") ? "" : (stryCov_9fa48("8180"), '--scenario'), scenario, stryMutAct_9fa48("8181") ? "" : (stryCov_9fa48("8181"), '--output'), outputReportPath]);
      if (stryMutAct_9fa48("8184") ? payload?.verbose === false : stryMutAct_9fa48("8183") ? false : stryMutAct_9fa48("8182") ? true : (stryCov_9fa48("8182", "8183", "8184"), (stryMutAct_9fa48("8185") ? payload.verbose : (stryCov_9fa48("8185"), payload?.verbose)) !== (stryMutAct_9fa48("8186") ? true : (stryCov_9fa48("8186"), false)))) {
        if (stryMutAct_9fa48("8187")) {
          {}
        } else {
          stryCov_9fa48("8187");
          args.push(stryMutAct_9fa48("8188") ? "" : (stryCov_9fa48("8188"), '--verbose'));
        }
      }
      const child = this.spawnRunner(process.execPath, args, stryMutAct_9fa48("8189") ? {} : (stryCov_9fa48("8189"), {
        cwd: this.workspaceRoot,
        stdio: stryMutAct_9fa48("8190") ? [] : (stryCov_9fa48("8190"), [DEFAULT_STDIO, DEFAULT_STDIO, DEFAULT_STDIO]),
        env: process.env
      }));
      const run = stryMutAct_9fa48("8191") ? {} : (stryCov_9fa48("8191"), {
        runId,
        scenario,
        config: configName,
        gitHash,
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: null,
        status: ADMIN_TEST_RUN_STATUS.RUNNING,
        outputReportPath,
        outputReportUrl: this.toOutputWebPath(outputReportPath),
        playbackManifestPath,
        playbackManifestUrl,
        playbackViewerUrl: playbackManifestPath ? this.buildPlaybackViewerUrl(playbackManifestPath) : null,
        playbackEventsPath: stryMutAct_9fa48("8194") ? playbackPaths?.eventsPath && null : stryMutAct_9fa48("8193") ? false : stryMutAct_9fa48("8192") ? true : (stryCov_9fa48("8192", "8193", "8194"), (stryMutAct_9fa48("8195") ? playbackPaths.eventsPath : (stryCov_9fa48("8195"), playbackPaths?.eventsPath)) || null),
        playbackSamplesPath: stryMutAct_9fa48("8198") ? playbackPaths?.samplesPath && null : stryMutAct_9fa48("8197") ? false : stryMutAct_9fa48("8196") ? true : (stryCov_9fa48("8196", "8197", "8198"), (stryMutAct_9fa48("8199") ? playbackPaths.samplesPath : (stryCov_9fa48("8199"), playbackPaths?.samplesPath)) || null),
        playbackSnapshotsPath: stryMutAct_9fa48("8202") ? playbackPaths?.snapshotsPath && null : stryMutAct_9fa48("8201") ? false : stryMutAct_9fa48("8200") ? true : (stryCov_9fa48("8200", "8201", "8202"), (stryMutAct_9fa48("8203") ? playbackPaths.snapshotsPath : (stryCov_9fa48("8203"), playbackPaths?.snapshotsPath)) || null),
        playbackEventsUrl,
        playbackSamplesUrl,
        playbackSnapshotsUrl,
        livePlaybackViewerUrl,
        exitCode: null,
        signal: null,
        pid: stryMutAct_9fa48("8206") ? child.pid && null : stryMutAct_9fa48("8205") ? false : stryMutAct_9fa48("8204") ? true : (stryCov_9fa48("8204", "8205", "8206"), child.pid || null),
        logBuffer: stryMutAct_9fa48("8207") ? ["Stryker was here"] : (stryCov_9fa48("8207"), []),
        stdoutRemainder: EMPTY_STRING,
        stderrRemainder: EMPTY_STRING,
        progress: this.buildProgressPayload(stryMutAct_9fa48("8208") ? {} : (stryCov_9fa48("8208"), {
          phase: RUN_PROGRESS_PHASE.STARTING,
          message: stryMutAct_9fa48("8209") ? `` : (stryCov_9fa48("8209"), `Run started for scenario "${scenario}" with config "${configName}"`),
          percent: RUN_PROGRESS_PERCENT.CONFIG_LOADING
        })),
        subscribers: new Set(),
        childProcess: child
      });
      const precheckSummary = this.formatPrecheckSummary(configPrecheck, configName);
      this.appendRunLog(run, ADMIN_TEST_LOG_STREAM.SYSTEM, precheckSummary);
      this.updateRunProgress(run, stryMutAct_9fa48("8210") ? {} : (stryCov_9fa48("8210"), {
        phase: RUN_PROGRESS_PHASE.STARTING,
        message: precheckSummary,
        percent: RUN_PROGRESS_PERCENT.PRECHECK_COMPLETE
      }));
      this.runs.set(runId, run);
      this.publishStatus(run);
      await this.persistRunMetadata(run);
      if (stryMutAct_9fa48("8213") ? child.stdout || typeof child.stdout.on === 'function' : stryMutAct_9fa48("8212") ? false : stryMutAct_9fa48("8211") ? true : (stryCov_9fa48("8211", "8212", "8213"), child.stdout && (stryMutAct_9fa48("8215") ? typeof child.stdout.on !== 'function' : stryMutAct_9fa48("8214") ? true : (stryCov_9fa48("8214", "8215"), typeof child.stdout.on === (stryMutAct_9fa48("8216") ? "" : (stryCov_9fa48("8216"), 'function')))))) {
        if (stryMutAct_9fa48("8217")) {
          {}
        } else {
          stryCov_9fa48("8217");
          child.stdout.on(stryMutAct_9fa48("8218") ? "" : (stryCov_9fa48("8218"), 'data'), chunk => {
            if (stryMutAct_9fa48("8219")) {
              {}
            } else {
              stryCov_9fa48("8219");
              this.captureRunOutput(run, ADMIN_TEST_LOG_STREAM.STDOUT, chunk);
            }
          });
        }
      }
      if (stryMutAct_9fa48("8222") ? child.stderr || typeof child.stderr.on === 'function' : stryMutAct_9fa48("8221") ? false : stryMutAct_9fa48("8220") ? true : (stryCov_9fa48("8220", "8221", "8222"), child.stderr && (stryMutAct_9fa48("8224") ? typeof child.stderr.on !== 'function' : stryMutAct_9fa48("8223") ? true : (stryCov_9fa48("8223", "8224"), typeof child.stderr.on === (stryMutAct_9fa48("8225") ? "" : (stryCov_9fa48("8225"), 'function')))))) {
        if (stryMutAct_9fa48("8226")) {
          {}
        } else {
          stryCov_9fa48("8226");
          child.stderr.on(stryMutAct_9fa48("8227") ? "" : (stryCov_9fa48("8227"), 'data'), chunk => {
            if (stryMutAct_9fa48("8228")) {
              {}
            } else {
              stryCov_9fa48("8228");
              this.captureRunOutput(run, ADMIN_TEST_LOG_STREAM.STDERR, chunk);
            }
          });
        }
      }
      child.on(stryMutAct_9fa48("8229") ? "" : (stryCov_9fa48("8229"), 'error'), error => {
        if (stryMutAct_9fa48("8230")) {
          {}
        } else {
          stryCov_9fa48("8230");
          this.appendRunLog(run, ADMIN_TEST_LOG_STREAM.SYSTEM, error.message);
        }
      });
      child.on(stryMutAct_9fa48("8231") ? "" : (stryCov_9fa48("8231"), 'close'), (code, signal) => {
        if (stryMutAct_9fa48("8232")) {
          {}
        } else {
          stryCov_9fa48("8232");
          void this.finalizeRun(run, code, signal);
        }
      });
      return this.serializeRun(run);
    }
  }

  /**
   * Stop an active run by id.
   * @param {string} runId
   * @return {Promise<Object>}
   */
  async stopRun(runId) {
    if (stryMutAct_9fa48("8233")) {
      {}
    } else {
      stryCov_9fa48("8233");
      const run = this.runs.get(runId);
      if (stryMutAct_9fa48("8236") ? false : stryMutAct_9fa48("8235") ? true : stryMutAct_9fa48("8234") ? run : (stryCov_9fa48("8234", "8235", "8236"), !run)) {
        if (stryMutAct_9fa48("8237")) {
          {}
        } else {
          stryCov_9fa48("8237");
          throw new Error(ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND);
        }
      }
      if (stryMutAct_9fa48("8240") ? !run.childProcess && run.status !== ADMIN_TEST_RUN_STATUS.RUNNING : stryMutAct_9fa48("8239") ? false : stryMutAct_9fa48("8238") ? true : (stryCov_9fa48("8238", "8239", "8240"), (stryMutAct_9fa48("8241") ? run.childProcess : (stryCov_9fa48("8241"), !run.childProcess)) || (stryMutAct_9fa48("8243") ? run.status === ADMIN_TEST_RUN_STATUS.RUNNING : stryMutAct_9fa48("8242") ? false : (stryCov_9fa48("8242", "8243"), run.status !== ADMIN_TEST_RUN_STATUS.RUNNING)))) {
        if (stryMutAct_9fa48("8244")) {
          {}
        } else {
          stryCov_9fa48("8244");
          throw new Error(ADMIN_TEST_ERROR_MSG.RUN_NOT_ACTIVE);
        }
      }
      run.status = ADMIN_TEST_RUN_STATUS.STOPPING;
      this.updateRunProgress(run, stryMutAct_9fa48("8245") ? {} : (stryCov_9fa48("8245"), {
        phase: RUN_PROGRESS_PHASE.STOPPING,
        message: stryMutAct_9fa48("8246") ? "" : (stryCov_9fa48("8246"), 'Stop requested'),
        percent: stryMutAct_9fa48("8247") ? Math.min(90, Number(run.progress?.percent || 0)) : (stryCov_9fa48("8247"), Math.max(90, Number(stryMutAct_9fa48("8250") ? run.progress?.percent && 0 : stryMutAct_9fa48("8249") ? false : stryMutAct_9fa48("8248") ? true : (stryCov_9fa48("8248", "8249", "8250"), (stryMutAct_9fa48("8251") ? run.progress.percent : (stryCov_9fa48("8251"), run.progress?.percent)) || 0))))
      }));
      this.publishStatus(run);
      await this.persistRunMetadata(run);
      run.childProcess.kill(SIGNAL_STOP);
      return this.serializeRun(run);
    }
  }

  /**
   * Delete a completed historical run by id.
   * Removes report and metadata artifacts where present.
   * @param {string} runId
   * @return {Promise<Object>}
   */
  async deleteRun(runId) {
    if (stryMutAct_9fa48("8252")) {
      {}
    } else {
      stryCov_9fa48("8252");
      const normalizedRunId = stryMutAct_9fa48("8253") ? String(runId || EMPTY_STRING) : (stryCov_9fa48("8253"), String(stryMutAct_9fa48("8256") ? runId && EMPTY_STRING : stryMutAct_9fa48("8255") ? false : stryMutAct_9fa48("8254") ? true : (stryCov_9fa48("8254", "8255", "8256"), runId || EMPTY_STRING)).trim());
      if (stryMutAct_9fa48("8259") ? false : stryMutAct_9fa48("8258") ? true : stryMutAct_9fa48("8257") ? normalizedRunId : (stryCov_9fa48("8257", "8258", "8259"), !normalizedRunId)) {
        if (stryMutAct_9fa48("8260")) {
          {}
        } else {
          stryCov_9fa48("8260");
          throw new Error(ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND);
        }
      }
      const activeRun = this.runs.get(normalizedRunId);
      if (stryMutAct_9fa48("8263") ? activeRun || isRunStatusActive(activeRun.status) : stryMutAct_9fa48("8262") ? false : stryMutAct_9fa48("8261") ? true : (stryCov_9fa48("8261", "8262", "8263"), activeRun && isRunStatusActive(activeRun.status))) {
        if (stryMutAct_9fa48("8264")) {
          {}
        } else {
          stryCov_9fa48("8264");
          throw new Error(ADMIN_TEST_ERROR_MSG.RUN_DELETE_ACTIVE);
        }
      }
      const runRecord = await this.getRun(normalizedRunId);
      if (stryMutAct_9fa48("8267") ? false : stryMutAct_9fa48("8266") ? true : stryMutAct_9fa48("8265") ? runRecord : (stryCov_9fa48("8265", "8266", "8267"), !runRecord)) {
        if (stryMutAct_9fa48("8268")) {
          {}
        } else {
          stryCov_9fa48("8268");
          throw new Error(ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND);
        }
      }
      const metadataPath = this.resolveMetadataFilePath(normalizedRunId);
      const reportPath = runRecord.outputReportPath ? resolve(this.workspaceRoot, runRecord.outputReportPath) : resolve(this.workspaceRoot, join(ADMIN_TEST_RUN_PATH.OUTPUT_DIR, stryMutAct_9fa48("8269") ? `` : (stryCov_9fa48("8269"), `${normalizedRunId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`)));
      const playbackRunDir = resolve(this.workspaceRoot, this.buildRunPlaybackOutputDir(normalizedRunId));
      const removed = stryMutAct_9fa48("8270") ? {} : (stryCov_9fa48("8270"), {
        metadata: await this.removeFileIfExists(metadataPath, this.metadataDir),
        report: await this.removeFileIfExists(reportPath, this.outputDir),
        playback: await this.removeDirectoryIfExists(playbackRunDir, this.outputDir)
      });
      this.runs.delete(normalizedRunId);
      return stryMutAct_9fa48("8271") ? {} : (stryCov_9fa48("8271"), {
        runId: normalizedRunId,
        deleted: stryMutAct_9fa48("8272") ? false : (stryCov_9fa48("8272"), true),
        removed
      });
    }
  }

  /**
   * Subscribe to live logs and status updates for a run.
   * @param {string} runId
   * @param {Function} onEvent
   * @return {{backlog: Array<Object>, run: Object, unsubscribe: Function}|null}
   */
  subscribeToRun(runId, onEvent) {
    if (stryMutAct_9fa48("8273")) {
      {}
    } else {
      stryCov_9fa48("8273");
      const run = this.runs.get(runId);
      if (stryMutAct_9fa48("8276") ? false : stryMutAct_9fa48("8275") ? true : stryMutAct_9fa48("8274") ? run : (stryCov_9fa48("8274", "8275", "8276"), !run)) {
        if (stryMutAct_9fa48("8277")) {
          {}
        } else {
          stryCov_9fa48("8277");
          return null;
        }
      }
      run.subscribers.add(onEvent);
      const unsubscribe = () => {
        if (stryMutAct_9fa48("8278")) {
          {}
        } else {
          stryCov_9fa48("8278");
          run.subscribers.delete(onEvent);
        }
      };
      return stryMutAct_9fa48("8279") ? {} : (stryCov_9fa48("8279"), {
        backlog: stryMutAct_9fa48("8280") ? [] : (stryCov_9fa48("8280"), [...run.logBuffer]),
        run: this.serializeRun(run),
        unsubscribe
      });
    }
  }

  /**
   * Read dashboard HTML page.
   * @return {Promise<string>}
   */
  async readDashboardPage() {
    if (stryMutAct_9fa48("8281")) {
      {}
    } else {
      stryCov_9fa48("8281");
      return readFile(this.dashboardPath, FILE_ENCODING);
    }
  }

  /**
   * Read playback viewer HTML.
   * @return {Promise<string>}
   */
  async readPlaybackViewer() {
    if (stryMutAct_9fa48("8282")) {
      {}
    } else {
      stryCov_9fa48("8282");
      return readFile(this.playbackViewerPath, FILE_ENCODING);
    }
  }

  /**
   * Resolve a relative path inside test-output.
   * @param {string} wildcardPath
   * @return {string|null}
   */
  resolveOutputAssetPath(wildcardPath) {
    if (stryMutAct_9fa48("8283")) {
      {}
    } else {
      stryCov_9fa48("8283");
      return resolveOutputAssetPath(wildcardPath, this.outputDir);
    }
  }

  /**
   * Guess HTTP content type by filename extension.
   * @param {string} filePath
   * @return {string}
   */
  getContentType(filePath) {
    if (stryMutAct_9fa48("8284")) {
      {}
    } else {
      stryCov_9fa48("8284");
      return getContentType(filePath);
    }
  }

  /**
   * Read and return an output file payload.
   * @param {string} wildcardPath
   * @return {Promise<{contentType: string, body: Buffer}|null>}
   */
  async readOutputAsset(wildcardPath) {
    if (stryMutAct_9fa48("8285")) {
      {}
    } else {
      stryCov_9fa48("8285");
      const filePath = this.resolveOutputAssetPath(wildcardPath);
      if (stryMutAct_9fa48("8288") ? false : stryMutAct_9fa48("8287") ? true : stryMutAct_9fa48("8286") ? filePath : (stryCov_9fa48("8286", "8287", "8288"), !filePath)) {
        if (stryMutAct_9fa48("8289")) {
          {}
        } else {
          stryCov_9fa48("8289");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("8290")) {
          {}
        } else {
          stryCov_9fa48("8290");
          const fileStats = await stat(filePath);
          if (stryMutAct_9fa48("8293") ? false : stryMutAct_9fa48("8292") ? true : stryMutAct_9fa48("8291") ? fileStats.isFile() : (stryCov_9fa48("8291", "8292", "8293"), !fileStats.isFile())) {
            if (stryMutAct_9fa48("8294")) {
              {}
            } else {
              stryCov_9fa48("8294");
              return null;
            }
          }
          const body = await readFile(filePath);
          return stryMutAct_9fa48("8295") ? {} : (stryCov_9fa48("8295"), {
            contentType: this.getContentType(filePath),
            body
          });
        }
      } catch {
        if (stryMutAct_9fa48("8296")) {
          {}
        } else {
          stryCov_9fa48("8296");
          return null;
        }
      }
    }
  }

  /**
   * Load archived log lines for a completed run.
   * @param {Object} runRecord
   * @return {Promise<Array<Object>>}
   * @private
   */
  async loadArchivedLogs(runRecord) {
    if (stryMutAct_9fa48("8297")) {
      {}
    } else {
      stryCov_9fa48("8297");
      const scenario = stryMutAct_9fa48("8298") ? runRecord.scenario : (stryCov_9fa48("8298"), runRecord?.scenario);
      if (stryMutAct_9fa48("8301") ? false : stryMutAct_9fa48("8300") ? true : stryMutAct_9fa48("8299") ? scenario : (stryCov_9fa48("8299", "8300", "8301"), !scenario)) {
        if (stryMutAct_9fa48("8302")) {
          {}
        } else {
          stryCov_9fa48("8302");
          return stryMutAct_9fa48("8303") ? ["Stryker was here"] : (stryCov_9fa48("8303"), []);
        }
      }
      const timelinePaths = this.buildArchivedTimelineCandidates(runRecord);
      for (const timelinePath of timelinePaths) {
        if (stryMutAct_9fa48("8304")) {
          {}
        } else {
          stryCov_9fa48("8304");
          if (stryMutAct_9fa48("8307") ? !timelinePath && !isPathInside(this.outputDir, timelinePath) : stryMutAct_9fa48("8306") ? false : stryMutAct_9fa48("8305") ? true : (stryCov_9fa48("8305", "8306", "8307"), (stryMutAct_9fa48("8308") ? timelinePath : (stryCov_9fa48("8308"), !timelinePath)) || (stryMutAct_9fa48("8309") ? isPathInside(this.outputDir, timelinePath) : (stryCov_9fa48("8309"), !isPathInside(this.outputDir, timelinePath))))) {
            if (stryMutAct_9fa48("8310")) {
              {}
            } else {
              stryCov_9fa48("8310");
              continue;
            }
          }
          let fileStats = null;
          try {
            if (stryMutAct_9fa48("8311")) {
              {}
            } else {
              stryCov_9fa48("8311");
              fileStats = await stat(timelinePath);
            }
          } catch {
            if (stryMutAct_9fa48("8312")) {
              {}
            } else {
              stryCov_9fa48("8312");
              fileStats = null;
            }
          }
          if (stryMutAct_9fa48("8315") ? !fileStats && !fileStats.isFile() : stryMutAct_9fa48("8314") ? false : stryMutAct_9fa48("8313") ? true : (stryCov_9fa48("8313", "8314", "8315"), (stryMutAct_9fa48("8316") ? fileStats : (stryCov_9fa48("8316"), !fileStats)) || (stryMutAct_9fa48("8317") ? fileStats.isFile() : (stryCov_9fa48("8317"), !fileStats.isFile())))) {
            if (stryMutAct_9fa48("8318")) {
              {}
            } else {
              stryCov_9fa48("8318");
              continue;
            }
          }
          let tailLines = stryMutAct_9fa48("8319") ? ["Stryker was here"] : (stryCov_9fa48("8319"), []);
          try {
            if (stryMutAct_9fa48("8320")) {
              {}
            } else {
              stryCov_9fa48("8320");
              tailLines = await this.readTailLines(timelinePath, ADMIN_TEST_DEFAULT.ARCHIVE_LOG_LINE_LIMIT);
            }
          } catch {
            if (stryMutAct_9fa48("8321")) {
              {}
            } else {
              stryCov_9fa48("8321");
              tailLines = stryMutAct_9fa48("8322") ? ["Stryker was here"] : (stryCov_9fa48("8322"), []);
            }
          }
          if (stryMutAct_9fa48("8325") ? tailLines.length !== 0 : stryMutAct_9fa48("8324") ? false : stryMutAct_9fa48("8323") ? true : (stryCov_9fa48("8323", "8324", "8325"), tailLines.length === 0)) {
            if (stryMutAct_9fa48("8326")) {
              {}
            } else {
              stryCov_9fa48("8326");
              continue;
            }
          }
          return tailLines.map(stryMutAct_9fa48("8327") ? () => undefined : (stryCov_9fa48("8327"), line => this.buildArchivedLogEntry(line, runRecord)));
        }
      }
      return stryMutAct_9fa48("8328") ? ["Stryker was here"] : (stryCov_9fa48("8328"), []);
    }
  }

  /**
   * Read only the tail lines from a text file.
   * @param {string} filePath
   * @param {number} maxLines
   * @return {Promise<Array<string>>}
   * @private
   */
  async readTailLines(filePath, maxLines) {
    if (stryMutAct_9fa48("8329")) {
      {}
    } else {
      stryCov_9fa48("8329");
      const fileHandle = await openFile(filePath, stryMutAct_9fa48("8330") ? "" : (stryCov_9fa48("8330"), 'r'));
      try {
        if (stryMutAct_9fa48("8331")) {
          {}
        } else {
          stryCov_9fa48("8331");
          const stats = await fileHandle.stat();
          let position = Number(stryMutAct_9fa48("8334") ? stats.size && REPORT_TIMESTAMP_FALLBACK_MS : stryMutAct_9fa48("8333") ? false : stryMutAct_9fa48("8332") ? true : (stryCov_9fa48("8332", "8333", "8334"), stats.size || REPORT_TIMESTAMP_FALLBACK_MS));
          let combined = EMPTY_STRING;
          let splitLines = stryMutAct_9fa48("8335") ? ["Stryker was here"] : (stryCov_9fa48("8335"), []);
          while (stryMutAct_9fa48("8337") ? position > REPORT_TIMESTAMP_FALLBACK_MS || splitLines.length <= maxLines : stryMutAct_9fa48("8336") ? false : (stryCov_9fa48("8336", "8337"), (stryMutAct_9fa48("8340") ? position <= REPORT_TIMESTAMP_FALLBACK_MS : stryMutAct_9fa48("8339") ? position >= REPORT_TIMESTAMP_FALLBACK_MS : stryMutAct_9fa48("8338") ? true : (stryCov_9fa48("8338", "8339", "8340"), position > REPORT_TIMESTAMP_FALLBACK_MS)) && (stryMutAct_9fa48("8343") ? splitLines.length > maxLines : stryMutAct_9fa48("8342") ? splitLines.length < maxLines : stryMutAct_9fa48("8341") ? true : (stryCov_9fa48("8341", "8342", "8343"), splitLines.length <= maxLines)))) {
            if (stryMutAct_9fa48("8344")) {
              {}
            } else {
              stryCov_9fa48("8344");
              const chunkSize = stryMutAct_9fa48("8345") ? Math.max(FILE_READ_BYTES_PER_CHUNK, position) : (stryCov_9fa48("8345"), Math.min(FILE_READ_BYTES_PER_CHUNK, position));
              stryMutAct_9fa48("8346") ? position += chunkSize : (stryCov_9fa48("8346"), position -= chunkSize);
              const buffer = Buffer.alloc(chunkSize);
              await fileHandle.read(buffer, REPORT_TIMESTAMP_FALLBACK_MS, chunkSize, position);
              combined = stryMutAct_9fa48("8347") ? buffer.toString(BUFFER_ENCODING) - combined : (stryCov_9fa48("8347"), buffer.toString(BUFFER_ENCODING) + combined);
              splitLines = combined.split(CLEAN_LINE_BREAK_REGEX);
            }
          }
          const normalized = stryMutAct_9fa48("8348") ? splitLines.map(line => line.trim()) : (stryCov_9fa48("8348"), splitLines.map(stryMutAct_9fa48("8349") ? () => undefined : (stryCov_9fa48("8349"), line => stryMutAct_9fa48("8350") ? line : (stryCov_9fa48("8350"), line.trim()))).filter(stryMutAct_9fa48("8351") ? () => undefined : (stryCov_9fa48("8351"), line => Boolean(line))));
          if (stryMutAct_9fa48("8355") ? normalized.length > maxLines : stryMutAct_9fa48("8354") ? normalized.length < maxLines : stryMutAct_9fa48("8353") ? false : stryMutAct_9fa48("8352") ? true : (stryCov_9fa48("8352", "8353", "8354", "8355"), normalized.length <= maxLines)) {
            if (stryMutAct_9fa48("8356")) {
              {}
            } else {
              stryCov_9fa48("8356");
              return normalized;
            }
          }
          return stryMutAct_9fa48("8357") ? normalized : (stryCov_9fa48("8357"), normalized.slice(stryMutAct_9fa48("8358") ? normalized.length + maxLines : (stryCov_9fa48("8358"), normalized.length - maxLines)));
        }
      } finally {
        if (stryMutAct_9fa48("8359")) {
          {}
        } else {
          stryCov_9fa48("8359");
          await fileHandle.close();
        }
      }
    }
  }

  /**
   * Convert one archived text line into UI log entry shape.
   * @param {string} line
   * @param {Object} runRecord
   * @return {Object}
   * @private
   */
  buildArchivedLogEntry(line, runRecord) {
    if (stryMutAct_9fa48("8360")) {
      {}
    } else {
      stryCov_9fa48("8360");
      const firstToken = stryMutAct_9fa48("8363") ? line.split(FIRST_SPACE_REGEX, 1)[0] && EMPTY_STRING : stryMutAct_9fa48("8362") ? false : stryMutAct_9fa48("8361") ? true : (stryCov_9fa48("8361", "8362", "8363"), line.split(FIRST_SPACE_REGEX, 1)[0] || EMPTY_STRING);
      const timestamp = ISO_TIMESTAMP_PREFIX_REGEX.test(firstToken) ? firstToken : stryMutAct_9fa48("8366") ? (runRecord.endedAt || runRecord.startedAt) && new Date(this.now()).toISOString() : stryMutAct_9fa48("8365") ? false : stryMutAct_9fa48("8364") ? true : (stryCov_9fa48("8364", "8365", "8366"), (stryMutAct_9fa48("8368") ? runRecord.endedAt && runRecord.startedAt : stryMutAct_9fa48("8367") ? false : (stryCov_9fa48("8367", "8368"), runRecord.endedAt || runRecord.startedAt)) || new Date(this.now()).toISOString());
      return stryMutAct_9fa48("8369") ? {} : (stryCov_9fa48("8369"), {
        timestamp,
        stream: ADMIN_TEST_LOG_STREAM.ARCHIVE,
        line
      });
    }
  }

  /**
   * Build timeline path candidates for archived run logs.
   * @param {Object} runRecord
   * @return {Array<string>}
   * @private
   */
  buildArchivedTimelineCandidates(runRecord) {
    if (stryMutAct_9fa48("8370")) {
      {}
    } else {
      stryCov_9fa48("8370");
      return buildArchivedTimelineCandidates(runRecord, this.outputDir, this.workspaceRoot);
    }
  }

  /**
   * Collect run entries from report files.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async listRunsFromReports() {
    if (stryMutAct_9fa48("8371")) {
      {}
    } else {
      stryCov_9fa48("8371");
      const entries = await this.tryReadDirectory(this.outputDir);
      const reportFiles = stryMutAct_9fa48("8372") ? entries.map(entry => entry.name) : (stryCov_9fa48("8372"), entries.filter(stryMutAct_9fa48("8373") ? () => undefined : (stryCov_9fa48("8373"), entry => stryMutAct_9fa48("8376") ? entry.isFile() || entry.name.endsWith(ADMIN_TEST_DEFAULT.REPORT_EXTENSION) : stryMutAct_9fa48("8375") ? false : stryMutAct_9fa48("8374") ? true : (stryCov_9fa48("8374", "8375", "8376"), entry.isFile() && (stryMutAct_9fa48("8377") ? entry.name.startsWith(ADMIN_TEST_DEFAULT.REPORT_EXTENSION) : (stryCov_9fa48("8377"), entry.name.endsWith(ADMIN_TEST_DEFAULT.REPORT_EXTENSION)))))).map(stryMutAct_9fa48("8378") ? () => undefined : (stryCov_9fa48("8378"), entry => entry.name)));
      const runs = stryMutAct_9fa48("8379") ? ["Stryker was here"] : (stryCov_9fa48("8379"), []);
      for (const reportFile of reportFiles) {
        if (stryMutAct_9fa48("8380")) {
          {}
        } else {
          stryCov_9fa48("8380");
          const fullPath = resolve(this.outputDir, reportFile);
          const report = await tryReadJson(fullPath);
          if (stryMutAct_9fa48("8383") ? !report && typeof report !== 'object' : stryMutAct_9fa48("8382") ? false : stryMutAct_9fa48("8381") ? true : (stryCov_9fa48("8381", "8382", "8383"), (stryMutAct_9fa48("8384") ? report : (stryCov_9fa48("8384"), !report)) || (stryMutAct_9fa48("8386") ? typeof report === 'object' : stryMutAct_9fa48("8385") ? false : (stryCov_9fa48("8385", "8386"), typeof report !== (stryMutAct_9fa48("8387") ? "" : (stryCov_9fa48("8387"), 'object')))))) {
            if (stryMutAct_9fa48("8388")) {
              {}
            } else {
              stryCov_9fa48("8388");
              continue;
            }
          }
          const runId = basename(reportFile, ADMIN_TEST_DEFAULT.REPORT_EXTENSION);
          const reportStat = await stat(fullPath);
          const reportSummary = this.extractReportSummary(report, runId, reportStat);
          runs.push(reportSummary);
        }
      }
      return runs;
    }
  }

  /**
   * Collect run entries from metadata files.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async listRunsFromMetadata() {
    if (stryMutAct_9fa48("8389")) {
      {}
    } else {
      stryCov_9fa48("8389");
      const entries = await this.tryReadDirectory(this.metadataDir);
      const files = stryMutAct_9fa48("8390") ? entries : (stryCov_9fa48("8390"), entries.filter(stryMutAct_9fa48("8391") ? () => undefined : (stryCov_9fa48("8391"), entry => stryMutAct_9fa48("8394") ? entry.isFile() || extname(entry.name) === METADATA_FILE_EXTENSION : stryMutAct_9fa48("8393") ? false : stryMutAct_9fa48("8392") ? true : (stryCov_9fa48("8392", "8393", "8394"), entry.isFile() && (stryMutAct_9fa48("8396") ? extname(entry.name) !== METADATA_FILE_EXTENSION : stryMutAct_9fa48("8395") ? true : (stryCov_9fa48("8395", "8396"), extname(entry.name) === METADATA_FILE_EXTENSION))))));
      const runs = stryMutAct_9fa48("8397") ? ["Stryker was here"] : (stryCov_9fa48("8397"), []);
      for (const fileEntry of files) {
        if (stryMutAct_9fa48("8398")) {
          {}
        } else {
          stryCov_9fa48("8398");
          const metadataPath = resolve(this.metadataDir, fileEntry.name);
          const metadata = await tryReadJson(metadataPath);
          if (stryMutAct_9fa48("8401") ? !metadata && !metadata.runId : stryMutAct_9fa48("8400") ? false : stryMutAct_9fa48("8399") ? true : (stryCov_9fa48("8399", "8400", "8401"), (stryMutAct_9fa48("8402") ? metadata : (stryCov_9fa48("8402"), !metadata)) || (stryMutAct_9fa48("8403") ? metadata.runId : (stryCov_9fa48("8403"), !metadata.runId)))) {
            if (stryMutAct_9fa48("8404")) {
              {}
            } else {
              stryCov_9fa48("8404");
              continue;
            }
          }
          const reportData = await this.getReportSummary(stryMutAct_9fa48("8407") ? metadata.outputReportPath && null : stryMutAct_9fa48("8406") ? false : stryMutAct_9fa48("8405") ? true : (stryCov_9fa48("8405", "8406", "8407"), metadata.outputReportPath || null), metadata.runId);
          runs.push(this.mergeRunRecord(metadata, reportData));
        }
      }
      return runs;
    }
  }

  /**
   * Return report-derived summary for one run.
   * @param {string|null} outputReportPath
   * @param {string} runId
   * @return {Promise<Object>}
   * @private
   */
  async getReportSummary(outputReportPath, runId) {
    if (stryMutAct_9fa48("8408")) {
      {}
    } else {
      stryCov_9fa48("8408");
      if (stryMutAct_9fa48("8411") ? false : stryMutAct_9fa48("8410") ? true : stryMutAct_9fa48("8409") ? outputReportPath : (stryCov_9fa48("8409", "8410", "8411"), !outputReportPath)) {
        if (stryMutAct_9fa48("8412")) {
          {}
        } else {
          stryCov_9fa48("8412");
          return stryMutAct_9fa48("8413") ? {} : (stryCov_9fa48("8413"), {
            runId
          });
        }
      }
      const reportPath = resolve(this.workspaceRoot, outputReportPath);
      const report = await tryReadJson(reportPath);
      if (stryMutAct_9fa48("8416") ? !report && typeof report !== 'object' : stryMutAct_9fa48("8415") ? false : stryMutAct_9fa48("8414") ? true : (stryCov_9fa48("8414", "8415", "8416"), (stryMutAct_9fa48("8417") ? report : (stryCov_9fa48("8417"), !report)) || (stryMutAct_9fa48("8419") ? typeof report === 'object' : stryMutAct_9fa48("8418") ? false : (stryCov_9fa48("8418", "8419"), typeof report !== (stryMutAct_9fa48("8420") ? "" : (stryCov_9fa48("8420"), 'object')))))) {
        if (stryMutAct_9fa48("8421")) {
          {}
        } else {
          stryCov_9fa48("8421");
          return stryMutAct_9fa48("8422") ? {} : (stryCov_9fa48("8422"), {
            runId
          });
        }
      }
      let reportStats = null;
      try {
        if (stryMutAct_9fa48("8423")) {
          {}
        } else {
          stryCov_9fa48("8423");
          reportStats = await stat(reportPath);
        }
      } catch {
        if (stryMutAct_9fa48("8424")) {
          {}
        } else {
          stryCov_9fa48("8424");
          reportStats = null;
        }
      }
      return this.extractReportSummary(report, runId, reportStats);
    }
  }

  /**
   * Load run details directly from report file when metadata is missing.
   * @param {string} runId
   * @return {Promise<Object|null>}
   * @private
   */
  async getReportOnlyRun(runId) {
    if (stryMutAct_9fa48("8425")) {
      {}
    } else {
      stryCov_9fa48("8425");
      const outputReportPath = join(ADMIN_TEST_RUN_PATH.OUTPUT_DIR, stryMutAct_9fa48("8426") ? `` : (stryCov_9fa48("8426"), `${runId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`));
      const reportPath = resolve(this.workspaceRoot, outputReportPath);
      const report = await tryReadJson(reportPath);
      if (stryMutAct_9fa48("8429") ? !report && typeof report !== 'object' : stryMutAct_9fa48("8428") ? false : stryMutAct_9fa48("8427") ? true : (stryCov_9fa48("8427", "8428", "8429"), (stryMutAct_9fa48("8430") ? report : (stryCov_9fa48("8430"), !report)) || (stryMutAct_9fa48("8432") ? typeof report === 'object' : stryMutAct_9fa48("8431") ? false : (stryCov_9fa48("8431", "8432"), typeof report !== (stryMutAct_9fa48("8433") ? "" : (stryCov_9fa48("8433"), 'object')))))) {
        if (stryMutAct_9fa48("8434")) {
          {}
        } else {
          stryCov_9fa48("8434");
          return null;
        }
      }
      let reportStats = null;
      try {
        if (stryMutAct_9fa48("8435")) {
          {}
        } else {
          stryCov_9fa48("8435");
          reportStats = await stat(reportPath);
        }
      } catch {
        if (stryMutAct_9fa48("8436")) {
          {}
        } else {
          stryCov_9fa48("8436");
          reportStats = null;
        }
      }
      return this.extractReportSummary(report, runId, reportStats);
    }
  }

  /**
   * Parse report JSON into run summary.
   * @param {Object} report
   * @param {string} runId
   * @param {Object|null} reportStats
   * @return {Object}
   * @private
   */
  extractReportSummary(report, runId, reportStats) {
    if (stryMutAct_9fa48("8437")) {
      {}
    } else {
      stryCov_9fa48("8437");
      return extractReportSummary(report, runId, reportStats, this.outputDir, this.workspaceRoot, this.now);
    }
  }

  /**
   * Merge two run records, preferring defined values from right.
   * @param {Object} left
   * @param {Object} right
   * @return {Object}
   * @private
   */
  mergeRunRecord(left, right) {
    if (stryMutAct_9fa48("8438")) {
      {}
    } else {
      stryCov_9fa48("8438");
      return mergeRunRecord(left, right, this.outputDir, this.workspaceRoot, stryMutAct_9fa48("8439") ? () => undefined : (stryCov_9fa48("8439"), input => this.buildProgressPayload(input)));
    }
  }

  /**
   * Safely read directory entries.
   * @param {string} dirPath
   * @return {Promise<Array<import('node:fs').Dirent>>}
   * @private
   */
  async tryReadDirectory(dirPath) {
    if (stryMutAct_9fa48("8440")) {
      {}
    } else {
      stryCov_9fa48("8440");
      try {
        if (stryMutAct_9fa48("8441")) {
          {}
        } else {
          stryCov_9fa48("8441");
          return await readdir(dirPath, stryMutAct_9fa48("8442") ? {} : (stryCov_9fa48("8442"), {
            withFileTypes: stryMutAct_9fa48("8443") ? false : (stryCov_9fa48("8443"), true)
          }));
        }
      } catch {
        if (stryMutAct_9fa48("8444")) {
          {}
        } else {
          stryCov_9fa48("8444");
          return stryMutAct_9fa48("8445") ? ["Stryker was here"] : (stryCov_9fa48("8445"), []);
        }
      }
    }
  }

  /**
   * Remove one file only if it exists under basePath.
   * @param {string} filePath
   * @param {string} basePath
   * @return {Promise<boolean>}
   * @private
   */
  async removeFileIfExists(filePath, basePath) {
    if (stryMutAct_9fa48("8446")) {
      {}
    } else {
      stryCov_9fa48("8446");
      if (stryMutAct_9fa48("8449") ? !filePath && !basePath : stryMutAct_9fa48("8448") ? false : stryMutAct_9fa48("8447") ? true : (stryCov_9fa48("8447", "8448", "8449"), (stryMutAct_9fa48("8450") ? filePath : (stryCov_9fa48("8450"), !filePath)) || (stryMutAct_9fa48("8451") ? basePath : (stryCov_9fa48("8451"), !basePath)))) {
        if (stryMutAct_9fa48("8452")) {
          {}
        } else {
          stryCov_9fa48("8452");
          return stryMutAct_9fa48("8453") ? true : (stryCov_9fa48("8453"), false);
        }
      }
      const absoluteFilePath = resolve(filePath);
      if (stryMutAct_9fa48("8456") ? false : stryMutAct_9fa48("8455") ? true : stryMutAct_9fa48("8454") ? isPathInside(basePath, absoluteFilePath) : (stryCov_9fa48("8454", "8455", "8456"), !isPathInside(basePath, absoluteFilePath))) {
        if (stryMutAct_9fa48("8457")) {
          {}
        } else {
          stryCov_9fa48("8457");
          return stryMutAct_9fa48("8458") ? true : (stryCov_9fa48("8458"), false);
        }
      }
      try {
        if (stryMutAct_9fa48("8459")) {
          {}
        } else {
          stryCov_9fa48("8459");
          const fileStats = await stat(absoluteFilePath);
          if (stryMutAct_9fa48("8462") ? false : stryMutAct_9fa48("8461") ? true : stryMutAct_9fa48("8460") ? fileStats.isFile() : (stryCov_9fa48("8460", "8461", "8462"), !fileStats.isFile())) {
            if (stryMutAct_9fa48("8463")) {
              {}
            } else {
              stryCov_9fa48("8463");
              return stryMutAct_9fa48("8464") ? true : (stryCov_9fa48("8464"), false);
            }
          }
          await removePath(absoluteFilePath, stryMutAct_9fa48("8465") ? {} : (stryCov_9fa48("8465"), {
            force: stryMutAct_9fa48("8466") ? false : (stryCov_9fa48("8466"), true)
          }));
          return stryMutAct_9fa48("8467") ? false : (stryCov_9fa48("8467"), true);
        }
      } catch {
        if (stryMutAct_9fa48("8468")) {
          {}
        } else {
          stryCov_9fa48("8468");
          return stryMutAct_9fa48("8469") ? true : (stryCov_9fa48("8469"), false);
        }
      }
    }
  }

  /**
   * Remove one directory recursively if it exists under basePath.
   * @param {string} directoryPath
   * @param {string} basePath
   * @return {Promise<boolean>}
   * @private
   */
  async removeDirectoryIfExists(directoryPath, basePath) {
    if (stryMutAct_9fa48("8470")) {
      {}
    } else {
      stryCov_9fa48("8470");
      if (stryMutAct_9fa48("8473") ? !directoryPath && !basePath : stryMutAct_9fa48("8472") ? false : stryMutAct_9fa48("8471") ? true : (stryCov_9fa48("8471", "8472", "8473"), (stryMutAct_9fa48("8474") ? directoryPath : (stryCov_9fa48("8474"), !directoryPath)) || (stryMutAct_9fa48("8475") ? basePath : (stryCov_9fa48("8475"), !basePath)))) {
        if (stryMutAct_9fa48("8476")) {
          {}
        } else {
          stryCov_9fa48("8476");
          return stryMutAct_9fa48("8477") ? true : (stryCov_9fa48("8477"), false);
        }
      }
      const absoluteDirectoryPath = resolve(directoryPath);
      if (stryMutAct_9fa48("8480") ? false : stryMutAct_9fa48("8479") ? true : stryMutAct_9fa48("8478") ? isPathInside(basePath, absoluteDirectoryPath) : (stryCov_9fa48("8478", "8479", "8480"), !isPathInside(basePath, absoluteDirectoryPath))) {
        if (stryMutAct_9fa48("8481")) {
          {}
        } else {
          stryCov_9fa48("8481");
          return stryMutAct_9fa48("8482") ? true : (stryCov_9fa48("8482"), false);
        }
      }
      try {
        if (stryMutAct_9fa48("8483")) {
          {}
        } else {
          stryCov_9fa48("8483");
          const directoryStats = await stat(absoluteDirectoryPath);
          if (stryMutAct_9fa48("8486") ? false : stryMutAct_9fa48("8485") ? true : stryMutAct_9fa48("8484") ? directoryStats.isDirectory() : (stryCov_9fa48("8484", "8485", "8486"), !directoryStats.isDirectory())) {
            if (stryMutAct_9fa48("8487")) {
              {}
            } else {
              stryCov_9fa48("8487");
              return stryMutAct_9fa48("8488") ? true : (stryCov_9fa48("8488"), false);
            }
          }
          await removePath(absoluteDirectoryPath, stryMutAct_9fa48("8489") ? {} : (stryCov_9fa48("8489"), {
            recursive: stryMutAct_9fa48("8490") ? false : (stryCov_9fa48("8490"), true),
            force: stryMutAct_9fa48("8491") ? false : (stryCov_9fa48("8491"), true)
          }));
          return stryMutAct_9fa48("8492") ? false : (stryCov_9fa48("8492"), true);
        }
      } catch {
        if (stryMutAct_9fa48("8493")) {
          {}
        } else {
          stryCov_9fa48("8493");
          return stryMutAct_9fa48("8494") ? true : (stryCov_9fa48("8494"), false);
        }
      }
    }
  }

  /**
   * Resolve git hash for tagging runs.
   * @return {Promise<string>}
   * @private
   */
  async resolveGitHash() {
    if (stryMutAct_9fa48("8495")) {
      {}
    } else {
      stryCov_9fa48("8495");
      return new Promise(resolveHash => {
        if (stryMutAct_9fa48("8496")) {
          {}
        } else {
          stryCov_9fa48("8496");
          this.execFile(GIT_HASH_COMMAND, GIT_HASH_ARGS, stryMutAct_9fa48("8497") ? {} : (stryCov_9fa48("8497"), {
            cwd: this.workspaceRoot
          }), (error, stdout) => {
            if (stryMutAct_9fa48("8498")) {
              {}
            } else {
              stryCov_9fa48("8498");
              if (stryMutAct_9fa48("8500") ? false : stryMutAct_9fa48("8499") ? true : (stryCov_9fa48("8499", "8500"), error)) {
                if (stryMutAct_9fa48("8501")) {
                  {}
                } else {
                  stryCov_9fa48("8501");
                  resolveHash(GIT_HASH_FALLBACK);
                  return;
                }
              }
              const hash = stryMutAct_9fa48("8502") ? String(stdout || EMPTY_STRING) : (stryCov_9fa48("8502"), String(stryMutAct_9fa48("8505") ? stdout && EMPTY_STRING : stryMutAct_9fa48("8504") ? false : stryMutAct_9fa48("8503") ? true : (stryCov_9fa48("8503", "8504", "8505"), stdout || EMPTY_STRING)).trim());
              resolveHash(stryMutAct_9fa48("8508") ? hash && GIT_HASH_FALLBACK : stryMutAct_9fa48("8507") ? false : stryMutAct_9fa48("8506") ? true : (stryCov_9fa48("8506", "8507", "8508"), hash || GIT_HASH_FALLBACK));
            }
          });
        }
      });
    }
  }

  /**
   * Build progress payload shape.
   * @param {Object} input
   * @param {string} input.phase
   * @param {string} input.message
   * @param {number} input.percent
   * @return {Object}
   * @private
   */
  buildProgressPayload(input) {
    if (stryMutAct_9fa48("8509")) {
      {}
    } else {
      stryCov_9fa48("8509");
      return stryMutAct_9fa48("8510") ? {} : (stryCov_9fa48("8510"), {
        phase: stryMutAct_9fa48("8513") ? input?.phase && RUN_PROGRESS_PHASE.STARTING : stryMutAct_9fa48("8512") ? false : stryMutAct_9fa48("8511") ? true : (stryCov_9fa48("8511", "8512", "8513"), (stryMutAct_9fa48("8514") ? input.phase : (stryCov_9fa48("8514"), input?.phase)) || RUN_PROGRESS_PHASE.STARTING),
        message: stryMutAct_9fa48("8517") ? input?.message && EMPTY_STRING : stryMutAct_9fa48("8516") ? false : stryMutAct_9fa48("8515") ? true : (stryCov_9fa48("8515", "8516", "8517"), (stryMutAct_9fa48("8518") ? input.message : (stryCov_9fa48("8518"), input?.message)) || EMPTY_STRING),
        percent: stryMutAct_9fa48("8519") ? Math.min(0, Math.min(100, Number(input?.percent || 0))) : (stryCov_9fa48("8519"), Math.max(0, stryMutAct_9fa48("8520") ? Math.max(100, Number(input?.percent || 0)) : (stryCov_9fa48("8520"), Math.min(100, Number(stryMutAct_9fa48("8523") ? input?.percent && 0 : stryMutAct_9fa48("8522") ? false : stryMutAct_9fa48("8521") ? true : (stryCov_9fa48("8521", "8522", "8523"), (stryMutAct_9fa48("8524") ? input.percent : (stryCov_9fa48("8524"), input?.percent)) || 0)))))),
        updatedAt: new Date(this.now()).toISOString()
      });
    }
  }

  /**
   * Update run progress and publish progress stream event on change.
   * @param {Object} run
   * @param {Object} progressUpdate
   * @return {boolean}
   * @private
   */
  updateRunProgress(run, progressUpdate) {
    if (stryMutAct_9fa48("8525")) {
      {}
    } else {
      stryCov_9fa48("8525");
      const previous = stryMutAct_9fa48("8528") ? run.progress && {} : stryMutAct_9fa48("8527") ? false : stryMutAct_9fa48("8526") ? true : (stryCov_9fa48("8526", "8527", "8528"), run.progress || {});
      const next = this.buildProgressPayload(stryMutAct_9fa48("8529") ? {} : (stryCov_9fa48("8529"), {
        phase: stryMutAct_9fa48("8532") ? progressUpdate?.phase && previous.phase : stryMutAct_9fa48("8531") ? false : stryMutAct_9fa48("8530") ? true : (stryCov_9fa48("8530", "8531", "8532"), (stryMutAct_9fa48("8533") ? progressUpdate.phase : (stryCov_9fa48("8533"), progressUpdate?.phase)) || previous.phase),
        message: stryMutAct_9fa48("8536") ? progressUpdate?.message && previous.message : stryMutAct_9fa48("8535") ? false : stryMutAct_9fa48("8534") ? true : (stryCov_9fa48("8534", "8535", "8536"), (stryMutAct_9fa48("8537") ? progressUpdate.message : (stryCov_9fa48("8537"), progressUpdate?.message)) || previous.message),
        percent: stryMutAct_9fa48("8538") ? (progressUpdate?.percent ?? previous.percent) && 0 : (stryCov_9fa48("8538"), (stryMutAct_9fa48("8539") ? progressUpdate?.percent && previous.percent : (stryCov_9fa48("8539"), (stryMutAct_9fa48("8540") ? progressUpdate.percent : (stryCov_9fa48("8540"), progressUpdate?.percent)) ?? previous.percent)) ?? 0)
      }));
      const changed = stryMutAct_9fa48("8543") ? (previous.phase !== next.phase || previous.message !== next.message) && previous.percent !== next.percent : stryMutAct_9fa48("8542") ? false : stryMutAct_9fa48("8541") ? true : (stryCov_9fa48("8541", "8542", "8543"), (stryMutAct_9fa48("8545") ? previous.phase !== next.phase && previous.message !== next.message : stryMutAct_9fa48("8544") ? false : (stryCov_9fa48("8544", "8545"), (stryMutAct_9fa48("8547") ? previous.phase === next.phase : stryMutAct_9fa48("8546") ? false : (stryCov_9fa48("8546", "8547"), previous.phase !== next.phase)) || (stryMutAct_9fa48("8549") ? previous.message === next.message : stryMutAct_9fa48("8548") ? false : (stryCov_9fa48("8548", "8549"), previous.message !== next.message)))) || (stryMutAct_9fa48("8551") ? previous.percent === next.percent : stryMutAct_9fa48("8550") ? false : (stryCov_9fa48("8550", "8551"), previous.percent !== next.percent)));
      run.progress = next;
      if (stryMutAct_9fa48("8553") ? false : stryMutAct_9fa48("8552") ? true : (stryCov_9fa48("8552", "8553"), changed)) {
        if (stryMutAct_9fa48("8554")) {
          {}
        } else {
          stryCov_9fa48("8554");
          this.publishEvent(run, stryMutAct_9fa48("8555") ? {} : (stryCov_9fa48("8555"), {
            type: ADMIN_TEST_STREAM_EVENT.PROGRESS,
            data: next
          }));
        }
      }
      return changed;
    }
  }

  /**
   * Infer progress updates from runner stdout/stderr lines.
   * @param {Object} run
   * @param {string} stream
   * @param {string} line
   * @private
   */
  updateRunProgressFromLog(run, stream, line) {
    if (stryMutAct_9fa48("8556")) {
      {}
    } else {
      stryCov_9fa48("8556");
      const update = inferProgressFromLog(stream, line, run.progress, run.scenario);
      if (stryMutAct_9fa48("8558") ? false : stryMutAct_9fa48("8557") ? true : (stryCov_9fa48("8557", "8558"), update)) {
        if (stryMutAct_9fa48("8559")) {
          {}
        } else {
          stryCov_9fa48("8559");
          this.updateRunProgress(run, update);
        }
      }
    }
  }

  /**
   * Build per-run playback output root.
   * @param {string|null} runId
   * @return {string}
   * @private
   */
  buildRunPlaybackOutputDir(runId) {
    if (stryMutAct_9fa48("8560")) {
      {}
    } else {
      stryCov_9fa48("8560");
      return buildRunPlaybackOutputDir(runId);
    }
  }

  /**
   * Build scenario output directory.
   * @param {string|null} scenarioName
   * @param {string|null} runId
   * @return {string|null}
   * @private
   */
  buildScenarioOutputDir(scenarioName, runId = null) {
    if (stryMutAct_9fa48("8561")) {
      {}
    } else {
      stryCov_9fa48("8561");
      return buildScenarioOutputDir(scenarioName, runId);
    }
  }

  /**
   * Build standard playback file paths for a scenario.
   * @param {string|null} scenarioName
   * @param {string|null} runId
   * @return {{
   *   eventsPath: string,
   *   samplesPath: string,
   *   snapshotsPath: string,
   *   manifestPath: string,
   * }|null}
   * @private
   */
  buildScenarioPlaybackPaths(scenarioName, runId = null) {
    if (stryMutAct_9fa48("8562")) {
      {}
    } else {
      stryCov_9fa48("8562");
      return buildScenarioPlaybackPaths(scenarioName, runId);
    }
  }

  /**
   * Build playback viewer URL for live follow mode.
   * @param {Object} payload
   * @param {Object} [options]
   * @return {string|null}
   * @private
   */
  buildLivePlaybackViewerUrl(payload, options = {}) {
    if (stryMutAct_9fa48("8563")) {
      {}
    } else {
      stryCov_9fa48("8563");
      return buildLivePlaybackViewerUrl(payload, options);
    }
  }

  /**
   * Capture stdout/stderr stream data and split by line.
   * @param {Object} run
   * @param {string} stream
   * @param {Buffer|string} chunk
   * @private
   */
  captureRunOutput(run, stream, chunk) {
    if (stryMutAct_9fa48("8564")) {
      {}
    } else {
      stryCov_9fa48("8564");
      const text = Buffer.isBuffer(chunk) ? chunk.toString(FILE_ENCODING) : String(chunk);
      const remainderKey = (stryMutAct_9fa48("8567") ? stream !== ADMIN_TEST_LOG_STREAM.STDOUT : stryMutAct_9fa48("8566") ? false : stryMutAct_9fa48("8565") ? true : (stryCov_9fa48("8565", "8566", "8567"), stream === ADMIN_TEST_LOG_STREAM.STDOUT)) ? stryMutAct_9fa48("8568") ? "" : (stryCov_9fa48("8568"), 'stdoutRemainder') : stryMutAct_9fa48("8569") ? "" : (stryCov_9fa48("8569"), 'stderrRemainder');
      const combined = stryMutAct_9fa48("8570") ? `` : (stryCov_9fa48("8570"), `${run[remainderKey]}${text}`);
      const parts = combined.split(CLEAN_LINE_BREAK_REGEX);
      run[remainderKey] = stryMutAct_9fa48("8573") ? parts.pop() && EMPTY_STRING : stryMutAct_9fa48("8572") ? false : stryMutAct_9fa48("8571") ? true : (stryCov_9fa48("8571", "8572", "8573"), parts.pop() || EMPTY_STRING);
      for (const rawLine of parts) {
        if (stryMutAct_9fa48("8574")) {
          {}
        } else {
          stryCov_9fa48("8574");
          const line = rawLine.replace(TRIM_CRLF_REGEX, EMPTY_STRING);
          if (stryMutAct_9fa48("8577") ? false : stryMutAct_9fa48("8576") ? true : stryMutAct_9fa48("8575") ? line : (stryCov_9fa48("8575", "8576", "8577"), !line)) {
            if (stryMutAct_9fa48("8578")) {
              {}
            } else {
              stryCov_9fa48("8578");
              continue;
            }
          }
          this.appendRunLog(run, stream, line);
        }
      }
    }
  }

  /**
   * Append one log line for a run and notify subscribers.
   * @param {Object} run
   * @param {string} stream
   * @param {string} line
   * @private
   */
  appendRunLog(run, stream, line) {
    if (stryMutAct_9fa48("8579")) {
      {}
    } else {
      stryCov_9fa48("8579");
      const entry = stryMutAct_9fa48("8580") ? {} : (stryCov_9fa48("8580"), {
        timestamp: new Date(this.now()).toISOString(),
        stream,
        line
      });
      run.logBuffer.push(entry);
      if (stryMutAct_9fa48("8584") ? run.logBuffer.length <= ADMIN_TEST_DEFAULT.LOG_LINE_LIMIT : stryMutAct_9fa48("8583") ? run.logBuffer.length >= ADMIN_TEST_DEFAULT.LOG_LINE_LIMIT : stryMutAct_9fa48("8582") ? false : stryMutAct_9fa48("8581") ? true : (stryCov_9fa48("8581", "8582", "8583", "8584"), run.logBuffer.length > ADMIN_TEST_DEFAULT.LOG_LINE_LIMIT)) {
        if (stryMutAct_9fa48("8585")) {
          {}
        } else {
          stryCov_9fa48("8585");
          run.logBuffer.shift();
        }
      }
      this.publishEvent(run, stryMutAct_9fa48("8586") ? {} : (stryCov_9fa48("8586"), {
        type: ADMIN_TEST_STREAM_EVENT.LOG,
        data: entry
      }));
      this.updateRunProgressFromLog(run, stream, line);
    }
  }

  /**
   * Finalize run status and persist metadata.
   * @param {Object} run
   * @param {number|null} code
   * @param {string|null} signal
   * @return {Promise<void>}
   * @private
   */
  async finalizeRun(run, code, signal) {
    if (stryMutAct_9fa48("8587")) {
      {}
    } else {
      stryCov_9fa48("8587");
      if (stryMutAct_9fa48("8589") ? false : stryMutAct_9fa48("8588") ? true : (stryCov_9fa48("8588", "8589"), run.stdoutRemainder)) {
        if (stryMutAct_9fa48("8590")) {
          {}
        } else {
          stryCov_9fa48("8590");
          this.appendRunLog(run, ADMIN_TEST_LOG_STREAM.STDOUT, run.stdoutRemainder);
          run.stdoutRemainder = EMPTY_STRING;
        }
      }
      if (stryMutAct_9fa48("8592") ? false : stryMutAct_9fa48("8591") ? true : (stryCov_9fa48("8591", "8592"), run.stderrRemainder)) {
        if (stryMutAct_9fa48("8593")) {
          {}
        } else {
          stryCov_9fa48("8593");
          this.appendRunLog(run, ADMIN_TEST_LOG_STREAM.STDERR, run.stderrRemainder);
          run.stderrRemainder = EMPTY_STRING;
        }
      }
      run.exitCode = (stryMutAct_9fa48("8596") ? typeof code !== 'number' : stryMutAct_9fa48("8595") ? false : stryMutAct_9fa48("8594") ? true : (stryCov_9fa48("8594", "8595", "8596"), typeof code === (stryMutAct_9fa48("8597") ? "" : (stryCov_9fa48("8597"), 'number')))) ? code : null;
      run.signal = stryMutAct_9fa48("8600") ? signal && null : stryMutAct_9fa48("8599") ? false : stryMutAct_9fa48("8598") ? true : (stryCov_9fa48("8598", "8599", "8600"), signal || null);
      run.endedAt = new Date(this.now()).toISOString();
      run.childProcess = null;
      const finalizationSnapshot = buildRunFinalizationSnapshot(run, run.exitCode);
      const finalizationState = resolveRunFinalizationState(finalizationSnapshot);
      const finalizationOutcome = buildRunFinalizationOutcome(finalizationState);
      run.status = finalizationOutcome.status;
      this.updateRunProgress(run, finalizationOutcome.progress);
      const reportSummary = await this.getReportSummary(run.outputReportPath, run.runId);
      run.playbackManifestPath = stryMutAct_9fa48("8603") ? (reportSummary.playbackManifestPath || run.playbackManifestPath) && null : stryMutAct_9fa48("8602") ? false : stryMutAct_9fa48("8601") ? true : (stryCov_9fa48("8601", "8602", "8603"), (stryMutAct_9fa48("8605") ? reportSummary.playbackManifestPath && run.playbackManifestPath : stryMutAct_9fa48("8604") ? false : (stryCov_9fa48("8604", "8605"), reportSummary.playbackManifestPath || run.playbackManifestPath)) || null);
      run.playbackManifestUrl = stryMutAct_9fa48("8608") ? (reportSummary.playbackManifestUrl || run.playbackManifestUrl) && null : stryMutAct_9fa48("8607") ? false : stryMutAct_9fa48("8606") ? true : (stryCov_9fa48("8606", "8607", "8608"), (stryMutAct_9fa48("8610") ? reportSummary.playbackManifestUrl && run.playbackManifestUrl : stryMutAct_9fa48("8609") ? false : (stryCov_9fa48("8609", "8610"), reportSummary.playbackManifestUrl || run.playbackManifestUrl)) || null);
      run.playbackViewerUrl = stryMutAct_9fa48("8613") ? (reportSummary.playbackViewerUrl || run.playbackViewerUrl || run.livePlaybackViewerUrl) && null : stryMutAct_9fa48("8612") ? false : stryMutAct_9fa48("8611") ? true : (stryCov_9fa48("8611", "8612", "8613"), (stryMutAct_9fa48("8615") ? (reportSummary.playbackViewerUrl || run.playbackViewerUrl) && run.livePlaybackViewerUrl : stryMutAct_9fa48("8614") ? false : (stryCov_9fa48("8614", "8615"), (stryMutAct_9fa48("8617") ? reportSummary.playbackViewerUrl && run.playbackViewerUrl : stryMutAct_9fa48("8616") ? false : (stryCov_9fa48("8616", "8617"), reportSummary.playbackViewerUrl || run.playbackViewerUrl)) || run.livePlaybackViewerUrl)) || null);
      run.playbackEventsPath = stryMutAct_9fa48("8620") ? (reportSummary.playbackEventsPath || run.playbackEventsPath) && null : stryMutAct_9fa48("8619") ? false : stryMutAct_9fa48("8618") ? true : (stryCov_9fa48("8618", "8619", "8620"), (stryMutAct_9fa48("8622") ? reportSummary.playbackEventsPath && run.playbackEventsPath : stryMutAct_9fa48("8621") ? false : (stryCov_9fa48("8621", "8622"), reportSummary.playbackEventsPath || run.playbackEventsPath)) || null);
      run.playbackSamplesPath = stryMutAct_9fa48("8625") ? (reportSummary.playbackSamplesPath || run.playbackSamplesPath) && null : stryMutAct_9fa48("8624") ? false : stryMutAct_9fa48("8623") ? true : (stryCov_9fa48("8623", "8624", "8625"), (stryMutAct_9fa48("8627") ? reportSummary.playbackSamplesPath && run.playbackSamplesPath : stryMutAct_9fa48("8626") ? false : (stryCov_9fa48("8626", "8627"), reportSummary.playbackSamplesPath || run.playbackSamplesPath)) || null);
      run.playbackSnapshotsPath = stryMutAct_9fa48("8630") ? (reportSummary.playbackSnapshotsPath || run.playbackSnapshotsPath) && null : stryMutAct_9fa48("8629") ? false : stryMutAct_9fa48("8628") ? true : (stryCov_9fa48("8628", "8629", "8630"), (stryMutAct_9fa48("8632") ? reportSummary.playbackSnapshotsPath && run.playbackSnapshotsPath : stryMutAct_9fa48("8631") ? false : (stryCov_9fa48("8631", "8632"), reportSummary.playbackSnapshotsPath || run.playbackSnapshotsPath)) || null);
      run.playbackEventsUrl = stryMutAct_9fa48("8635") ? (reportSummary.playbackEventsUrl || run.playbackEventsUrl) && null : stryMutAct_9fa48("8634") ? false : stryMutAct_9fa48("8633") ? true : (stryCov_9fa48("8633", "8634", "8635"), (stryMutAct_9fa48("8637") ? reportSummary.playbackEventsUrl && run.playbackEventsUrl : stryMutAct_9fa48("8636") ? false : (stryCov_9fa48("8636", "8637"), reportSummary.playbackEventsUrl || run.playbackEventsUrl)) || null);
      run.playbackSamplesUrl = stryMutAct_9fa48("8640") ? (reportSummary.playbackSamplesUrl || run.playbackSamplesUrl) && null : stryMutAct_9fa48("8639") ? false : stryMutAct_9fa48("8638") ? true : (stryCov_9fa48("8638", "8639", "8640"), (stryMutAct_9fa48("8642") ? reportSummary.playbackSamplesUrl && run.playbackSamplesUrl : stryMutAct_9fa48("8641") ? false : (stryCov_9fa48("8641", "8642"), reportSummary.playbackSamplesUrl || run.playbackSamplesUrl)) || null);
      run.playbackSnapshotsUrl = stryMutAct_9fa48("8645") ? (reportSummary.playbackSnapshotsUrl || run.playbackSnapshotsUrl) && null : stryMutAct_9fa48("8644") ? false : stryMutAct_9fa48("8643") ? true : (stryCov_9fa48("8643", "8644", "8645"), (stryMutAct_9fa48("8647") ? reportSummary.playbackSnapshotsUrl && run.playbackSnapshotsUrl : stryMutAct_9fa48("8646") ? false : (stryCov_9fa48("8646", "8647"), reportSummary.playbackSnapshotsUrl || run.playbackSnapshotsUrl)) || null);
      run.summary = stryMutAct_9fa48("8650") ? (reportSummary.summary || run.summary) && null : stryMutAct_9fa48("8649") ? false : stryMutAct_9fa48("8648") ? true : (stryCov_9fa48("8648", "8649", "8650"), (stryMutAct_9fa48("8652") ? reportSummary.summary && run.summary : stryMutAct_9fa48("8651") ? false : (stryCov_9fa48("8651", "8652"), reportSummary.summary || run.summary)) || null);
      run.examplesSummary = stryMutAct_9fa48("8655") ? (reportSummary.examplesSummary || run.examplesSummary) && null : stryMutAct_9fa48("8654") ? false : stryMutAct_9fa48("8653") ? true : (stryCov_9fa48("8653", "8654", "8655"), (stryMutAct_9fa48("8657") ? reportSummary.examplesSummary && run.examplesSummary : stryMutAct_9fa48("8656") ? false : (stryCov_9fa48("8656", "8657"), reportSummary.examplesSummary || run.examplesSummary)) || null);
      run.examplesArtifactPath = stryMutAct_9fa48("8660") ? (reportSummary.examplesArtifactPath || run.examplesArtifactPath) && null : stryMutAct_9fa48("8659") ? false : stryMutAct_9fa48("8658") ? true : (stryCov_9fa48("8658", "8659", "8660"), (stryMutAct_9fa48("8662") ? reportSummary.examplesArtifactPath && run.examplesArtifactPath : stryMutAct_9fa48("8661") ? false : (stryCov_9fa48("8661", "8662"), reportSummary.examplesArtifactPath || run.examplesArtifactPath)) || null);
      run.examplesArtifactUrl = stryMutAct_9fa48("8665") ? (reportSummary.examplesArtifactUrl || run.examplesArtifactUrl) && null : stryMutAct_9fa48("8664") ? false : stryMutAct_9fa48("8663") ? true : (stryCov_9fa48("8663", "8664", "8665"), (stryMutAct_9fa48("8667") ? reportSummary.examplesArtifactUrl && run.examplesArtifactUrl : stryMutAct_9fa48("8666") ? false : (stryCov_9fa48("8666", "8667"), reportSummary.examplesArtifactUrl || run.examplesArtifactUrl)) || null);
      await this.persistRunMetadata(run);
      this.publishStatus(run);
    }
  }

  /**
   * Notify subscribers with status event.
   * @param {Object} run
   * @private
   */
  publishStatus(run) {
    if (stryMutAct_9fa48("8668")) {
      {}
    } else {
      stryCov_9fa48("8668");
      this.publishEvent(run, stryMutAct_9fa48("8669") ? {} : (stryCov_9fa48("8669"), {
        type: ADMIN_TEST_STREAM_EVENT.STATUS,
        data: this.serializeRun(run)
      }));
    }
  }

  /**
   * Publish one event to run subscribers.
   * @param {Object} run
   * @param {Object} event
   * @private
   */
  publishEvent(run, event) {
    if (stryMutAct_9fa48("8670")) {
      {}
    } else {
      stryCov_9fa48("8670");
      for (const subscriber of run.subscribers) {
        if (stryMutAct_9fa48("8671")) {
          {}
        } else {
          stryCov_9fa48("8671");
          try {
            if (stryMutAct_9fa48("8672")) {
              {}
            } else {
              stryCov_9fa48("8672");
              subscriber(event);
            }
          } catch {
            // Ignore subscriber errors and continue.
          }
        }
      }
    }
  }

  /**
   * Persist run metadata under test-output metadata directory.
   * @param {Object} run
   * @return {Promise<void>}
   * @private
   */
  async persistRunMetadata(run) {
    if (stryMutAct_9fa48("8673")) {
      {}
    } else {
      stryCov_9fa48("8673");
      await mkdir(this.metadataDir, stryMutAct_9fa48("8674") ? {} : (stryCov_9fa48("8674"), {
        recursive: stryMutAct_9fa48("8675") ? false : (stryCov_9fa48("8675"), true)
      }));
      const metadata = stryMutAct_9fa48("8676") ? {} : (stryCov_9fa48("8676"), {
        schemaVersion: METADATA_SCHEMA_VERSION,
        runId: run.runId,
        scenario: run.scenario,
        config: run.config,
        gitHash: run.gitHash,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        status: run.status,
        outputReportPath: run.outputReportPath,
        exitCode: run.exitCode,
        signal: run.signal,
        playbackManifestPath: run.playbackManifestPath,
        playbackEventsPath: stryMutAct_9fa48("8679") ? run.playbackEventsPath && null : stryMutAct_9fa48("8678") ? false : stryMutAct_9fa48("8677") ? true : (stryCov_9fa48("8677", "8678", "8679"), run.playbackEventsPath || null),
        playbackSamplesPath: stryMutAct_9fa48("8682") ? run.playbackSamplesPath && null : stryMutAct_9fa48("8681") ? false : stryMutAct_9fa48("8680") ? true : (stryCov_9fa48("8680", "8681", "8682"), run.playbackSamplesPath || null),
        playbackSnapshotsPath: stryMutAct_9fa48("8685") ? run.playbackSnapshotsPath && null : stryMutAct_9fa48("8684") ? false : stryMutAct_9fa48("8683") ? true : (stryCov_9fa48("8683", "8684", "8685"), run.playbackSnapshotsPath || null),
        progress: stryMutAct_9fa48("8688") ? run.progress && null : stryMutAct_9fa48("8687") ? false : stryMutAct_9fa48("8686") ? true : (stryCov_9fa48("8686", "8687", "8688"), run.progress || null),
        summary: stryMutAct_9fa48("8691") ? run.summary && null : stryMutAct_9fa48("8690") ? false : stryMutAct_9fa48("8689") ? true : (stryCov_9fa48("8689", "8690", "8691"), run.summary || null),
        examplesSummary: stryMutAct_9fa48("8694") ? run.examplesSummary && null : stryMutAct_9fa48("8693") ? false : stryMutAct_9fa48("8692") ? true : (stryCov_9fa48("8692", "8693", "8694"), run.examplesSummary || null),
        examplesArtifactPath: stryMutAct_9fa48("8697") ? run.examplesArtifactPath && null : stryMutAct_9fa48("8696") ? false : stryMutAct_9fa48("8695") ? true : (stryCov_9fa48("8695", "8696", "8697"), run.examplesArtifactPath || null)
      });
      const metadataPath = this.resolveMetadataFilePath(run.runId);
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2), FILE_ENCODING);
    }
  }

  /**
   * Build metadata file path for one run.
   * @param {string} runId
   * @return {string}
   * @private
   */
  resolveMetadataFilePath(runId) {
    if (stryMutAct_9fa48("8698")) {
      {}
    } else {
      stryCov_9fa48("8698");
      return resolve(this.metadataDir, stryMutAct_9fa48("8699") ? `` : (stryCov_9fa48("8699"), `${METADATA_FILENAME_PREFIX}${runId}${METADATA_FILE_EXTENSION}`));
    }
  }

  /**
   * Convert internal run object into API shape.
   * @param {Object} run
   * @param {Object} [options]
   * @param {boolean} [options.includeLogs]
   * @return {Object}
   * @private
   */
  serializeRun(run, options = {}) {
    if (stryMutAct_9fa48("8700")) {
      {}
    } else {
      stryCov_9fa48("8700");
      return serializeRun(run, options, this.outputDir, this.workspaceRoot);
    }
  }

  /**
   * Normalize a workspace-relative path and ensure it is under output dir.
   * @param {string|null} maybePath
   * @return {string|null}
   * @private
   */
  normalizeWorkspaceRelativePath(maybePath) {
    if (stryMutAct_9fa48("8701")) {
      {}
    } else {
      stryCov_9fa48("8701");
      return normalizeWorkspaceRelativePath(maybePath, this.outputDir, this.workspaceRoot);
    }
  }

  /**
   * Build playback viewer URL for a manifest path.
   * @param {string} manifestPath
   * @return {string}
   * @private
   */
  buildPlaybackViewerUrl(manifestPath) {
    if (stryMutAct_9fa48("8702")) {
      {}
    } else {
      stryCov_9fa48("8702");
      return buildPlaybackViewerUrl(manifestPath, this.outputDir, this.workspaceRoot);
    }
  }

  /**
   * Convert output-relative path to HTTP URL path.
   * @param {string|null} outputRelativePath
   * @return {string|null}
   * @private
   */
  toOutputWebPath(outputRelativePath) {
    if (stryMutAct_9fa48("8703")) {
      {}
    } else {
      stryCov_9fa48("8703");
      return toOutputWebPath(outputRelativePath, this.outputDir, this.workspaceRoot);
    }
  }
}
export { AdminTestRunService };