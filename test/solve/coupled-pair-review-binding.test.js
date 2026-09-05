import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import tap from 'tap';

import {landQuestWorkflow} from '../../scripts/solve/operator-workflow.js';
import {readLog} from '../../scripts/solve/store.js';
import {
  createCoupledPairFixture,
  removeCoupledPairFixture,
} from './coupled-pair-guard-fixture.js';

const REVIEW_DIRECTORY = 'solve/state/reviews';
const SOURCE_AFTER = 'after';
const REVIEWER = 'coupled-pair-reviewer';
const APPROVE_VERDICT = 'approve';
const APPROVAL_EVENT_KIND = 'verifier-approval';
const REGISTRY_DRIFT_RECEIPT = 'review:coupled-pair-registry-drift';
const LEGACY_REVIEW_RECEIPT = 'review:legacy-schema';
const TAMPERED_REVIEW_RECEIPT = 'review:tampered-identity';
const REGISTRY_DRIFT_DESCRIPTION = 'semantically changed after review minting';
const DETERMINISTIC_TEST_NAME =
  'unchanged review manifests retain one deterministic identity';
const LEGACY_TEST_NAME =
  'legacy schema reviews require a fresh current-schema review';
const TAMPER_TEST_NAME =
  'review identity rejects a manifest changed after minting';
const REGISTRY_DRIFT_TEST_NAME =
  'review identity binds the coupled-pair registry digest';
const DETERMINISTIC_ASSERTION =
  'the same manifest produces the same immutable review id';
const LEGACY_ASSERTION = 'the replacement review uses the current schema';
const LEGACY_ID_ASSERTION = 'the replacement does not reuse the legacy id';
const APPROVAL_LOG_ASSERTION =
  'registry drift is rejected before an approval enters the durable log';
const LEGACY_SCHEMA_VERSION = 1;
const CURRENT_SCHEMA_VERSION = 4;
const REVIEW_ID_DIGEST_LENGTH = 24;

function requestReview(t) {
  const fixture = createCoupledPairFixture();
  t.teardown(() => removeCoupledPairFixture(fixture));
  fixture.record({
    'scripts/left-a.js': SOURCE_AFTER,
    'scripts/right.js': SOURCE_AFTER,
  }, 0);
  return {
    fixture,
    requested: landQuestWorkflow(fixture.root, {id: fixture.id}),
  };
}

function reviewIdFor(manifest) {
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex');
  return `review-${digest.slice(0, REVIEW_ID_DIGEST_LENGTH)}`;
}

function writeReview(root, id, manifest) {
  const file = path.join(root, REVIEW_DIRECTORY, `${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify({id, manifest}, null, 2)}\n`);
}

function approvalArgs(fixture, review, receipt) {
  return {
    id: fixture.id,
    review,
    verifier: REVIEWER,
    verdict: APPROVE_VERDICT,
    receipt,
  };
}

tap.test(DETERMINISTIC_TEST_NAME, (t) => {
  const {fixture, requested} = requestReview(t);
  const repeated = landQuestWorkflow(fixture.root, {id: fixture.id});

  t.equal(repeated.review.id, requested.review.id, DETERMINISTIC_ASSERTION);
  t.same(repeated.review.manifest, requested.review.manifest);
  t.end();
});

tap.test(LEGACY_TEST_NAME, (t) => {
  const {fixture, requested} = requestReview(t);
  const current = requested.review.manifest;
  const legacyManifest = {
    schemaVersion: LEGACY_SCHEMA_VERSION,
    questId: current.questId,
    candidate: current.candidate,
    aggregate: current.aggregate,
  };
  const legacyId = reviewIdFor(legacyManifest);
  writeReview(fixture.root, legacyId, legacyManifest);

  t.throws(() => landQuestWorkflow(fixture.root, approvalArgs(
    fixture,
    legacyId,
    LEGACY_REVIEW_RECEIPT,
  )), /no longer matches.*run land again to issue a fresh review/isu);
  const replacement = landQuestWorkflow(fixture.root, {id: fixture.id});
  t.equal(replacement.review.manifest.schemaVersion, CURRENT_SCHEMA_VERSION,
    LEGACY_ASSERTION);
  t.not(replacement.review.id, legacyId, LEGACY_ID_ASSERTION);
  t.end();
});

tap.test(TAMPER_TEST_NAME, (t) => {
  const {fixture, requested} = requestReview(t);
  const reviewFile = path.join(
    fixture.root,
    REVIEW_DIRECTORY,
    `${requested.review.id}.json`,
  );
  const stored = JSON.parse(fs.readFileSync(reviewFile, 'utf8'));
  stored.manifest.aggregate.lastAttemptIndex += 1;
  fs.writeFileSync(reviewFile, `${JSON.stringify(stored, null, 2)}\n`);

  t.throws(() => landQuestWorkflow(fixture.root, approvalArgs(
    fixture,
    requested.review.id,
    TAMPERED_REVIEW_RECEIPT,
  )), /failed its immutable identity check/iu);
  t.end();
});

tap.test(REGISTRY_DRIFT_TEST_NAME, (t) => {
  const {fixture, requested} = requestReview(t);

  t.match(requested.review.manifest.coupledPairRegistryDigest,
    /^sha256:[0-9a-f]{64}$/u);
  fixture.rewriteRegistry({
    withContract: true,
    description: REGISTRY_DRIFT_DESCRIPTION,
  });
  fixture.commitRegistryContext();
  t.throws(() => landQuestWorkflow(fixture.root, approvalArgs(
    fixture,
    requested.review.id,
    REGISTRY_DRIFT_RECEIPT,
  )), /no longer matches.*coupled-pair registry/isu);
  t.notOk(readLog(fixture.root, fixture.id).some((event) =>
    event.kind === APPROVAL_EVENT_KIND),
  APPROVAL_LOG_ASSERTION);
  t.end();
});
