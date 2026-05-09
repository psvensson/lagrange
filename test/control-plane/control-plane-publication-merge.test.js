import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  mergeControlPlanePublicationRows,
  publicationRowSatisfiesDesiredState,
} from '../../src/control-plane/control-plane-publication-merge.js';
import {
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_STREAM_OUTCOME,
} from '../../src/control-plane/publication-owner-constants.js';
import {buildPublicationOwnerStreamState} from
  '../../src/control-plane/publication-owner-state.js';

const PUBLICATION_KIND_CLUSTER_MEMBERSHIP = 'cluster_membership';
const PUBLICATION_ID_TRIM = 'publication-trim';
const PUBLICATION_ID_ACK = 'publication-ack';
const PUBLICATION_EPOCH_ONE = 1;
const PUBLICATION_EPOCH_TWO = 2;
const PUBLICATION_UPDATED_AT_OLD = 100;
const PUBLICATION_UPDATED_AT_NEW = 200;
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const NODE_D = 'node-d';
const NODE_E = 'node-e';
const ACTIVE_NODE_IDS_THREE = Object.freeze([NODE_A, NODE_B, NODE_C]);
const ACTIVE_NODE_IDS_FIVE = Object.freeze([
  NODE_A,
  NODE_B,
  NODE_C,
  NODE_D,
  NODE_E,
]);

test('mergeControlPlanePublicationRows trims stale published members on newer membership revisions',
  async (t) => {
    const merged = mergeControlPlanePublicationRows(
      {
        publication_id: PUBLICATION_ID_TRIM,
        publication_kind: PUBLICATION_KIND_CLUSTER_MEMBERSHIP,
        publication_epoch: PUBLICATION_EPOCH_ONE,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [...ACTIVE_NODE_IDS_FIVE],
        required_ack_node_ids: [...ACTIVE_NODE_IDS_FIVE],
        acknowledged_node_ids: [...ACTIVE_NODE_IDS_FIVE],
        updated_at: PUBLICATION_UPDATED_AT_OLD,
      },
      {
        publication_id: PUBLICATION_ID_TRIM,
        publication_kind: PUBLICATION_KIND_CLUSTER_MEMBERSHIP,
        publication_epoch: PUBLICATION_EPOCH_TWO,
        status: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        published_active_node_ids: [...ACTIVE_NODE_IDS_THREE],
        required_ack_node_ids: [...ACTIVE_NODE_IDS_THREE],
        acknowledged_node_ids: [],
        updated_at: PUBLICATION_UPDATED_AT_NEW,
      },
    );

    t.same(
      merged.published_active_node_ids,
      [...ACTIVE_NODE_IDS_THREE],
      'a newer membership revision should replace the old active set',
    );
    t.same(
      merged.required_ack_node_ids,
      [...ACTIVE_NODE_IDS_THREE],
      'required acknowledgements should follow the newer active set',
    );
    t.same(
      merged.acknowledged_node_ids,
      [],
      'acknowledgements from the old membership revision should not publish the trim',
    );
    t.equal(
      merged.status,
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      'an older PUBLISHED row must not force the newer trim revision closed',
    );
  });

test('mergeControlPlanePublicationRows selects newer revisions before timestamp tie-breaks',
  async (t) => {
    const merged = mergeControlPlanePublicationRows(
      {
        publication_id: PUBLICATION_ID_TRIM,
        publication_kind: PUBLICATION_KIND_CLUSTER_MEMBERSHIP,
        publication_epoch: PUBLICATION_EPOCH_ONE,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [...ACTIVE_NODE_IDS_FIVE],
        required_ack_node_ids: [...ACTIVE_NODE_IDS_FIVE],
        acknowledged_node_ids: [...ACTIVE_NODE_IDS_FIVE],
        updated_at: PUBLICATION_UPDATED_AT_NEW,
      },
      {
        publication_id: PUBLICATION_ID_TRIM,
        publication_kind: PUBLICATION_KIND_CLUSTER_MEMBERSHIP,
        publication_epoch: PUBLICATION_EPOCH_TWO,
        status: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
        published_active_node_ids: [...ACTIVE_NODE_IDS_THREE],
        required_ack_node_ids: [...ACTIVE_NODE_IDS_THREE],
        acknowledged_node_ids: [],
        updated_at: PUBLICATION_UPDATED_AT_OLD,
      },
    );

    t.equal(
      merged.publication_epoch,
      PUBLICATION_EPOCH_TWO,
      'the higher publication revision wins even when its timestamp is older',
    );
    t.same(
      merged.published_active_node_ids,
      [...ACTIVE_NODE_IDS_THREE],
      'a reversed timestamp must not resurrect stale published members',
    );
    t.same(
      merged.required_ack_node_ids,
      [...ACTIVE_NODE_IDS_THREE],
      'required acknowledgements follow the highest publication revision',
    );
    t.same(
      merged.acknowledged_node_ids,
      [],
      'older revision acknowledgements must not publish the newer revision',
    );
    t.equal(
      merged.status,
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      'newer revision status is authoritative before timestamp tie-breaks',
    );
  });

test('mergeControlPlanePublicationRows keeps acknowledgement union for the same membership revision',
  async (t) => {
    const merged = mergeControlPlanePublicationRows(
      {
        publication_id: PUBLICATION_ID_ACK,
        publication_kind: PUBLICATION_KIND_CLUSTER_MEMBERSHIP,
        publication_epoch: PUBLICATION_EPOCH_ONE,
        status: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        published_active_node_ids: [...ACTIVE_NODE_IDS_THREE],
        required_ack_node_ids: [...ACTIVE_NODE_IDS_THREE],
        acknowledged_node_ids: [NODE_A, NODE_B],
        updated_at: PUBLICATION_UPDATED_AT_OLD,
      },
      {
        publication_id: PUBLICATION_ID_ACK,
        publication_kind: PUBLICATION_KIND_CLUSTER_MEMBERSHIP,
        publication_epoch: PUBLICATION_EPOCH_ONE,
        status: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        published_active_node_ids: [...ACTIVE_NODE_IDS_THREE],
        required_ack_node_ids: [...ACTIVE_NODE_IDS_THREE],
        acknowledged_node_ids: [NODE_A, NODE_C],
        updated_at: PUBLICATION_UPDATED_AT_NEW,
      },
    );

    t.same(
      merged.acknowledged_node_ids,
      [...ACTIVE_NODE_IDS_THREE],
      'same-revision acknowledgement patches should still merge',
    );
    t.equal(
      merged.status,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'the same revision should publish once all required acknowledgements merge',
    );
    const stream = buildPublicationOwnerStreamState({
      publicationRevision: merged.publication_epoch,
      publicationStatus: merged.status,
      requiredAckNodeIds: merged.required_ack_node_ids,
      acknowledgedNodeIds: merged.acknowledged_node_ids,
    });
    t.equal(
      stream.ackState,
      PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED,
      'merged publication rows should expose ACK completion through the owner stream',
    );
    t.equal(
      stream.streamOutcome,
      PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHED,
      'the merge result should be consumable as a published owner stream',
    );
  });

test('publicationRowSatisfiesDesiredState requires exact published membership',
  async (t) => {
    const satisfied = publicationRowSatisfiesDesiredState(
      {
        publication_id: PUBLICATION_ID_TRIM,
        publication_epoch: PUBLICATION_EPOCH_TWO,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [...ACTIVE_NODE_IDS_FIVE],
        required_ack_node_ids: [...ACTIVE_NODE_IDS_FIVE],
        acknowledged_node_ids: [...ACTIVE_NODE_IDS_FIVE],
      },
      {
        publication_id: PUBLICATION_ID_TRIM,
        publication_epoch: PUBLICATION_EPOCH_TWO,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [...ACTIVE_NODE_IDS_THREE],
        required_ack_node_ids: [...ACTIVE_NODE_IDS_THREE],
        acknowledged_node_ids: [...ACTIVE_NODE_IDS_THREE],
      },
    );

    t.equal(
      satisfied,
      false,
      'a stale superset is still an open membership-trim boundary',
    );
  });
