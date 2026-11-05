/**
 * Omitted partition configuration keeps RF3 even on one embedded runtime.
 *
 * Initial provisioning must refuse below its requested quorum. This replaces
 * the former RF3-singleton-success expectation. It does not test the commit
 * guard of an already-established singleton Raft group; the partition write
 * kernel and stale-topology guard fixtures retain that separate contract.
 */
import {test} from '../../src/test-helpers/tap.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {
  EMBEDDED_STEP_OUTCOME,
  createEmbeddedCluster,
  exposedProperty,
} from './helpers/embedded-cluster-harness.js';

const APPLICATION_ID = 'default-replica-refusal';
const TABLE_NAME = 'single_node_events';
const CREATE_TABLE_SQL = `
  CREATE TABLE single_node_events (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )
`;
const INSERT_SQL = 'INSERT INTO single_node_events (id, payload) VALUES (?, ?)';
const TEST_TIMEOUT_MS = 45000;

test('single node with omitted replica configuration refuses RF3 provisioning',
  {timeout: TEST_TIMEOUT_MS},
  async (t) => {
    const cluster = createEmbeddedCluster(t);
    // Use the public startup owner with omitted partition configuration.
    // formCluster also requires application writes, which this test refuses.
    const seed = await cluster.startEmbeddedNode();
    t.pass('public seed startup succeeds');
    const session = await seed.openApplicationDatabase(APPLICATION_ID);

    const created = await seed.query(session, CREATE_TABLE_SQL);
    t.equal(created.outcome, EMBEDDED_STEP_OUTCOME.REJECTED,
      'a singleton cannot satisfy the default RF3 request');
    t.equal(exposedProperty(created.value, 'code'),
      QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE,
      'CREATE returns the specific provisioning refusal');

    const partitions = await cluster.seedQueryRows(
      'SELECT partition_id, replica_count FROM partitions WHERE table_name = ?',
      [TABLE_NAME]);
    t.ok(partitions.length > 0, 'the requested partition target is persisted');
    t.ok(partitions.every((row) => row.replica_count === 3),
      'omitted configuration retains target RF3');

    const inserted = await seed.query(session, INSERT_SQL,
      ['evt-prod-1', 'payload-prod-1']);
    t.equal(inserted.outcome, EMBEDDED_STEP_OUTCOME.REJECTED,
      'the unavailable table does not acknowledge an INSERT');
  });

