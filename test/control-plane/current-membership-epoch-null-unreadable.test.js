/**
 * Current membership epoch: NULL means unreadable, never epoch 0
 * (quest current-membership-epoch-null-unreadable).
 *
 * While a membership publication is absent or still ESTABLISHING, the
 * readiness planning answer carries `publishedPlanningEpoch: null`. The
 * readiness owner's current-epoch read decoded that with `Number(null)`,
 * which is 0, so the epoch fences saw a readable current epoch 0: the
 * planner stamped moves with epoch 0, creation compared 0 === 0 and
 * persisted them, and the dispatch fence later failed them as "Stale
 * dispatch for published membership epoch 0" once the first publication
 * landed. One reader now owns the decode: null/absent -> unreadable (null),
 * non-negative integer -> that epoch.
 *
 * Receipts:
 * - C1-establishing-publication-unreadable
 * - C2-published-epoch-preserved (including epoch zero)
 * - C3-absent-publication-unreadable
 * - C4-planner-reads-unreadable-not-zero
 * - C5-creation-fence-defers-not-stale
 * - C6-dispatch-fence-defers-not-stale
 * - C7-single-reader-inventory
 */

import fs from 'node:fs';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {NUM} from '../../src/constants/index.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  readPublishedMembershipEpoch,
} from '../../src/control-plane/published-membership-epoch-reading.js';
import {REBALANCER_SKIP_REASON} from
  '../../src/rebalancer/rebalancer-constants.js';
import {UnifiedRebalancer} from
  '../../src/rebalancer/unified-rebalancer.js';
import {
  UNIFIED_REBALANCER_SHARED,
} from '../../src/rebalancer/unified-rebalancer-shared.js';
import {createCache} from
  './control-plane-readiness-service-test-support.js';
import {
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockCoordinator,
} from '../rebalancer/test-helpers.js';
import {
  TEST_NODE_ID,
  TEST_PARTITION_ID,
  buildEpochBoundAddMove,
  buildEpochBoundAddOperation,
  createEpochCoordinator,
  grantEpochCoordinatorStorageAdmission,
  wireEpochDispatchProbe,
} from '../rebalancer/epoch-fence-test-harness.js';

const {EntityType} = UNIFIED_REBALANCER_SHARED;

const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PUBLICATION_STATUS_ESTABLISHING = 'ESTABLISHING';
const EPOCH_ZERO = 0;
const EPOCH_ONE = 1;
const EPOCH_THREE = 3;
const STALE_PLACEMENT_PATTERN = /Stale placement plan/;
const STALE_DISPATCH_PATTERN = /Stale dispatch for published membership/;

const SRC_ROOT = path.resolve(process.cwd(), 'src');
const READER_MODULE = 'src/control-plane/published-membership-epoch-reading.js';
const READER_IMPORT_PATTERN = /published-membership-epoch-reading\.js'/;
const READER_CONSUMERS = Object.freeze([
  'src/control-plane/control-plane-readiness-publication-planning-snapshot.js',
  'src/rebalancer/operation-workflow-dispatch-epoch-gate.js',
]);
const CURRENT_EPOCH_TOKEN_PATTERN =
  /publishedPlanningEpoch|getCurrentPublishedMembershipEpoch/;
const NUMERIC_REINTERPRETATION_PATTERN =
  /\b(?:Number|parseInt|parseFloat|Math\.\w+)\(\s*[^;]*?(?:publishedPlanningEpoch|getCurrentPublishedMembershipEpoch)/;
const BLOCK_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_PATTERN = /\/\/[^\n]*/g;
// Files that mention the current-epoch surface without decoding it: the
// planning answer producers/consumers that carry the value as-is.
const CURRENT_EPOCH_PASSTHROUGH = Object.freeze([
  'src/control-plane/recovery-protocol-snapshot.js',
  'src/control-plane/membership-publication-candidate-derivation.js',
  'src/control-plane/projection-readiness-evidence-source.js',
  'src/control-plane/projection-readiness-evidence.js',
  'src/rebalancer/rebalance-coordinator-owner-delegation-methods.js',
  'src/rebalancer/unified-rebalancer-rebalance-loop.js',
  'src/rebalancer/rebalance-coordinator-lifecycle.js',
  'src/rebalancer/operation-workflow-owner-retry-registry.js',
]);

function initializeConfig() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
    },
  });
}

function buildPublicationRow(status, publicationEpoch, now) {
  return {
    publicationEpoch,
    status,
    createdAt: now,
    publishedActiveNodeIds: [TEST_NODE_ID],
  };
}

/**
 * The REAL readiness owner over a membership-publication double that
 * returns `publication` as the latest publication for every node.
 */
function createReadinessOwner(publication, now) {
  return new ControlPlaneReadinessService({
    nodeId: TEST_NODE_ID,
    systemTableCache: createCache(),
    membershipPublicationService: {
      getLatestPublicationForNodeSync() {
        return publication;
      },
    },
    now: () => now,
  });
}

function readCurrentEpochThrough(readinessOwner) {
  return (nodeId, observedAt) =>
    readinessOwner.getCurrentPublishedMembershipEpochSync(nodeId, observedAt);
}

// --- C1 / C2 / C3: the readiness owner's read ---

test('C1-establishing-publication-unreadable: a publication that is not ' +
  'yet PUBLISHED yields an unreadable current epoch, never 0',
async (t) => {
  const now = Date.now();
  const owner = createReadinessOwner(
    buildPublicationRow(PUBLICATION_STATUS_ESTABLISHING, EPOCH_ONE, now),
    now,
  );
  const answer = owner.getMembershipPublicationPlanningAnswerSync(
    TEST_NODE_ID,
    now,
  );
  t.equal(
    answer?.publishedPlanningEpoch,
    null,
    'the planning answer carries no PUBLISHED epoch while establishing',
  );
  const currentEpoch = owner.getCurrentPublishedMembershipEpochSync(
    TEST_NODE_ID,
    now,
  );
  t.equal(currentEpoch, null, 'the current epoch reads as unreadable');
  t.ok(currentEpoch !== EPOCH_ZERO, 'the current epoch never reads as 0');
});

test('C2-published-epoch-preserved: a PUBLISHED epoch reads as exactly ' +
  'that epoch, including epoch zero',
async (t) => {
  const now = Date.now();
  for (const epoch of [EPOCH_ZERO, EPOCH_ONE, EPOCH_THREE]) {
    const owner = createReadinessOwner(
      buildPublicationRow(PUBLICATION_STATUS_PUBLISHED, epoch, now),
      now,
    );
    t.equal(
      owner.getCurrentPublishedMembershipEpochSync(TEST_NODE_ID, now),
      epoch,
      `PUBLISHED epoch ${epoch} reads as ${epoch}`,
    );
  }
  const decodeTable = [
    {raw: null, expected: null},
    {raw: undefined, expected: null},
    {raw: EPOCH_ZERO, expected: EPOCH_ZERO},
    {raw: EPOCH_THREE, expected: EPOCH_THREE},
    {raw: '', expected: null},
    {raw: '3', expected: null},
    {raw: Number.NaN, expected: null},
    {raw: Number.POSITIVE_INFINITY, expected: null},
    {raw: -1, expected: null},
    {raw: 1.5, expected: null},
    {raw: true, expected: null},
    {raw: Object(3), expected: null},
  ];
  for (const {raw, expected} of decodeTable) {
    t.equal(
      readPublishedMembershipEpoch(raw),
      expected,
      `read(${typeof raw}:${String(raw)}) is ${expected}`,
    );
  }
});

test('C3-absent-publication-unreadable: no publication row yields an ' +
  'unreadable current epoch',
async (t) => {
  const now = Date.now();
  const owner = createReadinessOwner(null, now);
  t.equal(
    owner.getCurrentPublishedMembershipEpochSync(TEST_NODE_ID, now),
    null,
    'an absent publication is unreadable',
  );
});

// --- C4: the planner's read ---

test('C4-planner-reads-unreadable-not-zero: the rebalance planner reads the ' +
  'real readiness owner and gets no epoch to stamp while establishing',
async (t) => {
  initializeConfig();
  const now = Date.now();
  const establishing = createReadinessOwner(
    buildPublicationRow(PUBLICATION_STATUS_ESTABLISHING, EPOCH_ONE, now),
    now,
  );
  const published = createReadinessOwner(
    buildPublicationRow(PUBLICATION_STATUS_PUBLISHED, EPOCH_THREE, now),
    now,
  );
  for (const [label, owner, expected] of [
    ['establishing', establishing, null],
    ['published', published, EPOCH_THREE],
  ]) {
    const rebalancer = new UnifiedRebalancer({
      entityId: TEST_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_ID,
      systemTableCache: createMockCache(),
      cdcIntegrationService: createMockCdcService(),
      tablePolicyService: createMockPolicyService(),
      messageRouter: createMockMessageRouter(),
      controlPlaneReadinessService: owner,
      // The rebalancer adopts its container's readiness owner; hand the
      // coordinator double the same real owner so the planner's read is
      // the owner under test.
      rebalanceCoordinator: {
        ...createMockCoordinator(),
        controlPlaneReadinessService: owner,
      },
    });
    try {
      t.equal(
        rebalancer.resolvePublishedMembershipPlanningEpoch(),
        expected,
        `${label}: the planner reads ${expected} (no epoch-0 stamping)`,
      );
    } finally {
      rebalancer.shutdown();
    }
  }
});

// --- C5: creation fence ---

test('C5-creation-fence-defers-not-stale: an epoch-bound move created while ' +
  'the publication is establishing is deferred as unavailable, not rejected ' +
  'as a stale plan for epoch 0',
async (t) => {
  initializeConfig();
  const now = Date.now();
  const owner = createReadinessOwner(
    buildPublicationRow(PUBLICATION_STATUS_ESTABLISHING, EPOCH_ONE, now),
    now,
  );
  const {coordinator, persistedRowCount} = createEpochCoordinator({
    currentEpoch: null,
    readCurrentPublishedEpoch: readCurrentEpochThrough(owner),
  });
  grantEpochCoordinatorStorageAdmission(coordinator);
  try {
    await coordinator.createOperation(buildEpochBoundAddMove(EPOCH_ONE));
    t.fail('an establishing publication must not admit an epoch-bound move');
  } catch (error) {
    t.equal(
      error?.rebalanceSkipReason,
      REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE,
      'the creation fence defers on an unreadable current epoch',
    );
    t.notMatch(
      String(error?.message),
      STALE_PLACEMENT_PATTERN,
      'the move is not rejected as a stale plan against epoch 0',
    );
    t.equal(
      error?.currentMembershipPublicationEpoch,
      undefined,
      'no fabricated current epoch is reported',
    );
  } finally {
    t.equal(persistedRowCount(), 0, 'nothing is persisted while deferred');
    await coordinator.shutdown();
  }
});

// --- C6: dispatch fence ---

test('C6-dispatch-fence-defers-not-stale: an epoch-bound ADD dispatched ' +
  'while the publication is establishing is deferred, not failed as stale',
async (t) => {
  initializeConfig();
  const now = Date.now();
  const owner = createReadinessOwner(
    buildPublicationRow(PUBLICATION_STATUS_ESTABLISHING, EPOCH_ONE, now),
    now,
  );
  const {coordinator} = createEpochCoordinator({
    currentEpoch: null,
    readCurrentPublishedEpoch: readCurrentEpochThrough(owner),
  });
  try {
    const {deliveredRequests, failedOperations, dispatch} =
      wireEpochDispatchProbe(coordinator);
    const result = await dispatch(buildEpochBoundAddOperation(EPOCH_ONE));
    t.equal(result?.skipped, true, 'the dispatch is skipped');
    t.equal(
      result?.reason,
      REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
      'the skip defers into the dispatch-retry path',
    );
    t.equal(deliveredRequests.length, 0, 'nothing dispatches unfenced');
    t.equal(failedOperations.length, 0, 'the operation is not failed closed');
    t.notOk(
      failedOperations.some((failure) =>
        STALE_DISPATCH_PATTERN.test(String(failure.message))),
      'no stale-dispatch failure against epoch 0 is recorded',
    );
  } finally {
    await coordinator.shutdown();
  }
});

// --- C7: inventory ---

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(BLOCK_COMMENT_PATTERN, '')
    .replace(LINE_COMMENT_PATTERN, '');
}

test('C7-single-reader-inventory: every src reader of the current published ' +
  'epoch surface is classified and the decoding readers consume one reader',
async (t) => {
  const consumers = new Set(READER_CONSUMERS);
  const passthrough = new Set(CURRENT_EPOCH_PASSTHROUGH);
  const seen = new Set();
  let reinterpretations = 0;
  for (const file of listJsFiles(SRC_ROOT)) {
    const relative = path.relative(process.cwd(), file);
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    if (!CURRENT_EPOCH_TOKEN_PATTERN.test(source)) {
      continue;
    }
    seen.add(relative);
    if (relative === READER_MODULE) {
      continue;
    }
    const numeric = NUMERIC_REINTERPRETATION_PATTERN.test(source);
    if (numeric) {
      reinterpretations += 1;
    }
    t.notOk(numeric, `${relative}: no numeric reinterpretation of the surface`);
    if (consumers.has(relative)) {
      t.ok(
        READER_IMPORT_PATTERN.test(source),
        `${relative}: decoding reader imports the single reader`,
      );
      continue;
    }
    t.ok(
      passthrough.has(relative),
      `${relative}: an unclassified reader of the current epoch surface ` +
        'appeared; route it through the reader or classify it as passthrough',
    );
  }
  for (const consumer of READER_CONSUMERS) {
    t.ok(seen.has(consumer), `${consumer}: still reads the surface (vacuity)`);
  }
  t.equal(reinterpretations, 0, 'zero numeric reinterpretations');
});
