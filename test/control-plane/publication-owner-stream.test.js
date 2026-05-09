import {test} from '../../src/test-helpers/tap.js';
import {
  PUBLICATION_OWNER_ACK_EVIDENCE_STATE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_REVISION_STATE,
  PUBLICATION_OWNER_STREAM_OUTCOME,
} from '../../src/control-plane/publication-owner-constants.js';
import {buildPublicationOwnerStreamState} from
  '../../src/control-plane/publication-owner-state.js';

const TEST_PUBLICATION_REVISION = Object.freeze({
  COMMITTED: 4,
  DESIRED: 5,
  FRONTIER: 4,
});
const TEST_PUBLICATION_COUNT = Object.freeze({
  FRONTIER_PENDING_ACK: 1,
  FRONTIER_MISSING_PUBLISHED: 3,
});
const TEST_NODE_ID = Object.freeze({
  FIRST: 'node-a',
  SECOND: 'node-b',
  FRONTIER_ACK_PENDING: '11601fe0-72d6-5853-8590-ec2881853e72',
  FRONTIER_PUBLISHED: '7493b0ab-a054-5fad-a91b-5e331db29304',
  FRONTIER_MISSING_FIRST: '35a891b8-c1a0-5064-9c6e-2acfba61c2a7',
  FRONTIER_MISSING_SECOND: '8be8d30f-4499-5eed-865c-71b4d529a67a',
  FRONTIER_MISSING_THIRD: 'ebc4aa0b-06c6-506d-93ea-1dd2deca3f58',
});
const TEST_PUBLICATION_RECOVERY_PROTOCOL = Object.freeze({
  PUBLICATION_PENDING: 'publication_pending',
});

test('publication owner stream exposes pending ACK state by revision',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_REVISION.DESIRED,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST],
    });

    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK);
    t.equal(
      stream.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK,
    );
    t.same(stream.pendingAckNodeIds, [TEST_NODE_ID.SECOND]);
    t.equal(
      stream.revision.desired.value,
      TEST_PUBLICATION_REVISION.DESIRED,
    );
    t.end();
  });

test('publication owner stream fences stale consumer revisions',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      desiredPublicationRevision: TEST_PUBLICATION_REVISION.DESIRED,
      committedPublicationRevision: TEST_PUBLICATION_REVISION.COMMITTED,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST],
    });

    t.equal(stream.revision.state, PUBLICATION_OWNER_REVISION_STATE.ADVANCING);
    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.REVISION_LAG);
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.STALE);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
    );
    t.end();
  });

test('publication owner stream keeps report ACK debt ahead of missing visibility',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_REVISION.FRONTIER,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      pendingAckNodeIds: [TEST_NODE_ID.FRONTIER_ACK_PENDING],
      pendingAckCount: TEST_PUBLICATION_COUNT.FRONTIER_PENDING_ACK,
      missingPublishedNodeIds: [
        TEST_NODE_ID.FRONTIER_MISSING_FIRST,
        TEST_NODE_ID.FRONTIER_MISSING_SECOND,
        TEST_NODE_ID.FRONTIER_MISSING_THIRD,
      ],
      recoveryProtocolState:
        TEST_PUBLICATION_RECOVERY_PROTOCOL.PUBLICATION_PENDING,
      prioritySpreadPending: true,
    });

    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK);
    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.ACK_LAG);
    t.equal(
      stream.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK,
    );
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_ACK,
    );
    t.same(stream.pendingAckNodeIds, [TEST_NODE_ID.FRONTIER_ACK_PENDING]);
    t.same(stream.missingPublishedNodeIds, [
      TEST_NODE_ID.FRONTIER_MISSING_FIRST,
      TEST_NODE_ID.FRONTIER_MISSING_SECOND,
      TEST_NODE_ID.FRONTIER_MISSING_THIRD,
    ]);
    t.end();
  });

test('publication owner stream preserves count-only ACK debt without pending node ids',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_REVISION.FRONTIER,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
      pendingAckNodeIds: [],
      pendingAckCount: TEST_PUBLICATION_COUNT.FRONTIER_PENDING_ACK,
      missingPublishedNodeIds: [
        TEST_NODE_ID.FRONTIER_ACK_PENDING,
        TEST_NODE_ID.FRONTIER_MISSING_SECOND,
        TEST_NODE_ID.FRONTIER_MISSING_THIRD,
      ],
      missingPublishedCount: TEST_PUBLICATION_COUNT.FRONTIER_MISSING_PUBLISHED,
      recoveryProtocolState:
        TEST_PUBLICATION_RECOVERY_PROTOCOL.PUBLICATION_PENDING,
      prioritySpreadPending: true,
    });

    t.equal(
      stream.pendingAckEvidenceState,
      PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY,
    );
    t.equal(
      stream.pendingAckCount,
      TEST_PUBLICATION_COUNT.FRONTIER_PENDING_ACK,
    );
    t.same(stream.pendingAckNodeIds, []);
    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK);
    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.ACK_LAG);
    t.equal(
      stream.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK,
    );
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_ACK,
    );
    t.equal(
      stream.missingPublishedCount,
      TEST_PUBLICATION_COUNT.FRONTIER_MISSING_PUBLISHED,
    );
    t.end();
  });

test('publication owner stream does not publish ACK_PENDING status without ACK evidence',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_REVISION.FRONTIER,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
    });

    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.UNAVAILABLE);
    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING);
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    );
    t.end();
  });

test('publication owner stream reports consumer lag from missing publication visibility',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_REVISION.DESIRED,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      missingPublishedNodeIds: [TEST_NODE_ID.SECOND],
    });

    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG);
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.STALE);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
    );
    t.same(stream.missingPublishedNodeIds, [TEST_NODE_ID.SECOND]);
    t.end();
  });

test('publication owner stream reports recovery outcome after publication closes',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_REVISION.DESIRED,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST, TEST_NODE_ID.SECOND],
      prioritySpreadPending: true,
    });

    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.RECOVERY_LAG);
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.RECOVERING);
    t.equal(stream.recoveryOutcome, PUBLICATION_OWNER_RECOVERY_OUTCOME.RECOVERING);
    t.end();
  });

test('publication owner stream reports a fresh published revision',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_REVISION.DESIRED,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      requiredAckNodeIds: [TEST_NODE_ID.FIRST],
      acknowledgedNodeIds: [TEST_NODE_ID.FIRST],
    });

    t.equal(stream.revision.state, PUBLICATION_OWNER_REVISION_STATE.CURRENT);
    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED);
    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.FRESH);
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHED);
    t.equal(stream.recoveryOutcome, PUBLICATION_OWNER_RECOVERY_OUTCOME.READY);
    t.end();
  });
