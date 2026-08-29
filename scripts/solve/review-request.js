// Immutable landing-review manifests stored in ignored Solver state.
// New schema-v3 reviews bind the verifier to scoped path/mode/content identity.
// Schema-v2 review files remain readable under their legacy diff-fingerprint rules.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {loadImpactContractRegistry} from '../checks/impact-contract-registry.js';
import {candidateContentIdentity} from './candidate-content-identity.js';
import {withCandidateWorkspace} from './candidate-workspace.js';
import {
  collectLandingReviewPreflight,
  landingReviewPreflight,
} from './landing-preflight.js';

const REVIEW_DIRECTORY = 'solve/state/reviews';
const REVIEW_ID_PATTERN = /^review-[0-9a-f]{24}$/u;
const LEGACY_SCHEMA_VERSION = 2;
const CONTENT_SCHEMA_VERSION = 3;
const REVIEW_ID_DIGEST_LENGTH = 24;
const TEXT_ENCODING = 'utf8';
const MISSING_CANDIDATE_FINGERPRINT = 'missing candidate fingerprint';
const MISSING_AGGREGATE_FINGERPRINT = 'missing aggregate fingerprint';
const SOURCE_ATTEMPT_REQUIRED_PROBLEM =
  'land: review requires at least one version 2 source attempt';
const INVALID_REVIEW_ID_PROBLEM =
  'land: --review must be a Solver-issued review id';
const FRESH_REVIEW_ACTION = 'run land again to issue a fresh review';
const REGISTRY_UNAVAILABLE_DIGEST = 'impact-contract-registry:unavailable';
const REVIEW_DRIFT_REGISTRY_SUFFIX = 'or coupled-pair registry; ';
const CANDIDATE_NOT_REVIEWABLE_PREFIX =
  'land: current landing candidate is not reviewable: ';
const AGGREGATE_NOT_REVIEWABLE_PREFIX =
  'land: current aggregate is not reviewable: ';
const REVIEW_ID_FIELD = 'id';
const REVIEW_MANIFEST_FIELD = 'manifest';
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySort = Function.call.bind(Array.prototype.sort);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const objectHasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringSlice = Function.call.bind(String.prototype.slice);

function sortedCopy(values) {
  return arraySort(arraySlice(values || []));
}

function legacyReceipt(projection) {
  return {
    fingerprint: projection.fingerprint,
    baseCommit: projection.baseCommit,
    paths: sortedCopy(projection.paths),
    sourcePaths: sortedCopy(projection.sourcePaths || projection.paths),
    firstAttemptIndex: projection.firstAttemptIndex,
    lastAttemptIndex: projection.lastAttemptIndex,
  };
}

function contentReceipt(legacy, identity) {
  if (!identity?.ok || !identity.fingerprint) {
    throw new Error('land: candidate content identity is unavailable');
  }
  return {
    fingerprint: identity.fingerprint,
    baseCommit: legacy.baseCommit,
    paths: sortedCopy(legacy.paths),
    sourcePaths: sortedCopy(legacy.sourcePaths || legacy.paths),
  };
}

function coupledPairRegistryDigest(root) {
  const loaded = loadImpactContractRegistry(root);
  if (loaded.digest) return loaded.digest;
  return REGISTRY_UNAVAILABLE_DIGEST;
}

function legacyProjection(quest, state) {
  if (!state.candidate?.ok || !state.candidate.fingerprint) {
    throw new Error(
      CANDIDATE_NOT_REVIEWABLE_PREFIX +
      (state.candidate?.problem || MISSING_CANDIDATE_FINGERPRINT),
    );
  }
  if (!state.aggregate?.ok || !state.aggregate.fingerprint) {
    throw new Error(
      AGGREGATE_NOT_REVIEWABLE_PREFIX +
      (state.aggregate?.problem || MISSING_AGGREGATE_FINGERPRINT),
    );
  }
  const contracted = arrayFilter(
    state.attempts,
    (attempt) => attempt.candidateContract,
  );
  if (contracted.length === 0) {
    throw new Error(SOURCE_ATTEMPT_REQUIRED_PROBLEM);
  }
  return {
    questId: quest.id,
    candidate: legacyReceipt(state.candidate),
    aggregate: legacyReceipt({
      ...state.aggregate,
      sourcePaths: state.aggregate.paths,
      firstAttemptIndex: contracted[0].index,
      lastAttemptIndex: contracted[contracted.length - 1].index,
    }),
  };
}

function contentIdentitySummary(candidate, aggregate) {
  return {
    schemaVersion: 1,
    authoritative: true,
    candidate,
    aggregate,
  };
}

function prepareContentReview(root, quest, state, options = {}) {
  const legacy = legacyProjection(quest, state);
  return withCandidateWorkspace(root, legacy.aggregate, (candidateRoot) => {
    const candidateIdentity = candidateContentIdentity(
      candidateRoot,
      legacy.candidate.paths,
    );
    const aggregateIdentity = candidateContentIdentity(
      candidateRoot,
      legacy.aggregate.paths,
    );
    const manifest = {
      schemaVersion: CONTENT_SCHEMA_VERSION,
      identityAuthority: 'scoped-content',
      questId: quest.id,
      coupledPairRegistryDigest: coupledPairRegistryDigest(candidateRoot),
      candidate: contentReceipt(legacy.candidate, candidateIdentity),
      aggregate: contentReceipt(legacy.aggregate, aggregateIdentity),
    };
    const preflight = options.collectProblems === true ?
      collectLandingReviewPreflight(candidateRoot, manifest) :
      landingReviewPreflight(candidateRoot, manifest);
    return {
      manifest,
      preflight,
      contentIdentity: contentIdentitySummary(candidateIdentity, aggregateIdentity),
      verificationBridge: {
        candidateFingerprint: legacy.candidate.fingerprint,
        aggregateFingerprint: legacy.aggregate.fingerprint,
      },
    };
  });
}

function prepareLegacyReview(root, quest, state) {
  const legacy = legacyProjection(quest, state);
  return withCandidateWorkspace(root, legacy.aggregate, (candidateRoot) => {
    const manifest = {
      schemaVersion: LEGACY_SCHEMA_VERSION,
      questId: quest.id,
      coupledPairRegistryDigest: coupledPairRegistryDigest(candidateRoot),
      candidate: legacy.candidate,
      aggregate: legacy.aggregate,
    };
    return {
      manifest,
      preflight: landingReviewPreflight(candidateRoot, manifest),
      verificationBridge: {
        candidateFingerprint: legacy.candidate.fingerprint,
        aggregateFingerprint: legacy.aggregate.fingerprint,
      },
    };
  });
}

export function reviewReadiness(root, quest, state) {
  return prepareContentReview(root, quest, state, {collectProblems: true});
}

function reviewIdFor(manifest) {
  const digest = crypto.createHash('sha256')
    .update(jsonStringify(manifest))
    .digest('hex');
  return `review-${stringSlice(digest, 0, REVIEW_ID_DIGEST_LENGTH)}`;
}

function reviewFile(root, reviewId) {
  if (!regExpTest(REVIEW_ID_PATTERN, reviewId || '')) {
    throw new Error(INVALID_REVIEW_ID_PROBLEM);
  }
  return path.join(root, REVIEW_DIRECTORY, `${reviewId}.json`);
}

export function createReviewRequest(root, quest, state) {
  const prepared = prepareContentReview(root, quest, state);
  const {manifest} = prepared;
  const id = reviewIdFor(manifest);
  const file = reviewFile(root, id);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${jsonStringify({
      id,
      createdAt: new Date().toISOString(),
      manifest,
    }, null, 2)}\n`);
  }
  return {
    id,
    manifest,
    file: path.relative(root, file),
    preflight: prepared.preflight,
    contentIdentity: prepared.contentIdentity,
  };
}

export function loadReviewRequest(root, reviewId) {
  const file = reviewFile(root, reviewId);
  let request;
  try {
    request = jsonParse(fs.readFileSync(file, TEXT_ENCODING));
  } catch {
    throw new Error(`land: unknown review id ${reviewId}`);
  }
  if (!request || typeof request !== 'object' ||
    !objectHasOwn(request, REVIEW_ID_FIELD) ||
    !objectHasOwn(request, REVIEW_MANIFEST_FIELD) ||
    !request.manifest || typeof request.manifest !== 'object' ||
    request.id !== reviewId ||
    reviewIdFor(request.manifest) !== reviewId) {
    throw new Error(`land: review ${reviewId} failed its immutable identity check`);
  }
  return request;
}

export function assertReviewCurrent(root, quest, state, reviewId) {
  const request = loadReviewRequest(root, reviewId);
  if (request.manifest.questId !== quest.id) {
    throw new Error(`land: review ${reviewId} belongs to another Quest`);
  }
  const prepared = request.manifest.schemaVersion === LEGACY_SCHEMA_VERSION ?
    prepareLegacyReview(root, quest, state) :
    prepareContentReview(root, quest, state);
  if (jsonStringify(prepared.manifest) !== jsonStringify(request.manifest)) {
    throw new Error(
      `land: review ${reviewId} no longer matches current candidate bytes ` +
      REVIEW_DRIFT_REGISTRY_SUFFIX +
      FRESH_REVIEW_ACTION,
    );
  }
  return {
    ...request,
    preflight: prepared.preflight,
    contentIdentity: prepared.contentIdentity || null,
    verificationBridge: prepared.verificationBridge,
  };
}
