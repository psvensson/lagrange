#!/usr/bin/env node
/**
 * Durable proof authority.
 *
 * A content proof is a fact about an immutable Git commit, not about the
 * workflow, host, or moment that happened to establish it.  This owner answers
 * one question for every consumer: has a registered proof contract already
 * been satisfied for this exact commit?
 *
 * Permanent receipts live outside normal source history as one Git ref per
 * (proof contract, subject SHA):
 *
 *   refs/lagrange-proofs/<proof-id>/<40-char-sha>
 *
 * Each ref points to an annotated tag object whose target is the proven commit
 * and whose message is the receipt.  There is no mutable ledger file and no
 * workflow-run-retention dependency.  A normal Git push can create a missing
 * receipt but cannot rewrite an existing non-commit ref without force.
 *
 * Only proofs registered as immutable-SHA proofs may be recorded permanently.
 * Checks whose truth depends on external state (registry credentials,
 * availability, current service policy, etc.) are deliberately not permanent
 * receipts merely because they once passed.
 */

import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

import {spawnGit} from './checks/git-invocation.js';
import {CONVERGENCE_PROBES_SHARD_PATH} from './checks/test-primary-classification-constants.js';
import {isTestCensusPath} from './checks/test-primary-classification.js';
import {computeReleaseProofIdentity} from './release-proof-identity.js';
import {
  EXECUTION_PROBLEM, describeCheckout, executionReportProblems, readExecutionReport,
} from './test-execution-report.js';
import {ACTION, authorizeAction, isAuthorized} from './action-authority.js';
import {
  CONTRACTS, EMPTY_TEXT, IDENTITY_REF_SEGMENT, OBJECT_TYPE_COMMIT, OUTCOME,
  PARSE_KIND_ABSENT, PARSE_KIND_PRESENT, PROOF, RECEIPT_IDENTITY_MISMATCH,
  RECEIPT_OUTCOME_PASSED, RECEIPT_PROBLEM_SEPARATOR, RECEIPT_REF_ROOT, RECEIPT_SCHEMA,
  RESOLUTION, REUSE,
  contractFor, evaluateReceipt, identityRef, parseLsRemote, proofRef, receiptTagName,
  registeredProofs, text, validSha,
} from './proof-receipt-contract.js';

const DEFAULT_REMOTE = 'origin';
const ZERO_SHA = '0'.repeat(40);

const GIT_STATUS_UNKNOWN = 'unknown';
const GIT_FLAG_DELETE = '-d';
const GIT_COMMAND_UPDATE_REF = 'update-ref';
const GIT_COMMAND_PUSH = 'push';
const SPAWN_ENCODING_UTF8 = 'utf8';
const STDIO_MODE_IGNORE = 'ignore';
const STDIO_MODE_PIPE = 'pipe';
const TAG_HEADER_TYPE_LINE = 'type commit';
const RECORD_REFUSED = 'proof-record-refused';
const RECORD_REFUSED_NAME = 'ProofRecordRefused';
const REPORT_DIGEST = Object.freeze({ALGORITHM: 'sha256', ENCODING: 'hex'});
const IDENTITY_UNVERIFIABLE =
  'the recorder is not in a clean checkout of the subject: its identity is unverifiable';
const RECEIPT_MESSAGE_NEWLINE = '\n';

const SUBJECT_NOT_FULL_SHA = 'subject is not a full commit SHA';
const SUBJECT_NOT_COMMIT = 'proof subject is not an available commit object';

const FLAG_JSON = '--json';
const FLAG_REMOTE = '--remote';
const FLAG_PRODUCER_KIND = '--producer-kind';
const FLAG_PRODUCER_ID = '--producer-id';
const FLAG_PRODUCER_URL = '--producer-url';
const FLAG_REPORT = '--report';
const EXIT_REFUSED = 3;
const COMMAND_CHECK = 'check';
const COMMAND_RECORD = 'record';
const COMMAND_REF = 'ref';
const USAGE_TEXT =
  'usage: proof-authority.js <check|record|index|ref> <proof-id> <full-sha> ' +
  '[--remote name] [--json] [--report execution-report.json]\n';

const COMMAND_INDEX = 'index';
const IDENTITY_NEEDS_CHECKOUT =
  'release proof identity needs the subject commit checked out in a clean tree';

// The identity of the tree at cwd, only when cwd has the subject commit
// checked out: an identity computed from some other tree proves nothing
// about the subject.
function checkedOutIdentity({sha, cwd, git}) {
  const head = git(['rev-parse', 'HEAD'], {cwd});
  if (head.status !== 0 || text(head.stdout) !== sha) return null;
  const top = git(['rev-parse', '--show-toplevel'], {cwd});
  if (top.status !== 0) return null;
  // The identity is of the COMMIT's bytes: a working tree with edits outside
  // Solver records is not that commit, and answers nothing.
  const status = git(['status', '--porcelain', '--untracked-files=no', '--', '.', ':!solve/'],
    {cwd: text(top.stdout)});
  if (status.status !== 0 || text(status.stdout) !== EMPTY_TEXT) return null;
  return computeReleaseProofIdentity(text(top.stdout));
}

/**
 * The candidate a producer sets out to prove: the checkout at cwd, its tree,
 * whether it is that commit's bytes, and its release proof identity. Taken
 * before anything runs, and carried by the execution report.
 * @param {{cwd?: string, git?: Function}} [options]
 * @return {{sha: string|null, tree: string|null, clean: boolean,
 *   identity: Object|null}}
 */
function describeCandidate({cwd = process.cwd(), git = runGit} = {}) {
  const checkout = describeCheckout(cwd);
  const identity = checkout.clean ? checkedOutIdentity({sha: checkout.head, cwd, git}) : null;
  return {sha: checkout.head, tree: checkout.tree, clean: identity !== null,
    identity: identity ? {algorithm: identity.algorithm, digest: identity.digest} : null};
}

function runGit(args, {cwd = process.cwd(), input = undefined} = {}) {
  return spawnGit(args, {
    cwd,
    encoding: SPAWN_ENCODING_UTF8,
    input,
    stdio: input === undefined ?
      [STDIO_MODE_IGNORE, STDIO_MODE_PIPE, STDIO_MODE_PIPE] :
      [STDIO_MODE_PIPE, STDIO_MODE_PIPE, STDIO_MODE_PIPE],
  });
}

function gitFailure(result) {
  return text(result?.stderr) || text(result?.stdout) ||
    `git exited with status ${result?.status ?? GIT_STATUS_UNKNOWN}`;
}

/**
 * Resolve a permanent proof from its authoritative Git ref.
 * @return {{outcome: string, proofId?: string, subjectSha?: string,
 *   objectSha?: string, receipt?: Object, because?: string}}
 */
function unavailableProof(because) {
  return {outcome: OUTCOME.UNAVAILABLE, because};
}

function registrationProblem(proofId, sha) {
  const contract = contractFor(proofId);
  if (!contract) return `unregistered proof contract: ${proofId}`;
  if (contract.reuse !== REUSE.IMMUTABLE_SHA) {
    return `proof contract ${proofId} is not permanently reusable`;
  }
  if (!validSha(sha)) return SUBJECT_NOT_FULL_SHA;
  return EMPTY_TEXT;
}

function resolveProof({proofId, sha, remote = DEFAULT_REMOTE, cwd = process.cwd(), git = runGit}) {
  const registered = registrationProblem(proofId, sha);
  if (registered) {
    return unavailableProof(registered);
  }
  const exact = cataloguedProof({proofId, sha, remote, cwd, git});
  if (exact.outcome !== OUTCOME.UNPROVEN) return exact;
  // A contract that is not identity-reusable is answered by its own commit's
  // receipt alone: no sibling may lend it.
  if (contractFor(proofId).identityReuse !== true) return exact;
  return identityCataloguedProof({proofId, sha, remote, cwd, git});
}

// A commit without its own receipt is still proven when a receipt exists for
// the same release proof identity: the same shipped logic, proven under
// another version string. Only a checkout of the subject can say what its
// identity is; anywhere else the answer stays unproven, never guessed. One
// decision per step, the same ladder as the exact lookup.
function identityCataloguedProof({proofId, sha, remote, cwd, git}) {
  const identity = checkedOutIdentity({sha, cwd, git});
  if (!identity) return {outcome: OUTCOME.UNPROVEN, proofId, subjectSha: sha};
  return remoteIdentityProof({proofId, sha, remote, cwd, git, identity});
}

function remoteIdentityProof({proofId, sha, remote, cwd, git, identity}) {
  const ref = identityRef(proofId, identity.digest);
  const listed = git(['ls-remote', '--refs', remote, ref], {cwd});
  if (listed.status !== 0) {
    return unavailableProof(`proof store lookup failed: ${gitFailure(listed)}`);
  }
  return matchedIdentityProof({proofId, sha, remote, cwd, git, identity, ref, listed});
}

function matchedIdentityProof({proofId, sha, remote, cwd, git, identity, ref, listed}) {
  const match = parseLsRemote(listed.stdout, ref);
  if (match.kind === PARSE_KIND_ABSENT) {
    return {outcome: OUTCOME.UNPROVEN, proofId, subjectSha: sha, identity};
  }
  if (match.kind !== PARSE_KIND_PRESENT) return unavailableProof(match.because);
  return fetchedIdentityProof({proofId, sha, remote, cwd, git, identity, ref,
    objectSha: match.objectSha});
}

function fetchedIdentityProof({proofId, sha, remote, cwd, git, identity, ref, objectSha}) {
  const fetched = git(['fetch', '--quiet', '--no-tags', remote, ref], {cwd});
  if (fetched.status !== 0) {
    return unavailableProof(`proof object fetch failed: ${gitFailure(fetched)}`);
  }
  return materializedIdentityProof({proofId, sha, cwd, git, identity, objectSha});
}

function materializedIdentityProof({proofId, sha, cwd, git, identity, objectSha}) {
  const typed = git(['cat-file', '-t', objectSha], {cwd});
  if (typed.status !== 0) {
    return unavailableProof(`proof object type unavailable: ${gitFailure(typed)}`);
  }
  const body = git(['cat-file', '-p', objectSha], {cwd});
  if (body.status !== 0) {
    return unavailableProof(`proof object unavailable: ${gitFailure(body)}`);
  }
  return evaluateReceipt({
    proofId, sha, objectSha, objectType: text(typed.stdout),
    objectBody: body.stdout, identity,
  });
}

function cataloguedProof({proofId, sha, remote, cwd, git}) {
  let ref;
  try {
    ref = proofRef(proofId, sha);
  } catch (error) {
    return {outcome: OUTCOME.UNAVAILABLE, because: error.message};
  }
  return remoteCataloguedProof({proofId, sha, ref, remote, cwd, git});
}

function remoteCataloguedProof({proofId, sha, ref, remote, cwd, git}) {
  const listed = git(['ls-remote', '--refs', remote, ref], {cwd});
  if (listed.status !== 0) {
    return unavailableProof(`proof store lookup failed: ${gitFailure(listed)}`);
  }
  return matchedCataloguedProof({proofId, sha, ref, remote, cwd, git, listed});
}

function matchedCataloguedProof({proofId, sha, ref, remote, cwd, git, listed}) {
  const match = parseLsRemote(listed.stdout, ref);
  if (match.kind === PARSE_KIND_ABSENT) {
    return {outcome: OUTCOME.UNPROVEN, proofId, subjectSha: sha};
  }
  if (match.kind !== PARSE_KIND_PRESENT) {
    return unavailableProof(match.because);
  }
  return verifiedProofObject({proofId, sha, remote, cwd, git, objectSha: match.objectSha});
}

function verifiedProofObject({proofId, sha, remote, cwd, git, objectSha}) {
  const ref = proofRef(proofId, sha);
  const fetched = git(['fetch', '--quiet', '--no-tags', remote, ref], {cwd});
  if (fetched.status !== 0) {
    return unavailableProof(`proof object fetch failed: ${gitFailure(fetched)}`);
  }
  return materializedProofObject({proofId, sha, cwd, git, objectSha});
}

function materializedProofObject({proofId, sha, cwd, git, objectSha}) {
  const typed = git(['cat-file', '-t', objectSha], {cwd});
  if (typed.status !== 0) {
    return unavailableProof(`proof object type unavailable: ${gitFailure(typed)}`);
  }
  const body = git(['cat-file', '-p', objectSha], {cwd});
  if (body.status !== 0) {
    return unavailableProof(`proof object unavailable: ${gitFailure(body)}`);
  }
  return evaluateReceipt({
    proofId,
    sha,
    objectSha,
    objectType: text(typed.stdout),
    objectBody: body.stdout,
  });
}

const PRODUCER_KIND_GITHUB_ACTIONS = 'github-actions';
const PRODUCER_KIND_LOCAL_CLI = 'local-cli';

function defaultProducer(producer = {}, env = process.env) {
  const isCi = env?.GITHUB_ACTIONS === 'true';
  let defaults;
  if (isCi) {
    const workflow = env?.GITHUB_WORKFLOW || 'workflow';
    const runId = env?.GITHUB_RUN_ID || 'run';
    const attempt = env?.GITHUB_RUN_ATTEMPT || '1';
    defaults = {
      kind: PRODUCER_KIND_GITHUB_ACTIONS,
      id: `${workflow}:${runId}:${attempt}`,
    };
    if (env?.GITHUB_SERVER_URL && env?.GITHUB_REPOSITORY && env?.GITHUB_RUN_ID) {
      defaults.url =
        `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
    }
  } else {
    defaults = {
      kind: PRODUCER_KIND_LOCAL_CLI,
      id: `pid-${process.pid}`,
    };
  }

  const attributable = {...defaults};
  if (producer && typeof producer === 'object') {
    for (const [key, value] of Object.entries(producer)) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        attributable[key] = value;
      }
    }
  }
  return attributable;
}

function buildReceipt({
  proofId,
  sha,
  completedAt = new Date().toISOString(),
  producer = {},
  identity = null,
  execution = null,
  env = process.env,
}) {
  const attributableProducer = defaultProducer(producer, env);
  return Object.freeze({
    schema: RECEIPT_SCHEMA,
    proofId,
    subjectSha: sha,
    outcome: RECEIPT_OUTCOME_PASSED,
    reuse: REUSE.IMMUTABLE_SHA,
    completedAt,
    producer: Object.freeze({...attributableProducer}),
    ...(identity ? {identity: Object.freeze({
      algorithm: identity.algorithm, digest: identity.digest,
    })} : {}),
    ...(execution ? {execution: Object.freeze({...execution})} : {}),
  });
}

/**
 * A recording the authority refused: the typed problems of its execution
 * report. Nothing was written.
 */
class ProofRecordRefused extends Error {
  constructor(proofId, sha, problems) {
    super(`${RECORD_REFUSED}: ${proofId} ${sha}: ${problems.map((entry) =>
      `${entry.code} (${entry.detail})`).join(RECEIPT_PROBLEM_SEPARATOR)}`);
    this.name = RECORD_REFUSED_NAME;
    this.code = RECORD_REFUSED;
    this.problems = problems;
  }
}

function subjectTree({sha, cwd, git}) {
  const tree = git(['rev-parse', '--verify', '--quiet', `${sha}^{tree}`], {cwd});
  return tree.status === 0 ? text(tree.stdout) : null;
}

const GIT_LS_TREE_ARGS = Object.freeze(['ls-tree', '-r', '--name-only']);
const GIT_SHOW_COMMAND = 'show';
const POSIX_SLASH = '/';
const [TEST_TREE_ROOT] = CONVERGENCE_PROBES_SHARD_PATH.split(POSIX_SLASH);
const SHARD_COMMENT_PREFIX = '#';
const SUBJECT_CORPUS_UNREADABLE = 'subject-corpus-unreadable';

function readConvergenceProbes({sha, entries, cwd, git}) {
  if (!entries.includes(CONVERGENCE_PROBES_SHARD_PATH)) {
    return new Set();
  }
  const shard = git([GIT_SHOW_COMMAND, `${sha}:${CONVERGENCE_PROBES_SHARD_PATH}`], {cwd});
  if (shard.status !== 0) return null;
  return new Set(text(shard.stdout).split(RECEIPT_MESSAGE_NEWLINE)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(SHARD_COMMENT_PREFIX)));
}

function subjectCorpusFiles({sha, cwd, git = runGit}) {
  const listed = git([...GIT_LS_TREE_ARGS, sha, TEST_TREE_ROOT], {cwd});
  const entries = listed.status === 0 ?
    text(listed.stdout).split(RECEIPT_MESSAGE_NEWLINE).map((line) => line.trim()).filter(Boolean) :
    null;
  const probes = entries === null ? null : readConvergenceProbes({sha, entries, cwd, git});
  if (entries === null || probes === null) {
    return {ok: false, reason: SUBJECT_CORPUS_UNREADABLE, files: []};
  }
  return {
    ok: true,
    files: entries.filter((entry) => isTestCensusPath(entry) && !probes.has(entry)),
  };
}

function citesWholeCorpus(report, contract) {
  return Array.isArray(report?.reusedProofs) &&
    contract.citableProofs.includes(PROOF.CORPUS_FULL) &&
    report.reusedProofs.some((cited) => cited?.proofId === PROOF.CORPUS_FULL);
}

function requiredCorpusFiles({sha, contract, report, cwd, git}) {
  if (!report || typeof report !== 'object' || Array.isArray(report) ||
      citesWholeCorpus(report, contract)) {
    return {ok: true, files: []};
  }
  return subjectCorpusFiles({sha, cwd, git});
}

// A proof the report says it reused must be one the contract's seal lets it
// cite, and must resolve now, for this very commit (never through a sibling's
// release identity), to the very receipt object it cited.
function reusedProofProblems({report, sha, contract, remote, cwd, git}) {
  const problems = [];
  for (const cited of report.reusedProofs) {
    if (!contract.citableProofs.includes(cited?.proofId)) {
      problems.push({code: EXECUTION_PROBLEM.REUSED_PROOF_NOT_CITABLE,
        detail: String(cited?.proofId)});
      continue;
    }
    const resolved = resolveProof({proofId: cited.proofId, sha, remote, cwd, git});
    if (resolved?.outcome !== OUTCOME.PROVEN || resolved.resolution !== RESOLUTION.EXACT_SHA ||
      resolved.objectSha !== cited?.objectSha) {
      problems.push({code: EXECUTION_PROBLEM.REUSED_PROOF_UNPROVEN,
        detail: `${cited?.proofId} ${cited?.objectSha}: ${resolved.outcome}`});
    }
  }
  return problems;
}

/**
 * Validate the execution report a passing receipt would rest on, and answer
 * the receipt's execution record. Refuses (throws ProofRecordRefused) on any
 * problem: absent, partial, another candidate, a failed command, a failed,
 * skipped or zero-assertion file, a truncated run, a retry the contract's
 * sealed policy does not admit, or a cited proof that does not resolve.
 * @return {Object} the receipt's execution record
 */
function validatedExecution({proofId, sha, contract, report, remote, cwd, git}) {
  const identity = contract.identityReuse === true ? checkedOutIdentity({sha, cwd, git}) : null;
  // An identity-reusable proof is recorded only where the subject's identity
  // can be computed: a clean checkout of it. Elsewhere the report's identity
  // cannot be checked, and an unchecked identity is never admitted.
  const unverifiable = contract.identityReuse === true && identity === null ?
    [{code: EXECUTION_PROBLEM.IDENTITY_MISMATCH, detail: IDENTITY_UNVERIFIABLE}] : [];
  const corpus = requiredCorpusFiles({sha, contract, report, cwd, git});
  const corpusProblems = corpus.ok ? [] :
    [{code: EXECUTION_PROBLEM.PLANNED_FILE_NOT_EXECUTED, detail: corpus.reason}];
  const checked = executionReportProblems(report, {sha, tree: subjectTree({sha, cwd, git}),
    identity, requiredFiles: corpus.files});
  const problems = checked.summary ?
    [...unverifiable, ...corpusProblems, ...checked.problems,
      ...reusedProofProblems({report, sha, contract, remote, cwd, git})] :
    checked.problems;
  if (problems.length > 0) throw new ProofRecordRefused(proofId, sha, problems);
  return {
    reportDigest: createHash(REPORT_DIGEST.ALGORITHM).update(JSON.stringify(report))
      .digest(REPORT_DIGEST.ENCODING),
    producer: {...report.producer},
    summary: checked.summary,
  };
}

// Publish the identity ref for a receipt object. First receipt for an
// identity wins; a later one is simply not indexed (its exact ref stands).
function publishIdentityRef({proofId, identity, objectSha, remote, cwd, git, now}) {
  const finalRef = identityRef(proofId, identity.digest);
  const tempRef = `${RECEIPT_REF_ROOT}-stage/${IDENTITY_REF_SEGMENT}-${process.pid}-${now}`;
  const staged = git([GIT_COMMAND_UPDATE_REF, tempRef, objectSha, ZERO_SHA], {cwd});
  if (staged.status !== 0) return false;
  try {
    return git([GIT_COMMAND_PUSH, remote, `${tempRef}:${finalRef}`], {cwd}).status === 0;
  } finally {
    git([GIT_COMMAND_UPDATE_REF, GIT_FLAG_DELETE, tempRef], {cwd});
  }
}

function buildTagBody({proofId, sha, receipt, now = Date.now()}) {
  const seconds = Math.floor(now / 1000);
  return [
    `object ${sha}`,
    TAG_HEADER_TYPE_LINE,
    `tag ${receiptTagName(proofId, sha)}`,
    `tagger Lagrange Proof Authority <proof-authority@lagrange.invalid> ${seconds} +0000`,
    '',
    JSON.stringify(receipt),
    '',
  ].join(RECEIPT_MESSAGE_NEWLINE);
}

/**
 * Persist a successful permanent proof.  Recording is idempotent.  An existing
 * valid receipt wins; an existing malformed receipt fails closed rather than
 * being replaced.
 */
function recordProof({
  proofId,
  sha,
  remote = DEFAULT_REMOTE,
  cwd = process.cwd(),
  producer = {},
  completedAt = new Date().toISOString(),
  now = Date.now(),
  git = runGit,
  env = process.env,
  report,
}) {
  const contract = contractFor(proofId);
  if (!contract || contract.reuse !== REUSE.IMMUTABLE_SHA) {
    throw new Error(`proof contract is not permanently recordable: ${proofId}`);
  }
  if (!validSha(sha)) throw new Error(SUBJECT_NOT_FULL_SHA);
  // The pass is the report's to prove, never the caller's control flow.
  const execution = validatedExecution({proofId, sha, contract, report, remote, cwd, git});

  const authorization = authorizeAction({action: ACTION.RECORD_PROOF, signal: null});
  if (!isAuthorized(authorization)) {
    throw new Error(`recording proof is refused: ${authorization.because || authorization.requires}`);
  }

  const existing = resolveProof({proofId, sha, remote, cwd, git});
  if (existing.outcome === OUTCOME.PROVEN) return {...existing, reused: true};
  if (existing.outcome === OUTCOME.UNAVAILABLE) {
    throw new Error(`proof store unavailable: ${existing.because}`);
  }

  const commitType = git(['cat-file', '-t', sha], {cwd});
  if (commitType.status !== 0 ||
      text(commitType.stdout) !== OBJECT_TYPE_COMMIT) {
    throw new Error(SUBJECT_NOT_COMMIT);
  }

  const identity = contract.identityReuse === true ?
    checkedOutIdentity({sha, cwd, git}) : null;
  const receipt = buildReceipt({proofId, sha, completedAt, producer, identity, execution, env});
  const tagBody = buildTagBody({proofId, sha, receipt, now});
  const made = git(['mktag'], {cwd, input: tagBody});
  if (made.status !== 0 || !validSha(text(made.stdout))) {
    throw new Error(`could not create proof receipt object: ${gitFailure(made)}`);
  }
  const objectSha = text(made.stdout);
  const finalRef = proofRef(proofId, sha);
  const tempRef = `${RECEIPT_REF_ROOT}-stage/${process.pid}-${now}`;
  const staged = git([GIT_COMMAND_UPDATE_REF, tempRef, objectSha, ZERO_SHA], {cwd});
  if (staged.status !== 0) {
    throw new Error(`could not stage proof receipt: ${gitFailure(staged)}`);
  }
  try {
    const pushed = git([GIT_COMMAND_PUSH, remote, `${tempRef}:${finalRef}`], {cwd});
    if (pushed.status !== 0) {
      const raced = resolveProof({proofId, sha, remote, cwd, git});
      if (raced.outcome === OUTCOME.PROVEN) return {...raced, reused: true};
      throw new Error(`could not persist proof receipt: ${gitFailure(pushed)}`);
    }
  } finally {
    git([GIT_COMMAND_UPDATE_REF, GIT_FLAG_DELETE, tempRef], {cwd});
  }

  const recorded = resolveProof({proofId, sha, remote, cwd, git});
  if (recorded.outcome !== OUTCOME.PROVEN) {
    throw new Error(`persisted proof did not verify: ${recorded.because || recorded.outcome}`);
  }
  if (identity) {
    publishIdentityRef({proofId, identity, objectSha, remote, cwd, git, now});
  }
  return {...recorded, reused: false};
}

/**
 * Index an existing exact receipt under the release proof identity it
 * carries (the subject commit must be checked out at cwd). Idempotent; an
 * existing identity ref is kept.
 */
// The exact receipt an identity may be published for: proven and carrying
// this identity. Missing fields are never reconstructed from the checkout.
function indexableReceipt({proofId, sha, remote, cwd, git, identity}) {
  const exact = cataloguedProof({proofId, sha, remote, cwd, git});
  if (exact.outcome !== OUTCOME.PROVEN) {
    throw new Error(`no exact receipt to index: ${exact.because || exact.outcome}`);
  }
  const carried = exact.receipt?.identity;
  if (carried?.algorithm !== identity.algorithm || carried?.digest !== identity.digest) {
    throw new Error(RECEIPT_IDENTITY_MISMATCH);
  }
  return exact;
}

function existingIdentityObject({proofId, identity, remote, cwd, git}) {
  const ref = identityRef(proofId, identity.digest);
  const listed = git(['ls-remote', '--refs', remote, ref], {cwd});
  if (listed.status !== 0) return null;
  const match = parseLsRemote(listed.stdout, ref);
  return match.kind === PARSE_KIND_PRESENT ? match.objectSha : null;
}

function indexProof({
  proofId, sha, remote = DEFAULT_REMOTE, cwd = process.cwd(), now = Date.now(), git = runGit,
}) {
  const identity = checkedOutIdentity({sha, cwd, git});
  if (!identity) throw new Error(IDENTITY_NEEDS_CHECKOUT);
  const exact = indexableReceipt({proofId, sha, remote, cwd, git, identity});
  const existing = existingIdentityObject({proofId, identity, remote, cwd, git});
  if (existing) return {...exact, identity, indexed: false, indexedObject: existing};
  if (!publishIdentityRef({proofId, identity, objectSha: exact.objectSha, remote, cwd, git, now})) {
    throw new Error(`could not persist identity ref ${identityRef(proofId, identity.digest)}`);
  }
  return {...exact, identity, indexed: true, indexedObject: exact.objectSha};
}

// Valued flags: where each value lands, and what an absent value becomes.
const VALUED_FLAGS = Object.freeze({
  [FLAG_REMOTE]: (options, value) => {
    options.remote = value || DEFAULT_REMOTE;
  },
  [FLAG_PRODUCER_KIND]: (options, value) => {
    options.producer.kind = value || EMPTY_TEXT;
  },
  [FLAG_PRODUCER_ID]: (options, value) => {
    options.producer.id = value || EMPTY_TEXT;
  },
  [FLAG_PRODUCER_URL]: (options, value) => {
    options.producer.url = value || EMPTY_TEXT;
  },
  [FLAG_REPORT]: (options, value) => {
    options.reportFile = value || EMPTY_TEXT;
  },
});

function parseCli(argv) {
  const [command, proofId, sha, ...rest] = argv;
  const options = {command, proofId, sha, remote: DEFAULT_REMOTE, json: false, producer: {}};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === FLAG_JSON) options.json = true;
    else if (Object.hasOwn(VALUED_FLAGS, arg)) VALUED_FLAGS[arg](options, rest[++index]);
  }
  return options;
}

function render(result, json) {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  if (result.outcome === OUTCOME.PROVEN) {
    const via = result.resolution === RESOLUTION.RELEASE_CONTENT_IDENTITY ?
      ` (release content identity of ${result.provenBy})` : '';
    return `PROVEN ${result.proofId} ${result.subjectSha} ${result.objectSha}${via}\n`;
  }
  return `${result.outcome.toUpperCase()} ${result.because || ''}\n`;
}

// A refused record is a typed answer, not a crash: its problems on stderr.
function runRecord(options, write) {
  const report = options.reportFile ? readExecutionReport(options.reportFile) : null;
  try {
    write(render(recordProof({...options, report}), options.json));
    return 0;
  } catch (error) {
    if (error?.code !== RECORD_REFUSED) throw error;
    process.stderr.write(`${error.message}\n`);
    return EXIT_REFUSED;
  }
}

function runCli(argv = process.argv.slice(2), write = (value) => process.stdout.write(value)) {
  const options = parseCli(argv);
  if (options.command === COMMAND_CHECK) {
    const result = resolveProof(options);
    write(render(result, options.json));
    if (result.outcome === OUTCOME.PROVEN) return 0;
    if (result.outcome === OUTCOME.UNPROVEN) return 1;
    return 2;
  }
  if (options.command === COMMAND_RECORD) {
    return runRecord(options, write);
  }
  if (options.command === COMMAND_INDEX) {
    const result = indexProof(options);
    write(render(result, options.json));
    return 0;
  }
  if (options.command === COMMAND_REF) {
    write(`${proofRef(options.proofId, options.sha)}\n`);
    return 0;
  }
  write(USAGE_TEXT);
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runCli();
}

// The canary's question, narrowed to a boolean: does a whole-corpus receipt
// exist for this exact commit? A lookup, never a recorder. The contract is not
// identity-reusable, so this resolves through the remote's exact ref alone and
// no sibling commit's receipt can answer for another.
function resolveCorpusProof({sha, remote = DEFAULT_REMOTE, cwd = process.cwd(),
  git = runGit}) {
  return resolveProof({proofId: PROOF.CORPUS_FULL, sha, remote, cwd, git})
    .outcome === OUTCOME.PROVEN;
}

const CORPUS_FULL_PROOF = PROOF.CORPUS_FULL;

export {
  CONTRACTS,
  CORPUS_FULL_PROOF,
  OUTCOME,
  PROOF,
  ProofRecordRefused,
  RECEIPT_REF_ROOT,
  RECEIPT_SCHEMA,
  RESOLUTION,
  REUSE,
  identityRef,
  indexProof,
  buildReceipt,
  buildTagBody,
  defaultProducer,
  describeCandidate,
  evaluateReceipt,
  proofRef,
  recordProof,
  registeredProofs,
  resolveCorpusProof,
  resolveProof,
  runCli,
  subjectCorpusFiles,
};
