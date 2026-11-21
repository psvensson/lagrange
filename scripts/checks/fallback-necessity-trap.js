#!/usr/bin/env node
/**
 * Necessity trap: test whether a lane needs a fallback site's alternate arm
 * by running the lane with that arm observed or made to throw
 * (reports/necessity/experiment.md B; the owner's rule: an arm is kept or
 * deleted on an executed experiment, never on a label).
 *
 * CONCLUSION RULE. "arm X is unnecessary" requires complete-coverage observe
 * and throw runs in every lane (roster complete, nothing swallowed, the file
 * loaded), the producer-history check (an unreachable arm may be a required
 * path whose producer changed), then the deletion itself with its change cone
 * and the interaction's boundary witness green; the apparatus alone never
 * establishes it, and never for recovery schedules that no lane drives.
 * A throw is not a deletion: a trapped catch raises NecessityTrapError where
 * the deleted catch would let the original error through, and a trapped term
 * throws where its deletion would yield undefined, so trap-green and
 * deletion-green can differ either way; the deletion run is the final word.
 *
 *   node scripts/checks/fallback-necessity-trap.js plan --out PLAN.json
 *     [--census data/fallback-census/census.json | --no-census]
 *   node scripts/checks/fallback-necessity-trap.js select --plan PLAN.json --select SPEC
 *   node scripts/checks/fallback-necessity-trap.js merge --out MERGED.json INPUT...
 *   node scripts/checks/fallback-necessity-trap.js report --plan PLAN.json
 *     --merged MERGED.json --out REPORT.json
 *     [--run-id ID --lane LANE --lane-exit-code N --lane-log FILE...]
 *
 * plan detects every census-row site in src/ with the one detector module
 * (code-navigability-detectors.js), buckets it from the committed census
 * (fallback-necessity-sites.js) and computes, per file, the insertions that
 * arm it: the armed side is the alternate (the fallback side), except for
 * N2 sites, whose question is the never-run primary. An arm id names its
 * side: `<site>#f1` is the first later term of a chain, `#f0` a typeof or
 * catch fallback side, `#p0` a primary side, so one id means one side
 * whatever census the plan was built with. A chain `a ?? b ?? c` gets one arm
 * per later term (`(trap(id#f1),b)`, `(trap(id#f2),c)`), so a middle term
 * that answers is seen; a conditional arm is wrapped the same way, an if arm
 * or try/catch block gets a leading `trap(id#f0);` (a catch passes its error
 * as the trap error's cause), an unbraced if arm is braced. Each file's
 * rewrite is re-parsed; a site whose rewrite does not parse, whose node is
 * not found, or that cannot be armed (an N2 two-source primary term always
 * evaluates) is UNINSTRUMENTED with its reason: printed and kept in the
 * plan, never skipped. Bucket selections need a plan built with the census:
 * under --no-census every site is `uncensused`.
 *
 * A lane runs with both preloads, the census preload in roster-only mode
 * first (it records every Node child and worker the lane launches, so a
 * process that ran unarmed shows up as a gap) and the trap preload
 * (fallback-necessity-trap-preload.js), which applies the plan:
 *
 *   OUT=$PWD/.tmp/trap/obs; mkdir -p "$OUT"
 *   NODE_OPTIONS="--import=$PWD/scripts/checks/fallback-branch-census-preload.js \
 *     --import=$PWD/scripts/checks/fallback-necessity-trap-preload.js" \
 *   LAGRANGE_CENSUS_COVERAGE_DIR=$OUT LAGRANGE_NECESSITY_TRAP_OUT=$OUT \
 *   LAGRANGE_NECESSITY_TRAP_PLAN=$PWD/.tmp/trap/plan.json \
 *   LAGRANGE_NECESSITY_TRAP_MODE=observe \
 *   node scripts/run-classified-test-files.js --primary unit
 *
 * (NODE_V8_COVERAGE stays unset: a trap run collects no coverage.)
 * observe: no behaviour change; each process start writes its own
 * trap-<pid>-<thread>-<token>.json (created exclusively, never overwritten)
 * with the arms that ran (count, the first caller frame outside the site
 * file, async or detached attribution), the planned files it loaded, and
 * whether the roster covered it.
 * throw: add LAGRANGE_NECESSITY_TRAP_SELECT (for example `bucket:N1`,
 * `site:ts.3fa9c01b22de.0`, `file:src/cdc/`, `!arm:...#f2` to exclude);
 * `select` prints the arms a selection arms first, and a selection that arms
 * no planned arm refuses to start. The selected arms throw NecessityTrapError
 * (code LAGRANGE_NECESSITY_TRAP, naming the arm and site) instead of running,
 * and every arm is still recorded. Run throw mode in rounds: exclude the arms
 * already hit until no new arm fires (experiment.md B.1 masking).
 *
 * merge (fallback-necessity-trap-results.js) folds per-process files with
 * the roster, host by host and then across hosts, and is INCOMPLETE (exit 1)
 * when a rostered process left no observation, an observation ran without
 * the roster, or a file was refused. report classifies every planned arm as
 * HIT, NOT-REACHED (its file loaded) or NOT-LOADED (nothing is known), and in
 * a throw run each armed arm that threw as SURFACED or SWALLOWED; its verdict
 * is never green-meaning-unneeded (SWALLOWED and INCOMPLETE exit 1). A report
 * of a single-site throw run bound to its lane under
 * data/fallback-census/traps/ is what a kept arm must name
 * (fallback-read-closure.js).
 *
 * LIMITS. A Node process started outside the wrapped child_process and
 * worker_threads APIs, or a module loaded from a copy outside the plan root
 * (a packed install), is neither rostered nor armed. A restarted process
 * that reuses a pid shares one roster entry with its predecessor, so the
 * roster proves at least one observation per pid and thread, not one per
 * start. A trap report is hand-writable JSON: it records the
 * plan digest and a digest of the lane log it read, nothing stronger.
 *
 * Lab collection (observe mode). The rule for this repository: heavy work
 * reaches a lab host only through `lab test`, placement or `lab harness run`,
 * never a raw ssh runner (docs/development/home-lab.md). Placement forwards
 * only its retry, TAP-timeout and check-base policy to the host, runs the
 * classified runner in a throwaway worktree, and has no step before or after
 * the runner, so TODAY NO LAB ROUTE CAN RUN A TRAP LANE. The smallest
 * addition (not in this slice; about 40 lines plus its placement-script
 * witness): scripts/lab/probe.js forwards LAGRANGE_NECESSITY_TRAP_MODE and
 * LAGRANGE_NECESSITY_TRAP_SELECT (PLACEMENT_FORWARDED_ENV, forwardedPolicy,
 * forwardedArgs) and, when the mode is set, PLACEMENT_SCRIPT_TAIL in the
 * worktree (a) fetches the ref that pins the census head
 * (`git fetch origin census/fallback-census-head-6a240d3de:census/fallback-census-head-6a240d3de`)
 * and builds the plan with the census (`plan --out .tmp/trap/plan.json`), so
 * bucket selections arm what they name and arm ids match the controller's,
 * (b) exports the two preloads and the variables above before the runner,
 * and (c) after the runner, before cleanup removes the worktree, runs
 * `merge --out "$HOME/necessity/$sha/merged-$(hostname).json" .tmp/trap/obs`
 * and copies the plan beside it. With that route, from the controller (one
 * host per lane share, at most two hosts at once):
 *
 *   H=$(git rev-parse HEAD)          # the pushed head; never type a sha
 *   LAGRANGE_LAB_AGENT=claude:SESSION LAGRANGE_NECESSITY_TRAP_MODE=observe \
 *     node scripts/lab.js test all --lane unit --on HOST --sha "$H" > lane-HOST.log
 *   mkdir -p .tmp/necessity/"$H"
 *   rsync --bwlimit=2500 HOST:necessity/"$H"/'*' .tmp/necessity/"$H"/
 *   node scripts/checks/fallback-necessity-trap.js merge \
 *     --out .tmp/necessity/"$H"/merged.json .tmp/necessity/"$H"/merged-*.json
 *   node scripts/checks/fallback-necessity-trap.js report --plan .tmp/necessity/"$H"/plan.json \
 *     --merged .tmp/necessity/"$H"/merged.json --out .tmp/necessity/"$H"/report.json \
 *     --run-id RUN --lane unit --lane-exit-code "$LANE_EXIT" --lane-log lane-HOST.log
 *
 * Only the merged JSON and the plan cross the network (per-process files stay
 * on the host).
 *
 * Physical three-host formation (observe mode; not in this slice, about
 * 90-120 lines with its witness, no Dockerfile change: the preloads' closure
 * is node builtins and a few files under scripts/checks, no packages):
 * 1. test/distributed/harness/cluster-class-lifecycle-base.js, where the
 *    container env is composed (beside memoryLeak.captureHeapArtifacts'
 *    NODE_OPTIONS): when the harness runs with LAGRANGE_NECESSITY_TRAP_PLAN,
 *    append both preloads from /tmp/necessity-trap/ to NODE_OPTIONS and set
 *    PLAN=/tmp/necessity-trap/plan.json, OUT and LAGRANGE_CENSUS_COVERAGE_DIR
 *    =/tmp/necessity-trap/out, MODE=observe, ROOT=/app (about 15 lines);
 * 2. test/distributed/harness/docker-provider.js: a putArchive of the
 *    preloads and their imports, the plan (built at the image's head with the
 *    census) and an out/ directory owned by uid 10001 into each created
 *    container before start, beside the existing getContainerArchive (about
 *    30 lines; no bind mount, so nothing is copied to the remote hosts;
 *    confirm the distroless image's /tmp is writable, else use /data);
 * 3. at teardown, before removal: getContainerArchive of
 *    /tmp/necessity-trap/out per container into the run's evidence
 *    directory, refusing a container with no main-thread observation file
 *    (dockerd starts the node, so no roster entry exists for it), then
 *    `merge` and `report` on the controller (about 30 lines). A node
 *    restarted inside its container writes a new file (one per start).
 *    docker stop's 25 s grace suffices: the node's own SIGTERM listener is
 *    followed and the exit flush writes the counts; first hits are already
 *    on disk.
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
  MERGED_SCHEMA, REPORT_SCHEMA, isPassingVerdict, mergeObservations, readMergeInputs, reportRun,
  selectArms,
} from './fallback-necessity-trap-results.js';
import {PLAN_SCHEMA, TRAP_GLOBAL, applyInsertions} from './fallback-necessity-trap-runtime.js';
import {sha256} from './fallback-necessity-sites.js';
import {spawnGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const stringTrim = Function.call.bind(String.prototype.trim);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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
const SIDE_CODE = Object.freeze({[ARMED_SIDE.PRIMARY]: 'p', [ARMED_SIDE.FALLBACK]: 'f'});
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
const SUBCOMMAND = Object.freeze({PLAN: 'plan', MERGE: 'merge', REPORT: 'report',
  SELECT: 'select'});
const COLUMN = Object.freeze({INSTRUMENTABLE: 'instrumentable', UNINSTRUMENTED: 'uninstrumented'});
const HEADING = Object.freeze({
  BUCKET: 'by bucket:', ROW: 'by row:', DIRECTORY: 'by directory:',
});
const MISSING_ROOT = 'source root absent: ';
const FLAG = Object.freeze({
  OUT: '--out', CENSUS: '--census', NO_CENSUS: '--no-census', RUN_ID: '--run-id',
  LANE: '--lane', LANE_EXIT_CODE: '--lane-exit-code', LANE_LOG: '--lane-log', PLAN: '--plan',
  MERGED: '--merged', SELECT: '--select',
});
const VALUE_FLAGS = Object.freeze([
  FLAG.OUT, FLAG.CENSUS, FLAG.RUN_ID, FLAG.LANE, FLAG.LANE_EXIT_CODE, FLAG.PLAN, FLAG.MERGED,
  FLAG.SELECT,
]);
const REQUIRED_FLAGS = Object.freeze({
  [SUBCOMMAND.PLAN]: [FLAG.OUT],
  [SUBCOMMAND.MERGE]: [FLAG.OUT],
  [SUBCOMMAND.REPORT]: [FLAG.OUT, FLAG.PLAN, FLAG.MERGED],
  [SUBCOMMAND.SELECT]: [FLAG.PLAN, FLAG.SELECT],
});
const RUN_FLAGS_PROBLEM = '--run-id, --lane and --lane-exit-code go together';
const USAGE = 'usage: fallback-necessity-trap.js plan --out FILE [--census FILE | --no-census]\n' +
  '       fallback-necessity-trap.js select --plan PLAN --select SPEC\n' +
  '       fallback-necessity-trap.js merge --out FILE INPUT...\n' +
  '       fallback-necessity-trap.js report --plan PLAN --merged MERGED --out FILE ' +
  '[--run-id ID --lane LANE --lane-exit-code N --lane-log FILE...]';

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

// An arm is named by its side and term: `f1` the first later chain term,
// `f0` a typeof or catch fallback side, `p0` a primary side (N2).
function sideArm(armedSide, term) {
  return `${SIDE_CODE[armedSide]}${term}`;
}

function twoSourceArms(site, node, armedSide, siteId) {
  const terms = fallbackChainTerms(node, null);
  const refusal = armedSide === ARMED_SIDE.PRIMARY ? UNINSTRUMENTED.PRIMARY_TERM :
    chainMatches(site, terms) ? null : UNINSTRUMENTED.SIDE_NOT_FOUND;
  if (refusal) return {reason: refusal};
  const arms = [];
  const edits = [];
  for (let term = 1; term < terms.length; term += 1) {
    const arm = sideArm(armedSide, term);
    arms.push(arm);
    edits.push(...expressionArm(terms[term], trapCall(armId(siteId, arm))));
  }
  return {arms, edits};
}

function typeofArms(site, node, armedSide, siteId) {
  const range = site.sides[armedSide];
  const side = sameRange(node.consequent, range) ? node.consequent :
    sameRange(node.alternate, range) ? node.alternate : undefined;
  if (!side) return {reason: UNINSTRUMENTED.SIDE_NOT_FOUND};
  const arm = sideArm(armedSide, 0);
  const call = trapCall(armId(siteId, arm));
  if (node.type === NODE_TYPE.CONDITIONAL) return {arms: [arm], edits: expressionArm(side, call)};
  const edits = side.type === NODE_TYPE.BLOCK ? blockArm(side, call) : statementArm(side, call);
  return {arms: [arm], edits};
}

function catchArms(site, node, parent, armedSide, siteId) {
  const block = armedSide === ARMED_SIDE.FALLBACK ? node.body : parent.block;
  if (!sameRange(block, site.sides[armedSide])) return {reason: UNINSTRUMENTED.SIDE_NOT_FOUND};
  const named = armedSide === ARMED_SIDE.FALLBACK && node.param?.type === NODE_TYPE.IDENTIFIER;
  const arm = sideArm(armedSide, 0);
  return {arms: [arm], edits: blockArm(block, trapCall(armId(siteId, arm),
    named ? node.param.name : ''))};
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

function parseArguments(argv) {
  const flags = {[FLAG.LANE_LOG]: []};
  const inputs = [];
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === FLAG.LANE_LOG) {
      flags[FLAG.LANE_LOG].push(argv[index + 1]);
      index += 1;
    } else if (arrayIncludes(VALUE_FLAGS, argv[index])) {
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
    throw new Error(RUN_FLAGS_PROBLEM);
  }
  return {id: values[0], lane: values[1], laneExitCode: Number(values[2])};
}

function readPlanFile(file) {
  const bytes = fs.readFileSync(file);
  return {plan: jsonParse(bytes.toString(TEXT_ENCODING)), planDigest: sha256(bytes)};
}

function runSelect(flags, write) {
  const {plan} = readPlanFile(flags[FLAG.PLAN]);
  const armed = selectArms(plan, flags[FLAG.SELECT]);
  for (const id of armed) write(id);
  write(`select: ${flags[FLAG.SELECT]} arms ${armed.length} planned arms`);
  return armed.length > 0 ? 0 : FAILED;
}

function runMerge(flags, inputs, write) {
  const merged = mergeObservations(readMergeInputs(inputs));
  writeJson(flags[FLAG.OUT], merged);
  const {summary, roster} = merged;
  write(`merge: ${summary.processes} processes (${roster.expected} rostered), ` +
    `${summary.armsHit} arms hit at ${summary.sitesHit} sites (${summary.thrownArms} thrown), ` +
    `armed ${merged.armed} -> ${flags[FLAG.OUT]}`);
  for (const gap of roster.unobserved) {
    write(`merge: INCOMPLETE unobserved ${gap.host}:${gap.pid}:${gap.threadId} ${gap.entry}`);
  }
  for (const key of roster.unrostered) write(`merge: INCOMPLETE unrostered ${key}`);
  for (const item of merged.refused) {
    write(`merge: INCOMPLETE refused ${item.file} ${item.reason} in ${item.processes} processes`);
  }
  return merged.complete ? 0 : FAILED;
}

function runReport(flags, write) {
  const {plan, planDigest} = readPlanFile(flags[FLAG.PLAN]);
  const merged = jsonParse(fs.readFileSync(flags[FLAG.MERGED], TEXT_ENCODING));
  const laneLogs = arrayMap(flags[FLAG.LANE_LOG], (file) => fs.readFileSync(file, TEXT_ENCODING));
  const report = reportRun({plan, planDigest, merged, run: runBinding(flags), laneLogs});
  writeJson(flags[FLAG.OUT], report);
  const {counts} = report;
  write(`report: ${report.verdict} (${report.mode}); planned ${counts.planned}: hit ${counts.hit}, ` +
    `not reached ${counts.notReached}, NOT-LOADED ${counts.notLoaded}; armed ${counts.armed}: ` +
    `surfaced ${counts.surfaced}, SWALLOWED ${counts.swallowed} -> ${flags[FLAG.OUT]}`);
  for (const id of report.swallowed) write(`report: SWALLOWED ${id}`);
  return isPassingVerdict(report.verdict) ? 0 : FAILED;
}

const RUNNERS = Object.freeze({
  [SUBCOMMAND.PLAN]: (flags, _inputs, write) => runPlan(flags, write),
  [SUBCOMMAND.SELECT]: (flags, _inputs, write) => runSelect(flags, write),
  [SUBCOMMAND.MERGE]: runMerge,
  [SUBCOMMAND.REPORT]: (flags, _inputs, write) => runReport(flags, write),
});

function main(argv) {
  const write = (line) => process.stdout.write(`${line}${NEWLINE}`);
  const {subcommand, flags, inputs} = parseArguments(argv);
  const known = objectHasOwn(RUNNERS, subcommand);
  if (!known || !arrayEvery(REQUIRED_FLAGS[subcommand], (flag) => Boolean(flags[flag]))) {
    process.stderr.write(`${USAGE}${NEWLINE}`);
    return REFUSED;
  }
  return RUNNERS[subcommand](flags, inputs, write);
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
  REPORT_SCHEMA,
  UNINSTRUMENTED,
  buildTrapPlan,
  formatPlanSummary,
  gateParsableArms,
  mergeObservations,
  orderedInsertions,
  planCounts,
  readMergeInputs,
  reportRun,
  selectArms,
};
