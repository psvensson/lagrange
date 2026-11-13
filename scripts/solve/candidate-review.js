// The reviewed candidate: changed content, acceptance and its declared proof
// inputs. Ordinary log observations are not acceptance inputs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {LOG_FILE, QUEST_FILE, QUESTS_DIR, VERDICT, validAssignmentPath} from './schema.js';
import {readLog, verdictOf} from './store.js';
import {requiredProofArtifacts} from './probes.js';
import {changedPaths, git, headSha, latestAssignment, requiresVerification} from './guards.js';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const TEXT_ENCODING = 'utf8';
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const PATH_SEPARATOR = '/';
const EXECUTABLE_BITS = 0o111;
const MISSING_FILE = 'ENOENT';
const RECEIPT_SCHEMA = 'test-receipt/1';
const PATH_LIST_SEPARATOR = '\0';
const LIST_SEPARATOR = ', ';
const GIT_HEAD_PATH_PREFIX = 'HEAD:';
const GIT_ARGUMENTS = Object.freeze({
  SHOW: Object.freeze(['show']),
  RESOLVE: Object.freeze(['rev-parse', '--verify']),
  HASH_CONTENT: Object.freeze(['hash-object', '--stdin']),
  DIFF_NAMES: Object.freeze(['diff', '--no-renames', '--name-only', '-z']),
  WRITE_TREE: Object.freeze(['write-tree']),
});
const INPUT_IDENTITY = Object.freeze({
  INVALID: 'invalid-path', NOT_FILE: 'not-file', MISSING: 'missing',
});
const INPUT_PROBLEM = Object.freeze({
  UNSAFE: 'unsafe or external path', NOT_FILE: 'not a regular file',
  NOT_RECEIPT: 'not a test receipt',
});
const MESSAGE = Object.freeze({
  REJECTION: 'the newest verification is a rejection and no attempt is newer than it',
  MISSING: 'source or proof changes need a verification entry (verifier subagent:<id>)',
  STALE: 'source or proof changes need a verification entry newer than the last attempt',
  NOT_APPROVED: 'source or proof changes need an approving verification',
  DIGEST_MISSING: 'reviewed changes need a valid candidate digest on the approval and current candidate',
  CONTENT_MISMATCH: 'verification candidate digest does not match the reviewed candidate (reviewed content or proof input was mutated after verification)',
});

function pathsOutsideQuest(root, id) {
  const ownDirectory = `${QUESTS_DIR}/${id}/`;
  return changedPaths(root).filter((filePath) => !filePath.startsWith(ownDirectory));
}

function acceptanceContract(quest) {
  return {schema: quest.schema, id: quest.id, class: quest.class, epic: quest.epic,
    statement: quest.statement, doneWhen: quest.doneWhen,
    constraints: quest.constraints, verificationTemplates: quest.verificationTemplates};
}

function candidateReviewPaths(root, quest, paths) {
  const questPath = `${QUESTS_DIR}/${quest.id}/${QUEST_FILE}`;
  let original;
  try {
    original = JSON.parse(git(root, [...GIT_ARGUMENTS.SHOW, `${GIT_HEAD_PATH_PREFIX}${questPath}`],
      {allowFailure: true}));
  } catch {
    original = null;
  }
  if (!original || JSON.stringify(acceptanceContract(original)) !==
      JSON.stringify(acceptanceContract(quest))) {
    return [...paths, questPath];
  }
  return proofInputs(root, quest).some((input) => proofInputChanged(root, input)) ?
    [...paths, questPath] : paths;
}

function inputPath(root, relative) {
  if (!validAssignmentPath(relative) || relative.endsWith(PATH_SEPARATOR)) return null;
  const absolute = path.resolve(root, relative);
  try {
    const resolved = path.relative(fs.realpathSync(root), fs.realpathSync(absolute));
    return validAssignmentPath(resolved) ? absolute : null;
  } catch (error) {
    return error.code === MISSING_FILE ? absolute : null;
  }
}

function contentIdentity(root, relative) {
  if (!validAssignmentPath(relative)) return INPUT_IDENTITY.INVALID;
  const absolute = path.resolve(root, relative);
  try {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) return `symlink:${fs.readlinkSync(absolute)}`;
    if (!inputPath(root, relative)) return INPUT_IDENTITY.INVALID;
    if (!stat.isFile()) return INPUT_IDENTITY.NOT_FILE;
    const digest = crypto.createHash(HASH_ALGORITHM).update(fs.readFileSync(absolute))
      .digest(HASH_ENCODING);
    return `file:${stat.mode & EXECUTABLE_BITS}:${digest}`;
  } catch (error) {
    return error.code === MISSING_FILE ? INPUT_IDENTITY.MISSING : `unreadable:${error.code}`;
  }
}

function readProofInput(root, relative) {
  const absolute = inputPath(root, relative);
  if (!absolute) return {relative, problem: INPUT_PROBLEM.UNSAFE};
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return {relative, problem: INPUT_PROBLEM.NOT_FILE};
    const resolved = path.relative(fs.realpathSync(root), fs.realpathSync(absolute));
    const bytes = fs.readFileSync(absolute);
    const digest = crypto.createHash(HASH_ALGORITHM).update(bytes).digest(HASH_ENCODING);
    return {relative, resolved, bytes, identity: `${resolved}:${stat.mode & EXECUTABLE_BITS}:${digest}`};
  } catch (error) {
    return {relative, problem: error.code === MISSING_FILE ?
      INPUT_IDENTITY.MISSING : `unreadable: ${error.code}`};
  }
}

function proofInputChanged(root, input) {
  if (input.problem) return true;
  // A linked proof input needs review even if its current target is tracked:
  // HEAD's link blob alone does not establish the consumed target's identity.
  if (input.relative !== input.resolved || changedPaths(root).includes(input.relative)) return true;
  const previous = git(root, [...GIT_ARGUMENTS.RESOLVE, `${GIT_HEAD_PATH_PREFIX}${input.relative}`],
    {allowFailure: true}).trim();
  return previous !== git(root, [...GIT_ARGUMENTS.HASH_CONTENT], {input: input.bytes}).trim();
}

function receiptWitnesses(input) {
  if (input.problem) return {witnesses: [], problem: input.problem};
  try {
    const receipt = JSON.parse(input.bytes.toString(TEXT_ENCODING));
    if (receipt.schema !== RECEIPT_SCHEMA) return {witnesses: [], problem: INPUT_PROBLEM.NOT_RECEIPT};
    const witnesses = Object.keys(receipt.testFileDigests || {});
    for (const item of Array.isArray(receipt.receipts) ? receipt.receipts : []) {
      if (typeof item.testFile === 'string') witnesses.push(item.testFile);
    }
    return {witnesses};
  } catch (error) {
    // Raw artifact bytes remain bound. The probe owner decides whether an
    // artifact that cannot be decoded as a receipt measures its claim.
    return {witnesses: [], problem: error.message};
  }
}

function proofInputs(root, quest) {
  const artifacts = requiredProofArtifacts(quest.doneWhen)
    .map((relative) => readProofInput(root, relative));
  const witnesses = [...new Set(artifacts.flatMap((input) => receiptWitnesses(input).witnesses))];
  return [...artifacts, ...witnesses.map((relative) => readProofInput(root, relative))];
}

function proofInputProblems(root, quest) {
  return proofInputs(root, quest).filter((input) => input.problem)
    .map((input) => `proof input ${JSON.stringify(input.relative)}: ${input.problem}`);
}

function computeCandidateDigest(root, quest) {
  const proof = proofInputs(root, quest);
  if (proof.some((input) => input.problem)) return null;
  const hash = crypto.createHash(HASH_ALGORITHM);
  hash.update(`head:${headSha(root)}\n`);
  hash.update(`acceptance:${JSON.stringify(acceptanceContract(quest))}\n`);
  const log = readLog(root, quest.id);
  const assignment = latestAssignment(log);
  hash.update(`assignment:${JSON.stringify(assignment ? {
    entry: assignment, index: log.indexOf(assignment),
  } : null)}\n`);
  const inputs = new Set(pathsOutsideQuest(root, quest.id));
  for (const filePath of [...inputs].sort()) {
    hash.update(`input:${JSON.stringify([filePath, contentIdentity(root, filePath)])}\n`);
  }
  for (const input of proof.sort((left, right) => left.relative.localeCompare(right.relative))) {
    hash.update(`proof:${JSON.stringify([input.relative, input.identity])}\n`);
  }
  return hash.digest(HASH_ENCODING);
}

function stagedCandidateProblems(root, id, expectedTree) {
  const ownLog = `${QUESTS_DIR}/${id}/${LOG_FILE}`;
  const paths = git(root, [...GIT_ARGUMENTS.DIFF_NAMES])
    .split(PATH_LIST_SEPARATOR).filter((filePath) => filePath && filePath !== ownLog);
  if (expectedTree) {
    const tree = git(root, [...GIT_ARGUMENTS.WRITE_TREE]).trim();
    paths.push(...git(root, [...GIT_ARGUMENTS.DIFF_NAMES, expectedTree, tree])
      .split(PATH_LIST_SEPARATOR).filter((filePath) => filePath && filePath !== ownLog));
  }
  return paths.length > 0 ? [`staged candidate changed or differs from measured files: ${
    [...new Set(paths)].map((filePath) => JSON.stringify(filePath)).join(LIST_SEPARATOR)}`] : [];
}

function verificationProblems(state, paths, currentCandidateDigest) {
  const last = state.lastVerification;
  const current = state.verificationIsCurrent;
  const verdict = last && verdictOf(last);
  const problems = [];
  if (current && verdict === VERDICT.REJECT) problems.push(MESSAGE.REJECTION);
  if (requiresVerification(paths)) {
    if (!last) problems.push(MESSAGE.MISSING);
    else if (!current) problems.push(MESSAGE.STALE);
    else if (verdict !== VERDICT.APPROVE) problems.push(MESSAGE.NOT_APPROVED);
    if (last && (!DIGEST_PATTERN.test(last.candidateDigest || '') ||
        !DIGEST_PATTERN.test(currentCandidateDigest || ''))) problems.push(MESSAGE.DIGEST_MISSING);
  }
  if (last?.candidateDigest && currentCandidateDigest &&
      last.candidateDigest !== currentCandidateDigest) {
    problems.push(`${MESSAGE.CONTENT_MISMATCH}: expected ${last.candidateDigest}, got ${currentCandidateDigest}`);
  }
  return problems;
}

export {
  candidateReviewPaths, computeCandidateDigest, pathsOutsideQuest, proofInputProblems,
  stagedCandidateProblems, verificationProblems,
};
