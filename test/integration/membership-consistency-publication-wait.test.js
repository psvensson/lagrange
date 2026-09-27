import {test} from '../../src/test-helpers/tap.js';
import {
  TEST_TIMEOUTS,
  readAtSettledPlacement,
} from './membership-consistency-integration-test-helpers.js';

const NODE_ID = 'seed-node';
const OTHER_NODE_ID = 'other-node';
const DECISION_DIMENSION = 'placementEligible';
const PUBLISHED = 'PUBLISHED';
const OPEN = 'OPEN';
const ABANDONED = 'ABANDONED';

function publication(status, nodeIds = [], reasonCode = null, epoch = 1) {
  return {
    publicationId: `membership-publication:${epoch}:test`,
    publicationKind: 'cluster_membership',
    publicationEpoch: epoch,
    status,
    reasonCode,
    publishedActiveNodeIds: [...nodeIds],
  };
}

function createOwnerHarness(options = {}) {
  const state = {
    authoritativePublication:
      options.authoritativePublication || publication(OPEN),
    enforcementPublication: options.enforcementPublication || null,
    eligible: options.eligible === true,
  };
  const readinessListeners = new Set();
  const cacheListeners = new Set();
  const counts = {
    authoritativeReads: 0,
    cacheSubscriptions: 0,
    membershipMutations: 0,
    placementReads: 0,
    readinessSubscriptions: 0,
    setup: 0,
  };
  const systemTableCache = {
    onCacheChange(listener) {
      counts.cacheSubscriptions += 1;
      cacheListeners.add(listener);
    },
    offCacheChange(listener) {
      return cacheListeners.delete(listener);
    },
  };
  const membershipPublicationService = {
    async getLatestClusterPublication(readOptions) {
      counts.authoritativeReads += 1;
      if (readOptions?.readSource !== 'authoritative_preferred') {
        throw new Error('publication read did not request authoritative owner');
      }
      return state.authoritativePublication;
    },
    isTerminalPublicationStatus(status) {
      return [PUBLISHED, ABANDONED, 'SUPERSEDED'].includes(status);
    },
  };
  const readinessSnapshot = () => ({
    dimensions: {[DECISION_DIMENSION]: state.eligible},
  });
  const controlPlaneReadinessService = {
    async getNodeReadiness() {
      return readinessSnapshot();
    },
    getNodeReadinessSync() {
      return readinessSnapshot();
    },
    subscribeReadinessPlanningSnapshots(listener) {
      counts.readinessSubscriptions += 1;
      readinessListeners.add(listener);
      return () => readinessListeners.delete(listener);
    },
  };
  const reader = {
    systemTableCache,
    getLatestPublishedMembershipRow: () => state.enforcementPublication,
    resolveNodeReadinessDecisionDimension: () => DECISION_DIMENSION,
    isReadinessDimensionSatisfied: (snapshot, dimension) =>
      snapshot?.dimensions?.[dimension] === true,
  };
  return {
    counts,
    owners: {
      cache: systemTableCache,
      controlPlaneReadinessService,
      membershipPublicationService,
    },
    reader,
    activeListeners() {
      return readinessListeners.size + cacheListeners.size;
    },
    emitPublicationCacheChange() {
      for (const listener of cacheListeners) {
        listener('control_plane_publications', 'UPDATE',
          state.enforcementPublication);
      }
    },
    emitReadiness() {
      for (const listener of readinessListeners) listener({ownerKey: NODE_ID});
    },
    publishAuthoritative(nodeIds) {
      counts.membershipMutations += 1;
      state.authoritativePublication = publication(PUBLISHED, nodeIds);
    },
    refuse(reasonCode) {
      state.authoritativePublication = publication(
        ABANDONED,
        [],
        reasonCode,
        2,
      );
      this.emitPublicationCacheChange();
    },
    readPlacement() {
      counts.placementReads += 1;
      const enforcementNodeIds =
        state.enforcementPublication?.publishedActiveNodeIds || [];
      return state.eligible && enforcementNodeIds.includes(NODE_ID) ?
        [NODE_ID] : [];
    },
    setup() {
      counts.setup += 1;
    },
    setEligible(eligible) {
      state.eligible = eligible;
    },
    synchronizeEnforcement() {
      state.enforcementPublication = state.authoritativePublication;
      this.emitPublicationCacheChange();
    },
  };
}

function settledPoint(reader) {
  return {
    publishedNodeIds: [NODE_ID, OTHER_NODE_ID],
    eligibleNodeId: NODE_ID,
    readers: [reader],
  };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('weaker readiness and stale enforcement publication do not release',
  async (t) => {
    const harness = createOwnerHarness({
      authoritativePublication:
        publication(PUBLISHED, [NODE_ID, OTHER_NODE_ID]),
      enforcementPublication: publication(PUBLISHED, [], null, 0),
      eligible: false,
    });
    let released = false;
    const pending = readAtSettledPlacement(
      harness.owners,
      settledPoint(harness.reader),
      () => harness.readPlacement(),
    ).then((result) => {
      released = true;
      return result;
    });

    await nextTurn();
    t.equal(released, false, 'weaker readiness must not release placement');
    t.equal(harness.counts.placementReads, 0,
      'the same-turn placement read must remain closed');

    harness.setEligible(true);
    harness.emitReadiness();
    await nextTurn();
    t.equal(released, false,
      'authoritative membership cannot outrun the enforcement cache');
    t.equal(harness.counts.placementReads, 0,
      'stale enforcement publication keeps placement closed');

    harness.synchronizeEnforcement();
    const result = await pending;
    t.equal(result.settled, true,
      'canonical readiness and synchronized enforcement release placement');
    t.same(result.value, [NODE_ID], 'the released read preserves its assertion');
    t.equal(harness.activeListeners(), 0,
      'successful convergence cleans up every subscription');
  });

test('canonical publication event releases once without repeating setup or mutation',
  async (t) => {
    const harness = createOwnerHarness({eligible: true});
    const pending = readAtSettledPlacement(
      harness.owners,
      settledPoint(harness.reader),
      () => harness.readPlacement(),
    );
    await nextTurn();

    harness.setup();
    harness.publishAuthoritative([NODE_ID, OTHER_NODE_ID]);
    harness.emitPublicationCacheChange();
    await nextTurn();
    t.equal(harness.counts.placementReads, 0,
      'authoritative publication alone cannot release placement');
    harness.synchronizeEnforcement();
    const result = await pending;

    t.equal(result.settled, true, 'canonical publication releases placement');
    t.same(result.value, [NODE_ID], 'existing placement assertion remains');
    t.equal(harness.counts.setup, 1, 'setup runs exactly once');
    t.equal(harness.counts.membershipMutations, 1,
      'membership mutation runs exactly once');
    t.equal(harness.counts.placementReads, 1,
      'placement is consumed exactly once');
    t.equal(harness.activeListeners(), 0,
      'canonical release cleans up every subscription');
  });

test('publication immediately before waiter registration is found by recheck',
  async (t) => {
    const harness = createOwnerHarness({eligible: true});
    harness.publishAuthoritative([NODE_ID, OTHER_NODE_ID]);
    harness.synchronizeEnforcement();
    harness.emitReadiness();

    const result = await readAtSettledPlacement(
      harness.owners,
      settledPoint(harness.reader),
      () => harness.readPlacement(),
    );

    t.equal(result.settled, true,
      'authoritative recheck observes the event without timeout rescue');
    t.equal(harness.counts.readinessSubscriptions, 1,
      'readiness registration still precedes the authoritative check');
    t.equal(harness.counts.cacheSubscriptions, 1,
      'publication-cache registration precedes the authoritative check');
    t.equal(harness.counts.placementReads, 1,
      'the already-current generation is consumed once');
  });

test('terminal publication refusal fails closed with owner reason', async (t) => {
  const harness = createOwnerHarness({
    authoritativePublication:
      publication(ABANDONED, [], 'fixture_publication_refused'),
    eligible: true,
  });

  const result = await readAtSettledPlacement(
    harness.owners,
    settledPoint(harness.reader),
    () => harness.readPlacement(),
  );

  t.equal(result.settled, false, 'terminal refusal must not release placement');
  t.equal(result.terminal, true, 'the refusal is a terminal owner outcome');
  t.equal(result.publicationStatus, ABANDONED,
    'the owner status is preserved');
  t.equal(result.reasonCode, 'fixture_publication_refused',
    'the semantic owner reason is preserved');
  t.equal(harness.counts.placementReads, 0,
    'terminal failure closes the same-turn read');
  t.equal(harness.activeListeners(), 0,
    'terminal refusal cleans up every subscription');
});

test('terminal transition wakes a pending waiter and preserves owner reason',
  async (t) => {
    const harness = createOwnerHarness({eligible: true});
    const pending = readAtSettledPlacement(
      harness.owners,
      settledPoint(harness.reader),
      () => harness.readPlacement(),
    );
    await nextTurn();

    harness.refuse('fixture_publication_refused_after_pending');
    const result = await pending;

    t.equal(result.settled, false, 'terminal transition stays fail closed');
    t.equal(result.terminal, true, 'cache change wakes the pending waiter');
    t.equal(result.publicationStatus, ABANDONED,
      'the transitioned owner status is preserved');
    t.equal(result.reasonCode, 'fixture_publication_refused_after_pending',
      'the transitioned semantic reason is preserved');
    t.equal(harness.counts.placementReads, 0,
      'terminal transition never consumes placement');
    t.equal(harness.activeListeners(), 0,
      'terminal transition cleans up every subscription');
  });

test('placement wait uses the existing scaled publication timeout', async (t) => {
  const harness = createOwnerHarness({eligible: true});
  const error = await readAtSettledPlacement(
    harness.owners,
    settledPoint(harness.reader),
    () => harness.readPlacement(),
  ).then(() => null, (caught) => caught);

  t.equal(error?.timeoutMs, TEST_TIMEOUTS.TEST_TIMEOUT,
    'the bounded outcome carries the existing scaled timeout');
  t.equal(error?.timeoutClassification?.classification,
    'exact_boundary_hit',
    'the timeout records the exact bounded outcome');
  t.equal(error?.timeoutClassification?.originalClassification,
    'publication_wait_timeout',
    'the bounded outcome remains typed as a publication wait');
  t.equal(harness.counts.placementReads, 0,
    'timeout never consumes placement');
  t.equal(harness.activeListeners(), 0,
    'timeout cleans up every subscription');
});
