// v2 landing guards. Every guard answers a list of problems; an empty list
// passes. The change proof itself (`npm test`) and the coupled-pair
// registry are not reimplemented here: the guards only call them.

import crypto from 'node:crypto';
import {sealBindsGraph} from '../checks/helper-import-closure.js';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  contractsForChangedPath, evaluateCoupledPairGuards,
  loadImpactContractRegistry,
} from '../checks/impact-contract-registry.js';
import {
  IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH, PROOF_CONE_CONTRACTS_PATH,
} from '../checks/impact-proof-cone-constants.js';
import {
  isApproval, isQuestLogPath, parseFrontMatter, questState, verdictOf,
} from './store.js';
import {waitForLoadHeadroomSync} from '../checks/wait-for-load-headroom.js';
import {
  importGraphResolverStateDigest, javascriptSourceDigest,
  listImportGraphInputFiles, listJavaScriptFiles,
} from '../global-owner-debt-inventory/helpers.js';
import {OUTCOME, PROOF, RESOLUTION, resolveProof} from '../proof-authority.js';
import {changedPathsBetween} from '../checks/quest-record-transitions.js';
import {
  ENTRY_TYPE, EPICS_DIR, FINDING_KIND, LOG_FILE, QUESTS_DIR, QUEST_FILE, QUEST_STATUS, VERDICT,
} from './schema.js';

const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const NUL = '\0';
const GIT = 'git';
const SPAWN_MAX_BUFFER = 64 * 1024 * 1024;
// THE production surface (owner 2026-10-04: "Production semantics, not src/,
// define the boundary"): a change under any of these reaches main only as a
// solver landing, needs a current approving verification to land, and is what
// a landing's `source` binding covers. The one definition every landing rule
// reads.
const PRODUCTION_SURFACE = Object.freeze(['src', 'vendor']);
const SURFACE_LABEL = 'production-surface (src/, vendor/)';
const PATH_SEGMENT = '/';
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
  DIFF_NAMES: Object.freeze(['diff', '--name-only', '-z', 'HEAD']),
  STAGED_NAMES: Object.freeze(['diff', '--cached', '--name-only', '-z', 'HEAD']),
  UNTRACKED: Object.freeze(['ls-files', '-z', '--others', '--exclude-standard']),
  INDEXED: Object.freeze(['ls-files', '-z', '--']),
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

// Paths as git names them with -z: verbatim, never quoted (core.quotepath).
function nulPaths(output) {
  return output.split(NUL).filter(Boolean);
}

/**
 * Every path that differs from HEAD (staged, unstaged, untracked and not
 * ignored), sorted and unique.
 * @param {string} root
 * @return {string[]}
 */
function changedPaths(root) {
  const tracked = nulPaths(git(root, [...GIT_ARGUMENTS.DIFF_NAMES]));
  const staged = nulPaths(git(root, [...GIT_ARGUMENTS.STAGED_NAMES]));
  const untracked = nulPaths(git(root, [...GIT_ARGUMENTS.UNTRACKED]));
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
  const indexed = new Set(nulPaths(git(root, [...GIT_ARGUMENTS.INDEXED, ...paths])));
  return paths.filter((filePath) => indexed.has(filePath) ||
    fs.existsSync(path.join(root, filePath)));
}

// The surface directory itself counts: replacing `src` with a symlink
// changes every path under it.
function isProductionPath(filePath) {
  return PRODUCTION_SURFACE.some((directory) => filePath === directory ||
    filePath.startsWith(`${directory}${PATH_SEGMENT}`));
}

function requiresVerification(paths) {
  return paths.some(isProductionPath);
}

// --- verification -----------------------------------------------------------
// One predicate for "the recorded verdicts admit a production-surface change":
// approvalProblems(entries, paths). land asks it of the live log and the
// staged change set, the main admission of the log a landing commit carries
// and that commit's change set - log entries and paths only, never the
// working tree. A stricter verdict rule goes into approvalProblems and
// tightens both at once.

const VERIFICATION_MESSAGE = Object.freeze({
  REJECTION_STANDS: 'the newest verification is a rejection and no attempt is newer than it',
  MISSING: `${SURFACE_LABEL} changes need a verification entry (verifier subagent:<id>)`,
  STALE: `${SURFACE_LABEL} changes need a verification entry newer than the last attempt`,
  NOT_APPROVED: `${SURFACE_LABEL} changes need an approving verification`,
});
const VERDICT_STATE = Object.freeze({
  NONE: 'none', STALE: 'stale', APPROVED: 'approved', REJECTED: 'rejected',
});
const VERIFICATION_PROBLEMS = Object.freeze({
  [VERDICT_STATE.NONE]: VERIFICATION_MESSAGE.MISSING,
  [VERDICT_STATE.STALE]: VERIFICATION_MESSAGE.STALE,
  [VERDICT_STATE.REJECTED]: VERIFICATION_MESSAGE.NOT_APPROVED,
  [VERDICT_STATE.APPROVED]: null,
});

function verdictState(state) {
  const last = state.lastVerification;
  if (!last) return VERDICT_STATE.NONE;
  if (!state.verificationIsCurrent) return VERDICT_STATE.STALE;
  return verdictOf(last) === VERDICT.APPROVE ? VERDICT_STATE.APPROVED : VERDICT_STATE.REJECTED;
}

/**
 * What the recorded verdicts lack before a change set may land: a standing
 * rejection always blocks, and a production-surface change needs a current
 * approval.
 * @param {Object} state questState of the log
 * @param {string[]} paths
 * @return {string[]}
 */
function verificationProblems(state, paths) {
  const verdict = verdictState(state);
  const problems = [];
  if (verdict === VERDICT_STATE.REJECTED) problems.push(VERIFICATION_MESSAGE.REJECTION_STANDS);
  const required = requiresVerification(paths) ? VERIFICATION_PROBLEMS[verdict] : null;
  if (required) problems.push(required);
  return problems;
}

/**
 * The extension point: what a quest's recorded log lacks before the change
 * set may land on main - the verdicts, and the approving verification's
 * record (verificationRecordProblems). Both `land` (the working tree) and the
 * main admission (a commit's tree) call it, so a stricter rule tightens both.
 * @param {Array<Object>} entries the quest's log entries
 * @param {{paths: string[], addedSourceLines: string[]}} changeSet full paths
 * @param {{read: Function, list: Function}} tree
 * @return {string[]}
 */
function approvalProblems(entries, changeSet, tree) {
  return [...verificationProblems(questState(entries), changeSet.paths),
    ...verificationRecordProblems(entries, changeSet, tree)];
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
// A production-surface approval is an approval only when it names the
// verification templates it applied and carries what each demands, at
// minimum the red-on-revert. v1 enforced a verdict file
// (solver-verifier-verdict/1: scripts/solve/verifier-verdict.js and
// review-request.js at 5271defb5^); the v2 cutover recorded verifications as
// free text and nothing read a template again. The admissible ids are the
// templates' own front-matter `categories`; a template may declare
// `evidence: [<field>]` (what its entry must carry) and `trigger: <pattern>`
// (code the change adds that makes it required). The check is a pure function
// of the quest log, the change set and a tree reader, so the same predicate
// judges a working tree (land) and a commit (the main admission): every file
// it names is a full repository path in that tree. It checks references, not
// that a revert was really run: the independent verifier stays the control.

const TEMPLATE_DIR = 'docs/development/verification-templates';
const TEMPLATE_SUFFIX = '.md';
const TRIGGER_FLAGS = 'u';
const REVERT_FIELDS = Object.freeze(['reverted', 'what', 'witness', 'assertion', 'evidence']);
// A demanded answer that says nothing is not an answer.
const PLACEHOLDER_ANSWERS = Object.freeze(['n/a', 'na', 'none', '-', 'tbd', 'todo', 'unknown']);
const EVIDENCE_LINE = /^(.+):(\d+)$/u;
const PARENT_SEGMENT = '..';
const ADDED_LINE = '+';
const ADDED_FILE_HEADER = '+++';
const PATHSPEC_END = '--';
const SOURCE_DIFF = Object.freeze(['diff', '--no-color', '--unified=0', 'HEAD', PATHSPEC_END]);
const COMMIT_SOURCE_DIFF = Object.freeze(['diff', '--no-color', '--unified=0']);
const LS_TREE_NAMES = Object.freeze(['ls-tree', '-z', '--name-only', '--full-tree']);
// What a trigger is matched against: code, never comments or string text.
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/u;
const STRING_LITERAL = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/gu;
const EMPTY_STRING_LITERAL = '""';
const TRAILING_COMMENT = /\/\/.*$/u;
const RECORD = Object.freeze({
  PREFIX: 'the approving verification ',
  NO_TEMPLATE: 'names no verification template (note --verification ... --evidence ' +
    '<record.json> with {"templates": [{"id", "redOnRevert"}]}); admissible: ',
  UNKNOWN: 'names unknown verification template ',
  ADMISSIBLE: '; admissible: ',
  NO_REVERT: 'carries no red-on-revert {reverted, what, witness, assertion, evidence} ' +
    'for template ',
  LACKS: ' lacks ',
  DEMANDED: ' (its template demands it; a placeholder is no answer)',
  REVERT_OF: 'red-on-revert of ',
  NOT_SOURCE: ': reverted path is not in the quest\'s production-surface change set: ',
  NO_WITNESS: ': witness is not a file in the tree: ',
  PRODUCTION_WITNESS: ': witness is a production-surface file, not a test: ',
  UNBOUND_WITNESS: ': witness is neither in the quest\'s change set nor in its receipts: ',
  TRIGGERED_PREFIX: 'does not name template ',
  TRIGGERED_SUFFIX: ', whose trigger the change\'s added code matches',
  NO_SAMPLE: 'carries neither a sample of the author\'s census and history pass ' +
    '(sampled: {census: [rows], history: [rows], found}) nor a locality proof ' +
    '(local: {proof, census: <tree path>})',
  LOCAL_CENSUS: 'locality census: ',
  NO_EVIDENCE: 'names no evidence',
  MISSING_EVIDENCE: 'evidence is not a file in the tree (cite a tree path or a quest ' +
    'log line, path:line): ',
  WITNESS_EVIDENCE: 'evidence is the witness itself: ',
  PRODUCTION_EVIDENCE: 'evidence is a production-surface file: ',
  WHOLE_LOG: 'evidence cites a whole quest log; cite the evidence entry\'s line: ',
  NOT_EVIDENCE_ENTRY: 'evidence cites a quest log line that is not an evidence finding ' +
    'recorded before this verification: ',
  NO_LINE: 'evidence has no such line: ',
  UNNAMED: 'evidence does not name the assertion ',
  DUPLICATE_TEMPLATE: 'verification template id declared by two files: ',
  AND: ' and ',
  BAD_TRIGGER: 'verification template declares an invalid trigger: ',
  NOT_JSON: 'is not a JSON object: ',
  NO_FILE: 'verification record not found: ',
  FILE_PREFIX: 'verification record ',
});

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isAnswer(value) {
  return nonEmptyText(value) && !PLACEHOLDER_ANSWERS.includes(value.trim().toLowerCase());
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
  return normalized.split(PATH_SEGMENT).includes(PARENT_SEGMENT) ? null : normalized;
}

/**
 * The tree reader `land` judges with: the working tree under `root`. `read`
 * takes a full repository path and answers its text or null; `list` takes a
 * directory and answers the FULL repository paths of the files in it (what
 * `git ls-tree --name-only <commit> <dir>/` answers for a commit).
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
      return fs.existsSync(directory) ? fs.readdirSync(directory).sort()
        .map((name) => `${relative}${PATH_SEGMENT}${name}`) : [];
    },
  };
}

/**
 * The change set `land` judges: its paths and the lines it adds on the
 * production surface (tracked changes against HEAD, plus whole untracked
 * files). For a commit the same shape is the commit's paths and the `+` lines
 * of `git diff --unified=0 <parent> <commit> -- <surface>`.
 * @param {string} root
 * @param {string[]} paths
 * @return {{paths: string[], addedSourceLines: string[]}}
 */
function addedLines(diff) {
  return lines(diff)
    .filter((line) => line.startsWith(ADDED_LINE) && !line.startsWith(ADDED_FILE_HEADER))
    .map((line) => line.slice(ADDED_LINE.length));
}

function workingChangeSet(root, paths) {
  const sourcePaths = paths.filter(isProductionPath);
  if (sourcePaths.length === 0) return {paths, addedSourceLines: []};
  const added = addedLines(git(root, [...SOURCE_DIFF, ...sourcePaths]));
  const untracked = nulPaths(git(root, [...GIT_ARGUMENTS.UNTRACKED, PATHSPEC_END,
    ...sourcePaths]))
    .flatMap((file) => fs.readFileSync(path.join(root, file), TEXT_ENCODING)
      .split(LINE_SEPARATOR));
  return {paths, addedSourceLines: [...added, ...untracked]};
}

/**
 * The tree reader the main admission judges with: the tree of `commit`, with
 * the same full-path shape as workingTreeReader.
 * @param {string} root
 * @param {string} commit
 * @return {{read: function(string): ?string, list: function(string): string[]}}
 */
function commitTreeReader(root, commit) {
  return {
    read: (relative) => {
      const file = treePath(relative);
      const blob = file === null ? null : gitBlob(root, commit, file);
      return blob === null ? null : blob.toString(TEXT_ENCODING);
    },
    list: (relative) => nulPaths(git(root, [...LS_TREE_NAMES, commit, PATHSPEC_END,
      `${relative}${PATH_SEGMENT}`], {allowFailure: true})).sort(),
  };
}

/**
 * The change set a commit carries from `from`: every path that differs, plus
 * `extraPaths`, and the `+` lines of its production-surface diff.
 * @param {string} root
 * @param {{from: string, to: string, extraPaths?: string[]}} range
 * @return {{paths: string[], addedSourceLines: string[]}}
 */
function commitChangeSet(root, {from, to, extraPaths = []}) {
  const paths = new Set([...changedPathsBetween(root, from, to).map((change) => change.path),
    ...extraPaths]);
  return {paths: [...paths].sort(), addedSourceLines: addedLines(git(root,
    [...COMMIT_SOURCE_DIFF, from, to, PATHSPEC_END, ...PRODUCTION_SURFACE]))};
}

function templateTrigger(file, pattern, problems) {
  if (!nonEmptyText(pattern)) return null;
  try {
    return new RegExp(pattern, TRIGGER_FLAGS);
  } catch (error) {
    problems.push(`${RECORD.BAD_TRIGGER}${file}: ${error.message}`);
    return null;
  }
}

function listOf(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * The admissible verification templates, read from the template files in the
 * tree: each front-matter category is an id; there is no second list. A
 * duplicate id or an invalid trigger fails closed, naming the files.
 * @param {{read: Function, list: Function}} tree
 * @return {{catalog: Map<string, Object>, problems: string[]}}
 */
function verificationTemplates(tree) {
  const catalog = new Map();
  const problems = [];
  for (const file of tree.list(TEMPLATE_DIR).filter((name) => name.endsWith(TEMPLATE_SUFFIX))) {
    const content = tree.read(file);
    const front = content === null ? null : parseFrontMatter(content).front;
    if (!front) continue;
    const declared = {file, evidence: listOf(front.evidence),
      trigger: templateTrigger(file, front.trigger, problems)};
    for (const id of listOf(front.categories)) {
      if (catalog.has(id)) {
        problems.push(`${RECORD.DUPLICATE_TEMPLATE}${id} (${catalog.get(id).file}` +
          `${RECORD.AND}${file})`);
      } else {
        catalog.set(id, declared);
      }
    }
  }
  return {catalog, problems};
}

function admissibleList(catalog) {
  return [...catalog.keys()].join(LIST_SEPARATOR);
}

// A cited quest-log line must be an evidence finding recorded before the
// verification it supports: neither the verification's own line nor a
// statement the verifier wrote as a decision. In this quest's own log
// "before" is the entry order; in another quest's log, the timestamp.
function logLineProblem(scope, reference, judged) {
  let entry = null;
  try {
    entry = JSON.parse(scope);
  } catch (error) {
    return `${RECORD.NOT_EVIDENCE_ENTRY}${reference} (${error.message})`;
  }
  const own = judged.entries.findIndex((candidate) => JSON.stringify(candidate) === scope);
  const earlier = own === -1 ?
    typeof entry?.ts === 'string' && entry.ts < String(judged.verification?.ts) :
    own < judged.entries.lastIndexOf(judged.verification);
  return entry?.type === ENTRY_TYPE.FINDING && entry.kind === FINDING_KIND.EVIDENCE && earlier ?
    null : `${RECORD.NOT_EVIDENCE_ENTRY}${reference}`;
}

// The file part of an evidence reference must be a tree file that is neither
// the witness nor production code.
function evidenceFileProblem(file, reference, witness) {
  if (witness && file === witness) return `${RECORD.WITNESS_EVIDENCE}${reference}`;
  return isProductionPath(file) ? `${RECORD.PRODUCTION_EVIDENCE}${reference}` : null;
}

// A tree path, or path:line, whose content - the cited line when one is
// cited - names the assertion when one is given: exit status alone is not a
// red-on-revert (harness-fidelity item 1).
function evidenceProblem(tree, reference, {assertion = null, witness = null,
  judged = {entries: [], verification: null}} = {}) {
  if (!nonEmptyText(reference)) return RECORD.NO_EVIDENCE;
  const cited = EVIDENCE_LINE.exec(reference);
  const file = treePath(cited ? cited[1] : reference);
  const content = file === null ? null : tree.read(file);
  if (content === null) return `${RECORD.MISSING_EVIDENCE}${reference}`;
  const misplaced = evidenceFileProblem(file, reference, witness);
  if (misplaced) return misplaced;
  if (!cited && isQuestLogPath(file)) return `${RECORD.WHOLE_LOG}${reference}`;
  const scope = cited ? content.split(LINE_SEPARATOR)[Number(cited[2]) - 1] : content;
  if (scope === undefined || (cited && scope === '')) return `${RECORD.NO_LINE}${reference}`;
  const logProblem = isQuestLogPath(file) ? logLineProblem(scope, reference, judged) : null;
  if (logProblem) return logProblem;
  return assertion && !scope.includes(assertion) ?
    `${RECORD.UNNAMED}"${assertion}": ${reference}` : null;
}

function witnessProblem(context, label, witness) {
  if (context.tree.read(witness) === null) return `${label}${RECORD.NO_WITNESS}${witness}`;
  if (isProductionPath(witness)) return `${label}${RECORD.PRODUCTION_WITNESS}${witness}`;
  return context.changed.has(witness) || context.receipts.has(witness) ? null :
    `${label}${RECORD.UNBOUND_WITNESS}${witness}`;
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
  const witness = witnessProblem(context, label, revert.witness);
  if (witness) problems.push(witness);
  const evidence = evidenceProblem(context.tree, revert.evidence, {assertion: revert.assertion,
    witness: revert.witness, judged: context.judged});
  if (evidence) problems.push(`${label}: ${evidence}`);
  return problems;
}

function templateEntryProblems(context, entry) {
  const id = isRecordObject(entry) ? entry.id : entry;
  const template = context.catalog.get(id);
  if (!template) {
    return [`${RECORD.UNKNOWN}${id}${RECORD.ADMISSIBLE}${admissibleList(context.catalog)}`];
  }
  return [...template.evidence.filter((field) => !isAnswer(entry[field]))
    .map((field) => `template ${id}${RECORD.LACKS}${field}${RECORD.DEMANDED}`),
  ...revertProblems(context, id, entry.redOnRevert)];
}

// The code of an added line: nothing on a comment line, string literals
// emptied, a trailing comment cut, so a trigger matches constructs, not words.
function codeOf(line) {
  if (COMMENT_LINE.test(line)) return '';
  return line.replace(STRING_LITERAL, EMPTY_STRING_LITERAL).replace(TRAILING_COMMENT, '');
}

function triggeredProblems(context, named, addedSourceLines) {
  const code = addedSourceLines.map(codeOf).join(LINE_SEPARATOR);
  return [...context.catalog]
    .filter(([id, template]) => template.trigger && !named.has(id) &&
      template.trigger.test(code))
    .map(([id]) => `${RECORD.TRIGGERED_PREFIX}${id}${RECORD.TRIGGERED_SUFFIX}`);
}

function sampleProblems(context, record) {
  const sampled = record.sampled;
  if (isRecordObject(sampled) && nonEmptyList(sampled.census) &&
    nonEmptyList(sampled.history) && nonEmptyText(sampled.found)) return [];
  const local = record.local;
  if (!isRecordObject(local) || !nonEmptyText(local.proof)) return [RECORD.NO_SAMPLE];
  const census = evidenceProblem(context.tree, local.census, {judged: context.judged});
  return census ? [`${RECORD.LOCAL_CENSUS}${census}`] : [];
}

// The witness files the quest's sealed receipts name (seal doneWhen args.file).
function receiptWitnesses(state, tree) {
  const file = treePath(state.seal?.seal?.doneWhen?.args?.file);
  const content = file === null ? null : tree.read(file);
  const parsed = content === null ? null : JSON.parse(content);
  const receipts = Array.isArray(parsed?.receipts) ? parsed.receipts : [];
  return new Set(receipts.map((receipt) => receipt?.testFile).filter(nonEmptyText));
}

/**
 * What the current approval of a production-surface change lacks in its
 * record: the named templates (each admissible, each with its demanded fields
 * and a red-on-revert bound to this change and tree), every triggered
 * template, and the census sample or locality proof. Empty when the change
 * touches no production path or the current verdict is not an approval
 * (verificationProblems owns those). Pure over its inputs: land passes the
 * working tree, the main admission a commit (see workingTreeReader and
 * workingChangeSet for the shapes).
 * @param {Array<Object>} logEntries the quest's log
 * @param {{paths: string[], addedSourceLines: string[]}} changeSet full paths
 * @param {{read: Function, list: Function}} tree
 * @return {string[]}
 */
function verificationRecordProblems(logEntries, changeSet, tree) {
  const state = questState(logEntries);
  const last = state.lastVerification;
  if (!changeSet.paths.some(isProductionPath) || !state.verificationIsCurrent ||
    !isApproval(last)) return [];
  const {catalog, problems} = verificationTemplates(tree);
  if (problems.length > 0) return problems.map((problem) => `${RECORD.PREFIX}${problem}`);
  const record = isRecordObject(last.record) ? last.record : {};
  if (!nonEmptyList(record.templates)) {
    return [`${RECORD.PREFIX}${RECORD.NO_TEMPLATE}${admissibleList(catalog)}`];
  }
  const context = {tree, catalog, judged: {entries: logEntries, verification: last},
    sourcePaths: changeSet.paths.filter(isProductionPath),
    changed: new Set(changeSet.paths), receipts: receiptWitnesses(state, tree)};
  const named = new Set(record.templates.map((entry) => entry?.id));
  return [...record.templates.flatMap((entry) => templateEntryProblems(context, entry)),
    ...triggeredProblems(context, named, changeSet.addedSourceLines),
    ...sampleProblems(context, record)]
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
  const {catalog, problems} = verificationTemplates(workingTreeReader(root));
  const unknown = (Array.isArray(record.templates) ? record.templates : [])
    .map((entry) => (isRecordObject(entry) ? entry.id : entry))
    .filter((id) => !catalog.has(id));
  return {record, problems: [...problems, ...unknown.map((id) =>
    `${RECORD.UNKNOWN}${id}${RECORD.ADMISSIBLE}${admissibleList(catalog)}`)]};
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

// --- main admission ------------------------------------------------------------
// Owner decision 2026-10-04: a change to the production surface
// (PRODUCTION_SURFACE) reaches main only as a solver landing. Every commit a
// push brings to main (reachable from the pushed main head and not from the remote main head - the ancestry cut-off: nothing
// already on main is judged) whose own change touches it must be one: a
// single-parent commit whose tree appends to one quest's log the terminal
// solved entry `land` writes, that entry binding the commit's exact surface
// change (every raw diff line: both modes, both blob ids, status, path), and
// the log it lands in recording a seal and a current approving verification.
// A trailer is typed text and binds nothing, so no trailer makes a landing.
// The binding is content, not ancestry, so it survives the publisher's
// rebase over inert data commits and refuses the same commit replayed onto
// different surface bytes.
// A merge brings a branch's commits with it. It is admitted, with every
// commit it brings (in the push, reachable from some parent but not from all
// of them), when an exact-SHA corpus-full-v1 or release-full-v1 receipt names
// the merge commit itself (the tree that enters main), the merge names
// (`Quest:` trailer) a sealed quest whose log at the merge records a current
// approving verification, and that quest's log at the pushed head records the
// owner's decision finding naming the merge's full sha (appended in a commit
// on top of the merge: a log inside the merge cannot name the merge's own sha).
// The owner's GitHub approval of the pull request is the identity witness the
// person running the merge checks and records in that finding; this check is
// offline and cannot see it.
// A push fast-forwards main to any descendant, so a merge's first parent is
// arbitrary and no parent is privileged (owner ruling 2026-10-05): a
// merge is clean on a surface path only where it equals the textbook
// three-way result over every merge base. Anything else - a path both sides
// changed differently, a landing dropped by taking a stale side (`ours`,
// `theirs`, either parent first, octopus), a change no parent has - is the
// merge's own surface change and needs the receipt route; a clean merge of
// landings brings nothing unlanded and needs no receipt. A quest lands once:
// the solved entry must close a log that was open at the parent.

const RAW_DIFF_PREFIX = ':';
const FIELD_SEPARATOR = ' ';
const SOURCE_CHANGE_FIELD = 'source';
const PATHSPEC_SEPARATOR = '--';
const GIT_DIFF_TREE = 'diff-tree';
const GIT_REV_LIST = 'rev-list';
const RAW_SOURCE_DIFF = Object.freeze(['--raw', '-z', '--no-renames', '--no-abbrev', '-r']);
const STAGED_SOURCE_DIFF = Object.freeze(['diff-index', '--cached', ...RAW_SOURCE_DIFF,
  'HEAD', PATHSPEC_SEPARATOR, ...PRODUCTION_SURFACE]);
const RANGE_COMMITS = Object.freeze([GIT_REV_LIST, '--reverse', '--parents']);
const ONE_COMMIT_LOG = Object.freeze(['log', '-1']);
const QUEST_TRAILER_FORMAT = '--format=%(trailers:key=Quest,valueonly,separator=%x2C)';
const SUBJECT_FORMAT = '--format=%s';
const EMPTY_TREE = Object.freeze(['hash-object', '-t', 'tree', '/dev/null']);
const MERGE_BASES = Object.freeze(['merge-base', '--all']);
const MERGE_BASE_ONE = Object.freeze(['merge-base']);
const IS_ANCESTOR = Object.freeze(['merge-base', '--is-ancestor']);
const VERIFY_COMMIT = Object.freeze(['rev-parse', '--verify', '--quiet']);
const COMMIT_PEEL = '^{commit}';
const ADMITTING_PROOFS = Object.freeze([PROOF.CORPUS_FULL, PROOF.RELEASE_FULL]);
const REFUSED_PATH_SAMPLE = 10;
const ADMISSION = Object.freeze({
  LANDING: 'solver landing',
  NO_SOURCE: `no ${SURFACE_LABEL} change`,
  COVERED: 'brought by an admitted merge',
  MERGE_ADMITTED: 'merge admitted by its exact-SHA receipt and governing quest',
});
const ADMISSION_PROBLEM = Object.freeze({
  NOT_A_LANDING: `changes the ${SURFACE_LABEL} and appends no terminal solved entry to a ` +
    'quest log (a direct commit; a trailer is not a landing)',
  UNBOUND: `its new terminal solved entry binds no ${SURFACE_LABEL} change (not written by land)`,
  MISMATCH: `its new terminal solved entry binds a different ${SURFACE_LABEL} change than ` +
    'this commit makes',
  UNSEALED: 'the quest it lands was never sealed',
  CLOSED: 'the quest it lands was already closed at the parent commit (a quest lands once)',
  REOPENED: 'the quest log at the remote base is closed there or its entries are not all ' +
    'kept, in order, in its log at the parent commit (rewritten in the push)',
  NO_RECEIPT: `merges ${SURFACE_LABEL} changes without an exact-SHA corpus-full-v1 or ` +
    'release-full-v1 receipt for this merge commit',
  NO_QUEST: `merges ${SURFACE_LABEL} changes without naming its governing quest (Quest: trailer)`,
  UNKNOWN_QUEST: 'names a governing quest this merge does not carry a sealed record for',
  UNAUTHORISED: 'its governing quest\'s log at the pushed head records no owner decision ' +
    'finding naming this merge\'s full sha (the owner\'s authorisation; see the runbook)',
  BRINGS_PREFIX: 'brings ',
  BRINGS_SUFFIX: ` unlanded ${SURFACE_LABEL} commit(s); `,
  STORE_UNAVAILABLE: 'the proof store could not answer: ',
  UNKNOWN_REVISION: ' is not a commit in this repository (fetch it; nothing is judged)',
  NOT_ANCESTOR: ' is not an ancestor of ',
});
const PROBLEM_SEPARATOR = '; ';

function gitBlob(root, rev, file) {
  const result = spawnSync(GIT, ['cat-file', 'blob', `${rev}:${file}`],
    {cwd: root, maxBuffer: SPAWN_MAX_BUFFER});
  return result.status === 0 ? result.stdout : null;
}

// Raw -z records: ":<mode> <mode> <sha> <sha> <status>" NUL "<path>" NUL.
function rawDiffEntries(output) {
  const fields = output.split(NUL);
  const entries = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    if (!fields[index].startsWith(RAW_DIFF_PREFIX)) break;
    const filePath = fields[index + 1];
    entries.push({path: filePath,
      line: `${fields[index].slice(RAW_DIFF_PREFIX.length)}${FIELD_SEPARATOR}${filePath}`});
  }
  return entries.sort((left, right) => (left.line < right.line ? -1 : 1));
}

/**
 * The binding of a production-surface change: how many raw diff entries and the digest of
 * them all. `land` records it from the index it commits; the admission
 * recomputes it from the commit.
 * @param {Array<{line: string}>} entries
 * @return {{pathCount: number, digest: string}}
 */
function sourceChangeRecord(entries) {
  return {pathCount: entries.length,
    digest: sha256(entries.map((entry) => entry.line).join(LINE_SEPARATOR))};
}

function stagedSourceChange(root) {
  return sourceChangeRecord(rawDiffEntries(git(root, [...STAGED_SOURCE_DIFF])));
}

function commitSourceEntries(root, parent, commit) {
  return rawDiffEntries(git(root, [GIT_DIFF_TREE, ...RAW_SOURCE_DIFF, parent, commit,
    PATHSPEC_SEPARATOR, ...PRODUCTION_SURFACE]));
}

function sourceChanges(root, from, to) {
  return new Set(changedPathsBetween(root, from, to).map((change) => change.path)
    .filter(isProductionPath));
}

// Every merge base of every pair of parents (`--all`: in a criss-cross the
// one base git picks is steered by commit dates); a pair with none adds the
// empty tree. Over all pairs, so no parent is privileged; for two parents it is
// exactly `merge-base --all p1 p2`.
function mergeBases(root, parents) {
  const bases = new Set();
  parents.forEach((left, index) => {
    for (const right of parents.slice(index + 1)) {
      const found = lines(git(root, [...MERGE_BASES, left, right], {allowFailure: true}));
      if (found.length === 0) found.push(git(root, [...EMPTY_TREE]).trim());
      found.forEach((base) => bases.add(base));
    }
  });
  return [...bases];
}

// The merge's own surface change (see above), symmetric in its parents: a
// surface path where the merge differs from some parent is clean only when it
// equals the textbook three-way result over every merge base - the parents
// that changed it since some base all hold the merge's value there. A path no
// parent changed, or one where the merge differs from a parent that changed
// it (a two-sided change resolved either way, or a landing dropped), is its own.
function mergeSourcePaths(root, parents, merge) {
  const unlike = parents.map((parent) => sourceChanges(root, parent, merge));
  const candidates = new Set(unlike.flatMap((paths) => [...paths]));
  if (candidates.size === 0) return [];
  const bases = mergeBases(root, parents);
  const moved = parents.map((parent) =>
    new Set(bases.flatMap((base) => [...sourceChanges(root, base, parent)])));
  return [...candidates].filter((file) => {
    const changers = parents.map((_, index) => index).filter((index) => moved[index].has(file));
    return changers.length === 0 || changers.some((index) => unlike[index].has(file));
  });
}

function parseLogLines(content) {
  try {
    return lines(content).map((line) => JSON.parse(line));
  } catch {
    return null;
  }
}

// The entries a commit appended to a log, or null when it did not append.
function appendedEntries(before, after) {
  if (!after) return null;
  const prefix = before || Buffer.alloc(0);
  if (after.length < prefix.length || !after.subarray(0, prefix.length).equals(prefix)) return null;
  return parseLogLines(after.subarray(prefix.length).toString(TEXT_ENCODING));
}

function isSolvedTerminal(entry) {
  return entry?.type === ENTRY_TYPE.TERMINAL && entry.status === QUEST_STATUS.SOLVED;
}

// The log a commit carries, judged by the one approval predicate land uses,
// over that commit's change set and tree.
function recordedLogProblem(log, changeSet, tree) {
  if (!questState(log).seal) return ADMISSION_PROBLEM.UNSEALED;
  const problems = approvalProblems(log, changeSet, tree);
  return problems.length > 0 ? problems.join(PROBLEM_SEPARATOR) : null;
}

function terminalBindingProblem(terminal, entries) {
  const recorded = terminal[SOURCE_CHANGE_FIELD];
  if (!recorded) return ADMISSION_PROBLEM.UNBOUND;
  const actual = sourceChangeRecord(entries);
  return recorded.digest !== actual.digest || recorded.pathCount !== actual.pathCount ?
    ADMISSION_PROBLEM.MISMATCH : null;
}

// Every entry of the log as main has it, in main's order, inside the log at
// the parent: a merge of two lineages keeps each one's entries in order (an
// order-preserving union), so main's log need not be a byte prefix of it.
function keepsEveryEntry(atBase, prior) {
  const kept = lines(prior.toString(TEXT_ENCODING));
  let next = 0;
  return lines(atBase.toString(TEXT_ENCODING)).every((line) => {
    next = kept.indexOf(line, next) + 1;
    return next > 0;
  });
}

// Null when the commit is a solver landing of exactly its surface change.
// The log as main has it must still stand under the parent's: open there, and
// every one of its entries kept, in order, in what the landing appends to.
function rebasedLogProblem(root, rangeBase, file, before) {
  const atBase = gitBlob(root, rangeBase, file);
  if (!atBase) return null;
  const kept = keepsEveryEntry(atBase, before || Buffer.alloc(0));
  const log = parseLogLines(atBase.toString(TEXT_ENCODING));
  return kept && log && !questState(log).terminal ? null : ADMISSION_PROBLEM.REOPENED;
}

function landingProblem(root, {parent, commit, rangeBase}, entries) {
  const logs = changedPathsBetween(root, parent, commit).map((change) => change.path)
    .filter(isQuestLogPath);
  let problem = ADMISSION_PROBLEM.NOT_A_LANDING;
  for (const file of logs) {
    const before = gitBlob(root, parent, file);
    const after = gitBlob(root, commit, file);
    const terminal = appendedEntries(before, after)?.find(isSolvedTerminal);
    if (!terminal) continue;
    const prior = parseLogLines(String(before || ''));
    // The log's integrity first (bound, open, main's entries kept), then what
    // its approval records over this commit's change and tree.
    problem = terminalBindingProblem(terminal, entries) ||
      (!prior || questState(prior).terminal ? ADMISSION_PROBLEM.CLOSED : null) ||
      rebasedLogProblem(root, rangeBase, file, before) ||
      recordedLogProblem(parseLogLines(after.toString(TEXT_ENCODING)),
        commitChangeSet(root, {from: parent, to: commit}), commitTreeReader(root, commit));
    if (!problem) return null;
  }
  return problem;
}

function commitVerdict(row, paths, problem, admission) {
  return {...row, paths, problem, admission: problem ? null : admission};
}

// A merge's own surface change stands refused for want of a receipt until the
// merge is admitted.
function mergeVerdict(root, row) {
  const paths = mergeSourcePaths(root, row.parents, row.sha);
  return commitVerdict(row, paths, paths.length > 0 ? ADMISSION_PROBLEM.NO_RECEIPT : null,
    ADMISSION.NO_SOURCE);
}

function singleParentVerdict(root, row) {
  const parent = row.parents[0] || git(root, [...EMPTY_TREE]).trim();
  const entries = commitSourceEntries(root, parent, row.sha);
  const changesSource = entries.length > 0;
  return commitVerdict(row, entries.map((entry) => entry.path),
    changesSource ?
      landingProblem(root, {parent, commit: row.sha, rangeBase: row.base}, entries) : null,
    changesSource ? ADMISSION.LANDING : ADMISSION.NO_SOURCE);
}

function judgeCommit(root, row) {
  return row.parents.length > 1 ? mergeVerdict(root, row) : singleParentVerdict(root, row);
}

function exactReceiptProblem(root, merge, resolve) {
  const answers = ADMITTING_PROOFS.map((proofId) => resolve({proofId, sha: merge, cwd: root}));
  if (answers.some((answer) => answer.outcome === OUTCOME.PROVEN &&
    answer.resolution === RESOLUTION.EXACT_SHA)) return null;
  const unavailable = answers.find((answer) => answer.outcome === OUTCOME.UNAVAILABLE);
  return unavailable ? `${ADMISSION_PROBLEM.STORE_UNAVAILABLE}${unavailable.because}` :
    ADMISSION_PROBLEM.NO_RECEIPT;
}

// The owner's authorisation (existing governance, owner ruling 2026-10-05): a
// decision finding in the governing quest's log at the pushed head naming the
// merge's full sha.
function ownerAuthorisationProblem(root, {sha, head}, logFile) {
  const log = parseLogLines(String(gitBlob(root, head, logFile) || '')) || [];
  return log.some((entry) => entry.type === ENTRY_TYPE.FINDING &&
    entry.kind === FINDING_KIND.DECISION && String(entry.text).includes(sha)) ?
    null : ADMISSION_PROBLEM.UNAUTHORISED;
}

// What a merge carries onto main: its diff from where it meets the remote
// base, with its own surface paths and those of the unlanded commits it brings
// (real paths, never the literal surface).
function mergeChangeSet(root, row, broughtPaths) {
  const from = git(root, [...MERGE_BASE_ONE, row.base, row.sha], {allowFailure: true}).trim() ||
    git(root, [...EMPTY_TREE]).trim();
  return commitChangeSet(root, {from, to: row.sha, extraPaths: [...row.paths, ...broughtPaths]});
}

function governingQuestProblem(root, row, broughtPaths) {
  const id = git(root, [...ONE_COMMIT_LOG, QUEST_TRAILER_FORMAT, row.sha]).trim();
  if (!id) return ADMISSION_PROBLEM.NO_QUEST;
  const directory = `${QUESTS_DIR}${PATH_SEGMENT}${id}${PATH_SEGMENT}`;
  const log = parseLogLines(String(gitBlob(root, row.sha, `${directory}${LOG_FILE}`) || ''));
  if (!gitBlob(root, row.sha, `${directory}${QUEST_FILE}`) || !log) {
    return `${ADMISSION_PROBLEM.UNKNOWN_QUEST} (${id})`;
  }
  const problem = recordedLogProblem(log, mergeChangeSet(root, row, broughtPaths),
    commitTreeReader(root, row.sha)) ||
    ownerAuthorisationProblem(root, row, `${directory}${LOG_FILE}`);
  return problem ? `${problem} (${id})` : null;
}

function mergeAdmissionProblem(root, row, {resolve, broughtPaths}) {
  return exactReceiptProblem(root, row.sha, resolve) ||
    governingQuestProblem(root, row, broughtPaths);
}

// The commits in the push this merge brings: reachable from some parent and
// not from every parent (history every parent shares is not brought by it).
function broughtCommits(root, row, inRange) {
  const reached = row.parents.map((parent) =>
    new Set(lines(git(root, [GIT_REV_LIST, parent, `^${row.base}`]))));
  return [...inRange].filter((sha) => reached.some((commits) => commits.has(sha)) &&
    !reached.every((commits) => commits.has(sha)));
}

function admitMerges(root, verdicts, resolve) {
  const inRange = new Set(verdicts.keys());
  for (const verdict of verdicts.values()) {
    if (verdict.parents.length < 2) continue;
    const unlanded = broughtCommits(root, verdict, inRange)
      .filter((sha) => verdicts.get(sha).problem);
    if (!verdict.problem && unlanded.length === 0) continue;
    const problem = mergeAdmissionProblem(root, verdict, {resolve,
      broughtPaths: unlanded.flatMap((sha) => verdicts.get(sha).paths)});
    if (problem) {
      verdict.problem = unlanded.length === 0 ? problem : `${ADMISSION_PROBLEM.BRINGS_PREFIX}` +
        `${unlanded.length}${ADMISSION_PROBLEM.BRINGS_SUFFIX}${problem}`;
      continue;
    }
    Object.assign(verdict, {admission: ADMISSION.MERGE_ADMITTED, problem: null});
    for (const sha of unlanded) {
      Object.assign(verdicts.get(sha), {admission: ADMISSION.COVERED, problem: null,
        coveredBy: verdict.sha});
    }
  }
}

function refusal(root, verdict) {
  return {commit: verdict.sha,
    subject: git(root, [...ONE_COMMIT_LOG, SUBJECT_FORMAT, verdict.sha]).trim(),
    pathCount: verdict.paths.length,
    paths: [...verdict.paths].sort().slice(0, REFUSED_PATH_SAMPLE),
    reason: verdict.problem};
}

/**
 * Judge every commit `head` brings to main over `base` (the remote main sha):
 * each one that changes the production surface must be a solver landing or be brought by an
 * admitted merge. Git plumbing only, except a receipt lookup for a merge
 * that needs one.
 * @param {string} root
 * @param {{base: string, head: string, resolve?: Function}} options
 * @return {{base: string, head: string, judged: number,
 *   admitted: Array<Object>, refused: Array<Object>}}
 */
function rangeProblem(root, base, head) {
  const unknown = [base, head].find((rev) => !git(root, [...VERIFY_COMMIT,
    `${rev}${COMMIT_PEEL}`], {allowFailure: true}).trim());
  if (unknown) return `${unknown}${ADMISSION_PROBLEM.UNKNOWN_REVISION}`;
  const ancestor = spawnSync(GIT, [...IS_ANCESTOR, base, head], {cwd: root});
  return ancestor.status === 0 ? null : `${base}${ADMISSION_PROBLEM.NOT_ANCESTOR}${head}`;
}

function mainAdmission(root, {base, head, resolve = resolveProof}) {
  const rows = lines(git(root, [...RANGE_COMMITS, `${base}..${head}`])).map((line) => {
    const [sha, ...parents] = line.split(FIELD_SEPARATOR);
    return {sha, parents, base, head};
  });
  const verdicts = new Map(rows.map((row) => [row.sha, judgeCommit(root, row)]));
  admitMerges(root, verdicts, resolve);
  const all = [...verdicts.values()];
  return {base, head, judged: all.length,
    admitted: all.filter((verdict) => verdict.paths.length > 0 && !verdict.problem)
      .map((verdict) => ({commit: verdict.sha, admission: verdict.admission,
        coveredBy: verdict.coveredBy || null})),
    refused: all.filter((verdict) => verdict.problem).map((verdict) => refusal(root, verdict))};
}

// The push gate's entry: `node scripts/solve/guards.js admit --base <remote
// main sha> --head <pushed main sha> [--json]`, from the repository root. It
// is this owner's own, so the gate's closure holds the guard and not land.
const ADMIT_COMMAND = 'admit';
const ADMIT_FLAG = Object.freeze({BASE: '--base', HEAD: '--head', JSON: '--json'});
const ADMIT_EXIT = Object.freeze({ADMITTED: 0, REFUSED: 1, USAGE: 2});
const ADMIT_TEXT = Object.freeze({
  USAGE: 'usage: node scripts/solve/guards.js admit --base <remote main sha> ' +
    '--head <pushed main sha> [--json]',
  // The verdict line the push gate requires, naming exactly the judged range.
  VERDICT: 'solver-landing admission: ',
  ADMITTED: 'admitted',
  REFUSED: 'refused',
  PATHS: `    ${SURFACE_LABEL} paths (`,
  PATHS_CLOSE: '): ',
  MORE_PREFIX: ' (+',
  MORE_SUFFIX: ' more)',
  BULLET: '- ',
  INDENT: '    ',
  REMEDY: `A ${SURFACE_LABEL} change reaches main only through ` + '`solve land` ' +
    '(docs/steering/workflow-guidelines/solver-quests.md).',
});
const ADMIT_ARGUMENT_OFFSET = 2;
const LIST_JOIN = ', ';
const JSON_INDENT = 2;
const RANGE_JOIN = '..';

function flagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? null : argv[index + 1] || null;
}

function refusalLines(entry) {
  const withheld = entry.pathCount - entry.paths.length;
  return [`${ADMIT_TEXT.BULLET}${entry.commit} ${entry.subject}`,
    `${ADMIT_TEXT.INDENT}${entry.reason}`,
    `${ADMIT_TEXT.PATHS}${entry.pathCount}${ADMIT_TEXT.PATHS_CLOSE}` +
      `${entry.paths.join(LIST_JOIN)}` +
      (withheld > 0 ? `${ADMIT_TEXT.MORE_PREFIX}${withheld}${ADMIT_TEXT.MORE_SUFFIX}` : '')];
}

/**
 * The admission as a command: exit 0 admitted, 1 refused (each commit named
 * with its surface paths and why, on stderr), 2 usage. Without --json the first
 * line is the verdict: `solver-landing admission: admitted|refused <base>..<head>`.
 * @param {string[]} argv
 * @param {string} [root]
 * @return {number}
 */
function runAdmissionCli(argv, root = process.cwd()) {
  const base = flagValue(argv, ADMIT_FLAG.BASE);
  const head = flagValue(argv, ADMIT_FLAG.HEAD);
  if (argv[0] !== ADMIT_COMMAND || !base || !head) {
    process.stderr.write(`${ADMIT_TEXT.USAGE}${LINE_SEPARATOR}`);
    return ADMIT_EXIT.USAGE;
  }
  const verdict = (word) => `${ADMIT_TEXT.VERDICT}${word} ${base}${RANGE_JOIN}${head}`;
  const problem = rangeProblem(root, base, head);
  const result = problem ? null : mainAdmission(root, {base, head});
  if (problem || result.refused.length > 0) {
    process.stderr.write([verdict(ADMIT_TEXT.REFUSED),
      ...(problem ? [`${ADMIT_TEXT.INDENT}${problem}`] : result.refused.flatMap(refusalLines)),
      ADMIT_TEXT.REMEDY, ''].join(LINE_SEPARATOR));
    return ADMIT_EXIT.REFUSED;
  }
  process.stdout.write(`${argv.includes(ADMIT_FLAG.JSON) ?
    JSON.stringify(result, null, JSON_INDENT) : verdict(ADMIT_TEXT.ADMITTED)}${LINE_SEPARATOR}`);
  return ADMIT_EXIT.ADMITTED;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runAdmissionCli(process.argv.slice(ADMIT_ARGUMENT_OFFSET));
}

export {
  SOLVE_PREFIX, approvalProblems, canonicalImportGraphProblem,
  changedPaths, coupledPairProblems, epicScopeProblems, git, headSha, readVerificationRecord,
  requiresVerification, stageablePaths, stagedSourceChange, staticQualityProblems,
  verificationRecordProblems, workingChangeSet, workingTreeReader,
};
