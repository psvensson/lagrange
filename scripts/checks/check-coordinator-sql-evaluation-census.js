#!/usr/bin/env node
/**
 * Static coordinator SQL evaluation census guard
 * (design coordinator-sqlite-merge §2.1, §4, §5.1 WP6; receipt
 * `js-sql-evaluator-census-zero`).
 *
 * Enforces that:
 * 1. The 5 deleted coordinator JavaScript SQL evaluator modules
 *    (`partial-aggregate-combiner.js`, `residual-predicate-evaluator.js`,
 *    `query-executor-select-aggregation.js`, `sql-scalar-functions.js`,
 *    `streaming-aggregator.js`), the 2 deleted duplicate SQL renderer modules
 *    (`distributed-query-planner-expression-renderer.js`,
 *    `live-query-sql-renderer.js`), and their deleted pinning test files remain
 *    absent.
 * 2. Zero prohibited JavaScript SQL evaluator symbols, comparators, affinity
 *    classifiers, CREATE TABLE parsers, or function allowlists appear in
 *    `src/query` or `src/live-query`.
 * 3. Every classified owner in the coordinator SQLite evaluation, routing,
 *    codec, DDL, rendering, and presentation inventory exists and carries its
 *    required SQLite/canonical-owner imports.
 *
 * @module scripts/checks/check-coordinator-sql-evaluation-census
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '../..');
const UTF8 = 'utf8';
const JS_EXTENSION = '.js';
const ZERO_COUNT = 0;
const EXIT_CODE_FAILURE = 1;
const CHECK_PASS_PREFIX = 'check-coordinator-sql-evaluation-census: PASS ';
const CHECK_FAIL_PREFIX = 'check-coordinator-sql-evaluation-census: FAIL ';
const NEWLINE = '\n';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);

const DELETED_JS_SQL_EVALUATOR_MODULES = Object.freeze([
  'src/query/distributed/partial-aggregate-combiner.js',
  'src/query/distributed/residual-predicate-evaluator.js',
  'src/query/query-executor-select-aggregation.js',
  'src/query/sql-scalar-functions.js',
  'src/query/streaming-aggregator.js',
]);

const DELETED_DUPLICATE_SQL_RENDERER_MODULES = Object.freeze([
  'src/query/distributed/distributed-query-planner-expression-renderer.js',
  'src/live-query/live-query-sql-renderer.js',
]);

const DELETED_EVALUATOR_PINNING_TESTS = Object.freeze([
  'test/query/sql-scalar-functions.test.js',
  'test/query/streaming-aggregation.property.test.js',
]);

const SCANNED_SOURCE_DIRECTORIES = Object.freeze([
  'src/query',
  'src/live-query',
]);

const PROHIBITED_JS_EVALUATOR_SIGNATURES = Object.freeze([
  'combinePartialAggregateRows',
  'combineAggregate',
  'combineDistinct',
  'compareSqlScalarsWithAffinity',
  'classifyAffinityFromTypeString',
  'parseCreateTableColumnAffinities',
  'queryPartitionCreateTableDdl',
  'applySqlComparisonAffinity',
  'aggregateSelectResults',
  'aggregateCrossPartitionResults',
  'computeGroupAggregates',
  'compareOrderByClauseValues',
  'sqlLength',
  'sqlSubstr',
  'sqlRound',
  'StreamingAggregator',
  'EVALUABLE_SCALAR_FUNCTIONS',
  'EVALUABLE_EXPRESSION_TYPES',
  'EVALUABLE_HAVING_SCALAR_FUNCTIONS',
  'EVALUABLE_HAVING_BINARY_OPERATORS',
  'EVALUABLE_HAVING_UNARY_OPERATORS',
  'EVALUABLE_HAVING_EXPRESSION_TYPES',
  'substituteParameterLiterals',
  'substituteResidualParameterLiterals',
  'applyResidualJoinWhere',
  'ensureQueryColumnAffinities',
  'evaluateUnaryKeyValue',
  'evaluateBinaryKeyValue',
  'evaluateFunctionKeyValue',
  'columnSetHoldsNonBinaryCollation',
  'evaluateLikeExpression',
  'evaluateBetweenExpression',
  'evaluateInExpression',
  'evaluateBinaryExpression',
  'evaluateUnaryExpression',
  'evaluateWhereExpression',
]);

const OWNER_CLASS = Object.freeze({
  SQLITE_EVALUATOR: 'sqlite-evaluator',
  DDL_AND_RENDERER: 'ddl-and-renderer',
  TYPED_WIRE_AND_PRESENTATION: 'typed-wire-and-presentation',
  ROUTING_KEY_ORDER: 'routing-key-order',
});

const CLASSIFIED_OWNER_INVENTORY = Object.freeze([
  Object.freeze({
    file: 'src/query/distributed/coordinator-merge-session.js',
    ownerClass: OWNER_CLASS.SQLITE_EVALUATOR,
    requiredTokens: Object.freeze([
      'better-sqlite3',
      'CoordinatorMergeSession',
      'renderTableColumnsSql',
    ]),
  }),
  Object.freeze({
    file: 'src/query/distributed/coordinator-merge-process.js',
    ownerClass: OWNER_CLASS.SQLITE_EVALUATOR,
    requiredTokens: Object.freeze([
      'CoordinatorMergeSession',
    ]),
  }),
  Object.freeze({
    file: 'src/query/distributed/distributed-write-constraint-helpers.js',
    ownerClass: OWNER_CLASS.SQLITE_EVALUATOR,
    requiredTokens: Object.freeze([
      'better-sqlite3',
      'renderTableColumnsSql',
      'renderTableDefinitionSql',
    ]),
  }),
  Object.freeze({
    file: 'src/live-query/live-query-service.js',
    ownerClass: OWNER_CLASS.SQLITE_EVALUATOR,
    requiredTokens: Object.freeze([
      'better-sqlite3',
      'renderTableColumnsSql',
      'renderExpressionWithParameters',
    ]),
  }),
  Object.freeze({
    file: 'src/query/sql-table-definition.js',
    ownerClass: OWNER_CLASS.DDL_AND_RENDERER,
    requiredTokens: Object.freeze([
      'renderTableDefinitionSql',
      'renderTableColumnsSql',
    ]),
  }),
  Object.freeze({
    file: 'src/query/sql-statement-renderer.js',
    ownerClass: OWNER_CLASS.DDL_AND_RENDERER,
    requiredTokens: Object.freeze([
      'renderSelect',
      'renderExpression',
      'renderExpressionWithParameters',
    ]),
  }),
  Object.freeze({
    file: 'src/query/sql-value-codec.js',
    ownerClass: OWNER_CLASS.TYPED_WIRE_AND_PRESENTATION,
    requiredTokens: Object.freeze([
      'encodeTypedRowSet',
      'decodeTypedRowSet',
      'encodeTypedParams',
      'decodeTypedParams',
    ]),
  }),
  Object.freeze({
    file: 'src/query/sql-value-presentation.js',
    ownerClass: OWNER_CLASS.TYPED_WIRE_AND_PRESENTATION,
    requiredTokens: Object.freeze([
      'presentSqlValue',
      'materializeAndPresentRowObjects',
    ]),
  }),
  Object.freeze({
    file: 'src/partition/split-key-comparator.js',
    ownerClass: OWNER_CLASS.ROUTING_KEY_ORDER,
    requiredTokens: Object.freeze([
      'compareRoutingKeys',
    ]),
  }),
  Object.freeze({
    file: 'src/query/partition-resolver.js',
    ownerClass: OWNER_CLASS.ROUTING_KEY_ORDER,
    requiredTokens: Object.freeze([
      'compareRoutingKeys',
      'resolvePartitionForKey',
    ]),
  }),
]);

function collectJsFilesRecursively(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) {
    return out;
  }
  const entries = fs.readdirSync(dirPath, {withFileTypes: true});
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectJsFilesRecursively(fullPath, out);
    } else if (entry.isFile() && stringEndsWith(entry.name, JS_EXTENSION)) {
      out.push(fullPath);
    }
  }
  return out;
}

function auditDeletedModulesAbsent(root = REPO_ROOT) {
  const allDeletedPaths = [
    ...DELETED_JS_SQL_EVALUATOR_MODULES,
    ...DELETED_DUPLICATE_SQL_RENDERER_MODULES,
    ...DELETED_EVALUATOR_PINNING_TESTS,
  ];
  const survivingFiles = arrayFilter(allDeletedPaths, (relPath) =>
    fs.existsSync(path.resolve(root, relPath)),
  );
  return {
    absent: survivingFiles.length === ZERO_COUNT,
    checkedCount: allDeletedPaths.length,
    deletedEvaluatorModuleCount: DELETED_JS_SQL_EVALUATOR_MODULES.length,
    survivingFiles,
  };
}

function scanFileForProhibitedSignatures(root, fullPath) {
  const content = fs.readFileSync(fullPath, UTF8);
  const relPath = path.relative(root, fullPath);
  const hits = [];
  for (const signature of PROHIBITED_JS_EVALUATOR_SIGNATURES) {
    if (stringIncludes(content, signature)) {
      hits.push({file: relPath, signature});
    }
  }
  return hits;
}

function auditProhibitedEvaluatorSignatures(root = REPO_ROOT) {
  const violations = [];
  let scannedFileCount = ZERO_COUNT;
  for (const relDir of SCANNED_SOURCE_DIRECTORIES) {
    const files = collectJsFilesRecursively(path.resolve(root, relDir));
    scannedFileCount += files.length;
    for (const fullPath of files) {
      violations.push(...scanFileForProhibitedSignatures(root, fullPath));
    }
  }
  return {
    zeroProhibitedSignatures: violations.length === ZERO_COUNT,
    scannedFileCount,
    violations,
  };
}

function auditClassifiedOwnerInventory(root = REPO_ROOT) {
  const missingOwners = [];
  const missingTokens = [];
  for (const entry of CLASSIFIED_OWNER_INVENTORY) {
    const fullPath = path.resolve(root, entry.file);
    if (!fs.existsSync(fullPath)) {
      missingOwners.push(entry.file);
      continue;
    }
    const content = fs.readFileSync(fullPath, UTF8);
    for (const token of entry.requiredTokens) {
      if (!stringIncludes(content, token)) {
        missingTokens.push({file: entry.file, token});
      }
    }
  }
  return {
    inventoryValid:
      missingOwners.length === ZERO_COUNT &&
      missingTokens.length === ZERO_COUNT,
    classifiedOwnerCount: CLASSIFIED_OWNER_INVENTORY.length,
    missingOwners,
    missingTokens,
  };
}

function auditCoordinatorSqlEvaluationCensus(root = REPO_ROOT) {
  const deletedModules = auditDeletedModulesAbsent(root);
  const signatures = auditProhibitedEvaluatorSignatures(root);
  const inventory = auditClassifiedOwnerInventory(root);
  const passes =
    deletedModules.absent &&
    signatures.zeroProhibitedSignatures &&
    inventory.inventoryValid;
  return {
    passes,
    deletedModules,
    signatures,
    inventory,
  };
}

function main() {
  const report = auditCoordinatorSqlEvaluationCensus(REPO_ROOT);
  if (!report.passes) {
    process.stderr.write(
      CHECK_FAIL_PREFIX + JSON.stringify(report) + NEWLINE,
    );
    process.exit(EXIT_CODE_FAILURE);
  }
  process.stdout.write(
    CHECK_PASS_PREFIX +
    JSON.stringify({
      deletedEvaluatorModuleCount:
        report.deletedModules.deletedEvaluatorModuleCount,
      scannedFileCount: report.signatures.scannedFileCount,
      classifiedOwnerCount: report.inventory.classifiedOwnerCount,
    }) +
    NEWLINE,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}

export {
  CLASSIFIED_OWNER_INVENTORY,
  DELETED_DUPLICATE_SQL_RENDERER_MODULES,
  DELETED_EVALUATOR_PINNING_TESTS,
  DELETED_JS_SQL_EVALUATOR_MODULES,
  OWNER_CLASS,
  PROHIBITED_JS_EVALUATOR_SIGNATURES,
  auditClassifiedOwnerInventory,
  auditCoordinatorSqlEvaluationCensus,
  auditDeletedModulesAbsent,
  auditProhibitedEvaluatorSignatures,
};
