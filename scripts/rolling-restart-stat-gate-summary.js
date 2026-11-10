#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  SCENARIO_OUTCOME,
  scenarioOutcomeOf,
} from '../test/distributed/harness/scenario-outcome.js';

const CLASS_CORRUPT = 'CORRUPT';
// Not run: the config's host topology could not carry the claim. Neither a
// cluster verdict nor healthy - classified before anything else.
const CLASS_REFUSED = 'REFUSED';
const CLASS_NODE_EXIT = 'NODE_EXIT';
const CLASS_ORACLE_BLIND = 'ORACLE_BLIND';
const CLASS_CONVERGED = 'CONVERGED';
const CLASS_TOPOLOGY_BLOCKED = 'TOPOLOGY_BLOCKED';
const CLASS_STALLED = 'STALLED';
const CLASS_SLOW = 'SLOW';
const CLASS_UNJUDGEABLE = 'UNJUDGEABLE';

const REASON_UNJUDGEABLE_EVIDENCE = 'unjudgeable_evidence';
const REASON_INVALID_REPORT_SHAPE = 'invalid_report_shape';
const REASON_UNSUPPORTED_OR_EMPTY = 'unsupported_or_empty_report';
const REASON_MALFORMED_SCENARIO = 'malformed_scenario_entry';
const REASON_UNOBSERVED_VERDICT = 'unobserved_verdict_fields';
const REASON_CONTRADICTORY_BREACH = 'contradictory_pass_with_hard_breaches';
const REASON_CONTRADICTORY_FORMATION_PASS = 'contradictory_formation_pass';
const REASON_CONTRADICTORY_FORMATION_FAIL = 'contradictory_formation_fail';
const REASON_UNKNOWN_FORMATION_VERDICT = 'unknown_formation_verdict';
const REASON_REFUSED_TOPOLOGY = 'refused_insufficient_topology';
const REASON_SCHEMA_ADMITTED = 'schema_admitted';
const REASON_CRITICAL_SPREAD_OPEN = 'critical_system_spread_open';
const REASON_SEED_LOG_UNAVAILABLE = 'seed_log_unavailable';
const FORMATION_FAILURE_REASON = 'formation_failure';
const GATE_STATE_STALLED = 'stalled';
const CYCLES_NO_PROGRESS_THRESHOLD = 10;
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';
const VERDICT_UNKNOWN = 'UNKNOWN';

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function asNumber(value, fallback = null) {
  return typeof value === 'number' && Number.isFinite(value) ?
    value :
    fallback;
}

function normalizePassed(scenario) {
  return hasOwn(scenario, 'passed') ? scenario.passed : null;
}

function classifyOracleBlind(scenario) {
  const diagnostics = scenario?.details?.diagnostics || {};
  const visibility = acknowledgedWriteVisibilityDetailsOf(scenario);
  const unexpectedNodeExit = Array.isArray(diagnostics.unexpectedNodeExits) &&
    diagnostics.unexpectedNodeExits.length > 0 ?
    'unexpected_node_exit' : null;
  const visibilityBlind = visibility?.oracleBlind === true ?
    'oracle_blind' : null;
  const candidates = [
    scenario?.classification,
    unexpectedNodeExit,
    diagnostics.oracleBlind?.classification,
    visibilityBlind,
  ];
  return candidates.find(
    (candidate) => typeof candidate === 'string' && candidate.length > 0,
  ) || '';
}

function isTopologyBlockedScenario(scenario) {
  const quiescence = scenario?.details?.diagnostics?.quiescence || {};
  return scenario?.verdict === 'BLOCK_TOPOLOGY_CONVERGENCE' ||
    scenario?.verdictReason === 'topology_progress_blocked' ||
    scenario?.dominantReason === 'critical_system_spread_open' ||
    quiescence.canonicalBlocker === 'critical_system_spread_open' ||
    quiescence.state === 'critical_spread_open';
}

const ACKNOWLEDGED_WRITE_LOSS_PATTERN =
  /Acknowledged writes missing after rolling restart/iu;

const ACKNOWLEDGED_WRITE_LOSS_CLASSIFICATIONS = Object.freeze(new Set([
  'acknowledged_before_durable_commit',
  'durable_absent_everywhere',
  'durable_partial_visibility',
]));

function acknowledgedWriteVisibilityDetailsOf(scenario) {
  return scenario?.details?.acknowledgedWriteVisibility ||
    scenario?.details?.diagnostics?.partialResult?.acknowledgedWriteVisibility ||
    null;
}

function isVisibilityCountVerified(
  acknowledgedWriteCount,
  reachableNodeCount,
) {
  return acknowledgedWriteCount !== null &&
    acknowledgedWriteCount > 0 &&
    reachableNodeCount !== null &&
    reachableNodeCount > 0;
}

function isAcknowledgedWriteLoss(visibility, classification, failureText) {
  return visibility?.lossDetected === true ||
    ACKNOWLEDGED_WRITE_LOSS_CLASSIFICATIONS.has(classification) ||
    ACKNOWLEDGED_WRITE_LOSS_PATTERN.test(failureText);
}

function resolveVisibilityVerified(visibility, countVerified) {
  if (typeof visibility?.verified !== 'boolean') return countVerified;
  return visibility.verified === true;
}

function acknowledgedWriteVisibilityOf(scenario) {
  const visibility = acknowledgedWriteVisibilityDetailsOf(scenario);
  const acknowledgedWriteCount = asNumber(
    visibility?.acknowledgedWriteCount,
    null,
  );
  const reachableNodeCount = asNumber(
    visibility?.reachableNodeCount,
    null,
  );
  const failureText = [
    scenario?.error,
    scenario?.stackTrace,
    scenario?.dominantReason,
  ].filter((value) => typeof value === 'string').join('\n');
  const countVerified = isVisibilityCountVerified(
    acknowledgedWriteCount,
    reachableNodeCount,
  );
  const classification =
    typeof visibility?.classification === 'string' ?
      visibility.classification : null;
  const unwitnessedWriteCount = Array.isArray(visibility?.unwitnessedIds) ?
    visibility.unwitnessedIds.length : 0;
  return {
    verified: resolveVisibilityVerified(visibility, countVerified),
    lossDetected:
      isAcknowledgedWriteLoss(visibility, classification, failureText),
    oracleBlind: visibility?.oracleBlind === true,
    classification,
    unwitnessedWriteCount,
    acknowledgedWriteCount,
    reachableNodeCount,
  };
}

function buildUnjudgeableResult(reason = REASON_UNJUDGEABLE_EVIDENCE) {
  return {
    passed: null,
    missing: null,
    hardBreaches: 0,
    cyclesNoProgress: 0,
    failedNoProgress: false,
    gateState: '',
    oracleBlind: false,
    unexpectedNodeExit: false,
    reason,
    closureWitnessClass: null,
    duration: null,
    acknowledgedWriteVisibility: null,
    class: CLASS_UNJUDGEABLE,
  };
}

function isScenarioUnobserved(
  scenario,
  passed,
  hardBreaches,
  missing,
  oracleBlindClassification,
  activeGate,
) {
  return passed === null &&
    missing === null &&
    hardBreaches === 0 &&
    asNumber(scenario?.invariantBreaches?.softCount, 0) === 0 &&
    oracleBlindClassification === '' &&
    activeGate.failedNoProgress !== true &&
    asNumber(activeGate.coordinatorCyclesSinceProgress, 0) === 0 &&
    !activeGate.state &&
    scenarioOutcomeOf(scenario) !== SCENARIO_OUTCOME.REFUSED;
}

function resolveScenarioFailureClass(scenario, activeGate) {
  if (isTopologyBlockedScenario(scenario)) {
    return CLASS_TOPOLOGY_BLOCKED;
  }
  const softBreaches = asNumber(scenario?.invariantBreaches?.softCount, 0);
  const cyclesNoProgress = asNumber(
    activeGate.coordinatorCyclesSinceProgress,
    0,
  );
  if (
    softBreaches > 0 &&
    activeGate.failedNoProgress !== true &&
    cyclesNoProgress < CYCLES_NO_PROGRESS_THRESHOLD &&
    activeGate.state !== GATE_STATE_STALLED
  ) {
    return CLASS_SLOW;
  }
  return CLASS_STALLED;
}

function resolveScenarioClassification(scenario, {
  hardBreaches,
  oracleBlindClassification,
  passed,
  missing,
  activeGate,
}) {
  if (scenarioOutcomeOf(scenario) === SCENARIO_OUTCOME.REFUSED) {
    return CLASS_REFUSED;
  }
  if (passed === true && hardBreaches > 0) {
    return CLASS_UNJUDGEABLE;
  }
  if (hardBreaches > 0) {
    return CLASS_CORRUPT;
  }
  if (oracleBlindClassification === 'unexpected_node_exit') {
    return CLASS_NODE_EXIT;
  }
  if (oracleBlindClassification === 'oracle_blind') {
    return CLASS_ORACLE_BLIND;
  }
  if (passed === false) {
    return resolveScenarioFailureClass(scenario, activeGate);
  }
  if (missing === 0) {
    return CLASS_CONVERGED;
  }
  const cyclesNoProgress = asNumber(
    activeGate.coordinatorCyclesSinceProgress,
    0,
  );
  if (
    activeGate.failedNoProgress === true ||
    cyclesNoProgress >= CYCLES_NO_PROGRESS_THRESHOLD ||
    activeGate.state === GATE_STATE_STALLED
  ) {
    return CLASS_STALLED;
  }
  return CLASS_SLOW;
}

export function classifyStatGateScenario(scenario = {}) {
  const activeGate = scenario?.details?.diagnostics?.activeGate || {};
  const hardBreaches = asNumber(scenario?.invariantBreaches?.hardCount, 0);
  const missing = asNumber(
    scenario?.publicationConvergence?.missingPublishedCount,
    null,
  );
  const failedNoProgress = activeGate.failedNoProgress;
  const cyclesNoProgress = asNumber(
    activeGate.coordinatorCyclesSinceProgress,
    0,
  );
  const gateState = activeGate.state || '';
  const oracleBlindClassification = classifyOracleBlind(scenario);
  const passed = normalizePassed(scenario);

  if (isScenarioUnobserved(
    scenario,
    passed,
    hardBreaches,
    missing,
    oracleBlindClassification,
    activeGate,
  )) {
    return buildUnjudgeableResult(REASON_UNOBSERVED_VERDICT);
  }

  const classification = resolveScenarioClassification(scenario, {
    hardBreaches,
    oracleBlindClassification,
    passed,
    missing,
    activeGate,
  });

  const reason = classification === CLASS_UNJUDGEABLE ?
    REASON_CONTRADICTORY_BREACH :
    (scenario?.dominantReason || 'none');

  return {
    passed,
    missing,
    hardBreaches,
    cyclesNoProgress,
    failedNoProgress,
    gateState,
    oracleBlind: oracleBlindClassification === 'oracle_blind',
    unexpectedNodeExit: oracleBlindClassification === 'unexpected_node_exit',
    reason,
    closureWitnessClass: extractClosureWitnessClass(scenario),
    duration: asNumber(scenario?.duration, null),
    acknowledgedWriteVisibility: acknowledgedWriteVisibilityOf(scenario),
    class: classification,
  };
}

const CLOSURE_WITNESS_SIGNAL_PREFIX = 'closureWitnessClass=';

// The closure-witness class is the one cross-gate trend queries group by.
// The typed classification signal only carries it for some heads; the
// active-gate diagnostics field is where the dominant TOPOLOGY_BLOCKED head
// actually records it, so read both.
function extractClosureWitnessClass(scenario) {
  const signals = scenario?.failureClassification?.signals;
  const fromSignals = Array.isArray(signals) ?
    signals.find(
      (signal) =>
        typeof signal === 'string' &&
        signal.startsWith(CLOSURE_WITNESS_SIGNAL_PREFIX),
    ) :
    null;
  if (fromSignals) {
    return fromSignals.slice(CLOSURE_WITNESS_SIGNAL_PREFIX.length);
  }
  const fromActiveGate =
    scenario?.details?.diagnostics?.activeGate?.closureWitnessClass;
  return typeof fromActiveGate === 'string' && fromActiveGate.length > 0 ?
    fromActiveGate :
    null;
}

function resolveFormationFailureClass(reason) {
  if (reason === REASON_CRITICAL_SPREAD_OPEN) {
    return CLASS_TOPOLOGY_BLOCKED;
  }
  if (reason === REASON_SEED_LOG_UNAVAILABLE) {
    return CLASS_ORACLE_BLIND;
  }
  return CLASS_STALLED;
}

function buildFormationSuccessResult(reason, firstScenario) {
  return {
    passed: true,
    missing: 0,
    hardBreaches: 0,
    cyclesNoProgress: 0,
    failedNoProgress: false,
    gateState: '',
    oracleBlind: false,
    unexpectedNodeExit: false,
    reason: reason || REASON_SCHEMA_ADMITTED,
    closureWitnessClass: extractClosureWitnessClass(firstScenario),
    duration: asNumber(firstScenario?.duration, null),
    acknowledgedWriteVisibility: acknowledgedWriteVisibilityOf(firstScenario),
    class: CLASS_CONVERGED,
  };
}

function buildFormationFailureResult(failureClass, reason, firstScenario) {
  return {
    passed: false,
    missing: null,
    hardBreaches: 0,
    cyclesNoProgress: 0,
    failedNoProgress: false,
    gateState: '',
    oracleBlind: failureClass === CLASS_ORACLE_BLIND,
    unexpectedNodeExit: false,
    reason,
    closureWitnessClass: extractClosureWitnessClass(firstScenario),
    duration: asNumber(firstScenario?.duration, null),
    acknowledgedWriteVisibility: acknowledgedWriteVisibilityOf(firstScenario),
    class: failureClass,
  };
}

function buildRefusedResult(reason) {
  return {
    passed: false,
    missing: null,
    hardBreaches: 0,
    cyclesNoProgress: 0,
    failedNoProgress: false,
    gateState: '',
    oracleBlind: false,
    unexpectedNodeExit: false,
    reason,
    closureWitnessClass: null,
    duration: null,
    acknowledgedWriteVisibility: null,
    class: CLASS_REFUSED,
  };
}

function classifyFormationReport(report) {
  const formationVerdict = report.formationVerdict;
  const verdict = formationVerdict?.verdict;
  const reason = formationVerdict?.reason || FORMATION_FAILURE_REASON;
  const firstScenario = report.standardSummary?.scenarios?.[0] ||
    report.scenarios?.[0];
  const scenarioPassed = firstScenario ? normalizePassed(firstScenario) : null;
  const summaryFailed = asNumber(report.summary?.failed, null);
  const summaryPassed = asNumber(report.summary?.passed, null);

  if (verdict === VERDICT_PASS) {
    if (summaryFailed !== null && summaryFailed > 0) {
      return buildUnjudgeableResult(REASON_CONTRADICTORY_FORMATION_PASS);
    }
    if (scenarioPassed === false) {
      return buildUnjudgeableResult(REASON_CONTRADICTORY_FORMATION_PASS);
    }
    return buildFormationSuccessResult(reason, firstScenario);
  }

  if (verdict === VERDICT_FAIL) {
    if (summaryFailed === 0 && summaryPassed !== null && summaryPassed > 0) {
      return buildUnjudgeableResult(REASON_CONTRADICTORY_FORMATION_FAIL);
    }
    if (scenarioPassed === true) {
      return buildUnjudgeableResult(REASON_CONTRADICTORY_FORMATION_FAIL);
    }
    const failureClass = resolveFormationFailureClass(reason);
    return buildFormationFailureResult(failureClass, reason, firstScenario);
  }

  if (verdict === VERDICT_UNKNOWN && reason === REASON_SEED_LOG_UNAVAILABLE) {
    return buildFormationFailureResult(CLASS_ORACLE_BLIND, reason, null);
  }

  return buildUnjudgeableResult(REASON_UNKNOWN_FORMATION_VERDICT);
}

export function classifyRunReport(report = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return buildUnjudgeableResult(REASON_INVALID_REPORT_SHAPE);
  }

  if (
    report.outcome === SCENARIO_OUTCOME.REFUSED ||
    (report.refusal && typeof report.refusal === 'object')
  ) {
    return buildRefusedResult(report.refusal?.reason || REASON_REFUSED_TOPOLOGY);
  }

  if (report.formationVerdict && typeof report.formationVerdict === 'object') {
    return classifyFormationReport(report);
  }

  const scenarios = Array.isArray(report.scenarios) ?
    report.scenarios :
    (Array.isArray(report.standardSummary?.scenarios) ?
      report.standardSummary.scenarios :
      null);

  if (!scenarios || scenarios.length === 0) {
    return buildUnjudgeableResult(REASON_UNSUPPORTED_OR_EMPTY);
  }

  const firstScenario = scenarios[0];
  if (!firstScenario || typeof firstScenario !== 'object') {
    return buildUnjudgeableResult(REASON_MALFORMED_SCENARIO);
  }

  return classifyStatGateScenario(firstScenario);
}

// --- Gate-level Wilson verdict (docs/convergence-donewhen-metric.md §5/§7a) ---
//
// §7a: the ONLY sealed closure for rolling-restart convergence is the SAFETY
// floor (0 every run) + the Wilson-95 lower bound of the PASS rate >= the
// sealed bar. Until this existed the gate emitted raw rates and the operator
// applied the bar by hand; this mechanizes that arithmetic. It does NOT
// compute a required-N: §4 deliberately deprioritizes sample-size math — an
// INCONCLUSIVE verdict just says the interval straddles the bar.

const SEALED_BARS_PATH = 'test/distributed/config/convergence-sealed-bars.json';
const WILSON_Z_95 = 1.959963985;

const GATE_VERDICT = Object.freeze({
  SAFETY_VIOLATED: 'SAFETY_VIOLATED',
  ABOVE_BAR: 'ABOVE_BAR',
  BELOW_BAR: 'BELOW_BAR',
  INCONCLUSIVE: 'INCONCLUSIVE',
  NO_SEALED_BAR: 'NO_SEALED_BAR',
});

// Pure: Wilson score interval for `successes` out of `trials` at z.
export function wilsonInterval(successes, trials, z = WILSON_Z_95) {
  if (
    !Number.isInteger(trials) || trials <= 0 ||
    !Number.isInteger(successes) || successes < 0 || successes > trials
  ) {
    return {lowerBound: null, upperBound: null, pointEstimate: null};
  }
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const halfWidth =
    (z / denominator) * Math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials));
  return {
    lowerBound: Math.max(0, center - halfWidth),
    upperBound: Math.min(1, center + halfWidth),
    pointEstimate: p,
  };
}

function loadSealedBars(path = SEALED_BARS_PATH) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// Pure: derive the gate verdict from an aggregate gate summary (the stat-gate
// OUT_JSON shape) and the sealed-bars config. Safety floor dominates: a gate
// with any CORRUPT / NODE_EXIT / ORACLE_BLIND / stale-source run can never be
// ABOVE_BAR regardless of its pass rate (§5 clause 1).
export function buildGateVerdict(gateSummary = {}, sealedBars = {}) {
  const runs = asNumber(gateSummary.runs, 0);
  const runsDetail = Array.isArray(gateSummary.runsDetail) ?
    gateSummary.runsDetail :
    [];
  const passes = runsDetail.filter((run) => run?.passed === true).length;
  const wilson = wilsonInterval(passes, runs);
  const scenarioBar = sealedBars.scenarios?.[gateSummary.scenario] || null;
  const requiresAcknowledgedWriteVisibility =
    scenarioBar?.requiresAcknowledgedWriteVisibility === true;
  const derivedAcknowledgedWriteUnverified = requiresAcknowledgedWriteVisibility ?
    runsDetail.filter(
      (run) => run?.acknowledgedWriteVisibility?.verified !== true,
    ).length :
    0;
  const derivedAcknowledgedWriteLoss = requiresAcknowledgedWriteVisibility ?
    runsDetail.filter(
      (run) => run?.acknowledgedWriteVisibility?.lossDetected === true,
    ).length :
    0;
  const safetyCounts = {
    corrupt: asNumber(gateSummary.corruptCount, 0),
    nodeExit: asNumber(gateSummary.nodeExitCount, 0),
    oracleBlind: asNumber(gateSummary.oracleBlindCount, 0),
    staleSource: asNumber(gateSummary.staleSourceRuns, 0),
    acknowledgedWriteLoss: requiresAcknowledgedWriteVisibility ?
      Math.max(
        asNumber(gateSummary.acknowledgedWriteLossCount, 0),
        derivedAcknowledgedWriteLoss,
      ) :
      0,
    acknowledgedWriteUnverified: requiresAcknowledgedWriteVisibility ?
      Math.max(
        asNumber(gateSummary.acknowledgedWriteUnverifiedCount, 0),
        derivedAcknowledgedWriteUnverified,
      ) :
      0,
  };
  const safetyClean = Object.values(safetyCounts).every((count) => count === 0);
  const bar = asNumber(scenarioBar?.wilsonLowerBoundBar, null);
  const promotionWindowMinRuns = asNumber(
    scenarioBar?.promotionWindowMinRuns,
    null,
  );

  let verdict;
  let reason;
  if (!safetyClean) {
    verdict = GATE_VERDICT.SAFETY_VIOLATED;
    reason = 'safety floor breached (must be 0 every run): ' +
      JSON.stringify(safetyCounts);
  } else if (bar === null) {
    verdict = GATE_VERDICT.NO_SEALED_BAR;
    reason = `no sealed bar for scenario "${gateSummary.scenario}" in ` +
      SEALED_BARS_PATH;
  } else if (wilson.lowerBound === null) {
    verdict = GATE_VERDICT.INCONCLUSIVE;
    reason = 'no runs to judge';
  } else if (wilson.lowerBound >= bar) {
    verdict = GATE_VERDICT.ABOVE_BAR;
    reason = `Wilson-95 lower bound ${wilson.lowerBound.toFixed(3)} >= sealed ` +
      `bar ${bar}`;
  } else if (wilson.upperBound < bar) {
    verdict = GATE_VERDICT.BELOW_BAR;
    reason = `Wilson-95 upper bound ${wilson.upperBound.toFixed(3)} < sealed ` +
      `bar ${bar}`;
  } else {
    verdict = GATE_VERDICT.INCONCLUSIVE;
    reason = `Wilson-95 interval [${wilson.lowerBound.toFixed(3)}, ` +
      `${wilson.upperBound.toFixed(3)}] straddles the sealed bar ${bar}; ` +
      'more runs would narrow it (advisory only — §4 deliberately does not ' +
      'compute a required N)';
  }

  const promotionNote =
    promotionWindowMinRuns !== null && runs < promotionWindowMinRuns ?
      `promotion verdicts require an N>=${promotionWindowMinRuns} ` +
        `fixed-code window (§5); this gate has N=${runs}` :
      null;

  return {
    verdict,
    reason,
    passes,
    runs,
    wilson: {
      lowerBound: wilson.lowerBound,
      upperBound: wilson.upperBound,
      pointEstimate: wilson.pointEstimate,
      confidence: 0.95,
    },
    safetyCounts,
    safetyClean,
    sealedBar: bar,
    promotionNote,
  };
}

function formatGateVerdictMarkdown(gateVerdict) {
  const wilson = gateVerdict.wilson;
  const interval = wilson.lowerBound === null ?
    'n/a' :
    `[${wilson.lowerBound.toFixed(3)}, ${wilson.upperBound.toFixed(3)}]`;
  const lines = [
    '',
    '## sealed-bar verdict (docs/convergence-donewhen-metric.md §5)',
    `- **verdict: ${gateVerdict.verdict}** — ${gateVerdict.reason}`,
    `- passes: ${gateVerdict.passes}/${gateVerdict.runs} ` +
      `(point estimate ${wilson.pointEstimate === null ?
        'n/a' :
        wilson.pointEstimate.toFixed(3)})`,
    `- Wilson-95 interval: ${interval}; sealed bar: ${gateVerdict.sealedBar}`,
    `- safety floor clean: ${gateVerdict.safetyClean} ` +
      JSON.stringify(gateVerdict.safetyCounts),
  ];
  if (gateVerdict.promotionNote) {
    lines.push(`- note: ${gateVerdict.promotionNote}`);
  }
  return lines.join('\n');
}

function runCli(argv) {
  const [command, file] = argv;
  if (command === 'classify-run' && file) {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ok: true,
      output: JSON.stringify(classifyRunReport(report)),
    };
  }
  if (command === 'gate-verdict' && file) {
    const gateSummary = JSON.parse(fs.readFileSync(file, 'utf8'));
    const gateVerdict = buildGateVerdict(gateSummary, loadSealedBars());
    return {
      ok: true,
      output: JSON.stringify(gateVerdict),
    };
  }
  if (command === 'gate-verdict-md' && file) {
    const gateSummary = JSON.parse(fs.readFileSync(file, 'utf8'));
    const gateVerdict = buildGateVerdict(gateSummary, loadSealedBars());
    return {
      ok: true,
      output: formatGateVerdictMarkdown(gateVerdict),
    };
  }
  return {
    ok: false,
    output: 'usage: rolling-restart-stat-gate-summary.js ' +
      '<classify-run|gate-verdict|gate-verdict-md> <file.json>',
  };
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const result = runCli(process.argv.slice(2));
  (result.ok ? process.stdout : process.stderr).write(`${result.output}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

export {
  CLASS_CONVERGED,
  CLASS_CORRUPT,
  CLASS_NODE_EXIT,
  CLASS_ORACLE_BLIND,
  CLASS_REFUSED,
  CLASS_SLOW,
  CLASS_STALLED,
  CLASS_TOPOLOGY_BLOCKED,
  CLASS_UNJUDGEABLE,
  GATE_VERDICT,
  runCli,
};
