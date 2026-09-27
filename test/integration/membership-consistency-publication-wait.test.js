import {test} from '../../src/test-helpers/tap.js';
import {
  readAtSettledPlacement,
} from './membership-consistency-integration-test-helpers.js';

const NODE_ID = 'seed-node';
const OTHER_NODE_ID = 'other-node';
const DECISION_DIMENSION = 'placementEligible';
const PUBLISHED = 'PUBLISHED';
const OPEN = 'OPEN';
const ABANDONED = 'ABANDONED';

function publication(status, nodeIds = [], reasonCode = null) {
  return {
    publicationId: 'membership-publication:1:test',
    publicationKind: 'cluster_membership',
    publicationEpoch: 1,
    status,
    reasonCode,
    publishedActiveNodeIds: [...nodeIds],
  };
}

function createOwnerHarness(options = {}) {
  const state = {
    publication: options.publication || publication(OPEN),
    eligible: options.eligible === true,
  };
  const listeners = new Set();
  const counts = {
    authoritativeReads: 0,
    membershipMutations: 0,
    placementReads: 0,
    setup: 0,
    subscriptions: 0,
  };
  const membershipPublicationService = {
    async getLatestClusterPublication(readOptions) {
      counts.authoritativeReads += 1;
      if (readOptions?.readSource !== 'authoritative_preferred') {
        throw new Error('publication read did not request authoritative owner');
      }
      return state.publication;
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
      counts.subscriptions += 1;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const reader = {
    resolveNodeReadinessDecisionDimension: () => DECISION_DIMENSION,
    isReadinessDimensionSatisfied: (snapshot, dimension) =>
      snapshot?.dimensions?.[dimension] === true,
  };
  return {
    counts,
    owners: {controlPlaneReadinessService, membershipPublicationService},
    reader,
    emitReadiness() {
      for (const listener of listeners) listener({ownerKey: NODE_ID});
    },
    publish(nodeIds) {
      counts.membershipMutations += 1;
      state.publication = publication(PUBLISHED, nodeIds);
    },
    readPlacement() {
      counts.placementReads += 1;
      return state.eligible ? [NODE_ID] : [];
    },
    setup() {
      counts.setup += 1;
    },
    setEligible(eligible) {
      state.eligible = eligible;
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

test('owner-facing placement waiter does not release on weaker readiness',
  async (t) => {
    const harness = createOwnerHarness({
      publication: publication(PUBLISHED, [NODE_ID, OTHER_NODE_ID]),
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
    const result = await pending;
    t.equal(result.settled, true, 'canonical readiness releases placement');
    t.same(result.value, [NODE_ID], 'the released read preserves its assertion');
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
    harness.publish([NODE_ID, OTHER_NODE_ID]);
    harness.emitReadiness();
    const result = await pending;

    t.equal(result.settled, true, 'canonical publication releases placement');
    t.same(result.value, [NODE_ID], 'existing placement assertion remains');
    t.equal(harness.counts.setup, 1, 'setup runs exactly once');
    t.equal(harness.counts.membershipMutations, 1,
      'membership mutation runs exactly once');
    t.equal(harness.counts.placementReads, 1,
      'placement is consumed exactly once');
  });

test('publication immediately before waiter registration is found by recheck',
  async (t) => {
    const harness = createOwnerHarness({eligible: true});
    harness.publish([NODE_ID, OTHER_NODE_ID]);
    harness.emitReadiness();

    const result = await readAtSettledPlacement(
      harness.owners,
      settledPoint(harness.reader),
      () => harness.readPlacement(),
    );

    t.equal(result.settled, true,
      'authoritative recheck observes the event without timeout rescue');
    t.equal(harness.counts.subscriptions, 1,
      'registration still precedes the authoritative check');
    t.equal(harness.counts.placementReads, 1,
      'the already-current generation is consumed once');
  });

test('terminal publication refusal fails closed with owner reason', async (t) => {
  const harness = createOwnerHarness({
    publication: publication(ABANDONED, [], 'fixture_publication_refused'),
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
});
