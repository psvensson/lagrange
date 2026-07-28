#!/usr/bin/env node

// Ambient-intrinsic method calls in evidence-admitting trees.
//
// The adversarial-js-intrinsics verification template (item 6) rejects any
// candidate whose validation calls mutable prototype methods (String.prototype
// .trim/.split/.indexOf, ambient Array.prototype iteration helpers) directly
// on external data: hostile code that replaces the intrinsic can invert oracle
// admission. Verifiers rejected candidates for exactly this on 2026-07-28
// across four quests (change-rate-crossover, negative-controls,
// request-enrichment, scale-certification-receipt-freshness), one rejection
// round each. The template's own index mandates that a checklist item which
// passes review while the defect ships twice be promoted to a machine check —
// this audit is that promotion. The convention it enforces is the one the
// harness tree already uses in 200+ files: capture the intrinsic at module
// load (const stringTrim = Function.call.bind(String.prototype.trim)) and
// call the capture. A count baseline freezes the existing debt; only NEW
// direct calls block, so migration stays opportunistic.

import {
  applyCountBaseline,
  buildGuidelineViolationReport,
  getEnclosingFunctionName,
  formatGuidelineHumanSummary,
  loadCountBaseline,
  parseSourceFile,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
  walkAst,
  writeCountBaseline,
} from './guideline-check-shared.js';

const RULE_REFERENCE =
  'adversarial-js-intrinsics guideline (template item 6): a direct ambient ' +
  'prototype-method call on data that may be external lets a replaced ' +
  'intrinsic invert admission; capture the intrinsic at module load ' +
  '(Function.call.bind) or use a shared hardened primitive instead';

const VIOLATION_KIND = Object.freeze({
  AMBIENT_INTRINSIC_CALL: 'ambient_intrinsic_call',
});

const NODE_TYPE = Object.freeze({
  CALL_EXPRESSION: 'CallExpression',
  MEMBER_EXPRESSION: 'MemberExpression',
  IDENTIFIER: 'Identifier',
});

// Prototype methods the verification template names, plus the ones named in
// recorded verifier rejections. `join` and `test` are deliberately absent:
// they collide with path.join and tap's t.test far more often than they admit
// external data, and a noisy rule teaches operators to ignore the audit.
const AMBIENT_METHOD_NAMES = Object.freeze(new Set([
  'trim', 'trimStart', 'trimEnd',
  'split', 'replace', 'replaceAll',
  'indexOf', 'lastIndexOf', 'includes',
  'startsWith', 'endsWith',
  'toLowerCase', 'toUpperCase',
  'padStart', 'padEnd',
  'map', 'filter', 'some', 'every', 'find', 'findIndex', 'flatMap',
]));

// Receivers whose members are namespace functions, not prototype methods on
// data: a capture site (String.prototype.trim) or a frozen own-module table.
const NAMESPACE_RECEIVER_NAMES = Object.freeze(new Set([
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Reflect', 'JSON',
  'Math', 'Promise', 'Symbol', 'BigInt', 'Date', 'RegExp',
]));

// Only the evidence-admitting trees are governed; the audit self-filters so a
// caller (the attempt-seal static gate) may pass its whole changed-path set.
const GOVERNED_PATH_PREFIXES = Object.freeze([
  'test/distributed/harness',
  'scripts/checks',
]);

const VIOLATION_LABEL = 'ambient-intrinsic call';
const BASELINE_LABEL = 'ambient-intrinsics';
const REASON_PREFIX = 'direct ambient .';
const REASON_SUFFIX =
  '() call; use a module-load capture or a shared hardened primitive';
const INHERITED_SUMMARY_SUFFIX =
  ' inherited ambient-intrinsic baseline violations';
const IDENTITY_SEPARATOR = '|';
const LINE_SEPARATOR = '\n';
const NUMERIC_LITERAL_ZERO = 0;
const NUMERIC_LITERAL_TWO = 2;
const PATH_SEPARATOR = '/';

const DEFAULT_SCAN_ROOTS = Object.freeze([...GOVERNED_PATH_PREFIXES]);

const AMBIENT_INTRINSICS_BASELINE_FILE_URL = new URL(
  './check-guideline-ambient-intrinsics-baseline.json',
  import.meta.url,
);

function isGovernedPath(filePath) {
  const normalized = String(filePath || '').split('\\').join(PATH_SEPARATOR);
  return GOVERNED_PATH_PREFIXES.some((prefix) =>
    normalized === prefix || normalized.includes(`${prefix}${PATH_SEPARATOR}`));
}

function ambientCalleeMethodName(callee) {
  if (callee?.type !== NODE_TYPE.MEMBER_EXPRESSION || callee.computed) {
    return null;
  }
  if (callee.property?.type !== NODE_TYPE.IDENTIFIER) return null;
  if (!AMBIENT_METHOD_NAMES.has(callee.property.name)) return null;
  const receiver = callee.object;
  if (receiver?.type === NODE_TYPE.IDENTIFIER &&
      NAMESPACE_RECEIVER_NAMES.has(receiver.name)) {
    return null;
  }
  return callee.property.name;
}

function collectAmbientIntrinsicViolationsFromSource(source, filePath) {
  const violations = [];
  if (!isGovernedPath(filePath)) return violations;
  const ast = parseSourceFile(source);
  walkAst(ast, (node, parent, ancestors) => {
    if (node?.type !== NODE_TYPE.CALL_EXPRESSION) return;
    const methodName = ambientCalleeMethodName(node.callee);
    if (!methodName) return;
    violations.push({
      filePath,
      line: node.loc?.start?.line ?? NUMERIC_LITERAL_ZERO,
      column: node.loc?.start?.column ?? NUMERIC_LITERAL_ZERO,
      functionName: getEnclosingFunctionName(ancestors),
      kind: VIOLATION_KIND.AMBIENT_INTRINSIC_CALL,
      methodName,
      reason: `${REASON_PREFIX}${methodName}${REASON_SUFFIX}`,
      ruleReference: RULE_REFERENCE,
    });
  });
  return violations;
}

function buildAmbientIntrinsicViolationIdentity(violation) {
  return [
    violation.filePath,
    violation.kind,
    violation.methodName,
    violation.functionName,
  ].join(IDENTITY_SEPARATOR);
}

async function collectAmbientIntrinsicViolations(pathsToScan, options) {
  const entryPaths = pathsToScan.length > NUMERIC_LITERAL_ZERO ?
    pathsToScan :
    [...DEFAULT_SCAN_ROOTS];
  return buildGuidelineViolationReport(
    entryPaths,
    options,
    collectAmbientIntrinsicViolationsFromSource,
  );
}

async function collectAmbientIntrinsicViolationsWithBaseline(
  pathsToScan,
  options = {},
) {
  const [report, baseline] = await Promise.all([
    collectAmbientIntrinsicViolations(pathsToScan, options),
    loadCountBaseline(
      AMBIENT_INTRINSICS_BASELINE_FILE_URL,
      buildAmbientIntrinsicViolationIdentity,
    ),
  ]);
  return applyCountBaseline(
    report,
    baseline,
    buildAmbientIntrinsicViolationIdentity,
  );
}

function formatHumanSummary(report) {
  const summary = formatGuidelineHumanSummary(report, VIOLATION_LABEL);
  if (!Number.isFinite(report.inheritedViolationCount)) {
    return summary;
  }
  return [
    summary,
    `Matched ${report.inheritedViolationCount}${INHERITED_SUMMARY_SUFFIX}`,
  ].join(LINE_SEPARATOR);
}

const UPDATE_BASELINE_FLAG = '--update-baseline';

async function main(argv = process.argv.slice(NUMERIC_LITERAL_TWO)) {
  if (argv.includes(UPDATE_BASELINE_FLAG)) {
    const report = await collectAmbientIntrinsicViolations(
      argv.filter((arg) => arg !== UPDATE_BASELINE_FLAG),
      {},
    );
    await writeCountBaseline(
      AMBIENT_INTRINSICS_BASELINE_FILE_URL,
      report,
      BASELINE_LABEL,
    );
    return NUMERIC_LITERAL_ZERO;
  }
  return runGuidelineCheck(
    argv,
    collectAmbientIntrinsicViolationsWithBaseline,
    formatHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  RULE_REFERENCE,
  VIOLATION_KIND,
  buildAmbientIntrinsicViolationIdentity,
  collectAmbientIntrinsicViolations,
  collectAmbientIntrinsicViolationsFromSource,
  collectAmbientIntrinsicViolationsWithBaseline,
  isGovernedPath,
};
