// Registered proof contracts, ref identity, and the receipt reader. Git
// transport and native execution authorization remain in proof-authority.

import {RELEASE_PROOF_IDENTITY_ALGORITHM} from './release-proof-identity.js';
import {RETRY_POLICY} from './test-execution-report.js';

const RECEIPT_SCHEMA = 'lagrange-proof-receipt/v1';
const RECEIPT_REF_ROOT = 'refs/lagrange-proofs';
const RECEIPT_TAG_ROOT = 'lagrange-proof';
const FULL_SHA = /^[0-9a-f]{40}$/u;
const PROOF_ID = /^[a-z0-9][a-z0-9._-]*$/u;
const EMPTY_TEXT = '';
const OBJECT_TYPE_TAG = 'tag';
const OBJECT_TYPE_COMMIT = 'commit';
const RECEIPT_OUTCOME_PASSED = 'passed';
const RECEIPT_PROBLEM_SEPARATOR = '; ';
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
const RECEIPT_EXECUTION_INVALID = 'receipt execution envelope is missing or malformed';
const EXECUTION_REPORT_DIGEST = /^[0-9a-f]{64}$/u;
const EXECUTION_SUMMARY_COUNTS = Object.freeze([
  'planned', 'executed', 'assertions', 'runs', 'passedOnRetry',
]);
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
const IDENTITY_DIGEST = /^[0-9a-f]{64}$/u;
const RECEIPT_IDENTITY_MISMATCH = 'receipt identity does not match this tree';
const RECEIPT_IDENTITY_INVALID = 'receipt identity is missing or malformed';
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
    // Sealed: a file green only on its retry is not a release proof.
    retryPolicy: RETRY_POLICY.REFUSE,
    // Sealed: the only proof a release report may cite instead of running is
    // the exact commit's own whole-corpus receipt.
    citableProofs: Object.freeze([PROOF.CORPUS_FULL]),
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
    // Sealed: the corpus proves green files, not files green on a retry.
    retryPolicy: RETRY_POLICY.REFUSE,
    // Sealed: the whole corpus is run, never cited.
    citableProofs: Object.freeze([]),
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
  if (!IDENTITY_DIGEST.test(text(digest))) {
    throw new Error(`invalid release proof identity digest: ${digest}`);
  }
  return `${RECEIPT_REF_ROOT}/${proofId}/${IDENTITY_REF_SEGMENT}/${digest}`;
}

function receiptTagName(proofId, sha) {
  return `${RECEIPT_TAG_ROOT}/${proofId}/${sha}`;
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

// Only an unqualified pass can satisfy the registered strict proof contracts.
function passOutcome(outcome) {
  return outcome === RECEIPT_OUTCOME_PASSED;
}

function receiptRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// The receipt carries the validated report's audit envelope, not the report
// itself. Check its current shape and visible contract outcomes without
// reconstructing the execution or demanding direct work from a cited release.
function validReceiptExecution(execution, proofId) {
  if (!receiptRecord(execution) || typeof execution.reportDigest !== 'string' ||
      !EXECUTION_REPORT_DIGEST.test(execution.reportDigest)) return false;
  const {producer, summary} = execution;
  if (!receiptRecord(producer) || !producer.kind || !producer.id) return false;
  if (!receiptRecord(summary) || EXECUTION_SUMMARY_COUNTS.some((field) =>
    !Number.isFinite(summary[field]) || summary[field] < 0)) return false;
  if (summary.passedOnRetry !== 0 || !Array.isArray(summary.commands) ||
      summary.commands.length === 0 ||
      summary.commands.some((command) => command?.exitStatus !== 0)) return false;
  if (!Array.isArray(summary.reusedProofs) ||
      (summary.planned === 0 && summary.reusedProofs.length === 0)) return false;
  const contract = contractFor(proofId);
  return contract !== null && summary.reusedProofs.every((cited) =>
    contract.citableProofs.includes(cited?.proofId) &&
    typeof cited?.objectSha === 'string' && FULL_SHA.test(cited.objectSha));
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
  if (!passOutcome(receipt?.outcome)) problems.push(RECEIPT_NOT_A_PASS);
  if (receipt?.reuse !== REUSE.IMMUTABLE_SHA) problems.push(RECEIPT_NOT_IMMUTABLE);
  if (!receipt?.completedAt || Number.isNaN(Date.parse(receipt.completedAt))) {
    problems.push(RECEIPT_TIME_INVALID);
  }
  if (!validReceiptExecution(receipt?.execution, proofId)) {
    problems.push(RECEIPT_EXECUTION_INVALID);
  }
  // Identity-reusable contracts carry their own current identity even at an
  // exact ref. A historical object remains stored, but neither its ref nor
  // the caller's checkout can supply identity that the receipt never carried.
  const carried = receipt?.identity;
  if (contractFor(proofId)?.identityReuse === true &&
      (carried?.algorithm !== RELEASE_PROOF_IDENTITY_ALGORITHM ||
        typeof carried?.digest !== 'string' || !IDENTITY_DIGEST.test(carried.digest))) {
    problems.push(RECEIPT_IDENTITY_INVALID);
  }
  if (identity && (carried?.algorithm !== identity.algorithm ||
      carried?.digest !== identity.digest)) {
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

function registeredProofs() {
  return Object.keys(CONTRACTS);
}

export {
  CONTRACTS, EMPTY_TEXT, IDENTITY_REF_SEGMENT, OBJECT_TYPE_COMMIT, OUTCOME,
  PARSE_KIND_ABSENT, PARSE_KIND_PRESENT, PROOF, RECEIPT_IDENTITY_MISMATCH,
  RECEIPT_OUTCOME_PASSED, RECEIPT_PROBLEM_SEPARATOR, RECEIPT_REF_ROOT, RECEIPT_SCHEMA,
  RESOLUTION, REUSE,
  contractFor, evaluateReceipt, identityRef, parseLsRemote, proofRef, receiptTagName,
  registeredProofs, text, validSha,
};
