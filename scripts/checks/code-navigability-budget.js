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
 * script scopes and counts its sites. A row whose input does not exist yet
 * (the coverage census) is outstanding with value null, never met; a source
 * file that does not parse makes every detector-backed row outstanding, and
 * the failing files are printed, because a count that skipped a file is not
 * a count. An absent `src` is the same incompleteness: every row that reads
 * detector sites or the source tree is outstanding and the missing root is
 * printed on stderr.
 *
 * It reads the tree and writes nothing (R27). Change a number here and in the
 * epic table together, never in one place. The measuring half takes the
 * tree root and is exported, so the rows are witnessed against fixture trees
 * (test/scripts/code-navigability-budget.test.js).
 *
 * Governed by the ambient-intrinsic audit: the prototype methods that audit
 * names and this script calls (Array filter, find, includes, indexOf, map,
 * some; String padEnd, padStart, split, trim) are captured at module load.
 * Methods the audit does not govern (join, slice, RegExp test, Map and Set
 * methods) are called directly. Census and classification records are read
 * by own fields only (ownField).
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  ROW_ORDER,
  detectNavigabilityPatterns,
  moduleExportNames,
  ownField,
  parseNavigabilitySource,
  siteIdentity,
  sourceFiles,
} from './code-navigability-detectors.js';
import {
  defaultEslintRunner,
  promotedPatterns,
  promotedReportCounts,
} from './code-navigability-eslint-promotion.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);
const stringPadStart = Function.call.bind(String.prototype.padStart);
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
  SCHEMA: 'schema', SITES: 'sites', CLASS: 'class', ENTRIES: 'entries',
  CLASSIFICATION: 'classification',
});
const CENSUS_FILE = 'data/fallback-census/census.json';
const CENSUS_SCHEMA = 'fallback-census/1';
const CLASSIFICATION_FILE = 'scripts/checks/code-navigability-fallback-classification.json';
const CENSUS_ROWS = Object.freeze(new Set([
  'two_source_fallback_reads', 'typeof_dual_paths', 'catch_returns_default']));
const CLASS_NEVER = 'never';
const CLASS_FALLBACK_ONLY = 'fallback-only';
const CLASS_BOTH = 'both';
const CLASS_PRIMARY_ONLY = 'primary-only';
const STRING_TYPE_NAME = 'string';
// The classes a run that loaded the file can give; `unloaded` is not one.
const EXECUTED_CLASSES = Object.freeze(new Set([
  CLASS_NEVER, CLASS_PRIMARY_ONLY, CLASS_FALLBACK_ONLY, CLASS_BOTH]));

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

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

function readText(root, relative) {
  return fs.readFileSync(path.join(root, relative), TEXT_ENCODING);
}

// A JSON input, or undefined when it is absent or unreadable as JSON.
function readJsonInput(root, relative) {
  if (!exists(root, relative)) return undefined;
  try {
    return JSON.parse(readText(root, relative));
  } catch (error) {
    process.stderr.write(`${relative}${PARSE_FAILURE_SEPARATOR}${error.message}\n`);
    return undefined;
  }
}

function matchesAny(file, patterns) {
  for (const pattern of patterns) if (pattern.test(file)) return true;
  return false;
}

function rowSites(context, row) {
  return arrayFilter(context.detection.sites, (site) => site.row === row);
}

function scopedCount(context, row, patterns) {
  return arrayFilter(rowSites(context, row), (site) => matchesAny(site.file, patterns)).length;
}

// The patterns ESLint promotes, and their report counts, read once.
function eslintPromotion(context) {
  if (!context.promotion) {
    const runner = context.eslintRunner;
    const sampleFile = sourceFiles(context.root, SOURCE_DIRECTORY)[0];
    const promoted = promotedPatterns(context.root, runner, sampleFile, RATCHETED_PATTERNS);
    context.promotion = {promoted,
      counts: promotedReportCounts(context.root, runner, promoted)};
  }
  return context.promotion;
}

// A baseline file counts only in the shared count-baseline shape.
function hasAuditBaseline(root, pattern) {
  const baseline = readJsonInput(root,
    `${PATTERN_BASELINE_PREFIX}${pattern}${PATTERN_BASELINE_SUFFIX}`);
  return Boolean(baseline) && baseline.version === BASELINE_VERSION &&
    Array.isArray(baseline.violations);
}

function patternsWithoutRatchet(context) {
  const {promoted} = eslintPromotion(context);
  return arrayFilter(RATCHETED_PATTERNS, (pattern) =>
    !promoted.has(pattern) && !hasAuditBaseline(context.root, pattern)).length;
}

// Every directory under src (src included) with its direct entries.
function sourceDirectories(root) {
  const directories = [];
  const visit = (relative) => {
    const entries = fs.readdirSync(path.join(root, relative), {withFileTypes: true});
    directories.push({relative, entries});
    for (const entry of entries) {
      if (entry.isDirectory()) visit(`${relative}/${entry.name}`);
    }
  };
  if (exists(root, SOURCE_DIRECTORY)) visit(SOURCE_DIRECTORY);
  return directories;
}

function directJsFileCount(entries) {
  return arrayFilter(entries, (entry) =>
    entry.isFile() && entry.name.slice(-JS_SUFFIX.length) === JS_SUFFIX).length;
}

function directoriesOverCap(context) {
  return arrayFilter(sourceDirectories(context.root), (directory) =>
    directJsFileCount(directory.entries) > DIRECTORY_FILE_CAP).length;
}

function lastNumericLine(text) {
  const numbers = arrayFilter(stringSplit(String(text), LINE_SEPARATOR), (line) =>
    NUMERIC_LINE.test(line));
  return numbers.length > 0 ? Number(numbers[numbers.length - 1]) : null;
}

// The generator's own --check verdict once it exists (a generator that
// fails has no verdict: outstanding); until then every directory without an
// INDEX.md is stale.
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

function exportsDecoder(root, file, decoder) {
  const names = readableExportNames(root, file);
  return Boolean(names) && arrayIncludes(names, decoder);
}

// A table has its decoder when a `<table>-row-decoder.js` under src exports
// `decode<Table>Row`.
function systemTablesWithoutDecoder(context) {
  const files = sourceFiles(context.root, SOURCE_DIRECTORY);
  return arrayFilter(SYSTEM_TABLE_DECODERS, ([fileName, decoder]) =>
    !arraySome(files, (file) => path.basename(file) === fileName &&
      exportsDecoder(context.root, file, decoder))).length;
}

// The names a module exports, or undefined (reported) when it cannot be
// read or parsed.
function readableExportNames(root, file) {
  try {
    return sourceExportNames(root, file);
  } catch (error) {
    process.stderr.write(`${file}${PARSE_FAILURE_SEPARATOR}${error.message}\n`);
    return undefined;
  }
}

// 1 when the bundle writer exports LOG_TAIL_LINE_COUNT without
// LOG_WINDOW_COVERAGE, 0 when it exports LOG_WINDOW_COVERAGE. Outstanding
// (null) while the writer is absent or unparsable, or exports neither name:
// a writer that names no window cannot be judged.
function logWindowsWithoutCoverage(context) {
  if (!exists(context.root, FAILURE_BUNDLE_WRITER)) return null;
  const names = readableExportNames(context.root, FAILURE_BUNDLE_WRITER);
  if (!names) return null;
  if (arrayIncludes(names, LOG_COVERAGE_EXPORT)) return 0;
  return arrayIncludes(names, LOG_TAIL_EXPORT) ? 1 : null;
}

// identity -> the classes its census records give (a duplicate identity
// has more than one), or undefined for a census that is absent, unreadable
// or fails the schema (`fallback-census/1` with a `sites` array). A record
// is an object with string row, file and hash and an integer occurrence
// (siteIdentity); anything else is invalid, has no identity and censuses
// nothing. A valid identity keeps whatever class it carries, so a second
// record with a malformed class still makes the identity a duplicate. Every
// field is read as an own field, never inherited.
function readCensus(root) {
  const census = readJsonInput(root, CENSUS_FILE);
  const sites = ownField(census, INPUT_FIELD.SITES);
  const valid = ownField(census, INPUT_FIELD.SCHEMA) === CENSUS_SCHEMA &&
    Array.isArray(sites);
  if (!valid) return undefined;
  const records = new Map();
  for (const record of sites) {
    const identity = siteIdentity(record);
    if (identity === undefined) continue;
    records.set(identity, [...(records.get(identity) || []),
      ownField(record, INPUT_FIELD.CLASS)]);
  }
  return records;
}

function isClassification(value) {
  return typeof value === STRING_TYPE_NAME && stringTrim(value).length > 0;
}

// The identities a classification classifies: an entry is an object with a
// site identity and a string classification that is not blank (whitespace
// only is blank); anything else, null included, classifies nothing. Every
// field is read as an own field, never inherited.
function readClassifiedIdentities(root) {
  const declared = ownField(readJsonInput(root, CLASSIFICATION_FILE), INPUT_FIELD.ENTRIES);
  const entries = Array.isArray(declared) ? declared : [];
  const identities = new Set();
  for (const entry of entries) {
    const identity = siteIdentity(entry);
    const classified = identity !== undefined &&
      isClassification(ownField(entry, INPUT_FIELD.CLASSIFICATION));
    if (classified) identities.add(identity);
  }
  return identities;
}

// The executed class the census gives a site: exactly one record with one
// of the four executed classes; `unloaded`, unknown, missing or duplicated
// records leave the site uncensused.
function censusClassOf(records, site) {
  const classes = records.get(siteIdentity(site)) || [];
  return classes.length === 1 && EXECUTED_CLASSES.has(classes[0]) ? classes[0] : undefined;
}

function censusContext(context) {
  if (!context.census) {
    const records = readCensus(context.root);
    const sites = arrayFilter(context.detection.sites, (site) => CENSUS_ROWS.has(site.row));
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
    !census.classified.has(siteIdentity(entry.site))).length;
}

// A promoted pattern is measured by ESLint's reports; any other by its
// detector.
function patternCount(row) {
  return (context) => {
    const {promoted, counts} = eslintPromotion(context);
    return promoted.has(row) ? counts.get(row) : context.detection.counts[row];
  };
}

function scopedRow(row, patterns) {
  return (context) => scopedCount(context, row, patterns);
}

// What a row reads, and so what leaves it outstanding: detector SITES (a
// parse failure or an absent source root), the SOURCE_TREE (an absent
// source root), or neither.
const READS = Object.freeze({SITES: 'sites', SOURCE_TREE: 'source-tree', NONE: 'none'});

// name -> [what it reads, measure]
const MEASURES = Object.freeze({
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
  return CAP_ROWS.has(name) ? value <= BUDGET[name] : value === 0;
}

function measureRow(context, name) {
  const [reads, measure] = rowMeasure(name);
  const measured = isIncomplete(context.detection, reads) ? null : measure(context);
  const value = measured === undefined ? null : measured;
  return {name, value, budget: BUDGET[name], met: isMet(name, value)};
}

/**
 * Measure every budget row against a tree, in the sealed table's order.
 * @param {string} root the checkout root
 * @param {Object} options `{eslintRunner}`: `(args, root) => {status, stdout}`
 * @return {Object} `{rows, parseFailures, missingRoot}`
 */
function measureNavigabilityBudgetWithFailures(root = REPO_ROOT, options = {}) {
  const context = {root, detection: detectNavigabilityPatterns(root),
    eslintRunner: options.eslintRunner || defaultEslintRunner};
  const rows = arrayMap(Object.keys(BUDGET), (name) => measureRow(context, name));
  return {rows, parseFailures: context.detection.parseFailures,
    missingRoot: context.detection.missingRoot};
}

function measureNavigabilityBudget(root = REPO_ROOT, options = {}) {
  return measureNavigabilityBudgetWithFailures(root, options).rows;
}

function renderTable(rows, parseFailures) {
  const width = Math.max(...arrayMap(rows, (row) => row.name.length));
  let text = EMPTY_ROWS;
  for (const row of rows) {
    const mark = row.met ? MET_MARK : UNMET_MARK;
    const shown = row.value === null ? OUTSTANDING_VALUE : String(row.value);
    text += `${mark} ${stringPadEnd(row.name, width)}${COLUMN_GAP}` +
      `${stringPadStart(shown, VALUE_COLUMN_WIDTH)}${BUDGET_SEPARATOR}${row.budget}` +
      LINE_SEPARATOR;
  }
  for (const failure of parseFailures) {
    text += `${PARSE_FAILURE_PREFIX}${failure.file}${PARSE_FAILURE_SEPARATOR}` +
      `${failure.message}${LINE_SEPARATOR}`;
  }
  return text;
}

// --rows <name,name>: measure only the named rows (each quest's probe).
// Row names have no spaces, so a name matches verbatim; a name that matches
// no row is itself unmet, so a misspelled probe reads red.
function selectedRows(rows, argv) {
  const index = arrayIndexOf(argv, ROWS_FLAG);
  if (index < 0) return rows;
  const names = [...new Set(stringSplit(String(argv[index + 1] || EMPTY_ROWS), ROW_SEPARATOR))];
  return arrayMap(names, (name) =>
    arrayFind(rows, (row) => row.name === name) ||
    {name: `${UNKNOWN_ROW_PREFIX}${name}`, value: UNKNOWN_ROW_VALUE,
      budget: UNKNOWN_ROW_BUDGET, met: false});
}

// The first argument the script does not recognise, or undefined: --json,
// --metric, and --rows with the value after it.
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
    const report = {rows, unmet, parseFailures: measured.parseFailures};
    process.stdout.write(`${JSON.stringify(report, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  } else if (!arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(renderTable(rows, measured.parseFailures));
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
