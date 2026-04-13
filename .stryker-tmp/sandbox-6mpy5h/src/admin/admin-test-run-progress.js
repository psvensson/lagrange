/**
 * Progress inference for admin test runs.
 * Owns log-line pattern matching and progress phase/percent derivation.
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
import { ADMIN_TEST_LOG_STREAM } from './admin-constants.js';
const EMPTY_STRING = stryMutAct_9fa48("7373") ? "Stryker was here!" : (stryCov_9fa48("7373"), '');
const RUN_PROGRESS_PHASE = Object.freeze(stryMutAct_9fa48("7374") ? {} : (stryCov_9fa48("7374"), {
  STARTING: stryMutAct_9fa48("7375") ? "" : (stryCov_9fa48("7375"), 'starting'),
  BUILDING_IMAGE: stryMutAct_9fa48("7376") ? "" : (stryCov_9fa48("7376"), 'building-image'),
  SCENARIO_RUNNING: stryMutAct_9fa48("7377") ? "" : (stryCov_9fa48("7377"), 'scenario-running'),
  STOPPING: stryMutAct_9fa48("7378") ? "" : (stryCov_9fa48("7378"), 'stopping'),
  COMPLETED: stryMutAct_9fa48("7379") ? "" : (stryCov_9fa48("7379"), 'completed'),
  FAILED: stryMutAct_9fa48("7380") ? "" : (stryCov_9fa48("7380"), 'failed'),
  STOPPED: stryMutAct_9fa48("7381") ? "" : (stryCov_9fa48("7381"), 'stopped')
}));
const RUN_PROGRESS_PERCENT = Object.freeze(stryMutAct_9fa48("7382") ? {} : (stryCov_9fa48("7382"), {
  CONFIG_LOADING: 2,
  CONFIG_LOADED: 4,
  PRECHECK_COMPLETE: 6,
  SCENARIO_DISCOVERY: 25,
  SCENARIO_FOUND: 30
}));
const SCENARIO_START_PATTERN = stryMutAct_9fa48("7387") ? /^Running scenario:\s*(.)$/i : stryMutAct_9fa48("7386") ? /^Running scenario:\S*(.+)$/i : stryMutAct_9fa48("7385") ? /^Running scenario:\s(.+)$/i : stryMutAct_9fa48("7384") ? /^Running scenario:\s*(.+)/i : stryMutAct_9fa48("7383") ? /Running scenario:\s*(.+)$/i : (stryCov_9fa48("7383", "7384", "7385", "7386", "7387"), /^Running scenario:\s*(.+)$/i);
const STDERR_FALLBACK_PERCENT = 40;
const STDERR_SUPPRESS_THRESHOLD = 90;

/**
 * Table-driven progress rules. Each entry maps a regex to a
 * phase and minimum percent. Evaluated in order; first match wins.
 * @type {Array<{pattern: RegExp, phase: string, percent: number,
 *   message?: string}>}
 */
const PROGRESS_RULES = Object.freeze(stryMutAct_9fa48("7388") ? [] : (stryCov_9fa48("7388"), [stryMutAct_9fa48("7389") ? {} : (stryCov_9fa48("7389"), {
  pattern: stryMutAct_9fa48("7390") ? /Loading config:/i : (stryCov_9fa48("7390"), /^Loading config:/i),
  phase: RUN_PROGRESS_PHASE.STARTING,
  percent: RUN_PROGRESS_PERCENT.CONFIG_LOADING
}), stryMutAct_9fa48("7391") ? {} : (stryCov_9fa48("7391"), {
  pattern: stryMutAct_9fa48("7392") ? /Config loaded:/i : (stryCov_9fa48("7392"), /^Config loaded:/i),
  phase: RUN_PROGRESS_PHASE.STARTING,
  percent: RUN_PROGRESS_PERCENT.CONFIG_LOADED
}), stryMutAct_9fa48("7393") ? {} : (stryCov_9fa48("7393"), {
  pattern: stryMutAct_9fa48("7394") ? /Discovering scenarios/i : (stryCov_9fa48("7394"), /^Discovering scenarios/i),
  phase: RUN_PROGRESS_PHASE.STARTING,
  percent: RUN_PROGRESS_PERCENT.SCENARIO_DISCOVERY
}), stryMutAct_9fa48("7395") ? {} : (stryCov_9fa48("7395"), {
  pattern: stryMutAct_9fa48("7398") ? /^Found \D+ scenario\(s\)/i : stryMutAct_9fa48("7397") ? /^Found \d scenario\(s\)/i : stryMutAct_9fa48("7396") ? /Found \d+ scenario\(s\)/i : (stryCov_9fa48("7396", "7397", "7398"), /^Found \d+ scenario\(s\)/i),
  phase: RUN_PROGRESS_PHASE.STARTING,
  percent: RUN_PROGRESS_PERCENT.SCENARIO_FOUND
}), stryMutAct_9fa48("7399") ? {} : (stryCov_9fa48("7399"), {
  pattern: stryMutAct_9fa48("7400") ? /Building Docker image/i : (stryCov_9fa48("7400"), /^Building Docker image/i),
  phase: RUN_PROGRESS_PHASE.BUILDING_IMAGE,
  percent: 5,
  message: stryMutAct_9fa48("7401") ? "" : (stryCov_9fa48("7401"), 'Building Docker image')
}), stryMutAct_9fa48("7402") ? {} : (stryCov_9fa48("7402"), {
  pattern: stryMutAct_9fa48("7403") ? /Image built:/i : (stryCov_9fa48("7403"), /^Image built:/i),
  phase: RUN_PROGRESS_PHASE.BUILDING_IMAGE,
  percent: 20
}), stryMutAct_9fa48("7404") ? {} : (stryCov_9fa48("7404"), {
  pattern: stryMutAct_9fa48("7405") ? /Scenario passed:/i : (stryCov_9fa48("7405"), /^Scenario passed:/i),
  phase: RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
  percent: 95
}), stryMutAct_9fa48("7406") ? {} : (stryCov_9fa48("7406"), {
  pattern: stryMutAct_9fa48("7407") ? /Scenario failed:/i : (stryCov_9fa48("7407"), /^Scenario failed:/i),
  phase: RUN_PROGRESS_PHASE.FAILED,
  percent: 95
})]));

/**
 * Try matching a table-driven progress rule.
 * @param {string} text - Trimmed log line.
 * @param {number} currentPercent - Current progress percent.
 * @return {{phase: string, message: string, percent: number}|null}
 */
function matchProgressRule(text, currentPercent) {
  if (stryMutAct_9fa48("7408")) {
    {}
  } else {
    stryCov_9fa48("7408");
    for (const rule of PROGRESS_RULES) {
      if (stryMutAct_9fa48("7409")) {
        {}
      } else {
        stryCov_9fa48("7409");
        if (stryMutAct_9fa48("7411") ? false : stryMutAct_9fa48("7410") ? true : (stryCov_9fa48("7410", "7411"), rule.pattern.test(text))) {
          if (stryMutAct_9fa48("7412")) {
            {}
          } else {
            stryCov_9fa48("7412");
            return stryMutAct_9fa48("7413") ? {} : (stryCov_9fa48("7413"), {
              phase: rule.phase,
              message: stryMutAct_9fa48("7416") ? rule.message && text : stryMutAct_9fa48("7415") ? false : stryMutAct_9fa48("7414") ? true : (stryCov_9fa48("7414", "7415", "7416"), rule.message || text),
              percent: stryMutAct_9fa48("7417") ? Math.min(rule.percent, currentPercent) : (stryCov_9fa48("7417"), Math.max(rule.percent, currentPercent))
            });
          }
        }
      }
    }
    return null;
  }
}

/**
 * Try matching the scenario-start capture pattern.
 * @param {string} text - Trimmed log line.
 * @param {number} currentPercent - Current progress percent.
 * @param {string|null} scenarioName - Active scenario name.
 * @return {{phase: string, message: string, percent: number}|null}
 */
function matchScenarioStart(text, currentPercent, scenarioName) {
  if (stryMutAct_9fa48("7418")) {
    {}
  } else {
    stryCov_9fa48("7418");
    const match = text.match(SCENARIO_START_PATTERN);
    if (stryMutAct_9fa48("7421") ? false : stryMutAct_9fa48("7420") ? true : stryMutAct_9fa48("7419") ? match : (stryCov_9fa48("7419", "7420", "7421"), !match)) {
      if (stryMutAct_9fa48("7422")) {
        {}
      } else {
        stryCov_9fa48("7422");
        return null;
      }
    }
    return stryMutAct_9fa48("7423") ? {} : (stryCov_9fa48("7423"), {
      phase: RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
      message: stryMutAct_9fa48("7424") ? `` : (stryCov_9fa48("7424"), `Running ${stryMutAct_9fa48("7427") ? (match[1] || scenarioName) && 'scenario' : stryMutAct_9fa48("7426") ? false : stryMutAct_9fa48("7425") ? true : (stryCov_9fa48("7425", "7426", "7427"), (stryMutAct_9fa48("7429") ? match[1] && scenarioName : stryMutAct_9fa48("7428") ? false : (stryCov_9fa48("7428", "7429"), match[1] || scenarioName)) || (stryMutAct_9fa48("7430") ? "" : (stryCov_9fa48("7430"), 'scenario')))}`),
      percent: stryMutAct_9fa48("7431") ? Math.min(35, currentPercent) : (stryCov_9fa48("7431"), Math.max(35, currentPercent))
    });
  }
}

/**
 * Infer a progress update descriptor from a log line.
 * Returns null when the line does not match any known pattern.
 *
 * @param {string} stream - Log stream identifier.
 * @param {string} line - Raw log line text.
 * @param {Object} currentProgress - Current run progress state.
 * @param {string|null} scenarioName - Active scenario name.
 * @return {{phase: string, message: string, percent: number}|null}
 */
function inferProgressFromLog(stream, line, currentProgress, scenarioName) {
  if (stryMutAct_9fa48("7432")) {
    {}
  } else {
    stryCov_9fa48("7432");
    const text = stryMutAct_9fa48("7433") ? String(line || EMPTY_STRING) : (stryCov_9fa48("7433"), String(stryMutAct_9fa48("7436") ? line && EMPTY_STRING : stryMutAct_9fa48("7435") ? false : stryMutAct_9fa48("7434") ? true : (stryCov_9fa48("7434", "7435", "7436"), line || EMPTY_STRING)).trim());
    if (stryMutAct_9fa48("7439") ? false : stryMutAct_9fa48("7438") ? true : stryMutAct_9fa48("7437") ? text : (stryCov_9fa48("7437", "7438", "7439"), !text)) {
      if (stryMutAct_9fa48("7440")) {
        {}
      } else {
        stryCov_9fa48("7440");
        return null;
      }
    }
    const currentPercent = Number(stryMutAct_9fa48("7443") ? currentProgress?.percent && 0 : stryMutAct_9fa48("7442") ? false : stryMutAct_9fa48("7441") ? true : (stryCov_9fa48("7441", "7442", "7443"), (stryMutAct_9fa48("7444") ? currentProgress.percent : (stryCov_9fa48("7444"), currentProgress?.percent)) || 0));
    const ruleMatch = matchProgressRule(text, currentPercent);
    if (stryMutAct_9fa48("7446") ? false : stryMutAct_9fa48("7445") ? true : (stryCov_9fa48("7445", "7446"), ruleMatch)) {
      if (stryMutAct_9fa48("7447")) {
        {}
      } else {
        stryCov_9fa48("7447");
        return ruleMatch;
      }
    }
    const scenarioMatch = matchScenarioStart(text, currentPercent, scenarioName);
    if (stryMutAct_9fa48("7449") ? false : stryMutAct_9fa48("7448") ? true : (stryCov_9fa48("7448", "7449"), scenarioMatch)) {
      if (stryMutAct_9fa48("7450")) {
        {}
      } else {
        stryCov_9fa48("7450");
        return scenarioMatch;
      }
    }
    const isStderrBelow = stryMutAct_9fa48("7453") ? stream === ADMIN_TEST_LOG_STREAM.STDERR || currentPercent < STDERR_SUPPRESS_THRESHOLD : stryMutAct_9fa48("7452") ? false : stryMutAct_9fa48("7451") ? true : (stryCov_9fa48("7451", "7452", "7453"), (stryMutAct_9fa48("7455") ? stream !== ADMIN_TEST_LOG_STREAM.STDERR : stryMutAct_9fa48("7454") ? true : (stryCov_9fa48("7454", "7455"), stream === ADMIN_TEST_LOG_STREAM.STDERR)) && (stryMutAct_9fa48("7458") ? currentPercent >= STDERR_SUPPRESS_THRESHOLD : stryMutAct_9fa48("7457") ? currentPercent <= STDERR_SUPPRESS_THRESHOLD : stryMutAct_9fa48("7456") ? true : (stryCov_9fa48("7456", "7457", "7458"), currentPercent < STDERR_SUPPRESS_THRESHOLD)));
    if (stryMutAct_9fa48("7461") ? false : stryMutAct_9fa48("7460") ? true : stryMutAct_9fa48("7459") ? isStderrBelow : (stryCov_9fa48("7459", "7460", "7461"), !isStderrBelow)) {
      if (stryMutAct_9fa48("7462")) {
        {}
      } else {
        stryCov_9fa48("7462");
        return null;
      }
    }
    return stryMutAct_9fa48("7463") ? {} : (stryCov_9fa48("7463"), {
      phase: stryMutAct_9fa48("7466") ? currentProgress?.phase && RUN_PROGRESS_PHASE.SCENARIO_RUNNING : stryMutAct_9fa48("7465") ? false : stryMutAct_9fa48("7464") ? true : (stryCov_9fa48("7464", "7465", "7466"), (stryMutAct_9fa48("7467") ? currentProgress.phase : (stryCov_9fa48("7467"), currentProgress?.phase)) || RUN_PROGRESS_PHASE.SCENARIO_RUNNING),
      message: text,
      percent: stryMutAct_9fa48("7468") ? Math.min(STDERR_FALLBACK_PERCENT, currentPercent) : (stryCov_9fa48("7468"), Math.max(STDERR_FALLBACK_PERCENT, currentPercent))
    });
  }
}
export { inferProgressFromLog, RUN_PROGRESS_PERCENT, RUN_PROGRESS_PHASE };