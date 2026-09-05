// Deterministic evidence harness for the readiness-routing-cache-lag-bridge
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const ROUTABILITY_TEST =
  'test/query/query-executor-build-sql-and-routability.test.js';
const IDENTITY_OWNER_TEST =
  'test/control-plane/readiness-planning-snapshot-identity-owner.test.js';
const BARRIER_TEST =
  'test/control-plane/readiness-planning-cache-classification-barrier.test.js';
const GRANULARITY_TEST =
  'test/control-plane/readiness-planning-generation-granularity.test.js';
const SWEEP_MEMO_TEST = 'test/rebalancer/planning-sweep-memoization.test.js';
const IDENTITY_MEMO_TEST =
  'test/control-plane/projection-planning-identity-memoization.test.js';
const CHURN_LIVENESS_TEST =
  'test/control-plane/publication-readiness-churn-liveness.test.js';
const DEFERRAL_BOUNDED_TEST =
  'test/control-plane/readiness-planning-deferral-bounded.test.js';
const PERSISTENCE_TEST =
  'test/control-plane/readiness-snapshot-persistence.test.js';
const SEMANTIC_GENERATION_TEST =
  'test/control-plane/readiness-planning-semantic-generation.test.js';
const SINGLE_OWNER_RECEIPT_TEST =
  'test/control-plane/single-readiness-owner.receipt.test.js';
const SEED_REBALANCE_TEST =
  'test/integration/three-node-seed-rebalance.integration.test.js';
const HEARTBEAT_WINDOW_TEST =
  'test/control-plane/readiness-routing-heartbeat-window.test.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'B1-routing-bridges-regressed-row-until-lease-expiry',
    testFile: ROUTABILITY_TEST,
    detail: 'query routing keeps accepting a replica whose visible node row ' +
      'regressed behind a fresher stored readiness snapshot, on both the ' +
      'async-then-sync and the sync-only paths, and stops exactly when the ' +
      'ready lease expires (CL-012 cache-lag contract on the single planning ' +
      'owner); red-on-revert: the barrier-blocked and live-veto reads ' +
      'returning the all-false deferred snapshot',
  }),
  Object.freeze({
    id: 'B1b-real-cache-heartbeat-window-never-closes-routing',
    testFile: HEARTBEAT_WINDOW_TEST,
    detail: 'with the REAL SystemTableCache (listeners deferred to a ' +
      'macrotask), readiness service, and query executor: a fresh heartbeat ' +
      'never closes routing to the node — not in the apply-before-listener ' +
      'barrier window, not after classification, not across queued owner ' +
      'rebuilds — and a silent node whose lease lapsed is refused at once ' +
      'and after the rebuild; red-on-revert: the barrier-window read ' +
      'returning the deferred snapshot',
  }),
  Object.freeze({
    id: 'B2-barrier-still-fails-closed-without-stored-evidence',
    testFile: BARRIER_TEST,
    detail: 'a cache apply still closes admission until its exact revision ' +
      'is classified when no reusable stored evidence exists: the bridge ' +
      'never builds through the barrier and a prequeued drain cannot either',
  }),
  Object.freeze({
    id: 'B3-identity-owner-and-build-rate-unchanged',
    testFile: IDENTITY_OWNER_TEST,
    detail: 'a stale stored snapshot identity is never republished under a ' +
      'current outer planning identity; gate and planning build counts over ' +
      'formation-shaped churn do not regress',
  }),
  Object.freeze({
    id: 'B4-generation-granularity-contract-holds',
    testFile: GRANULARITY_TEST,
    detail: 'per-node and global generation rotation, the build transaction ' +
      'launder guard, and bounded macrotask builds hold with the bridge',
  }),
  Object.freeze({
    id: 'B5-memo-currency-unchanged',
    testFile: SWEEP_MEMO_TEST,
    detail: 'planning sweep memoization keys and the saturated-window ' +
      'fallback are unchanged',
  }),
  Object.freeze({
    id: 'B6-projection-identity-memo-unchanged',
    testFile: IDENTITY_MEMO_TEST,
    detail: 'projection planning identity memoization and the fail-closed ' +
      'barrier remain intact',
  }),
  Object.freeze({
    id: 'B7-churn-liveness-holds',
    testFile: CHURN_LIVENESS_TEST,
    detail: 'publication readiness churn converges with one direct ' +
      'projection build per cache event',
  }),
  Object.freeze({
    id: 'B8-deferral-bounded',
    testFile: DEFERRAL_BOUNDED_TEST,
    detail: 'readiness planning deferral stays bounded: the bridge adds no ' +
      'unbounded rebuild loop',
  }),
  Object.freeze({
    id: 'B9-stored-snapshot-persistence-contract',
    testFile: PERSISTENCE_TEST,
    detail: 'the stored readiness snapshot persistence contract (CL-012 ' +
      'witnesses, invalidation, transitions) is unchanged',
  }),
  Object.freeze({
    id: 'B10-semantic-generation-tracker-unchanged',
    testFile: SEMANTIC_GENERATION_TEST,
    detail: 'semantic generation classification and re-baseline stay intact',
  }),
  Object.freeze({
    id: 'B11-single-readiness-owner-receipt',
    testFile: SINGLE_OWNER_RECEIPT_TEST,
    detail: 'the single planning owner receipt (52 -> 1 owners) still holds',
  }),
  Object.freeze({
    id: 'B12-live-seed-rebalance-converges',
    testFile: SEED_REBALANCE_TEST,
    detail: 'the deterministic three-node seed rebalance witness converges ' +
      'with routing served through the bridged owner',
  }),
]);

const QUEST_ID = 'readiness-routing-cache-lag-bridge';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'readiness-routing-cache-lag-bridge.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
