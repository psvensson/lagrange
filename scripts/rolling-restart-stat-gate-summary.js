#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const CLASS_CORRUPT = 'CORRUPT';
const CLASS_NODE_EXIT = 'NODE_EXIT';
const CLASS_ORACLE_BLIND = 'ORACLE_BLIND';
const CLASS_CONVERGED = 'CONVERGED';
const CLASS_TOPOLOGY_BLOCKED = 'TOPOLOGY_BLOCKED';
const CLASS_STALLED = 'STALLED';
const CLASS_SLOW = 'SLOW';

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
  return scenario?.classification ||
    (((diagnostics.unexpectedNodeExits || []).length > 0) ?
      'unexpected_node_exit' :
      null) ||
    diagnostics.oracleBlind?.classification ||
    '';
}

function isTopologyBlockedScenario(scenario) {
  const quiescence = scenario?.details?.diagnostics?.quiescence || {};
  return scenario?.verdict === 'BLOCK_TOPOLOGY_CONVERGENCE' ||
    scenario?.verdictReason === 'topology_progress_blocked' ||
    scenario?.dominantReason === 'critical_system_spread_open' ||
    quiescence.canonicalBlocker === 'critical_system_spread_open' ||
    quiescence.state === 'critical_spread_open';
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

  let classification = CLASS_SLOW;
  if (hardBreaches > 0) {
    classification = CLASS_CORRUPT;
  } else if (oracleBlindClassification === 'unexpected_node_exit') {
    classification = CLASS_NODE_EXIT;
  } else if (oracleBlindClassification === 'oracle_blind') {
    classification = CLASS_ORACLE_BLIND;
  } else if (passed === false) {
    classification = isTopologyBlockedScenario(scenario) ?
      CLASS_TOPOLOGY_BLOCKED :
      CLASS_STALLED;
  } else if (missing === 0) {
    classification = CLASS_CONVERGED;
  } else if (
    failedNoProgress === true ||
    cyclesNoProgress >= 10 ||
    gateState === 'stalled'
  ) {
    classification = CLASS_STALLED;
  }

  return {
    passed,
    missing,
    hardBreaches,
    cyclesNoProgress,
    failedNoProgress,
    gateState,
    oracleBlind: oracleBlindClassification === 'oracle_blind',
    unexpectedNodeExit: oracleBlindClassification === 'unexpected_node_exit',
    reason: scenario?.dominantReason || 'none',
    duration: asNumber(scenario?.duration, null),
    class: classification,
  };
}

export function classifyRunReport(report = {}) {
  return classifyStatGateScenario(report.scenarios?.[0] || {});
}

function runCli(argv) {
  const [command, file] = argv;
  if (command !== 'classify-run' || !file) {
    return {
      ok: false,
      output: 'usage: rolling-restart-stat-gate-summary.js classify-run <report.json>',
    };
  }
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    ok: true,
    output: JSON.stringify(classifyRunReport(report)),
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
  CLASS_SLOW,
  CLASS_STALLED,
  CLASS_TOPOLOGY_BLOCKED,
  runCli,
};
