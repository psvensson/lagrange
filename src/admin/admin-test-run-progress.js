/**
 * Progress inference for admin test runs.
 * Owns log-line pattern matching and progress phase/percent derivation.
 */

import {ADMIN_TEST_LOG_STREAM} from './admin-constants.js';

const LOCAL_STR_SCENARIO = 'scenario';
const LOCAL_NUM_THIRTY_FIVE = 35;

const EMPTY_STRING = '';

const RUN_PROGRESS_PHASE = Object.freeze({
  STARTING: 'starting',
  BUILDING_IMAGE: 'building-image',
  SCENARIO_RUNNING: 'scenario-running',
  STOPPING: 'stopping',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped',
});

const RUN_PROGRESS_PERCENT = Object.freeze({
  CONFIG_LOADING: 2,
  CONFIG_LOADED: 4,
  PRECHECK_COMPLETE: 6,
  SCENARIO_DISCOVERY: 25,
  SCENARIO_FOUND: 30,
});

const SCENARIO_START_PATTERN = /^Running scenario:\s*(.+)$/i;
const STDERR_FALLBACK_PERCENT = 40;
const STDERR_SUPPRESS_THRESHOLD = 90;

/**
 * Table-driven progress rules. Each entry maps a regex to a
 * phase and minimum percent. Evaluated in order; first match wins.
 * @type {Array<{pattern: RegExp, phase: string, percent: number,
 *   message?: string}>}
 */
const PROGRESS_RULES = Object.freeze([
  {
    pattern: /^Loading config:/i,
    phase: RUN_PROGRESS_PHASE.STARTING,
    percent: RUN_PROGRESS_PERCENT.CONFIG_LOADING,
  },
  {
    pattern: /^Config loaded:/i,
    phase: RUN_PROGRESS_PHASE.STARTING,
    percent: RUN_PROGRESS_PERCENT.CONFIG_LOADED,
  },
  {
    pattern: /^Discovering scenarios/i,
    phase: RUN_PROGRESS_PHASE.STARTING,
    percent: RUN_PROGRESS_PERCENT.SCENARIO_DISCOVERY,
  },
  {
    pattern: /^Found \d+ scenario\(s\)/i,
    phase: RUN_PROGRESS_PHASE.STARTING,
    percent: RUN_PROGRESS_PERCENT.SCENARIO_FOUND,
  },
  {
    pattern: /^Building Docker image/i,
    phase: RUN_PROGRESS_PHASE.BUILDING_IMAGE,
    percent: 5,
    message: 'Building Docker image',
  },
  {
    pattern: /^Image built:/i,
    phase: RUN_PROGRESS_PHASE.BUILDING_IMAGE,
    percent: 20,
  },
  {
    pattern: /^Scenario passed:/i,
    phase: RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
    percent: 95,
  },
  {
    pattern: /^Scenario failed:/i,
    phase: RUN_PROGRESS_PHASE.FAILED,
    percent: 95,
  },
]);

/**
 * Try matching a table-driven progress rule.
 * @param {string} text - Trimmed log line.
 * @param {number} currentPercent - Current progress percent.
 * @return {{phase: string, message: string, percent: number}|null}
 */
function matchProgressRule(text, currentPercent) {
  for (const rule of PROGRESS_RULES) {
    if (rule.pattern.test(text)) {
      return {
        phase: rule.phase,
        message: rule.message || text,
        percent: Math.max(rule.percent, currentPercent),
      };
    }
  }
  return null;
}

/**
 * Try matching the scenario-start capture pattern.
 * @param {string} text - Trimmed log line.
 * @param {number} currentPercent - Current progress percent.
 * @param {string|null} scenarioName - Active scenario name.
 * @return {{phase: string, message: string, percent: number}|null}
 */
function matchScenarioStart(text, currentPercent, scenarioName) {
  const match = text.match(SCENARIO_START_PATTERN);
  if (!match) {
    return null;
  }
  return {
    phase: RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
    message: `Running ${match[1] || scenarioName || LOCAL_STR_SCENARIO}`,
    percent: Math.max(LOCAL_NUM_THIRTY_FIVE, currentPercent),
  };
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
function inferProgressFromLog(
  stream, line, currentProgress, scenarioName,
) {
  const text = String(line || EMPTY_STRING).trim();
  if (!text) {
    return null;
  }

  const currentPercent = Number(currentProgress?.percent || 0);

  const ruleMatch = matchProgressRule(text, currentPercent);
  if (ruleMatch) {
    return ruleMatch;
  }

  const scenarioMatch = matchScenarioStart(
    text, currentPercent, scenarioName,
  );
  if (scenarioMatch) {
    return scenarioMatch;
  }

  const isStderrBelow = stream === ADMIN_TEST_LOG_STREAM.STDERR &&
    currentPercent < STDERR_SUPPRESS_THRESHOLD;
  if (!isStderrBelow) {
    return null;
  }

  return {
    phase: currentProgress?.phase ||
      RUN_PROGRESS_PHASE.SCENARIO_RUNNING,
    message: text,
    percent: Math.max(STDERR_FALLBACK_PERCENT, currentPercent),
  };
}

export {
  inferProgressFromLog,
  RUN_PROGRESS_PERCENT,
  RUN_PROGRESS_PHASE,
};
