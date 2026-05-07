#!/usr/bin/env node

import process from 'node:process';

import {
  buildGuidelineViolationReport,
  formatGuidelineHumanSummary,
  parseSourceFile,
  walkAst,
} from './guideline-check-shared.js';
import {EXIT_CODE, SCRIPT_TEXT} from './guideline-check-constants.js';

const ARG_START_INDEX = 2;
const LOCAL_NUM_ONE = 1;
const HELP_FLAG = '--help';
const HELP_SHORT_FLAG = '-h';
const JSON_FLAG = '--json';
const CONST_DECLARATION_KIND = 'const';
const VARIABLE_DECLARATOR_NODE = 'VariableDeclarator';
const VARIABLE_DECLARATION_NODE = 'VariableDeclaration';
const IDENTIFIER_NODE = 'Identifier';
const RULE_REFERENCE = 'system guidelines.md §4.1 Constants, Not Literals';
const VIOLATION_KIND = 'opaque_generated_constant_name';
const VIOLATION_REASON =
  'named constants must describe their semantic owner rather than generated tokens';
const USAGE_TEXT =
  'Usage: node scripts/check-guideline-constant-names.js <file-or-directory> [...]';
const SCRIPT_BASENAME = 'check-guideline-constant-names.js';
const OPAQUE_LOCAL_CONSTANT_NAME_PATTERN =
  /^(?:LOCAL|TEST)_(?:STR|NUM)_[A-Z0-9]*\d[A-Z0-9]*$/u;

function isOpaqueConstantDeclarator(node, parent) {
  return node?.type === VARIABLE_DECLARATOR_NODE &&
    parent?.type === VARIABLE_DECLARATION_NODE &&
    parent.kind === CONST_DECLARATION_KIND &&
    node.id?.type === IDENTIFIER_NODE &&
    OPAQUE_LOCAL_CONSTANT_NAME_PATTERN.test(node.id.name);
}

function collectOpaqueConstantNameViolationsFromSource(source, filePath) {
  const ast = parseSourceFile(source);
  const violations = [];

  walkAst(ast, (node, parent) => {
    if (!isOpaqueConstantDeclarator(node, parent)) {
      return;
    }

    violations.push({
      filePath,
      line: node.loc?.start?.line || LOCAL_NUM_ONE,
      column: node.loc?.start?.column + LOCAL_NUM_ONE || LOCAL_NUM_ONE,
      value: node.id.name,
      kind: VIOLATION_KIND,
      reason: VIOLATION_REASON,
      ruleReference: RULE_REFERENCE,
    });
  });

  return violations;
}

async function collectOpaqueConstantNameViolations(pathsToScan, options = {}) {
  return buildGuidelineViolationReport(
    pathsToScan,
    options,
    collectOpaqueConstantNameViolationsFromSource,
  );
}

function formatHumanSummary(report) {
  return formatGuidelineHumanSummary(report, 'opaque constant-name');
}

function parseArgs(argv = []) {
  return {
    helpRequested: argv.includes(HELP_FLAG) || argv.includes(HELP_SHORT_FLAG),
    jsonOutput: argv.includes(JSON_FLAG),
    pathsToScan: argv.filter((arg) =>
      arg !== HELP_FLAG &&
      arg !== HELP_SHORT_FLAG &&
      arg !== JSON_FLAG),
  };
}

async function main(argv = process.argv.slice(ARG_START_INDEX)) {
  const {helpRequested, jsonOutput, pathsToScan} = parseArgs(argv);
  if (helpRequested) {
    process.stdout.write(`${USAGE_TEXT}${SCRIPT_TEXT.NEWLINE}`);
    return EXIT_CODE.SUCCESS;
  }
  if (pathsToScan.length === 0) {
    process.stderr.write(`${USAGE_TEXT}${SCRIPT_TEXT.NEWLINE}`);
    return EXIT_CODE.USAGE;
  }

  const report = await collectOpaqueConstantNameViolations(pathsToScan);
  if (jsonOutput) {
    process.stdout.write(
      `${JSON.stringify(report, null, ARG_START_INDEX)}${SCRIPT_TEXT.NEWLINE}`,
    );
  } else {
    process.stdout.write(`${formatHumanSummary(report)}${SCRIPT_TEXT.NEWLINE}`);
  }

  return report.totalViolationCount > 0 ?
    EXIT_CODE.FAILURE :
    EXIT_CODE.SUCCESS;
}

if (process.argv[1] && process.argv[1].endsWith(SCRIPT_BASENAME)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(String(error?.stack || error) + SCRIPT_TEXT.NEWLINE);
    process.exitCode = EXIT_CODE.FAILURE;
  });
}

export {
  OPAQUE_LOCAL_CONSTANT_NAME_PATTERN,
  collectOpaqueConstantNameViolations,
  collectOpaqueConstantNameViolationsFromSource,
  isOpaqueConstantDeclarator,
};
