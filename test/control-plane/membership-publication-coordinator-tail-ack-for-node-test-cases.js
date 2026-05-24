export function registerMembershipPublicationCoordinatorTailAckForNodeTests({
  test,
  MembershipPublicationCoordinator,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
}) {
  test('acknowledgeMembershipPublicationForNode acknowledges a required node from cache',
    async (t) => {
      const persistedRows = [];
      const getPublicationCalls = [];
      let durablePublicationRow = {
        publication_id: 'publication-20',
        publication_kind: 'cluster_membership',
        publication_epoch: 20,
        status: 'OPEN',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: [],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== 'control_plane_publications') {
              return [];
            }
            return [
              {
                publication_id: 'publication-20',
                publication_kind: 'cluster_membership',
                publication_epoch: 20,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                acknowledged_node_ids: [],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async getPublication(publicationId) {
            getPublicationCalls.push(publicationId);
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-1');

      t.equal(
        persistedRows.length,
        1,
        'cache-rooted required nodes should result in one acknowledgement persistence',
      );
      t.match(
        persistedRows[0],
        {
          publication_id: 'publication-20',
          status: 'ACK_PENDING',
          acknowledged_node_ids: ['node-1'],
        },
        'required node acknowledgement should be persisted with updated status',
      );
      t.equal(
        getPublicationCalls.length,
        3,
        'owner reads should merge and verify the acknowledgement write',
      );
      t.equal(
        publicationRow?.acknowledged_node_ids?.[0],
        'node-1',
        'acknowledge result should include the acknowledging node',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode refreshes from authoritative when cache misses node requirement',
    async (t) => {
      const listPublicationsCalls = [];
      const getPublicationCalls = [];
      const persistedRows = [];
      let durablePublicationRow = {
        publication_id: 'publication-21',
        publication_kind: 'cluster_membership',
        publication_epoch: 21,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: [],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== 'control_plane_publications') {
              return [];
            }
            return [
              {
                publication_id: 'publication-21',
                publication_kind: 'cluster_membership',
                publication_epoch: 21,
                status: 'ACK_PENDING',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-other'],
                acknowledged_node_ids: [],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublications(options = {}) {
            listPublicationsCalls.push(options);
            return {
              rows: [
                {
                  publication_id: 'publication-21',
                  publication_kind: 'cluster_membership',
                  publication_epoch: 21,
                  status: 'ACK_PENDING',
                  published_active_node_ids: ['node-1', 'node-2'],
                  required_ack_node_ids: ['node-1'],
                  acknowledged_node_ids: [],
                },
              ],
            };
          },
          async getPublication(publicationId) {
            getPublicationCalls.push(publicationId);
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-1');

      t.equal(
        listPublicationsCalls.length,
        1,
        'stale cache rows should trigger an authoritative publication list refresh',
      );
      t.match(
        listPublicationsCalls[0],
        {
          authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
        },
        'authoritative refresh should prefer owner-rpc publication history',
      );
      t.equal(
        persistedRows.length,
        1,
        'authoritative-refresh row should be acknowledged when the node becomes required',
      );
      t.equal(
        getPublicationCalls.length,
        3,
        'authoritative acknowledgement should merge and verify the publication by id',
      );
      t.equal(
        publicationRow?.acknowledged_node_ids?.[0],
        'node-1',
        'refresh+ack should persist the node acknowledgement',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode refreshes owner-rpc publication history when the local publication cache is empty',
    async (t) => {
      const PUBLICATIONS_TABLE = 'control_plane_publications';
      const PUBLICATION_ID = 'publication-20-owner';
      const PUBLICATION_KIND = 'cluster_membership';
      const PUBLICATION_EPOCH = 20;
      const ACK_PENDING_STATUS = 'ACK_PENDING';
      const FIRST_NODE_ID = 'node-1';
      const SECOND_NODE_ID = 'node-2';
      const REQUIRED_NODE_IDS = Object.freeze([
        FIRST_NODE_ID,
        SECOND_NODE_ID,
      ]);
      const listPublicationsCalls = [];
      const getPublicationCalls = [];
      const persistedRows = [];
      let durablePublicationRow = {
        publication_id: PUBLICATION_ID,
        publication_kind: PUBLICATION_KIND,
        publication_epoch: PUBLICATION_EPOCH,
        status: ACK_PENDING_STATUS,
        published_active_node_ids: [...REQUIRED_NODE_IDS],
        required_ack_node_ids: [...REQUIRED_NODE_IDS],
        acknowledged_node_ids: [SECOND_NODE_ID],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== PUBLICATIONS_TABLE) {
              return [];
            }
            return [];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublications(options = {}) {
            listPublicationsCalls.push(options);
            return {
              rows: [durablePublicationRow],
            };
          },
          async getPublication(publicationId) {
            getPublicationCalls.push(publicationId);
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode(FIRST_NODE_ID);

      t.equal(
        listPublicationsCalls.length,
        1,
        'empty publication cache should trigger one authoritative publication list refresh',
      );
      t.match(
        listPublicationsCalls[0],
        {
          authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
        },
        'empty-cache acknowledgement refresh should prefer owner-rpc publication history',
      );
      t.equal(
        getPublicationCalls.length,
        3,
        'empty-cache acknowledgement should still merge and verify the durable publication row',
      );
      t.match(
        persistedRows[0],
        {
          publication_id: PUBLICATION_ID,
          status: 'PUBLISHED',
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'owner-rpc refresh should acknowledge the durable empty-cache publication row',
      );
      t.match(
        publicationRow,
        {
          publication_id: PUBLICATION_ID,
          status: 'PUBLISHED',
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'caller should receive the empty-cache durable publication row after acknowledgement',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode refreshes owner-rpc publication history when cache still shows pending target acknowledgement',
    async (t) => {
      const PUBLICATIONS_TABLE = 'control_plane_publications';
      const PUBLICATION_KIND = 'cluster_membership';
      const STALE_PUBLICATION_ID = 'publication-29-stale';
      const FRESH_PUBLICATION_ID = 'publication-30';
      const STALE_PUBLICATION_EPOCH = 29;
      const FRESH_PUBLICATION_EPOCH = 30;
      const ACK_PENDING_STATUS = 'ACK_PENDING';
      const PUBLISHED_STATUS = 'PUBLISHED';
      const FIRST_NODE_ID = 'node-1';
      const SECOND_NODE_ID = 'node-2';
      const REQUIRED_NODE_IDS = Object.freeze([
        FIRST_NODE_ID,
        SECOND_NODE_ID,
      ]);
      const listPublicationsCalls = [];
      const getPublicationCalls = [];
      const persistedRows = [];
      let durablePublicationRow = {
        publication_id: FRESH_PUBLICATION_ID,
        publication_kind: PUBLICATION_KIND,
        publication_epoch: FRESH_PUBLICATION_EPOCH,
        status: ACK_PENDING_STATUS,
        published_active_node_ids: [...REQUIRED_NODE_IDS],
        required_ack_node_ids: [...REQUIRED_NODE_IDS],
        acknowledged_node_ids: [SECOND_NODE_ID],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== PUBLICATIONS_TABLE) {
              return [];
            }
            return [
              {
                publication_id: STALE_PUBLICATION_ID,
                publication_kind: PUBLICATION_KIND,
                publication_epoch: STALE_PUBLICATION_EPOCH,
                status: ACK_PENDING_STATUS,
                published_active_node_ids: [...REQUIRED_NODE_IDS],
                required_ack_node_ids: [...REQUIRED_NODE_IDS],
                acknowledged_node_ids: [],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublications(options = {}) {
            listPublicationsCalls.push(options);
            return {
              rows: [durablePublicationRow],
            };
          },
          async getPublication(publicationId) {
            getPublicationCalls.push(publicationId);
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode(FIRST_NODE_ID);

      t.equal(
        listPublicationsCalls.length,
        1,
        'pending-target-ack cache rows should refresh the latest publication from the owner',
      );
      t.match(
        listPublicationsCalls[0],
        {
          authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
        },
        'pending-target-ack refresh should prefer owner-rpc publication history',
      );
      t.equal(
        getPublicationCalls.length,
        3,
        'refreshed acknowledgement should still merge and verify the durable row',
      );
      t.match(
        persistedRows[0],
        {
          publication_id: FRESH_PUBLICATION_ID,
          status: PUBLISHED_STATUS,
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'owner-rpc refresh should acknowledge the newer publication epoch instead of the stale cache row',
      );
      t.match(
        publicationRow,
        {
          publication_id: FRESH_PUBLICATION_ID,
          status: PUBLISHED_STATUS,
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'caller should receive the refreshed durable publication row',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode refreshes from authoritative when cache has terminal stale publication',
    async (t) => {
      const PUBLICATIONS_TABLE = 'control_plane_publications';
      const PUBLICATION_KIND = 'cluster_membership';
      const STALE_PUBLICATION_ID = 'publication-25-stale';
      const FRESH_PUBLICATION_ID = 'publication-26';
      const STALE_PUBLICATION_EPOCH = 25;
      const FRESH_PUBLICATION_EPOCH = 26;
      const PUBLISHED_STATUS = 'PUBLISHED';
      const ACK_PENDING_STATUS = 'ACK_PENDING';
      const FIRST_NODE_ID = 'node-1';
      const SECOND_NODE_ID = 'node-2';
      const REQUIRED_NODE_IDS = Object.freeze([
        FIRST_NODE_ID,
        SECOND_NODE_ID,
      ]);
      const listPublicationsCalls = [];
      const getPublicationCalls = [];
      const persistedRows = [];
      let durablePublicationRow = {
        publication_id: FRESH_PUBLICATION_ID,
        publication_kind: PUBLICATION_KIND,
        publication_epoch: FRESH_PUBLICATION_EPOCH,
        status: ACK_PENDING_STATUS,
        published_active_node_ids: [...REQUIRED_NODE_IDS],
        required_ack_node_ids: [...REQUIRED_NODE_IDS],
        acknowledged_node_ids: [SECOND_NODE_ID],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== PUBLICATIONS_TABLE) {
              return [];
            }
            return [
              {
                publication_id: STALE_PUBLICATION_ID,
                publication_kind: PUBLICATION_KIND,
                publication_epoch: STALE_PUBLICATION_EPOCH,
                status: PUBLISHED_STATUS,
                published_active_node_ids: [...REQUIRED_NODE_IDS],
                required_ack_node_ids: [...REQUIRED_NODE_IDS],
                acknowledged_node_ids: [...REQUIRED_NODE_IDS],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublications(options = {}) {
            listPublicationsCalls.push(options);
            return {
              rows: [durablePublicationRow],
            };
          },
          async getPublication(publicationId) {
            getPublicationCalls.push(publicationId);
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode(FIRST_NODE_ID);

      t.equal(
        listPublicationsCalls.length,
        1,
        'terminal cache rows should trigger an authoritative publication list refresh',
      );
      t.match(
        listPublicationsCalls[0],
        {
          authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
        },
        'terminal-cache refresh should prefer owner-rpc publication history',
      );
      t.equal(
        persistedRows.length,
        1,
        'newer authoritative rows should be acknowledged when stale cache is terminal',
      );
      t.equal(
        getPublicationCalls.length,
        3,
        'terminal-cache acknowledgement should merge and verify the publication by id',
      );
      t.match(
        persistedRows[0],
        {
          publication_id: FRESH_PUBLICATION_ID,
          status: PUBLISHED_STATUS,
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'fresh publication should close once the missing node acknowledgement is added',
      );
      t.match(
        publicationRow,
        {
          publication_id: FRESH_PUBLICATION_ID,
          status: PUBLISHED_STATUS,
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'acknowledgement result should reflect the refreshed durable publication row',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode rechecks durable state when cache already has the node ack',
    async (t) => {
      const listPublicationsCalls = [];
      const persistedRows = [];
      let durablePublicationRow = {
        publication_id: 'publication-24',
        publication_kind: 'cluster_membership',
        publication_epoch: 24,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: [],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== 'control_plane_publications') {
              return [];
            }
            return [
              {
                publication_id: 'publication-24',
                publication_kind: 'cluster_membership',
                publication_epoch: 24,
                status: 'ACK_PENDING',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                acknowledged_node_ids: ['node-1'],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublications(options = {}) {
            listPublicationsCalls.push(options);
            return {rows: [durablePublicationRow]};
          },
          async getPublication() {
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-1');

      t.equal(
        listPublicationsCalls.length,
        1,
        'in-flight duplicate acknowledgements should verify durable publication state',
      );
      t.equal(
        persistedRows.length,
        1,
        'missing durable acknowledgement should be restored even when cache had the node ack',
      );
      t.match(
        publicationRow,
        {
          publication_id: 'publication-24',
          status: 'ACK_PENDING',
          acknowledged_node_ids: ['node-1'],
        },
        'acknowledgement result should reflect the repaired durable row',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode retries when durable readback drops a merged acknowledgement',
    async (t) => {
      let upsertCallCount = 0;
      let durablePublicationRow = {
        publication_id: 'publication-25',
        publication_kind: 'cluster_membership',
        publication_epoch: 25,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-3'],
        updated_at: 2500,
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== 'control_plane_publications') {
              return [];
            }
            return [
              {
                publication_id: 'publication-25',
                publication_kind: 'cluster_membership',
                publication_epoch: 25,
                status: 'ACK_PENDING',
                published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
                acknowledged_node_ids: ['node-1'],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async getPublication() {
            return durablePublicationRow;
          },
          async upsertPublication(row) {
            upsertCallCount += 1;
            if (upsertCallCount === 1) {
              durablePublicationRow = {
                ...row,
                status: 'ACK_PENDING',
                acknowledged_node_ids: ['node-1', 'node-2'],
                updated_at: 2501,
              };
              return;
            }
            durablePublicationRow = row;
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-2');

      t.equal(
        upsertCallCount,
        2,
        'membership acknowledgement path should retry dropped durable acknowledgement unions',
      );
      t.match(
        durablePublicationRow,
        {
          publication_id: 'publication-25',
          status: 'PUBLISHED',
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        'readback retry should preserve every merged acknowledgement',
      );
      t.match(
        publicationRow,
        {
          publication_id: 'publication-25',
          status: 'PUBLISHED',
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        'caller should receive the verified durable publication row',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode is no-op when node is not required',
    async (t) => {
      const listPublicationsCalls = [];
      const getPublicationCalls = [];
      const persistedRows = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== 'control_plane_publications') {
              return [];
            }
            return [
              {
                publication_id: 'publication-23',
                publication_kind: 'cluster_membership',
                publication_epoch: 23,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1'],
                acknowledged_node_ids: [],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublications(options) {
            listPublicationsCalls.push(options);
            return {
              rows: [
                {
                  publication_id: 'publication-23',
                  publication_kind: 'cluster_membership',
                  publication_epoch: 23,
                  status: 'OPEN',
                  published_active_node_ids: ['node-1', 'node-2'],
                  required_ack_node_ids: ['node-1'],
                  acknowledged_node_ids: [],
                },
              ],
            };
          },
          async getPublication(publicationId) {
            getPublicationCalls.push(publicationId);
            return {
              publication_id: 'publication-23',
              publication_kind: 'cluster_membership',
              publication_epoch: 23,
              status: 'OPEN',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1'],
              acknowledged_node_ids: [],
            };
          },
          async upsertPublication(row) {
            persistedRows.push(row);
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-3');

      t.equal(
        listPublicationsCalls.length,
        1,
        'non-required target should still allow owner refresh attempt before returning no-op',
      );
      t.match(
        listPublicationsCalls[0],
        {
          authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
        },
        'owner refresh should prefer owner-rpc publication history',
      );
      t.equal(
        getPublicationCalls.length,
        0,
        'non-required nodes should not fetch publication by id for acknowledgement',
      );
      t.equal(
        persistedRows.length,
        0,
        'no persistence should occur when the node is not required for acknowledgement',
      );
      t.equal(
        publicationRow?.required_ack_node_ids?.[0],
        'node-1',
        'returned row should remain the authoritative row for required-ack context',
      );
      t.equal(
        publicationRow?.acknowledged_node_ids?.length,
        0,
        'non-required node should not become acknowledged',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode does not persist duplicate node acknowledgements',
    async (t) => {
      const persistedRows = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== 'control_plane_publications') {
              return [];
            }
            return [
              {
                publication_id: 'publication-22',
                publication_kind: 'cluster_membership',
                publication_epoch: 22,
                status: 'ACK_PENDING',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                acknowledged_node_ids: ['node-1'],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async upsertPublication(row) {
            persistedRows.push(row);
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode('node-1');

      t.equal(
        persistedRows.length,
        0,
        'duplicate acknowledgements should not persist',
      );
      t.equal(
        publicationRow?.acknowledged_node_ids?.length,
        1,
        'duplicate acknowledgements should return the existing row unchanged',
      );
      t.end();
    });

  test('acknowledgeMembershipPublicationForNode closes duplicate fully acknowledged open rows',
    async (t) => {
      const PUBLICATIONS_TABLE = 'control_plane_publications';
      const PUBLICATION_ID = 'publication-23';
      const PUBLICATION_KIND = 'cluster_membership';
      const PUBLICATION_EPOCH = 23;
      const OPEN_STATUS = 'OPEN';
      const PUBLISHED_STATUS = 'PUBLISHED';
      const FIRST_NODE_ID = 'node-1';
      const SECOND_NODE_ID = 'node-2';
      const REQUIRED_NODE_IDS = Object.freeze([
        FIRST_NODE_ID,
        SECOND_NODE_ID,
      ]);
      const persistedRows = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== PUBLICATIONS_TABLE) {
              return [];
            }
            return [
              {
                publication_id: PUBLICATION_ID,
                publication_kind: PUBLICATION_KIND,
                publication_epoch: PUBLICATION_EPOCH,
                status: OPEN_STATUS,
                published_active_node_ids: [...REQUIRED_NODE_IDS],
                required_ack_node_ids: [...REQUIRED_NODE_IDS],
                acknowledged_node_ids: [...REQUIRED_NODE_IDS],
              },
            ];
          },
        },
        controlPlanePublicationsOwner: {
          async upsertPublication(row) {
            persistedRows.push(row);
          },
        },
      });

      const publicationRow =
      await coordinator.acknowledgeMembershipPublicationForNode(FIRST_NODE_ID);

      t.equal(
        persistedRows.length,
        1,
        'fully acknowledged open rows should be repaired by the next duplicate acknowledgement',
      );
      t.match(
        persistedRows[0],
        {
          publication_id: PUBLICATION_ID,
          status: PUBLISHED_STATUS,
          acknowledged_node_ids: [...REQUIRED_NODE_IDS],
        },
        'duplicate acknowledgement should close the publication when every required ack is already present',
      );
      t.equal(
        publicationRow?.status,
        PUBLISHED_STATUS,
        'acknowledge result should return the repaired published row',
      );
      t.end();
    });
}
