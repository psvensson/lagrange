import {test} from '../../src/test-helpers/tap.js';
import {
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
});
const TEST_NODE_ID = Object.freeze({
  FIRST: 'node-a',
  SECOND: 'node-b',
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
