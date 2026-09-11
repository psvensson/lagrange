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

const REUSE = Object.freeze({
  IMMUTABLE_SHA: 'immutable-sha',
});

const PROOF = Object.freeze({
  RELEASE_FULL: 'release-full-v1',
});

const CONTRACTS = Object.freeze({
  [PROOF.RELEASE_FULL]: Object.freeze({
    reuse: REUSE.IMMUTABLE_SHA,
    description: 'complete release proof for one immutable repository commit',
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

function receiptTagName(proofId, sha) {
  return `${RECEIPT_TAG_ROOT}/${proofId}/${sha}`;
}

function runGit(args, {cwd = process.cwd(), input = undefined} = {}) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    input,
    stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
}

function gitFailure(result) {
  return text(result?.stderr) || text(result?.stdout) ||
    `git exited with status ${result?.status ?? 'unknown'}`;
}

function parseLsRemote(stdout, expectedRef) {
  const lines = text(stdout).split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return {kind: 'absent'};
  if (lines.length !== 1) {
    return {kind: 'invalid', because: `remote returned ${lines.length} matches`};
  }
  const fields = lines[0].split(/\s+/u);
  if (fields.length !== 2 || fields[1] !== expectedRef || !validSha(fields[0])) {
    return {kind: 'invalid', because: 'remote returned a malformed proof ref'};
  }
  return {kind: 'present', objectSha: fields[0]};
}

function parseAnnotatedTag(body) {
  const separator = body.indexOf('\n\n');
  if (separator < 0) return {ok: false, because: 'annotated tag has no message'};
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

function evaluateReceipt({proofId, sha, objectSha, objectType, objectBody}) {
  if (objectType !== 'tag') {
    return {outcome: OUTCOME.UNAVAILABLE,
      because: 'proof ref does not point to an annotated tag object'};
  }
  const parsed = parseAnnotatedTag(objectBody);
  if (!parsed.ok) return {outcome: OUTCOME.UNAVAILABLE, because: parsed.because};
  const {headers, receipt} = parsed;
  const expectedTag = receiptTagName(proofId, sha);
  const problems = [];
  if (headers.object !== sha) problems.push('tag target does not equal subject SHA');
  if (headers.type !== 'commit') problems.push('tag target is not a commit');
  if (headers.tag !== expectedTag) problems.push('tag identity does not equal proof identity');
  if (receipt?.schema !== RECEIPT_SCHEMA) problems.push('receipt schema mismatch');
  if (receipt?.proofId !== proofId) problems.push('receipt proof id mismatch');
  if (receipt?.subjectSha !== sha) problems.push('receipt subject SHA mismatch');
  if (receipt?.outcome !== 'passed') problems.push('receipt does not record a pass');
  if (receipt?.reuse !== REUSE.IMMUTABLE_SHA) problems.push('receipt is not immutable-SHA reusable');
  if (!receipt?.completedAt || Number.isNaN(Date.parse(receipt.completedAt))) {
    problems.push('receipt completion time is invalid');
  }
  if (problems.length > 0) {
    return {outcome: OUTCOME.UNAVAILABLE, because: problems.join('; ')};
  }
  return {
    outcome: OUTCOME.PROVEN,
    proofId,
    subjectSha: sha,
    objectSha,
    receipt,
  };
}

/**
 * Resolve a permanent proof from its authoritative Git ref.
 * @return {{outcome: string, proofId?: string, subjectSha?: string,
 *   objectSha?: string, receipt?: Object, because?: string}}
 */
function resolveProof({proofId, sha, remote = DEFAULT_REMOTE, cwd = process.cwd(), git = runGit}) {
  const contract = contractFor(proofId);
  if (!contract) {
    return {outcome: OUTCOME.UNAVAILABLE,
      because: `unregistered proof contract: ${proofId}`};
  }
  if (contract.reuse !== REUSE.IMMUTABLE_SHA) {
    return {outcome: OUTCOME.UNAVAILABLE,
      because: `proof contract ${proofId} is not permanently reusable`};
  }
  if (!validSha(sha)) {
    return {outcome: OUTCOME.UNAVAILABLE, because: 'subject is not a full commit SHA'};
  }
  let ref;
  try {
    ref = proofRef(proofId, sha);
  } catch (error) {
    return {outcome: OUTCOME.UNAVAILABLE, because: error.message};
  }
  const listed = git(['ls-remote', '--refs', remote, ref], {cwd});
  if (listed.status !== 0) {
    return {outcome: OUTCOME.UNAVAILABLE,
      because: `proof store lookup failed: ${gitFailure(listed)}`};
  }
  const match = parseLsRemote(listed.stdout, ref);
  if (match.kind === 'absent') {
    return {outcome: OUTCOME.UNPROVEN, proofId, subjectSha: sha};
  }
  if (match.kind !== 'present') {
    return {outcome: OUTCOME.UNAVAILABLE, because: match.because};
  }
  const fetched = git(['fetch', '--quiet', '--no-tags', remote, ref], {cwd});
  if (fetched.status !== 0) {
    return {outcome: OUTCOME.UNAVAILABLE,
      because: `proof object fetch failed: ${gitFailure(fetched)}`};
  }
  const typed = git(['cat-file', '-t', match.objectSha], {cwd});
  if (typed.status !== 0) {
    return {outcome: OUTCOME.UNAVAILABLE,
      because: `proof object type unavailable: ${gitFailure(typed)}`};
  }
  const body = git(['cat-file', '-p', match.objectSha], {cwd});
  if (body.status !== 0) {
    return {outcome: OUTCOME.UNAVAILABLE,
      because: `proof object unavailable: ${gitFailure(body)}`};
  }
  return evaluateReceipt({
    proofId,
    sha,
    objectSha: match.objectSha,
    objectType: text(typed.stdout),
    objectBody: body.stdout,
  });
}

function buildReceipt({proofId, sha, completedAt = new Date().toISOString(), producer = {}}) {
  return Object.freeze({
    schema: RECEIPT_SCHEMA,
    proofId,
    subjectSha: sha,
    outcome: 'passed',
    reuse: REUSE.IMMUTABLE_SHA,
    completedAt,
    producer: Object.freeze({...producer}),
  });
}

function buildTagBody({proofId, sha, receipt, now = Date.now()}) {
  const seconds = Math.floor(now / 1000);
  return [
    `object ${sha}`,
    'type commit',
    `tag ${receiptTagName(proofId, sha)}`,
    `tagger Lagrange Proof Authority <proof-authority@lagrange.invalid> ${seconds} +0000`,
    '',
    JSON.stringify(receipt),
    '',
  ].join('\n');
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
  if (!validSha(sha)) throw new Error('proof subject must be a full commit SHA');

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
  if (commitType.status !== 0 || text(commitType.stdout) !== 'commit') {
    throw new Error('proof subject is not an available commit object');
  }

  const receipt = buildReceipt({proofId, sha, completedAt, producer});
  const tagBody = buildTagBody({proofId, sha, receipt, now});
  const made = git(['mktag'], {cwd, input: tagBody});
  if (made.status !== 0 || !validSha(text(made.stdout))) {
    throw new Error(`could not create proof receipt object: ${gitFailure(made)}`);
  }
  const objectSha = text(made.stdout);
  const finalRef = proofRef(proofId, sha);
  const tempRef = `${RECEIPT_REF_ROOT}-stage/${process.pid}-${now}`;
  const staged = git(['update-ref', tempRef, objectSha, ZERO_SHA], {cwd});
  if (staged.status !== 0) {
    throw new Error(`could not stage proof receipt: ${gitFailure(staged)}`);
  }
  try {
    const pushed = git(['push', remote, `${tempRef}:${finalRef}`], {cwd});
    if (pushed.status !== 0) {
      const raced = resolveProof({proofId, sha, remote, cwd, git});
      if (raced.outcome === OUTCOME.PROVEN) return {...raced, reused: true};
      throw new Error(`could not persist proof receipt: ${gitFailure(pushed)}`);
    }
  } finally {
    git(['update-ref', '-d', tempRef], {cwd});
  }

  const recorded = resolveProof({proofId, sha, remote, cwd, git});
  if (recorded.outcome !== OUTCOME.PROVEN) {
    throw new Error(`persisted proof did not verify: ${recorded.because || recorded.outcome}`);
  }
  return {...recorded, reused: false};
}

function registeredProofs() {
  return Object.keys(CONTRACTS);
}

function parseCli(argv) {
  const [command, proofId, sha, ...rest] = argv;
  const options = {command, proofId, sha, remote: DEFAULT_REMOTE, json: false, producer: {}};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--remote') options.remote = rest[++index] || DEFAULT_REMOTE;
    else if (arg === '--producer-kind') options.producer.kind = rest[++index] || EMPTY_TEXT;
    else if (arg === '--producer-id') options.producer.id = rest[++index] || EMPTY_TEXT;
    else if (arg === '--producer-url') options.producer.url = rest[++index] || EMPTY_TEXT;
  }
  return options;
}

function render(result, json) {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  if (result.outcome === OUTCOME.PROVEN) {
    return `PROVEN ${result.proofId} ${result.subjectSha} ${result.objectSha}\n`;
  }
  return `${result.outcome.toUpperCase()} ${result.because || ''}\n`;
}

function runCli(argv = process.argv.slice(2), write = (value) => process.stdout.write(value)) {
  const options = parseCli(argv);
  if (options.command === 'check') {
    const result = resolveProof(options);
    write(render(result, options.json));
    if (result.outcome === OUTCOME.PROVEN) return 0;
    if (result.outcome === OUTCOME.UNPROVEN) return 1;
    return 2;
  }
  if (options.command === 'record') {
    const result = recordProof(options);
    write(render(result, options.json));
    return 0;
  }
  if (options.command === 'ref') {
    write(`${proofRef(options.proofId, options.sha)}\n`);
    return 0;
  }
  write('usage: proof-authority.js <check|record|ref> <proof-id> <full-sha> [--remote name] [--json]\n');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runCli();
}

export {
  CONTRACTS,
  OUTCOME,
  PROOF,
  RECEIPT_REF_ROOT,
  RECEIPT_SCHEMA,
  REUSE,
  buildReceipt,
  buildTagBody,
  evaluateReceipt,
  proofRef,
  recordProof,
  registeredProofs,
  resolveProof,
  runCli,
};
