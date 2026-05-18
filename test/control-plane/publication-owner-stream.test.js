import {test} from '../../src/test-helpers/tap.js';
import {
  PUBLICATION_OWNER_ACK_EVIDENCE_STATE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_REASON,
  PUBLICATION_OWNER_REVISION_STATE,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
} from '../../src/control-plane/publication-owner-constants.js';
import {
  buildPublicationOwnerStreamState,
  isPublicationOwnerStreamPublicationPending,
} from '../../src/control-plane/publication-owner-state.js';

const TEST_PUBLICATION_REVISION = Object.freeze({
  COMMITTED: 4,
  DESIRED: 5,
  FRONTIER: 4,
});
const TEST_PUBLICATION_COUNT = Object.freeze({
  FRONTIER_PENDING_ACK: 1,
  OPEN_FRONTIER_MISSING_PUBLISHED: 5,
  OPEN_COUNT_ONLY_ACK_MISSING_PUBLISHED: 4,
  PUBLISHED_FRONTIER_PENDING_ACK: 0,
  FRONTIER_MISSING_PUBLISHED: 3,
});
const TEST_EMPTY_NODE_IDS = Object.freeze([]);
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
  UNPUBLISHED_OBSERVATION: 'unpublished_observation',
});
const TEST_PUBLICATION_PUBLISHED_FRONTIER = Object.freeze({
  EPOCH: 2,
  MISSING_COUNT: 3,
  MISSING_NODE_IDS: Object.freeze([
    TEST_NODE_ID.FRONTIER_ACK_PENDING,
    TEST_NODE_ID.FRONTIER_MISSING_SECOND,
    TEST_NODE_ID.FRONTIER_MISSING_THIRD,
  ]),
});
const TEST_PUBLICATION_OPEN_FRONTIER = Object.freeze({
  EPOCH: 1,
  MISSING_COUNT: TEST_PUBLICATION_COUNT.OPEN_COUNT_ONLY_ACK_MISSING_PUBLISHED,
  MISSING_NODE_IDS: Object.freeze([
    TEST_NODE_ID.FRONTIER_ACK_PENDING,
    TEST_NODE_ID.FRONTIER_MISSING_FIRST,
    TEST_NODE_ID.FRONTIER_MISSING_SECOND,
    TEST_NODE_ID.FRONTIER_MISSING_THIRD,
  ]),
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

test('publication owner stream settles published empty pending ACK list debt',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_PUBLISHED_FRONTIER.EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      pendingAckNodeIds: [],
      pendingAckCount: TEST_PUBLICATION_COUNT.FRONTIER_PENDING_ACK,
      missingPublishedNodeIds:
        TEST_PUBLICATION_PUBLISHED_FRONTIER.MISSING_NODE_IDS,
      missingPublishedCount: TEST_PUBLICATION_PUBLISHED_FRONTIER.MISSING_COUNT,
      recoveryProtocolState:
        TEST_PUBLICATION_RECOVERY_PROTOCOL.PUBLICATION_PENDING,
      publicationPending: true,
      prioritySpreadPending: true,
    });

    t.equal(
      stream.pendingAckEvidenceState,
      PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST,
    );
    t.equal(
      stream.pendingAckCount,
      TEST_PUBLICATION_COUNT.PUBLISHED_FRONTIER_PENDING_ACK,
    );
    t.same(stream.pendingAckNodeIds, []);
    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED);
    t.equal(
      stream.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG,
    );
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.STALE);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
    );
    t.equal(isPublicationOwnerStreamPublicationPending(stream), false);
    t.same(
      stream.missingPublishedNodeIds,
      TEST_PUBLICATION_PUBLISHED_FRONTIER.MISSING_NODE_IDS,
    );
    t.end();
  });

test('publication owner stream settles published count-only ACK frontier',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationRevision: TEST_PUBLICATION_PUBLISHED_FRONTIER.EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      pendingAckNodeIds: [],
      pendingAckCount: TEST_PUBLICATION_COUNT.PUBLISHED_FRONTIER_PENDING_ACK,
      missingPublishedNodeIds:
        TEST_PUBLICATION_PUBLISHED_FRONTIER.MISSING_NODE_IDS,
      missingPublishedCount: TEST_PUBLICATION_PUBLISHED_FRONTIER.MISSING_COUNT,
      recoveryProtocolState:
        TEST_PUBLICATION_RECOVERY_PROTOCOL.PUBLICATION_PENDING,
      publicationPending: true,
      prioritySpreadPending: true,
    });

    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED);
    t.equal(
      stream.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG,
    );
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.STALE);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
    );
    t.equal(isPublicationOwnerStreamPublicationPending(stream), false);
    t.equal(
      stream.reasonCodes.includes(
        PUBLICATION_OWNER_REASON.RECOVERY_PROTOCOL_PUBLICATION_PENDING,
      ),
      false,
    );
    t.same(
      stream.missingPublishedNodeIds,
      TEST_PUBLICATION_PUBLISHED_FRONTIER.MISSING_NODE_IDS,
    );
    t.end();
  });

test('publication owner stream classifies open missing active publication as publishing',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      pendingAckNodeIds: [],
      pendingAckCount: TEST_PUBLICATION_COUNT.PUBLISHED_FRONTIER_PENDING_ACK,
      missingPublishedNodeIds: [
        TEST_NODE_ID.FRONTIER_ACK_PENDING,
        TEST_NODE_ID.FRONTIER_PUBLISHED,
        TEST_NODE_ID.FRONTIER_MISSING_FIRST,
        TEST_NODE_ID.FRONTIER_MISSING_SECOND,
        TEST_NODE_ID.FRONTIER_MISSING_THIRD,
      ],
      missingPublishedCount:
        TEST_PUBLICATION_COUNT.OPEN_FRONTIER_MISSING_PUBLISHED,
      recoveryProtocolState:
        TEST_PUBLICATION_RECOVERY_PROTOCOL.PUBLICATION_PENDING,
      publicationPending: true,
      prioritySpreadPending: false,
    });

    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.UNAVAILABLE);
    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING);
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    );
    t.equal(isPublicationOwnerStreamPublicationPending(stream), true);
    t.equal(
      stream.missingPublishedCount,
      TEST_PUBLICATION_COUNT.OPEN_FRONTIER_MISSING_PUBLISHED,
    );
    t.end();
  });

test('publication owner stream does not treat open count-only ACK evidence as ACK lag',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      pendingAckNodeIds: [],
      pendingAckCount: TEST_PUBLICATION_COUNT.FRONTIER_PENDING_ACK,
      missingPublishedNodeIds: [
        TEST_NODE_ID.FRONTIER_ACK_PENDING,
        TEST_NODE_ID.FRONTIER_MISSING_FIRST,
        TEST_NODE_ID.FRONTIER_MISSING_SECOND,
        TEST_NODE_ID.FRONTIER_MISSING_THIRD,
      ],
      missingPublishedCount:
        TEST_PUBLICATION_COUNT.OPEN_COUNT_ONLY_ACK_MISSING_PUBLISHED,
      recoveryProtocolState:
        TEST_PUBLICATION_RECOVERY_PROTOCOL.PUBLICATION_PENDING,
      publicationPending: true,
      prioritySpreadPending: false,
    });

    t.equal(
      stream.pendingAckEvidenceState,
      PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY,
    );
    t.equal(
      stream.pendingAckCount,
      TEST_PUBLICATION_COUNT.PUBLISHED_FRONTIER_PENDING_ACK,
    );
    t.same(stream.pendingAckNodeIds, []);
    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.UNAVAILABLE);
    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING);
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    );
    t.equal(isPublicationOwnerStreamPublicationPending(stream), true);
    t.end();
  });

test('publication owner stream exposes open epoch publishing revision',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationEpoch: TEST_PUBLICATION_OPEN_FRONTIER.EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      pendingAckNodeIds: [],
      pendingAckCount: TEST_PUBLICATION_COUNT.PUBLISHED_FRONTIER_PENDING_ACK,
      missingPublishedNodeIds:
        TEST_PUBLICATION_OPEN_FRONTIER.MISSING_NODE_IDS,
      missingPublishedCount: TEST_PUBLICATION_OPEN_FRONTIER.MISSING_COUNT,
      recoveryProtocolState:
        TEST_PUBLICATION_RECOVERY_PROTOCOL.PUBLICATION_PENDING,
      publicationPending: true,
      prioritySpreadPending: true,
    });

    t.equal(stream.revision.state, PUBLICATION_OWNER_REVISION_STATE.ADVANCING);
    t.equal(
      stream.revision.observed.value,
      TEST_PUBLICATION_OPEN_FRONTIER.EPOCH,
    );
    t.equal(
      stream.revision.desired.value,
      TEST_PUBLICATION_OPEN_FRONTIER.EPOCH,
    );
    t.equal(
      stream.revision.committed.state,
      PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE,
    );
    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.UNAVAILABLE);
    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING);
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    );
    t.equal(isPublicationOwnerStreamPublicationPending(stream), true);
    t.end();
  });

test('publication owner stream classifies pending unpublished revision as publishing',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
      pendingAckNodeIds: [],
      pendingAckCount: TEST_PUBLICATION_COUNT.PUBLISHED_FRONTIER_PENDING_ACK,
      recoveryProtocolState:
        TEST_PUBLICATION_RECOVERY_PROTOCOL.UNPUBLISHED_OBSERVATION,
      publicationPending: true,
      prioritySpreadPending: false,
    });

    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.UNAVAILABLE);
    t.equal(stream.freshnessFence, PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING);
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    );
    t.equal(
      stream.reasonCodes.includes(
        PUBLICATION_OWNER_REASON.PUBLICATION_PENDING_HINT,
      ),
      true,
    );
    t.equal(
      stream.reasonCodes.includes(
        PUBLICATION_OWNER_REASON.UNPUBLISHED_OBSERVATION,
      ),
      true,
    );
    t.end();
  });

test('publication owner stream defers unknown count-only missing publication debt',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
      publicationRevision: TEST_PUBLICATION_COUNT.PUBLISHED_FRONTIER_PENDING_ACK,
      recoveryProtocolState:
        TEST_PUBLICATION_RECOVERY_PROTOCOL.UNPUBLISHED_OBSERVATION,
      pendingAckNodeIds: [],
      pendingAckCount: TEST_PUBLICATION_COUNT.PUBLISHED_FRONTIER_PENDING_ACK,
      missingPublishedNodeIds: [],
      missingPublishedCount:
        TEST_PUBLICATION_COUNT.OPEN_FRONTIER_MISSING_PUBLISHED,
      publicationPendingHint: true,
      prioritySpreadPending: false,
    });

    t.equal(
      stream.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.NO_REVISION,
    );
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED,
    );
    t.equal(
      stream.missingPublishedCount,
      TEST_PUBLICATION_COUNT.OPEN_FRONTIER_MISSING_PUBLISHED,
    );
    t.same(stream.missingPublishedNodeIds, []);
    t.equal(
      stream.reasonCodes.includes(
        PUBLICATION_OWNER_REASON.MISSING_PUBLISHED_MEMBERS,
      ),
      true,
    );
    t.end();
  });

test('publication owner stream keeps UNKNOWN no-debt empty ACK list not started',
  (t) => {
    const stream = buildPublicationOwnerStreamState({
      publicationStatus: PUBLICATION_OWNER_TEXT.UNKNOWN,
      recoveryProtocolState:
        TEST_PUBLICATION_RECOVERY_PROTOCOL.UNPUBLISHED_OBSERVATION,
      requiredAckNodeIds: TEST_EMPTY_NODE_IDS,
      acknowledgedNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckNodeIds: TEST_EMPTY_NODE_IDS,
      pendingAckCount: TEST_PUBLICATION_COUNT.PUBLISHED_FRONTIER_PENDING_ACK,
      missingPublishedNodeIds: TEST_EMPTY_NODE_IDS,
      missingPublishedCount:
        TEST_PUBLICATION_COUNT.PUBLISHED_FRONTIER_PENDING_ACK,
      publicationPending: true,
      prioritySpreadPending: false,
    });

    t.equal(stream.ackState, PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED);
    t.equal(
      stream.freshnessFence,
      PUBLICATION_OWNER_FRESHNESS_FENCE.NO_REVISION,
    );
    t.equal(stream.streamOutcome, PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED);
    t.equal(
      stream.recoveryOutcome,
      PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED,
    );
    t.equal(
      stream.reasonCodes.includes(
        PUBLICATION_OWNER_REASON.PUBLICATION_PENDING_HINT,
      ),
      false,
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
