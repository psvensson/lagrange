import {test} from '../../src/test-helpers/tap.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {AuthoritativeControlPlaneView} from
  '../../src/control-plane/authoritative-control-plane-view.js';
import {AuthoritativeNodeEvidenceReconciler} from
  '../../src/control-plane/authoritative-node-evidence-reconciler.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER, GATEWAY_ERROR_MSG} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE as SCOPE} from
  '../../src/control-plane/control-plane-cache-reconcile-constants.js';

const NODE_ID = 'dependent-evidence-node';
const OWNER_SOURCE = 'owner_rpc_lane';
const UNAVAILABLE_SOURCE = 'unavailable';
const UNAVAILABLE = Object.freeze({success: false, rows: [],
  source: UNAVAILABLE_SOURCE, error: 'services-owner-unavailable'});
const NODE_ROW = Object.freeze({node_id: NODE_ID, status: 'active'});
const SERVICE_ROW = Object.freeze({service_id: 'dependent-service', node_id: NODE_ID,
  partition_id: 'dependent-partition', service_type: SERVICE_TYPE.PARTITION,
  status: 'ACTIVE', address: `${NODE_ID}/partition/dependent-service`});
const PARTITION_ROW = Object.freeze({partition_id: SERVICE_ROW.partition_id,
  table_name: 'dependent_rows', leader_node_id: NODE_ID});
const CONTRADICTION = 'contradictory_control_plane_authoritative_read_authority';

function answered(rows) {
  return {success: true, rows, source: OWNER_SOURCE, rowSetComplete: true};
}

function viewFixture() {
  const calls = {admissions: 0, queries: [], serializations: 0};
  let services = UNAVAILABLE;
  const cdc = {
    async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
      calls.queries.push({tableName, sql, params, options});
      if (tableName === TABLES.NODES) return answered([NODE_ROW]);
      if (tableName === TABLES.SERVICES) return services;
      if (tableName === TABLES.PARTITIONS) return answered([PARTITION_ROW]);
      throw new Error(`Unexpected authority table ${tableName}`);
    },
  };
  const view = new AuthoritativeControlPlaneView({nodeId: NODE_ID,
    cdcIntegrationService: cdc, now: () => 1000,
    pressureGovernor: {configure() {}, async admit() {
      calls.admissions += 1;
      return {action: 'allow'};
    }},
  });
  return {view, cdc, calls, setServices(result) {services = result;}};
}

const INVALID_TOKEN_CASES = [
  {name: 'null', create: () => null,
    expected: {message: GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_AUTHORITY_TOKEN_REQUIRED}},
  {name: 'mutable', create: (valid) => ({...valid}),
    expected: {message: GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_AUTHORITY_TOKEN_REQUIRED}},
  {name: 'unknown mode', create: (valid, calls) => Object.freeze({...valid,
    authoritativeReadMode: 'unknown-owner-mode',
    toJSON() {calls.serializations += 1; return {...valid};}}),
  expected: {message: 'unsupported_control_plane_authoritative_read_mode'}},
  {name: 'complete local observation', create: (valid, calls) => Object.freeze({...valid,
    authoritativeReadMode: MODE.OWNER_LOCAL_ONLY, leaderMode: LEADER.REQUIRED,
    authoritativeObservationScope: SCOPE.COMPLETE_TABLE,
    toJSON() {calls.serializations += 1; return {...valid};}}),
  expected: {code: CONTRADICTION}},
];

for (const invalid of INVALID_TOKEN_CASES) {
  test(`direct view refuses ${invalid.name} authority before admission or identity`, async (t) => {
    const f = viewFixture();
    const valid = buildControlPlaneReadAuthority({authoritativeReadMode: MODE.OWNER_RPC_REQUIRED});
    const supplied = invalid.create(valid, f.calls);
    await t.rejects(f.view.readRows(TABLES.NODES, 'SELECT * FROM nodes', [], {
      readAuthority: supplied,
    }), invalid.expected, 'supplied authority cannot be silently replaced or weakened');
    t.equal(f.calls.serializations, 0, 'invalid authority never enters the coalescing identity');
    t.equal(f.calls.admissions, 0, 'invalid authority consumes no pressure admission');
    t.equal(f.calls.queries.length, 0, 'no owner executes the invalid request');
    t.equal(f.view.inFlightReadsByKey.size, 0, 'no in-flight custody is retained');
  });
}

test('direct view preserves the exact valid authority and releases completed custody', async (t) => {
  const f = viewFixture();
  const authority = buildControlPlaneReadAuthority({authoritativeReadMode: MODE.OWNER_RPC_REQUIRED});
  const result = await f.view.readRows(TABLES.NODES, 'SELECT * FROM nodes', [], {
    readAuthority: authority,
  });
  t.equal(result.success, true);
  t.same(result.rows, [NODE_ROW]);
  t.equal(f.calls.queries[0].options.readAuthority, authority,
    'the selected token reaches the owner unchanged');
  t.equal(f.calls.admissions, 1);
  t.equal(f.view.inFlightReadsByKey.size, 0);
});

function repairFixture() {
  const f = viewFixture();
  const cache = new SystemTableCache();
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID,
    systemTableCache: cache, cdcIntegrationService: f.cdc});
  const reconciliations = [];
  const reconcile = gateway.reconcileAuthoritativeCacheRows;
  gateway.reconcileAuthoritativeCacheRows = function(tableName, rows, options) {
    reconciliations.push({tableName, rows, options});
    return Reflect.apply(reconcile, this, [tableName, rows, options]);
  };
  const reconciler = new AuthoritativeNodeEvidenceReconciler({nodeId: NODE_ID,
    cdcIntegrationService: f.cdc, cacheMutationTarget: cache, systemTableCache: cache,
    controlPlaneSystemTableGateway: gateway, getAuthoritativeControlPlaneView: () => f.view,
    authoritativeReadinessRepairLane: {async run(_key, operation) {return operation();}},
    readNodeRow: async () => cache.getAll(TABLES.NODES)[0] || null,
    readNodeServiceRows: async () => cache.getAll(TABLES.SERVICES),
    readNodePartitionRows: async () => cache.getAll(TABLES.PARTITIONS),
    now: () => 1000, logger: {info() {}, warn() {}},
  });
  return {...f, cache, reconciler, reconciliations};
}

test('failed service evidence cannot invent an empty partition reconciliation, and the same owner heals',
  async (t) => {
    const f = repairFixture();
    const snapshot = await f.view.readNodeSnapshot(NODE_ID);
    t.equal(snapshot.tables.services.success, false);
    t.equal(snapshot.tables.partitions.success, false,
      'partitions are unavailable when the service-to-partition relationship is unavailable');
    t.equal(snapshot.tables.partitions.source, UNAVAILABLE_SOURCE,
      'an answered node cannot donate authority to an unobserved partition relationship');
    t.equal(snapshot.tables.partitions.error, UNAVAILABLE.error,
      'the dependent observation retains the original service failure');
    t.equal(f.calls.queries.filter((call) => call.tableName === TABLES.PARTITIONS).length, 0);
    const failed = await f.reconciler.collectRepairNodeEvidenceContext(NODE_ID);
    t.equal(failed.serviceEvidenceState, 'unavailable');
    t.equal(failed.partitionEvidenceState, 'unavailable');
    t.same(f.reconciliations.map((call) => call.tableName), [TABLES.NODES],
      'only the answered node reaches the real cache reconciliation owner');
    t.same(f.cache.getAll(TABLES.PARTITIONS), []);

    f.reconciliations.length = 0;
    f.setServices(answered([SERVICE_ROW]));
    const recovered = await f.reconciler.collectRepairNodeEvidenceContext(NODE_ID);
    t.equal(recovered.serviceEvidenceState, 'observed_rows');
    t.equal(recovered.partitionEvidenceState, 'observed_rows');
    t.same(f.reconciliations.map((call) => call.tableName),
      [TABLES.NODES, TABLES.SERVICES, TABLES.PARTITIONS]);
    t.same(f.cache.getAll(TABLES.SERVICES), [SERVICE_ROW]);
    t.same(f.cache.getAll(TABLES.PARTITIONS), [PARTITION_ROW],
      'later valid evidence repairs the actual partition cache through the same owner');
    const partitionReads = f.calls.queries.filter((call) => call.tableName === TABLES.PARTITIONS);
    t.equal(partitionReads.length, 1);
    t.same(partitionReads[0].params, [PARTITION_ROW.partition_id]);
    t.equal(f.view.inFlightReadsByKey.size, 0);
  });

test('an answered empty service relationship yields a declared empty partition result', async (t) => {
  const f = repairFixture();
  f.setServices(answered([]));
  const snapshot = await f.view.readNodeSnapshot(NODE_ID);
  t.equal(snapshot.tables.services.success, true);
  t.equal(snapshot.tables.partitions.success, true);
  t.same(snapshot.tables.partitions.rows, []);
  t.equal(snapshot.tables.partitions.source, OWNER_SOURCE);
  t.equal(f.calls.queries.filter((call) => call.tableName === TABLES.PARTITIONS).length, 0,
    'an actually empty relationship needs no fabricated partition query');
  const observed = await f.reconciler.collectRepairNodeEvidenceContext(NODE_ID);
  t.equal(observed.partitionEvidenceState, 'observed_empty_confirmed');
  t.same(f.reconciliations.map((call) => call.tableName),
    [TABLES.NODES, TABLES.SERVICES, TABLES.PARTITIONS]);
});

test('the actual view preserves typed owner unavailability and its existing retry hint', async (t) => {
  const f = viewFixture();
  const failure = Object.freeze({...UNAVAILABLE, errorCode: 'ROUTER_CONNECTION_CLOSED',
    deferRetry: true, retryAfterMs: 25});
  f.setServices(failure);
  const unavailable = await f.view.readRows(TABLES.SERVICES, 'SELECT * FROM services');
  t.equal(unavailable.success, false);
  t.equal(unavailable.error, failure.error);
  t.equal(unavailable.errorCode, failure.errorCode, 'the original owner classification survives');
  t.equal(unavailable.deferRetry, true, 'a typed deferred read cannot become an untyped failure');
  t.equal(unavailable.retryAfterMs, failure.retryAfterMs, 'the existing owner retry hint is unchanged');
  t.equal(f.calls.queries.length, 1);
  f.setServices(answered([SERVICE_ROW]));
  const healed = await f.view.readRows(TABLES.SERVICES, 'SELECT * FROM services');
  t.equal(healed.success, true);
  t.same(healed.rows, [SERVICE_ROW]);
  t.equal(f.calls.queries.length, 2, 'a later ordinary request returns to the same owner');
  t.equal(f.view.inFlightReadsByKey.size, 0);
});
