#!/usr/bin/env node
/**
 * The fallback-read closure ratchet: one one-way checker for the fallback
 * census rows, their evidence buckets and the semantic alternate reads the
 * census cannot see (reports/necessity/ratchet.md, reconciled with
 * reports/w4-fallback-read-closure.md D and the W3 leader-authority rows).
 *
 *   node scripts/checks/fallback-read-closure.js [--metric] [--json]
 *     [--rows a,b] [--buckets N0,N1] [--scope path,dir/] [--print-baseline]
 *
 * SUPPLEMENTARY, NEVER THE PROOF. A falling number shows fewer counted
 * shapes in the tree; it never shows that an arm is unnecessary or that
 * recovery works. That proof is an executed experiment: a trap run
 * (fallback-necessity-trap.js) or the deletion with the interaction's
 * witnesses green, and for a boundary arm a coupled-pair witness. A Quest's
 * doneWhen is never this checker alone.
 *
 * It measures and never acts (R27): it reads the tree, the committed census,
 * the baseline and their git history, prints numbers, and starts nothing.
 * Exit 0 within the baseline, 1 on a ratchet violation, 2 when it cannot
 * measure (census or baseline missing, census head not a commit in the
 * repository, a canonical lane absent, a source file that does not parse).
 *
 * Cells (rows x top-level directory), all one-way unless noted:
 *   fallback_sites/<row>/<dir>               detector sites of the census rows
 *   fallback_sites_uncensused/<row>/<dir>    sites with no valid census record
 *   fallback_sites_bucket/<row>/<dir>/<N>    sites by evidence bucket N0..N5
 *   fallback_sites_kept/<row>/<dir>          kept arms (validated, not one-way)
 *   census_records_unreproducible/<row>/<dir> records failing the integrity
 *     audit (fallback-necessity-sites.js): listed by name, never evidence
 *   census_head_not_ancestor/.               1 while the census was joined
 *     at a commit off HEAD's lineage (its records still bind by slice hash,
 *     read at that commit; a census head missing from the repository is
 *     unmeasurable)
 *   read_mode_fallback_members, non_required_leader_mode,
 *   role_derived_leader_reads, fixture_leader_role_rows,
 *   fixture_leader_role_rows_message_group: <row>/<dir>
 *     (fallback-read-closure-detectors.js)
 *
 * One-way rules: no cell may exceed the committed baseline
 * (data/fallback-census/closure-baseline.json; a cell it lacks is 0, so a new
 * site anywhere fails); across the baseline's own git history no cell may
 * rise, except that bucket cells re-base when the baseline's census head
 * changes (a refresh). Every census revision since the baseline began must
 * change `head` or `generatedAt` (a re-join, never a partial edit), and at a
 * refresh no site may move to a more exercised bucket (N0 < N1 = N2 < N3 <
 * N4b < N4c < N5). The tightening hint prints when the tree is below the
 * baseline; `--print-baseline` prints a baseline document for the tree and
 * writes nothing.
 *
 * Kept arms (data/fallback-census/kept.json): `{"version": 1, "entries":
 * [{"siteId", "trapRun", "witnessTest"}]}` and no other field - no labels,
 * no prose. An entry stands only when its site is in N4c or N5, `trapRun`
 * names data/fallback-census/traps/<trapRun>.json, a merged throw-mode trap
 * result bound to a red lane (`run.laneExitCode` != 0) at a head that is an
 * ancestor of HEAD in which that site's arm threw, and `witnessTest` is a
 * `.test.js` file present and classified in test/shards/primary-classes.json.
 *
 * Probe: a slice's measuring doneWhen is the existing `script` kind, e.g.
 *   {"probe": "script", "args": {"command": "node scripts/checks/fallback-read-closure.js
 *     --metric --rows fallback_sites_bucket --buckets N0,N1,N2,N3 --scope src/cdc/",
 *     "target": 0}}
 * `--metric` prints the number of sites in the selected cells; with
 * --rows/--buckets/--scope only those cells are compared with the baseline.
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {detectNavigabilityPatterns} from './code-navigability-detectors.js';
import {ownField} from './code-navigability-source.js';
import {
  EVIDENCE_BUCKETS, NECESSITY_BUCKET, auditCensus, bucketRank, censusBucket, censusLaneByRun,
  isCensusRowSite, necessitySiteId, readCensus, siteBucket, siteDirectory,
} from './fallback-necessity-sites.js';
import {SEMANTIC_ROW, detectSemanticSites} from './fallback-read-closure-detectors.js';
import {GIT_OUTPUT_BOUND, spawnGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';
import {printRatchetTighteningHint} from '../metric-check-helpers.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const CENSUS_FILE = 'data/fallback-census/census.json';
const BASELINE_FILE = 'data/fallback-census/closure-baseline.json';
const KEPT_FILE = 'data/fallback-census/kept.json';
const TRAP_DIRECTORY = 'data/fallback-census/traps';
const PRIMARY_CLASSES_FILE = 'test/shards/primary-classes.json';
const TRAP_MERGED_SCHEMA = 'fallback-necessity-trap-merged/1';
const THROW_MODE = 'throw';
const TEST_SUFFIX = '.test.js';
const JSON_SUFFIX = '.json';
const TEXT_ENCODING = 'utf8';
const BASELINE_VERSION = 1;
const CELL_SEPARATOR = '/';
const LIST_SEPARATOR = ',';
const NEWLINE = '\n';
const JSON_INDENT = 2;
const NAME = 'fallback-read-closure';
const WORD_SEPARATOR = ' ';
const LOCATION_SEPARATOR = '; ';
const WORKING_TREE = 'working tree';
const ROOT_CELL = '.';
const FIELD = Object.freeze({
  SCHEMA: 'schema', VERSION: 'version', ENTRIES: 'entries', CELLS: 'cells',
  CENSUS_HEAD: 'censusHead', FILE: 'file', ROW: 'row', RANGE: 'range', RUN: 'run', ID: 'id',
  ARMS: 'arms', SITE: 'site',
});
const HINT_LABEL = 'scripts/checks/fallback-read-closure.js';
const EXIT = Object.freeze({OK: 0, VIOLATION: 1, UNMEASURABLE: 2});
const GIT_OK = 0;
const GIT_NOT_ANCESTOR = 1;

const FAMILY = Object.freeze({
  SITES: 'fallback_sites',
  UNCENSUSED: 'fallback_sites_uncensused',
  BUCKET: 'fallback_sites_bucket',
  KEPT: 'fallback_sites_kept',
  UNREPRODUCIBLE: 'census_records_unreproducible',
  OFF_LINEAGE: 'census_head_not_ancestor',
  READ_MODE: SEMANTIC_ROW.READ_MODE,
  LEADER_MODE: SEMANTIC_ROW.LEADER_MODE,
  ROLE_READ: SEMANTIC_ROW.ROLE_READ,
  FIXTURE: SEMANTIC_ROW.FIXTURE,
  FIXTURE_MESSAGE_GROUP: SEMANTIC_ROW.FIXTURE_MESSAGE_GROUP,
});
const FAMILIES = Object.freeze(Object.values(FAMILY));
const SEMANTIC_FAMILIES = Object.freeze([FAMILY.READ_MODE, FAMILY.LEADER_MODE, FAMILY.ROLE_READ,
  FAMILY.FIXTURE, FAMILY.FIXTURE_MESSAGE_GROUP]);
const ONE_WAY_FAMILIES = Object.freeze(arrayFilter(FAMILIES, (family) => family !== FAMILY.KEPT));
const KEPT_BUCKETS = Object.freeze([NECESSITY_BUCKET.N4C, NECESSITY_BUCKET.N5]);
const KEPT_FIELDS = Object.freeze(['siteId', 'trapRun', 'witnessTest']);

const FLAG = Object.freeze({
  METRIC: '--metric', JSON: '--json', ROWS: '--rows', BUCKETS: '--buckets', SCOPE: '--scope',
  PRINT_BASELINE: '--print-baseline',
});
const VALUE_FLAGS = Object.freeze([FLAG.ROWS, FLAG.BUCKETS, FLAG.SCOPE]);
const SWITCH_FLAGS = Object.freeze([FLAG.METRIC, FLAG.JSON, FLAG.PRINT_BASELINE]);

const GIT = Object.freeze({
  IS_ANCESTOR: ['merge-base', '--is-ancestor'],
  VERIFY_COMMIT: ['rev-parse', '--verify', '--quiet'],
  COMMIT_SUFFIX: '^{commit}',
  HEAD: 'HEAD',
  LOG_REVERSE: ['log', '--reverse', '--format=%H'],
  RANGE: '..',
  PATHS: '--',
  SHOW: 'show',
  REVISION_FILE: ':',
});

const PROBLEM = Object.freeze({
  USAGE: 'usage: fallback-read-closure.js [--metric] [--json] [--rows a,b] [--buckets N0,N1] ' +
    '[--scope path,dir/] [--print-baseline]; unrecognised: ',
  UNKNOWN_ROW: 'unknown row: ',
  UNKNOWN_BUCKET: 'unknown bucket: ',
  NO_CENSUS_HEAD: 'the census head is not a commit in this repository, so no record can be ' +
    'audited: ',
  NOT_ANCESTOR: 'census head is not an ancestor of HEAD (its records still bind by slice hash): ',
  GIT: 'git failed: ',
  MISSING_LANES: 'the census lacks canonical lanes: ',
  PARSE: 'a source file does not parse, so every count is incomplete: ',
  MISSING_BASELINE: `missing ${BASELINE_FILE}: the ratchet refuses to run without a baseline`,
  BASELINE_SHAPE: 'the baseline is not {version: 1, censusHead, cells: {cell: count}}: ',
  RAISED: 'baseline raised (ratchet baselines are one-way): ',
  OVER: 'over the baseline: ',
  CENSUS_EDITED: 'census changed without a re-join (head and generatedAt unchanged): ',
  MOVED_UP: 'a census refresh moved a site to a more exercised bucket: ',
  KEPT_SHAPE: 'kept.json must be {version: 1, entries: [{siteId, trapRun, witnessTest}]}',
  KEPT_FIELD: 'kept entries carry no labels or prose; unexpected or missing field in ',
  KEPT_SITE: 'kept entry names no single tree site: ',
  KEPT_BUCKET: 'a kept arm must be in N4c or N5: ',
  KEPT_TRAP: 'kept entry names no red throw-mode trap run in which its arm threw: ',
  KEPT_WITNESS: 'kept entry witness is not a classified .test.js file: ',
});

function cellKey(...parts) {
  return parts.join(CELL_SEPARATOR);
}

function familyOf(cell) {
  return stringSplit(cell, CELL_SEPARATOR)[0];
}

function git(root, args, options = {}) {
  return spawnGit(args, {cwd: root, env: gitProcessEnvironment(), encoding: TEXT_ENCODING,
    ...options});
}

function gitLines(root, args) {
  const result = git(root, args);
  if (result.status !== GIT_OK) throw new Error(`${PROBLEM.GIT}${args.join(WORD_SEPARATOR)}`);
  return arrayFilter(stringSplit(result.stdout, NEWLINE), (line) => line.length > 0);
}

function gitShow(root, revision, file) {
  const result = git(root, [GIT.SHOW, `${revision}${GIT.REVISION_FILE}${file}`],
    {bound: GIT_OUTPUT_BOUND.HISTORY_BLOB_BATCH});
  return result.status === GIT_OK ? result.stdout : null;
}

function isAncestor(root, revision) {
  const result = git(root, [...GIT.IS_ANCESTOR, revision, GIT.HEAD]);
  if (result.status === GIT_OK) return true;
  if (result.status === GIT_NOT_ANCESTOR) return false;
  throw new Error(`${PROBLEM.GIT}${GIT.IS_ANCESTOR.join(WORD_SEPARATOR)} ${revision}`);
}

function commitExists(root, revision) {
  return git(root, [...GIT.VERIFY_COMMIT, `${revision}${GIT.COMMIT_SUFFIX}`]).status === GIT_OK;
}

function readJson(root, file) {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? jsonParse(fs.readFileSync(absolute, TEXT_ENCODING)) : undefined;
}

function inScope(file, scope) {
  return !scope || arraySome(scope, (prefix) => file === prefix ||
    (stringEndsWith(prefix, CELL_SEPARATOR) && stringStartsWith(file, prefix)));
}

// --- kept arms --------------------------------------------------------------

// A merged throw-mode trap result bound to a red lane run of this id.
function isRedThrowRun(trap, runId) {
  const run = ownField(trap, FIELD.RUN);
  return ownField(trap, FIELD.SCHEMA) === TRAP_MERGED_SCHEMA && trap.mode === THROW_MODE &&
    typeof trap.head === 'string' && ownField(run, FIELD.ID) === runId &&
    Number.isInteger(run.laneExitCode) && run.laneExitCode !== 0;
}

function trapProblem(root, entry, siteId) {
  const runId = entry.trapRun;
  if (typeof runId !== 'string' || stringSplit(runId, CELL_SEPARATOR).length > 1) return true;
  const trap = readJson(root, `${TRAP_DIRECTORY}/${runId}${JSON_SUFFIX}`);
  if (!isRedThrowRun(trap, runId)) return true;
  const arms = ownField(trap, FIELD.ARMS) || {};
  const threw = arraySome(objectKeys(arms), (id) =>
    ownField(arms[id], FIELD.SITE) === siteId && arms[id].thrown > 0);
  return !threw || !isAncestor(root, trap.head);
}

function witnessProblem(root, entry) {
  const witness = entry.witnessTest;
  const classes = readJson(root, PRIMARY_CLASSES_FILE)?.classes || {};
  return typeof witness !== 'string' || !stringEndsWith(witness, TEST_SUFFIX) ||
    !fs.existsSync(path.join(root, witness)) || !objectHasOwn(classes, witness);
}

function keptEntryProblem(root, entry, sitesById) {
  const fields = entry && typeof entry === 'object' ? objectKeys(entry) : [];
  if (fields.length !== KEPT_FIELDS.length || !arrayEvery(KEPT_FIELDS, (field) =>
    arrayIncludes(fields, field))) {
    return `${PROBLEM.KEPT_FIELD}${jsonStringify(entry)}`;
  }
  const matches = sitesById.get(entry.siteId) || [];
  if (matches.length !== 1) return `${PROBLEM.KEPT_SITE}${entry.siteId}`;
  if (!arrayIncludes(KEPT_BUCKETS, matches[0].bucket)) return `${PROBLEM.KEPT_BUCKET}${entry.siteId}`;
  if (trapProblem(root, entry, entry.siteId)) return `${PROBLEM.KEPT_TRAP}${entry.siteId}`;
  return witnessProblem(root, entry) ? `${PROBLEM.KEPT_WITNESS}${entry.siteId}` : null;
}

function readKeptEntries(root, sitesById, problems) {
  const kept = readJson(root, KEPT_FILE);
  if (kept === undefined) return new Set();
  const entries = ownField(kept, FIELD.ENTRIES);
  if (ownField(kept, FIELD.VERSION) !== BASELINE_VERSION || !Array.isArray(entries) ||
      objectKeys(kept).length !== 2) {
    problems.push(PROBLEM.KEPT_SHAPE);
    return new Set();
  }
  const valid = new Set();
  for (const entry of entries) {
    const problem = keptEntryProblem(root, entry, sitesById);
    if (problem) problems.push(problem);
    else valid.add(entry.siteId);
  }
  return valid;
}

// --- measurement ------------------------------------------------------------

function addSite(cells, locations, cell, location) {
  cells.set(cell, (cells.get(cell) || 0) + 1);
  if (!locations.has(cell)) locations.set(cell, []);
  locations.get(cell).push(location);
}

function censusSites(root, census, audit, measured) {
  const detection = detectNavigabilityPatterns(root);
  if (detection.parseFailures.length > 0) {
    throw new Error(`${PROBLEM.PARSE}${jsonStringify(detection.parseFailures)}`);
  }
  const sites = arrayMap(arrayFilter(detection.sites, isCensusRowSite), (site) => ({site,
    id: necessitySiteId(site), bucket: siteBucket(site, audit)}));
  const sitesById = new Map();
  for (const entry of sites) {
    if (!sitesById.has(entry.id)) sitesById.set(entry.id, []);
    sitesById.get(entry.id).push(entry);
  }
  const kept = readKeptEntries(root, sitesById, measured.violations);
  for (const {site, id, bucket} of sites) {
    const dir = siteDirectory(site.file);
    const location = `${site.file}:${site.loc.start.line} ${id}`;
    const at = (cell) => addSite(measured.cells, measured.locations, cell, {file: site.file,
      location});
    at(cellKey(FAMILY.SITES, site.row, dir));
    if (bucket === NECESSITY_BUCKET.UNCENSUSED) at(cellKey(FAMILY.UNCENSUSED, site.row, dir));
    else if (kept.has(id)) at(cellKey(FAMILY.KEPT, site.row, dir));
    else at(cellKey(FAMILY.BUCKET, site.row, dir, bucket));
  }
  for (const {record, reason} of audit.unreproducible) {
    const file = String(ownField(record, FIELD.FILE));
    addSite(measured.cells, measured.locations, cellKey(FAMILY.UNREPRODUCIBLE,
      String(ownField(record, FIELD.ROW)), siteDirectory(file)),
    {file, location: `${file} ${jsonStringify(ownField(record, FIELD.RANGE))} ${reason}`});
  }
}

function semanticSites(root, measured, rows) {
  const {sites, parseFailures} = detectSemanticSites(root, {rows});
  if (parseFailures.length > 0) throw new Error(`${PROBLEM.PARSE}${jsonStringify(parseFailures)}`);
  for (const site of sites) {
    const location = {file: site.file, location: `${site.file}:${site.line}`};
    if (site.row === SEMANTIC_ROW.FIXTURE_EXEMPT) {
      measured.exempt += 1;
      continue;
    }
    addSite(measured.cells, measured.locations, cellKey(site.row, siteDirectory(site.file)),
      location);
  }
}

/**
 * Measure every cell of a checkout.
 * @param {string} root the checkout
 * @param {{rows?: Set<string>}} options rows to measure (default all)
 * @return {Object} `{census, cells: Map, locations: Map, violations, exempt}`
 */
function measureClosure(root, options = {}) {
  const census = readCensus(root, CENSUS_FILE);
  if (!commitExists(root, census.head)) throw new Error(`${PROBLEM.NO_CENSUS_HEAD}${census.head}`);
  const audit = auditCensus(census, {root});
  if (audit.missingLanes.length > 0) {
    throw new Error(`${PROBLEM.MISSING_LANES}${audit.missingLanes.join(LIST_SEPARATOR)}`);
  }
  const measured = {census, cells: new Map(), locations: new Map(), violations: [], exempt: 0};
  if (!isAncestor(root, census.head)) {
    addSite(measured.cells, measured.locations, cellKey(FAMILY.OFF_LINEAGE, ROOT_CELL),
      {file: CENSUS_FILE, location: `${PROBLEM.NOT_ANCESTOR}${census.head}`});
  }
  const rows = options.rows;
  const censusRows = [FAMILY.SITES, FAMILY.UNCENSUSED, FAMILY.BUCKET, FAMILY.KEPT,
    FAMILY.UNREPRODUCIBLE];
  if (!rows || arraySome(censusRows, (row) => rows.has(row))) {
    censusSites(root, census, audit, measured);
  }
  const semantic = rows ? new Set(arrayFilter(SEMANTIC_FAMILIES, (row) => rows.has(row))) :
    undefined;
  if (!semantic || semantic.size > 0) semanticSites(root, measured, semantic);
  return measured;
}

// --- baseline and history ---------------------------------------------------

function parseBaseline(text, origin) {
  let baseline;
  try {
    baseline = jsonParse(text);
  } catch (error) {
    throw new Error(`${PROBLEM.BASELINE_SHAPE}${origin}: ${error.message}`);
  }
  const cells = ownField(baseline, FIELD.CELLS);
  const valid = ownField(baseline, FIELD.VERSION) === BASELINE_VERSION && cells &&
    typeof cells === 'object' && arrayEvery(objectKeys(cells), (cell) =>
    Number.isSafeInteger(cells[cell]) && cells[cell] >= 0);
  if (!valid) throw new Error(`${PROBLEM.BASELINE_SHAPE}${origin}`);
  return {origin, censusHead: ownField(baseline, FIELD.CENSUS_HEAD), cells};
}

function baselineHistory(root) {
  const working = path.join(root, BASELINE_FILE);
  if (!fs.existsSync(working)) throw new Error(PROBLEM.MISSING_BASELINE);
  const revisions = gitLines(root, [...GIT.LOG_REVERSE, GIT.PATHS, BASELINE_FILE]);
  const history = [];
  for (const revision of revisions) {
    const text = gitShow(root, revision, BASELINE_FILE);
    if (text !== null) history.push(parseBaseline(text, revision));
  }
  history.push(parseBaseline(fs.readFileSync(working, TEXT_ENCODING), WORKING_TREE));
  return {history, since: revisions[0]};
}

function baselineRaises(history) {
  const raises = [];
  for (let index = 1; index < history.length; index += 1) {
    const before = history[index - 1];
    const after = history[index];
    const rebased = before.censusHead !== after.censusHead;
    for (const cell of objectKeys(after.cells)) {
      if (rebased && familyOf(cell) === FAMILY.BUCKET) continue;
      if (familyOf(cell) === FAMILY.KEPT) continue;
      const previous = objectHasOwn(before.cells, cell) ? before.cells[cell] : 0;
      if (after.cells[cell] > previous) {
        raises.push(`${PROBLEM.RAISED}${cell} ${previous} (${before.origin}) -> ` +
          `${after.cells[cell]} (${after.origin})`);
      }
    }
  }
  return raises;
}

function bucketsByIdentity(census) {
  const laneByRun = censusLaneByRun(census);
  const buckets = new Map();
  for (const record of census.sites || []) {
    const identity = `${record.row}${NEWLINE}${record.file}${NEWLINE}${record.hash}${NEWLINE}` +
      `${record.occurrence}`;
    buckets.set(identity, {bucket: censusBucket(record, laneByRun), record});
  }
  return buckets;
}

function censusPairProblems(older, newer, label) {
  if (older.head === newer.head && older.generatedAt === newer.generatedAt) {
    return [`${PROBLEM.CENSUS_EDITED}${label}`];
  }
  if (older.head === newer.head) return [];
  const before = bucketsByIdentity(older);
  const problems = [];
  for (const [identity, {bucket, record}] of bucketsByIdentity(newer)) {
    const old = before.get(identity);
    if (old && bucketRank(bucket) > bucketRank(old.bucket)) {
      problems.push(`${PROBLEM.MOVED_UP}${record.file} ${jsonStringify(record.range)} ` +
        `${old.bucket} -> ${bucket} (${label})`);
    }
  }
  return problems;
}

// Census revisions since the baseline began, then the working tree.
function censusRevisionProblems(root, since) {
  const start = since || GIT.HEAD;
  const revisions = since ?
    gitLines(root, [...GIT.LOG_REVERSE, `${since}${GIT.RANGE}${GIT.HEAD}`, GIT.PATHS, CENSUS_FILE]) :
    [];
  const versions = [];
  for (const revision of [start, ...revisions]) {
    const text = gitShow(root, revision, CENSUS_FILE);
    if (text !== null) versions.push({label: revision, text});
  }
  const working = fs.readFileSync(path.join(root, CENSUS_FILE), TEXT_ENCODING);
  if (versions.length === 0 || versions[versions.length - 1].text !== working) {
    versions.push({label: WORKING_TREE, text: working});
  }
  const problems = [];
  for (let index = 1; index < versions.length; index += 1) {
    if (versions[index].text === versions[index - 1].text) continue;
    problems.push(...censusPairProblems(jsonParse(versions[index - 1].text),
      jsonParse(versions[index].text), versions[index].label));
  }
  return problems;
}

// --- selection and comparison -----------------------------------------------

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (arrayIncludes(SWITCH_FLAGS, flag)) {
      options[flag] = true;
    } else if (arrayIncludes(VALUE_FLAGS, flag) && index + 1 < argv.length) {
      const values = arrayMap(stringSplit(argv[index + 1], LIST_SEPARATOR), stringTrim);
      options[flag] = arrayFilter(values, (value) => value.length > 0);
      index += 1;
    } else {
      throw new Error(`${PROBLEM.USAGE}${flag}`);
    }
  }
  for (const row of options[FLAG.ROWS] || []) {
    if (!arrayIncludes(FAMILIES, row)) throw new Error(`${PROBLEM.UNKNOWN_ROW}${row}`);
  }
  for (const bucket of options[FLAG.BUCKETS] || []) {
    if (!arrayIncludes(EVIDENCE_BUCKETS, bucket)) throw new Error(`${PROBLEM.UNKNOWN_BUCKET}${bucket}`);
  }
  return options;
}

function cellSelected(cell, options) {
  const parts = stringSplit(cell, CELL_SEPARATOR);
  const rows = options[FLAG.ROWS];
  const buckets = options[FLAG.BUCKETS];
  if (rows && !arrayIncludes(rows, parts[0])) return false;
  return !buckets || parts[0] !== FAMILY.BUCKET || arrayIncludes(buckets, parts[parts.length - 1]);
}

// The cells of the selection, counting only sites inside the scope.
function selectedCells(measured, options) {
  const scope = options[FLAG.SCOPE];
  const cells = new Map();
  for (const [cell, locations] of measured.locations) {
    if (!cellSelected(cell, options)) continue;
    const count = arrayFilter(locations, (entry) => inScope(entry.file, scope)).length;
    if (count > 0) cells.set(cell, count);
  }
  return cells;
}

function overBaseline(cells, baseline, measured, options) {
  const over = [];
  for (const [cell, count] of cells) {
    if (!arrayIncludes(ONE_WAY_FAMILIES, familyOf(cell))) continue;
    const allowed = objectHasOwn(baseline.cells, cell) ? baseline.cells[cell] : 0;
    if (count <= allowed) continue;
    const sites = arrayFilter(measured.locations.get(cell), (entry) =>
      inScope(entry.file, options[FLAG.SCOPE]));
    over.push(`${PROBLEM.OVER}${cell} ${count} > ${allowed}: ` +
      `${arrayMap(sites, (entry) => entry.location).join(LOCATION_SEPARATOR)}`);
  }
  return over;
}

function oneWayTotal(cells, keep) {
  let total = 0;
  for (const [cell, count] of cells) {
    if (arrayIncludes(ONE_WAY_FAMILIES, familyOf(cell)) && keep(cell)) total += count;
  }
  return total;
}

function familyTotals(cells) {
  const totals = {};
  for (const family of FAMILIES) totals[family] = 0;
  for (const [cell, count] of cells) totals[familyOf(cell)] += count;
  return totals;
}

function bucketTotals(cells) {
  const totals = {};
  for (const bucket of EVIDENCE_BUCKETS) totals[bucket] = 0;
  for (const [cell, count] of cells) {
    const parts = stringSplit(cell, CELL_SEPARATOR);
    if (parts[0] === FAMILY.BUCKET) totals[parts[parts.length - 1]] += count;
  }
  return totals;
}

function summaryLines(measured, cells) {
  const totals = familyTotals(cells);
  const buckets = bucketTotals(cells);
  const lines = [`${NAME}: census ${measured.census.head} ` +
    `(${(measured.census.runs || []).length} runs); supplementary, never the proof`];
  for (const family of FAMILIES) {
    const detail = family === FAMILY.BUCKET ? ` (${arrayMap(EVIDENCE_BUCKETS, (bucket) =>
      `${bucket} ${buckets[bucket]}`).join(WORD_SEPARATOR)})` : '';
    lines.push(`  ${family}: ${totals[family]}${detail}`);
  }
  lines.push(`  fixture_leader_role_rows exempt (wasm/meta rows, not counted): ${measured.exempt}`);
  for (const [cell, locations] of measured.locations) {
    const family = familyOf(cell);
    if (family !== FAMILY.UNREPRODUCIBLE && family !== FAMILY.OFF_LINEAGE) continue;
    for (const entry of locations) lines.push(`  ${family}: ${entry.location}`);
  }
  return lines;
}

function baselineDocument(measured, cells) {
  const document = {version: BASELINE_VERSION, censusHead: measured.census.head, cells: {}};
  for (const cell of [...cells.keys()].sort()) {
    if (arrayIncludes(ONE_WAY_FAMILIES, familyOf(cell))) document.cells[cell] = cells.get(cell);
  }
  return document;
}

/**
 * Run the whole check on a checkout.
 * @param {string} root the checkout
 * @param {string[]} argv the CLI arguments
 * @return {{exitCode: number, stdout: string[], stderr: string[]}} the result
 */
// Measure, and unless only a baseline is wanted, replay the baseline and
// census history; throws when the tree cannot be measured.
function measureAgainstBaseline(root, options) {
  const rows = options[FLAG.ROWS] ? new Set(options[FLAG.ROWS]) : undefined;
  const measured = measureClosure(root, {rows});
  if (options[FLAG.PRINT_BASELINE]) return {measured, baseline: null};
  const {history, since} = baselineHistory(root);
  measured.violations.push(...baselineRaises(history), ...censusRevisionProblems(root, since));
  return {measured, baseline: history[history.length - 1]};
}

function reportLines(measured, cells, violations, totals, options) {
  if (options[FLAG.METRIC]) return [String(totals.total)];
  if (options[FLAG.JSON]) {
    return [jsonStringify({censusHead: measured.census.head, cells: Object.fromEntries(
      [...cells.entries()].sort()), violations, exempt: measured.exempt}, null, JSON_INDENT)];
  }
  const verdict = violations.length === 0 ?
    [`${NAME}: ratchet OK: ${totals.total} sites in one-way cells, baseline ${totals.allowed}`] : [];
  return [...summaryLines(measured, cells), ...verdict];
}

/**
 * Run the whole check on a checkout.
 * @param {string} root the checkout
 * @param {string[]} argv the CLI arguments
 * @return {{exitCode: number, stdout: string[], stderr: string[]}} the result
 */
function runClosureCheck(root, argv) {
  let options;
  let measuredRun;
  try {
    options = parseArguments(argv);
    measuredRun = measureAgainstBaseline(root, options);
  } catch (error) {
    return {exitCode: EXIT.UNMEASURABLE, stdout: [], stderr: [`${NAME}: ${error.message}`]};
  }
  const {measured, baseline} = measuredRun;
  const cells = selectedCells(measured, options);
  if (!baseline) {
    return {exitCode: EXIT.OK, stderr: [],
      stdout: [jsonStringify(baselineDocument(measured, cells), null, JSON_INDENT)]};
  }
  const violations = [...measured.violations, ...overBaseline(cells, baseline, measured, options)];
  const total = oneWayTotal(cells, () => true);
  const allowed = oneWayTotal(new Map(arrayMap(objectKeys(baseline.cells), (cell) =>
    [cell, baseline.cells[cell]])), (cell) => cellSelected(cell, options) && !options[FLAG.SCOPE]);
  const clean = violations.length === 0;
  return {
    exitCode: clean ? EXIT.OK : EXIT.VIOLATION,
    stdout: reportLines(measured, cells, violations, {total, allowed}, options),
    stderr: arrayMap(violations, (violation) => `${NAME}: ${violation}`),
    total, allowed,
    tighten: clean && !options[FLAG.SCOPE] && !options[FLAG.METRIC] && total < allowed,
  };
}

function main() {
  const result = runClosureCheck(process.cwd(), process.argv.slice(2));
  for (const line of result.stdout) process.stdout.write(`${line}${NEWLINE}`);
  for (const line of result.stderr) process.stderr.write(`${line}${NEWLINE}`);
  if (result.tighten) {
    printRatchetTighteningHint(HINT_LABEL, result.total, result.allowed, BASELINE_FILE);
  }
  return result.exitCode;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}

export {BASELINE_FILE, FAMILY, KEPT_FILE, measureClosure, runClosureCheck};
