import {afterEach, beforeEach, test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE as SCOPE} from
  '../../src/control-plane/control-plane-cache-reconcile-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER,
  CONTROL_PLANE_READ_STRATEGY as STRATEGY,
  CONTROL_PLANE_READ_PROFILE as PROFILE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from '../../src/transport/transport-error-codes.js';
import {createLocalSystemTablePartitionServices, setupCDCTestLifecycle} from
  './cdc-integration-service-test-support.js';

setupCDCTestLifecycle(beforeEach, afterEach);

const NODE_ID = 'single-path-reader';
const TABLE = SYSTEM_TABLE_NAME.NODES;
const SQL = 'SELECT * FROM nodes';
const ROW = Object.freeze({node_id: 'canonical-owner-row', status: 'active'});
const LOCAL_ROW = Object.freeze({node_id: 'local-candidate-row', status: 'active'});
const SQL_ROW = Object.freeze({node_id: 'alternate-sql-row', status: 'active'});
const UNAVAILABLE = Object.freeze({success: false, rows: [], deferRetry: true,
  errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, error: 'owner-unavailable'});
const PROFILES = Object.freeze([
  PROFILE.PLANNING, PROFILE.REPAIR_REQUIRED, PROFILE.TABLE_LIFECYCLE,
]);
const RETIRED_MODES = Object.freeze([
  'owner_local_preferred_owner_rpc_fallback',
  'owner_local_confirm_empty_with_owner_rpc',
  'owner_rpc_preferred',
  'owner_rpc_preferred_sql_fallback',
]);

function fixture({local = false, leader = true} = {}) {
  const calls = {owner: [], sql: [], local: [], overlay: []};
  let ownerResult = UNAVAILABLE;
  const engine = {
    queryExecutor: {
      async executeOnPartition(...args) {
        calls.owner.push(args);
        return ownerResult;
      },
    },
    async executeQuery(...args) {
      calls.sql.push(args);
      return {success: true, rows: [SQL_ROW]};
    },
    installRecoveryRoutingOverlayEntry(...args) {
      calls.overlay.push(args);
      return true;
    },
  };
  const partitions = local ? createLocalSystemTablePartitionServices(TABLE, {
    isLeader: leader,
    async executeLocalQuery(...args) {
      calls.local.push(args);
      return {success: true, rows: [LOCAL_ROW]};
    },
  }) : new Map();
  const service = new CDCIntegrationService({nodeId: NODE_ID,
    sqlQueryEngine: engine, partitionServicesProvider: () => partitions});
  service.initialize();
  service.setMessageRouter({
    getQueryDataPlaneTransportReadiness: () => ({ready: true, state: 'ready'}),
    getConnectedNodes: () => ['connected-without-owner-evidence'],
  });
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID,
    cdcIntegrationService: service, sqlQueryEngine: engine});
  return {service, gateway, engine, calls, setOwnerResult(result) {ownerResult = result;}};
}

for (const profile of PROFILES) {
  test(`${profile} retains owner failure and resumes through the same owner`, async (t) => {
    const f = fixture();
    const unavailable = await f.gateway.readRows(TABLE, SQL, [], {readProfile: profile});
    t.equal(unavailable.success, false, 'owner unavailability cannot become SQL success');
    t.same(unavailable.rows, [], 'no alternate rows discharge the read');
    t.equal(f.calls.owner.length, 1, 'one canonical owner attempt');
    t.equal(f.calls.sql.length, 0, 'the SQL executor is not an alternate owner');
    t.equal(f.calls.overlay.length, 0, 'failure cannot invent routing evidence');
    f.setOwnerResult({success: true, rows: [ROW], rowSetComplete: true});
    const recovered = await f.gateway.readRows(TABLE, SQL, [], {readProfile: profile});
    t.equal(recovered.success, true, 'a later ordinary read reaches the healed owner');
    t.same(recovered.rows, [ROW]);
    t.equal(f.calls.owner.length, 2, 'recovery uses the same owner lane');
    t.equal(f.calls.sql.length, 0);
    t.equal(f.gateway.inFlightReadRequestsByKey.size, 0, 'both completed reads release custody');
  });

  test(`${profile} refuses a missing CDC owner even when routed SQL can answer`, async (t) => {
    const f = fixture();
    const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID,
      sqlQueryEngine: f.engine});
    const result = await gateway.readRows(TABLE, SQL, [], {readProfile: profile});
    t.equal(result.success, false);
    t.same(result.rows, []);
    t.equal(f.calls.sql.length, 0, 'a missing owner is not permission to execute SQL');
  });
}

test('required RPC does not first execute a plausible local read', async (t) => {
  const f = fixture({local: true});
  const result = await f.service.executeAuthoritativeSystemTableRead(TABLE, SQL, [], {
    readAuthority: buildControlPlaneReadAuthority({
      authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
      localReadConsistency: 'local_leader',
    }),
  });
  t.equal(result.success, false);
  t.equal(f.calls.owner.length, 1);
  t.equal(f.calls.local.length, 0, 'the chosen owner is the only read path');
  t.equal(f.calls.sql.length, 0);
});

test('local-only leader unavailability cannot weaken to a follower read', async (t) => {
  const f = fixture({local: true, leader: false});
  const authority = buildControlPlaneReadAuthority({
    authoritativeReadMode: MODE.OWNER_LOCAL_ONLY,
    localReadConsistency: 'local_leader',
    replicaFallbackConsistency: 'any_replica',
  });
  const result = await f.service.executeAuthoritativeSystemTableRead(TABLE, SQL, [], {
    readAuthority: authority,
  });
  t.equal(result.success, false, 'the requested local leader did not answer');
  t.same(result.rows, []);
  t.equal(f.calls.local.length, 0, 'the follower is outside this read contract');
  t.equal(f.calls.owner.length, 0, 'local-only does not initiate RPC');
  t.equal(f.calls.sql.length, 0);
  t.equal(Object.hasOwn(authority, 'replicaFallbackConsistency'), false);
});

test('explicit local-only success reads exactly the selected local owner', async (t) => {
  const f = fixture({local: true});
  const result = await f.service.executeAuthoritativeSystemTableRead(TABLE, SQL, [], {
    readAuthority: buildControlPlaneReadAuthority({
      strategy: STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
      authoritativeReadMode: MODE.OWNER_LOCAL_ONLY,
      localReadConsistency: 'local_leader',
    }),
  });
  t.equal(result.success, true);
  t.same(result.rows, [LOCAL_ROW]);
  t.equal(f.calls.local.length, 1);
  t.equal(f.calls.owner.length, 0);
  t.equal(f.calls.sql.length, 0);
});

test('owner routing absence cannot mint an overlay from connected nodes', async (t) => {
  const f = fixture();
  f.setOwnerResult({success: false, rows: [], errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND});
  const result = await f.service.executeAuthoritativeSystemTableRead(TABLE, SQL, [], {
    readAuthority: buildControlPlaneReadAuthority({
      authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
    }),
  });
  t.equal(result.success, false);
  t.equal(f.calls.owner.length, 1, 'one attempt retains the actual owner refusal');
  t.equal(f.calls.overlay.length, 0, 'transport connectivity cannot create service rows');
  t.equal(f.calls.sql.length, 0);
});

for (const mode of [...RETIRED_MODES, 'unknown-owner-mode']) {
  test(`invalid authority mode ${mode} is rejected at ingress`, async (t) => {
    t.throws(() => buildControlPlaneReadAuthority({authoritativeReadMode: mode}),
      'an invalid explicit mode cannot normalize into a different read');
  });
}

const COMPLETE_AUTHORITY_CONTRADICTION =
  'contradictory_control_plane_authoritative_read_authority';
for (const strategy of [STRATEGY.CACHE, STRATEGY.BOOTSTRAP_SNAPSHOT]) {
  test(`direct CDC owner read refuses a selected ${strategy} token before execution`, async (t) => {
    const f = fixture({local: true});
    const result = await f.service.executeAuthoritativeSystemTableRead(TABLE, SQL, [], {
      readAuthority: buildControlPlaneReadAuthority({strategy,
        authoritativeReadMode: MODE.OWNER_LOCAL_ONLY, localReadConsistency: 'local_leader'}),
    });
    t.equal(result.success, false);
    t.equal(result.errorCode, COMPLETE_AUTHORITY_CONTRADICTION);
    t.same(result.rows, []);
    t.equal(f.calls.local.length, 0, 'projection intent cannot become an owner read');
    t.equal(f.calls.owner.length, 0);
    t.equal(f.calls.sql.length, 0);
  });
}

const CONTRADICTORY_COMPLETE_INTENTS = Object.freeze([
  {authoritativeReadMode: MODE.OWNER_LOCAL_ONLY},
  {leaderMode: LEADER.ANY},
  {leaderMode: LEADER.PREFERRED},
  {preferLeader: false},
]);

for (const intent of CONTRADICTORY_COMPLETE_INTENTS) {
  test(`complete-table authority refuses explicit ${JSON.stringify(intent)} before admission`,
    async (t) => {
      const options = {...intent, authoritativeObservationScope: SCOPE.COMPLETE_TABLE};
      t.throws(() => buildControlPlaneReadAuthority(options),
        {code: COMPLETE_AUTHORITY_CONTRADICTION},
        'the canonical constructor refuses contradictory caller intent');
      const f = fixture({local: true});
      let coalescingKeys = 0;
      const buildKey = f.gateway.buildReadRequestKey;
      f.gateway.buildReadRequestKey = function(...args) {
        coalescingKeys += 1;
        return Reflect.apply(buildKey, this, args);
      };
      await t.rejects(f.gateway.readRows(TABLE, SQL, [], options),
        {code: COMPLETE_AUTHORITY_CONTRADICTION},
        'the gateway must not overwrite an explicit mode or leader intent');
      t.equal(coalescingKeys, 0, 'contradiction is rejected before coalescing');
      t.equal(f.calls.local.length, 0);
      t.equal(f.calls.owner.length, 0);
      t.equal(f.calls.sql.length, 0);
      t.equal(f.gateway.inFlightReadRequestsByKey.size, 0);
    });
}

test('complete-table defaults require the RPC owner and its serving-leader witness', async (t) => {
  const authority = buildControlPlaneReadAuthority({
    authoritativeObservationScope: SCOPE.COMPLETE_TABLE,
  });
  t.equal(authority.authoritativeReadMode, MODE.OWNER_RPC_REQUIRED);
  t.equal(authority.leaderMode, LEADER.REQUIRED);
  const f = fixture({local: true});
  f.setOwnerResult({success: true, rows: [ROW], rowSetComplete: true});
  const unwitnessed = await f.service.executeAuthoritativeSystemTableRead(TABLE, SQL, [], {
    readAuthority: authority,
  });
  t.equal(unwitnessed.success, false,
    'rows without a serving-leader witness cannot satisfy complete authority');
  t.same(unwitnessed.rows, []);
  const witness = Object.freeze({state: 'observed', partitionId: INITIAL_PARTITION_IDS[TABLE],
    role: 'leader', servingNodeId: NODE_ID, servingReplicaId: 'nodes-owner',
    observedAtMs: 1000, term: 3, appliedIndex: 8, commitIndex: 8});
  f.setOwnerResult({success: true, rows: [ROW], rowSetComplete: true,
    readAuthorityWitness: witness});
  const witnessed = await f.service.executeAuthoritativeSystemTableRead(TABLE, SQL, [], {
    readAuthority: authority,
  });
  t.equal(witnessed.success, true, 'the same RPC owner answers with a valid witness');
  t.same(witnessed.rows, [ROW]);
  t.equal(f.calls.owner.length, 2);
  t.equal(f.calls.owner[1][6].readAuthority, authority, 'the selected token is unchanged');
  t.equal(f.calls.local.length, 0);
  t.equal(f.calls.sql.length, 0);
});
