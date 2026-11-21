#!/usr/bin/env node
/**
 * Necessity trap: test whether a lane needs a fallback site's alternate arm
 * by running the lane with that arm observed or made to throw
 * (reports/necessity/experiment.md B; the owner's rule: an arm is kept or
 * deleted on an executed experiment, never on a label).
 *
 *   node scripts/checks/fallback-necessity-trap.js plan --out PLAN.json
 *     [--census data/fallback-census/census.json | --no-census]
 *   node scripts/checks/fallback-necessity-trap.js merge --out MERGED.json INPUT...
 *     [--run-id ID --lane LANE --lane-exit-code N]
 *
 * plan detects every census-row site in src/ with the one detector module
 * (code-navigability-detectors.js), buckets it from the committed census
 * (fallback-necessity-sites.js) and computes, per file, the insertions that
 * arm it: the armed side is the alternate (the fallback side), except for
 * N2 sites, whose question is the never-run primary. A two-source chain
 * `a ?? b ?? c` gets one arm per later term (`(trap(id#1),b)`,
 * `(trap(id#2),c)`), so a middle term that answers is seen; a conditional
 * arm is wrapped the same way, an if arm or try/catch block gets a leading
 * `trap(id#0);` (a catch passes its error as the trap error's cause), an
 * unbraced if arm is braced. Each file's rewrite is re-parsed; a site whose
 * rewrite does not parse, whose node is not found, or that cannot be armed
 * (an N2 two-source primary term always evaluates) is UNINSTRUMENTED with
 * its reason: printed and kept in the plan, never skipped. stdout: counts by
 * bucket, row and directory, instrumentable versus not, then every
 * uninstrumented site. Build the plan at the checkout the lane runs.
 *
 * The preload (fallback-necessity-trap-preload.js) applies the plan in every
 * process and worker of a lane:
 *
 *   NODE_OPTIONS="--import=$PWD/scripts/checks/fallback-necessity-trap-preload.js" \
 *   LAGRANGE_NECESSITY_TRAP_PLAN=$PWD/.tmp/trap/plan.json \
 *   LAGRANGE_NECESSITY_TRAP_OUT=$PWD/.tmp/trap/obs \
 *   LAGRANGE_NECESSITY_TRAP_MODE=observe \
 *   node scripts/run-classified-test-files.js --primary unit
 *
 * observe: no behaviour change; each process writes trap-<pid>-<thread>.json
 * with the arms that ran (count, the first caller frame outside the site
 * file, async or detached attribution) and the planned files it loaded.
 * throw: add LAGRANGE_NECESSITY_TRAP_SELECT (for example `bucket:N1`,
 * `site:ts.3fa9c01b22de.0`, `file:src/cdc/`, `!site:...` to exclude); the
 * selected arms throw NecessityTrapError (code LAGRANGE_NECESSITY_TRAP,
 * naming the site id) instead of running, and every arm is still recorded.
 * Run throw mode in rounds: exclude the arms already hit until no new arm
 * fires (experiment.md B.1 masking).
 *
 * merge folds per-process observation files (directories of trap-*.json, or
 * merged files from other hosts) into one deterministic JSON: arms summed,
 * callers unioned and sorted, loaded files counted per process. It refuses
 * inputs of different plans, modes or selections, and a process counted
 * twice. `--run-id/--lane/--lane-exit-code` bind a throw-mode result to its
 * lane outcome; such a file under data/fallback-census/traps/ is what a kept
 * arm must name (fallback-read-closure.js).
 *
 * Lab collection (observe mode). The rule for this repository: heavy work
 * reaches a lab host only through `lab test`, placement or `lab harness run`,
 * never a raw ssh runner (docs/development/home-lab.md). Placement forwards
 * only its retry, TAP-timeout and check-base policy to the host, runs the
 * classified runner in a throwaway worktree, and has no step before or after
 * the runner, so TODAY NO LAB ROUTE CAN RUN AN OBSERVE LANE. The smallest
 * addition (not in this slice; about 40 lines plus its placement-script
 * witness): scripts/lab/probe.js forwards LAGRANGE_NECESSITY_TRAP_MODE
 * (PLACEMENT_FORWARDED_ENV, forwardedPolicy, forwardedArgs) and, when it is
 * set, PLACEMENT_SCRIPT_TAIL in the worktree (a) builds the plan
 * (`plan --no-census --out .tmp/trap/plan.json`: the census head 6a240d3de is
 * reachable from no ref, so a host clone lacks it and could not bucket),
 * (b) exports NODE_OPTIONS=--import=$wt/scripts/checks/fallback-necessity-trap-preload.js
 * and the PLAN, OUT and MODE variables before the runner, and (c) after the
 * runner, before cleanup removes the worktree, runs
 * `merge --out "$HOME/necessity/$sha/merged-$(hostname).json" .tmp/trap/obs`.
 * With that route, from the controller (one host per lane share, at most
 * two hosts at once):
 *
 *   H=$(git rev-parse HEAD)          # the pushed head; never type a sha
 *   LAGRANGE_LAB_AGENT=claude:SESSION LAGRANGE_NECESSITY_TRAP_MODE=observe \
 *     node scripts/lab.js test all --lane unit --on HOST --sha "$H"
 *   mkdir -p .tmp/necessity/"$H"
 *   rsync --bwlimit=2500 HOST:necessity/"$H"/merged-'*'.json .tmp/necessity/"$H"/
 *   node scripts/checks/fallback-necessity-trap.js merge \
 *     --out .tmp/necessity/"$H"/merged.json .tmp/necessity/"$H"/merged-*.json
 *
 * Only the merged JSON crosses the network (per-process files stay on the
 * host). Bucket labels come from a controller-side `plan` at "$H": site ids
 * are the same on both sides. Throw mode runs the same way with
 * LAGRANGE_NECESSITY_TRAP_SELECT forwarded, then `merge --run-id ID --lane
 * LANE --lane-exit-code N` binds the result to the lane's outcome before it
 * is committed under data/fallback-census/traps/.
 *
 * Physical three-host formation (observe mode; not in this slice, about
 * 90-120 lines with its witness, no Dockerfile change: the preload's closure
 * is three files and no packages):
 * 1. test/distributed/harness/cluster-class-lifecycle-base.js, where the
 *    container env is composed (beside memoryLeak.captureHeapArtifacts'
 *    NODE_OPTIONS): when the harness runs with LAGRANGE_NECESSITY_TRAP_PLAN,
 *    append --import=/tmp/necessity-trap/fallback-necessity-trap-preload.js
 *    to NODE_OPTIONS and set PLAN=/tmp/necessity-trap/plan.json,
 *    OUT=/tmp/necessity-trap/out, MODE=observe, ROOT=/app (about 15 lines);
 * 2. test/distributed/harness/docker-provider.js: a putArchive of the
 *    preload, fallback-necessity-trap-runtime.js,
 *    fallback-branch-census-constants.js, the plan (built at the image's
 *    head) and an out/ directory owned by uid 10001 into each created
 *    container before start, beside the existing getContainerArchive (about
 *    30 lines; no bind mount, so nothing is copied to the remote hosts;
 *    confirm the distroless image's /tmp is writable, else use /data);
 * 3. at teardown, before removal: getContainerArchive of
 *    /tmp/necessity-trap/out per container into the run's evidence
 *    directory, refusing a container with no main-thread observation file
 *    (the roster the census lacks for dockerd-started processes), then
 *    `merge` on the controller (about 30 lines). docker stop's 25 s grace
 *    suffices: the node's own SIGTERM listener is followed and the exit
 *    flush writes the counts; first hits are already on disk.
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {detectNavigabilityPatterns} from './code-navigability-detectors.js';
import {
  fallbackChainTerms, parseNavigabilitySource, readSource, walkNodes,
} from './code-navigability-source.js';
import {
  NECESSITY_BUCKET, auditCensus, isCensusRowSite, necessitySiteId, readCensus, siteBucket,
  siteDirectory,
} from './fallback-necessity-sites.js';
import {
  OBSERVATION_PREFIX, OBSERVATION_SCHEMA, OBSERVATION_SUFFIX, PLAN_SCHEMA, TRAP_GLOBAL,
  applyInsertions,
} from './fallback-necessity-trap-runtime.js';
import {spawnGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

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
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MERGED_SCHEMA = 'fallback-necessity-trap-merged/1';
const DEFAULT_CENSUS = 'data/fallback-census/census.json';
const TEXT_ENCODING = 'utf8';
const NEWLINE = '\n';
const ARM_SEPARATOR = '#';
const NODE_KEY_SEPARATOR = '@';
const RANGE_SEPARATOR = ':';
const STATEMENT_END = ';';
const EXPRESSION_OPEN = '(';
const EXPRESSION_JOIN = ',';
const EXPRESSION_CLOSE = ')';
const BLOCK_OPEN = '{';
const BLOCK_CLOSE = '}';
const FAILED = 1;
const REFUSED = 2;
const GIT_REV_PARSE_HEAD = Object.freeze(['rev-parse', 'HEAD']);
const GIT_OK = 0;

const ROW = Object.freeze({
  TWO_SOURCE: 'two_source_fallback_reads',
  TYPEOF: 'typeof_dual_paths',
  CATCH: 'catch_returns_default',
});
const ROW_ORDER = Object.freeze([ROW.TWO_SOURCE, ROW.TYPEOF, ROW.CATCH]);
const ARMED_SIDE = Object.freeze({PRIMARY: 'primary', FALLBACK: 'fallback'});
const NODE_TYPE = Object.freeze({
  LOGICAL: 'LogicalExpression', IF: 'IfStatement', CONDITIONAL: 'ConditionalExpression',
  CATCH: 'CatchClause', BLOCK: 'BlockStatement', IDENTIFIER: 'Identifier',
});
const INDEXED_TYPES = Object.freeze(new Set([
  NODE_TYPE.LOGICAL, NODE_TYPE.IF, NODE_TYPE.CONDITIONAL, NODE_TYPE.CATCH,
]));
// Insertions at one offset: closes (innermost first), then statements, then
// opens (outermost first), so nested arms nest.
const EDIT_KIND = Object.freeze({CLOSE: 0, STATEMENT: 1, OPEN: 2});
const UNINSTRUMENTED = Object.freeze({
  NODE_NOT_FOUND: 'site-node-not-found',
  SIDE_NOT_FOUND: 'armed-side-not-found',
  PRIMARY_TERM: 'primary-term-always-evaluated',
  DOES_NOT_PARSE: 'rewrite-does-not-parse',
  COMBINATION_DOES_NOT_PARSE: 'combined-rewrite-does-not-parse',
});
const SUBCOMMAND = Object.freeze({PLAN: 'plan', MERGE: 'merge'});
const COLUMN = Object.freeze({INSTRUMENTABLE: 'instrumentable', UNINSTRUMENTED: 'uninstrumented'});
const HEADING = Object.freeze({
  BUCKET: 'by bucket:', ROW: 'by row:', DIRECTORY: 'by directory:',
});
const MISSING_ROOT = 'source root absent: ';
const FLAG = Object.freeze({
  OUT: '--out', CENSUS: '--census', NO_CENSUS: '--no-census', RUN_ID: '--run-id',
  LANE: '--lane', LANE_EXIT_CODE: '--lane-exit-code',
});
const VALUE_FLAGS = Object.freeze([
  FLAG.OUT, FLAG.CENSUS, FLAG.RUN_ID, FLAG.LANE, FLAG.LANE_EXIT_CODE,
]);
const MERGE_PROBLEM = Object.freeze({
  SCHEMA: 'not a trap observation or merged trap file: ',
  MIXED: 'inputs disagree on ',
  DUPLICATE: 'a process is counted twice: ',
  BOUND: 'a run-bound trap result cannot be merged again: ',
  RUN_FLAGS: '--run-id, --lane and --lane-exit-code go together',
  EMPTY: 'no observation files in the inputs',
});
const MERGE_KEYS = Object.freeze(['plan', 'head', 'mode', 'selection']);
const USAGE = 'usage: fallback-necessity-trap.js plan --out FILE [--census FILE | --no-census]\n' +
  '       fallback-necessity-trap.js merge --out FILE [--run-id ID --lane LANE ' +
  '--lane-exit-code N] INPUT...';

function nodeKey(type, range) {
  return `${type}${NODE_KEY_SEPARATOR}${range[0]}${RANGE_SEPARATOR}${range[1]}`;
}

function indexNodes(ast) {
  const nodes = new Map();
  walkNodes(ast, (node, parent) => {
    if (INDEXED_TYPES.has(node.type)) nodes.set(nodeKey(node.type, node.range), {node, parent});
  });
  return nodes;
}

function sameRange(node, range) {
  return Boolean(node) && node.range[0] === range[0] && node.range[1] === range[1];
}

function trapCall(armId, cause) {
  const causeArgument = cause ? `${EXPRESSION_JOIN}${cause}` : '';
  return `${TRAP_GLOBAL}${EXPRESSION_OPEN}${jsonStringify(armId)}${causeArgument}${EXPRESSION_CLOSE}`;
}

function span(node) {
  return node.range[1] - node.range[0];
}

function expressionArm(node, call) {
  return [
    {at: node.range[0], kind: EDIT_KIND.OPEN, span: span(node),
      text: `${EXPRESSION_OPEN}${call}${EXPRESSION_JOIN}`},
    {at: node.range[1], kind: EDIT_KIND.CLOSE, span: span(node), text: EXPRESSION_CLOSE},
  ];
}

function blockArm(block, call) {
  return [{at: block.range[0] + 1, kind: EDIT_KIND.STATEMENT, span: span(block),
    text: `${call}${STATEMENT_END}`}];
}

function statementArm(statement, call) {
  return [
    {at: statement.range[0], kind: EDIT_KIND.OPEN, span: span(statement),
      text: `${BLOCK_OPEN}${call}${STATEMENT_END}`},
    {at: statement.range[1], kind: EDIT_KIND.CLOSE, span: span(statement), text: BLOCK_CLOSE},
  ];
}

function armId(siteId, term) {
  return `${siteId}${ARM_SEPARATOR}${term}`;
}

function chainMatches(site, terms) {
  return Boolean(terms) && terms.length === site.terms.length &&
    arrayEvery(terms, (term, index) => sameRange(term, site.terms[index]));
}

function twoSourceArms(site, node, armedSide, siteId) {
  const terms = fallbackChainTerms(node, null);
  const refusal = armedSide === ARMED_SIDE.PRIMARY ? UNINSTRUMENTED.PRIMARY_TERM :
    chainMatches(site, terms) ? null : UNINSTRUMENTED.SIDE_NOT_FOUND;
  if (refusal) return {reason: refusal};
  const arms = [];
  const edits = [];
  for (let term = 1; term < terms.length; term += 1) {
    arms.push(term);
    edits.push(...expressionArm(terms[term], trapCall(armId(siteId, term))));
  }
  return {arms, edits};
}

function typeofArms(site, node, armedSide, siteId) {
  const range = site.sides[armedSide];
  const side = sameRange(node.consequent, range) ? node.consequent :
    sameRange(node.alternate, range) ? node.alternate : undefined;
  if (!side) return {reason: UNINSTRUMENTED.SIDE_NOT_FOUND};
  const call = trapCall(armId(siteId, 0));
  if (node.type === NODE_TYPE.CONDITIONAL) return {arms: [0], edits: expressionArm(side, call)};
  const edits = side.type === NODE_TYPE.BLOCK ? blockArm(side, call) : statementArm(side, call);
  return {arms: [0], edits};
}

function catchArms(site, node, parent, armedSide, siteId) {
  const block = armedSide === ARMED_SIDE.FALLBACK ? node.body : parent.block;
  if (!sameRange(block, site.sides[armedSide])) return {reason: UNINSTRUMENTED.SIDE_NOT_FOUND};
  const named = armedSide === ARMED_SIDE.FALLBACK && node.param?.type === NODE_TYPE.IDENTIFIER;
  return {arms: [0], edits: blockArm(block, trapCall(armId(siteId, 0), named ? node.param.name : ''))};
}

/**
 * The arms and insertions of one site, or the reason it cannot be armed.
 * @param {Object} site a detector site (census row)
 * @param {Object|undefined} found `{node, parent}` at the site's range
 * @param {string} bucket the site's bucket
 * @return {Object} `{armedSide, arms, edits}` or `{reason}`
 */
function siteArms(site, found, bucket) {
  if (!found) return {reason: UNINSTRUMENTED.NODE_NOT_FOUND};
  const armedSide = bucket === NECESSITY_BUCKET.N2 ? ARMED_SIDE.PRIMARY : ARMED_SIDE.FALLBACK;
  const siteId = necessitySiteId(site);
  let result;
  if (site.row === ROW.TWO_SOURCE) result = twoSourceArms(site, found.node, armedSide, siteId);
  else if (site.row === ROW.TYPEOF) result = typeofArms(site, found.node, armedSide, siteId);
  else result = catchArms(site, found.node, found.parent, armedSide, siteId);
  return result.reason ? result : {armedSide, ...result};
}

function compareEdits(left, right) {
  if (left.at !== right.at) return left.at - right.at;
  if (left.kind !== right.kind) return left.kind - right.kind;
  if (left.kind === EDIT_KIND.OPEN) return right.span - left.span;
  return left.kind === EDIT_KIND.CLOSE ? left.span - right.span : 0;
}

function orderedInsertions(armed) {
  const edits = [];
  for (const one of armed) edits.push(...one.edits);
  edits.sort(compareEdits);
  return arrayMap(edits, (edit) => [edit.at, edit.text]);
}

function parses(text, file, insertions) {
  try {
    parseNavigabilitySource(applyInsertions(text, insertions), file);
    return true;
  } catch (_error) {
    // The rewrite is not JavaScript: the caller reports its sites as
    // uninstrumented.
    return false;
  }
}

/**
 * The syntax gate: the armed sites whose rewrite parses, alone and together.
 * @param {string} text the file's source
 * @param {string} file repo-relative path
 * @param {Array<Object>} armed `{site, edits, ...}` per armable site
 * @return {{accepted: Array<Object>, rejected: Array<{one: Object, reason: string}>}}
 */
function gateParsableArms(text, file, armed) {
  if (parses(text, file, orderedInsertions(armed))) return {accepted: armed, rejected: []};
  const accepted = arrayFilter(armed, (one) => parses(text, file, orderedInsertions([one])));
  const rejected = arrayMap(arrayFilter(armed, (one) => !arrayIncludes(accepted, one)),
    (one) => ({one, reason: UNINSTRUMENTED.DOES_NOT_PARSE}));
  if (parses(text, file, orderedInsertions(accepted))) return {accepted, rejected};
  for (const one of accepted) {
    rejected.push({one, reason: UNINSTRUMENTED.COMBINATION_DOES_NOT_PARSE});
  }
  return {accepted: [], rejected};
}

function siteSummary(site, bucket) {
  return {id: necessitySiteId(site), file: site.file, line: site.loc.start.line, row: site.row,
    bucket};
}

function planFile(file, text, fileSites, bucketOf) {
  const nodes = indexNodes(parseNavigabilitySource(text, file).ast);
  const armed = [];
  const uninstrumented = [];
  for (const site of fileSites) {
    const bucket = bucketOf(site);
    const result = siteArms(site, nodes.get(nodeKey(site.kind, site.range)), bucket);
    if (result.reason) uninstrumented.push({...siteSummary(site, bucket), reason: result.reason});
    else armed.push({site, bucket, ...result});
  }
  const {accepted, rejected} = gateParsableArms(text, file, armed);
  for (const {one, reason} of rejected) {
    uninstrumented.push({...siteSummary(one.site, one.bucket), reason});
  }
  if (accepted.length === 0) return {uninstrumented};
  const sites = arrayMap(accepted, (one) => ({
    ...siteSummary(one.site, one.bucket), range: one.site.range, hash: one.site.hash,
    occurrence: one.site.occurrence, armedSide: one.armedSide, arms: one.arms,
  }));
  return {entry: {sites, insertions: orderedInsertions(accepted)}, uninstrumented};
}

function gitHead(root) {
  const result = spawnGit(GIT_REV_PARSE_HEAD, {
    cwd: root, env: gitProcessEnvironment(), encoding: TEXT_ENCODING,
  });
  return result.status === GIT_OK ? stringTrim(result.stdout) : null;
}

/**
 * Build the trap plan of a checkout.
 * @param {Object} options `{root, census, readFiles, head}`: census a
 *   parsed census or null (every site uncensused); readFiles passes through
 *   to auditCensus
 * @return {Object} the plan
 */
function sitesByFile(sites) {
  const byFile = new Map();
  for (const site of arrayFilter(sites, isCensusRowSite)) {
    if (!byFile.has(site.file)) byFile.set(site.file, []);
    byFile.get(site.file).push(site);
  }
  return byFile;
}

function unreproducibleSummary(audit) {
  return arrayMap(audit ? audit.unreproducible : [], ({record, reason}) =>
    ({file: record?.file ?? null, range: record?.range ?? null, reason}));
}

function plannedFiles(root, byFile, audit) {
  const files = {};
  const uninstrumented = [];
  const bucketOf = (site) => siteBucket(site, audit);
  for (const file of [...byFile.keys()].sort()) {
    const planned = planFile(file, readSource(root, file), byFile.get(file), bucketOf);
    if (planned.entry) files[file] = planned.entry;
    uninstrumented.push(...planned.uninstrumented);
  }
  return {files, uninstrumented};
}

function buildTrapPlan({root = ROOT, census = null, readFiles, head} = {}) {
  const detection = detectNavigabilityPatterns(root);
  if (detection.missingRoot) throw new Error(`${MISSING_ROOT}${detection.missingRoot}`);
  const audit = census ? auditCensus(census, {root, readFiles}) : null;
  const {files, uninstrumented} = plannedFiles(root, sitesByFile(detection.sites), audit);
  return {
    schema: PLAN_SCHEMA, root, head: head === undefined ? gitHead(root) : head,
    censusHead: audit ? audit.head : null, trap: TRAP_GLOBAL, files, uninstrumented,
    unparsedFiles: detection.parseFailures, unreproducibleRecords: unreproducibleSummary(audit),
  };
}

function countInto(table, key, column) {
  if (!objectHasOwn(table, key)) table[key] = {instrumentable: 0, uninstrumented: 0, arms: 0};
  table[key][column] += 1;
}

/**
 * Counts of a plan by bucket, row and directory.
 * @param {Object} plan a trap plan
 * @return {Object} `{sites, arms, byBucket, byRow, byDirectory}`
 */
function planCounts(plan) {
  const counts = {sites: 0, arms: 0, byBucket: {}, byRow: {}, byDirectory: {}};
  const tally = (site, column) => {
    counts.sites += 1;
    countInto(counts.byBucket, site.bucket, column);
    countInto(counts.byRow, site.row, column);
    countInto(counts.byDirectory, siteDirectory(site.file), column);
  };
  for (const file of objectKeys(plan.files)) {
    for (const site of plan.files[file].sites) {
      tally({...site, file}, COLUMN.INSTRUMENTABLE);
      counts.arms += site.arms.length;
      counts.byBucket[site.bucket].arms += site.arms.length;
    }
  }
  for (const site of plan.uninstrumented) tally(site, COLUMN.UNINSTRUMENTED);
  return counts;
}

function tableLines(title, table, order) {
  const keys = order ? arrayFilter(order, (key) => objectHasOwn(table, key)) :
    objectKeys(table).sort();
  return [title, ...arrayMap(keys, (key) => `  ${key}: instrumentable ` +
    `${table[key].instrumentable} uninstrumented ${table[key].uninstrumented}`)];
}

function formatPlanSummary(plan) {
  const counts = planCounts(plan);
  const instrumentable = counts.sites - plan.uninstrumented.length;
  const lines = [
    `trap plan at ${plan.head} (census ${plan.censusHead}): ${counts.sites} sites, ` +
      `${counts.arms} arms; instrumentable ${instrumentable}, UNINSTRUMENTED ` +
      `${plan.uninstrumented.length}`,
    ...tableLines(HEADING.BUCKET, counts.byBucket, [...Object.values(NECESSITY_BUCKET)]),
    ...tableLines(HEADING.ROW, counts.byRow, ROW_ORDER),
    ...tableLines(HEADING.DIRECTORY, counts.byDirectory),
  ];
  for (const site of plan.uninstrumented) {
    lines.push(`UNINSTRUMENTED ${site.file}:${site.line} ${site.id} ${site.row} ${site.bucket} ` +
      `${site.reason}`);
  }
  for (const failure of plan.unparsedFiles) {
    lines.push(`UNPARSED ${failure.file}: its sites are unknown: ${failure.message}`);
  }
  for (const record of plan.unreproducibleRecords) {
    lines.push(`CENSUS RECORD UNREPRODUCIBLE ${record.file} ${jsonStringify(record.range)} ` +
      `${record.reason}: its site is uncensused`);
  }
  return lines.join(NEWLINE);
}

// --- merge ------------------------------------------------------------------

function asMerged(doc, source) {
  if (doc?.schema === MERGED_SCHEMA) {
    if (doc.run) throw new Error(`${MERGE_PROBLEM.BOUND}${source}`);
    return doc;
  }
  if (doc?.schema !== OBSERVATION_SCHEMA) throw new Error(`${MERGE_PROBLEM.SCHEMA}${source}`);
  const arms = {};
  for (const id of objectKeys(doc.arms)) {
    const {caller, ...arm} = doc.arms[id];
    arms[id] = {...arm, processes: 1, callers: caller ? [caller] : []};
  }
  const loaded = {};
  for (const file of doc.loaded) loaded[file] = 1;
  return {schema: MERGED_SCHEMA, plan: doc.plan, head: doc.head, mode: doc.mode,
    selection: doc.selection, processes: [doc.process], loaded,
    refused: arrayMap(doc.refused, (item) => ({...item, processes: 1})), arms};
}

function addArm(into, arm) {
  if (!into) return {...arm, callers: [...arm.callers]};
  return {...into, count: into.count + arm.count, thrown: into.thrown + arm.thrown,
    processes: into.processes + arm.processes, async: into.async || arm.async,
    detached: into.detached || arm.detached,
    callers: [...new Set([...into.callers, ...arm.callers])]};
}

function sortedObject(table, value = (item) => item) {
  const sorted = {};
  for (const key of objectKeys(table).sort()) sorted[key] = value(table[key]);
  return sorted;
}

function mergedSummary(arms) {
  const sites = new Set();
  const byBucket = {};
  let thrownArms = 0;
  for (const id of objectKeys(arms)) {
    const arm = arms[id];
    if (arm.thrown > 0) thrownArms += 1;
    if (!objectHasOwn(byBucket, arm.bucket)) byBucket[arm.bucket] = {arms: 0, sites: 0};
    byBucket[arm.bucket].arms += 1;
    if (!sites.has(arm.site)) byBucket[arm.bucket].sites += 1;
    sites.add(arm.site);
  }
  return {armsHit: objectKeys(arms).length, sitesHit: sites.size, thrownArms,
    byBucket: sortedObject(byBucket)};
}

/**
 * Fold observation and merged documents into one merged document.
 * @param {Array<{doc: Object, source: string}>} inputs parsed inputs
 * @param {Object|null} run `{id, lane, laneExitCode}` to bind, or null
 * @return {Object} the merged document (deterministic for the same inputs)
 */
function assertMergeable(docs) {
  if (docs.length === 0) throw new Error(MERGE_PROBLEM.EMPTY);
  for (const key of MERGE_KEYS) {
    if (arraySome(docs, (doc) => doc[key] !== docs[0][key])) {
      throw new Error(`${MERGE_PROBLEM.MIXED}${key}`);
    }
  }
}

// Fold one merged-shape document into the running totals.
function foldDocument(totals, doc) {
  for (const key of doc.processes) {
    if (totals.processes.has(key)) throw new Error(`${MERGE_PROBLEM.DUPLICATE}${key}`);
    totals.processes.add(key);
  }
  for (const file of objectKeys(doc.loaded)) {
    totals.loaded[file] = (totals.loaded[file] ?? 0) + doc.loaded[file];
  }
  for (const item of doc.refused) {
    const key = jsonStringify([item.file, item.reason]);
    totals.refused.set(key, {file: item.file, reason: item.reason,
      processes: (totals.refused.get(key)?.processes ?? 0) + item.processes});
  }
  for (const id of objectKeys(doc.arms)) totals.arms[id] = addArm(totals.arms[id], doc.arms[id]);
}

function mergeObservations(inputs, run = null) {
  const docs = arrayMap(inputs, ({doc, source}) => asMerged(doc, source));
  assertMergeable(docs);
  const totals = {processes: new Set(), loaded: {}, refused: new Map(), arms: {}};
  for (const doc of docs) foldDocument(totals, doc);
  const {processes, loaded, refused, arms} = totals;
  const sortedArms = sortedObject(arms, (arm) => sortedObject({...arm,
    callers: [...arm.callers].sort()}));
  return {
    schema: MERGED_SCHEMA, plan: docs[0].plan, head: docs[0].head, mode: docs[0].mode,
    selection: docs[0].selection, ...(run ? {run} : {}),
    summary: {processes: processes.size, ...mergedSummary(sortedArms)},
    processes: [...processes].sort(), loaded: sortedObject(loaded),
    refused: arrayMap([...refused.keys()].sort(), (key) => refused.get(key)),
    arms: sortedArms,
  };
}

function isObservationName(name) {
  return stringStartsWith(name, OBSERVATION_PREFIX) && stringEndsWith(name, OBSERVATION_SUFFIX);
}

function readMergeInputs(paths) {
  const inputs = [];
  for (const given of paths) {
    const files = fs.statSync(given).isDirectory() ?
      arrayMap(arrayFilter(fs.readdirSync(given).sort(), isObservationName),
        (name) => path.join(given, name)) : [given];
    for (const file of files) {
      inputs.push({doc: jsonParse(fs.readFileSync(file, TEXT_ENCODING)), source: file});
    }
  }
  return inputs;
}

function parseArguments(argv) {
  const flags = {};
  const inputs = [];
  for (let index = 1; index < argv.length; index += 1) {
    if (arrayIncludes(VALUE_FLAGS, argv[index])) {
      flags[argv[index]] = argv[index + 1];
      index += 1;
    } else if (argv[index] === FLAG.NO_CENSUS) {
      flags[FLAG.NO_CENSUS] = true;
    } else {
      inputs.push(argv[index]);
    }
  }
  return {subcommand: argv[0], flags, inputs};
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
  fs.writeFileSync(path.resolve(file), `${jsonStringify(value)}${NEWLINE}`);
}

function runPlan(flags, write) {
  const census = flags[FLAG.NO_CENSUS] ? null :
    readCensus(ROOT, flags[FLAG.CENSUS] || DEFAULT_CENSUS);
  const plan = buildTrapPlan({root: ROOT, census});
  writeJson(flags[FLAG.OUT], plan);
  write(formatPlanSummary(plan));
  write(`plan: wrote ${flags[FLAG.OUT]}`);
  return plan.unparsedFiles.length === 0 ? 0 : FAILED;
}

function runBinding(flags) {
  const values = [flags[FLAG.RUN_ID], flags[FLAG.LANE], flags[FLAG.LANE_EXIT_CODE]];
  const given = arrayFilter(values, (value) => value !== undefined).length;
  if (given === 0) return null;
  if (given !== values.length || !Number.isInteger(Number(values[2]))) {
    throw new Error(MERGE_PROBLEM.RUN_FLAGS);
  }
  return {id: values[0], lane: values[1], laneExitCode: Number(values[2])};
}

function runMerge(flags, inputs, write) {
  const merged = mergeObservations(readMergeInputs(inputs), runBinding(flags));
  writeJson(flags[FLAG.OUT], merged);
  const {summary} = merged;
  write(`merge: ${summary.processes} processes, ${summary.armsHit} arms hit at ` +
    `${summary.sitesHit} sites (${summary.thrownArms} thrown), ${merged.refused.length} ` +
    `refused files -> ${flags[FLAG.OUT]}`);
  for (const item of merged.refused) {
    write(`merge: REFUSED ${item.file} ${item.reason} in ${item.processes} processes`);
  }
  return merged.refused.length === 0 ? 0 : FAILED;
}

function main(argv) {
  const write = (line) => process.stdout.write(`${line}${NEWLINE}`);
  const {subcommand, flags, inputs} = parseArguments(argv);
  if (!flags[FLAG.OUT] || !arrayIncludes(Object.values(SUBCOMMAND), subcommand)) {
    process.stderr.write(`${USAGE}${NEWLINE}`);
    return REFUSED;
  }
  return subcommand === SUBCOMMAND.PLAN ? runPlan(flags, write) : runMerge(flags, inputs, write);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`fallback-necessity-trap: ${error.message}${NEWLINE}`);
    process.exitCode = REFUSED;
  }
}

export {
  MERGED_SCHEMA,
  UNINSTRUMENTED,
  buildTrapPlan,
  formatPlanSummary,
  gateParsableArms,
  mergeObservations,
  orderedInsertions,
  planCounts,
  readMergeInputs,
};
