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

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {computeReleaseProofIdentity} from './release-proof-identity.js';

import {
  ACTION, authorizeAction, isAuthorized,
} from './action-authority.js';

const RECEIPT_SCHEMA = 'lagrange-proof-receipt/v1';
const RECEIPT_REF_ROOT = 'refs/lagrange-proofs';
const RECEIPT_TAG_ROOT = 'lagrange-proof';
const DEFAULT_REMOTE = 'origin';
const FULL_SHA = /^[0-9a-f]{40}$/u;
const PROOF_ID = /^[a-z0-9][a-z0-9._-]*$/u;
const ZERO_SHA = '0'.repeat(40);
const EMPTY_TEXT = '';

const GIT_BINARY = 'git';
const GIT_STATUS_UNKNOWN = 'unknown';
const GIT_FLAG_DELETE = '-d';
const GIT_COMMAND_UPDATE_REF = 'update-ref';
const GIT_COMMAND_PUSH = 'push';
const SPAWN_ENCODING_UTF8 = 'utf8';
const STDIO_MODE_IGNORE = 'ignore';
const STDIO_MODE_PIPE = 'pipe';
const OBJECT_TYPE_TAG = 'tag';
const OBJECT_TYPE_COMMIT = 'commit';
const TAG_HEADER_TYPE_LINE = 'type commit';
const RECEIPT_OUTCOME_PASSED = 'passed';
const RECEIPT_PROBLEM_SEPARATOR = '; ';
const RECEIPT_MESSAGE_NEWLINE = '\n';

const PARSE_KIND_ABSENT = 'absent';
const PARSE_KIND_INVALID = 'invalid';
const PARSE_KIND_PRESENT = 'present';
const MALFORMED_PROOF_REF = 'remote returned a malformed proof ref';

const TAG_HAS_NO_MESSAGE = 'annotated tag has no message';
const PROOF_REF_NOT_TAG = 'proof ref does not point to an annotated tag object';
const TAG_TARGET_MISMATCH = 'tag target does not equal subject SHA';
const TAG_TARGET_NOT_COMMIT = 'tag target is not a commit';
const TAG_IDENTITY_MISMATCH = 'tag identity does not equal proof identity';
const RECEIPT_SCHEMA_MISMATCH = 'receipt schema mismatch';
const RECEIPT_PROOF_ID_MISMATCH = 'receipt proof id mismatch';
const RECEIPT_SUBJECT_SHA_MISMATCH = 'receipt subject SHA mismatch';
const RECEIPT_NOT_A_PASS = 'receipt does not record a pass';
const RECEIPT_NOT_IMMUTABLE = 'receipt is not immutable-SHA reusable';
const RECEIPT_TIME_INVALID = 'receipt completion time is invalid';
const SUBJECT_NOT_FULL_SHA = 'subject is not a full commit SHA';
const SUBJECT_NOT_COMMIT = 'proof subject is not an available commit object';

const FLAG_JSON = '--json';
const FLAG_REMOTE = '--remote';
const FLAG_PRODUCER_KIND = '--producer-kind';
const FLAG_PRODUCER_ID = '--producer-id';
const FLAG_PRODUCER_URL = '--producer-url';
const COMMAND_CHECK = 'check';
const COMMAND_RECORD = 'record';
const COMMAND_REF = 'ref';
const USAGE_TEXT =
  'usage: proof-authority.js <check|record|index|ref> <proof-id> <full-sha> ' +
  '[--remote name] [--json]\n';

const REUSE = Object.freeze({
  IMMUTABLE_SHA: 'immutable-sha',
});
// How a PROVEN outcome was reached: the exact commit's own receipt, or a
// receipt for a commit with the same release proof identity (the shipped
// logic, version authorities masked - scripts/release-proof-identity.js).
const RESOLUTION = Object.freeze({
  EXACT_SHA: 'exact-sha',
  RELEASE_CONTENT_IDENTITY: 'release-content-identity',
});
const IDENTITY_REF_SEGMENT = 'identity';
const COMMAND_INDEX = 'index';
const RECEIPT_IDENTITY_MISMATCH = 'receipt identity does not match this tree';
const IDENTITY_NEEDS_CHECKOUT =
  'release proof identity needs the subject commit checked out in a clean tree';

const PROOF = Object.freeze({
  RELEASE_FULL: 'release-full-v1',
  CORPUS_FULL: 'corpus-full-v1',
});

const CONTRACTS = Object.freeze({
  [PROOF.RELEASE_FULL]: Object.freeze({
    reuse: REUSE.IMMUTABLE_SHA,
    // The shipped logic is what a release proves, so a commit that differs
    // only in the version authorities and the records the identity masks is
    // proven by its sibling's receipt.
    identityReuse: true,
    description: 'complete release proof for one immutable repository commit',
  }),
  // The whole behavioural corpus, green for one immutable commit. The local
  // push gate records it when its own full-corpus run passes, so the post-push
  // canary can tell a corpus already proved for this sha from one never run.
  //
  // No identity reuse: the corpus proves more than the shipped logic. Tests
  // read the bytes the release identity excludes or masks - release-notes
  // asserts a CHANGELOG section for package.json's version - and neither file
  // is a full-corpus trigger, so a changelog-only or version-bump commit would
  // otherwise inherit its parent's corpus receipt and skip a corpus that can
  // be red (verifier round 1).
  [PROOF.CORPUS_FULL]: Object.freeze({
    reuse: REUSE.IMMUTABLE_SHA,
    identityReuse: false,
    description: 'whole behavioural corpus green for one immutable commit',
  }),
});

const OUTCOME = Object.freeze({
  PROVEN: 'proven',
  UNPROVEN: 'unproven',
  UNAVAILABLE: 'unavailable',
});

function text(value) {
  return typeof value === 'string' ? value.trim() : EMPTY_TEXT;
}

function validSha(sha) {
  return FULL_SHA.test(text(sha));
}

function contractFor(proofId) {
  return Object.hasOwn(CONTRACTS, proofId) ? CONTRACTS[proofId] : null;
}

function proofRef(proofId, sha) {
  if (!PROOF_ID.test(text(proofId))) {
    throw new Error(`invalid proof id: ${proofId}`);
  }
  if (!validSha(sha)) throw new Error(`invalid full commit SHA: ${sha}`);
  return `${RECEIPT_REF_ROOT}/${proofId}/${sha}`;
}

function identityRef(proofId, digest) {
  if (!PROOF_ID.test(text(proofId))) {
    throw new Error(`invalid proof id: ${proofId}`);
  }
  if (!/^[0-9a-f]{64}$/u.test(text(digest))) {
    throw new Error(`invalid release proof identity digest: ${digest}`);
  }
  return `${RECEIPT_REF_ROOT}/${proofId}/${IDENTITY_REF_SEGMENT}/${digest}`;
}

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

function receiptTagName(proofId, sha) {
  return `${RECEIPT_TAG_ROOT}/${proofId}/${sha}`;
}

function runGit(args, {cwd = process.cwd(), input = undefined} = {}) {
  return spawnSync(GIT_BINARY, args, {
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

function absentParse() {
  return {kind: PARSE_KIND_ABSENT};
}

function invalidParse(because) {
  return {kind: PARSE_KIND_INVALID, because};
}

function parseLsRemoteProblem({lines, fields, expectedRef}) {
  if (lines.length !== 1) return `remote returned ${lines.length} matches`;
  if (fields.length !== 2 || fields[1] !== expectedRef || !validSha(fields[0])) {
    return MALFORMED_PROOF_REF;
  }
  return EMPTY_TEXT;
}

function parseLsRemote(stdout, expectedRef) {
  const lines = text(stdout).split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return absentParse();
  }
  const fields = lines[0].split(/\s+/u);
  const because = parseLsRemoteProblem({lines, fields, expectedRef});
  if (because) {
    return invalidParse(because);
  }
  return {kind: PARSE_KIND_PRESENT, objectSha: fields[0]};
}

function parseAnnotatedTag(body) {
  const separator = body.indexOf('\n\n');
  if (separator < 0) return {ok: false, because: TAG_HAS_NO_MESSAGE};
  const headerLines = body.slice(0, separator).split('\n');
  const headers = {};
  for (const line of headerLines) {
    const space = line.indexOf(' ');
    if (space <= 0) continue;
    const key = line.slice(0, space);
    if (!Object.hasOwn(headers, key)) headers[key] = line.slice(space + 1);
  }
  let receipt;
  try {
    receipt = JSON.parse(body.slice(separator + 2).trim());
  } catch (error) {
    return {ok: false, because: `receipt message is not JSON: ${error.message}`};
  }
  return {ok: true, headers, receipt};
}

function receiptProblems({proofId, sha, objectType, parsed, identity = null}) {
  if (objectType !== OBJECT_TYPE_TAG) return [PROOF_REF_NOT_TAG];
  if (!parsed.ok) return [parsed.because];
  const {headers, receipt} = parsed;
  // An exact lookup binds the receipt to the requested commit; an identity
  // lookup binds it to the commit the receipt names and to this tree's
  // identity, which must be the one the receipt recorded.
  const subject = identity ? text(receipt?.subjectSha) : sha;
  const expectedTag = receiptTagName(proofId, subject);
  const problems = [];
  if (headers.object !== subject) problems.push(TAG_TARGET_MISMATCH);
  if (headers.type !== OBJECT_TYPE_COMMIT) problems.push(TAG_TARGET_NOT_COMMIT);
  if (headers.tag !== expectedTag) problems.push(TAG_IDENTITY_MISMATCH);
  if (receipt?.schema !== RECEIPT_SCHEMA) problems.push(RECEIPT_SCHEMA_MISMATCH);
  if (receipt?.proofId !== proofId) problems.push(RECEIPT_PROOF_ID_MISMATCH);
  if (receipt?.subjectSha !== subject) problems.push(RECEIPT_SUBJECT_SHA_MISMATCH);
  if (receipt?.outcome !== RECEIPT_OUTCOME_PASSED) problems.push(RECEIPT_NOT_A_PASS);
  if (receipt?.reuse !== REUSE.IMMUTABLE_SHA) problems.push(RECEIPT_NOT_IMMUTABLE);
  if (!receipt?.completedAt || Number.isNaN(Date.parse(receipt.completedAt))) {
    problems.push(RECEIPT_TIME_INVALID);
  }
  // A receipt reached through an identity ref proves this tree when it
  // carries the same identity, or when it carries none: receipts recorded
  // before identities were carried are bound by the ref alone, which
  // `index` publishes only from a checkout of the receipt's own subject -
  // the same trust the exact ref already has.
  if (identity && receipt?.identity &&
      (receipt.identity.algorithm !== identity.algorithm ||
        receipt.identity.digest !== identity.digest)) {
    problems.push(RECEIPT_IDENTITY_MISMATCH);
  }
  return problems;
}

function evaluateReceipt({proofId, sha, objectSha, objectType, objectBody, identity = null}) {
  const parsed = parseAnnotatedTag(objectBody);
  const problems = receiptProblems({proofId, sha, objectType, parsed, identity});
  if (problems.length === 0) {
    return {
      outcome: OUTCOME.PROVEN,
      proofId,
      subjectSha: sha,
      objectSha,
      resolution: identity ?
        RESOLUTION.RELEASE_CONTENT_IDENTITY : RESOLUTION.EXACT_SHA,
      provenBy: parsed.receipt.subjectSha,
      receipt: parsed.receipt,
    };
  }
  return {outcome: OUTCOME.UNAVAILABLE,
    because: problems.join(RECEIPT_PROBLEM_SEPARATOR)};
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

function buildReceipt({
  proofId, sha, completedAt = new Date().toISOString(), producer = {}, identity = null,
}) {
  return Object.freeze({
    schema: RECEIPT_SCHEMA,
    proofId,
    subjectSha: sha,
    outcome: RECEIPT_OUTCOME_PASSED,
    reuse: REUSE.IMMUTABLE_SHA,
    completedAt,
    producer: Object.freeze({...producer}),
    ...(identity ? {identity: Object.freeze({
      algorithm: identity.algorithm, digest: identity.digest,
    })} : {}),
  });
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
}) {
  const contract = contractFor(proofId);
  if (!contract || contract.reuse !== REUSE.IMMUTABLE_SHA) {
    throw new Error(`proof contract is not permanently recordable: ${proofId}`);
  }
  if (!validSha(sha)) throw new Error(SUBJECT_NOT_FULL_SHA);

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

  const identity = checkedOutIdentity({sha, cwd, git});
  const receipt = buildReceipt({proofId, sha, completedAt, producer, identity});
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
  if (identity && contract.identityReuse === true) {
    publishIdentityRef({proofId, identity, objectSha, remote, cwd, git, now});
  }
  return {...recorded, reused: false};
}

/**
 * Index an existing exact receipt under its release proof identity, for
 * receipts recorded before identities were carried (the subject commit must
 * be checked out at cwd). Idempotent; an existing identity ref is kept.
 */
// The exact receipt an identity may be published for: proven, and either
// carrying this identity or none at all.
function indexableReceipt({proofId, sha, remote, cwd, git, identity}) {
  const exact = cataloguedProof({proofId, sha, remote, cwd, git});
  if (exact.outcome !== OUTCOME.PROVEN) {
    throw new Error(`no exact receipt to index: ${exact.because || exact.outcome}`);
  }
  const carried = exact.receipt?.identity;
  if (carried && (carried.algorithm !== identity.algorithm ||
      carried.digest !== identity.digest)) {
    throw new Error(`${RECEIPT_IDENTITY_MISMATCH}: ${carried.digest}`);
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

function registeredProofs() {
  return Object.keys(CONTRACTS);
}

function parseCli(argv) {
  const [command, proofId, sha, ...rest] = argv;
  const options = {command, proofId, sha, remote: DEFAULT_REMOTE, json: false, producer: {}};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === FLAG_JSON) options.json = true;
    else if (arg === FLAG_REMOTE) options.remote = rest[++index] || DEFAULT_REMOTE;
    else if (arg === FLAG_PRODUCER_KIND) options.producer.kind = rest[++index] || EMPTY_TEXT;
    else if (arg === FLAG_PRODUCER_ID) options.producer.id = rest[++index] || EMPTY_TEXT;
    else if (arg === FLAG_PRODUCER_URL) options.producer.url = rest[++index] || EMPTY_TEXT;
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
    const result = recordProof(options);
    write(render(result, options.json));
    return 0;
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
  RECEIPT_REF_ROOT,
  RECEIPT_SCHEMA,
  RESOLUTION,
  REUSE,
  identityRef,
  indexProof,
  buildReceipt,
  buildTagBody,
  evaluateReceipt,
  proofRef,
  recordProof,
  registeredProofs,
  resolveCorpusProof,
  resolveProof,
  runCli,
};
