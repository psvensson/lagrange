import {test} from '../../src/test-helpers/tap.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';

const PUBLICATIONS_TABLE = 'control_plane_publications';
const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';
const DIAGNOSTICS_READ_PROFILE = 'diagnostics';
const STATUS_OPEN = 'OPEN';
const STATUS_PUBLISHED = 'PUBLISHED';
const SEED_NODE_ID = 'seed-node';
const NODE_ONE_ID = 'node-1';
const NODE_TWO_ID = 'node-2';
const NODE_THREE_ID = 'node-3';
const NODE_FOUR_ID = 'node-4';
const PUBLICATION_ID_TWELVE = 'publication-12';
const PUBLICATION_ID_THIRTEEN = 'publication-13';
const PUBLICATION_ID_FOURTEEN = 'publication-14';
const PUBLICATION_EPOCH_TWELVE = 12;
const PUBLICATION_EPOCH_THIRTEEN = 13;
const PUBLICATION_EPOCH_FOURTEEN = 14;
const EMPTY_ROWS = Object.freeze([]);
const CACHE_PUBLISHED_NODE_IDS = Object.freeze([
  NODE_ONE_ID,
  NODE_TWO_ID,
]);
const CACHE_OPEN_NODE_IDS = Object.freeze([
  NODE_ONE_ID,
  NODE_TWO_ID,
  NODE_THREE_ID,
  NODE_FOUR_ID,
]);
const OWNER_PUBLISHED_NODE_IDS = Object.freeze([
  NODE_ONE_ID,
  NODE_TWO_ID,
  NODE_THREE_ID,
]);
const DIAGNOSTICS_READ_OPTIONS = Object.freeze({
  preferAuthoritativeRead: true,
  readProfile: DIAGNOSTICS_READ_PROFILE,
});
const OWNER_RPC_REQUIRED_READ_MODE =
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED;

function buildPublicationRow(options = {}) {
  return {
    publication_id: options.publicationId,
    publication_kind: MEMBERSHIP_PUBLICATION_KIND,
    publication_epoch: options.publicationEpoch,
    published_active_node_ids: [...options.publishedActiveNodeIds],
    status: options.status,
  };
}

function buildCoordinatorWithPublicationOwner(options = {}) {
  const listPublicationCalls = [];
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: SEED_NODE_ID,
    systemTableCache: {
      getAll(tableName) {
        if (tableName !== PUBLICATIONS_TABLE) {
          return EMPTY_ROWS;
        }
        return options.cachedPublicationRows || EMPTY_ROWS;
      },
    },
    controlPlanePublicationsOwner: {
      async listPublicationsFromCache() {
        throw new Error(
          'diagnostics publication reads should bypass cache-only publication rows',
        );
      },
      async listPublications(readOptions = {}) {
        listPublicationCalls.push(readOptions);
        return {
          rows: options.ownerPublicationRows || EMPTY_ROWS,
        };
      },
    },
  });
  return {
    coordinator,
    listPublicationCalls,
  };
}

test('getLatestClusterPublication uses owner-rpc publication history for diagnostics reads',
  async (t) => {
    const cachedPublicationRows = Object.freeze([
      buildPublicationRow({
        publicationId: PUBLICATION_ID_THIRTEEN,
        publicationEpoch: PUBLICATION_EPOCH_THIRTEEN,
        publishedActiveNodeIds: CACHE_PUBLISHED_NODE_IDS,
        status: STATUS_PUBLISHED,
      }),
    ]);
    const ownerPublicationRows = Object.freeze([
      buildPublicationRow({
        publicationId: PUBLICATION_ID_FOURTEEN,
        publicationEpoch: PUBLICATION_EPOCH_FOURTEEN,
        publishedActiveNodeIds: OWNER_PUBLISHED_NODE_IDS,
        status: STATUS_PUBLISHED,
      }),
    ]);
    const {coordinator, listPublicationCalls} =
      buildCoordinatorWithPublicationOwner({
        cachedPublicationRows,
        ownerPublicationRows,
      });

    const latestPublication =
      await coordinator.getLatestClusterPublication(DIAGNOSTICS_READ_OPTIONS);

    t.equal(
      listPublicationCalls.length,
      1,
      'diagnostics publication reads should query the publication owner once',
    );
    t.match(
      listPublicationCalls[0],
      {
        ...DIAGNOSTICS_READ_OPTIONS,
        authoritativeReadMode: OWNER_RPC_REQUIRED_READ_MODE,
      },
      'diagnostics publication reads should require the owner-rpc publication list path',
    );
    t.match(
      latestPublication,
      {
        publicationEpoch: PUBLICATION_EPOCH_FOURTEEN,
        status: STATUS_PUBLISHED,
        publishedActiveNodeIds: OWNER_PUBLISHED_NODE_IDS,
      },
      'diagnostics reads should return the authoritative publication row',
    );
  });

test('getLatestPublishedClusterPublication uses owner-rpc publication history for diagnostics reads',
  async (t) => {
    const cachedPublicationRows = Object.freeze([
      buildPublicationRow({
        publicationId: PUBLICATION_ID_THIRTEEN,
        publicationEpoch: PUBLICATION_EPOCH_THIRTEEN,
        publishedActiveNodeIds: CACHE_OPEN_NODE_IDS,
        status: STATUS_OPEN,
      }),
    ]);
    const ownerPublicationRows = Object.freeze([
      buildPublicationRow({
        publicationId: PUBLICATION_ID_TWELVE,
        publicationEpoch: PUBLICATION_EPOCH_TWELVE,
        publishedActiveNodeIds: OWNER_PUBLISHED_NODE_IDS,
        status: STATUS_PUBLISHED,
      }),
      buildPublicationRow({
        publicationId: PUBLICATION_ID_THIRTEEN,
        publicationEpoch: PUBLICATION_EPOCH_THIRTEEN,
        publishedActiveNodeIds: CACHE_OPEN_NODE_IDS,
        status: STATUS_OPEN,
      }),
    ]);
    const {coordinator, listPublicationCalls} =
      buildCoordinatorWithPublicationOwner({
        cachedPublicationRows,
        ownerPublicationRows,
      });

    const latestPublishedPublication =
      await coordinator.getLatestPublishedClusterPublication(
        DIAGNOSTICS_READ_OPTIONS,
      );

    t.equal(
      listPublicationCalls.length,
      1,
      'diagnostics published-membership reads should query the publication owner once',
    );
    t.match(
      listPublicationCalls[0],
      {
        ...DIAGNOSTICS_READ_OPTIONS,
        authoritativeReadMode: OWNER_RPC_REQUIRED_READ_MODE,
      },
      'diagnostics published-membership reads should require the owner-rpc publication list path',
    );
    t.match(
      latestPublishedPublication,
      {
        publicationEpoch: PUBLICATION_EPOCH_TWELVE,
        status: STATUS_PUBLISHED,
        publishedActiveNodeIds: OWNER_PUBLISHED_NODE_IDS,
      },
      'diagnostics published-membership reads should return the authoritative published row',
    );
  });
