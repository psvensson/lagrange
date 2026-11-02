/**
 * Quest serve-eligibility-committed-epoch-read, attempt 4 (publication owner),
 * red witness recorded in attempt 1.
 *
 * The publisher's priority_partition_summary is the input the serve answer
 * reads from the committed publication row. It must therefore be built from
 * committed rows only: the planning read of services and partitions answers
 * the authoritative rows, never a merge with the SystemTableCache projection,
 * and an unavailable authoritative read is unavailability, never the cache.
 */
import {test} from '../../src/test-helpers/tap.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {MembershipPublicationCoordinatorReads} from
  '../../src/control-plane/membership-publication-coordinator-reads.js';
import {MEMBERSHIP_PUBLICATION_READ_PROFILE} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

ConfigurationManager.getInstance().initialize();

function serviceRow(serviceId, nodeId) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: 'control_plane_publications-p1',
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    updated_at: 10,
  };
}

function cacheWith(rows) {
  return {
    get: () => null,
    getAll: (tableName) => tableName === TABLES.SERVICES ? rows : [],
    filter: () => [],
  };
}

function coordinatorWith(cacheRows, authoritativeResult) {
  const coordinator = new MembershipPublicationCoordinatorReads({
    nodeId: 'seed-node',
    systemTableCache: cacheWith(cacheRows),
  });
  coordinator.authoritativeControlPlaneView = {
    canRead: () => true,
    readRows: async () => authoritativeResult,
  };
  return coordinator;
}

test('planning reads of services answer the committed rows, not a merge ' +
  'with the cache projection', async (t) => {
  const committed = serviceRow('svc-committed', 'node-a');
  const projectedOnly = serviceRow('svc-projected-only', 'node-b');
  const coordinator = coordinatorWith([committed, projectedOnly],
    {success: true, rows: [committed]});
  const rows = await coordinator.readTableRows(TABLES.SERVICES, {
    readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING,
  });
  t.same(rows.map((row) => row[COLUMN.SERVICE_ID]), ['svc-committed'],
    'a row only the projection holds does not enter the priority census');
  t.end();
});

test('an unavailable committed planning read is not answered from the cache',
  async (t) => {
    const coordinator = coordinatorWith([serviceRow('svc-projected', 'node-b')],
      {success: false, error: 'authoritative_row_source_unavailable'});
    let answer = null;
    let refusal = null;
    try {
      answer = await coordinator.readTableRows(TABLES.SERVICES, {
        readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING,
      });
    } catch (error) {
      refusal = error;
    }
    t.equal(answer, null, 'no rows are answered from the projection');
    t.ok(refusal, 'the planning read surfaces typed unavailability');
    t.end();
  });
