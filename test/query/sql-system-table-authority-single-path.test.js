// Public SQL ingress must keep a claimed authoritative failure. The view and
// transport below are explicit downstream ports; no native Raft proof is claimed.
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER, CONTROL_PLANE_READ_STRATEGY as STRATEGY} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {createMockSystemCache} from './sql-query-engine-test-support.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';

const TABLE = 'services';
const SQL = 'SELECT * FROM services WHERE service_id = ?';
const OWNER_ROW = Object.freeze({service_id: 'owner-row', service_type: 'partition'});
const ROUTED_ROW = Object.freeze({service_id: 'alternate-row', service_type: 'partition'});
const UNAVAILABLE = Object.freeze({success: false, rows: [], deferRetry: true,
  error: 'held-canonical-owner', source: 'unavailable'});

function fixture({withView = true} = {}) {
  const ownerCalls = [];
  const routedCalls = [];
  let ownerAnswer = UNAVAILABLE;
  const view = {async readRows(...args) {
    ownerCalls.push(args);
    return ownerAnswer;
  }};
  const engine = new SQLQueryEngine({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    systemCache: createMockSystemCache([{table_name: TABLE, primaryKey: 'service_id'}],
      [{table_name: TABLE, partition_id: 'services-p1',
        partition_key_start: null, partition_key_end: null}]),
    ...(withView ? {authoritativeControlPlaneView: view} : {}),
    messageRouter: {async deliver(...args) {
      routedCalls.push(args);
      return buildDeliveryEnvelope({acknowledged: true},
        {success: true, rows: [ROUTED_ROW], changes: 0});
    }},
  });
  return {engine, ownerCalls, routedCalls, setOwnerAnswer(answer) {ownerAnswer = answer;}};
}

test('claimed system-table read preserves owner failure and heals on the same owner', async (t) => {
  const f = fixture();
  const held = await f.engine.executeQuery(SQL, ['owner-row']);
  t.equal(held.success, false, 'plausible routed rows cannot replace an unavailable owner');
  t.same(held.rows, []);
  t.equal(held.error, UNAVAILABLE.error, 'the original owner cause is retained');
  t.equal(f.ownerCalls.length, 1);
  t.equal(f.routedCalls.length, 0, 'no second SQL execution path is entered');
  f.setOwnerAnswer({success: true, rows: [OWNER_ROW], source: 'owner_rpc_lane'});
  const recovered = await f.engine.executeQuery(SQL, ['owner-row']);
  t.equal(recovered.success, true);
  t.same(recovered.rows, [OWNER_ROW]);
  t.equal(f.ownerCalls.length, 2, 'ordinary re-entry reaches the same healed owner');
  t.equal(f.routedCalls.length, 0);
});

test('missing authoritative view is unavailable for a structurally claimed system query',
  async (t) => {
    const f = fixture({withView: false});
    const held = await f.engine.executeQuery(SQL, ['owner-row']);
    t.equal(held.success, false);
    t.same(held.rows, []);
    t.equal(f.routedCalls.length, 0, 'dependency absence cannot change the chosen strategy');
  });

test('answered-empty owner remains absence without a confirmation read', async (t) => {
  const f = fixture();
  f.setOwnerAnswer({success: true, rows: [], source: 'owner_rpc_lane'});
  const empty = await f.engine.executeQuery(SQL, ['missing']);
  t.equal(empty.success, true);
  t.same(empty.rows, []);
  t.equal(f.ownerCalls.length, 1);
  t.equal(f.routedCalls.length, 0);
});

test('bounded key projection uses one RPC owner and preserves the projected columns', async (t) => {
  const f = fixture();
  f.setOwnerAnswer({success: true, rows: [{kind: 'partition'}], source: 'owner_rpc_lane'});
  const result = await f.engine.executeQuery(
    'SELECT service_type AS kind FROM services WHERE service_id = ?', ['owner-row']);
  t.equal(result.success, true);
  t.same(result.rows, [{kind: 'partition'}]);
  t.equal(f.ownerCalls.length, 1);
  t.equal(f.ownerCalls[0][3].readAuthority.authoritativeReadMode, MODE.OWNER_RPC_REQUIRED);
  t.equal(f.routedCalls.length, 0);
});

test('explicit local owner with an unsupported keyless projection refuses before reading',
  async (t) => {
    const f = fixture();
    f.setOwnerAnswer({success: true, rows: [], source: 'local_partition_replica'});
    const result = await f.engine.executeQuery(
      'SELECT service_type AS kind FROM services WHERE service_id = ?', ['owner-row'], {
        readAuthority: buildControlPlaneReadAuthority({
          authoritativeReadMode: MODE.OWNER_LOCAL_ONLY, localReadConsistency: 'local_leader',
        }),
      });
    t.equal(result.success, false,
      'local primary-key merging cannot silently drop an unsupported projection');
    t.equal(f.ownerCalls.length, 0);
    t.equal(f.routedCalls.length, 0);
  });

test('invalid supplied authority cannot be replaced with a default token', async (t) => {
  const f = fixture();
  f.setOwnerAnswer({success: true, rows: [OWNER_ROW], source: 'owner_rpc_lane'});
  const result = await f.engine.executeQuery(SQL, ['owner-row'], {
    readAuthority: Object.freeze({authoritativeReadMode: 'unknown-owner-mode'}),
  });
  t.equal(result.success, false);
  t.equal(f.ownerCalls.length, 0);
  t.equal(f.routedCalls.length, 0);
});

test('a structurally unclaimed keyless scan keeps its ordinary routed execution', async (t) => {
  const f = fixture();
  const result = await f.engine.executeQuery('SELECT service_type FROM services');
  t.equal(result.success, true, 'ordinary query planning remains available for this shape');
  t.equal(f.ownerCalls.length, 0, 'the authority adapter never claimed this shape');
  t.ok(f.routedCalls.length > 0, 'the normal transport actually answered');
});

for (const strategy of [STRATEGY.CACHE, STRATEGY.BOOTSTRAP_SNAPSHOT]) {
  test(`the SQL owner adapter cannot execute a supplied ${strategy} contract`, async (t) => {
    const f = fixture();
    f.setOwnerAnswer({success: true, rows: [OWNER_ROW], source: 'local_partition_replica'});
    const result = await f.engine.executeQuery(SQL, ['owner-row'], {
      readAuthority: buildControlPlaneReadAuthority({strategy,
        authoritativeReadMode: MODE.OWNER_LOCAL_ONLY}),
    });
    t.equal(result.success, false);
    t.equal(f.ownerCalls.length, 0);
    t.equal(f.routedCalls.length, 0);
  });
}

test('an explicit owner token on an unclaimed projection cannot fall into ordinary SQL', async (t) => {
  const f = fixture();
  const readAuthority = buildControlPlaneReadAuthority({
    authoritativeReadMode: MODE.OWNER_RPC_REQUIRED, leaderMode: LEADER.REQUIRED});
  const unsupported = await f.engine.executeQuery('SELECT service_type FROM services', [], {
    readAuthority,
  });
  t.equal(unsupported.success, false);
  t.same(unsupported.rows, []);
  t.equal(unsupported.error, 'authoritative_system_table_query_shape_unsupported');
  t.equal(f.ownerCalls.length, 0);
  t.equal(f.routedCalls.length, 0, 'ordinary planning cannot discard the selected authority');
  f.setOwnerAnswer({success: true, rows: [OWNER_ROW], source: 'owner_rpc_lane'});
  const supported = await f.engine.executeQuery(SQL, ['owner-row'], {readAuthority});
  t.equal(supported.success, true);
  t.same(supported.rows, [OWNER_ROW]);
  t.equal(f.ownerCalls.length, 1);
  t.equal(f.ownerCalls[0][3].readAuthority, readAuthority);
  t.equal(f.routedCalls.length, 0);
});
