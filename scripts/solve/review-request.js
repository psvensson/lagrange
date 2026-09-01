// Immutable landing-review manifests stored in ignored Solver state.
// The first `solve land` freezes the exact candidate and aggregate receipts;
// the verifier returns only the review id plus verdict. A later land rechecks
// the current projection byte-for-byte before it records that verdict.

import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {loadImpactContractRegistry} from '../checks/impact-contract-registry.js';
import {landingReviewPreflight} from './landing-preflight.js';
import {prepareCandidateProofInputs} from './landing-preflight.js';
import {landingRequirementsReceipt} from './landing-requirements.js';
import {generatedDependencyReceiptInSnapshot} from './generated-dependencies.js';
import {questContractExcludesCollateral} from './verification.js';
import {withCandidateSnapshot} from './candidate-snapshot.js';
import {sealedVerificationTemplates} from './rejection-findings.js';
import {
  loadTemplateCategories,
  suggestVerificationTemplates,
} from './verification-template-suggest.js';
import {readLog} from './store.js';

const REVIEW_DIRECTORY = 'solve/state/reviews';
const REVIEW_ID_PATTERN = /^review-[0-9a-f]{24}$/u;
const SCHEMA_VERSION = 3;
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
const SOURCE_EPOCH_PROBLEM = 'land: could not freeze the current source epoch';
const TEMPLATE_SOURCE_SEALED = 'sealed';
const TEMPLATE_SOURCE_MECHANICAL = 'mechanical';
const EXCLUSIVE_CREATE_FLAG = 'wx';
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySort = Function.call.bind(Array.prototype.sort);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const objectHasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringLocaleCompare = Function.call.bind(String.prototype.localeCompare);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringTrim = Function.call.bind(String.prototype.trim);

function sortedCopy(values) {
  return arraySort(arraySlice(values || []));
}

function receipt(projection) {
  return {
    fingerprint: projection.fingerprint,
    baseCommit: projection.baseCommit,
    paths: sortedCopy(projection.paths),
    sourcePaths: sortedCopy(projection.sourcePaths || projection.paths),
    firstAttemptIndex: projection.firstAttemptIndex,
    lastAttemptIndex: projection.lastAttemptIndex,
  };
}

function coupledPairRegistryDigest(root) {
  const loaded = loadImpactContractRegistry(root);
  if (loaded.digest) return loaded.digest;
  return REGISTRY_UNAVAILABLE_DIGEST;
}

function sourceEpoch(root, aggregate) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: TEXT_ENCODING,
  });
  const headCommit = stringTrim(result.stdout);
  if (result.status !== 0 || !regExpTest(/^[0-9a-f]{40}$/u, headCommit)) {
    throw new Error(SOURCE_EPOCH_PROBLEM);
  }
  return {headCommit, candidateBaseCommit: aggregate.baseCommit};
}

function requiredReviewTemplates(root, quest, state, log) {
  const catalog = loadTemplateCategories(root);
  const byCategory = new Map();
  const sealed = sealedVerificationTemplates(quest, log);
  for (let categoryIndex = 0; categoryIndex < sealed.length; categoryIndex += 1) {
    const category = sealed[categoryIndex];
    mapSet(byCategory, category, {
      category,
      template: mapGet(catalog, category),
      sources: [TEMPLATE_SOURCE_SEALED],
    });
  }
  for (let attemptIndex = 0; attemptIndex < state.attempts.length; attemptIndex += 1) {
    const attempt = state.attempts[attemptIndex];
    const suggestions = suggestVerificationTemplates(
      root, attempt.inspection?.content || '');
    for (let suggestionIndex = 0;
      suggestionIndex < suggestions.length; suggestionIndex += 1) {
      const suggestion = suggestions[suggestionIndex];
      const current = mapGet(byCategory, suggestion.category);
      if (current) {
        if (!arrayIncludes(current.sources, TEMPLATE_SOURCE_MECHANICAL)) {
          arrayPush(current.sources, TEMPLATE_SOURCE_MECHANICAL);
        }
      } else {
        mapSet(byCategory, suggestion.category, {
          ...suggestion,
          sources: [TEMPLATE_SOURCE_MECHANICAL],
        });
      }
    }
  }
  const templates = [];
  mapForEach(byCategory, (template) => arrayPush(templates, template));
  return arraySort(templates, (left, right) =>
    stringLocaleCompare(left.category, right.category));
}

function stablePreflightReceipt(preflight) {
  const {cached: _cacheState, ...receiptValue} = preflight;
  return receiptValue;
}

function currentReviewManifest(root, quest, state, suppliedLog) {
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
  const aggregate = receipt({
    ...state.aggregate,
    sourcePaths: state.aggregate.paths,
    firstAttemptIndex: contracted[0].index,
    lastAttemptIndex: contracted[contracted.length - 1].index,
  });
  return withCandidateSnapshot(root, {
    ...state.aggregate,
    sourcePaths: state.aggregate.paths,
  }, (candidateRoot) => {
    prepareCandidateProofInputs(candidateRoot, root);
    const base = {
      schemaVersion: SCHEMA_VERSION,
      questId: quest.id,
      coupledPairRegistryDigest: coupledPairRegistryDigest(root),
      candidate: receipt(state.candidate),
      aggregate,
      sourceEpoch: sourceEpoch(root, aggregate),
      landingRequirements: landingRequirementsReceipt(root, quest),
      generatedDependencies: generatedDependencyReceiptInSnapshot(candidateRoot, {
        ...state.aggregate,
        sourcePaths: state.aggregate.paths,
      }, {collateral: questContractExcludesCollateral(quest)}),
      // Collateral contract: the reviewed byte set is the candidate paths;
      // registered generated outputs are landing collateral the landing
      // regenerates, named here so the verifier knows they are out of the
      // reviewed set by contract rather than by omission.
      ...(questContractExcludesCollateral(quest) ? {
        collateralContract: true,
      } : {}),
      requiredReviewTemplates: requiredReviewTemplates(
        root, quest, state, suppliedLog || readLog(root, quest.id)),
    };
    const preflight = landingReviewPreflight(root, base, {candidateRoot});
    return {manifest: {...base, proofPlan: stablePreflightReceipt(preflight)},
      preflight};
  });
}

export function reviewIdFor(manifest) {
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

export function createReviewRequest(root, quest, state, log) {
  const {manifest, preflight} = currentReviewManifest(root, quest, state, log);
  const id = reviewIdFor(manifest);
  const file = reviewFile(root, id);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (!fs.existsSync(file)) {
    const bytes = `${jsonStringify({
      id,
      createdAt: new Date().toISOString(),
      manifest,
    }, null, 2)}\n`;
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, bytes, {flag: EXCLUSIVE_CREATE_FLAG});
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  return {id, manifest, file: path.relative(root, file), preflight};
}

export function loadReviewRequest(root, reviewId) {
  const file = reviewFile(root, reviewId);
  let request;
  try {
    request = jsonParse(fs.readFileSync(file, TEXT_ENCODING));
  } catch {
    throw new Error(`unknown review id ${reviewId}`);
  }
  if (!request || typeof request !== 'object' ||
    !objectHasOwn(request, REVIEW_ID_FIELD) ||
    !objectHasOwn(request, REVIEW_MANIFEST_FIELD) ||
    !request.manifest || typeof request.manifest !== 'object' ||
    request.id !== reviewId ||
    reviewIdFor(request.manifest) !== reviewId) {
    throw new Error(`review ${reviewId} failed its immutable identity check`);
  }
  return request;
}

export function assertReviewCurrent(root, quest, state, reviewId, log) {
  const request = loadReviewRequest(root, reviewId);
  if (request.manifest.questId !== quest.id) {
    throw new Error(`land: review ${reviewId} belongs to another Quest`);
  }
  if (state.candidate?.fingerprint !== request.manifest.candidate?.fingerprint ||
    state.aggregate?.fingerprint !== request.manifest.aggregate?.fingerprint) {
    throw new Error(
      `land: review ${reviewId} no longer matches current candidate bytes ` +
      REVIEW_DRIFT_REGISTRY_SUFFIX + FRESH_REVIEW_ACTION,
    );
  }
  const {manifest: current, preflight} = currentReviewManifest(
    root, quest, state, log);
  if (jsonStringify(current) !== jsonStringify(request.manifest)) {
    throw new Error(
      `land: review ${reviewId} no longer matches current candidate bytes ` +
      REVIEW_DRIFT_REGISTRY_SUFFIX +
      FRESH_REVIEW_ACTION,
    );
  }
  return {...request, preflight};
}

// The sealed fingerprint a verifier-rejection must cite. A review manifest is
// immutable once minted (loadReviewRequest re-derives its id from the manifest
// bytes), so this is the one referent that still identifies the reviewed bytes
// after the repair the rejection demanded has changed them.
const AGGREGATE_SCOPE = 'aggregate';
const BOTH_SCOPE = 'both';
const REVIEW_FILE_SUFFIX = '.json';
const FOREIGN_QUEST_REVIEW_PREFIX = 'review ';
const FOREIGN_QUEST_REVIEW_SUFFIX = ' belongs to another Quest';

export function reviewManifestSection(root, reviewId, questId, scope) {
  const request = loadReviewRequest(root, reviewId);
  if (request.manifest.questId !== questId) {
    throw new Error(FOREIGN_QUEST_REVIEW_PREFIX + reviewId +
      FOREIGN_QUEST_REVIEW_SUFFIX);
  }
  return scope === AGGREGATE_SCOPE || scope === BOTH_SCOPE ?
    request.manifest.aggregate :
    request.manifest.candidate;
}

// Whether any review has been minted for this quest. Used to require review
// binding exactly where a sealed referent exists, so quests that never reached
// review (and the CLI contract tests that model them) are unaffected.
export function questHasMintedReview(root, questId) {
  const directory = path.join(root, REVIEW_DIRECTORY);
  let entries;
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return false;
  }
  return entries.some((entry) => {
    if (!entry.endsWith(REVIEW_FILE_SUFFIX)) return false;
    try {
      const request = jsonParse(
        fs.readFileSync(path.join(directory, entry), TEXT_ENCODING));
      return request?.manifest?.questId === questId;
    } catch {
      return false;
    }
  });
}
