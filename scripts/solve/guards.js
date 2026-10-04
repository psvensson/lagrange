// v2 landing guards. Every guard answers a list of problems; an empty list
// passes. The change proof itself (`npm test`) and the coupled-pair
// registry are not reimplemented here: the guards only call them.

import crypto from 'node:crypto';
import {sealBindsGraph} from '../checks/helper-import-closure.js';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {
  contractsForChangedPath, evaluateCoupledPairGuards,
  loadImpactContractRegistry,
} from '../checks/impact-contract-registry.js';
import {
  IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH, PROOF_CONE_CONTRACTS_PATH,
} from '../checks/impact-proof-cone-constants.js';
import {isApproval, questState} from './store.js';
import {waitForLoadHeadroomSync} from '../checks/wait-for-load-headroom.js';
import {
  importGraphResolverStateDigest, javascriptSourceDigest,
  listImportGraphInputFiles, listJavaScriptFiles,
} from '../global-owner-debt-inventory/helpers.js';
import {EPICS_DIR, QUESTS_DIR} from './schema.js';

const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const GIT = 'git';
const SPAWN_MAX_BUFFER = 64 * 1024 * 1024;
const SOURCE_PREFIX = 'src/';
const SOLVE_PREFIX = 'solve/';
const LINTED_PATH_PATTERN = /^(?:src|test|scripts)\/.+\.(?:js|mjs|cjs)$/u;
const OUTPUT_LINE_LIMIT = 20;
const ESLINT_BIN = 'node_modules/eslint/bin/eslint.js';
const ESLINT_ARGUMENTS = Object.freeze(
  ['--no-warn-ignored', '--no-error-on-unmatched-pattern']);
const CHECKERS = Object.freeze([
  {label: 'eslint', script: ESLINT_BIN, args: ESLINT_ARGUMENTS},
  {label: 'literal-guideline audit', script: 'scripts/check-guideline-literals.js', args: []},
  {label: 'decision-boundaries audit',
    script: 'scripts/check-guideline-decision-boundaries.js', args: []},
  {label: 'ambient-intrinsics audit',
    script: 'scripts/check-guideline-ambient-intrinsics.js', args: []},
  {label: 'silent-catch audit', script: 'scripts/check-guideline-silent-catch.js', args: []},
]);
const TRIGGERED_PAIR_PREFIX = 'coupled pair ';
const PROBLEM_JOIN_SEPARATOR = '; ';
const INCOMPLETE_EDGE = ' has an incomplete contract edge: ';
const GLOB_STAR = '*';
const GLOB_DOUBLE_STAR = '**';
const GLOB_SEGMENT = '[^/]*';
const GLOB_ANY = '.*';
const GLOB_ESCAPE_PATTERN = /[.+?^${}()|[\]\\]/gu;
const GLOB_ESCAPE_REPLACEMENT = '\\$&';
const REGEXP_UNICODE = 'u';
const LIST_SEPARATOR = ', ';
const ARGUMENT_SEPARATOR = ' ';
const GIT_ARGUMENTS = Object.freeze({
  HEAD: Object.freeze(['rev-parse', '--verify', 'HEAD^{commit}']),
  DIFF_NAMES: Object.freeze(['diff', '--name-only', 'HEAD']),
  STAGED_NAMES: Object.freeze(['diff', '--cached', '--name-only', 'HEAD']),
  UNTRACKED: Object.freeze(['ls-files', '--others', '--exclude-standard']),
  INDEXED: Object.freeze(['ls-files', '--']),
});
const REGISTRY_UNAVAILABLE = 'coupled-pair registry could not be loaded';
const OUTSIDE_SCOPE_PREFIX = 'paths outside epic ';
const OUTSIDE_SCOPE_INFIX = ' authorizes: ';

// --- git ----------------------------------------------------------------------

function git(root, args, options = {}) {
  const result = spawnSync(GIT, args, {cwd: root, encoding: TEXT_ENCODING,
    maxBuffer: SPAWN_MAX_BUFFER, ...options});
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`git ${args.join(ARGUMENT_SEPARATOR)} failed: ${result.stderr || result.stdout}`);
  }
  return String(result.stdout || '');
}

function headSha(root) {
  return git(root, [...GIT_ARGUMENTS.HEAD]).trim();
}

function lines(output) {
  return output.split(LINE_SEPARATOR).map((line) => line.trim()).filter(Boolean);
}

/**
 * Every path that differs from HEAD (staged, unstaged, untracked and not
 * ignored), sorted and unique.
 * @param {string} root
 * @return {string[]}
 */
function changedPaths(root) {
  const tracked = lines(git(root, [...GIT_ARGUMENTS.DIFF_NAMES]));
  const staged = lines(git(root, [...GIT_ARGUMENTS.STAGED_NAMES]));
  const untracked = lines(git(root, [...GIT_ARGUMENTS.UNTRACKED]));
  return [...new Set([...tracked, ...staged, ...untracked])].sort();
}

/**
 * The subset of a change set that `git add` can still stage. A path that is
 * gone from both the working tree and the index is already recorded as a
 * deletion, and `git add` refuses such a pathspec outright ("did not match
 * any files"), which would fail the whole staging call.
 * @param {string} root
 * @param {string[]} paths
 * @return {string[]}
 */
function stageablePaths(root, paths) {
  if (paths.length === 0) return [];
  const indexed = new Set(lines(git(root, [...GIT_ARGUMENTS.INDEXED, ...paths])));
  return paths.filter((filePath) => indexed.has(filePath) ||
    fs.existsSync(path.join(root, filePath)));
}

function isSourcePath(filePath) {
  return filePath.startsWith(SOURCE_PREFIX);
}

function requiresVerification(paths) {
  return paths.some(isSourcePath);
}

// --- static quality ------------------------------------------------------------

function boundedOutput(result) {
  const all = `${result.stdout || ''}${LINE_SEPARATOR}${result.stderr || ''}`
    .split(LINE_SEPARATOR).map((line) => line.trimEnd()).filter(Boolean);
  const shown = all.slice(0, OUTPUT_LINE_LIMIT);
  if (all.length > shown.length) shown.push(`... (${all.length - shown.length} more lines)`);
  return shown.join(LINE_SEPARATOR);
}

function runChecker(root, checker, jsPaths) {
  const script = path.join(root, checker.script);
  if (!fs.existsSync(script)) return [];
  const result = spawnSync(process.execPath, [script, ...checker.args, ...jsPaths],
    {cwd: root, encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER});
  if (result.error) {
    return [`static-quality ${checker.label} could not run: ${result.error.message}`];
  }
  if (result.status !== 0) {
    return [`static-quality ${checker.label} failed over the changed paths:` +
      `${LINE_SEPARATOR}${boundedOutput(result)}`];
  }
  return [];
}

/**
 * The existing checkers over the changed, still-present JavaScript paths.
 * @param {string} root
 * @param {string[]} paths
 * @return {string[]}
 */
function staticQualityProblems(root, paths) {
  const jsPaths = [...new Set(paths)]
    .filter((filePath) => LINTED_PATH_PATTERN.test(filePath) &&
      fs.existsSync(path.join(root, filePath)))
    .sort();
  if (jsPaths.length === 0) return [];
  return CHECKERS.flatMap((checker) => runChecker(root, checker, jsPaths));
}

// --- verification record ---------------------------------------------------------
// A src/ approval is an approval only when it names the verification
// templates it applied and carries what each demands, at minimum the
// red-on-revert. v1 enforced a verdict file (solver-verifier-verdict/1:
// scripts/solve/verifier-verdict.js and review-request.js at 5271defb5^);
// the v2 cutover recorded verifications as free text and nothing read a
// template again. The admissible ids are the templates' own front-matter
// `categories`; a template may declare `evidence: [<field>]` (what its entry
// must carry) and `trigger: <pattern>` (added src/ lines that make it
// required). The check is a pure function of the quest log, the change set
// and a tree reader, so the same predicate judges a working tree (land) and
// a commit (the main admission): every file it names - witness, evidence,
// census - is a path in that tree (a quest log line included), never a
// scratch path outside it. It checks references, not that a revert was
// really run: the independent verifier stays the control for that.

const TEMPLATE_DIR = 'docs/development/verification-templates';
const TEMPLATE_SUFFIX = '.md';
const FRONT_FENCE = '---';
const FRONT_LIST = /^(categories|evidence):\s*\[([^\]]*)\]\s*$/u;
const FRONT_TRIGGER = /^trigger:\s*(.+)$/u;
const TRIGGER_FLAGS = 'iu';
const FRONT_LIST_SEPARATOR = ',';
const REVERT_FIELDS = Object.freeze(['reverted', 'what', 'witness', 'assertion', 'evidence']);
const EVIDENCE_LINE = /^(.+):(\d+)$/u;
const PARENT_SEGMENT = '..';
const PATH_SEGMENT_SEPARATOR = '/';
const ADDED_LINE = '+';
const ADDED_FILE_HEADER = '+++';
const PATHSPEC_END = '--';
const SOURCE_DIFF = Object.freeze(['diff', '--no-color', '--unified=0', 'HEAD', PATHSPEC_END]);
const RECORD = Object.freeze({
  PREFIX: 'the approving verification ',
  NO_TEMPLATE: 'names no verification template (note --verification ... --evidence ' +
    '<record.json> with {"templates": [{"id", "redOnRevert"}]}); admissible: ',
  UNKNOWN: 'names unknown verification template ',
  ADMISSIBLE: '; admissible: ',
  NO_REVERT: 'carries no red-on-revert {reverted, what, witness, assertion, evidence} ' +
    'for template ',
  LACKS: ' lacks ',
  DEMANDED: ' (its template demands it)',
  REVERT_OF: 'red-on-revert of ',
  NOT_SOURCE: ': reverted path is not in the quest\'s src/ change set: ',
  NO_WITNESS: ': witness is not a file in the tree: ',
  UNBOUND_WITNESS: ': witness is neither in the quest\'s change set nor in its receipts: ',
  TRIGGERED_PREFIX: 'does not name template ',
  TRIGGERED_SUFFIX: ', whose trigger the change\'s added src/ lines match',
  NO_SAMPLE: 'carries neither a sample of the author\'s census and history pass ' +
    '(sampled: {census: [rows], history: [rows], found}) nor a locality proof ' +
    '(local: {proof, census: <tree path>})',
  LOCAL_CENSUS: 'locality census: ',
  NO_EVIDENCE: 'names no evidence',
  MISSING_EVIDENCE: 'evidence is not a file in the tree (cite a tree path or a quest ' +
    'log line, path:line): ',
  NO_LINE: 'evidence has no such line: ',
  UNNAMED: 'evidence does not name the assertion ',
  NOT_JSON: 'is not a JSON object: ',
  NO_FILE: 'verification record not found: ',
  FILE_PREFIX: 'verification record ',
});

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecordObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyList(value) {
  return Array.isArray(value) && value.length > 0;
}

// A repository-relative path that stays inside the tree, or null.
function treePath(value) {
  if (!nonEmptyText(value) || path.isAbsolute(value)) return null;
  const normalized = path.posix.normalize(value);
  return normalized.split(PATH_SEGMENT_SEPARATOR).includes(PARENT_SEGMENT) ? null : normalized;
}

/**
 * The tree reader `land` judges with: the working tree under `root`. The main
 * admission supplies the same interface over a commit.
 * @param {string} root
 * @return {{read: function(string): ?string, list: function(string): string[]}}
 */
function workingTreeReader(root) {
  return {
    read: (relative) => {
      const file = treePath(relative) && path.join(root, treePath(relative));
      return file && fs.existsSync(file) && fs.statSync(file).isFile() ?
        fs.readFileSync(file, TEXT_ENCODING) : null;
    },
    list: (relative) => {
      const directory = path.join(root, relative);
      return fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
    },
  };
}

/**
 * The change set `land` judges: its paths and the lines it adds under src/
 * (tracked changes against HEAD, plus whole untracked files).
 * @param {string} root
 * @param {string[]} paths
 * @return {{paths: string[], addedSourceLines: string[]}}
 */
function workingChangeSet(root, paths) {
  const sourcePaths = paths.filter(isSourcePath);
  if (sourcePaths.length === 0) return {paths, addedSourceLines: []};
  const added = lines(git(root, [...SOURCE_DIFF, ...sourcePaths]))
    .filter((line) => line.startsWith(ADDED_LINE) && !line.startsWith(ADDED_FILE_HEADER));
  const untracked = lines(git(root, [...GIT_ARGUMENTS.UNTRACKED, PATHSPEC_END, ...sourcePaths]))
    .flatMap((file) => fs.readFileSync(path.join(root, file), TEXT_ENCODING)
      .split(LINE_SEPARATOR));
  return {paths, addedSourceLines: [...added, ...untracked]};
}

function frontMatterLines(content) {
  const all = content.split(LINE_SEPARATOR);
  if (all[0]?.trim() !== FRONT_FENCE) return [];
  const end = all.findIndex((line, index) => index > 0 && line.trim() === FRONT_FENCE);
  return end === -1 ? [] : all.slice(1, end);
}

function templateDeclaration(content) {
  const declared = {categories: [], evidence: [], trigger: null};
  for (const line of frontMatterLines(content)) {
    const list = FRONT_LIST.exec(line);
    if (list) {
      declared[list[1]] = list[2].split(FRONT_LIST_SEPARATOR)
        .map((value) => value.trim()).filter(Boolean);
    }
    const trigger = FRONT_TRIGGER.exec(line);
    if (trigger) declared.trigger = new RegExp(trigger[1].trim(), TRIGGER_FLAGS);
  }
  return declared;
}

// The admissible verification templates, read from the template files in the
// tree: each front-matter category is an id. There is no second list.
function verificationTemplates(tree) {
  const catalog = new Map();
  for (const name of tree.list(TEMPLATE_DIR).filter((file) => file.endsWith(TEMPLATE_SUFFIX))) {
    const content = tree.read(`${TEMPLATE_DIR}/${name}`);
    if (content === null) continue;
    const declared = templateDeclaration(content);
    for (const id of declared.categories) {
      catalog.set(id, {evidence: declared.evidence, trigger: declared.trigger});
    }
  }
  return catalog;
}

function admissibleList(catalog) {
  return [...catalog.keys()].join(LIST_SEPARATOR);
}

// A tree path, or path:line, whose content - the cited line when one is
// cited - names the assertion when one is given: exit status alone is not a
// red-on-revert (harness-fidelity item 1).
function evidenceProblem(tree, reference, assertion) {
  if (!nonEmptyText(reference)) return RECORD.NO_EVIDENCE;
  const cited = EVIDENCE_LINE.exec(reference);
  const content = tree.read(cited ? cited[1] : reference);
  if (content === null) return `${RECORD.MISSING_EVIDENCE}${reference}`;
  const scope = cited ? content.split(LINE_SEPARATOR)[Number(cited[2]) - 1] : content;
  if (scope === undefined) return `${RECORD.NO_LINE}${reference}`;
  return assertion && !scope.includes(assertion) ?
    `${RECORD.UNNAMED}"${assertion}": ${reference}` : null;
}

function revertProblems(context, id, revert) {
  if (!isRecordObject(revert)) return [`${RECORD.NO_REVERT}${id}`];
  const label = `${RECORD.REVERT_OF}${id}`;
  const missing = REVERT_FIELDS.filter((field) => !nonEmptyText(revert[field]));
  if (missing.length > 0) return [`${label}${RECORD.LACKS}${missing.join(LIST_SEPARATOR)}`];
  const problems = [];
  if (!context.sourcePaths.includes(revert.reverted)) {
    problems.push(`${label}${RECORD.NOT_SOURCE}${revert.reverted}`);
  }
  if (context.tree.read(revert.witness) === null) {
    problems.push(`${label}${RECORD.NO_WITNESS}${revert.witness}`);
  } else if (!context.changed.has(revert.witness) && !context.receipts.has(revert.witness)) {
    problems.push(`${label}${RECORD.UNBOUND_WITNESS}${revert.witness}`);
  }
  const evidence = evidenceProblem(context.tree, revert.evidence, revert.assertion);
  if (evidence) problems.push(`${label}: ${evidence}`);
  return problems;
}

function templateEntryProblems(context, entry) {
  const id = isRecordObject(entry) ? entry.id : entry;
  const template = context.catalog.get(id);
  if (!template) {
    return [`${RECORD.UNKNOWN}${id}${RECORD.ADMISSIBLE}${admissibleList(context.catalog)}`];
  }
  return [...template.evidence.filter((field) => !nonEmptyText(entry[field]))
    .map((field) => `template ${id}${RECORD.LACKS}${field}${RECORD.DEMANDED}`),
  ...revertProblems(context, id, entry.redOnRevert)];
}

function triggeredProblems(context, named, addedSourceLines) {
  const added = addedSourceLines.join(LINE_SEPARATOR);
  return [...context.catalog]
    .filter(([id, template]) => template.trigger && !named.has(id) &&
      template.trigger.test(added))
    .map(([id]) => `${RECORD.TRIGGERED_PREFIX}${id}${RECORD.TRIGGERED_SUFFIX}`);
}

function sampleProblems(tree, record) {
  const sampled = record.sampled;
  if (isRecordObject(sampled) && nonEmptyList(sampled.census) &&
    nonEmptyList(sampled.history) && nonEmptyText(sampled.found)) return [];
  const local = record.local;
  if (!isRecordObject(local) || !nonEmptyText(local.proof)) return [RECORD.NO_SAMPLE];
  const census = evidenceProblem(tree, local.census, null);
  return census ? [`${RECORD.LOCAL_CENSUS}${census}`] : [];
}

// The witness files the quest's sealed receipts name (seal doneWhen args.file).
function receiptWitnesses(state, tree) {
  const content = tree.read(state.seal?.seal?.doneWhen?.args?.file);
  const parsed = content === null ? null : JSON.parse(content);
  const receipts = Array.isArray(parsed?.receipts) ? parsed.receipts : [];
  return new Set(receipts.map((receipt) => receipt?.testFile).filter(nonEmptyText));
}

/**
 * What the current approval of a src/ change lacks in its record: the named
 * templates (each admissible, each with its demanded fields and a
 * red-on-revert bound to this change and tree), every triggered template, and
 * the census sample or locality proof. Empty when the change touches no src/
 * path or the current verdict is not an approval (verificationProblems owns
 * those). Pure over its inputs: land passes the working tree, the main
 * admission a commit.
 * @param {Array<Object>} logEntries the quest's log
 * @param {{paths: string[], addedSourceLines: string[]}} changeSet
 * @param {{read: Function, list: Function}} tree
 * @return {string[]}
 */
function verificationRecordProblems(logEntries, changeSet, tree) {
  const state = questState(logEntries);
  const last = state.lastVerification;
  if (!requiresVerification(changeSet.paths) || !state.verificationIsCurrent ||
    !isApproval(last)) return [];
  const catalog = verificationTemplates(tree);
  const record = isRecordObject(last.record) ? last.record : {};
  if (!nonEmptyList(record.templates)) {
    return [`${RECORD.PREFIX}${RECORD.NO_TEMPLATE}${admissibleList(catalog)}`];
  }
  const context = {tree, catalog, sourcePaths: changeSet.paths.filter(isSourcePath),
    changed: new Set(changeSet.paths), receipts: receiptWitnesses(state, tree)};
  const named = new Set(record.templates.map((entry) => entry?.id));
  return [...record.templates.flatMap((entry) => templateEntryProblems(context, entry)),
    ...triggeredProblems(context, named, changeSet.addedSourceLines),
    ...sampleProblems(tree, record)]
    .map((problem) => `${RECORD.PREFIX}${problem}`);
}

/**
 * Read the record `note --verification ... --evidence <file>` embeds in the
 * entry: a JSON object whose named templates are all admissible now (an
 * unknown id is refused here, before anyone lands on it; land checks the rest
 * against the change it lands). The record file itself may live anywhere.
 * @param {string} root
 * @param {string} file
 * @return {{record: ?Object, problems: string[]}}
 */
function readVerificationRecord(root, file) {
  const absolute = path.resolve(root, String(file));
  if (!fs.existsSync(absolute)) return {record: null, problems: [`${RECORD.NO_FILE}${file}`]};
  let record;
  try {
    record = JSON.parse(fs.readFileSync(absolute, TEXT_ENCODING));
  } catch (error) {
    return {record: null,
      problems: [`${RECORD.FILE_PREFIX}${file} ${RECORD.NOT_JSON}${error.message}`]};
  }
  if (!isRecordObject(record)) {
    return {record: null,
      problems: [`${RECORD.FILE_PREFIX}${file} ${RECORD.NOT_JSON}${typeof record}`]};
  }
  const catalog = verificationTemplates(workingTreeReader(root));
  const unknown = (Array.isArray(record.templates) ? record.templates : [])
    .map((entry) => (isRecordObject(entry) ? entry.id : entry))
    .filter((id) => !catalog.has(id));
  return {record, problems: unknown.map((id) =>
    `${RECORD.UNKNOWN}${id}${RECORD.ADMISSIBLE}${admissibleList(catalog)}`)};
}

// --- coupled pairs (ported from the v1 terminal audit) -----------------------

/**
 * Problems from the coupledPairs registry for a change set: a triggered pair
 * whose contract edge is incomplete, and a pair whose contract two changed
 * paths own while the pair itself is not triggered.
 * @param {string} root
 * @param {string[]} paths
 * @return {string[]}
 */
function untriggeredPairProblems(loaded, paths, triggeredPrefixes) {
  const problems = [];
  for (const pair of loaded.registry.coupledPairs) {
    if (pair.problems.length === 0 || triggeredPrefixes.some((prefix) =>
      prefix.startsWith(`${TRIGGERED_PAIR_PREFIX}${pair.id} `))) continue;
    const contracted = paths.filter((changedPath) =>
      contractsForChangedPath(loaded.registry, changedPath).includes(pair.contract));
    if (contracted.length < 2) continue;
    problems.push(`${TRIGGERED_PAIR_PREFIX}${pair.id}${INCOMPLETE_EDGE}` +
      pair.problems.join(PROBLEM_JOIN_SEPARATOR));
  }
  return problems;
}

function coupledPairProblems(root, paths) {
  const registryChanged = paths.includes(PROOF_CONE_CONTRACTS_PATH);
  if (paths.length < 2 && !registryChanged) return [];
  if (!fs.existsSync(path.join(root, PROOF_CONE_CONTRACTS_PATH))) return [];
  const loaded = loadImpactContractRegistry(root);
  if (!loaded.registry) {
    return [(loaded.problems?.length > 0 ? loaded.problems :
      [REGISTRY_UNAVAILABLE]).join(PROBLEM_JOIN_SEPARATOR)];
  }
  if (registryChanged && loaded.problems.length > 0) {
    return [loaded.problems.join(PROBLEM_JOIN_SEPARATOR)];
  }
  const evaluated = evaluateCoupledPairGuards(loaded.registry, paths);
  const triggeredPrefixes = evaluated.triggeredPairs.map((pair) =>
    `${TRIGGERED_PAIR_PREFIX}${pair.id} is triggered `);
  const problems = evaluated.problems.filter((message) =>
    triggeredPrefixes.some((prefix) => message.startsWith(prefix)));
  return [...new Set([...problems, ...untriggeredPairProblems(loaded, paths, triggeredPrefixes)])];
}

// --- epic scope -------------------------------------------------------------------

function globToPattern(glob) {
  const escaped = glob.split(GLOB_DOUBLE_STAR).map((part) =>
    part.split(GLOB_STAR).map((piece) =>
      piece.replace(GLOB_ESCAPE_PATTERN, GLOB_ESCAPE_REPLACEMENT)).join(GLOB_SEGMENT))
    .join(GLOB_ANY);
  return new RegExp(`^${escaped}(?:/.*)?$`, REGEXP_UNICODE);
}

/**
 * Paths the quest may not touch: outside the epic's `authorizes` globs and
 * outside the quest's own directory and the epic's files. A fix (no epic)
 * is scoped by its statement alone, and a `legacy: true` epic carries no
 * measured scope; both pass here.
 * @param {{id: string, epic?: string}} quest
 * @param {Object|null} epic
 * @param {string[]} paths
 * @return {string[]}
 */
function epicScopeProblems(quest, epic, paths) {
  if (!epic || epic.front.legacy === true) return [];
  const allowed = [
    `${QUESTS_DIR}/${quest.id}/**`,
    `${EPICS_DIR}/${epic.id}.md`,
    `${EPICS_DIR}/${epic.id}/**`,
    ...(Array.isArray(epic.front.authorizes) ? epic.front.authorizes : []),
  ].map(globToPattern);
  const outside = paths.filter((filePath) =>
    !allowed.some((pattern) => pattern.test(filePath)));
  return outside.length === 0 ? [] :
    [`${OUTSIDE_SCOPE_PREFIX}${epic.id}${OUTSIDE_SCOPE_INFIX}${outside.join(LIST_SEPARATOR)}`];
}

// --- canonical import graph (ported from the v1 landing preflight) ------------

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const IMPORT_GRAPH_PRODUCER_PATH = 'scripts/generate-global-owner-debt-inventory.js';
const IMPORT_GRAPH_VERIFY_ARGUMENT = '--verify-import-graph';
const IMPORT_GRAPH_PROBLEM_PREFIX = 'land: canonical import-graph verification failed: ';
const IMPORT_GRAPH_VERIFY_TIMEOUT_ENV = 'LAGRANGE_IMPORT_GRAPH_VERIFY_TIMEOUT_MS';
const IMPORT_GRAPH_VERIFY_DEFAULT_TIMEOUT_MS = 30_000;
const IMPORT_GRAPH_VERIFY_KILL_SIGNAL = 'SIGKILL';
const IMPORT_GRAPH_TIMEOUT_ERROR_CODE = 'ETIMEDOUT';
const IMPORT_GRAPH_TIMEOUT_NOTE = 'import-graph verification timed out twice ' +
  '(first and retry) at ';
const IMPORT_GRAPH_TIMEOUT_SUFFIX = ' ms; the producer is not making progress ' +
  `on this machine - rerun when load drops or raise ${IMPORT_GRAPH_VERIFY_TIMEOUT_ENV}`;
const CANONICAL_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const IMPORT_GRAPH_REQUIRED_INPUTS = Object.freeze([
  IMPORT_GRAPH_PRODUCER_PATH, IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH,
]);

function importGraphVerifyTimeout(env = process.env) {
  const configured = Number.parseInt(env[IMPORT_GRAPH_VERIFY_TIMEOUT_ENV], 10);
  return Number.isInteger(configured) && configured > 0 ?
    configured : IMPORT_GRAPH_VERIFY_DEFAULT_TIMEOUT_MS;
}

function sha256(value) {
  return crypto.createHash(HASH_ALGORITHM).update(value).digest(HASH_ENCODING);
}

function requiredImportGraphProblem(root) {
  for (const relativePath of IMPORT_GRAPH_REQUIRED_INPUTS) {
    const requiredPath = path.join(root, relativePath);
    try {
      if (!fs.lstatSync(requiredPath).isFile()) {
        return `${IMPORT_GRAPH_PROBLEM_PREFIX}${relativePath} is not a regular file`;
      }
    } catch (_error) {
      return `${IMPORT_GRAPH_PROBLEM_PREFIX}${relativePath} is missing`;
    }
  }
  return null;
}

function canonicalReceiptProblem(root, stdout) {
  try {
    const receipt = JSON.parse(stdout);
    const graphBytes = fs.readFileSync(path.join(root, IMPORT_GRAPH_PATH));
    const sealBytes = fs.readFileSync(path.join(root, IMPORT_GRAPH_SEAL_PATH));
    const graph = JSON.parse(graphBytes);
    const seal = JSON.parse(sealBytes);
    const digests = [receipt.snapshotDigest, receipt.graphByteDigest, receipt.sealByteDigest];
    const invalidBytes = digests.some((digest) =>
      typeof digest !== 'string' || !CANONICAL_DIGEST_PATTERN.test(digest)) ||
      receipt.graphByteDigest !== sha256(graphBytes) ||
      receipt.sealByteDigest !== sha256(sealBytes) ||
      graph.snapshotDigest !== receipt.snapshotDigest ||
      seal.snapshotDigest !== receipt.snapshotDigest ||
      // Whether the seal binds the graph is not this module's opinion.
      !sealBindsGraph(seal, graph);
    if (invalidBytes) {
      return `${IMPORT_GRAPH_PROBLEM_PREFIX}verified bytes changed before use`;
    }
    const stale = graph.sourceDigest !== javascriptSourceDigest(root, listJavaScriptFiles(root)) ||
      graph.producerInputDigest !== javascriptSourceDigest(root, listImportGraphInputFiles(root)) ||
      graph.resolverStateDigest !== importGraphResolverStateDigest(root, graph.resolverInputs);
    return stale ?
      `${IMPORT_GRAPH_PROBLEM_PREFIX}live producer inputs changed before use` : null;
  } catch (error) {
    return `${IMPORT_GRAPH_PROBLEM_PREFIX}verified inputs became unreadable: ${error.message}`;
  }
}

function timedOut(result) {
  return result?.error?.code === IMPORT_GRAPH_TIMEOUT_ERROR_CODE;
}

/**
 * The tracked import graph and seal must be canonical for the exact tree
 * before the change proof runs. `spawn` and `loadGate` are injectable for
 * tests; a single timeout under load is retried once.
 * @param {string} root
 * @param {number} [timeout]
 * @param {Function} [spawn]
 * @param {Function} [loadGate]
 * @return {string|null}
 */
function canonicalImportGraphProblem(root, timeout = importGraphVerifyTimeout(),
  spawn = spawnSync, loadGate = waitForLoadHeadroomSync) {
  const required = requiredImportGraphProblem(root);
  if (required) return required;
  loadGate();
  const producer = path.join(root, IMPORT_GRAPH_PRODUCER_PATH);
  const spawnArguments = [producer, IMPORT_GRAPH_VERIFY_ARGUMENT];
  const spawnOptions = {cwd: root, encoding: TEXT_ENCODING,
    maxBuffer: SPAWN_MAX_BUFFER, timeout, killSignal: IMPORT_GRAPH_VERIFY_KILL_SIGNAL};
  let result = spawn(process.execPath, spawnArguments, spawnOptions);
  if (timedOut(result)) {
    result = spawn(process.execPath, spawnArguments, spawnOptions);
    if (timedOut(result)) {
      return `${IMPORT_GRAPH_PROBLEM_PREFIX}${IMPORT_GRAPH_TIMEOUT_NOTE}${timeout}` +
        IMPORT_GRAPH_TIMEOUT_SUFFIX;
    }
  }
  if (result.status !== 0) {
    return `${IMPORT_GRAPH_PROBLEM_PREFIX}${result.stderr || result.error?.message}`;
  }
  return canonicalReceiptProblem(root, result.stdout);
}

export {
  SOLVE_PREFIX, canonicalImportGraphProblem, changedPaths, coupledPairProblems,
  epicScopeProblems, git, headSha, isSourcePath, readVerificationRecord,
  requiresVerification, stageablePaths, staticQualityProblems,
  verificationRecordProblems, workingChangeSet, workingTreeReader,
};
