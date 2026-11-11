#!/usr/bin/env node

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
  writeTightenedCountBaseline,
} from './guideline-check-shared.js';
import {EXIT_CODE} from './guideline-check-constants.js';

const RULE_REFERENCE =
  'loud-by-construction guideline: a catch block with no statements ' +
  '(empty or comment-only) makes a failure path invisible to log-driven ' +
  'debugging. Runs 23-26 of the affinity demo each traced to a silent ' +
  'branch; every swallowed error must at least emit a typed log, bump a ' +
  'suppressed counter, or record a typed outcome.';

const VIOLATION_KIND = Object.freeze({
  SILENT_CATCH: 'silent_catch',
});

const VIOLATION_REASON = Object.freeze({
  [VIOLATION_KIND.SILENT_CATCH]:
    'catch block swallows the error with no statements; emit a typed log, ' +
    'increment a suppressed counter, or record a typed outcome instead',
});

const NODE_TYPE = Object.freeze({
  CATCH_CLAUSE: 'CatchClause',
  IDENTIFIER: 'Identifier',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
  PROPERTY: 'Property',
  METHOD_DEFINITION: 'MethodDefinition',
});

const VIOLATION_LABEL = 'silent catch';
const IDENTITY_SEPARATOR = '|';
const NUMERIC_LITERAL_ZERO = 0;
const NUMERIC_LITERAL_TWO = 2;

const DEFAULT_SCAN_ROOTS = Object.freeze(['src']);

const SILENT_CATCH_BASELINE_FILE_URL = new URL(
  './check-guideline-silent-catch-baseline.json',
  import.meta.url,
);


function collectSilentCatchViolationsFromSource(source, filePath) {
  const violations = [];
  const ast = parseSourceFile(source);
  walkAst(ast, (node, parent, ancestors) => {
    if (node?.type !== NODE_TYPE.CATCH_CLAUSE) {
      return;
    }
    const statements = node.body?.body;
    if (Array.isArray(statements) &&
        statements.length > NUMERIC_LITERAL_ZERO) {
      return;
    }
    violations.push({
      filePath,
      line: node.loc?.start?.line ?? NUMERIC_LITERAL_ZERO,
      column: node.loc?.start?.column ?? NUMERIC_LITERAL_ZERO,
      functionName: getEnclosingFunctionName(ancestors),
      kind: VIOLATION_KIND.SILENT_CATCH,
      reason: VIOLATION_REASON[VIOLATION_KIND.SILENT_CATCH],
      ruleReference: RULE_REFERENCE,
    });
  });
  return violations;
}

function buildSilentCatchViolationIdentity(violation) {
  return [
    violation.filePath,
    violation.kind,
    violation.functionName,
  ].join(IDENTITY_SEPARATOR);
}

async function collectSilentCatchViolations(pathsToScan, options) {
  return buildGuidelineViolationReport(
    pathsToScan,
    {...options, governedRoots: [...DEFAULT_SCAN_ROOTS]},
    collectSilentCatchViolationsFromSource,
  );
}

async function collectSilentCatchViolationsWithBaseline(
  pathsToScan,
  options = {},
) {
  const [report, baseline] = await Promise.all([
    collectSilentCatchViolations(pathsToScan, options),
    loadCountBaseline(
      SILENT_CATCH_BASELINE_FILE_URL,
      buildSilentCatchViolationIdentity,
    ),
  ]);
  return applyCountBaseline(
    report,
    baseline,
    buildSilentCatchViolationIdentity,
  );
}

function formatHumanSummary(report) {
  const summary = formatGuidelineHumanSummary(report, VIOLATION_LABEL);
  if (!Number.isFinite(report.inheritedViolationCount)) {
    return summary;
  }
  return [
    summary,
    `Matched ${report.inheritedViolationCount} inherited silent-catch ` +
      'baseline violations',
  ].join('\n');
}

const UPDATE_BASELINE_FLAG = '--update-baseline';

async function main(argv = process.argv.slice(NUMERIC_LITERAL_TWO)) {
  if (argv.includes(UPDATE_BASELINE_FLAG)) {
    const report = await collectSilentCatchViolations(
      argv.filter((arg) => arg !== UPDATE_BASELINE_FLAG),
      {},
    );
    const {newSiteCount} = await writeTightenedCountBaseline(
      SILENT_CATCH_BASELINE_FILE_URL,
      report,
      'silent-catch',
      buildSilentCatchViolationIdentity,
    );
    return newSiteCount > 0 ? EXIT_CODE.FAILURE : EXIT_CODE.SUCCESS;
  }
  return runGuidelineCheck(
    argv,
    collectSilentCatchViolationsWithBaseline,
    formatHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  RULE_REFERENCE,
  VIOLATION_KIND,
  buildSilentCatchViolationIdentity,
  collectSilentCatchViolations,
  collectSilentCatchViolationsFromSource,
  collectSilentCatchViolationsWithBaseline,
};
