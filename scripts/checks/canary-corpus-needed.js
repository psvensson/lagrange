#!/usr/bin/env node

// Whether the post-push canary still owes the whole corpus for one commit.
//
// The corpus is a fact about an immutable commit, so proving it twice for the
// same sha buys nothing. Two proofs can already exist when the canary starts:
// the gate run's proof scope (test-output/proof-scope.json, written by the run
// that made the decision) and a durable receipt in the proof authority
// (refs/lagrange-proofs/corpus-full-v1/<sha>, which the local push gate
// records when its own whole-corpus run passes). Before this owner the canary
// read the artifact alone, so a gate that refused before writing one - the
// lockfile refusal on 0f93df70c - cost a full 74-minute re-proof of a corpus
// the push gate had already proved on that exact sha.
//
// Fails open: anything unknown, unreadable or unparsable leaves the corpus
// owed. A canary that runs when it need not costs time; one that skips when it
// should not costs the proof.

import fs from 'node:fs';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {CORPUS_FULL_PROOF, resolveCorpusProof} from '../proof-authority.js';

const objectHasOwn = Object.hasOwn;
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const FULL_SHA = /^[0-9a-f]{40}$/u;
const UTF8 = 'utf8';
const NEWLINE = '\n';
const SHA_FLAG = '--sha';
const SCOPE_FLAG = '--scope';
const REMOTE_FLAG = '--remote';
const FORCE_FLAG = '--force';
const DEFAULT_REMOTE = 'origin';
const NEEDED_OUTPUT_PREFIX = 'needed=';
const FLAG_PREFIX = '--';
const FIELD_SHA = 'sha';
const FIELD_FULL_CORPUS = 'fullCorpus';
const REASON = Object.freeze({
  FORCED: 'the corpus was asked for by hand, so no proof is reused',
  NO_SHA: 'no head sha was given, so nothing can be reused',
  SCOPE_PROVES: 'the gate run proved the whole corpus for this sha',
  RECEIPT_PROVES: 'the proof authority holds a whole-corpus receipt for this sha',
  UNPROVED: 'no whole-corpus proof for this sha',
});

/**
 * Whether one proof scope covers the whole corpus for this sha.
 * @param {unknown} scope parsed proof-scope.json, or null
 * @param {string} sha the head sha under decision
 * @return {boolean}
 */
export function scopeProvesCorpus(scope, sha) {
  if (!scope || typeof scope !== 'object') return false;
  if (!objectHasOwn(scope, FIELD_SHA) ||
      !objectHasOwn(scope, FIELD_FULL_CORPUS)) {
    return false;
  }
  return scope[FIELD_FULL_CORPUS] === true && scope[FIELD_SHA] === sha;
}

function readScope(scopePath) {
  if (typeof scopePath !== 'string' || scopePath.length === 0) return null;
  try {
    return JSON.parse(fs.readFileSync(scopePath, UTF8));
  } catch {
    return null;
  }
}

/**
 * The decision, with the reason it was reached.
 * @param {Object} input
 * @param {string} input.sha the head sha the canary was triggered for
 * @param {unknown} [input.scope] parsed gate proof scope, or null
 * @param {Function} [input.resolve] proof lookup, for the witness
 * @param {string} [input.remote]
 * @param {boolean} [input.force] a hand dispatch re-proves regardless
 * @return {{needed: boolean, because: string}}
 */
export function corpusNeeded({sha, scope = null, resolve = resolveCorpusProof,
  remote = DEFAULT_REMOTE, force = false}) {
  // An operator dispatching the canary by hand is asking for the corpus, not
  // for a lookup (verifier round 1): a receipt must not make that a no-op.
  if (force === true) return {needed: true, because: REASON.FORCED};
  if (typeof sha !== 'string' || !FULL_SHA.test(sha)) {
    return {needed: true, because: REASON.NO_SHA};
  }
  if (scopeProvesCorpus(scope, sha)) {
    return {needed: false, because: REASON.SCOPE_PROVES};
  }
  let proven = false;
  try {
    proven = resolve({sha, remote}) === true;
  } catch {
    proven = false;
  }
  return proven ?
    {needed: false, because: REASON.RECEIPT_PROVES} :
    {needed: true, because: REASON.UNPROVED};
}

function valueAfter(argv, flag) {
  const index = arrayIndexOf(argv, flag);
  if (index < 0) return null;
  const value = argv[index + 1];
  return typeof value === 'string' && !stringStartsWith(value, FLAG_PREFIX) ?
    stringTrim(value) : null;
}

// stdout carries ONLY `needed=<bool>`, because the caller appends it to a
// GitHub step output file where a prose line would be a format error; the
// reason goes to stderr, where the run log shows it.
function main(argv, write, explain) {
  const decision = corpusNeeded({
    force: arrayIndexOf(argv, FORCE_FLAG) >= 0,
    sha: valueAfter(argv, SHA_FLAG),
    scope: readScope(valueAfter(argv, SCOPE_FLAG)),
    remote: valueAfter(argv, REMOTE_FLAG) || DEFAULT_REMOTE,
  });
  explain(`${CORPUS_FULL_PROOF}: ${decision.because}${NEWLINE}`);
  write(`${NEEDED_OUTPUT_PREFIX}${decision.needed}${NEWLINE}`);
  return decision;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2),
    (value) => process.stdout.write(value),
    (value) => process.stderr.write(value));
}

export {REASON, main};
