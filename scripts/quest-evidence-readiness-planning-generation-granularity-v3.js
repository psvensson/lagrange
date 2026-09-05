// Deterministic evidence harness for the readiness-planning-generation-
// granularity-v2 quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact. Each receipt names the test file
// whose subtests carry that proof distinction (dep-scope "Required proof
// distinctions").

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const GRANULARITY_TEST =
  'test/control-plane/readiness-planning-generation-granularity.test.js';
const SEMANTIC_GENERATION_TEST =
  'test/control-plane/readiness-planning-semantic-generation.test.js';
const CLASSIFICATION_BARRIER_TEST =
  'test/control-plane/readiness-planning-cache-classification-barrier.test.js';
const CAPACITY_OWNER_TEST =
  'test/rebalancer/storage-capacity-semantic-projection-owner.test.js';
const IDENTITY_OWNER_TEST =
  'test/control-plane/readiness-planning-snapshot-identity-owner.test.js';
const DEFERRAL_BOUNDED_TEST =
  'test/control-plane/readiness-planning-deferral-bounded.test.js';
const MEMOIZATION_TEST =
  'test/control-plane/projection-planning-identity-memoization.test.js';
const SEED_REBALANCE_TEST =
  'test/integration/three-node-seed-rebalance.integration.test.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'DEP-complete-semantic-source-to-generation-map',
    testFile: SEMANTIC_GENERATION_TEST,
    detail: 'every classified planning table maps to its node-local or ' +
      'global generation: direct planning tables keep raw cadence separate ' +
      'from node identity, endpoints and active services classify by ' +
      'canonical first/last, candidate membership and row moves keep exact ' +
      'old/new attribution, priority topology is global while user capacity ' +
      'stays with the capacity owner, and only the canonical publication ' +
      'winner rotates global currency',
  }),
  Object.freeze({
    id: 'Q2-heartbeat-semantic-noop-preserves-planning-currency',
    testFile: GRANULARITY_TEST,
    detail: 'a raw heartbeat write whose liveness projection is unchanged ' +
      'leaves planning currency unchanged and schedules no build',
  }),
  Object.freeze({
    id: 'Q2-node-local-change-preserves-unrelated-variants',
    testFile: GRANULARITY_TEST,
    detail: 'a node-local liveness transition rotates only that node; other ' +
      'variants return the identical frozen records',
  }),
  Object.freeze({
    id: 'Q2-liveness-change-classifies-local-and-shared-membership-impact',
    testFile: GRANULARITY_TEST,
    detail: 'a liveness change that alters the shared readiness/membership ' +
      'component rotates the global generation while a purely local one ' +
      'stays node-scoped',
  }),
  Object.freeze({
    id: 'Q2-cluster-global-change-rotates-global-generation',
    testFile: GRANULARITY_TEST,
    detail: 'true shared topology, publication, transport, and owner ' +
      'changes rotate the global planning generation',
  }),
  Object.freeze({
    id: 'Q2-storage-reservation-write-and-time-expiry-are-current',
    testFile: CAPACITY_OWNER_TEST,
    detail: 'a storage reservation write and a reservation expiry without a ' +
      'write both rotate the capacity owner identity for the target node ' +
      'only; co-due expiries advance and re-arm under observer throw and ' +
      'reentry, and stale or synchronous callbacks cannot double-fire',
  }),
  Object.freeze({
    id: 'Q2-token-only-inputs-are-current',
    testFile: GRANULARITY_TEST,
    detail: 'token-only owner and transport inputs (invalid transport versus ' +
      'topology change) are part of planning currency',
  }),
  Object.freeze({
    id: 'Q2-cached-readiness-feedback-converges-once',
    testFile: GRANULARITY_TEST,
    detail: 'cached readiness feedback across nodes and variants reaches a ' +
      'finite fixed point',
  }),
  Object.freeze({
    id: 'Q2-deferred-cache-notification-fails-closed-until-classified',
    testFile: CLASSIFICATION_BARRIER_TEST,
    detail: 'a cache apply closes stored admission until its exact revision ' +
      'is classified; classifying N+1 cannot launder an already-applied ' +
      'N+2 revision; an INVALID revision (gap, null, classifier failure) ' +
      'closes the barrier fail-closed but not forever: the next bracketed ' +
      'quiescent capture re-adopts the observed revisions, rotates global ' +
      'exactly once, and wakes blocked work exactly once (memo layers ' +
      'meanwhile fall back to the floored table-version key)',
  }),
  Object.freeze({
    id: 'Q2-stored-snapshot-layer-cannot-launder-stale-content',
    testFile: IDENTITY_OWNER_TEST,
    detail: 'a stale stored snapshot identity cannot be republished under a ' +
      'current outer planning identity: identity is generation-gated, a ' +
      'version-key change mints one fresh identity, and cache or owner swaps ' +
      'drop the canonical identity',
  }),
  Object.freeze({
    id: 'Q2-build-transaction-cannot-launder-reentrant-source-change',
    testFile: GRANULARITY_TEST,
    detail: 'a builder that synchronously triggers liveness, capacity, ' +
      'transport, or owner drift cannot stamp its pre-change answer with the ' +
      'post-change identity',
  }),
  Object.freeze({
    id: 'Q2-planning-identity-releases-only-new-generation-retry-exhaustion',
    testFile: SEMANTIC_GENERATION_TEST,
    detail: 'the same semantic identity cannot reset an exhausted retry key; ' +
      'only a newer node or global identity releases it',
  }),
  Object.freeze({
    id: 'Q2-invalid-inputs-cannot-alias-valid-planning-currency',
    testFile: SEMANTIC_GENERATION_TEST,
    detail: 'malformed event revisions, identities, and transport collections ' +
      'fail closed and cannot alias valid-empty or current currency; ordered ' +
      'source revisions ignore duplicates and fail closed on gaps',
  }),
  Object.freeze({
    id: 'SOUNDNESS-all-variant-reuse-matches-forced-current-build',
    testFile: DEFERRAL_BOUNDED_TEST,
    detail: 'every admitted reuse is decision-content equal to a forced ' +
      'current build (stale-serve divergence audit) and the live veto still ' +
      'denies a moved input',
  }),
  Object.freeze({
    id: 'ENGAGEMENT-production-owner-and-real-cache-seams-consume-currency',
    testFile: SEED_REBALANCE_TEST,
    detail: 'the production readiness owner over the real system-table cache ' +
      'consumes semantic currency in a live three-node formation: the seed ' +
      'joins two nodes and rebalances within budget with the planning ' +
      'projection memo hitting on the floored key while identities are ' +
      'saturated (red before the memo-currency repair: node3 join timeout)',
  }),
  Object.freeze({
    id: 'BOUNDED-WORK-macrotask-builds-and-owner-shutdown-are-bounded',
    testFile: IDENTITY_OWNER_TEST,
    detail: 'the one-heavy-build-per-macrotask drain budget and cadence are ' +
      'unchanged and owner shutdown fences callbacks and lazy semantic reads',
  }),
  Object.freeze({
    id: 'memo-currency-saturated-identity-falls-back-to-floored-key',
    testFile: MEMOIZATION_TEST,
    detail: 'while a source revision is unclassified the planning identity ' +
      'stays saturated (admission fail-closed) but is not a memo currency: ' +
      'reads at unchanged table versions share the projection and a further ' +
      'write past the latch forces a fresh one',
  }),
]);

const QUEST_ID = 'readiness-planning-generation-granularity-v3';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'readiness-planning-generation-granularity-v3.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
