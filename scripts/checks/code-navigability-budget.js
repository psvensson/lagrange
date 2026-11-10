/**
 * Acceptance budget for the `code-navigability-and-mistake-resistance` epic.
 *
 *   node scripts/checks/code-navigability-budget.js [--metric] [--json] [--rows a,b]
 *
 * Measures every row of the budget table in
 * solve/epics/code-navigability-and-mistake-resistance.md against a tree and
 * prints a table. The last stdout line is the number of unmet rows, which is
 * the epic's `doneWhen` metric; the exit code is 0 when that number is 0.
 * `--metric` prints only the number; `--json` prints the measurements;
 * `--rows` measures only the named rows (each quest's probe). Any other
 * argument (`--rows=name` included) is a usage refusal: one stderr line, no
 * count on stdout, exit 1, so a probe never reads a silent all-rows run.
 *
 * Patterns are recognised only by code-navigability-detectors.js; this
 * script scopes and counts its sites. A row whose input does not exist yet or
 * fails five-lane completeness / witness accounting (the coverage census) is
 * outstanding with value null, never met; a source file that does not parse
 * makes every detector-backed row outstanding, and the failing files are
 * printed. Zero uncensused or unclassified sites means every detected fallback
 * site is accounted for in census/classification, never zero fallback logic.
 *
 * Governed by the ambient-intrinsic audit: prototype methods governed by that
 * audit are captured at module load, and census and classification records are
 * read by own fields only (`ownField`).
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  ROW_ORDER, detectNavigabilityPatterns, moduleExportNames, ownField,
  parseNavigabilitySource, siteIdentity, sourceFiles,
} from './code-navigability-detectors.js';
import {
  defaultEslintRunner, promotedPatterns, promotedReportCounts,
} from './code-navigability-eslint-promotion.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayIsArray = Array.isArray;
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySome = Function.call.bind(Array.prototype.some);
const dateParse = Date.parse;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const MapConstructor = Map;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const objectAssign = Object.assign;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const SetConstructor = Set;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);
const stringPadStart = Function.call.bind(String.prototype.padStart);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

// The sealed table: a cap row is met at or below its number, every other
// row only at 0.
const BUDGET = Object.freeze({
  navigability_patterns_without_ratchet: 0,
  owner_port_feature_detection: 2130,
  owner_port_feature_detection_pilot_owners: 0,
  identity_keyed_module_state: 87,
  identity_keyed_module_state_admission_path: 0,
  prototype_copy_bags: 59,
  prototype_copy_bags_partition_service: 0,
  inheritance_depth_over_two: 65,
  inheritance_depth_over_two_readiness: 0,
  row_field_alias_reads: 745,
  formation_system_tables_without_decoder: 0,
  state_read_defaults: 0,
  value_or_promise_then_checks: 0,
  source_directories_over_cap: 0,
  stale_owner_indexes: 0,
  failure_bundle_log_windows_without_coverage: 0,
  two_source_fallback_reads: 1789,
  typeof_dual_paths: 627,
  catch_returns_default: 387,
  reexport_only_modules: 35,
  alias_exports: 0,
  legacy_term_identifiers: 2924,
  fallback_sites_uncensused: 0,
  fallback_branches_never_taken: 0,
  fallback_branches_only_fallback_taken: 0,
  fallback_sites_unclassified: 0,
});

const CAP_ROWS = Object.freeze(new Set([
  'owner_port_feature_detection', 'identity_keyed_module_state',
  'prototype_copy_bags', 'inheritance_depth_over_two', 'row_field_alias_reads',
  'two_source_fallback_reads', 'typeof_dual_paths', 'catch_returns_default',
  'reexport_only_modules', 'legacy_term_identifiers',
]));

const FALLBACK_BUDGET_ROWS = Object.freeze(new Set([
  'fallback_sites_uncensused',
  'fallback_branches_never_taken',
  'fallback_branches_only_fallback_taken',
  'fallback_sites_unclassified',
]));

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_DIRECTORY = 'src';
const TEXT_ENCODING = 'utf8';
const JS_SUFFIX = '.js';
const OWNER_INDEX = 'INDEX.md';
const DIRECTORY_FILE_CAP = 120;

const PILOT_OWNER_FILES = Object.freeze([
  /^src\/control-plane\/control-plane-readiness-[^/]*\.js$/u,
  /^src\/partition\/partition-service[^/]*\.js$/u,
  /^src\/rebalancer\/replica-operation-repository-visibility-methods\.js$/u,
  /^src\/rebalancer\/unified-rebalancer-available-nodes\.js$/u,
]);
const ADMISSION_PATH_FILES = Object.freeze([
  /^src\/partition\/partition-service-raft-membership-administration\.js$/u,
  /^src\/raft\/raft-rs-group-membership-admission\.js$/u,
  /^src\/partition\/partition-service-raft-peer-cache-reconciliation\.js$/u,
  /^src\/partition\/partition-replica-admission\.js$/u,
]);
const PARTITION_SERVICE_FILES = Object.freeze([/^src\/partition\/partition-service[^/]*\.js$/u]);
const READINESS_FILES = Object.freeze([
  /^src\/control-plane\/control-plane-readiness-[^/]*\.js$/u,
]);

const RATCHETED_PATTERNS = Object.freeze([
  'owner_port_feature_detection', 'identity_keyed_module_state',
  'prototype_copy_bags', 'inheritance_depth_over_two', 'row_field_alias_reads',
  'state_read_defaults', 'value_or_promise_then_checks',
  'two_source_fallback_reads', 'typeof_dual_paths', 'catch_returns_default',
  'alias_exports', 'legacy_term_identifiers',
]);
const PATTERN_BASELINE_PREFIX = 'scripts/check-guideline-navigability-baseline-';
const PATTERN_BASELINE_SUFFIX = '.json';
const BASELINE_VERSION = 1;

// [decoder module, the decoder it must export]
const SYSTEM_TABLE_DECODERS = Object.freeze([
  ['services-row-decoder.js', 'decodeServicesRow'],
  ['nodes-row-decoder.js', 'decodeNodesRow'],
  ['replica-operations-row-decoder.js', 'decodeReplicaOperationsRow'],
]);
const OWNER_INDEX_GENERATOR = 'scripts/generate-source-owner-index.js';
const CHECK_FLAG = '--check';
const CLOSED_STDIN = Object.freeze(['ignore', 'pipe', 'pipe']);
const NUMERIC_LINE = /^\d+$/u;
const FAILURE_BUNDLE_WRITER = 'test/distributed/harness/failure-bundle-artifact-foundation.js';
const LOG_TAIL_EXPORT = 'LOG_TAIL_LINE_COUNT';
const LOG_COVERAGE_EXPORT = 'LOG_WINDOW_COVERAGE';

// The census and classification fields read, each only as an own field.
const INPUT_FIELD = Object.freeze({
  SCHEMA: 'schema', SITES: 'sites', CLASS: 'class', RUNS: 'runs', ID: 'id',
  LANE: 'lane', HOST: 'host', COMMIT: 'commit', STARTED_AT: 'startedAt',
  COVERAGE_DIGEST: 'coverageDigest', INCOMPLETE: 'incomplete', PROBLEMS: 'problems',
  WITNESSES: 'witnesses', STARTED: 'started', COMPLETE: 'complete', LOST: 'lost',
  EXTERNAL: 'external', LOST_WITNESSES: 'lostWitnesses', SIDES_EXECUTED: 'sidesExecuted',
  SIDES_BY_RUN: 'sidesByRun', PRIMARY: 'primary', FALLBACK: 'fallback',
  ENTRIES: 'entries', CLASSIFICATION: 'classification', VERSION: 'version',
  VIOLATIONS: 'violations', ESLINT_RUNNER: 'eslintRunner',
});
const CENSUS_FILE = 'data/fallback-census/census.json';
const CENSUS_SCHEMA = 'fallback-census/1';
const REQUIRED_CENSUS_LANES = Object.freeze([
  'unit', 'packaging', 'integration', 'bootstrap', 'formation',
]);
const REQUIRED_CENSUS_LANE_SET = Object.freeze(new Set(REQUIRED_CENSUS_LANES));
const COMMIT_HASH = /^[0-9a-f]{40}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const ISO_8601_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const CLASSIFICATION_FILE = 'scripts/checks/code-navigability-fallback-classification.json';
const CENSUS_ROWS = Object.freeze(new Set([
  'two_source_fallback_reads', 'typeof_dual_paths', 'catch_returns_default',
]));
const CLASS_NEVER = 'never';
const CLASS_FALLBACK_ONLY = 'fallback-only';
const CLASS_BOTH = 'both';
const CLASS_PRIMARY_ONLY = 'primary-only';
const STRING_TYPE_NAME = 'string';
const BOOLEAN_TYPE_NAME = 'boolean';
const OBJECT_TYPE_NAME = 'object';
const EXECUTED_CLASSES = Object.freeze(new Set([
  CLASS_NEVER, CLASS_PRIMARY_ONLY, CLASS_FALLBACK_ONLY, CLASS_BOTH,
]));
const EXPECTED_SIDES_BY_CLASS = objectFreeze(objectAssign(objectCreate(null), {
  [CLASS_NEVER]: objectFreeze([false, false]),
  [CLASS_PRIMARY_ONLY]: objectFreeze([true, false]),
  [CLASS_FALLBACK_ONLY]: objectFreeze([false, true]),
  [CLASS_BOTH]: objectFreeze([true, true]),
}));

const FALLBACK_SUMMARY_NOTE =
  'Zero uncensused or unclassified sites means every detected fallback site is accounted ' +
  'for in census/classification, never zero fallback logic.';
const TABLE_NOTE_PREFIX = 'note: ';
const TABLE_NOTE_SITES_LABEL = ' fallback logic sites detected in src (censused: ';
const TABLE_NOTE_UNCENSUSED_LABEL = ', uncensused: ';
const TABLE_NOTE_SUFFIX =
  '); 0 uncensused/unclassified sites means accounted for, never zero fallback logic';

const ARGV_OFFSET = 2;
const JSON_FLAG = '--json';
const METRIC_FLAG = '--metric';
const ROWS_FLAG = '--rows';
const ROW_SEPARATOR = ',';
const USAGE_PREFIX = 'usage: code-navigability-budget.js [--metric] [--json] ' +
  '[--rows a,b]; unrecognised argument: ';
const MISSING_ROOT_PREFIX = 'source root absent: ';
const EMPTY_ROWS = '';
const UNKNOWN_ROW_PREFIX = 'unknown budget row: ';
const UNKNOWN_ROW_VALUE = 1;
const UNKNOWN_ROW_BUDGET = 0;
const LINE_SEPARATOR = '\n';
const JSON_INDENT = 2;
const VALUE_COLUMN_WIDTH = 7;
const MET_MARK = 'ok  ';
const UNMET_MARK = 'OVER';
const OUTSTANDING_VALUE = 'null';
const BUDGET_SEPARATOR = '  / ';
const COLUMN_GAP = '  ';
const PARSE_FAILURE_PREFIX = 'parse failure: ';
const PARSE_FAILURE_SEPARATOR = ': ';
const EXIT_OK = 0;
const EXIT_OVER_BUDGET = 1;
const EXIT_USAGE = 1;

function isPlainObject(value) {
  return typeof value === OBJECT_TYPE_NAME && value !== null && !arrayIsArray(value);
}

function isNonBlankString(value) {
  return typeof value === STRING_TYPE_NAME && stringTrim(value).length > 0;
}

function isIsoTimestamp(value) {
  return typeof value === STRING_TYPE_NAME &&
    regexpTest(ISO_8601_TIMESTAMP, value) &&
    numberIsFinite(dateParse(value));
}

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

function readText(root, relative) {
  return fs.readFileSync(path.join(root, relative), TEXT_ENCODING);
}

function readJsonInput(root, relative) {
  if (!exists(root, relative)) return undefined;
  try {
    return jsonParse(readText(root, relative));
  } catch (error) {
    process.stderr.write(`${relative}${PARSE_FAILURE_SEPARATOR}${error.message}\n`);
    return undefined;
  }
}

function matchesAny(file, patterns) {
  for (let index = 0; index < patterns.length; index += 1) {
    if (regexpTest(patterns[index], file)) return true;
  }
  return false;
}

function rowSites(context, row) {
  return arrayFilter(context.detection.sites, (site) => site.row === row);
}

function scopedCount(context, row, patterns) {
  return arrayFilter(rowSites(context, row), (site) => matchesAny(site.file, patterns)).length;
}

function eslintPromotion(context) {
  if (!context.promotion) {
    const runner = context.eslintRunner;
    const sampleFile = sourceFiles(context.root, SOURCE_DIRECTORY)[0];
    const promoted = promotedPatterns(context.root, runner, sampleFile, RATCHETED_PATTERNS);
    context.promotion = {
      promoted,
      counts: promotedReportCounts(context.root, runner, promoted),
    };
  }
  return context.promotion;
}

function hasAuditBaseline(root, pattern) {
  const baseline = readJsonInput(root,
    `${PATTERN_BASELINE_PREFIX}${pattern}${PATTERN_BASELINE_SUFFIX}`);
  return Boolean(baseline) && ownField(baseline, INPUT_FIELD.VERSION) === BASELINE_VERSION &&
    arrayIsArray(ownField(baseline, INPUT_FIELD.VIOLATIONS));
}

function patternsWithoutRatchet(context) {
  const {promoted} = eslintPromotion(context);
  return arrayFilter(RATCHETED_PATTERNS, (pattern) =>
    !setHas(promoted, pattern) && !hasAuditBaseline(context.root, pattern)).length;
}

function sourceDirectories(root) {
  const directories = [];
  const visit = (relative) => {
    const entries = fs.readdirSync(path.join(root, relative), {withFileTypes: true});
    arrayPush(directories, {relative, entries});
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (entry.isDirectory()) visit(`${relative}/${entry.name}`);
    }
  };
  if (exists(root, SOURCE_DIRECTORY)) visit(SOURCE_DIRECTORY);
  return directories;
}

function directJsFileCount(entries) {
  return arrayFilter(entries, (entry) =>
    entry.isFile() && stringSlice(entry.name, -JS_SUFFIX.length) === JS_SUFFIX).length;
}

function directoriesOverCap(context) {
  return arrayFilter(sourceDirectories(context.root), (directory) =>
    directJsFileCount(directory.entries) > DIRECTORY_FILE_CAP).length;
}

function lastNumericLine(text) {
  const numbers = arrayFilter(stringSplit(String(text), LINE_SEPARATOR), (line) =>
    regexpTest(NUMERIC_LINE, line));
  return numbers.length > 0 ? Number(numbers[numbers.length - 1]) : null;
}

function staleOwnerIndexes(context) {
  const root = context.root;
  if (exists(root, OWNER_INDEX_GENERATOR)) {
    const result = spawnSync(process.execPath, [OWNER_INDEX_GENERATOR, CHECK_FLAG],
      {cwd: root, encoding: TEXT_ENCODING, stdio: CLOSED_STDIN});
    return result.status === 0 ? lastNumericLine(result.stdout) : null;
  }
  return arrayFilter(sourceDirectories(root), (directory) =>
    !arrayFind(directory.entries, (entry) => entry.name === OWNER_INDEX)).length;
}

function sourceExportNames(root, file) {
  const parsed = parseNavigabilitySource(readText(root, file), file);
  return moduleExportNames(parsed);
}

function readableExportNames(root, file) {
  try {
    return sourceExportNames(root, file);
  } catch (error) {
    process.stderr.write(`${file}${PARSE_FAILURE_SEPARATOR}${error.message}\n`);
    return undefined;
  }
}

function exportsDecoder(root, file, decoder) {
  const names = readableExportNames(root, file);
  return Boolean(names) && arrayIncludes(names, decoder);
}

function systemTablesWithoutDecoder(context) {
  const files = sourceFiles(context.root, SOURCE_DIRECTORY);
  return arrayFilter(SYSTEM_TABLE_DECODERS, (entry) =>
    !arraySome(files, (file) => path.basename(file) === entry[0] &&
      exportsDecoder(context.root, file, entry[1]))).length;
}

function logWindowsWithoutCoverage(context) {
  if (!exists(context.root, FAILURE_BUNDLE_WRITER)) return null;
  const names = readableExportNames(context.root, FAILURE_BUNDLE_WRITER);
  if (!names) return null;
  if (arrayIncludes(names, LOG_COVERAGE_EXPORT)) return 0;
  return arrayIncludes(names, LOG_TAIL_EXPORT) ? 1 : null;
}

function hasCompleteRunWitnesses(run) {
  const witnesses = ownField(run, INPUT_FIELD.WITNESSES);
  const started = ownField(witnesses, INPUT_FIELD.STARTED);
  const complete = ownField(witnesses, INPUT_FIELD.COMPLETE);
  const lost = ownField(witnesses, INPUT_FIELD.LOST);
  const rawExternal = ownField(witnesses, INPUT_FIELD.EXTERNAL);
  const external = rawExternal === undefined ? 0 : rawExternal;
  return numberIsInteger(started) && started > 0 &&
    numberIsInteger(complete) && complete > 0 &&
    lost === 0 &&
    numberIsInteger(external) && external >= 0 &&
    complete + external === started;
}

function hasCleanRunStatus(run) {
  if (ownField(run, INPUT_FIELD.INCOMPLETE) === true) return false;
  const problems = ownField(run, INPUT_FIELD.PROBLEMS);
  return problems === undefined || (arrayIsArray(problems) && problems.length === 0);
}

function isValidCensusRun(run) {
  const lane = ownField(run, INPUT_FIELD.LANE);
  const commit = ownField(run, INPUT_FIELD.COMMIT);
  const digest = ownField(run, INPUT_FIELD.COVERAGE_DIGEST);
  return isNonBlankString(ownField(run, INPUT_FIELD.ID)) &&
    typeof lane === STRING_TYPE_NAME && setHas(REQUIRED_CENSUS_LANE_SET, lane) &&
    isNonBlankString(ownField(run, INPUT_FIELD.HOST)) &&
    typeof commit === STRING_TYPE_NAME && regexpTest(COMMIT_HASH, commit) &&
    isIsoTimestamp(ownField(run, INPUT_FIELD.STARTED_AT)) &&
    typeof digest === STRING_TYPE_NAME && regexpTest(SHA256_HEX, digest) &&
    hasCleanRunStatus(run) &&
    hasCompleteRunWitnesses(run);
}

function validCensusRunIds(census) {
  const runs = ownField(census, INPUT_FIELD.RUNS);
  if (!arrayIsArray(runs) || runs.length < REQUIRED_CENSUS_LANES.length) return undefined;
  const ids = new SetConstructor();
  const lanes = new SetConstructor();
  for (let index = 0; index < runs.length; index += 1) {
    if (!objectHasOwn(runs, index)) return undefined;
    const run = runs[index];
    const id = ownField(run, INPUT_FIELD.ID);
    if (!isValidCensusRun(run) || setHas(ids, id)) return undefined;
    setAdd(ids, id);
    setAdd(lanes, ownField(run, INPUT_FIELD.LANE));
  }
  const hasEveryRequiredLane = arrayEvery(REQUIRED_CENSUS_LANES, (lane) => setHas(lanes, lane));
  return hasEveryRequiredLane ? ids : undefined;
}

function sidesPair(sidesObject) {
  if (!isPlainObject(sidesObject)) return undefined;
  const primary = ownField(sidesObject, INPUT_FIELD.PRIMARY);
  const fallback = ownField(sidesObject, INPUT_FIELD.FALLBACK);
  if (typeof primary !== BOOLEAN_TYPE_NAME || typeof fallback !== BOOLEAN_TYPE_NAME) {
    return undefined;
  }
  return [primary, fallback];
}

function matchesExpectedSides(pair, expected) {
  return Boolean(pair) && pair[0] === expected[0] && pair[1] === expected[1];
}

function hasConsistentSidesByRun(sidesByRun, runs, expected) {
  if (sidesByRun === undefined) return true;
  if (!isPlainObject(sidesByRun) || objectKeys(sidesByRun).length !== runs.length) {
    return false;
  }
  let anyPrimary = false;
  let anyFallback = false;
  for (let index = 0; index < runs.length; index += 1) {
    const pair = sidesPair(ownField(sidesByRun, runs[index]));
    if (!pair) return false;
    if (pair[0]) anyPrimary = true;
    if (pair[1]) anyFallback = true;
  }
  return anyPrimary === expected[0] && anyFallback === expected[1];
}

function hasConsistentSiteSides(record, runs, siteClass) {
  const expected = typeof siteClass === STRING_TYPE_NAME &&
    objectHasOwn(EXPECTED_SIDES_BY_CLASS, siteClass) ? EXPECTED_SIDES_BY_CLASS[siteClass] :
    undefined;
  if (!expected) return true;
  const sidesExecuted = ownField(record, INPUT_FIELD.SIDES_EXECUTED);
  if (sidesExecuted !== undefined && !matchesExpectedSides(sidesPair(sidesExecuted), expected)) {
    return false;
  }
  return hasConsistentSidesByRun(ownField(record, INPUT_FIELD.SIDES_BY_RUN), runs, expected);
}

function hasValidSiteRuns(record, runIds) {
  const runs = ownField(record, INPUT_FIELD.RUNS);
  if (!arrayIsArray(runs) || runs.length === 0) return false;
  const lostWitnesses = ownField(record, INPUT_FIELD.LOST_WITNESSES);
  if (lostWitnesses !== undefined &&
      (!arrayIsArray(lostWitnesses) || lostWitnesses.length > 0)) {
    return false;
  }
  const seen = new SetConstructor();
  for (let index = 0; index < runs.length; index += 1) {
    if (!objectHasOwn(runs, index)) return false;
    const runId = runs[index];
    if (typeof runId !== STRING_TYPE_NAME || !setHas(runIds, runId) || setHas(seen, runId)) {
      return false;
    }
    setAdd(seen, runId);
  }
  return hasConsistentSiteSides(record, runs, ownField(record, INPUT_FIELD.CLASS));
}

function readCensus(root) {
  const census = readJsonInput(root, CENSUS_FILE);
  const sites = ownField(census, INPUT_FIELD.SITES);
  const runIds = validCensusRunIds(census);
  const valid = ownField(census, INPUT_FIELD.SCHEMA) === CENSUS_SCHEMA &&
    arrayIsArray(sites) && Boolean(runIds);
  if (!valid) return undefined;
  const records = new MapConstructor();
  for (let index = 0; index < sites.length; index += 1) {
    if (!objectHasOwn(sites, index)) continue;
    const record = sites[index];
    const identity = siteIdentity(record);
    if (identity === undefined) continue;
    const siteClass = hasValidSiteRuns(record, runIds) ?
      ownField(record, INPUT_FIELD.CLASS) : undefined;
    let list = mapGet(records, identity);
    if (!list) {
      list = [];
      mapSet(records, identity, list);
    }
    arrayPush(list, siteClass);
  }
  return records;
}

function readClassifiedIdentities(root) {
  const declared = ownField(readJsonInput(root, CLASSIFICATION_FILE), INPUT_FIELD.ENTRIES);
  const entries = arrayIsArray(declared) ? declared : [];
  const identities = new SetConstructor();
  for (let index = 0; index < entries.length; index += 1) {
    if (!objectHasOwn(entries, index)) continue;
    const entry = entries[index];
    const identity = siteIdentity(entry);
    const classified = identity !== undefined &&
      isNonBlankString(ownField(entry, INPUT_FIELD.CLASSIFICATION));
    if (classified) setAdd(identities, identity);
  }
  return identities;
}

function censusClassOf(records, site) {
  const classes = mapGet(records, siteIdentity(site)) || [];
  return classes.length === 1 && setHas(EXECUTED_CLASSES, classes[0]) ? classes[0] : undefined;
}

function censusContext(context) {
  if (!context.census) {
    const records = readCensus(context.root);
    const sites = arrayFilter(context.detection.sites, (site) => setHas(CENSUS_ROWS, site.row));
    context.census = {
      present: Boolean(records),
      classes: arrayMap(sites, (site) =>
        ({site, siteClass: records ? censusClassOf(records, site) : undefined})),
      classified: readClassifiedIdentities(context.root),
    };
  }
  return context.census;
}

function uncensusedSites(context) {
  return arrayFilter(censusContext(context).classes, (entry) => !entry.siteClass).length;
}

function censusClassCount(siteClass) {
  return (context) => {
    const census = censusContext(context);
    if (!census.present) return null;
    return arrayFilter(census.classes, (entry) => entry.siteClass === siteClass).length;
  };
}

function unclassifiedSites(context) {
  const census = censusContext(context);
  if (!census.present) return null;
  return arrayFilter(census.classes, (entry) => entry.siteClass === CLASS_BOTH &&
    !setHas(census.classified, siteIdentity(entry.site))).length;
}

const READS = objectFreeze({SITES: 'sites', SOURCE_TREE: 'source-tree', NONE: 'none'});

function buildFallbackSummary(context) {
  if (isIncomplete(context.detection, READS.SITES)) return null;
  const census = censusContext(context);
  const totalFallbackSites = census.classes.length;
  const censusedSites = arrayFilter(census.classes, (entry) => Boolean(entry.siteClass)).length;
  const uncensusedCount = totalFallbackSites - censusedSites;
  const byClass = census.present ? {
    [CLASS_NEVER]: censusClassCount(CLASS_NEVER)(context),
    [CLASS_PRIMARY_ONLY]: censusClassCount(CLASS_PRIMARY_ONLY)(context),
    [CLASS_FALLBACK_ONLY]: censusClassCount(CLASS_FALLBACK_ONLY)(context),
    [CLASS_BOTH]: censusClassCount(CLASS_BOTH)(context),
  } : null;
  return {
    totalFallbackSites,
    censusedSites,
    uncensusedSites: uncensusedCount,
    unclassifiedLiveSites: unclassifiedSites(context),
    byClass,
    note: FALLBACK_SUMMARY_NOTE,
  };
}

function patternCount(row) {
  return (context) => {
    const {promoted, counts} = eslintPromotion(context);
    return setHas(promoted, row) ?
      (mapHas(counts, row) ? mapGet(counts, row) : undefined) :
      context.detection.counts[row];
  };
}

function scopedRow(row, patterns) {
  return (context) => scopedCount(context, row, patterns);
}

const MEASURES = objectFreeze({
  navigability_patterns_without_ratchet: [READS.NONE, patternsWithoutRatchet],
  owner_port_feature_detection_pilot_owners:
    [READS.SITES, scopedRow('owner_port_feature_detection', PILOT_OWNER_FILES)],
  identity_keyed_module_state_admission_path:
    [READS.SITES, scopedRow('identity_keyed_module_state', ADMISSION_PATH_FILES)],
  prototype_copy_bags_partition_service:
    [READS.SITES, scopedRow('prototype_copy_bags', PARTITION_SERVICE_FILES)],
  inheritance_depth_over_two_readiness:
    [READS.SITES, scopedRow('inheritance_depth_over_two', READINESS_FILES)],
  formation_system_tables_without_decoder: [READS.NONE, systemTablesWithoutDecoder],
  source_directories_over_cap: [READS.SOURCE_TREE, directoriesOverCap],
  stale_owner_indexes: [READS.SOURCE_TREE, staleOwnerIndexes],
  failure_bundle_log_windows_without_coverage: [READS.NONE, logWindowsWithoutCoverage],
  fallback_sites_uncensused: [READS.SITES, uncensusedSites],
  fallback_branches_never_taken: [READS.SITES, censusClassCount(CLASS_NEVER)],
  fallback_branches_only_fallback_taken: [READS.SITES, censusClassCount(CLASS_FALLBACK_ONLY)],
  fallback_sites_unclassified: [READS.SITES, unclassifiedSites],
});

function rowMeasure(name) {
  if (arrayIncludes(ROW_ORDER, name)) return [READS.SITES, patternCount(name)];
  return MEASURES[name];
}

function isIncomplete(detection, reads) {
  if (reads === READS.NONE) return false;
  if (detection.missingRoot !== null) return true;
  return reads === READS.SITES && detection.parseFailures.length > 0;
}

function isMet(name, value) {
  if (value === null || value === undefined) return false;
  return setHas(CAP_ROWS, name) ? value <= BUDGET[name] : value === 0;
}

function measureRow(context, name) {
  const spec = rowMeasure(name);
  const measured = isIncomplete(context.detection, spec[0]) ? null : spec[1](context);
  const value = measured === undefined ? null : measured;
  return {name, value, budget: BUDGET[name], met: isMet(name, value)};
}

/**
 * Measure every budget row against a tree, in the sealed table's order.
 * @param {string} root the checkout root
 * @param {Object} options `{eslintRunner}`: `(args, root) => {status, stdout}`
 * @return {Object} `{rows, parseFailures, missingRoot, fallbackSummary}`
 */
function measureNavigabilityBudgetWithFailures(root = REPO_ROOT, options = {}) {
  const eslintRunnerOption = ownField(options, INPUT_FIELD.ESLINT_RUNNER);
  const context = {
    root,
    detection: detectNavigabilityPatterns(root),
    eslintRunner: eslintRunnerOption || defaultEslintRunner,
  };
  const rows = arrayMap(objectKeys(BUDGET), (name) => measureRow(context, name));
  return {
    rows,
    parseFailures: context.detection.parseFailures,
    missingRoot: context.detection.missingRoot,
    fallbackSummary: buildFallbackSummary(context),
  };
}

function measureNavigabilityBudget(root = REPO_ROOT, options = {}) {
  return measureNavigabilityBudgetWithFailures(root, options).rows;
}

function formatFallbackTableNote(rows, fallbackSummary) {
  if (!fallbackSummary || fallbackSummary.totalFallbackSites === 0) return EMPTY_ROWS;
  const showsFallbackRow = arraySome(rows, (row) => setHas(FALLBACK_BUDGET_ROWS, row.name));
  if (!showsFallbackRow) return EMPTY_ROWS;
  return `${TABLE_NOTE_PREFIX}${fallbackSummary.totalFallbackSites}` +
    `${TABLE_NOTE_SITES_LABEL}${fallbackSummary.censusedSites}` +
    `${TABLE_NOTE_UNCENSUSED_LABEL}${fallbackSummary.uncensusedSites}` +
    `${TABLE_NOTE_SUFFIX}${LINE_SEPARATOR}`;
}

function maxRowNameWidth(rows) {
  let width = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].name.length > width) width = rows[index].name.length;
  }
  return width;
}

function renderTable(rows, parseFailures, fallbackSummary = null) {
  const width = maxRowNameWidth(rows);
  let text = EMPTY_ROWS;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const mark = row.met ? MET_MARK : UNMET_MARK;
    const shown = row.value === null ? OUTSTANDING_VALUE : String(row.value);
    text += `${mark} ${stringPadEnd(row.name, width)}${COLUMN_GAP}` +
      `${stringPadStart(shown, VALUE_COLUMN_WIDTH)}${BUDGET_SEPARATOR}${row.budget}` +
      LINE_SEPARATOR;
  }
  for (let index = 0; index < parseFailures.length; index += 1) {
    const failure = parseFailures[index];
    text += `${PARSE_FAILURE_PREFIX}${failure.file}${PARSE_FAILURE_SEPARATOR}` +
      `${failure.message}${LINE_SEPARATOR}`;
  }
  text += formatFallbackTableNote(rows, fallbackSummary);
  return text;
}

function selectedRows(rows, argv) {
  const index = arrayIndexOf(argv, ROWS_FLAG);
  if (index < 0) return rows;
  const rawNames = stringSplit(String(argv[index + 1] || EMPTY_ROWS), ROW_SEPARATOR);
  const seen = new SetConstructor();
  const names = [];
  for (let nameIndex = 0; nameIndex < rawNames.length; nameIndex += 1) {
    const name = rawNames[nameIndex];
    if (!setHas(seen, name)) {
      setAdd(seen, name);
      arrayPush(names, name);
    }
  }
  return arrayMap(names, (name) =>
    arrayFind(rows, (row) => row.name === name) ||
    {
      name: `${UNKNOWN_ROW_PREFIX}${name}`,
      value: UNKNOWN_ROW_VALUE,
      budget: UNKNOWN_ROW_BUDGET,
      met: false,
    });
}

function unrecognisedArgument(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === ROWS_FLAG) index += 1;
    else if (argument !== JSON_FLAG && argument !== METRIC_FLAG) return argument;
  }
  return undefined;
}

function main(argv) {
  const unrecognised = unrecognisedArgument(argv);
  if (unrecognised !== undefined) {
    process.stderr.write(`${USAGE_PREFIX}${unrecognised}${LINE_SEPARATOR}`);
    return EXIT_USAGE;
  }
  const measured = measureNavigabilityBudgetWithFailures();
  if (measured.missingRoot !== null) {
    process.stderr.write(`${MISSING_ROOT_PREFIX}${measured.missingRoot}${LINE_SEPARATOR}`);
  }
  const rows = selectedRows(measured.rows, argv);
  const unmet = arrayFilter(rows, (row) => !row.met).length;
  if (arrayIncludes(argv, JSON_FLAG)) {
    const report = {
      rows,
      unmet,
      parseFailures: measured.parseFailures,
      fallbackSummary: measured.fallbackSummary,
    };
    process.stdout.write(`${jsonStringify(report, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  } else if (!arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(renderTable(rows, measured.parseFailures, measured.fallbackSummary));
  }
  process.stdout.write(`${unmet}${LINE_SEPARATOR}`);
  return unmet === 0 ? EXIT_OK : EXIT_OVER_BUDGET;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {
  measureNavigabilityBudget,
  measureNavigabilityBudgetWithFailures,
  selectedRows,
  unrecognisedArgument,
};
