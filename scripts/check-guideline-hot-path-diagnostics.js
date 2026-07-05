#!/usr/bin/env node

import fs from 'node:fs/promises';
import {
  buildGuidelineViolationReport,
  getEnclosingFunctionName,
  formatGuidelineHumanSummary,
  parseSourceFile,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
  walkAst,
} from './guideline-check-shared.js';

const RULE_REFERENCE =
  'hot-path diagnostics guideline (closure ledger CL-009/CL-010/CL-011/' +
  'CL-018/CL-020): allocation-heavy serialization and unthrottled log ' +
  'emission on hot paths cause observer-effect stalls';

// Modules with profiler- or ledger-attributed event-loop impact. Each entry
// names the closure record that put it on this list. Extend the list when a
// new module is attributed in a gap-watchdog or profiler window; do not
// remove entries without a ledger record showing the path is no longer hot.
const HOT_PATH_MODULE = Object.freeze([
  // CL-012: getNodeReadinessSync read-amplification cycle
  'src/control-plane/control-plane-readiness-service-node-methods.js',
  // CL-010: recordRecoveryEpochObservation double-stringify per readiness read
  'src/control-plane/control-plane-readiness-snapshot-store.js',
  // CL-011: JSON roundtrip per cache row per read
  'src/cache/system-table-cache.js',
  // CL-018: readEntryRow full-log parse per heartbeat
  'src/raft/sqlite-log-adapter.js',
  // CL-015/CL-018: catch-up and heartbeat protocol layer
  'src/raft/liferaft.js',
  // CL-009: outbound-queue saturation warn storm (67-69% of seed log)
  'src/transport/message-router-shared-vocabulary.js',
  // CL-014: per-event CDC fan-out resolution
  'src/topology/cdc-group-propagation-routing.js',
  // CL-014: per-event CDC fan-out delivery
  'src/topology/cdc-group-propagation-delivery-methods.js',
  // --debug-logs observer effect: the emission sink itself
  'src/logging/logging-service.js',
]);

const VIOLATION_KIND = Object.freeze({
  DEEP_CLONE: 'hot_path_deep_clone',
  JSON_PARSE: 'hot_path_json_parse',
  JSON_STRINGIFY: 'hot_path_json_stringify',
  LOG_EMISSION: 'hot_path_unguarded_log_emission',
});

const VIOLATION_REASON = Object.freeze({
  [VIOLATION_KIND.DEEP_CLONE]:
    'deep clone on a hot path; reuse or share immutable snapshots instead',
  [VIOLATION_KIND.JSON_PARSE]:
    'JSON.parse on a hot path; cache parsed values or bound the scan',
  [VIOLATION_KIND.JSON_STRINGIFY]:
    'JSON.stringify on a hot path; use lazy/semantic signatures instead',
  [VIOLATION_KIND.LOG_EMISSION]:
    'unguarded log emission on a hot path; use logConsoleOnly plus a rate ' +
    'limit or suppressed counter',
});

const NODE_TYPE = Object.freeze({
  CALL_EXPRESSION: 'CallExpression',
  IDENTIFIER: 'Identifier',
  MEMBER_EXPRESSION: 'MemberExpression',
  METHOD_DEFINITION: 'MethodDefinition',
  PROPERTY: 'Property',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
});

const JSON_OBJECT_NAME = 'JSON';
const JSON_METHOD = Object.freeze({
  PARSE: 'parse',
  STRINGIFY: 'stringify',
});

const DEEP_CLONE_CALLEE_NAME = Object.freeze([
  'structuredClone',
  'deepClone',
  'cloneDeep',
  'fastJsonClone',
]);

// warn and below: the storm levels. error is excluded as a rare-path level;
// logConsoleOnly is the sanctioned hot-path emission seam and never matches.
const LOG_EMISSION_PROPERTY_NAME = Object.freeze([
  'trace',
  'debug',
  'info',
  'warn',
]);

const LOG_EMISSION_FUNCTION_NAME = Object.freeze([
  'logTrace',
  'logDebug',
  'logInfo',
  'logWarn',
]);

const VIOLATION_LABEL = 'hot-path diagnostics';
const FILE_NOT_FOUND_ERROR_CODE = 'ENOENT';
const IDENTITY_SEPARATOR = '|';
const NUMERIC_LITERAL_ZERO = 0;
const NUMERIC_LITERAL_ONE = 1;
const NUMERIC_LITERAL_TWO = 2;

const HOT_PATH_BASELINE_FILE_URL = new URL(
  './check-guideline-hot-path-diagnostics-baseline.json',
  import.meta.url,
);

function normalizeScannedPath(filePath) {
  return filePath.split('\\').join('/');
}

function isHotPathModule(filePath) {
  const normalized = normalizeScannedPath(filePath);
  return HOT_PATH_MODULE.some((modulePath) =>
    normalized === modulePath || normalized.endsWith(`/${modulePath}`));
}


function classifyCallViolationKind(node) {
  const callee = node.callee;
  if (callee?.type === NODE_TYPE.MEMBER_EXPRESSION && !callee.computed) {
    const objectName = callee.object?.type === NODE_TYPE.IDENTIFIER ?
      callee.object.name :
      null;
    const propertyName = callee.property?.type === NODE_TYPE.IDENTIFIER ?
      callee.property.name :
      null;
    if (objectName === JSON_OBJECT_NAME) {
      if (propertyName === JSON_METHOD.STRINGIFY) {
        return VIOLATION_KIND.JSON_STRINGIFY;
      }
      if (propertyName === JSON_METHOD.PARSE) {
        return VIOLATION_KIND.JSON_PARSE;
      }
      return null;
    }
    if (DEEP_CLONE_CALLEE_NAME.includes(propertyName)) {
      return VIOLATION_KIND.DEEP_CLONE;
    }
    if (LOG_EMISSION_PROPERTY_NAME.includes(propertyName)) {
      return VIOLATION_KIND.LOG_EMISSION;
    }
    if (LOG_EMISSION_FUNCTION_NAME.includes(propertyName)) {
      return VIOLATION_KIND.LOG_EMISSION;
    }
    return null;
  }
  if (callee?.type === NODE_TYPE.IDENTIFIER) {
    if (DEEP_CLONE_CALLEE_NAME.includes(callee.name)) {
      return VIOLATION_KIND.DEEP_CLONE;
    }
    if (LOG_EMISSION_FUNCTION_NAME.includes(callee.name)) {
      return VIOLATION_KIND.LOG_EMISSION;
    }
  }
  return null;
}

function collectHotPathDiagnosticsViolationsFromSource(source, filePath) {
  if (!isHotPathModule(filePath)) {
    return [];
  }
  const violations = [];
  const ast = parseSourceFile(source);
  walkAst(ast, (node, parent, ancestors) => {
    if (node.type !== NODE_TYPE.CALL_EXPRESSION) {
      return;
    }
    const kind = classifyCallViolationKind(node);
    if (!kind) {
      return;
    }
    violations.push({
      filePath: normalizeScannedPath(filePath),
      line: node.loc.start.line,
      column: node.loc.start.column,
      functionName: getEnclosingFunctionName([...ancestors, parent].filter(
        (ancestor) => ancestor)),
      kind,
      reason: VIOLATION_REASON[kind],
      ruleReference: RULE_REFERENCE,
    });
  });
  return violations;
}

// Identity deliberately excludes line/column: edits elsewhere in a hot-path
// file must not flip inherited findings to new ones. The baseline allows up
// to the inherited COUNT of findings per (file, kind, function); growth
// within a baselined function still fails.
function buildHotPathViolationIdentity(violation) {
  return [
    violation.filePath,
    violation.kind,
    violation.functionName,
  ].join(IDENTITY_SEPARATOR);
}

async function collectHotPathDiagnosticsViolations(pathsToScan, options) {
  const entryPaths = pathsToScan.length > NUMERIC_LITERAL_ZERO ?
    pathsToScan :
    [...HOT_PATH_MODULE];
  return buildGuidelineViolationReport(
    entryPaths,
    options,
    collectHotPathDiagnosticsViolationsFromSource,
  );
}

async function loadHotPathDiagnosticsBaseline() {
  try {
    const rawBaseline = await fs.readFile(HOT_PATH_BASELINE_FILE_URL, 'utf8');
    const parsedBaseline = JSON.parse(rawBaseline);
    const allowedCounts = new Map();
    for (const violation of (Array.isArray(parsedBaseline?.violations) ?
      parsedBaseline.violations :
      [])) {
      const identity = buildHotPathViolationIdentity(violation);
      allowedCounts.set(
        identity,
        (allowedCounts.get(identity) || NUMERIC_LITERAL_ZERO) +
          NUMERIC_LITERAL_ONE,
      );
    }
    return allowedCounts;
  } catch (error) {
    if (error?.code === FILE_NOT_FOUND_ERROR_CODE) {
      return new Map();
    }
    throw error;
  }
}

function summarizeViolationsByFile(violations) {
  const countsByFile = new Map();
  for (const violation of violations) {
    countsByFile.set(
      violation.filePath,
      (countsByFile.get(violation.filePath) || NUMERIC_LITERAL_ZERO) +
        NUMERIC_LITERAL_ONE,
    );
  }
  return [...countsByFile.entries()]
    .map(([filePath, violationCount]) => ({filePath, violationCount}))
    .sort((left, right) =>
      right.violationCount - left.violationCount ||
      left.filePath.localeCompare(right.filePath));
}

function applyHotPathDiagnosticsBaseline(report, baseline) {
  const newViolations = [];
  let inheritedViolationCount = NUMERIC_LITERAL_ZERO;
  let baselineViolationCount = NUMERIC_LITERAL_ZERO;
  const remainingAllowance = new Map(baseline);
  for (const allowedCount of baseline.values()) {
    baselineViolationCount += allowedCount;
  }
  for (const violation of report.violations) {
    const identity = buildHotPathViolationIdentity(violation);
    const allowance = remainingAllowance.get(identity) || NUMERIC_LITERAL_ZERO;
    if (allowance > NUMERIC_LITERAL_ZERO) {
      remainingAllowance.set(identity, allowance - NUMERIC_LITERAL_ONE);
      inheritedViolationCount += NUMERIC_LITERAL_ONE;
      continue;
    }
    newViolations.push(violation);
  }
  return {
    ...report,
    rawViolationCount: report.totalViolationCount,
    inheritedViolationCount,
    baselineViolationCount,
    totalViolationCount: newViolations.length,
    filesWithViolations: summarizeViolationsByFile(newViolations),
    violations: newViolations,
  };
}

async function collectHotPathDiagnosticsViolationsWithBaseline(
  pathsToScan,
  options = {},
) {
  const [report, baseline] = await Promise.all([
    collectHotPathDiagnosticsViolations(pathsToScan, options),
    loadHotPathDiagnosticsBaseline(),
  ]);
  return applyHotPathDiagnosticsBaseline(report, baseline);
}

function formatHumanSummary(report) {
  const summary = formatGuidelineHumanSummary(report, VIOLATION_LABEL);
  if (!Number.isFinite(report.inheritedViolationCount)) {
    return summary;
  }
  return [
    summary,
    `Matched ${report.inheritedViolationCount} inherited hot-path ` +
      'diagnostics baseline violations',
  ].join('\n');
}

const UPDATE_BASELINE_FLAG = '--update-baseline';
const BASELINE_VERSION = 1;
const JSON_INDENT = 2;

async function writeHotPathDiagnosticsBaseline(pathsToScan) {
  const report = await collectHotPathDiagnosticsViolations(pathsToScan, {});
  const baseline = {
    version: BASELINE_VERSION,
    generatedAt: new Date().toISOString(),
    rawViolationCount: report.totalViolationCount,
    violations: report.violations,
  };
  await fs.writeFile(
    HOT_PATH_BASELINE_FILE_URL,
    JSON.stringify(baseline, null, JSON_INDENT) + '\n',
    'utf8',
  );
  process.stdout.write(
    `Wrote ${report.totalViolationCount} hot-path diagnostics baseline ` +
      'entries\n',
  );
}

async function main(argv = process.argv.slice(NUMERIC_LITERAL_TWO)) {
  if (argv.includes(UPDATE_BASELINE_FLAG)) {
    await writeHotPathDiagnosticsBaseline(
      argv.filter((arg) => arg !== UPDATE_BASELINE_FLAG),
    );
    return NUMERIC_LITERAL_ZERO;
  }
  return runGuidelineCheck(
    argv,
    collectHotPathDiagnosticsViolationsWithBaseline,
    formatHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  HOT_PATH_MODULE,
  RULE_REFERENCE,
  VIOLATION_KIND,
  applyHotPathDiagnosticsBaseline,
  buildHotPathViolationIdentity,
  collectHotPathDiagnosticsViolations,
  collectHotPathDiagnosticsViolationsFromSource,
  collectHotPathDiagnosticsViolationsWithBaseline,
};
